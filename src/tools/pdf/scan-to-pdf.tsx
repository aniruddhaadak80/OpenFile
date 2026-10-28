import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, RotateCw, Trash2, ArrowLeft, ArrowRight, ScanLine, Wand2, X, Maximize } from 'lucide-react'
import { Button, Dropzone, ResultCard, Segmented, Slider, ToolGrid, Progress, ErrorNote, Field, Spinner, cn, useJob } from '@/components/ui'
import { pdfBlob } from '@/lib/pdf'
import { toast } from '@/components/toast'
import { Note } from './_b1/ui'
import { detectQuad, enhance, quadSize, rotate90, warp, type Enhance, type Quad } from './_b1/scan'

type Page = { id: string; src: ImageData; quad: Quad; mode: Enhance; strength: number; rot: number; out?: { url: string; w: number; h: number } }
const MAX_SRC = 2200

async function toImageData(blob: Blob): Promise<ImageData> {
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' } as any)
  const s = Math.min(1, MAX_SRC / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s)
  const ctx = c.getContext('2d')!; ctx.drawImage(bmp, 0, 0, c.width, c.height); bmp.close()
  return ctx.getImageData(0, 0, c.width, c.height)
}
function processPage(p: Page) {
  const { w, h } = quadSize(p.quad)
  let px = warp({ data: p.src.data, width: p.src.width, height: p.src.height }, p.quad, w, h)
  enhance(px, w, h, p.mode, p.strength)
  let W = w, H = h
  for (let i = 0; i < ((p.rot / 90) % 4); i++) { const r = rotate90(px, W, H); px = r.px; W = r.w; H = r.h }
  const c = document.createElement('canvas'); c.width = W; c.height = H
  c.getContext('2d')!.putImageData(new ImageData(px as any, W, H), 0, 0)
  return c
}

export default function ScanToPdf() {
  const [pages, setPages] = useState<Page[]>([])
  const [cur, setCur] = useState(0)
  const [camera, setCamera] = useState(false)
  const [pageSize, setPageSize] = useState<'fit' | 'a4' | 'letter'>('a4')
  const [quality, setQuality] = useState(82)
  const [result, setResult] = useState<Blob | null>(null)
  const job = useJob(), adding = useJob()
  const page = pages[cur]

  const add = (files: Blob[]) => adding.run(async (setP) => {
    const next: Page[] = []
    for (let i = 0; i < files.length; i++) {
      const src = await toImageData(files[i])
      next.push({ id: Math.random().toString(36).slice(2), src, quad: detectQuad(src), mode: 'color', strength: 0.5, rot: 0 })
      setP((i + 1) / files.length)
    }
    setPages((p) => { setCur(p.length); return [...p, ...next] }); setResult(null)
  })
  const upd = (patch: Partial<Page>) => { setPages((ps) => ps.map((p, i) => (i === cur ? { ...p, ...patch, out: undefined } : p))); setResult(null) }

  // re-render the processed preview for the current page (debounced)
  useEffect(() => {
    if (!page || page.out) return
    const t = setTimeout(() => {
      const c = processPage(page)
      const url = c.toDataURL('image/jpeg', 0.8)
      setPages((ps) => ps.map((p) => (p.id === page.id ? { ...p, out: { url, w: c.width, h: c.height } } : p)))
    }, 120)
    return () => clearTimeout(t)
  }, [page])

  const run = () => job.run(async (setP) => {
    const { PDFDocument } = await import('pdf-lib')
    const out = await PDFDocument.create()
    for (let i = 0; i < pages.length; i++) {
      const c = processPage(pages[i])
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', quality / 100))
      const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()))
      let W: number, H: number
      if (pageSize === 'fit') { W = c.width * 72 / 200; H = c.height * 72 / 200 } else { [W, H] = pageSize === 'a4' ? [595.28, 841.89] : [612, 792]; if (c.width > c.height) [W, H] = [H, W] }
      const p = out.addPage([W, H])
      const s = Math.min(W / c.width, H / c.height)
      p.drawImage(img, { x: (W - c.width * s) / 2, y: (H - c.height * s) / 2, width: c.width * s, height: c.height * s })
      setP((i + 1) / pages.length)
    }
    out.setTitle('Scan ' + new Date().toLocaleDateString()); out.setProducer('OpenFile')
    setResult(pdfBlob(await out.save())); toast('Scan saved as PDF', 'success')
  })

  if (camera) return <CameraView onShot={(b) => add([b])} onClose={() => setCamera(false)} count={pages.length} />
  if (!pages.length) return (
    <div className="space-y-3">
      <Dropzone multiple accept="image/*" onFiles={add} label="Drop photos of documents" sub="Receipts, letters, notes, whiteboards. Edges are found automatically and you can adjust them." />
      <div className="flex justify-center"><Button size="lg" variant="outline" icon={<Camera className="size-5" />} onClick={() => setCamera(true)}>Use the camera</Button></div>
      {adding.busy && <Progress value={adding.progress} label="Reading photos…" />}
      <ErrorNote error={adding.error} />
    </div>
  )
  return (
    <div className="space-y-4">
      {result && <ResultCard blob={result} filename={`scan-${new Date().toISOString().slice(0, 10)}.pdf`} title={`${pages.length}-page scan ready`} onReset={() => { setPages([]); setResult(null); setCur(0) }} />}
      <ToolGrid
        main={<div className="space-y-3">
          {page && <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-surface p-3">
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted"><span>Drag the corners to the page edges</span><button type="button" onClick={() => upd({ quad: detectQuad(page.src) })} className="inline-flex items-center gap-1 text-accent cursor-pointer"><Wand2 className="size-3.5" />Auto</button></div>
              <CornerEditor img={page.src} quad={page.quad} onChange={(q) => upd({ quad: q })} />
              <button type="button" onClick={() => upd({ quad: [{ x: 0, y: 0 }, { x: page.src.width, y: 0 }, { x: page.src.width, y: page.src.height }, { x: 0, y: page.src.height }] })} className="mt-2 inline-flex items-center gap-1 text-xs text-muted hover:text-fg cursor-pointer"><Maximize className="size-3.5" />Use the whole photo</button>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-3">
              <div className="mb-2 text-xs font-medium text-muted">Result</div>
              <div className="checker flex min-h-64 items-center justify-center rounded-xl p-2">{page.out ? <img src={page.out.url} alt="Scanned page" className="max-h-[55vh] max-w-full bg-white shadow-xl" /> : <Spinner label="Straightening…" />}</div>
            </div>
          </div>}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {pages.map((p, i) => (
              <button key={p.id} type="button" onClick={() => setCur(i)} className={cn('relative h-24 w-20 shrink-0 overflow-hidden rounded-lg border-2 bg-surface-2 cursor-pointer', i === cur ? 'border-accent' : 'border-border')} aria-label={`Page ${i + 1}`}>
                {p.out ? <img src={p.out.url} alt="" className="h-full w-full object-contain" /> : <span className="text-xs text-muted">{i + 1}</span>}
                <span className="absolute bottom-0.5 left-1 rounded bg-black/60 px-1 text-[10px] text-white">{i + 1}</span>
              </button>
            ))}
            <label className="grid h-24 w-20 shrink-0 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-border text-muted hover:border-accent hover:text-accent" aria-label="Add photos">
              <ImagePlus className="size-5" /><input type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) add([...e.target.files]); e.target.value = '' }} />
            </label>
            <button type="button" onClick={() => setCamera(true)} className="grid h-24 w-20 shrink-0 place-items-center rounded-lg border-2 border-dashed border-border text-muted hover:border-accent hover:text-accent cursor-pointer" aria-label="Take a photo"><Camera className="size-5" /></button>
          </div>
          {adding.busy && <Progress value={adding.progress} label="Reading photos…" />}
        </div>}
        side={<>
          {page && <>
            <Field label="Look"><Segmented value={page.mode} onChange={(m) => upd({ mode: m })} options={[{ value: 'color', label: 'Color' }, { value: 'gray', label: 'Gray' }, { value: 'bw', label: 'Black & white' }, { value: 'original', label: 'Original' }]} /></Field>
            {page.mode !== 'original' && <Slider label="Cleanup strength" value={Math.round(page.strength * 100)} min={0} max={100} onChange={(v) => upd({ strength: v / 100 })} suffix="%" />}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" icon={<RotateCw className="size-3.5" />} onClick={() => upd({ rot: (page.rot + 90) % 360 })}>Rotate</Button>
              <Button size="sm" variant="ghost" icon={<ArrowLeft className="size-3.5" />} disabled={cur === 0} onClick={() => { setPages((ps) => { const a = [...ps]; [a[cur - 1], a[cur]] = [a[cur], a[cur - 1]]; return a }); setCur(cur - 1) }} aria-label="Move earlier" />
              <Button size="sm" variant="ghost" icon={<ArrowRight className="size-3.5" />} disabled={cur === pages.length - 1} onClick={() => { setPages((ps) => { const a = [...ps]; [a[cur + 1], a[cur]] = [a[cur], a[cur + 1]]; return a }); setCur(cur + 1) }} aria-label="Move later" />
              <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => { setPages((ps) => ps.filter((_, i) => i !== cur)); setCur(Math.max(0, cur - 1)); setResult(null) }}>Delete page</Button>
            </div>
          </>}
          <div className="border-t border-border pt-4" />
          <Field label="PDF page size"><Segmented value={pageSize} onChange={(v) => { setPageSize(v); setResult(null) }} options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }, { value: 'fit', label: 'Fit scan' }]} /></Field>
          <Slider label="Image quality" value={quality} min={50} max={95} onChange={(v) => { setQuality(v); setResult(null) }} suffix="%" />
          <Note>Black and white gives the smallest, crispest text. Run OCR PDF on the result to make the text searchable.</Note>
          {job.busy && <Progress value={job.progress} label="Building PDF…" />}
          <ErrorNote error={job.error || adding.error} />
          <Button className="w-full" size="lg" icon={<ScanLine className="size-5" />} loading={job.busy} disabled={!pages.length} onClick={run}>Save {pages.length} page{pages.length === 1 ? '' : 's'} as PDF</Button>
        </>}
      />
    </div>
  )
}

function CornerEditor({ img, quad, onChange }: { img: ImageData; quad: Quad; onChange: (q: Quad) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [url, setUrl] = useState('')
  const drag = useRef<number | null>(null)
  useEffect(() => {
    const s = Math.min(1, 900 / Math.max(img.width, img.height))
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    c.getContext('2d')!.putImageData(img, 0, 0)
    const d = document.createElement('canvas'); d.width = Math.round(img.width * s); d.height = Math.round(img.height * s)
    d.getContext('2d')!.drawImage(c, 0, 0, d.width, d.height)
    setUrl(d.toDataURL('image/jpeg', 0.8))
  }, [img])
  const toImg = useCallback((e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: Math.max(0, Math.min(img.width, ((e.clientX - r.left) / r.width) * img.width)), y: Math.max(0, Math.min(img.height, ((e.clientY - r.top) / r.height) * img.height)) } }, [img])
  const set = (i: number, p: { x: number; y: number }) => { const q = [...quad] as Quad; q[i] = p; onChange(q) }
  const key = (e: React.KeyboardEvent, i: number) => {
    const step = (e.shiftKey ? 20 : 4) * Math.max(1, img.width / 800)
    const mv: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (mv[e.key]) { e.preventDefault(); set(i, { x: Math.max(0, Math.min(img.width, quad[i].x + mv[e.key][0])), y: Math.max(0, Math.min(img.height, quad[i].y + mv[e.key][1])) }) }
  }
  const pts = quad.map((p) => `${(p.x / img.width) * 100},${(p.y / img.height) * 100}`).join(' ')
  const names = ['top left', 'top right', 'bottom right', 'bottom left']
  return (
    <div ref={ref} className="relative mx-auto w-full touch-none select-none" style={{ aspectRatio: `${img.width} / ${img.height}`, maxHeight: '55vh' }}
      onPointerMove={(e) => { if (drag.current !== null) set(drag.current, toImg(e)) }} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}>
      {url && <img src={url} alt="Photo" className="absolute inset-0 h-full w-full rounded-lg" draggable={false} />}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
        <polygon points={pts} fill="rgba(245,165,36,0.15)" stroke="#F5A524" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
      </svg>
      {quad.map((p, i) => (
        <span key={i} role="slider" tabIndex={0} aria-label={`Corner ${names[i]}`} aria-valuetext={`${Math.round(p.x)}, ${Math.round(p.y)}`}
          onKeyDown={(e) => key(e, i)} onPointerDown={(e) => { e.preventDefault(); (e.target as Element).setPointerCapture(e.pointerId); drag.current = i }}
          className="absolute size-6 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-[3px] border-white bg-accent shadow-lg outline-none ring-accent/40 focus-visible:ring-4 active:cursor-grabbing"
          style={{ left: `${(p.x / img.width) * 100}%`, top: `${(p.y / img.height) * 100}%` }} />
      ))}
    </div>
  )
}

function CameraView({ onShot, onClose, count }: { onShot: (b: Blob) => void; onClose: () => void; count: number }) {
  const video = useRef<HTMLVideoElement>(null)
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    let stream: MediaStream | null = null
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false })
      .then((s) => { stream = s; if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}) } })
      .catch((e) => setErr(e?.name === 'NotAllowedError' ? 'Camera access was blocked. Allow it in your browser settings, or upload photos instead.' : 'No camera found. Upload photos instead.'))
    return () => stream?.getTracks().forEach((t) => t.stop())
  }, [])
  const shoot = () => {
    const v = video.current; if (!v || !v.videoWidth) return
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    c.toBlob((b) => b && onShot(b), 'image/jpeg', 0.92)
    setFlash(true); setTimeout(() => setFlash(false), 150)
  }
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-black">
        {err ? <div className="p-10 text-center text-sm text-white/80">{err}</div> : <video ref={video} playsInline muted className="max-h-[70vh] w-full object-contain" />}
        {flash && <div className="absolute inset-0 bg-white/70" />}
        <div className="absolute left-3 top-3 rounded-lg bg-black/60 px-2 py-1 text-xs text-white">{count} page{count === 1 ? '' : 's'} captured</div>
      </div>
      <div className="flex justify-center gap-2">
        <Button variant="ghost" icon={<X className="size-4" />} onClick={onClose}>{count ? 'Done' : 'Cancel'}</Button>
        {!err && <Button size="lg" icon={<Camera className="size-5" />} onClick={shoot}>Capture page</Button>}
      </div>
      <div className="text-center text-xs text-muted">Hold the page flat on a darker surface with even light. Press capture for each page, then Done.</div>
    </div>
  )
}
