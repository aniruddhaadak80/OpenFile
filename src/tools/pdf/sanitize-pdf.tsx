import { useEffect, useState } from 'react'
import { ShieldCheck, Check } from 'lucide-react'
import { Button, Dropzone, ResultCard, Switch, ToolGrid, Progress, ErrorNote, Spinner, useJob } from '@/components/ui'
import { pdfBlob } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, PDF_ACCEPT } from './_core/kit'
import { core, readBytes, Note, CheckList, type Check as Chk } from './_b1/ui'
import type { SanitizeOpts, StructReport } from './_b1/core'

const OPTS: { key: keyof SanitizeOpts; label: string; hint: string }[] = [
  { key: 'javascript', label: 'JavaScript', hint: 'Scripts that run when the file opens or when you click.' },
  { key: 'actions', label: 'Risky actions', hint: 'Launching programs, sending form data, opening other files.' },
  { key: 'embeddedFiles', label: 'Embedded files and media', hint: 'Attached files, videos, sounds and 3D content.' },
  { key: 'metadata', label: 'Metadata', hint: 'Author, software, dates, XMP and private app data.' },
  { key: 'links', label: 'Links', hint: 'Web links and links to other places.' },
  { key: 'annotations', label: 'Comments and markup', hint: 'Notes, highlights, stamps and drawings.' },
  { key: 'forms', label: 'Form fields', hint: 'Fillable fields. Field values are dropped too.' },
  { key: 'layers', label: 'Hidden layers', hint: 'Content in layers that are switched off.' },
  { key: 'thumbnails', label: 'Embedded thumbnails', hint: 'Old preview images that can show earlier content.' },
]

export default function SanitizePdf() {
  const [file, setFile] = useState<File | null>(null)
  const [info, setInfo] = useState<StructReport | null>(null)
  const [o, setO] = useState<SanitizeOpts>({ javascript: true, actions: true, embeddedFiles: true, metadata: true, links: false, annotations: false, forms: false, layers: true, thumbnails: true })
  const [result, setResult] = useState<{ blob: Blob; report: Record<string, number> } | null>(null)
  const job = useJob()
  const reset = () => { setFile(null); setInfo(null); setResult(null) }
  useEffect(() => {
    if (!file) return
    ;(async () => { const C = await core(); const b = await readBytes(file); setInfo(C.inspectStructure(await C.open(b), b)) })().catch((e) => job.setError(e.message))
  }, [file]) // eslint-disable-line
  const run = () => job.run(async (setP) => {
    if (!file) return
    const C = await core(); setP(0.3)
    const r = await C.sanitize(await readBytes(file), o)
    setResult({ blob: pdfBlob(r.bytes), report: r.report }); setP(1); toast('PDF sanitized', 'success')
  })
  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to strip hidden and active content" />
  const found: Chk[] = info ? [
    { level: info.javascript ? 'fail' : 'pass', title: info.javascript ? 'Contains JavaScript' : 'No JavaScript found' },
    { level: info.actions.some((a) => a !== 'URI') ? 'warn' : 'pass', title: info.actions.length ? `Actions: ${info.actions.join(', ')}` : 'No special actions' },
    { level: info.attachments ? 'warn' : 'pass', title: info.attachments ? `${info.attachments} embedded file${info.attachments > 1 ? 's' : ''}` : 'No embedded files' },
    { level: Object.keys(info.info).length || info.xmp ? 'info' : 'pass', title: Object.keys(info.info).length ? `Metadata: ${Object.keys(info.info).join(', ')}${info.xmp ? ', XMP' : ''}` : info.xmp ? 'XMP metadata' : 'No metadata' },
    { level: info.layers ? 'info' : 'pass', title: info.layers ? `${info.layers} layer${info.layers > 1 ? 's' : ''}` : 'No layers' },
    { level: 'info', title: `${info.annotations.Link ?? 0} links, ${Object.entries(info.annotations).filter(([k]) => k !== 'Link' && k !== 'Widget').reduce((s, [, n]) => s + n, 0)} annotations, ${info.formFields} form fields` },
  ] : []
  return (
    <div className="space-y-4">
      <FileBar file={file} pages={info?.pages} onReset={reset} />
      {result && <ResultCard blob={result.blob} filename={`${baseName(file.name)}-sanitized.pdf`} originalSize={file.size} title="Sanitized PDF ready" onReset={reset}>
        {Object.keys(result.report).length ? <ul className="space-y-1 text-sm">{Object.entries(result.report).map(([k, n]) => <li key={k} className="flex gap-2"><Check className="mt-0.5 size-4 text-success" />{k}: {n}</li>)}</ul> : <div className="text-sm text-muted">Nothing matching your choices was found. The file was rewritten cleanly.</div>}
      </ResultCard>}
      <ToolGrid
        main={<div className="space-y-3"><div className="text-sm font-medium">What is inside this file</div>{info ? <CheckList checks={found} /> : <Spinner label="Scanning…" />}</div>}
        side={<>
          <div className="space-y-3">
            {OPTS.map((x) => <div key={x.key}><Switch checked={o[x.key]} onChange={(b) => { setO({ ...o, [x.key]: b }); setResult(null) }} label={x.label} /><div className="ml-[3.4rem] text-xs text-muted">{x.hint}</div></div>)}
          </div>
          <Note>Page text and images are kept. Removing hidden layers deletes their content for good rather than just switching it on.</Note>
          {job.busy && <Progress value={job.progress} label="Cleaning…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<ShieldCheck className="size-5" />} loading={job.busy} onClick={run}>Sanitize PDF</Button>
        </>}
      />
    </div>
  )
}
