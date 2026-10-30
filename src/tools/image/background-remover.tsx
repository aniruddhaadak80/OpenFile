import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Eraser, Download, Package, ImagePlus, Wand2 } from 'lucide-react'
import { Button, ErrorNote, Label, Progress, Segmented, Slider, Switch, ToolGrid, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { downloadBlob, zipFiles, formatBytes } from '@/lib/files'
import { BeforeAfter, ColorInput, ImageDrop, StatusPill, ThumbGrid, blurCanvas, canvas, decode, toCanvas, useDebounced, useImageList, outName, type Item } from './_img/kit'

type BgMode = 'transparent' | 'color' | 'blur' | 'image'
type Cut = { state: 'run' | 'done' | 'err'; blob?: Blob; err?: string }
const SWATCHES = ['#ffffff', '#000000', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#14b8a6', '#e5e7eb']

type Extra = { feather: number; shadow: number; fitBg: boolean; scale: number }
const NO_EXTRA: Extra = { feather: 0, shadow: 0, fitBg: false, scale: 100 }

/** Draws the cut-out at the target size and softens its edge by blurring the alpha mask. Only one canvas at that size. */
function featherCut(c: HTMLImageElement, px: number, w = c.naturalWidth, h = c.naturalHeight) {
  const { canvas: out, ctx } = canvas(w, h)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(c, 0, 0, w, h)
  if (px <= 0) return out
  const mask = blurCanvas(out, px)
  ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(mask, 0, 0); ctx.globalCompositeOperation = 'source-over'
  mask.width = mask.height = 0
  return out
}

async function compose(orig: Blob, cut: Blob, mode: BgMode, color: string, blur: number, bgImg: HTMLImageElement | null, maxSide = 0, ex: Extra = NO_EXTRA) {
  if (mode === 'image' && bgImg && ex.fitBg) return composeOnBackground(cut, bgImg, maxSide, ex)
  const c0 = await decode(cut)
  let w = c0.naturalWidth, h = c0.naturalHeight
  const s = maxSide && Math.max(w, h) > maxSide ? maxSide / Math.max(w, h) : 1
  w = Math.round(w * s); h = Math.round(h * s)
  // scale first, then feather, so a preview never allocates a full-size canvas
  const c = featherCut(c0, ex.feather * Math.max(w, h) / 1000, w, h)
  const { canvas: out, ctx } = canvas(w, h)
  if (mode === 'color') { ctx.fillStyle = color; ctx.fillRect(0, 0, w, h) }
  if (mode === 'blur') { const o = await decode(orig); const { canvas: oc, ctx: octx } = canvas(w, h); octx.drawImage(o, 0, 0, w, h); const b = blurCanvas(oc, Math.max(1, (blur * Math.max(w, h)) / 1200)); ctx.drawImage(b, 0, 0); oc.width = oc.height = 0; b.width = b.height = 0 }
  if (mode === 'image' && bgImg) { const k = Math.max(w / bgImg.naturalWidth, h / bgImg.naturalHeight); const bw = bgImg.naturalWidth * k, bh = bgImg.naturalHeight * k; ctx.drawImage(bgImg, (w - bw) / 2, (h - bh) / 2, bw, bh) }
  if (ex.shadow > 0 && mode !== 'transparent') { ctx.save(); ctx.shadowColor = `rgba(0,0,0,${ex.shadow / 100})`; ctx.shadowBlur = Math.max(w, h) * 0.03; ctx.shadowOffsetY = Math.max(w, h) * 0.012; ctx.drawImage(c, 0, 0); ctx.restore() }
  else ctx.drawImage(c, 0, 0)
  c.width = c.height = 0
  return out
}

/** Place the subject on the background image at the background's own size (centred at the bottom). */
async function composeOnBackground(cut: Blob, bgImg: HTMLImageElement, maxSide: number, ex: Extra) {
  const ci = await decode(cut)
  let W = bgImg.naturalWidth, H = bgImg.naturalHeight
  const s = maxSide && Math.max(W, H) > maxSide ? maxSide / Math.max(W, H) : 1
  W = Math.round(W * s); H = Math.round(H * s)
  const k = Math.min(W / ci.naturalWidth, H / ci.naturalHeight) * (ex.scale / 100)
  const cw = Math.max(1, Math.round(ci.naturalWidth * k)), ch = Math.max(1, Math.round(ci.naturalHeight * k))
  const c = featherCut(ci, ex.feather * 1.5, cw, ch)
  const { canvas: out, ctx } = canvas(W, H)
  ctx.drawImage(bgImg, 0, 0, W, H)
  if (ex.shadow > 0) { ctx.shadowColor = `rgba(0,0,0,${ex.shadow / 100})`; ctx.shadowBlur = Math.max(W, H) * 0.03; ctx.shadowOffsetY = Math.max(W, H) * 0.012 }
  ctx.drawImage(c, (W - cw) / 2, H - ch, cw, ch)
  c.width = c.height = 0
  return out
}
const toPng = (c: HTMLCanvasElement, type = 'image/png', q?: number) => new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('Export failed'))), type, q))

let gpuCheck: Promise<boolean> | null = null
/** WebGPU is only usable when an adapter can actually be obtained. */
function gpuReady(): Promise<boolean> {
  if (!gpuCheck) gpuCheck = (async () => { try { const g = (navigator as any).gpu; return !!(g && (await g.requestAdapter())) } catch { return false } })()
  return gpuCheck
}

/** One module worker runs the model off the main thread; it is recreated if it ever crashes.
 *  A watchdog stops it when it goes silent for too long, and `stopCurrent` cancels the running image. */
let worker: Worker | null = null
let stopCurrent: (() => void) | null = null
const STALL_MS = 6 * 60_000
function runInWorker(id: string, file: Blob, model: string, preferGpu: boolean, onProgress: (key: string, cur: number, total: number) => void) {
  return new Promise<Blob>((resolve, reject) => {
    if (!worker) worker = new Worker(new URL('./bg-remover.worker.ts', import.meta.url), { type: 'module' })
    const w = worker
    let timer = 0
    const done = () => { window.clearTimeout(timer); w.onmessage = null; w.onerror = null; w.onmessageerror = null; stopCurrent = null }
    const kill = (msg: string) => { done(); w.terminate(); if (worker === w) worker = null; reject(new Error(msg)) }
    const arm = () => { window.clearTimeout(timer); timer = window.setTimeout(() => kill('timed out'), STALL_MS) }
    stopCurrent = () => kill('cancelled')
    w.onmessage = (ev) => {
      const m = ev.data
      if (m.id !== id) return
      arm()
      if (m.type === 'progress') onProgress(m.key, m.cur, m.total)
      else if (m.type === 'done') { done(); resolve(m.blob) }
      else if (m.type === 'error') { done(); reject(new Error(m.message)) }
    }
    w.onerror = (e) => { e.preventDefault?.(); kill('worker failed') }
    w.onmessageerror = () => kill('worker failed')
    arm()
    w.postMessage({ id, file, model, preferGpu })
  })
}

/** Object URL for a blob, created and revoked in the same effect so it is never revoked while still shown. */
function useBlobUrl(blob: Blob | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) { setUrl(null); return }
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

const friendly = (msg: string) => msg === 'cancelled'
  ? 'Stopped. Press Retry to run it again.'
  : msg === 'timed out'
    ? 'This took too long and was stopped. Try the Faster model or a smaller photo, then press Retry.'
    : /memory|allocation|out of|worker failed/i.test(msg)
  ? 'This image needs more memory than the browser allowed. Try the Faster model or a smaller photo.'
  : /fetch|network|load/i.test(msg)
    ? 'The AI model could not be downloaded. Check your connection (the model downloads once) and retry.'
    : 'Background removal did not finish for this image. Retry, or try the Faster model.'

export default function BackgroundRemover() {
  const { items, add, remove, clear } = useImageList()
  const [cuts, setCuts] = useState<Record<string, Cut>>({})
  const [sel, setSel] = useState<string | null>(null)
  const [mode, setMode] = useState<BgMode>('transparent')
  const [color, setColor] = useState('#ffffff')
  const [blur, setBlur] = useState(14)
  const [bgFile, setBgFile] = useState<File | null>(null)
  const [bgImg, setBgImg] = useState<HTMLImageElement | null>(null)
  const [quality, setQuality] = useState<'isnet_fp16' | 'isnet_quint8'>('isnet_fp16')
  const [stage, setStage] = useState<{ id: string; label: string; p: number; slow?: boolean } | null>(null)
  const [preview, setPreview] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zipping, setZipping] = useState(false)
  const queue = useRef(false)
  const [tick, setTick] = useState(0)
  const bgInput = useRef<HTMLInputElement>(null)
  const stateRef = useRef(cuts); stateRef.current = cuts
  const itemsRef = useRef(items); itemsRef.current = items

  const onFiles = useCallback(async (f: File[]) => { const a = await add(f); if (a[0]) setSel((s) => s ?? a[0].id) }, [add])

  // Process the queue one image at a time, in a worker. Every state update is keyed by the item id.
  useEffect(() => {
    if (queue.current) return
    const next = items.find((i) => !cuts[i.id])
    if (!next) return
    queue.current = true
    const id = next.id
    setCuts((s) => ({ ...s, [id]: { state: 'run' } }))
    let creep = 0
    ;(async () => {
      try {
        setError(null)
        setStage({ id, label: 'Loading AI engine', p: 0.02 })
        // The library reports download progress per file and only a few compute steps, so keep the bar moving
        // slowly between reports while the model runs.
        let last = 0.05, computing = false, since = 0
        const files: Record<string, [number, number]> = {}
        const gpu = await gpuReady()
        // show the time spent, since the model gives no progress while it runs (often a minute or more on a CPU)
        const label = () => { const sec = since ? Math.round((Date.now() - since) / 1000) : 0; return sec >= 5 ? `Removing background, ${sec} s` : 'Removing background' }
        creep = window.setInterval(() => {
          if (!computing) return
          if (!since) since = Date.now()
          last = Math.min(0.95, last + (0.95 - last) * 0.04)
          setStage({ id, label: label(), p: last, slow: !gpu })
        }, 300)
        const blob = await runInWorker(id, next.file, quality, gpu, (key, c0, t0) => {
          if (key.startsWith('fetch')) {
            files[key] = [c0, t0]
            const c = Object.values(files).reduce((a, f) => a + f[0], 0), t = Object.values(files).reduce((a, f) => a + f[1], 0)
            last = Math.max(last, 0.05 + (t ? c / t : 0) * 0.6)
            if (t && c >= t) { computing = true; setStage({ id, label: label(), p: last, slow: !gpu }) }
            else setStage({ id, label: `Downloading AI model (first run only) · ${formatBytes(c)} / ${formatBytes(t)}`, p: last })
          } else if (key === 'compose') {
            last = Math.max(last, 0.96)
            setStage({ id, label: 'Applying the mask', p: last })
          } else {
            computing = true
            last = Math.max(last, 0.65 + (t0 ? c0 / t0 : 0) * 0.3)
            setStage({ id, label: label(), p: last, slow: !gpu })
          }
        })
        setCuts((s) => (s[id] ? { ...s, [id]: { state: 'done', blob } } : s))
        // If the selected image has nothing to show yet, show the one that just finished.
        setSel((cur) => (cur && cur !== id && stateRef.current[cur] ? cur : id))
      } catch (e: any) {
        console.warn('Background removal failed', e)
        const raw = String(e?.message || e)
        const msg = friendly(raw)
        setError(raw === 'cancelled' ? null : msg)
        // Cancel stops the whole queue: images still waiting are marked stopped too, each with its own Retry
        setCuts((s) => {
          if (!s[id]) return s
          const n: Record<string, Cut> = { ...s, [id]: { state: 'err', err: msg } }
          if (raw === 'cancelled') for (const it of itemsRef.current) if (!n[it.id]) n[it.id] = { state: 'err', err: msg }
          return n
        })
      } finally { clearInterval(creep); queue.current = false; setStage(null); setTick((t) => t + 1) }
    })()
  }, [items, cuts, quality, tick])

  // keep the selection pointing at an item that exists
  useEffect(() => { if (items.length && (!sel || !items.some((i) => i.id === sel))) setSel(items[0].id) }, [items, sel])

  const cur: Item | undefined = items.find((i) => i.id === sel) ?? items[0]
  const cutBlob = cur ? cuts[cur.id]?.blob : undefined
  const [feather, setFeather] = useState(0)
  const [shadow, setShadow] = useState(0)
  const [fitBg, setFitBg] = useState(true)
  const [scale, setScale] = useState(90)
  const ex: Extra = { feather, shadow, fitBg, scale }
  const settings = useDebounced({ mode, color, blur, bgImg, feather, shadow, fitBg, scale }, 120)
  useEffect(() => {
    if (!cur || !cutBlob) { setPreview(null); return }
    let off = false
    // Preview at a capped size. If composing fails, show the plain cut-out rather than a stuck placeholder.
    compose(cur.file, cutBlob, settings.mode, settings.color, settings.blur, settings.bgImg, 1200, { feather: settings.feather, shadow: settings.shadow, fitBg: settings.fitBg, scale: settings.scale })
      .then(async (c) => { const b = await toPng(c); c.width = c.height = 0; return b })
      .then((b) => { if (!off) setPreview(b) })
      .catch((e) => { console.warn('Preview failed', e); if (!off) setPreview(cutBlob) })
    return () => { off = true }
  }, [cur?.id, cutBlob, settings])
  const previewUrl = useBlobUrl(preview)
  const cutUrl = useBlobUrl(cutBlob)

  const exportOne = async (it: Item) => {
    const c = await compose(it.file, cuts[it.id].blob!, mode, color, blur, bgImg, 0, ex)
    const opaque = mode !== 'transparent'
    const out = { name: outName(it.file.name, opaque && mode !== 'color' ? 'jpg' : 'png', '-nobg'), blob: opaque && mode !== 'color' ? await toPng(c, 'image/jpeg', 0.93) : await toPng(c) }
    c.width = c.height = 0
    return out
  }
  const downloadCurrent = async () => {
    if (!cur || !cuts[cur.id]?.blob) return
    try { const r = await exportOne(cur); downloadBlob(r.blob, r.name) }
    catch (e) { console.warn(e); if (mode === 'transparent') downloadBlob(cuts[cur.id].blob!, outName(cur.file.name, 'png', '-nobg')); else toast('Export failed. Try a smaller photo.', 'error') }
  }
  const downloadAll = async () => {
    setZipping(true)
    try { const done = items.filter((i) => cuts[i.id]?.state === 'done'); const files = []; for (const it of done) files.push(await exportOne(it)); downloadBlob(await zipFiles(files.map((f) => ({ name: f.name, data: f.blob }))), 'background-removed.zip') }
    catch (e: any) { console.warn(e); toast('Export failed. Try fewer or smaller photos.', 'error') } finally { setZipping(false) }
  }
  const reset = () => { clear(); setCuts({}); setSel(null); setPreview(null); setError(null) }
  const retry = (id: string) => setCuts((s) => { const n = { ...s }; delete n[id]; return n })

  if (!items.length) return <ImageDrop onFiles={onFiles} label="Drop photos to remove the background" sub="Runs an AI model on your device, the model (~40 MB) downloads once, your images never leave the browser." />

  const doneCount = items.filter((i) => cuts[i.id]?.state === 'done').length
  const curState = cur ? cuts[cur.id]?.state : undefined
  const curStage = stage && cur && stage.id === cur.id && curState === 'run' ? stage : null

  return (
    <ToolGrid
      main={<>
        <div className="rounded-2xl border border-border bg-surface p-4">
          {curState === 'done' && (previewUrl || cutUrl) ? (
            <motion.div key={cur!.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}><BeforeAfter before={cur!.url} after={(previewUrl || cutUrl)!} labels={['Original', 'Result']} maxH="60vh" /></motion.div>
          ) : curState === 'err' ? (
            <div className="grid min-h-64 place-items-center text-center text-sm"><div><p className="text-danger">{cuts[cur!.id]?.err ?? 'This image could not be processed.'}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => retry(cur!.id)}>Retry</Button></div></div>
          ) : (
            <div className="relative mx-auto w-fit overflow-hidden rounded-xl">
              {cur && <img src={cur.url} alt="" className="max-h-[60vh] max-w-full opacity-60 blur-[1px]" />}
              <div className="shimmer absolute inset-0" />
              <div className="absolute inset-x-4 bottom-4 space-y-2 rounded-xl glass p-3 text-sm">
                <Progress value={curStage ? curStage.p : curState === 'done' ? 1 : 0} label={curStage ? curStage.label : curState === 'done' ? 'Preparing preview' : curState === 'run' ? 'Starting AI model' : 'Waiting in queue'} />
                {curStage?.slow && <p className="text-xs text-muted">No GPU was found, so the model runs on the processor. This can take a minute or two.</p>}
                {curState === 'run' && <Button size="sm" variant="outline" onClick={() => stopCurrent?.()}>Cancel</Button>}
              </div>
            </div>
          )}
        </div>
        {items.length > 0 && <ThumbGrid items={items} selected={cur?.id} onSelect={setSel} onRemove={(id) => { remove(id); retry(id) }} onAdd={onFiles} extra={(it) => <StatusPill state={cuts[it.id]?.state ?? 'wait'} />} />}
      </>}
      side={<>
        <div>
          <Label>New background</Label>
          <Segmented value={mode} onChange={setMode} options={[{ value: 'transparent', label: 'None' }, { value: 'color', label: 'Color' }, { value: 'blur', label: 'Blur' }, { value: 'image', label: 'Image' }]} />
        </div>
        {mode === 'color' && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">{SWATCHES.map((s) => <button key={s} onClick={() => setColor(s)} className={cn('size-7 rounded-lg border cursor-pointer', color === s ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'border-border')} style={{ background: s }} aria-label={s} />)}</div>
            <ColorInput value={color} onChange={setColor} />
          </div>
        )}
        {mode === 'blur' && <Slider label="Blur strength" value={blur} onChange={setBlur} min={2} max={40} suffix="px" />}
        {mode === 'image' && (
          <div>
            <input ref={bgInput} type="file" hidden accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setBgFile(f); setBgImg(await decode(f)) } }} />
            <Button variant="outline" className="w-full" icon={<ImagePlus className="size-4" />} onClick={() => bgInput.current?.click()}>{bgFile ? 'Change background image' : 'Choose background image'}</Button>
            {bgFile && <p className="mt-1.5 truncate text-[11px] text-muted">{bgFile.name}</p>}
            {bgFile && <div className="mt-3 space-y-3"><Switch checked={fitBg} onChange={setFitBg} label="Use the background's size" />{fitBg && <Slider label="Subject size" value={scale} onChange={setScale} min={20} max={100} suffix="%" />}</div>}
          </div>
        )}
        <Slider label="Soften edges" value={feather} onChange={setFeather} min={0} max={10} />
        {mode !== 'transparent' && <Slider label="Subject shadow" value={shadow} onChange={setShadow} min={0} max={80} suffix="%" />}
        <div>
          <Label>Model</Label>
          <Segmented value={quality} onChange={(q) => setQuality(q)} options={[{ value: 'isnet_fp16', label: 'Best quality' }, { value: 'isnet_quint8', label: 'Faster' }]} />
          <p className="mt-1.5 text-[11px] text-muted">Applies to images added after switching.</p>
        </div>
        <ErrorNote error={error} />
        <div className="space-y-2">
          <Button size="lg" className="w-full" disabled={curState !== 'done' || !cutBlob} icon={<Download className="size-4" />} onClick={downloadCurrent}>Download {mode === 'transparent' || mode === 'color' ? 'PNG' : 'JPG'}</Button>
          {items.length > 1 && <Button variant="outline" className="w-full" disabled={!doneCount} loading={zipping} icon={<Package className="size-4" />} onClick={downloadAll}>Download all {doneCount} with these settings (ZIP)</Button>}
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted"><Wand2 className="size-3" /> {doneCount}/{items.length} processed · on-device AI</p>
        </div>
        <Button variant="ghost" className="w-full" icon={<Eraser className="size-4" />} onClick={reset}>Start over</Button>
      </>}
    />
  )
}
