import { useEffect, useState } from 'react'
import { Archive, Check } from 'lucide-react'
import { Button, Dropzone, ResultCard, Segmented, Switch, ToolGrid, Progress, ErrorNote, Field, Input, Slider, Spinner, useJob } from '@/components/ui'
import { pdfBlob, rasterizePdf } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, PDF_ACCEPT } from './_core/kit'
import { readBytes, Note, CheckList, Score } from './_b1/ui'
import type { Finding, PdfaLevel } from './_b1/pdfa'

export default function PdfToPdfa() {
  const [file, setFile] = useState<File | null>(null)
  const [before, setBefore] = useState<Finding[] | null>(null)
  const [level, setLevel] = useState<PdfaLevel>('2b')
  const [strict, setStrict] = useState(false)
  const [dpi, setDpi] = useState(200)
  const [title, setTitle] = useState(''), [author, setAuthor] = useState('')
  const [result, setResult] = useState<{ blob: Blob; fixed: string[]; remaining: Finding[] } | null>(null)
  const job = useJob()
  const reset = () => { setFile(null); setBefore(null); setResult(null) }

  useEffect(() => {
    if (!file) return
    ;(async () => {
      const m = await import('./_b1/pdfa'); const C = await import('./_b1/core')
      const b = await readBytes(file)
      const d = await C.open(b); setTitle(d.getTitle() || baseName(file.name)); setAuthor(d.getAuthor() || '')
      const f = await m.validatePdfa(b, level)
      setBefore(f)
      if (f.some((x) => /not embedded|transparency/i.test(x.title) && x.level === 'fail')) setStrict(true)
    })().catch((e) => job.setError(e.message))
  }, [file]) // eslint-disable-line

  const run = () => job.run(async (setP) => {
    if (!file) return
    const m = await import('./_b1/pdfa')
    let bytes: Uint8Array = await readBytes(file)
    if (strict) bytes = await rasterizePdf(bytes, { scale: dpi / 72, quality: 0.9, onProgress: (p) => setP(p * 0.8) })
    setP(0.85)
    const r = await m.convertToPdfa(bytes, level, { title, author })
    const fixed = strict ? [`Rendered every page as an image at ${dpi} DPI (fonts and transparency no longer matter)`, ...r.report.fixed] : r.report.fixed
    setResult({ blob: pdfBlob(r.bytes), fixed, remaining: r.report.remaining }); setP(1)
    toast(r.report.remaining.some((x) => x.level === 'fail') ? 'Converted with issues left, see the list' : 'PDF/A file ready', r.report.remaining.some((x) => x.level === 'fail') ? 'info' : 'success')
  })
  const ch = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setResult(null) }
  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to convert it to PDF/A for long-term archiving" />
  return (
    <div className="space-y-4">
      <FileBar file={file} onReset={reset} />
      {result && <ResultCard blob={result.blob} filename={`${baseName(file.name)}-pdfa-${level}.pdf`} originalSize={file.size} title={`PDF/A-${level.toUpperCase()} file ready`} onReset={reset}>
        <ul className="space-y-1 text-sm">{result.fixed.map((f, i) => <li key={i} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" />{f}</li>)}</ul>
        {result.remaining.length > 0 && <div className="mt-3 space-y-2"><div className="text-sm font-semibold">Still to check</div><CheckList checks={result.remaining.map((r) => ({ level: r.level, title: r.title, detail: r.detail, fix: r.fix }))} /></div>}
      </ResultCard>}
      <ToolGrid
        main={<div className="space-y-3">
          <div className="text-sm font-medium">Archiving check of the original</div>
          {before ? <><Score checks={before} label="PDF/A readiness" /><CheckList checks={before.map((r) => ({ level: r.level, title: r.title, detail: r.detail, fix: r.fix }))} /></> : <Spinner label="Checking…" />}
        </div>}
        side={<>
          <Field label="Standard"><Segmented value={level} onChange={ch(setLevel)} options={[{ value: '1b', label: 'PDF/A-1b' }, { value: '2b', label: 'PDF/A-2b' }, { value: '3b', label: 'PDF/A-3b' }]} /></Field>
          <div className="-mt-3 text-xs text-muted">{level === '1b' ? 'Oldest and strictest: no transparency, layers or attachments.' : level === '2b' ? 'Most common choice. Allows transparency and layers.' : 'Like 2b, but keeps attached files (used for e-invoices).'}</div>
          <Field label="Title"><Input value={title} onChange={(e) => { setTitle(e.target.value); setResult(null) }} /></Field>
          <Field label="Author"><Input value={author} onChange={(e) => { setAuthor(e.target.value); setResult(null) }} /></Field>
          <Switch checked={strict} onChange={ch(setStrict)} label="Strict mode: render pages as images" />
          {strict && <Slider label="Image resolution" value={dpi} min={100} max={400} step={10} onChange={ch(setDpi)} suffix=" DPI" />}
          <Note>Without strict mode, text stays selectable, but fonts that are not embedded in the original cannot be added here. Strict mode solves font and transparency problems at the cost of selectable text (run OCR PDF later if needed). This is a careful best effort: confirm with a certified validator when the law requires it.</Note>
          {job.busy && <Progress value={job.progress} label="Converting…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<Archive className="size-5" />} loading={job.busy} disabled={!before} onClick={run}>Convert to PDF/A</Button>
        </>}
      />
    </div>
  )
}
