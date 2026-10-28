import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Pipette, Trash2, Upload, Copy } from 'lucide-react'
import { Button, CopyButton, Label, Segmented, ToolGrid, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { copyText } from '@/lib/files'
import { ImageDrop, decode, loadGifenc, toCanvas, hqResize } from './_img/kit'

type RGB = [number, number, number]
const hex = ([r, g, b]: RGB) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()
function hsl([r, g, b]: RGB) {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2
  let h = 0, s = 0
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60 }
  return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`
}
const rgbStr = ([r, g, b]: RGB) => `rgb(${r}, ${g}, ${b})`
const lum = ([r, g, b]: RGB) => (0.299 * r + 0.587 * g + 0.114 * b) / 255
const KEY = 'openfile.colorpicker.history'

export default function ColorPickerImage() {
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [hover, setHover] = useState<{ rgb: RGB; x: number; y: number; cx: number; cy: number } | null>(null)
  const [picked, setPicked] = useState<RGB | null>(null)
  const [history, setHistory] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } })
  const [sample, setSample] = useState<'1' | '3' | '5'>('1')
  const [palette, setPalette] = useState<RGB[]>([])
  const src = useRef<HTMLCanvasElement | null>(null)
  const data = useRef<ImageData | null>(null)
  const imgEl = useRef<HTMLImageElement>(null)
  const loupe = useRef<HTMLCanvasElement>(null)
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(history.slice(0, 32))) }, [history])

  const onFiles = useCallback(async (f: File[]) => {
    const im = await decode(f[0])
    const c = toCanvas(im)
    src.current = c; data.current = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height)
    setFile(f[0]); setUrl(URL.createObjectURL(f[0])); setPicked(null)
    // dominant palette
    try {
      const small = hqResize(c, Math.min(160, c.width), Math.round(Math.min(160, c.width) * c.height / c.width))
      const lib = await loadGifenc()
      const pal: number[][] = lib.quantize(small.getContext('2d')!.getImageData(0, 0, small.width, small.height).data, 8)
      setPalette(pal.map((p) => [p[0], p[1], p[2]] as RGB).sort((a, b) => lum(b) - lum(a)))
    } catch { setPalette([]) }
  }, [])

  const readAt = (x: number, y: number): RGB => {
    const d = data.current!, n = Number(sample), h = Math.floor(n / 2)
    let r = 0, g = 0, b = 0, k = 0
    for (let dy = -h; dy <= h; dy++) for (let dx = -h; dx <= h; dx++) {
      const px = Math.min(d.width - 1, Math.max(0, x + dx)), py = Math.min(d.height - 1, Math.max(0, y + dy)), i = (py * d.width + px) * 4
      r += d.data[i]; g += d.data[i + 1]; b += d.data[i + 2]; k++
    }
    return [Math.round(r / k), Math.round(g / k), Math.round(b / k)]
  }
  const locate = (e: React.PointerEvent) => {
    const el = imgEl.current!, r = el.getBoundingClientRect(), d = data.current!
    const x = Math.floor(((e.clientX - r.left) / r.width) * d.width), y = Math.floor(((e.clientY - r.top) / r.height) * d.height)
    return { x: Math.min(d.width - 1, Math.max(0, x)), y: Math.min(d.height - 1, Math.max(0, y)), cx: e.clientX - r.left, cy: e.clientY - r.top }
  }
  const onMove = (e: React.PointerEvent) => { if (!data.current) return; const p = locate(e); setHover({ ...p, rgb: readAt(p.x, p.y) }) }
  const pick = (rgb: RGB) => { setPicked(rgb); const h = hex(rgb); setHistory((s) => [h, ...s.filter((x) => x !== h)].slice(0, 32)); copyText(h).then((ok) => ok && toast(`${h} copied`)) }

  // draw loupe
  useEffect(() => {
    const c = loupe.current, s = src.current
    if (!c || !s || !hover) return
    const ctx = c.getContext('2d')!, N = 11, Z = 12
    c.width = N * Z; c.height = N * Z
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#888'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(s, hover.x - (N >> 1), hover.y - (N >> 1), N, N, 0, 0, N * Z, N * Z)
    ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = 1
    for (let i = 1; i < N; i++) { ctx.beginPath(); ctx.moveTo(i * Z + 0.5, 0); ctx.lineTo(i * Z + 0.5, c.height); ctx.moveTo(0, i * Z + 0.5); ctx.lineTo(c.width, i * Z + 0.5); ctx.stroke() }
    const m = (N >> 1) * Z, sz = Number(sample) * Z, off = m - (Number(sample) >> 1) * Z
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.strokeRect(off, off, sz, sz); ctx.strokeStyle = '#000'; ctx.strokeRect(off - 2, off - 2, sz + 4, sz + 4)
  }, [hover, sample])

  const eyeDropper = async () => {
    try { const r = await new (window as any).EyeDropper().open(); const v = r.sRGBHex as string; const n = parseInt(v.slice(1), 16); pick([(n >> 16) & 255, (n >> 8) & 255, n & 255]) } catch { /* cancelled */ }
  }
  const hasEye = typeof window !== 'undefined' && 'EyeDropper' in window
  const shown = picked ?? hover?.rgb ?? null

  if (!file || !url) return (
    <div className="space-y-4">
      <ImageDrop multiple={false} onFiles={onFiles} label="Drop an image to pick colors from" />
      {hasEye && <div className="text-center"><Button variant="outline" icon={<Pipette className="size-4" />} onClick={eyeDropper}>Or pick any color on your screen</Button></div>}
    </div>
  )

  return (
    <ToolGrid
      main={<>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="relative mx-auto w-fit">
            <img ref={imgEl} src={url} alt="" draggable={false} className="checker block max-h-[66vh] max-w-full cursor-crosshair touch-none select-none rounded-lg"
              onPointerMove={onMove} onPointerDown={(e) => { onMove(e) }} onPointerLeave={() => setHover(null)}
              onClick={(e) => { if (!data.current) return; const p = locate(e as any); pick(readAt(p.x, p.y)) }} />
            <AnimatePresence>
              {hover && (
                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
                  className="pointer-events-none absolute z-10 overflow-hidden rounded-full border-4 shadow-2xl"
                  style={{ left: hover.cx + (hover.cx > (imgEl.current?.clientWidth ?? 0) - 170 ? -150 : 24), top: hover.cy + (hover.cy > 150 ? -150 : 24), borderColor: hex(hover.rgb) }}>
                  <canvas ref={loupe} className="block size-[132px]" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted">Hover to inspect · click to pick & copy HEX {hover && <span className="font-mono">· x {hover.x}, y {hover.y}</span>}</p>
        </div>
        {palette.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface p-4">
            <Label>Dominant colors</Label>
            <div className="flex overflow-hidden rounded-xl">{palette.map((c, i) => <button key={i} onClick={() => pick(c)} title={hex(c)} className="group h-14 flex-1 cursor-pointer transition hover:flex-[1.6]" style={{ background: hex(c) }}><span className={cn('font-mono text-[10px] opacity-0 group-hover:opacity-100', lum(c) > 0.6 ? 'text-black' : 'text-white')}>{hex(c)}</span></button>)}</div>
          </div>
        )}
      </>}
      side={<>
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="grid h-28 place-items-center transition-colors" style={{ background: shown ? hex(shown) : 'transparent' }}>
            {shown ? <span className={cn('font-mono text-xl font-bold', lum(shown) > 0.6 ? 'text-black' : 'text-white')}>{hex(shown)}</span> : <span className="text-sm text-muted">Hover the image</span>}
          </div>
          {shown && <div className="divide-y divide-border">
            {[['HEX', hex(shown)], ['RGB', rgbStr(shown)], ['HSL', hsl(shown)]].map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 px-3 py-2"><span className="w-9 text-[11px] font-bold text-muted">{k}</span><span className="flex-1 truncate font-mono text-sm">{v}</span><CopyButton text={v} label="" variant="ghost" /></div>
            ))}
          </div>}
          {!picked && hover && <div className="bg-surface-2/60 px-3 py-1.5 text-[11px] text-muted">Live — click to lock this color</div>}
        </div>
        <div><Label>Sample size</Label><Segmented value={sample} onChange={setSample} options={[{ value: '1', label: '1 px' }, { value: '3', label: '3×3 avg' }, { value: '5', label: '5×5 avg' }]} /></div>
        {hasEye && <Button variant="outline" className="w-full" icon={<Pipette className="size-4" />} onClick={eyeDropper}>Pick from anywhere on screen</Button>}
        <div>
          <div className="mb-1.5 flex items-center justify-between"><Label className="mb-0" hint={history.length ? `${history.length}` : undefined}>Picked colors</Label>
            {history.length > 0 && <div className="flex gap-1"><Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={() => copyText(history.map((h, i) => `--color-${i + 1}: ${h};`).join('\n')).then(() => toast('Copied as CSS variables'))}>CSS</Button><Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setHistory([])} aria-label="Clear history" /></div>}
          </div>
          {history.length ? (
            <div className="grid grid-cols-8 gap-1.5">
              <AnimatePresence initial={false}>
                {history.map((h) => <motion.button layout initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} key={h} title={`${h} — click to copy`} onClick={() => { const n = parseInt(h.slice(1), 16); setPicked([(n >> 16) & 255, (n >> 8) & 255, n & 255]); copyText(h).then(() => toast(`${h} copied`)) }} className="aspect-square rounded-lg ring-1 ring-border transition hover:scale-110 cursor-pointer" style={{ background: h }} />)}
              </AnimatePresence>
            </div>
          ) : <p className="text-xs text-muted">Click the image to collect colors here.</p>}
        </div>
        <Button variant="ghost" className="w-full" icon={<Upload className="size-4" />} onClick={() => { setFile(null); setUrl(null); setHover(null); setPalette([]) }}>Use another image</Button>
      </>}
    />
  )
}
