import { useState } from 'react'
import { ArrowDown, ArrowUp, Combine, X } from 'lucide-react'
import { Button, Card, Dropzone, Switch, ResultCard, Progress, ErrorNote, useJob } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { mergeDocx } from '@/lib/cf/docx'

export default function DocxMerger() {
  const [files, setFiles] = useState<File[]>([])
  const [pageBreak, setPageBreak] = useState(true), [sections, setSections] = useState(false), [titles, setTitles] = useState(false)
  const [out, setOut] = useState<Blob | null>(null)
  const job = useJob()
  const move = (i: number, d: number) => setFiles((f) => { const n = [...f]; const j = i + d; if (j < 0 || j >= n.length) return f; [n[i], n[j]] = [n[j], n[i]]; return n })
  const go = () => job.run(async (setP) => { setOut(await mergeDocx(await Promise.all(files.map(async (f) => ({ name: f.name, data: await f.arrayBuffer() }))), { pageBreak, sectionBreaks: sections, titles }, setP)) })
  if (!files.length) return <Dropzone multiple accept=".docx" onFiles={(f) => setFiles(f)} label="Drop two or more Word files (.docx)" sub="Keeps text, tables, images and links. The first file sets the styles, margins, headers and footers." />
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <div className="divide-y divide-border rounded-2xl border border-border bg-surface">{files.map((f, i) => <div key={i + f.name} className="flex items-center gap-2 px-3 py-2"><span className="w-6 text-center font-mono text-xs text-muted">{i + 1}</span><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{f.name}</div><div className="text-xs text-muted">{formatBytes(f.size)}{i === 0 ? ' · sets the styles' : ''}</div></div>
          <button aria-label="Move up" disabled={!i} onClick={() => move(i, -1)} className="rounded p-1 text-muted hover:text-fg disabled:opacity-30 cursor-pointer"><ArrowUp className="size-4" /></button>
          <button aria-label="Move down" disabled={i === files.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-muted hover:text-fg disabled:opacity-30 cursor-pointer"><ArrowDown className="size-4" /></button>
          <button aria-label="Remove" onClick={() => { setFiles(files.filter((_, k) => k !== i)); setOut(null) }} className="rounded p-1 text-muted hover:text-danger cursor-pointer"><X className="size-4" /></button></div>)}</div>
        <Dropzone compact multiple accept=".docx" onFiles={(f) => { setFiles((o) => [...o, ...f]); setOut(null) }} label="Add more Word files" />
        {job.busy && <Progress value={job.progress} label="Merging" />}
        <ErrorNote error={job.error} />
        {out && <ResultCard blob={out} filename="merged.docx" title="Merged document ready" />}
      </div>
      <Card className="space-y-4 self-start">
        <Switch checked={pageBreak} onChange={setPageBreak} label="Start each file on a new page" />
        <Switch checked={sections} onChange={setSections} label="Keep each file's own page setup (section breaks)" />
        <Switch checked={titles} onChange={setTitles} label="Add the file name as a heading" />
        <p className="text-xs text-muted">Comments and footnotes from the second file on are not carried over. Everything else, including images and tables, is.</p>
        <Button className="w-full" icon={<Combine className="size-4" />} disabled={files.length < 2} loading={job.busy} onClick={go}>Merge {files.length} files</Button>
      </Card>
    </div>
  )
}
