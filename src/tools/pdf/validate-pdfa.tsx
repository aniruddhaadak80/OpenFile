import { useEffect, useState } from 'react'
import { BadgeCheck } from 'lucide-react'
import { Dropzone, Progress, ErrorNote, Segmented, Field, Spinner, ToolGrid, useJob } from '@/components/ui'
import { FileBar, PDF_ACCEPT } from './_core/kit'
import { readBytes, Note, CheckList, Score } from './_b1/ui'
import type { Finding, PdfaLevel } from './_b1/pdfa'

export default function ValidatePdfa() {
  const [file, setFile] = useState<File | null>(null)
  const [level, setLevel] = useState<PdfaLevel | 'auto'>('auto')
  const [res, setRes] = useState<Finding[] | null>(null)
  const job = useJob()
  useEffect(() => {
    if (!file) return
    setRes(null)
    job.run(async () => { const m = await import('./_b1/pdfa'); setRes(await m.validatePdfa(await readBytes(file), level === 'auto' ? undefined : level)) })
  }, [file, level]) // eslint-disable-line
  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to check it against PDF/A rules" />
  return (
    <div className="space-y-4">
      <FileBar file={file} onReset={() => { setFile(null); setRes(null) }} />
      <ToolGrid
        main={<div className="space-y-3">
          {job.busy && <Progress value={job.progress} label="Checking…" />}
          <ErrorNote error={job.error} />
          {res ? <><Score checks={res} label="PDF/A check" /><CheckList checks={res.map((r) => ({ level: r.level, title: r.title, detail: r.detail, fix: r.fix }))} /></> : !job.error && <Spinner label="Reading…" />}
        </div>}
        side={<>
          <Field label="Check against"><Segmented value={level} onChange={setLevel} options={[{ value: 'auto', label: 'What it claims' }, { value: '1b', label: '1b' }, { value: '2b', label: '2b' }, { value: '3b', label: '3b' }]} /></Field>
          <Note>Checks the archiving rules that most often fail: PDF/A identification, encryption, embedded fonts, color profile, scripts and forbidden actions, attachments, transparency, metadata and printable annotations. Fix problems with PDF to PDF/A.</Note>
          <div className="flex items-center justify-center gap-1 text-xs text-muted"><BadgeCheck className="size-3" />Runs fully in your browser.</div>
        </>}
      />
    </div>
  )
}
