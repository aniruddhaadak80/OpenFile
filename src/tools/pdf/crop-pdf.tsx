import { useEffect, useRef, useState } from 'react'
import { Crop, Wand2, Maximize } from 'lucide-react'
import { Button, Dropzone, Field, Input, ResultCard, Segmented, Switch, ToolGrid, Progress, ErrorNote, Spinner, useJob, Label, cn } from '@/components/ui'
import { pdfBlob, renderPage, type PdfJsDoc } from '@/lib/pdf'
import { baseName, parsePageRanges } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, PDF_ACCEPT, PageStepper, ops, readBytes, usePdfDoc, usePageImage } from './_core/kit'

type M = { l: number; t: number; r: number; b: number } // margins in points (visual page)
type Unit = 'pt' | 'mm' | 'in'
const UNIT: Record<Unit, number> = { pt: 1, mm: 72 / 25.4, in: 72 }
const ZERO: M = { l: 0, t: 0, r: 0, b: 0 }

/** Detect non-white content bounds on a rendered page → margins in points */
async function detect(doc: PdfJsDoc, page: number, pad = 6): Promise<M | null> {
  const p = await doc.getPage(page)
  const vp = p.getViewport({ scale: 1 })
  const scale = Math.min(1.5, 800 / Math.max(vp.width, vp.height))
  const c = await renderPage(doc, page, scale)
  const { data, width: w, height: h } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }
  }
  if (maxX < 0) return null
  const k = 1 / scale
  return { l: Math.max(0, minX * k - pad), t: Math.max(0, minY * k - pad), r: Math.max(0, (w - 1 - maxX) * k - pad), b: Math.max(0, (h - 1 - maxY) * k - pad) }
}

export default function CropPdf() {
  const [file, setFile] = useState<File | null>(null)
  const { doc, numPages, error } = usePdfDoc(file)
  const [page, setPage] = useState(0)
  const img = usePageImage(doc, page + 1, 760)
  const [m, setM] = useState<M>(ZERO)
  const [unit, setUnit] = useState<Unit>('mm')
  const [scope, setScope] = useState<'all' | 'current' | 'range'>('all')
  const [range, setRange] = useState('')
  const [autoEach, setAutoEach] = useState(false)
  const [hard, setHard] = useState(false)
  const [result, setResult] = useState<Blob | null>(null)
  const [detecting, setDetecting] = useState(false)
  const job = useJob()
  const reset = () => { setFile(null); setResult(null); setM(ZERO); setPage(0) }

  const vw = img?.w ?? 1, vh = img?.h ?? 1
  const setMargins = (n: M) => {
    const c = (v: number, max: number) => Math.max(0, Math.min(max, v))
    const l = c(n.l, vw - 10), r = c(n.r, vw - 10 - l), t = c(n.t, vh - 10), b = c(n.b, vh - 10 - t)
    setM({ l, t, r, b }); setResult(null)
  }

  const auto = async () => {
    if (!doc) return
    setDetecting(true)
    try { const d = await detect(doc, page + 1); if (d) setMargins(d); else toast('This page looks blank — nothing to trim', 'info') } finally { setDetecting(false) }
  }

  const run = () => job.run(async (setP) => {
    if (!file || !doc) return
    const targets = scope === 'all' ? null : new Set(scope === 'current' ? [page] : parsePageRanges(range, numPages))
    if (targets && !targets.size) throw new Error('The page range matches no pages.')
    // gather visual sizes (and auto-trim margins) per page
    const per: (import('./_core/ops').CropFrac | null)[] = []
    for (let i = 0; i < numPages; i++) {
      if (targets && !targets.has(i)) { per.push(null); continue }
      const p = await doc.getPage(i + 1); const v = p.getViewport({ scale: 1 })
      let mm = m
      if (autoEach) mm = (await detect(doc, i + 1)) ?? ZERO
      const fr = { l: mm.l / v.width, r: mm.r / v.width, t: mm.t / v.height, b: mm.b / v.height }
      if (fr.l + fr.r > 0.98) fr.r = Math.max(0, 0.98 - fr.l)
      if (fr.t + fr.b > 0.98) fr.b = Math.max(0, 0.98 - fr.t)
      per.push(fr.l || fr.r || fr.t || fr.b ? fr : null)
      setP((i + 1) / numPages * 0.8)
    }
    if (!per.some(Boolean)) throw new Error('Nothing to crop — drag the edges of the crop box or use Auto-detect.')
    const o = await ops()
    setResult(pdfBlob(await o.crop(await readBytes(file), (i) => per[i], hard))); setP(1); toast('Pages cropped', 'success')
  })

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to crop" />

  const toU = (pt: number) => +(pt / UNIT[unit]).toFixed(unit === 'pt' ? 0 : unit === 'mm' ? 1 : 2)
  const fromU = (v: number) => v * UNIT[unit]

  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={reset} />
      {result && <ResultCard blob={result} filename={`${baseName(file.name)}-cropped.pdf`} title="Cropped PDF ready" onReset={reset} />}
      <ToolGrid
        main={<div className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-sm font-medium">Drag the edges or corners to set the crop</div>
            {numPages > 1 && <PageStepper page={page} total={numPages} onChange={setPage} />}
          </div>
          {error ? <div className="text-sm text-danger">{error}</div> : img ? (
            <div className="checker flex justify-center rounded-xl p-4">
              <CropBox src={img.src} w={vw} h={vh} m={autoEach ? ZERO : m} onChange={setMargins} disabled={autoEach} />
            </div>
          ) : <div className="grid min-h-80 place-items-center"><Spinner label="Rendering page…" /></div>}
          {img && <div className="mt-2 text-center text-xs text-muted">Page {page + 1}: {toU(vw)} × {toU(vh)} {unit} → <span className="font-medium text-fg">{toU(vw - m.l - m.r)} × {toU(vh - m.t - m.b)} {unit}</span></div>}
        </div>}
        side={<>
          <div className="flex items-center justify-between">
            <Label className="!mb-0">Margins to remove</Label>
            <Segmented value={unit} onChange={setUnit} options={['mm', 'pt', 'in']} />
          </div>
          <div className={cn('grid grid-cols-2 gap-2', autoEach && 'pointer-events-none opacity-40')}>
            {(['t', 'b', 'l', 'r'] as const).map((k) => (
              <Field key={k} label={{ t: 'Top', b: 'Bottom', l: 'Left', r: 'Right' }[k]}>
                <Input type="number" min={0} step={unit === 'pt' ? 1 : 0.5} value={toU(m[k])} onChange={(e) => setMargins({ ...m, [k]: fromU(Math.max(0, +e.target.value || 0)) })} />
              </Field>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" icon={<Wand2 className="size-4" />} loading={detecting} disabled={autoEach} onClick={auto}>Auto-detect</Button>
            <Button variant="ghost" size="sm" className="flex-1" icon={<Maximize className="size-4" />} onClick={() => setMargins(ZERO)}>Reset</Button>
          </div>
          <Field label="Apply to">
            <Segmented value={scope} onChange={(v) => { setScope(v); setResult(null) }} className="w-full" options={[{ value: 'all', label: 'All pages' }, { value: 'current', label: 'This page' }, { value: 'range', label: 'Range' }]} />
          </Field>
          {scope === 'range' && <Input value={range} onChange={(e) => { setRange(e.target.value); setResult(null) }} placeholder="e.g. 1-3, 5" />}
          <div className="space-y-2.5">
            <Switch checked={autoEach} onChange={(v) => { setAutoEach(v); setResult(null) }} label="Auto-trim whitespace on each page" />
            <Switch checked={hard} onChange={(v) => { setHard(v); setResult(null) }} label="Hard crop (also set MediaBox)" />
          </div>
          <div className="text-xs text-muted">{hard ? 'The page itself is resized — content outside the box is gone in every app.' : 'Sets the CropBox: hidden areas can be restored later by editing tools.'}</div>
          {job.busy && <Progress value={job.progress} label="Cropping…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<Crop className="size-5" />} loading={job.busy} disabled={!numPages} onClick={run}>Crop PDF</Button>
        </>}
      />
    </div>
  )
}

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
function CropBox({ src, w, h, m, onChange, disabled }: { src: string; w: number; h: number; m: M; onChange: (m: M) => void; disabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ h: Handle; x: number; y: number; m: M } | null>(null)
  const latest = useRef(onChange); latest.current = onChange
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current; if (!d || !ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const dx = ((e.clientX - d.x) / rect.width) * w, dy = ((e.clientY - d.y) / rect.height) * h
      const n = { ...d.m }
      if (d.h === 'move') {
        const cw = w - d.m.l - d.m.r, ch = h - d.m.t - d.m.b
        n.l = Math.max(0, Math.min(w - cw, d.m.l + dx)); n.r = w - cw - n.l
        n.t = Math.max(0, Math.min(h - ch, d.m.t + dy)); n.b = h - ch - n.t
      } else {
        if (d.h.includes('w')) n.l = d.m.l + dx
        if (d.h.includes('e')) n.r = d.m.r - dx
        if (d.h.includes('n')) n.t = d.m.t + dy
        if (d.h.includes('s')) n.b = d.m.b - dy
      }
      latest.current(n)
    }
    const up = () => (drag.current = null)
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [w, h])
  const start = (hd: Handle) => (e: React.PointerEvent) => { if (disabled) return; e.preventDefault(); e.stopPropagation(); drag.current = { h: hd, x: e.clientX, y: e.clientY, m } }
  const pct = (v: number, of: number) => `${(v / of) * 100}%`
  const box = { left: pct(m.l, w), top: pct(m.t, h), right: pct(m.r, w), bottom: pct(m.b, h) }
  const handles: [Handle, number, number, string][] = [['nw', 0, 0, 'cursor-nwse-resize'], ['ne', 100, 0, 'cursor-nesw-resize'], ['sw', 0, 100, 'cursor-nesw-resize'], ['se', 100, 100, 'cursor-nwse-resize'],
    ['n', 50, 0, 'cursor-ns-resize'], ['s', 50, 100, 'cursor-ns-resize'], ['w', 0, 50, 'cursor-ew-resize'], ['e', 100, 50, 'cursor-ew-resize']]
  return (
    <div ref={ref} className="relative inline-block max-w-full touch-none select-none" style={{ aspectRatio: `${w} / ${h}`, width: `min(100%, calc(70vh * ${w / h}))` }}>
      <img src={src} alt="Page" draggable={false} className="block h-full w-full bg-white shadow-2xl" />
      {/* dim outside the crop box */}
      <div className="pointer-events-none absolute inset-x-0 top-0 bg-black/45" style={{ height: box.top }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/45" style={{ height: box.bottom }} />
      <div className="pointer-events-none absolute left-0 bg-black/45" style={{ top: box.top, bottom: box.bottom, width: box.left }} />
      <div className="pointer-events-none absolute right-0 bg-black/45" style={{ top: box.top, bottom: box.bottom, width: box.right }} />
      <div className={cn('absolute border-2 border-accent', disabled ? 'opacity-0' : 'cursor-move')} style={box} onPointerDown={start('move')}>
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">{Array.from({ length: 9 }, (_, i) => <div key={i} className="border border-white/25" />)}</div>
        {!disabled && handles.map(([hd, x, y, cls]) => (
          <div key={hd} onPointerDown={start(hd)} className={cn('absolute size-4 rounded-sm border-2 border-white bg-accent shadow', cls)} style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }} />
        ))}
      </div>
    </div>
  )
}
