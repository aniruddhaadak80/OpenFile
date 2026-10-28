import { useEffect, useState } from 'react'
import { Layers, FormInput, MessageSquare, Image as ImageIcon, Check } from 'lucide-react'
import { Button, Dropzone, ResultCard, Slider, Switch, ToolGrid, Progress, ErrorNote, Spinner, useJob } from '@/components/ui'
import { pdfBlob, rasterizePdf } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, PDF_ACCEPT, PageStepper, ops, readBytes, usePdfDoc, usePageImage, motion } from './_core/kit'

export default function FlattenPdf() {
  const [file, setFile] = useState<File | null>(null)
  const { doc, numPages, error } = usePdfDoc(file)
  const [page, setPage] = useState(0)
  const img = usePageImage(doc, page + 1, 640)
  const [stats, setStats] = useState<{ fields: number; annots: number } | null>(null)
  const [annots, setAnnots] = useState(true)
  const [raster, setRaster] = useState(false)
  const [dpi, setDpi] = useState(150)
  const [result, setResult] = useState<Blob | null>(null)
  const [report, setReport] = useState<string[]>([])
  const job = useJob()
  const reset = () => { setFile(null); setResult(null); setStats(null); setReport([]); setPage(0) }

  useEffect(() => {
    if (!doc) return
    let cancel = false
    ;(async () => {
      let a = 0, f = 0
      for (let i = 1; i <= doc.numPages; i++) {
        const list = await (await doc.getPage(i)).getAnnotations()
        for (const x of list as any[]) { if (x.subtype === 'Widget') f++; else if (x.subtype !== 'Link' && x.subtype !== 'Popup') a++ }
      }
      if (!cancel) setStats({ fields: f, annots: a })
    })().catch(() => {})
    return () => { cancel = true }
  }, [doc])

  const run = () => job.run(async (setP) => {
    if (!file) return
    const o = await ops()
    const r = await o.flatten(await readBytes(file), { annotations: annots })
    setP(raster ? 0.2 : 0.9)
    let out = r.bytes
    const log = [...r.report]
    if (raster) {
      out = await rasterizePdf(out, { scale: dpi / 72, quality: 0.9, onProgress: (p) => setP(0.2 + p * 0.78) })
      log.push(`Every page rasterized at ${dpi} DPI (text is no longer selectable)`)
    }
    setReport(log); setResult(pdfBlob(out)); setP(1); toast('PDF flattened', 'success')
  })

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF with forms or annotations" />

  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={reset} />
      {result && <ResultCard blob={result} filename={`${baseName(file.name)}-flattened.pdf`} originalSize={file.size} title="Flattened PDF ready" onReset={reset}>
        <ul className="space-y-1 text-sm">{report.map((l, i) => <li key={i} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" />{l}</li>)}</ul>
      </ResultCard>}
      <ToolGrid
        main={<div className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between"><div className="text-sm font-medium">Original</div>{numPages > 1 && <PageStepper page={page} total={numPages} onChange={setPage} />}</div>
          {error ? <div className="text-sm text-danger">{error}</div> : <div className="checker flex min-h-80 items-center justify-center rounded-xl p-4">
            {img ? <img src={img.src} alt="" className="max-h-[70vh] max-w-full bg-white shadow-2xl" /> : <Spinner label="Rendering…" />}
          </div>}
        </div>}
        side={<>
          <div className="grid grid-cols-2 gap-2">
            {[[FormInput, 'Form fields', stats?.fields], [MessageSquare, 'Annotations', stats?.annots]].map(([Icon, l, v]: any) => (
              <motion.div key={l} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl bg-surface-2/60 p-3">
                <Icon className="size-4 text-accent" />
                <div className="mt-1 text-xl font-bold">{v ?? '…'}</div><div className="text-xs text-muted">{l}</div>
              </motion.div>
            ))}
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 text-sm"><span className="grid size-6 place-items-center rounded-full bg-success/15 text-success"><Check className="size-3.5" /></span>Form fields are always flattened</div>
            <Switch checked={annots} onChange={(v) => { setAnnots(v); setResult(null) }} label="Burn in annotations (comments, highlights, stamps)" />
            <Switch checked={raster} onChange={(v) => { setRaster(v); setResult(null) }} label={<span className="inline-flex items-center gap-1.5"><ImageIcon className="size-3.5" />Rasterize pages (maximum lock-down)</span>} />
          </div>
          {raster && <Slider label="Raster resolution" value={dpi} min={72} max={300} step={6} onChange={(v) => { setDpi(v); setResult(null) }} suffix=" DPI" />}
          <div className="rounded-xl bg-surface-2/60 p-3 text-xs leading-relaxed text-muted">
            Field values and annotations become ordinary page content that can't be edited. Links are kept. Rasterizing also turns all text into an image so nothing can be extracted.
          </div>
          {job.busy && <Progress value={job.progress} label="Flattening…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<Layers className="size-5" />} loading={job.busy} disabled={!numPages} onClick={run}>Flatten PDF</Button>
        </>}
      />
    </div>
  )
}
