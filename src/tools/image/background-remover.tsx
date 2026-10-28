import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Eraser, Download, Package, ImagePlus, Wand2 } from 'lucide-react'
import { Button, ErrorNote, Label, Progress, Segmented, Slider, ToolGrid, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { downloadBlob, zipFiles, formatBytes } from '@/lib/files'
import { BeforeAfter, ColorInput, ImageDrop, StatusPill, ThumbGrid, blurCanvas, canvas, decode, toCanvas, useDebounced, useImageList, useObjectUrl, outName, type Item } from './_img/kit'

type BgMode = 'transparent' | 'color' | 'blur' | 'image'
type Cut = { state: 'run' | 'done' | 'err'; blob?: Blob; err?: string }
const SWATCHES = ['#ffffff', '#000000', '#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#e5e7eb']

async function compose(orig: Blob, cut: Blob, mode: BgMode, color: string, blur: number, bgImg: HTMLImageElement | null, maxSide = 0) {
  const [o, c] = await Promise.all([decode(orig), decode(cut)])
  let w = c.naturalWidth, h = c.naturalHeight
  const s = maxSide && Math.max(w, h) > maxSide ? maxSide / Math.max(w, h) : 1
  w = Math.round(w * s); h = Math.round(h * s)
  const { canvas: out, ctx } = canvas(w, h)
  if (mode === 'color') { ctx.fillStyle = color; ctx.fillRect(0, 0, w, h) }
  if (mode === 'blur') { const { canvas: oc, ctx: octx } = canvas(w, h); octx.drawImage(o, 0, 0, w, h); ctx.drawImage(blurCanvas(oc, Math.max(1, (blur * Math.max(w, h)) / 1200)), 0, 0) }
  if (mode === 'image' && bgImg) { const k = Math.max(w / bgImg.naturalWidth, h / bgImg.naturalHeight); const bw = bgImg.naturalWidth * k, bh = bgImg.naturalHeight * k; ctx.drawImage(bgImg, (w - bw) / 2, (h - bh) / 2, bw, bh) }
  ctx.drawImage(c, 0, 0, w, h)
  return out
}
const toPng = (c: HTMLCanvasElement, type = 'image/png', q?: number) => new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('Export failed'))), type, q))

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
  const [stage, setStage] = useState<{ label: string; p: number } | null>(null)
  const [preview, setPreview] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zipping, setZipping] = useState(false)
  const queue = useRef(false)
  const [tick, setTick] = useState(0)
  const bgInput = useRef<HTMLInputElement>(null)

  const onFiles = useCallback(async (f: File[]) => { const a = await add(f); if (a[0]) setSel((s) => s ?? a[0].id) }, [add])

  // process queue sequentially
  useEffect(() => {
    if (queue.current) return
    const next = items.find((i) => !cuts[i.id])
    if (!next) return
    queue.current = true
    setCuts((s) => ({ ...s, [next.id]: { state: 'run' } }))
    ;(async () => {
      try {
        setError(null)
        setStage({ label: 'Loading AI engine…', p: 0.02 })
        const { removeBackground } = await import('@imgly/background-removal')
        const blob = await removeBackground(next.file, {
          model: quality,
          device: (navigator as any).gpu ? 'gpu' : 'cpu',
          output: { format: 'image/png' },
          progress: (key: string, cur: number, total: number) => {
            const p = total ? cur / total : 0
            if (key.startsWith('fetch')) setStage({ label: `Downloading AI model (first run only) · ${formatBytes(cur)} / ${formatBytes(total)}`, p: p * 0.85 })
            else setStage({ label: 'Removing background…', p: 0.85 + p * 0.15 })
          },
        })
        setCuts((s) => ({ ...s, [next.id]: { state: 'done', blob } }))
      } catch (e: any) {
        console.error(e)
        const msg = e?.message || String(e)
        setError(`Background removal failed: ${msg}. Check your connection (the model downloads once) or try a smaller image.`)
        setCuts((s) => ({ ...s, [next.id]: { state: 'err', err: msg } }))
      } finally { queue.current = false; setStage(null); setTick((t) => t + 1) }
    })()
  }, [items, cuts, quality, tick])

  const cur: Item | undefined = items.find((i) => i.id === sel) ?? items[0]
  const cutBlob = cur ? cuts[cur.id]?.blob : undefined
  const settings = useDebounced({ mode, color, blur, bgImg }, 120)
  useEffect(() => {
    if (!cur || !cutBlob) { setPreview(null); return }
    let off = false
    compose(cur.file, cutBlob, settings.mode, settings.color, settings.blur, settings.bgImg, 1600).then((c) => toPng(c)).then((b) => { if (!off) setPreview(b) }).catch(() => {})
    return () => { off = true }
  }, [cur?.id, cutBlob, settings])
  const previewUrl = useObjectUrl(preview)

  const exportOne = async (it: Item) => {
    const c = await compose(it.file, cuts[it.id].blob!, mode, color, blur, bgImg)
    const opaque = mode !== 'transparent'
    return { name: outName(it.file.name, opaque && mode !== 'color' ? 'jpg' : 'png', '-nobg'), blob: opaque && mode !== 'color' ? await toPng(c, 'image/jpeg', 0.93) : await toPng(c) }
  }
  const downloadCurrent = async () => { if (!cur) return; const r = await exportOne(cur); downloadBlob(r.blob, r.name) }
  const downloadAll = async () => {
    setZipping(true)
    try { const done = items.filter((i) => cuts[i.id]?.state === 'done'); const files = []; for (const it of done) files.push(await exportOne(it)); downloadBlob(await zipFiles(files.map((f) => ({ name: f.name, data: f.blob }))), 'background-removed.zip') }
    catch (e: any) { toast(e?.message || 'Export failed', 'error') } finally { setZipping(false) }
  }
  const reset = () => { clear(); setCuts({}); setSel(null); setPreview(null); setError(null) }
  const retry = (id: string) => setCuts((s) => { const n = { ...s }; delete n[id]; return n })

  if (!items.length) return <ImageDrop onFiles={onFiles} label="Drop photos to remove the background" sub="Runs an AI model on your device — the model (~40 MB) downloads once, your images never leave the browser." />

  const doneCount = items.filter((i) => cuts[i.id]?.state === 'done').length
  const curState = cur ? cuts[cur.id]?.state : undefined

  return (
    <ToolGrid
      main={<>
        <div className="rounded-2xl border border-border bg-surface p-4">
          {curState === 'done' && previewUrl ? (
            <motion.div key={cur!.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}><BeforeAfter before={cur!.url} after={previewUrl} labels={['Original', 'Result']} maxH="60vh" /></motion.div>
          ) : curState === 'err' ? (
            <div className="grid min-h-64 place-items-center text-center text-sm"><div><p className="text-danger">This image couldn't be processed.</p><Button className="mt-3" size="sm" variant="outline" onClick={() => retry(cur!.id)}>Retry</Button></div></div>
          ) : (
            <div className="relative mx-auto w-fit overflow-hidden rounded-xl">
              {cur && <img src={cur.url} alt="" className="max-h-[60vh] max-w-full opacity-60 blur-[1px]" />}
              <div className="shimmer absolute inset-0" />
              <div className="absolute inset-x-4 bottom-4 rounded-xl glass p-3 text-sm"><Progress value={stage?.p ?? 0} label={stage?.label ?? 'Waiting in queue…'} /></div>
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
          </div>
        )}
        <div>
          <Label>Model</Label>
          <Segmented value={quality} onChange={(q) => setQuality(q)} options={[{ value: 'isnet_fp16', label: 'Best quality' }, { value: 'isnet_quint8', label: 'Faster' }]} />
          <p className="mt-1.5 text-[11px] text-muted">Applies to images added after switching.</p>
        </div>
        <ErrorNote error={error} />
        <div className="space-y-2">
          <Button size="lg" className="w-full" disabled={curState !== 'done'} icon={<Download className="size-4" />} onClick={downloadCurrent}>Download {mode === 'transparent' || mode === 'color' ? 'PNG' : 'JPG'}</Button>
          {items.length > 1 && <Button variant="outline" className="w-full" disabled={!doneCount} loading={zipping} icon={<Package className="size-4" />} onClick={downloadAll}>Download all {doneCount} (ZIP)</Button>}
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted"><Wand2 className="size-3" /> {doneCount}/{items.length} processed · on-device AI</p>
        </div>
        <Button variant="ghost" className="w-full" icon={<Eraser className="size-4" />} onClick={reset}>Start over</Button>
      </>}
    />
  )
}
