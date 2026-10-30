import { useEffect, useMemo, useRef, useState } from 'react'
import { ImageDown, FileCode } from 'lucide-react'
import { Button, Dropzone, Label, Select, Slider, Switch, ToolGrid, ErrorNote, Progress, Input } from '@/components/ui'
import { baseName, downloadBlob } from '@/lib/files'
import { decodeAudioFile } from '@/tools/video/_media/audio'
import { FileBar } from '@/tools/video/_media/ui'
import { AV_ACCEPT } from './_b4/FxShell'

type Style = 'bars' | 'mirror' | 'line' | 'spectrogram'
const SIZES: Record<string, [number, number]> = { wide: [1600, 400], banner: [1500, 500], square: [1080, 1080], story: [1080, 1920], hd: [1920, 1080] }

/** RMS loudness per column, 0..1. Pure, unit tested. */
export function columnLevels(mono: Float32Array, columns: number): number[] {
  const per = mono.length / columns
  const out: number[] = []
  let max = 0
  for (let c = 0; c < columns; c++) {
    const a = Math.floor(c * per), b = Math.max(a + 1, Math.floor((c + 1) * per))
    let s = 0, n = 0
    for (let i = a; i < b && i < mono.length; i += Math.max(1, Math.floor((b - a) / 400))) { s += mono[i] * mono[i]; n++ }
    const v = n ? Math.sqrt(s / n) : 0; out.push(v); if (v > max) max = v
  }
  return max ? out.map((v) => v / max) : out
}

function fft(re: Float32Array, im: Float32Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const ur = re[i + j], ui = im[i + j], vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr; re[i + j] = ur + vr; im[i + j] = ui + vi; re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t } }
  }
}
// dark to gold heat map: black, ember brown, orange, gold, cream. Every stop sits between hue 0 and 50, so no purple or pink tints.
const HEAT: [number, number, number, number][] = [[0, 6, 5, 4], [0.3, 66, 22, 4], [0.55, 194, 65, 12], [0.8, 245, 165, 36], [1, 255, 244, 204]]
const heat = (v: number) => {
  const t = Math.max(0, Math.min(1, v)); let k = 1; while (k < HEAT.length - 1 && t > HEAT[k][0]) k++
  const [t0, r0, g0, b0] = HEAT[k - 1], [t1, r1, g1, b1] = HEAT[k], f = (t - t0) / (t1 - t0 || 1)
  return `rgb(${Math.round(r0 + (r1 - r0) * f)},${Math.round(g0 + (g1 - g0) * f)},${Math.round(b0 + (b1 - b0) * f)})`
}

function mix(buf: AudioBuffer) { const a = buf.getChannelData(0); if (buf.numberOfChannels < 2) return a; const b = buf.getChannelData(1); const m = new Float32Array(a.length); for (let i = 0; i < a.length; i++) m[i] = (a[i] + b[i]) / 2; return m }

export default function WaveformImage() {
  const [file, setFile] = useState<File | null>(null)
  const [buf, setBuf] = useState<AudioBuffer | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [style, setStyle] = useState<Style>('mirror')
  const [size, setSize] = useState('wide')
  const [fg, setFg] = useState('#F5A524')
  const [fg2, setFg2] = useState('#2DD4BF')
  const [grad, setGrad] = useState(true)
  const [bg, setBg] = useState('#0b0b0b')
  const [transparent, setTransparent] = useState(false)
  const [bar, setBar] = useState(6)
  const [gap, setGap] = useState(3)
  const [round, setRound] = useState(true)
  const [title, setTitle] = useState('')
  const canvas = useRef<HTMLCanvasElement>(null)
  const mono = useMemo(() => (buf ? mix(buf) : null), [buf])
  const [W, H] = SIZES[size]

  const open = async (f: File) => { setFile(f); setBuf(null); setError(null); setBusy(true); setTitle(baseName(f.name)); try { setBuf(await decodeAudioFile(f)) } catch (e: any) { setError(e?.message || 'Could not decode this file.') } finally { setBusy(false) } }

  const svg = useMemo(() => {
    if (!mono || style === 'spectrogram') return ''
    const padY = title ? H * 0.22 : H * 0.08, area = H - padY * 1.6, mid = padY + area / 2
    const fill = grad ? 'url(#g)' : fg
    let shapes = ''
    if (style === 'line') {
      const cols = Math.floor(W / 2); const lv = columnLevels(mono, cols)
      const pts = lv.map((v, i) => `${(i * W) / cols},${(mid - v * area / 2).toFixed(1)}`).join(' ')
      const pts2 = lv.map((v, i) => `${((cols - 1 - i) * W) / cols},${(mid + lv[cols - 1 - i] * area / 2).toFixed(1)}`).join(' ')
      shapes = `<polygon points="${pts} ${pts2}" fill="${fill}"/>`
    } else {
      const step = bar + gap, cols = Math.max(1, Math.floor((W - gap) / step)); const lv = columnLevels(mono, cols)
      const off = (W - cols * step + gap) / 2
      shapes = lv.map((v, i) => { const h = Math.max(bar / 2, v * (style === 'mirror' ? area : area)); const x = off + i * step; const y = style === 'mirror' ? mid - h / 2 : padY + area - h; return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bar}" height="${h.toFixed(1)}"${round ? ` rx="${bar / 2}"` : ''} fill="${fill}"/>` }).join('')
    }
    const t = title ? `<text x="${W / 2}" y="${padY * 0.62}" text-anchor="middle" font-family="system-ui, Segoe UI, Arial, sans-serif" font-weight="700" font-size="${Math.round(H * 0.075)}" fill="${fg}">${title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>` : ''
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="${fg}"/><stop offset="1" stop-color="${fg2}"/></linearGradient></defs>${transparent ? '' : `<rect width="100%" height="100%" fill="${bg}"/>`}${t}${shapes}</svg>`
  }, [mono, style, W, H, bar, gap, round, fg, fg2, grad, bg, transparent, title])

  useEffect(() => {
    const c = canvas.current; if (!c || !mono || !buf) return
    c.width = W; c.height = H
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, W, H)
    if (style !== 'spectrogram') { const img = new Image(); img.onload = () => { ctx.clearRect(0, 0, W, H); ctx.drawImage(img, 0, 0) }; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); return }
    if (!transparent) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H) }
    const N = 2048, cols = W, rows = H
    const hop = Math.max(1, Math.floor((mono.length - N) / cols))
    const re = new Float32Array(N), im = new Float32Array(N)
    const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)))
    const img = ctx.getImageData(0, 0, W, H)
    const maxF = Math.min(buf.sampleRate / 2, 16000)
    for (let x = 0; x < cols; x++) {
      const s = x * hop
      for (let i = 0; i < N; i++) { re[i] = (mono[s + i] ?? 0) * win[i]; im[i] = 0 }
      fft(re, im)
      for (let y = 0; y < rows; y++) {
        // log frequency scale
        const f = 30 * Math.pow(maxF / 30, 1 - y / rows)
        const bin = Math.min(N / 2 - 1, Math.round((f / (buf.sampleRate / 2)) * (N / 2)))
        const mag = Math.sqrt(re[bin] ** 2 + im[bin] ** 2) / N
        const db = 20 * Math.log10(mag + 1e-9)
        const v = (db + 100) / 80
        const [r, g, b] = heat(v).match(/\d+/g)!.map(Number)
        const o = (y * W + x) * 4
        const a = transparent ? Math.round(255 * Math.max(0, Math.min(1, v * 1.2))) : 255
        img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = a
      }
    }
    ctx.putImageData(img, 0, 0)
  }, [svg, style, mono, buf, W, H, bg, transparent])

  const png = () => canvas.current?.toBlob((b) => b && downloadBlob(b, `${baseName(file!.name)}-${style}.png`), 'image/png')

  if (!file) return <Dropzone accept={AV_ACCEPT} onFiles={(f) => open(f[0])} label="Drop audio to draw its waveform" sub="Make waveform art or a spectrogram image as PNG or SVG. Great for podcast covers and social posts." />
  return (
    <ToolGrid
      main={<>
        <FileBar file={file} onReset={() => { setFile(null); setBuf(null) }} />
        <ErrorNote error={error} />
        {busy && <Progress value={0.5} label="Decoding audio" />}
        {buf && <div className="checker overflow-hidden rounded-2xl border border-border"><canvas ref={canvas} className="block h-auto w-full" style={{ aspectRatio: `${W}/${H}` }} /></div>}
      </>}
      side={<>
        <div><Label>Style</Label><Select aria-label="Style" value={style} onChange={setStyle} options={[{ value: 'mirror', label: 'Mirrored bars' }, { value: 'bars', label: 'Bars from bottom' }, { value: 'line', label: 'Smooth shape' }, { value: 'spectrogram', label: 'Spectrogram' }]} /></div>
        <div><Label>Size</Label><Select aria-label="Size" value={size} onChange={setSize} options={[{ value: 'wide', label: 'Wide 1600x400' }, { value: 'banner', label: 'Banner 1500x500' }, { value: 'square', label: 'Square 1080x1080' }, { value: 'story', label: 'Story 1080x1920' }, { value: 'hd', label: 'HD 1920x1080' }]} /></div>
        {style !== 'spectrogram' && <>
          {style !== 'line' && <><Slider label="Bar width" value={bar} onChange={setBar} min={1} max={30} suffix=" px" /><Slider label="Gap" value={gap} onChange={setGap} min={0} max={20} suffix=" px" /><Switch checked={round} onChange={setRound} label="Rounded bars" /></>}
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted">Color<input type="color" value={fg} onChange={(e) => setFg(e.target.value)} className="mt-1 block h-9 w-full cursor-pointer rounded-lg border border-border bg-transparent" /></label>
            {grad && <label className="text-xs text-muted">Second color<input type="color" value={fg2} onChange={(e) => setFg2(e.target.value)} className="mt-1 block h-9 w-full cursor-pointer rounded-lg border border-border bg-transparent" /></label>}
          </div>
          <Switch checked={grad} onChange={setGrad} label="Gradient" />
          <div><Label>Title (optional)</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" /></div>
        </>}
        <Switch checked={transparent} onChange={setTransparent} label="Transparent background" />
        {!transparent && <label className="block text-xs text-muted">Background<input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="mt-1 block h-9 w-full cursor-pointer rounded-lg border border-border bg-transparent" /></label>}
        <Button size="lg" className="w-full" icon={<ImageDown className="size-5" />} onClick={png} disabled={!buf}>Download PNG</Button>
        {style !== 'spectrogram' && <Button variant="outline" className="w-full" icon={<FileCode className="size-4" />} disabled={!svg} onClick={() => downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${baseName(file.name)}-waveform.svg`)}>Download SVG</Button>}
      </>}
    />
  )
}
