import { useState } from 'react'
import { FileImage } from 'lucide-react'
import { Button, Dropzone, ResultCard, Segmented, Slider, Switch, ToolGrid, Progress, ErrorNote, Field, Spinner, Input, useJob } from '@/components/ui'
import { renderPage } from '@/lib/pdf'
import { baseName, parsePageRanges, zipFiles } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, PDF_ACCEPT, PageStepper, usePdfDoc, usePageImage } from '../pdf/_core/kit'
import type { TiffColor, TiffCompression } from './_b1/tiff'

export default function PdfToTiff() {
  const [file, setFile] = useState<File | null>(null)
  const { doc, numPages, error } = usePdfDoc(file)
  const [page, setPage] = useState(0)
  const img = usePageImage(doc, page + 1, 560)
  const [dpi, setDpi] = useState(200)
  const [color, setColor] = useState<TiffColor>('rgb')
  const [compression, setCompression] = useState<TiffCompression>('lzw')
  const [threshold, setThreshold] = useState(160)
  const [dither, setDither] = useState(false)
  const [multi, setMulti] = useState(true)
  const [range, setRange] = useState('')
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null)
  const job = useJob()
  const reset = () => { setFile(null); setResult(null); setPage(0) }
  const run = () => job.run(async (setP) => {
    if (!doc || !file) return
    const { encodeTiff } = await import('./_b1/tiff')
    const idx = range.trim() ? parsePageRanges(range, numPages) : Array.from({ length: numPages }, (_, i) => i)
    if (!idx.length) throw new Error('No pages match that range.')
    const opts = { dpi, color, compression, threshold, dither }
    const pages = [] as { width: number; height: number; rgba: Uint8ClampedArray }[]
    const singles: { name: string; data: Uint8Array }[] = []
    for (let k = 0; k < idx.length; k++) {
      const c = await renderPage(doc, idx[k] + 1, dpi / 72)
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
      const pg = { width: c.width, height: c.height, rgba: d.data }
      if (multi) pages.push(pg); else singles.push({ name: `${baseName(file.name)}-page-${idx[k] + 1}.tif`, data: encodeTiff([pg], opts) })
      setP((k + 1) / idx.length * 0.9)
    }
    const blob = multi ? new Blob([encodeTiff(pages, opts) as BlobPart], { type: 'image/tiff' }) : await zipFiles(singles)
    setResult({ blob, name: multi ? `${baseName(file.name)}.tif` : `${baseName(file.name)}-tiff.zip` }); setP(1); toast('TIFF ready', 'success')
  })
  const ch = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setResult(null) }
  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to turn it into a TIFF image" />
  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={reset} />
      {error && <ErrorNote error={error} />}
      {result && <ResultCard blob={result.blob} filename={result.name} title="TIFF ready" onReset={reset} />}
      <ToolGrid
        main={<div className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between"><div className="text-sm font-medium">Preview</div>{numPages > 1 && <PageStepper page={page} total={numPages} onChange={setPage} />}</div>
          <div className="checker flex min-h-80 items-center justify-center rounded-xl p-4">{img ? <img src={img.src} alt="" className="max-h-[70vh] max-w-full bg-white shadow-2xl" style={{ filter: color === 'gray' ? 'grayscale(1)' : color === 'bw' ? `grayscale(1) contrast(${dither ? 1.4 : 8})` : undefined }} /> : <Spinner label="Rendering…" />}</div>
        </div>}
        side={<>
          <Slider label="Resolution" value={dpi} min={72} max={600} step={12} onChange={ch(setDpi)} suffix=" DPI" />
          <Field label="Colors"><Segmented value={color} onChange={ch(setColor)} options={[{ value: 'rgb', label: 'Color' }, { value: 'gray', label: 'Grayscale' }, { value: 'bw', label: 'Black & white' }]} /></Field>
          {color === 'bw' && <><Slider label="Black and white cut-off" value={threshold} min={40} max={240} onChange={ch(setThreshold)} /><Switch checked={dither} onChange={ch(setDither)} label="Dither (better for photos)" /></>}
          <Field label="Compression"><Segmented value={compression} onChange={ch(setCompression)} options={[{ value: 'lzw', label: 'LZW' }, { value: 'deflate', label: 'ZIP' }, { value: 'packbits', label: 'PackBits' }, { value: 'none', label: 'None' }]} /></Field>
          <Switch checked={multi} onChange={ch(setMulti)} label="All pages in one multi-page TIFF" />
          <Field label="Pages (empty for all)"><Input value={range} placeholder="e.g. 1-3, 5" onChange={(e) => { setRange(e.target.value); setResult(null) }} /></Field>
          <div className="rounded-xl bg-surface-2/60 p-3 text-xs leading-relaxed text-muted">LZW is lossless and opens everywhere. Black and white at 200 to 300 DPI is the usual choice for fax and document archives.</div>
          {job.busy && <Progress value={job.progress} label="Rendering pages…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<FileImage className="size-5" />} loading={job.busy} disabled={!numPages} onClick={run}>Convert to TIFF</Button>
        </>}
      />
    </div>
  )
}
