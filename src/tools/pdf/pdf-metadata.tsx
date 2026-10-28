import { useEffect, useState } from 'react'
import { Info, Save, Eraser, FileText, Lock, Layers, Ruler, Tag } from 'lucide-react'
import { Button, Dropzone, Field, Input, ResultCard, Textarea, ToolGrid, Progress, ErrorNote, Spinner, useJob, Badge, CopyButton } from '@/components/ui'
import { pdfBlob } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, PDF_ACCEPT, friendly, ops, readBytes, motion } from './_core/kit'
import type { Meta } from './_core/ops'

type Info = Awaited<ReturnType<typeof import('./_core/ops')['readMeta']>>
const pad = (n: number) => String(n).padStart(2, '0')
const toLocal = (d: Date | null) => (d && !isNaN(+d) ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` : '')
const fromLocal = (s: string) => (s ? new Date(s) : null)
const FIELDS: [keyof Meta, string, string][] = [['title', 'Title', 'Document title'], ['author', 'Author', 'Who wrote it'], ['subject', 'Subject', 'What it is about'], ['creator', 'Creator (application)', 'e.g. Microsoft Word'], ['producer', 'Producer', 'e.g. OpenFile']]

export default function PdfMetadata() {
  const [file, setFile] = useState<File | null>(null)
  const [info, setInfo] = useState<Info | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [result, setResult] = useState<{ blob: Blob; stripped: boolean } | null>(null)
  const job = useJob()
  const reset = () => { setFile(null); setInfo(null); setMeta(null); setResult(null); setLoadErr(null) }

  useEffect(() => {
    if (!file) return
    let cancel = false
    ;(async () => {
      try { const o = await ops(); const i = await o.readMeta(await readBytes(file)); if (!cancel) { setInfo(i); setMeta({ ...i.meta }) } }
      catch (e) { if (!cancel) setLoadErr(friendly(e)) }
    })()
    return () => { cancel = true }
  }, [file])

  const set = (k: keyof Meta, v: any) => { setMeta((m) => (m ? { ...m, [k]: v } : m)); setResult(null) }
  const changed = !!(info && meta && JSON.stringify(info.meta) !== JSON.stringify(meta))

  const saveMeta = (strip: boolean) => job.run(async (setP) => {
    if (!file || !meta) return
    if (info?.encrypted) throw new Error('This PDF is encrypted. Unlock it first, then edit its metadata.')
    const o = await ops()
    const out = await o.writeMeta(await readBytes(file), strip ? null : meta)
    setResult({ blob: pdfBlob(out), stripped: strip }); setP(1)
    toast(strip ? 'All metadata removed' : 'Metadata saved', 'success')
  })

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to view or edit its metadata" />

  return (
    <div className="space-y-4">
      <FileBar file={file} pages={info?.pages} onReset={reset} />
      {result && <ResultCard blob={result.blob} filename={`${baseName(file.name)}${result.stripped ? '-clean' : ''}.pdf`} title={result.stripped ? 'Metadata removed' : 'Metadata updated'} onReset={reset} />}
      {loadErr ? <ErrorNote error={loadErr} /> : !meta || !info ? <div className="grid min-h-60 place-items-center"><Spinner label="Reading metadata…" /></div> : (
        <ToolGrid
          main={<motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-surface p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><Info className="size-4 text-accent" />Document properties</div>
            <div className="grid gap-4 sm:grid-cols-2">
              {FIELDS.map(([k, l, ph]) => (
                <Field key={k} label={l} className={k === 'title' ? 'sm:col-span-2' : ''}>
                  <Input value={meta[k] as string} placeholder={ph} onChange={(e) => set(k, e.target.value)} />
                </Field>
              ))}
              <Field label="Keywords" hint="comma-separated" className="sm:col-span-2">
                <Textarea value={meta.keywords} onChange={(e) => set('keywords', e.target.value)} className="!min-h-16 font-sans" placeholder="invoice, 2026, client" />
              </Field>
              <Field label="Created"><Input type="datetime-local" value={toLocal(meta.created)} onChange={(e) => set('created', fromLocal(e.target.value))} /></Field>
              <Field label="Modified"><div className="flex gap-1.5"><Input type="datetime-local" value={toLocal(meta.modified)} onChange={(e) => set('modified', fromLocal(e.target.value))} /><Button variant="outline" size="sm" className="h-10 shrink-0" onClick={() => set('modified', new Date())}>Now</Button></div></Field>
            </div>
            {meta.keywords && <div className="flex flex-wrap gap-1.5">{meta.keywords.split(/[,;]+/).map((k) => k.trim()).filter(Boolean).map((k, i) => <Badge key={i}>{k}</Badge>)}</div>}
          </motion.div>}
          side={<>
            <div className="space-y-2.5 text-sm">
              <Row icon={FileText} k="PDF version" v={info.version} />
              <Row icon={Layers} k="Pages" v={String(info.pages)} />
              {info.pageSize && <Row icon={Ruler} k="Page size" v={`${Math.round(info.pageSize[0])} × ${Math.round(info.pageSize[1])} pt (${(info.pageSize[0] / 72 * 25.4).toFixed(0)} × ${(info.pageSize[1] / 72 * 25.4).toFixed(0)} mm)`} />}
              <Row icon={Lock} k="Encrypted" v={info.encrypted ? 'Yes' : 'No'} />
              <Row icon={Tag} k="XMP metadata" v={info.hasXmp ? 'Present' : 'None'} />
              <Row icon={Info} k="Form fields" v={String(info.hasForm)} />
            </div>
            <CopyButton label="Copy as JSON" text={() => JSON.stringify({ ...meta, created: meta.created?.toISOString() ?? null, modified: meta.modified?.toISOString() ?? null, pages: info.pages, version: info.version }, null, 2)} />
            {info.hasXmp && <div className="text-xs text-muted">Saving replaces the embedded XMP packet so every reader shows your new values.</div>}
            {job.busy && <Progress value={job.progress} label="Saving…" />}
            <ErrorNote error={job.error} />
            <Button className="w-full" size="lg" icon={<Save className="size-5" />} loading={job.busy} disabled={!changed} onClick={() => saveMeta(false)}>{changed ? 'Save metadata' : 'No changes yet'}</Button>
            <Button className="w-full" variant="outline" icon={<Eraser className="size-4" />} disabled={job.busy} onClick={() => saveMeta(true)}>Remove all metadata</Button>
          </>}
        />
      )}
    </div>
  )
}

function Row({ icon: Icon, k, v }: { icon: any; k: string; v: string }) {
  return <div className="flex items-start gap-2.5"><Icon className="mt-0.5 size-4 shrink-0 text-muted" /><div className="flex-1 text-muted">{k}</div><div className="text-right font-medium">{v}</div></div>
}
