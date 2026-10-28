import { useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { Button, Dropzone, ResultCard, ToolGrid, Progress, ErrorNote, Spinner, useJob, Label } from '@/components/ui'
import { usePdfThumbs } from '@/components/PdfThumbs'
import { pdfBlob } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, PDF_ACCEPT, SelectGrid, SelectionBar, ops, readBytes } from './_core/kit'

export default function DeletePdfPages() {
  const [file, setFile] = useState<File | null>(null)
  const { thumbs, numPages, error, loading } = usePdfThumbs(file)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [result, setResult] = useState<Blob | null>(null)
  const job = useJob()
  const reset = () => { setFile(null); setSel(new Set()); setResult(null) }
  const keep = numPages - sel.size

  const run = () => job.run(async (setP) => {
    if (!file) return
    if (!sel.size) throw new Error('Click the pages you want to delete first.')
    if (!keep) throw new Error('You cannot delete every page — keep at least one.')
    const o = await ops()
    const out = await o.pick(await readBytes(file), Array.from({ length: numPages }, (_, i) => i).filter((i) => !sel.has(i)))
    setResult(pdfBlob(out)); setP(1); toast(`Removed ${sel.size} page${sel.size > 1 ? 's' : ''}`, 'success')
  })

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to remove pages from" />

  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={reset} />
      {result && <ResultCard blob={result} filename={`${baseName(file.name)}-trimmed.pdf`} originalSize={file.size} title={`${keep} page${keep === 1 ? '' : 's'} kept`} onReset={reset} />}
      <ToolGrid
        main={<div className="rounded-2xl border border-border bg-surface p-4">
          {error ? <div className="text-sm text-danger">{error}</div> : <>
            {loading && <div className="mb-3"><Spinner label={`Rendering pages… ${thumbs.length}/${numPages || '?'}`} /></div>}
            <SelectGrid thumbs={thumbs} numPages={numPages} selected={sel} setSelected={(s) => { setSel(s); setResult(null) }} dimSelected
              overlay={(i) => sel.has(i) ? <div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="grid size-10 place-items-center rounded-full bg-danger text-white shadow-lg"><X className="size-5" /></div></div> : null}
              labels={(i) => sel.has(i) ? <span className="text-danger line-through">Page {i + 1}</span> : `Page ${i + 1}`} />
          </>}
        </div>}
        side={<>
          <div><Label>Pages to delete</Label><SelectionBar total={numPages} selected={sel} setSelected={(s) => { setSel(s); setResult(null) }} /></div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-danger/10 p-3"><div className="text-2xl font-bold text-danger">{sel.size}</div><div className="text-xs text-muted">to delete</div></div>
            <div className="rounded-xl bg-success/10 p-3"><div className="text-2xl font-bold text-success">{keep}</div><div className="text-xs text-muted">remaining</div></div>
          </div>
          {job.busy && <Progress value={job.progress} label="Removing pages…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" variant={sel.size ? 'danger' : 'primary'} icon={<Trash2 className="size-5" />} loading={job.busy} disabled={!sel.size || !keep} onClick={run}>
            {sel.size ? `Delete ${sel.size} page${sel.size > 1 ? 's' : ''}` : 'Select pages to delete'}
          </Button>
        </>}
      />
    </div>
  )
}
