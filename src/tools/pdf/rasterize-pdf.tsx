import { useState } from 'react'
import { ImageDown } from 'lucide-react'
import { Button, Dropzone, ResultCard, Segmented, Slider, Switch, ToolGrid, Progress, ErrorNote, Field, Spinner, useJob } from '@/components/ui'
import { pdfBlob, rasterizePdf } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, PDF_ACCEPT, PageStepper, usePdfDoc, usePageImage } from './_core/kit'
import { Note } from './_b1/ui'

export default function RasterizePdf() {
  const [file, setFile] = useState<File | null>(null)
  const { doc, numPages, error } = usePdfDoc(file)
  const [page, setPage] = useState(0)
  const img = usePageImage(doc, page + 1, 640)
  const [dpi, setDpi] = useState(150)
  const [format, setFormat] = useState<'jpeg' | 'png'>('jpeg')
  const [quality, setQuality] = useState(85)
  const [gray, setGray] = useState(false)
  const [result, setResult] = useState<Blob | null>(null)
  const job = useJob()
  const reset = () => { setFile(null); setResult(null); setPage(0) }
  const run = () => job.run(async (setP) => {
    if (!file) return
    const out = await rasterizePdf(file, {
      scale: dpi / 72, type: format === 'png' ? 'image/png' : 'image/jpeg', quality: quality / 100, onProgress: setP,
      transform: gray ? (ctx, c) => { const d = ctx.getImageData(0, 0, c.width, c.height); const a = d.data; for (let i = 0; i < a.length; i += 4) { const y = a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114; a[i] = a[i + 1] = a[i + 2] = y } ctx.putImageData(d, 0, 0) } : undefined,
    })
    setResult(pdfBlob(out)); toast('Every page is now an image', 'success')
  })
  const ch = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setResult(null) }
  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to turn every page into an image" />
  const estPx = img ? `${Math.round(img.w / 72 * dpi)} × ${Math.round(img.h / 72 * dpi)} px per page` : ''
  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={reset} />
      {error && <ErrorNote error={error} />}
      {result && <ResultCard blob={result} filename={`${baseName(file.name)}-image-only.pdf`} originalSize={file.size} title="Image-only PDF ready" onReset={reset} />}
      <ToolGrid
        main={<div className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between"><div className="text-sm font-medium">Original</div>{numPages > 1 && <PageStepper page={page} total={numPages} onChange={setPage} />}</div>
          <div className="checker flex min-h-80 items-center justify-center rounded-xl p-4">{img ? <img src={img.src} alt="" className="max-h-[70vh] max-w-full bg-white shadow-2xl" style={{ filter: gray ? 'grayscale(1)' : undefined }} /> : <Spinner label="Rendering…" />}</div>
        </div>}
        side={<>
          <Slider label="Resolution" value={dpi} min={50} max={400} step={10} onChange={ch(setDpi)} suffix=" DPI" />
          <div className="-mt-3 text-xs text-muted">{estPx}</div>
          <Field label="Image format"><Segmented value={format} onChange={ch(setFormat)} options={[{ value: 'jpeg', label: 'JPEG (smaller)' }, { value: 'png', label: 'PNG (lossless)' }]} /></Field>
          {format === 'jpeg' && <Slider label="JPEG quality" value={quality} min={40} max={100} onChange={ch(setQuality)} suffix="%" />}
          <Switch checked={gray} onChange={ch(setGray)} label="Grayscale" />
          <Note>Text can no longer be selected, searched or copied, and hidden content, layers and form logic are gone. Useful before sharing or printing a file exactly as it looks.</Note>
          {job.busy && <Progress value={job.progress} label="Rendering pages…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<ImageDown className="size-5" />} loading={job.busy} disabled={!numPages} onClick={run}>Rasterize PDF</Button>
        </>}
      />
    </div>
  )
}
