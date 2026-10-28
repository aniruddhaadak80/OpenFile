import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, RotateCw, X, FileDown, ArrowDownAZ, Loader2 } from 'lucide-react'
import { Button, Dropzone, ToolGrid, Label, Segmented, Slider, Select, Input, Progress, ErrorNote, ResultCard, Badge, useJob, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { canvasToBlob, createCanvas, loadImage, formatBytes } from '@/lib/files'
import { pdfBlob } from '@/lib/pdf'
import { PAGE_SIZES, PdfPreview, heicToBlob, isHeic, mm, Reveal } from './_conv/shared'

type SizeKey = 'a4' | 'letter' | 'legal' | 'fit'
type Orient = 'auto' | 'portrait' | 'landscape'
type FitMode = 'contain' | 'cover'
interface Img { id: string; name: string; size: number; blob: Blob | null; url: string | null; w: number; h: number; rot: number; status: 'loading' | 'ready' | 'error'; err?: string }

let uid = 0
const ACCEPT = 'image/*,.heic,.heif'

function pageFor(img: Img, size: SizeKey, orient: Orient, marginPt: number) {
  const rotated = img.rot % 180 !== 0
  const iw = rotated ? img.h : img.w, ih = rotated ? img.w : img.h
  if (size === 'fit') return { pw: iw * 0.75 + marginPt * 2, ph: ih * 0.75 + marginPt * 2, iw, ih }
  const base = PAGE_SIZES[size]
  const land = orient === 'landscape' || (orient === 'auto' && iw > ih)
  return { pw: land ? base.h : base.w, ph: land ? base.w : base.h, iw, ih }
}

function SortableCard({ img, index, size, orient, marginPt, fit, onRotate, onRemove }: { img: Img; index: number; size: SizeKey; orient: Orient; marginPt: number; fit: FitMode; onRotate: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: img.id })
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined }
  const { pw, ph } = img.status === 'ready' ? pageFor(img, size, orient, marginPt) : { pw: 3, ph: 4 }
  const pad = `${(marginPt / pw) * 100}%`
  return (
    <div ref={setNodeRef} style={style} className={cn('group relative rounded-xl border bg-surface p-2 transition-shadow', isDragging ? 'border-accent shadow-2xl shadow-accent/20' : 'border-border')}>
      <div className="flex items-center gap-1 pb-1.5">
        <button {...attributes} {...listeners} className="cursor-grab touch-none rounded p-0.5 text-muted hover:text-fg active:cursor-grabbing" aria-label="Drag to reorder"><GripVertical className="size-4" /></button>
        <span className="font-mono text-[11px] text-muted">{index + 1}</span>
        <div className="ml-auto flex gap-0.5">
          <button onClick={onRotate} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg cursor-pointer" aria-label="Rotate"><RotateCw className="size-3.5" /></button>
          <button onClick={onRemove} className="rounded p-1 text-muted hover:bg-danger/10 hover:text-danger cursor-pointer" aria-label="Remove"><X className="size-3.5" /></button>
        </div>
      </div>
      <div className="flex aspect-square items-center justify-center rounded-lg bg-surface-2 p-2">
        <div className="relative max-h-full max-w-full bg-white shadow-md ring-1 ring-black/5 transition-all duration-300" style={{ aspectRatio: `${pw} / ${ph}`, height: pw > ph ? 'auto' : '100%', width: pw > ph ? '100%' : 'auto', padding: pad }}>
          {img.status === 'ready' && img.url ? (
            <div className="relative size-full overflow-hidden">
              <img src={img.url} alt={img.name} draggable={false} className="absolute left-1/2 top-1/2 transition-transform duration-300"
                style={{
                  transform: `translate(-50%, -50%) rotate(${img.rot}deg)`,
                  width: img.rot % 180 ? undefined : '100%', height: img.rot % 180 ? undefined : '100%',
                  ...(img.rot % 180 ? { width: `${(ph - 2 * marginPt) / (pw - 2 * marginPt) * 100}%`, height: `${(pw - 2 * marginPt) / (ph - 2 * marginPt) * 100}%` } : {}),
                  objectFit: fit,
                }} />
            </div>
          ) : img.status === 'loading' ? <div className="grid size-full min-h-16 min-w-12 place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>
            : <div className="grid size-full min-h-16 place-items-center p-1 text-center text-[10px] text-danger">{img.err}</div>}
        </div>
      </div>
      <div className="mt-1.5 truncate text-[11px] font-medium" title={img.name}>{img.name}</div>
      <div className="font-mono text-[10px] text-muted">{img.status === 'ready' ? `${img.w}×${img.h}` : '…'} · {formatBytes(img.size)}</div>
    </div>
  )
}

export default function ImageToPdf() {
  const [imgs, setImgs] = useState<Img[]>([])
  const [size, setSize] = useState<SizeKey>('a4')
  const [orient, setOrient] = useState<Orient>('auto')
  const [marginMm, setMarginMm] = useState(10)
  const [fit, setFit] = useState<FitMode>('contain')
  const [quality, setQuality] = useState(90)
  const [name, setName] = useState('images.pdf')
  const [result, setResult] = useState<Blob | null>(null)
  const { busy, progress, error, run } = useJob()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const marginPt = mm(marginMm)

  useEffect(() => () => imgs.forEach((i) => i.url && URL.revokeObjectURL(i.url)), []) // eslint-disable-line

  const add = (files: File[]) => {
    setResult(null)
    const fresh: Img[] = files.map((f) => ({ id: `img${++uid}`, name: f.name, size: f.size, blob: null, url: null, w: 0, h: 0, rot: 0, status: 'loading' }))
    setImgs((s) => [...s, ...fresh])
    if (imgs.length === 0 && files[0]) setName(files[0].name.replace(/\.[^.]+$/, '') + '.pdf')
    fresh.forEach(async (it, k) => {
      const f = files[k]
      try {
        const blob = isHeic(f) ? await heicToBlob(f) : f
        const el = await loadImage(blob)
        const url = el.src
        setImgs((s) => s.map((x) => (x.id === it.id ? { ...x, blob, url, w: el.naturalWidth, h: el.naturalHeight, status: 'ready' } : x)))
      } catch (e: any) {
        setImgs((s) => s.map((x) => (x.id === it.id ? { ...x, status: 'error', err: isHeic(f) ? 'HEIC decode failed' : 'Unsupported image' } : x)))
      }
    })
  }
  const remove = (id: string) => { setResult(null); setImgs((s) => { const x = s.find((i) => i.id === id); if (x?.url) URL.revokeObjectURL(x.url); return s.filter((i) => i.id !== id) }) }
  const rotate = (id: string) => { setResult(null); setImgs((s) => s.map((i) => (i.id === id ? { ...i, rot: (i.rot + 90) % 360 } : i))) }
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (over && active.id !== over.id) { setResult(null); setImgs((s) => arrayMove(s, s.findIndex((i) => i.id === active.id), s.findIndex((i) => i.id === over.id))) }
  }
  const sortByName = () => { setResult(null); setImgs((s) => [...s].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) }
  const reset = () => { imgs.forEach((i) => i.url && URL.revokeObjectURL(i.url)); setImgs([]); setResult(null) }

  const ready = useMemo(() => imgs.filter((i) => i.status === 'ready'), [imgs])
  const loading = imgs.some((i) => i.status === 'loading')

  const build = () => run(async (setP) => {
    if (!ready.length) throw new Error('Add at least one image.')
    const { PDFDocument } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    doc.setTitle(name.replace(/\.pdf$/i, '')); doc.setCreator('OpenFile'); doc.setProducer('OpenFile (in-browser)')
    for (let k = 0; k < ready.length; k++) {
      const im = ready[k]
      const { pw, ph, iw, ih } = pageFor(im, size, orient, marginPt)
      const cw = pw - marginPt * 2, chh = ph - marginPt * 2
      if (cw <= 10 || chh <= 10) throw new Error('Margins are too large for this page size.')
      // draw (rotated / cropped) image on a canvas, capped to a sane resolution
      const el = await loadImage(im.url!)
      let sx = 0, sy = 0, sw = iw, sh = ih // crop in rotated space
      if (fit === 'cover') {
        const target = cw / chh
        if (iw / ih > target) { sw = ih * target; sx = (iw - sw) / 2 } else { sh = iw / target; sy = (ih - sh) / 2 }
      }
      const cap = 5000 / Math.max(sw, sh)
      const s = Math.min(1, cap)
      const { canvas, ctx } = createCanvas(sw * s, sh * s)
      const lossless = quality >= 100 && !/jpe?g$/i.test(im.name)
      if (!lossless) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height) }
      ctx.save()
      ctx.scale(s, s)
      ctx.translate(-sx, -sy)
      ctx.translate(iw / 2, ih / 2)
      ctx.rotate((im.rot * Math.PI) / 180)
      ctx.drawImage(el, -im.w / 2, -im.h / 2)
      ctx.restore()
      const blob = await canvasToBlob(canvas, lossless ? 'image/png' : 'image/jpeg', lossless ? undefined : quality / 100)
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const emb = lossless ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
      const page = doc.addPage([pw, ph])
      const scale = Math.min(cw / sw, chh / sh)
      const dw = sw * scale, dh = sh * scale
      page.drawImage(emb, { x: marginPt + (cw - dw) / 2, y: marginPt + (chh - dh) / 2, width: dw, height: dh })
      canvas.width = canvas.height = 0
      setP((k + 1) / ready.length)
    }
    const out = pdfBlob(await doc.save())
    setResult(out)
    toast('PDF created', 'success')
  })

  const fileName = /\.pdf$/i.test(name) ? name : name + '.pdf'

  if (!imgs.length) return <Dropzone multiple accept={ACCEPT} onFiles={add} label="Drop images to combine into a PDF" sub="JPG, PNG, WEBP, GIF, BMP, HEIC, processed 100% in your browser." />

  return (
    <div className="space-y-5">
      <ToolGrid
        main={<>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{imgs.length} image{imgs.length > 1 ? 's' : ''}</Badge>
            <span className="text-xs text-muted">Drag cards to reorder · rotate or remove individually</span>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="ghost" icon={<ArrowDownAZ className="size-4" />} onClick={sortByName}>Sort by name</Button>
              <Button size="sm" variant="ghost" onClick={reset}>Start over</Button>
            </div>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={imgs.map((i) => i.id)} strategy={rectSortingStrategy}>
              <motion.div layout className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                <AnimatePresence>
                  {imgs.map((img, i) => (
                    <motion.div key={img.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                      <SortableCard img={img} index={i} size={size} orient={orient} marginPt={marginPt} fit={fit} onRotate={() => rotate(img.id)} onRemove={() => remove(img.id)} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            </SortableContext>
          </DndContext>
          <Dropzone compact multiple accept={ACCEPT} onFiles={add} label="Add more images" sub="Drop here or click, they are appended at the end." />
          {result && (
            <Reveal k="res" className="space-y-3">
              <ResultCard blob={result} filename={fileName} title={`PDF with ${ready.length} page${ready.length > 1 ? 's' : ''} ready`} onReset={reset} />
              <PdfPreview blob={result} />
            </Reveal>
          )}
        </>}
        side={<>
          <div><Label>Page size</Label><Select value={size} onChange={(v) => { setSize(v); setResult(null) }} options={[{ value: 'a4', label: 'A4 (210 × 297 mm)' }, { value: 'letter', label: 'US Letter (8.5 × 11 in)' }, { value: 'legal', label: 'US Legal (8.5 × 14 in)' }, { value: 'fit', label: 'Fit to image' }]} /></div>
          {size !== 'fit' && <div><Label>Orientation</Label><Segmented value={orient} onChange={(v) => { setOrient(v); setResult(null) }} options={[{ value: 'auto', label: 'Auto' }, { value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]} /></div>}
          <div>
            <Slider label="Margin" value={marginMm} onChange={(v) => { setMarginMm(v); setResult(null) }} min={0} max={40} suffix=" mm" />
            <div className="mt-2 flex gap-1.5">{[['None', 0], ['Small', 5], ['Normal', 10], ['Large', 20]].map(([l, v]) => <button key={l} onClick={() => { setMarginMm(v as number); setResult(null) }} className={cn('rounded-md border px-2 py-0.5 text-[11px] cursor-pointer', marginMm === v ? 'border-accent text-accent' : 'border-border text-muted hover:text-fg')}>{l}</button>)}</div>
          </div>
          {size !== 'fit' && <div><Label>Image fit</Label><Segmented value={fit} onChange={(v) => { setFit(v); setResult(null) }} options={[{ value: 'contain', label: 'Contain (whole image)' }, { value: 'cover', label: 'Cover (fill page)' }]} /></div>}
          <div>
            <Slider label="Image quality" value={quality} onChange={(v) => { setQuality(v); setResult(null) }} min={40} max={100} suffix="%" />
            <p className="mt-1 text-[11px] text-muted">{quality >= 100 ? 'Lossless: PNG/WEBP sources stay pixel-perfect.' : 'JPEG compression, lower is smaller.'}</p>
          </div>
          <div><Label>File name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          {busy && <Progress value={progress} label="Building PDF" />}
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" loading={busy} disabled={!ready.length || loading} icon={<FileDown className="size-5" />} onClick={build}>
            {loading ? 'Loading images…' : `Create PDF (${ready.length} page${ready.length === 1 ? '' : 's'})`}
          </Button>
        </>}
      />
    </div>
  )
}
