import { useState } from 'react'
import { FileOutput } from 'lucide-react'
import { Button, Dropzone, Field, ResultCard, Segmented, ToolGrid, Progress, ErrorNote, Spinner, useJob, Label } from '@/components/ui'
import { usePdfThumbs } from '@/components/PdfThumbs'
import { pdfBlob } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, MultiResult, PDF_ACCEPT, SelectGrid, SelectionBar, ops, readBytes, type OutFile } from './_core/kit'

export default function ExtractPdfPages() {
  const [file, setFile] = useState<File | null>(null)
  const { thumbs, numPages, error, loading } = usePdfThumbs(file)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [mode, setMode] = useState<'one' | 'separate'>('one')
  const [result, setResult] = useState<OutFile[] | null>(null)
  const job = useJob()
  const reset = () => { setFile(null); setSel(new Set()); setResult(null) }
  const update = (s: Set<number>) => { setSel(s); setResult(null) }

  const run = () => job.run(async (setP) => {
    if (!file) return
    if (!sel.size) throw new Error('Select at least one page to extract.')
    const o = await ops()
    const bytes = await readBytes(file)
    const idx = [...sel].sort((a, b) => a - b)
    const base = baseName(file.name)
    if (mode === 'one') {
      setResult([{ name: `${base}-extracted.pdf`, blob: pdfBlob(await o.pick(bytes, idx)), pages: idx.length }])
    } else {
      const outs = await o.splitGroups(bytes, idx.map((i) => [i]), setP)
      const pad = String(numPages).length
      setResult(outs.map((b, k) => ({ name: `${base}-page-${String(idx[k] + 1).padStart(pad, '0')}.pdf`, blob: pdfBlob(b), pages: 1 })))
    }
    setP(1); toast(`Extracted ${idx.length} page${idx.length > 1 ? 's' : ''}`, 'success')
  })

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to extract pages from" />

  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={reset} />
      {result && (result.length === 1
        ? <ResultCard blob={result[0].blob} filename={result[0].name} title={`${result[0].pages} page${result[0].pages === 1 ? '' : 's'} extracted`} onReset={reset} />
        : <MultiResult files={result} zipName={`${baseName(file.name)}-pages.zip`} onReset={reset} title={`${result.length} pages extracted`} />)}
      <ToolGrid
        main={<div className="rounded-2xl border border-border bg-surface p-4">
          {error ? <div className="text-sm text-danger">{error}</div> : <>
            {loading && <div className="mb-3"><Spinner label={`Rendering pages… ${thumbs.length}/${numPages || '?'}`} /></div>}
            <SelectGrid thumbs={thumbs} numPages={numPages} selected={sel} setSelected={update} />
          </>}
        </div>}
        side={<>
          <div><Label>Pages to extract</Label><SelectionBar total={numPages} selected={sel} setSelected={update} /></div>
          <Field label="Output">
            <Segmented value={mode} onChange={(m) => { setMode(m); setResult(null) }} className="w-full" options={[{ value: 'one', label: 'One PDF' }, { value: 'separate', label: 'Separate files (ZIP)' }]} />
          </Field>
          {job.busy && <Progress value={job.progress} label="Extracting…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<FileOutput className="size-5" />} loading={job.busy} disabled={!sel.size} onClick={run}>
            {sel.size ? `Extract ${sel.size} page${sel.size > 1 ? 's' : ''}` : 'Select pages to extract'}
          </Button>
        </>}
      />
    </div>
  )
}
