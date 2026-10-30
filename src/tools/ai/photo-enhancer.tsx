import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, Download, ZoomIn, X } from 'lucide-react'
import { Button, Field, FileChip, Progress, Segmented, Select, Slider, Switch, ToolGrid, ErrorNote, useJob } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { estimateText } from '@/lib/b2/upscale-plan'
import { BeforeAfter, ImageDrop, useDebounced, useObjectUrl } from '@/tools/image/_img/kit'
import { decodeAny, encodeCanvas, type OutFmt } from '@/lib/b2/codecs'
import { ENHANCE_DEFAULT, ENHANCE_PRESETS, enhance, enhanceGlobal, enhanceLocal, stripOverlap, type EnhanceOpts } from '@/lib/b2/enhance'

const PREVIEW = 1000

function shrink(src: HTMLCanvasElement, max: number) {
  const k = Math.min(1, max / Math.max(src.width, src.height))
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(src.width * k)); c.height = Math.max(1, Math.round(src.height * k))
  const ctx = c.getContext('2d')!; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, 0, 0, c.width, c.height)
  return c
}
function applyEnhance(src: HTMLCanvasElement, o: EnhanceOpts) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height
  const ctx = c.getContext('2d')!; ctx.drawImage(src, 0, 0)
  const id = ctx.getImageData(0, 0, c.width, c.height)
  enhance(id.data, c.width, c.height, o)
  ctx.putImageData(id, 0, 0)
  return c
}
/** Full-size version: global steps on the whole image, local filters in overlapping strips to keep memory low. */
async function applyEnhanceFull(src: HTMLCanvasElement, o: EnhanceOpts, onP: (p: number) => void) {
  const W = src.width, H = src.height, ref = Math.max(W, H)
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d')!; ctx.drawImage(src, 0, 0)
  const id = ctx.getImageData(0, 0, W, H), d = id.data
  enhanceGlobal(d, o)
  const rows = Math.max(64, Math.floor(2_000_000 / W)), ov = stripOverlap(ref)
  for (let y0 = 0; y0 < H; y0 += rows) {
    const y1 = Math.min(H, y0 + rows), a = Math.max(0, y0 - ov), b = Math.min(H, y1 + ov)
    const strip = d.slice(a * W * 4, b * W * 4)
    enhanceLocal(strip, W, b - a, o, ref)
    d.set(strip.subarray((y0 - a) * W * 4, (y1 - a) * W * 4), y0 * W * 4)
    onP(y1 / H)
    await new Promise((r) => setTimeout(r, 0))
  }
  ctx.putImageData(id, 0, 0)
  return c
}
const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not draw the preview.'))), 'image/jpeg', 0.9))

export default function PhotoEnhancer() {
  const [file, setFile] = useState<File | null>(null)
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null)
  const [preset, setPreset] = useState('auto')
  const [o, setO] = useState<EnhanceOpts>(ENHANCE_DEFAULT)
  const [upscale, setUpscale] = useState(false)
  const [fmt, setFmt] = useState<OutFmt>('jpg')
  const [quality, setQuality] = useState(92)
  const [stage, setStage] = useState('')
  const [upBusy, setUpBusy] = useState(false)
  const [gpu, setGpu] = useState<boolean | null>(null)
  const [note, setNote] = useState('')
  const upMod = useRef<typeof import('@/lib/b2/upscale') | null>(null)
  const [beforeBlob, setBeforeBlob] = useState<Blob | null>(null)
  const [afterBlob, setAfterBlob] = useState<Blob | null>(null)
  const { busy, progress, error, run } = useJob()
  const beforeUrl = useObjectUrl(beforeBlob), afterUrl = useObjectUrl(afterBlob)
  const opts = useDebounced(o, 120)

  const small = useMemo(() => (src ? shrink(src, PREVIEW) : null), [src])
  useEffect(() => { if (small) toBlob(small).then(setBeforeBlob) }, [small])
  useEffect(() => {
    if (!small) return
    let dead = false
    const t = setTimeout(() => { const c = applyEnhance(small, opts); if (!dead) toBlob(c).then((b) => !dead && setAfterBlob(b)) }, 0)
    return () => { dead = true; clearTimeout(t) }
  }, [small, opts])

  // Learn whether a real GPU adapter exists once AI upscale is switched on, for the time estimate.
  useEffect(() => { if (upscale && gpu === null) import('@/lib/b2/upscale').then((m) => { upMod.current = m; return m.hasGpuAdapter() }).then(setGpu) }, [upscale, gpu])
  // Leaving the page stops a running upscale so the worker does not keep the CPU busy.
  useEffect(() => () => upMod.current?.cancelUpscale(), [])

  const set = <K extends keyof EnhanceOpts>(k: K, v: EnhanceOpts[K]) => { setO((p) => ({ ...p, [k]: v })); setPreset('custom') }
  const pickPreset = (p: string) => { setPreset(p); if (ENHANCE_PRESETS[p]) setO(ENHANCE_PRESETS[p].opts) }
  const open = (fs: File[]) => run(async () => { const { canvas } = await decodeAny(fs[0]); setFile(fs[0]); setSrc(canvas); setAfterBlob(null) })
  const reset = () => { setFile(null); setSrc(null); setBeforeBlob(null); setAfterBlob(null) }

  const mp = src ? (src.width * src.height) / 1e6 : 0
  const upTooBig = src ? src.width * 2 > 16384 || src.height * 2 > 16384 || mp * 4 > 120 : false
  const upSlow = mp > 1.5

  const save = () => run(async (setP) => {
    if (!src || !file) return
    setNote('')
    setStage('Enhancing full-size photo'); setP(0.05)
    await new Promise((r) => setTimeout(r, 30))
    const end = upscale && !upTooBig ? 0.15 : 0.9
    let out = await applyEnhanceFull(src, o, (p) => setP(0.05 + p * (end - 0.05)))
    if (upscale && !upTooBig) {
      const m = upMod.current ??= await import('@/lib/b2/upscale')
      setUpBusy(true)
      try { out = await m.upscale2x(out, (s, p) => { setStage(s); setP(0.15 + p * 0.8) }) }
      catch (e: any) { setStage(''); if (e?.name === 'CancelledError') { setNote('Upscale cancelled. Nothing was saved.'); return } throw e }
      finally { setUpBusy(false) }
    }
    setStage('Saving')
    downloadBlob(await encodeCanvas(out, fmt, { quality }), `${file.name.replace(/\.[^.]+$/, '')}-enhanced${upscale && !upTooBig ? '-2x' : ''}.${fmt}`)
    setStage(''); setP(1)
  })

  if (!src || !file) return <div className="space-y-3"><ImageDrop multiple={false} onFiles={open} label="Drop a photo to fix light, colour, noise and sharpness" accept="image/*,.tif,.tiff,.heic,.jxl,.psd" /><ErrorNote error={error} /></div>
  return (
    <ToolGrid
      main={<>
        {beforeUrl && afterUrl ? <BeforeAfter before={beforeUrl} after={afterUrl} labels={['Original', 'Enhanced']} checker={false} /> : <div className="skeleton h-72 rounded-2xl" />}
        <FileChip file={file} onRemove={reset} extra={<span className="text-xs text-muted">{src.width}×{src.height}</span>} />
        <p className="text-center text-xs text-muted">Drag the divider (or use the arrow keys) to compare. The preview is scaled down; the download is full size.</p>
      </>}
      side={<>
        <Field label="Style">
          <Select value={preset} onChange={pickPreset} options={[...Object.entries(ENHANCE_PRESETS).map(([value, p]) => ({ value, label: p.label })), ...(preset === 'custom' ? [{ value: 'custom', label: 'Custom' }] : [])]} />
        </Field>
        <Slider label="Auto levels" value={Math.round(o.levels * 100)} onChange={(v) => set('levels', v / 100)} suffix="%" />
        <Slider label="White balance" value={Math.round(o.wb * 100)} onChange={(v) => set('wb', v / 100)} suffix="%" />
        <Slider label="Lift shadows" value={Math.round(o.shadows * 100)} onChange={(v) => set('shadows', v / 100)} suffix="%" />
        <Slider label="Recover highlights" value={Math.round(o.highlights * 100)} onChange={(v) => set('highlights', v / 100)} suffix="%" />
        <Slider label="Reduce noise" value={Math.round(o.denoise * 100)} onChange={(v) => set('denoise', v / 100)} suffix="%" />
        <Slider label="Sharpen" value={Math.round(o.sharpen * 100)} onChange={(v) => set('sharpen', v / 100)} max={150} suffix="%" />
        <Slider label="Vibrance" value={Math.round(o.vibrance * 100)} onChange={(v) => set('vibrance', v / 100)} min={-50} max={80} suffix="%" />
        <Switch checked={o.face} onChange={(v) => set('face', v)} label="Face friendly (smooth skin, gentle sharpening)" />
        <Switch checked={upscale} onChange={setUpscale} label={<span className="flex items-center gap-1"><ZoomIn className="size-3.5" />AI upscale 2× on download</span>} />
        {upscale && (upTooBig ? <p className="text-xs text-warn">This photo is too large to upscale in the browser. It will be saved at its current size.</p>
          : <p className="text-xs text-muted">{gpu ? 'Runs the Image Upscaler\'s AI model on your GPU (21 to 55 MB depending on your browser, downloaded once).' : 'Runs a lighter AI model on your CPU (about 7 MB, downloaded once), tile by tile, so the page stays usable and you can cancel.'}{gpu !== null ? ` 2× in ${estimateText(src.width, src.height, gpu)}.` : ''}{!gpu && upSlow ? ' For a quick result, use a smaller photo or turn this off.' : ''}</p>)}
        <Field label="Save as"><Segmented value={fmt} onChange={setFmt} options={[{ value: 'jpg', label: 'JPG' }, { value: 'png', label: 'PNG' }, { value: 'webp', label: 'WEBP' }]} /></Field>
        {fmt !== 'png' && <Slider label="Quality" value={quality} onChange={setQuality} min={50} max={100} suffix="%" />}
        {busy && <Progress value={progress} label={stage || 'Working'} />}
        <ErrorNote error={error} />
        {note && !busy && <p className="text-xs text-muted" role="status">{note}</p>}
        {upBusy ? <Button size="lg" variant="outline" className="w-full" icon={<X className="size-4" />} onClick={() => upMod.current?.cancelUpscale()}>Cancel</Button>
          : <Button size="lg" className="w-full" loading={busy} icon={<Download className="size-4" />} onClick={save}>Download enhanced photo</Button>}
        <Button variant="outline" className="w-full" icon={<Sparkles className="size-4" />} onClick={() => pickPreset('auto')} disabled={preset === 'auto'}>Back to Auto</Button>
        <Button variant="ghost" className="w-full" onClick={reset}>Start over</Button>
      </>}
    />
  )
}
