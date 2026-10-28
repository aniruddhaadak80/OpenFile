import { useEffect, useMemo, useState } from 'react'
import { Grid3x3 } from 'lucide-react'
import { Button, Dropzone, ResultCard, Segmented, Select, Slider, Switch, ToolGrid, Progress, ErrorNote, Field, Spinner, useJob } from '@/components/ui'
import { pdfBlob } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, PDF_ACCEPT, PageStepper, usePdfDoc, usePageImage } from './_core/kit'
import { core, readBytes, Note } from './_b1/ui'
import { SHEETS, posterLayout } from './_b1/core'

const MM = 72 / 25.4

export default function PdfPoster() {
  const [file, setFile] = useState<File | null>(null)
  const { doc, numPages, error } = usePdfDoc(file)
  const [page, setPage] = useState(0)
  const img = usePageImage(doc, page + 1, 640)
  const [cols, setCols] = useState(2), [rows, setRows] = useState(2)
  const [sheet, setSheet] = useState('a4')
  const [landscape, setLandscape] = useState(false)
  const [margin, setMargin] = useState(10)
  const [overlap, setOverlap] = useState(10)
  const [marks, setMarks] = useState(true)
  const [labels, setLabels] = useState(true)
  const [byScale, setByScale] = useState(false)
  const [scalePct, setScalePct] = useState(200)
  const [result, setResult] = useState<Blob | null>(null)
  const job = useJob()
  const reset = () => { setFile(null); setResult(null); setPage(0) }
  useEffect(() => setResult(null), [cols, rows, sheet, landscape, margin, overlap, marks, labels, page])

  // when sizing by scale, work out how many sheets are needed
  useEffect(() => {
    if (!byScale || !img) return
    let [W, H] = SHEETS[sheet]; if (landscape ? W < H : W > H) [W, H] = [H, W]
    const cw = W - 2 * margin * MM - overlap * MM, chh = H - 2 * margin * MM - overlap * MM
    const pw = img.w * scalePct / 100, ph = img.h * scalePct / 100
    setCols(Math.max(1, Math.min(10, Math.ceil((pw - overlap * MM) / cw)))); setRows(Math.max(1, Math.min(10, Math.ceil((ph - overlap * MM) / chh))))
  }, [byScale, scalePct, img, sheet, landscape, margin, overlap])

  const layout = useMemo(() => img ? posterLayout({ cols, rows, sheet: SHEETS[sheet], landscape, margin: margin * MM, overlap: overlap * MM }, img.w, img.h) : null, [img, cols, rows, sheet, landscape, margin, overlap])

  const run = () => job.run(async (setP) => {
    if (!file) return
    const C = await core(); setP(0.3)
    const out = await C.makePoster(await readBytes(file), { page, cols, rows, sheet: SHEETS[sheet], landscape, margin: margin * MM, overlap: overlap * MM, marks, labels })
    setResult(pdfBlob(out)); setP(1); toast(`Poster split over ${cols * rows} sheets`, 'success')
  })

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to print as a large poster" />
  const finalW = layout ? (layout.posterW / MM / 10).toFixed(1) : '?', finalH = layout ? (layout.posterH / MM / 10).toFixed(1) : '?'
  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={reset} />
      {error && <ErrorNote error={error} />}
      {result && <ResultCard blob={result} filename={`${baseName(file.name)}-poster-${cols}x${rows}.pdf`} title={`${cols * rows} sheets ready to print`} onReset={reset} />}
      <ToolGrid
        main={<div className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-2"><div className="text-sm font-medium">Poster layout · about {finalW} × {finalH} cm</div>{numPages > 1 && <PageStepper page={page} total={numPages} onChange={setPage} />}</div>
          <div className="checker flex min-h-80 items-center justify-center rounded-xl p-4">
            {img && layout ? (
              <div className="relative max-h-[70vh] w-full" style={{ aspectRatio: `${cols * (layout.cw) - (cols - 1) * overlap * MM} / ${rows * layout.ch - (rows - 1) * overlap * MM}`, maxWidth: 640 }}>
                <img src={img.src} alt="Page" className="absolute bg-white shadow-xl" style={{ left: `${(layout.offX / (cols * layout.cw - (cols - 1) * overlap * MM)) * 100}%`, top: `${(layout.offY / (rows * layout.ch - (rows - 1) * overlap * MM)) * 100}%`, width: `${(layout.posterW / (cols * layout.cw - (cols - 1) * overlap * MM)) * 100}%` }} />
                <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
                  {Array.from({ length: rows * cols }, (_, i) => <div key={i} className="grid place-items-center border border-dashed border-accent/80 text-xs font-bold text-accent"><span className="rounded bg-black/60 px-1.5 py-0.5 text-white">{String.fromCharCode(65 + Math.floor(i / cols))}{(i % cols) + 1}</span></div>)}
                </div>
              </div>) : <Spinner label="Rendering…" />}
          </div>
        </div>}
        side={<>
          <Field label="Size by"><Segmented value={byScale ? 's' : 'g'} onChange={(v) => setByScale(v === 's')} options={[{ value: 'g', label: 'Number of sheets' }, { value: 's', label: 'Scale' }]} /></Field>
          {byScale ? <Slider label="Enlarge to" value={scalePct} min={110} max={1000} step={10} onChange={setScalePct} suffix="%" />
            : <div className="grid grid-cols-2 gap-3"><Slider label="Across" value={cols} min={1} max={10} onChange={setCols} /><Slider label="Down" value={rows} min={1} max={10} onChange={setRows} /></div>}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Sheet"><Select value={sheet} onChange={setSheet} options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }, { value: 'a3', label: 'A3' }, { value: 'legal', label: 'Legal' }, { value: 'tabloid', label: 'Tabloid' }]} /></Field>
            <Field label="Turn"><Select value={landscape ? 'l' : 'p'} onChange={(v) => setLandscape(v === 'l')} options={[{ value: 'p', label: 'Portrait' }, { value: 'l', label: 'Landscape' }]} /></Field>
          </div>
          <Slider label="Printer margin" value={margin} min={0} max={25} onChange={setMargin} suffix=" mm" />
          <Slider label="Overlap for gluing" value={overlap} min={0} max={30} onChange={setOverlap} suffix=" mm" />
          <div className="space-y-3"><Switch checked={marks} onChange={setMarks} label="Cut marks and overlap lines" /><Switch checked={labels} onChange={setLabels} label="Label each sheet (A1, A2…)" /></div>
          <Note>Print at 100% (actual size), trim along the marks, then line up the dashed overlap lines. Vector content stays sharp at any size.</Note>
          {job.busy && <Progress value={job.progress} label="Tiling…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<Grid3x3 className="size-5" />} loading={job.busy} disabled={!numPages} onClick={run}>Create poster sheets</Button>
        </>}
      />
    </div>
  )
}
