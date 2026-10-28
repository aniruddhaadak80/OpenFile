import { useEffect, useState } from 'react'
import { Paperclip, Download, Trash2, Undo2, Save, FileIcon } from 'lucide-react'
import { Button, Dropzone, ResultCard, ToolGrid, Progress, ErrorNote, Spinner, Input, Empty, cn, useJob } from '@/components/ui'
import { pdfBlob } from '@/lib/pdf'
import { baseName, downloadBlob, formatBytes, zipFiles } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, PDF_ACCEPT } from './_core/kit'
import { core, readBytes, Note } from './_b1/ui'
import type { Attachment } from './_b1/core'

type NewItem = { id: string; file: File; description: string }

export default function PdfAttachments() {
  const [file, setFile] = useState<File | null>(null)
  const [list, setList] = useState<Attachment[] | null>(null)
  const [pages, setPages] = useState(0)
  const [removed, setRemoved] = useState<Set<number>>(new Set())
  const [added, setAdded] = useState<NewItem[]>([])
  const [result, setResult] = useState<Blob | null>(null)
  const job = useJob()
  const reset = () => { setFile(null); setList(null); setRemoved(new Set()); setAdded([]); setResult(null) }

  useEffect(() => {
    if (!file) return
    let c = false
    ;(async () => { const C = await core(); const d = await C.open(await readBytes(file)); if (c) return; setPages(d.getPageCount()); setList(C.listAttachments(d)) })().catch((e) => job.setError(e.message))
    return () => { c = true }
  }, [file]) // eslint-disable-line

  const toggle = (i: number) => { const s = new Set(removed); s.has(i) ? s.delete(i) : s.add(i); setRemoved(s); setResult(null) }
  const save = () => job.run(async (setP) => {
    if (!file || !list) return
    const C = await core(); setP(0.2)
    const docIdx = list.map((a, i) => ({ a, i })).filter((x) => x.a.source === 'document')
    const keep = new Set<number>(); docIdx.forEach((x, k) => { if (!removed.has(x.i)) keep.add(k) })
    const annIdx = list.map((a, i) => ({ a, i })).filter((x) => x.a.source === 'annotation')
    const dropAnn = new Set<number>(); annIdx.forEach((x, k) => { if (removed.has(x.i)) dropAnn.add(k) })
    const add = await Promise.all(added.map(async (n) => ({ name: n.file.name, data: await readBytes(n.file), mime: n.file.type || undefined, description: n.description || undefined })))
    const out = await C.editAttachments(await readBytes(file), keep, add, dropAnn)
    setResult(pdfBlob(out)); setP(1); toast('Attachments saved', 'success')
  })
  const dl = (a: Attachment) => a.data ? downloadBlob(new Blob([a.data as BlobPart], { type: a.mime || 'application/octet-stream' }), a.name) : toast('This attachment has no readable data', 'error')

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to see, extract, add or remove attached files" />
  const changed = removed.size > 0 || added.length > 0
  return (
    <div className="space-y-4">
      <FileBar file={file} pages={pages} onReset={reset} />
      {result && <ResultCard blob={result} filename={`${baseName(file.name)}-attachments.pdf`} originalSize={file.size} title="Updated PDF ready" onReset={reset} />}
      <ToolGrid
        main={<div className="space-y-3">
          {!list ? <Spinner label="Reading attachments…" /> : list.length === 0 && !added.length ? <Empty>This PDF has no attached files yet. Add some on the right.</Empty> : null}
          {list?.map((a, i) => (
            <div key={i} className={cn('flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 transition', removed.has(i) && 'opacity-50')}>
              <div className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent"><Paperclip className="size-5" /></div>
              <div className="min-w-0 flex-1">
                <div className={cn('truncate text-sm font-semibold', removed.has(i) && 'line-through')}>{a.name}</div>
                <div className="text-xs text-muted">{a.size !== undefined ? formatBytes(a.size) : 'size unknown'}{a.mime ? ` · ${a.mime}` : ''}{a.source === 'annotation' ? ` · pinned on page ${(a.page ?? 0) + 1}` : ''}{a.relationship ? ` · ${a.relationship}` : ''}</div>
                {a.description && <div className="mt-0.5 truncate text-xs text-muted">{a.description}</div>}
              </div>
              <Button size="sm" variant="outline" icon={<Download className="size-3.5" />} onClick={() => dl(a)} disabled={!a.data}>Save</Button>
              <Button size="sm" variant="ghost" icon={removed.has(i) ? <Undo2 className="size-3.5" /> : <Trash2 className="size-3.5" />} onClick={() => toggle(i)}>{removed.has(i) ? 'Keep' : 'Remove'}</Button>
            </div>
          ))}
          {added.map((n) => (
            <div key={n.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-success/40 bg-success/5 px-4 py-3">
              <div className="grid size-10 place-items-center rounded-xl bg-success/15 text-success"><FileIcon className="size-5" /></div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="truncate text-sm font-semibold">{n.file.name} <span className="text-xs font-normal text-muted">· {formatBytes(n.file.size)} · new</span></div>
                <Input value={n.description} placeholder="Description (optional)" onChange={(e) => { setAdded((x) => x.map((y) => (y.id === n.id ? { ...y, description: e.target.value } : y))); setResult(null) }} className="h-8" />
              </div>
              <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => { setAdded((x) => x.filter((y) => y.id !== n.id)); setResult(null) }}>Drop</Button>
            </div>
          ))}
        </div>}
        side={<>
          <Dropzone compact multiple onFiles={(fs) => { setAdded((x) => [...x, ...fs.map((f) => ({ id: Math.random().toString(36).slice(2), file: f, description: '' }))]); setResult(null) }} label="Add files to attach" sub="Any file type: spreadsheets, source files, images, XML." />
          {list && list.some((a) => a.data) && <Button variant="outline" className="w-full" icon={<Download className="size-4" />} onClick={async () => downloadBlob(await zipFiles(list.filter((a) => a.data).map((a) => ({ name: a.name, data: a.data! }))), `${baseName(file.name)}-attachments.zip`)}>Extract all as ZIP</Button>}
          <Note>Attachments travel inside the PDF, like email attachments. Most desktop PDF readers show them in a paperclip panel.</Note>
          {job.busy && <Progress value={job.progress} label="Saving…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<Save className="size-5" />} loading={job.busy} disabled={!changed} onClick={save}>Save changes</Button>
        </>}
      />
    </div>
  )
}
