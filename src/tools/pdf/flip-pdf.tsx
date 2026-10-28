import { useState } from 'react'
import { FlipHorizontal2 } from 'lucide-react'
import { Button, Dropzone, ResultCard, Switch, ToolGrid, Progress, ErrorNote, useJob } from '@/components/ui'
import { pdfBlob } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, LivePreview, PDF_ACCEPT, PageScope, scopePages, usePdfDoc } from './_core/kit'
import { core, readBytes, Note } from './_b1/ui'

export default function FlipPdf() {
  const [file, setFile] = useState<File | null>(null)
  const { numPages, error } = usePdfDoc(file)
  const [horizontal, setH] = useState(true)
  const [vertical, setV] = useState(false)
  const [mode, setMode] = useState<'all' | 'range'>('all'), [range, setRange] = useState('')
  const [page, setPage] = useState(0)
  const [result, setResult] = useState<Blob | null>(null)
  const job = useJob()
  const reset = () => { setFile(null); setResult(null); setPage(0) }
  const run = () => job.run(async (setP) => {
    if (!file) return
    const C = await core(); setP(0.3)
    const out = await C.flipPages(await readBytes(file), { horizontal, vertical, pages: scopePages(mode, range, numPages) })
    setResult(pdfBlob(out)); setP(1); toast('Pages mirrored', 'success')
  })
  const ch = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setResult(null) }
  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to mirror its pages" />
  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={reset} />
      {error && <ErrorNote error={error} />}
      {result && <ResultCard blob={result} filename={`${baseName(file.name)}-mirrored.pdf`} originalSize={file.size} title="Mirrored PDF ready" onReset={reset} />}
      <ToolGrid
        main={numPages ? <LivePreview file={file} total={numPages} pageIndex={page} setPageIndex={setPage} deps={[horizontal, vertical]}
          build={async (bytes) => { const C = await core(); return C.flipPages(bytes, { horizontal, vertical }) }} /> : null}
        side={<>
          <div className="space-y-3">
            <Switch checked={horizontal} onChange={ch(setH)} label="Mirror left to right" />
            <Switch checked={vertical} onChange={ch(setV)} label="Mirror top to bottom" />
          </div>
          <div><div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Pages</div><PageScope total={numPages} mode={mode} setMode={ch(setMode)} range={range} setRange={ch(setRange)} /></div>
          <Note>Handy for iron-on transfers, back-lit prints and scans made through glass. Content stays vector, so print quality does not drop. Turning on both options is the same as rotating by 180 degrees.</Note>
          {job.busy && <Progress value={job.progress} label="Mirroring…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<FlipHorizontal2 className="size-5" />} loading={job.busy} disabled={!numPages || (!horizontal && !vertical)} onClick={run}>Mirror pages</Button>
        </>}
      />
    </div>
  )
}
