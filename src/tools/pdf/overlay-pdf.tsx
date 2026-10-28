import { useState } from 'react'
import { Layers2 } from 'lucide-react'
import { Button, Dropzone, ResultCard, Segmented, Slider, ToolGrid, Progress, ErrorNote, Field, FileChip, useJob } from '@/components/ui'
import { pdfBlob } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, LivePreview, PDF_ACCEPT, PageScope, scopePages, usePdfDoc } from './_core/kit'
import { core, readBytes, Note } from './_b1/ui'

export default function OverlayPdf() {
  const [file, setFile] = useState<File | null>(null)
  const [ov, setOv] = useState<File | null>(null)
  const [ovBytes, setOvBytes] = useState<Uint8Array | null>(null)
  const { numPages, error } = usePdfDoc(file)
  const ovDoc = usePdfDoc(ov)
  const [mode, setMode] = useState<'over' | 'under'>('under')
  const [repeat, setRepeat] = useState<'first' | 'cycle' | 'match'>('first')
  const [fit, setFit] = useState<'fit' | 'stretch' | 'none'>('stretch')
  const [opacity, setOpacity] = useState(100)
  const [scope, setScope] = useState<'all' | 'range'>('all'), [range, setRange] = useState('')
  const [page, setPage] = useState(0)
  const [result, setResult] = useState<Blob | null>(null)
  const job = useJob()
  const reset = () => { setFile(null); setOv(null); setOvBytes(null); setResult(null); setPage(0) }
  const pickOv = async (f: File) => { setOv(f); setOvBytes(await readBytes(f)); setResult(null) }
  const opts = { mode, repeat, fit, opacity: opacity / 100 }

  const run = () => job.run(async (setP) => {
    if (!file || !ovBytes) return
    const C = await core(); setP(0.3)
    const out = await C.overlayPdf(await readBytes(file), ovBytes, { ...opts, pages: scopePages(scope, range, numPages) })
    setResult(pdfBlob(out)); setP(1); toast('Overlay applied', 'success')
  })
  const ch = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setResult(null) }

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop the main PDF (your content)" sub="Next you add the overlay: a letterhead, stationery, form or stamp PDF." />
  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={reset} />
      {error && <ErrorNote error={error} />}
      {result && <ResultCard blob={result} filename={`${baseName(file.name)}-overlay.pdf`} title="Combined PDF ready" onReset={reset} />}
      <ToolGrid
        main={!ov ? <Dropzone compact accept={PDF_ACCEPT} onFiles={(f) => pickOv(f[0])} label="Now drop the overlay PDF" sub="For example a letterhead whose first page goes behind every page." />
          : numPages && ovBytes ? <LivePreview file={file} total={numPages} pageIndex={page} setPageIndex={setPage} deps={[mode, repeat, fit, opacity, ovBytes]}
            build={async (bytes, idx) => {
              const C = await core()
              // pick the overlay page this base page would get
              const on = ovDoc.numPages || 1
              const k = repeat === 'first' ? 0 : repeat === 'cycle' ? idx % on : idx
              if (k >= on) return bytes
              const { pick } = await import('./_core/ops')
              return C.overlayPdf(bytes, await pick(ovBytes, [k]), { ...opts, repeat: 'first' })
            }} /> : null}
        side={<>
          {ov && <FileChip file={ov} onRemove={() => { setOv(null); setOvBytes(null); setResult(null) }} extra={ovDoc.numPages ? <span className="text-xs text-muted">{ovDoc.numPages} p</span> : null} />}
          <Field label="Place overlay"><Segmented value={mode} onChange={ch(setMode)} options={[{ value: 'under', label: 'Behind content' }, { value: 'over', label: 'On top' }]} /></Field>
          <Field label="Which overlay page"><Segmented value={repeat} onChange={ch(setRepeat)} options={[{ value: 'first', label: 'Page 1 on all' }, { value: 'cycle', label: 'Repeat in turn' }, { value: 'match', label: 'Page by page' }]} /></Field>
          <Field label="Size"><Segmented value={fit} onChange={ch(setFit)} options={[{ value: 'stretch', label: 'Fill page' }, { value: 'fit', label: 'Fit' }, { value: 'none', label: 'Actual size' }]} /></Field>
          <Slider label="Overlay opacity" value={opacity} min={5} max={100} onChange={ch(setOpacity)} suffix="%" />
          <div><div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Apply to</div><PageScope total={numPages} mode={scope} setMode={ch(setScope)} range={range} setRange={ch(setRange)} /></div>
          <Note>Behind content works when your pages have a transparent background, which is normal for PDFs made from Word or other apps. Scanned pages are solid images, so use On top with lower opacity for those.</Note>
          {job.busy && <Progress value={job.progress} label="Combining…" />}
          <ErrorNote error={job.error || ovDoc.error} />
          <Button className="w-full" size="lg" icon={<Layers2 className="size-5" />} loading={job.busy} disabled={!numPages || !ovBytes} onClick={run}>Apply overlay</Button>
        </>}
      />
    </div>
  )
}
