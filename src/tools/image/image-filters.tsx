import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, RotateCcw, SplitSquareHorizontal, Wand2 } from 'lucide-react'
import { Button, ErrorNote, Label, Segmented, Slider, Tabs, ToolGrid, cn, useJob } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { BeforeAfter, ImageDrop, blurImageData, canvas, decode, exportCanvas, fmtFromMime, hqResize, outName, toCanvas, useDebounced, useObjectUrl, type Fmt } from './_img/kit'

export type F = { brightness: number; contrast: number; saturation: number; hue: number; exposure: number; temperature: number; blur: number; sharpen: number; vignette: number; grayscale: number; sepia: number; invert: number }
const ZERO: F = { brightness: 0, contrast: 0, saturation: 0, hue: 0, exposure: 0, temperature: 0, blur: 0, sharpen: 0, vignette: 0, grayscale: 0, sepia: 0, invert: 0 }
const PRESETS: { name: string; f: Partial<F> }[] = [
  { name: 'Vivid', f: { saturation: 40, contrast: 15, sharpen: 25 } },
  { name: 'Warm', f: { temperature: 35, saturation: 10, brightness: 4 } },
  { name: 'Cool', f: { temperature: -35, saturation: 5, contrast: 6 } },
  { name: 'Vintage', f: { sepia: 45, contrast: -10, saturation: -15, vignette: 45, brightness: 4 } },
  { name: 'B&W', f: { grayscale: 100, contrast: 12 } },
  { name: 'Noir', f: { grayscale: 100, contrast: 45, brightness: -8, vignette: 60 } },
  { name: 'Sepia', f: { sepia: 85, contrast: 5 } },
  { name: 'Dramatic', f: { contrast: 40, saturation: -20, vignette: 50, sharpen: 30, exposure: -6 } },
  { name: 'Fade', f: { contrast: -28, brightness: 10, saturation: -25 } },
  { name: 'Cinematic', f: { temperature: 18, hue: -8, contrast: 22, saturation: -12, vignette: 35 } },
  { name: 'Pop', f: { saturation: 70, contrast: 25, brightness: 4 } },
  { name: 'Dreamy', f: { blur: 8, brightness: 12, saturation: 15, contrast: -12 } },
]

type M = number[] // 3x4 row-major affine colour matrix
const I: M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]
function mul(b: M, a: M): M { // b ∘ a  (apply a, then b)
  const o: M = new Array(12).fill(0)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) o[r * 4 + c] = b[r * 4] * a[c] + b[r * 4 + 1] * a[4 + c] + b[r * 4 + 2] * a[8 + c]
    o[r * 4 + 3] = b[r * 4] * a[3] + b[r * 4 + 1] * a[7] + b[r * 4 + 2] * a[11] + b[r * 4 + 3]
  }
  return o
}
const mix = (m: M, t: number): M => I.map((v, i) => v + (m[i] - v) * t)
function colorMatrix(f: F): M {
  let m = I
  if (f.exposure) { const k = Math.pow(2, f.exposure / 50); m = mul([k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0], m) }
  if (f.brightness) { const b = f.brightness * 1.6; m = mul([1, 0, 0, b, 0, 1, 0, b, 0, 0, 1, b], m) }
  if (f.contrast) { const c = f.contrast * 2.55, k = (259 * (c + 255)) / (255 * (259 - c)), o = 128 * (1 - k); m = mul([k, 0, 0, o, 0, k, 0, o, 0, 0, k, o], m) }
  if (f.temperature) { const t = f.temperature * 0.5; m = mul([1, 0, 0, t, 0, 1, 0, t * 0.15, 0, 0, 1, -t], m) }
  if (f.saturation) { const s = 1 + f.saturation / 100, lr = 0.2126 * (1 - s), lg = 0.7152 * (1 - s), lb = 0.0722 * (1 - s); m = mul([lr + s, lg, lb, 0, lr, lg + s, lb, 0, lr, lg, lb + s, 0], m) }
  if (f.hue) {
    const a = (f.hue * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
    m = mul([0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928, 0,
      0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283, 0,
      0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072, 0], m)
  }
  if (f.sepia) m = mul(mix([0.393, 0.769, 0.189, 0, 0.349, 0.686, 0.168, 0, 0.272, 0.534, 0.131, 0], f.sepia / 100), m)
  if (f.grayscale) m = mul(mix([0.2126, 0.7152, 0.0722, 0, 0.2126, 0.7152, 0.0722, 0, 0.2126, 0.7152, 0.0722, 0], f.grayscale / 100), m)
  if (f.invert) { const t = f.invert / 100; m = mul([1 - 2 * t, 0, 0, 255 * t, 0, 1 - 2 * t, 0, 255 * t, 0, 0, 1 - 2 * t, 255 * t], m) }
  return m
}

/** Apply all filters to a canvas (returns a new canvas). */
export function applyFilters(src: HTMLCanvasElement, f: F) {
  const W = src.width, H = src.height
  const { canvas: c, ctx } = canvas(W, H)
  ctx.drawImage(src, 0, 0)
  const id = ctx.getImageData(0, 0, W, H)
  const ref = Math.max(W, H)
  if (f.blur > 0) blurImageData(id, (f.blur / 100) * ref * 0.03)
  if (f.sharpen > 0) {
    const bl = new ImageData(new Uint8ClampedArray(id.data), W, H); blurImageData(bl, Math.max(1, ref / 1000))
    const d = id.data, b = bl.data, k = (f.sharpen / 100) * 1.6
    for (let i = 0; i < d.length; i += 4) { d[i] += (d[i] - b[i]) * k; d[i + 1] += (d[i + 1] - b[i + 1]) * k; d[i + 2] += (d[i + 2] - b[i + 2]) * k }
  }
  const m = colorMatrix(f), d = id.data
  const identity = m.every((v, i) => Math.abs(v - I[i]) < 1e-6)
  const vig = f.vignette / 100, cx = W / 2, cy = H / 2, maxd = Math.hypot(cx, cy)
  if (!identity || vig) {
    for (let y = 0, i = 0; y < H; y++) {
      for (let x = 0; x < W; x++, i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2]
        let nr = m[0] * r + m[1] * g + m[2] * b + m[3], ng = m[4] * r + m[5] * g + m[6] * b + m[7], nb = m[8] * r + m[9] * g + m[10] * b + m[11]
        if (vig) { const t = Math.hypot(x - cx, y - cy) / maxd; const s = t < 0.35 ? 0 : (t - 0.35) / 0.65; const k = 1 - vig * s * s * (3 - 2 * s) * 0.9; nr *= k; ng *= k; nb *= k }
        d[i] = nr; d[i + 1] = ng; d[i + 2] = nb
      }
    }
  }
  ctx.putImageData(id, 0, 0)
  return c
}

const SLIDERS: { k: keyof F; label: string; min: number; max: number; group: 'light' | 'color' | 'effects' }[] = [
  { k: 'exposure', label: 'Exposure', min: -100, max: 100, group: 'light' }, { k: 'brightness', label: 'Brightness', min: -100, max: 100, group: 'light' }, { k: 'contrast', label: 'Contrast', min: -100, max: 100, group: 'light' },
  { k: 'saturation', label: 'Saturation', min: -100, max: 100, group: 'color' }, { k: 'temperature', label: 'Temperature', min: -100, max: 100, group: 'color' }, { k: 'hue', label: 'Hue', min: -180, max: 180, group: 'color' },
  { k: 'grayscale', label: 'Grayscale', min: 0, max: 100, group: 'color' }, { k: 'sepia', label: 'Sepia', min: 0, max: 100, group: 'color' }, { k: 'invert', label: 'Invert', min: 0, max: 100, group: 'color' },
  { k: 'sharpen', label: 'Sharpen', min: 0, max: 100, group: 'effects' }, { k: 'blur', label: 'Blur', min: 0, max: 100, group: 'effects' }, { k: 'vignette', label: 'Vignette', min: 0, max: 100, group: 'effects' },
]

export default function ImageFilters() {
  const [file, setFile] = useState<File | null>(null)
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null) // preview-size source
  const [srcBlob, setSrcBlob] = useState<Blob | null>(null)
  const [f, setF] = useState<F>(ZERO)
  const [preset, setPreset] = useState<string | null>(null)
  const [tab, setTab] = useState<'presets' | 'adjust'>('presets')
  const [compare, setCompare] = useState(false)
  const [out, setOut] = useState<Blob | null>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [fmt, setFmt] = useState<'keep' | 'jpg' | 'png' | 'webp'>('keep')
  const { busy, error, run } = useJob()

  const onFiles = useCallback(async (fs: File[]) => {
    const img = await decode(fs[0])
    const s = Math.min(1, 1100 / Math.max(img.naturalWidth, img.naturalHeight))
    const c = s < 1 ? hqResize(img, img.naturalWidth * s, img.naturalHeight * s) : toCanvas(img)
    setFile(fs[0]); setSrc(c); setF(ZERO); setPreset(null)
    c.toBlob((b) => b && setSrcBlob(b), 'image/webp', 0.92)
    // preset thumbnails
    const t = hqResize(c, 120, Math.round((120 * c.height) / c.width))
    const map: Record<string, string> = { Original: t.toDataURL('image/jpeg', 0.8) }
    for (const p of PRESETS) map[p.name] = applyFilters(t, { ...ZERO, ...p.f }).toDataURL('image/jpeg', 0.8)
    setThumbs(map)
  }, [])

  const df = useDebounced(f, 40)
  useEffect(() => {
    if (!src) return
    let off = false
    applyFilters(src, df).toBlob((b) => { if (!off && b) setOut(b) }, 'image/webp', 0.9)
    return () => { off = true }
  }, [src, df])
  const outUrl = useObjectUrl(out), srcUrl = useObjectUrl(srcBlob)
  const changed = useMemo(() => (Object.keys(f) as (keyof F)[]).some((k) => f[k] !== 0), [f])

  const exportFull = () => run(async () => {
    if (!file) return
    const full = toCanvas(await decode(file))
    const res = applyFilters(full, f)
    let ff: Fmt = fmt === 'keep' ? fmtFromMime(file.type, file.name) : fmt
    if (!['png', 'jpg', 'webp'].includes(ff)) ff = 'png'
    // Nothing changed and the format is the same: hand back the original file instead of a bigger re-encode.
    if (!changed && ff === fmtFromMime(file.type, file.name)) { downloadBlob(file, outName(file.name, ff, '-edited')); return }
    downloadBlob(await exportCanvas(res, ff, 0.93), outName(file.name, ff, preset ? `-${preset.toLowerCase().replace(/\W+/g, '')}` : '-edited'))
  })
  const reset = () => { setFile(null); setSrc(null); setOut(null); setThumbs({}) }

  if (!file || !src) return <ImageDrop multiple={false} onFiles={onFiles} label="Drop a photo to edit" />

  return (
    <ToolGrid
      main={<>
        <div className="rounded-2xl border border-border bg-surface p-4">
          {compare && srcUrl && outUrl ? <BeforeAfter before={srcUrl} after={outUrl} labels={['Original', 'Edited']} maxH="62vh" checker={false} /> : (
            <div className="grid place-items-center">{outUrl && <motion.img key="o" initial={{ opacity: 0.6 }} animate={{ opacity: 1 }} src={outUrl} alt="Edited" className="max-h-[62vh] max-w-full rounded-xl" />}</div>
          )}
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Button size="sm" variant={compare ? 'primary' : 'outline'} icon={<SplitSquareHorizontal className="size-4" />} onClick={() => setCompare(!compare)}>Before / after</Button>
            <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} disabled={!changed} onClick={() => { setF(ZERO); setPreset(null) }}>Reset all</Button>
          </div>
        </div>
      </>}
      side={<>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'presets', label: <span className="flex items-center gap-1.5"><Wand2 className="size-3.5" />Presets</span> }, { value: 'adjust', label: 'Adjust' }]} />
        {tab === 'presets' ? (
          <div className="grid grid-cols-3 gap-2">
            {[{ name: 'Original', f: {} }, ...PRESETS].map((p) => (
              <button key={p.name} onClick={() => { setF({ ...ZERO, ...p.f }); setPreset(p.name === 'Original' ? null : p.name) }} className={cn('overflow-hidden rounded-xl border text-left transition cursor-pointer', (preset ?? 'Original') === p.name ? 'border-accent ring-2 ring-accent/30' : 'border-border hover:border-accent/50')}>
                {thumbs[p.name] ? <img src={thumbs[p.name]} alt="" className="aspect-square w-full object-cover" /> : <div className="shimmer aspect-square" />}
                <div className="truncate px-1.5 py-1 text-[11px] font-medium">{p.name}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            {(['light', 'color', 'effects'] as const).map((g) => (
              <div key={g} className="space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">{g === 'light' ? 'Light' : g === 'color' ? 'Color' : 'Effects'}</div>
                {SLIDERS.filter((s) => s.group === g).map((s) => (
                  <div key={s.k} onDoubleClick={() => setF((x) => ({ ...x, [s.k]: 0 }))}><Slider label={s.label} value={f[s.k]} onChange={(v) => { setF((x) => ({ ...x, [s.k]: v })); setPreset(null) }} min={s.min} max={s.max} /></div>
                ))}
              </div>
            ))}
            <p className="text-[11px] text-muted">Tip: double-click a slider to reset it.</p>
          </div>
        )}
        <div className="border-t border-border pt-4"><Label>Export format</Label><Segmented value={fmt} onChange={setFmt} options={[{ value: 'keep', label: 'Original' }, { value: 'jpg', label: 'JPG' }, { value: 'png', label: 'PNG' }, { value: 'webp', label: 'WEBP' }]} /></div>
        <ErrorNote error={error} />
        <Button size="lg" className="w-full" loading={busy} icon={<Download className="size-4" />} onClick={exportFull}>Download full resolution</Button>
        <Button variant="ghost" className="w-full" onClick={reset}>Start over</Button>
      </>}
    />
  )
}
