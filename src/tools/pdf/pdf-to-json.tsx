import { useState } from 'react'
import { Braces } from 'lucide-react'
import { Button, Dropzone, Switch, ToolGrid, Progress, ErrorNote, useJob, CopyButton, Label } from '@/components/ui'
import { openPdfJs } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { FileBar, PDF_ACCEPT, readBytes, usePdfDoc } from './_core/kit'
import { DlButton } from '@/lib/bcat/kit'
import { Tile } from '@/lib/b14/ui'

const r2 = (n: number) => Math.round(n * 100) / 100

export default function PdfToJson() {
  const [file, setFile] = useState<File | null>(null)
  const { numPages, error } = usePdfDoc(file)
  const [items, setItems] = useState(true)
  const [annots, setAnnots] = useState(true)
  const [lines, setLines] = useState(true)
  const [json, setJson] = useState<string | null>(null)
  const [stats, setStats] = useState<{ pages: number; items: number; annots: number; fields: number } | null>(null)
  const job = useJob()
  const run = () => job.run(async (setP) => {
    if (!file) return
    const doc = await openPdfJs(await readBytes(file))
    const meta: any = await doc.getMetadata().catch(() => ({}))
    const outline = await doc.getOutline().catch(() => null)
    const flat = (o: any[] | null): any[] => (o ?? []).map((x) => ({ title: x.title, dest: typeof x.dest === 'string' ? x.dest : undefined, url: x.url ?? undefined, items: flat(x.items) }))
    const fields: any = await (doc as any).getFieldObjects?.().catch(() => null)
    const pages: any[] = []
    let nItems = 0, nAnn = 0
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i)
      const vp = p.getViewport({ scale: 1 })
      const tc: any = await p.getTextContent()
      const its = (tc.items as any[]).filter((t) => 'str' in t)
      const styles = tc.styles ?? {}
      const page: any = { number: i, width: r2(vp.width), height: r2(vp.height), rotation: p.rotate }
      if (items) page.items = its.filter((t) => t.str.trim()).map((t) => ({ text: t.str, x: r2(t.transform[4]), y: r2(vp.height - t.transform[5]), width: r2(t.width), height: r2(t.height || Math.abs(t.transform[3])), font: styles[t.fontName]?.fontFamily ?? t.fontName, fontSize: r2(Math.hypot(t.transform[2], t.transform[3])) }))
      if (lines) { const rows: { y: number; parts: { x: number; s: string }[] }[] = []; for (const t of its) { if (!t.str.trim()) continue; const y = vp.height - t.transform[5]; let row = rows.find((r) => Math.abs(r.y - y) < 2.5); if (!row) { row = { y, parts: [] }; rows.push(row) } row.parts.push({ x: t.transform[4], s: t.str }) } page.lines = rows.sort((a, b) => a.y - b.y).map((r) => r.parts.sort((a, b) => a.x - b.x).map((x) => x.s).join(' ').replace(/\s+/g, ' ').trim()) }
      if (annots) { const a = await p.getAnnotations(); page.annotations = a.map((x: any) => ({ type: x.subtype, rect: x.rect?.map(r2), url: x.url, contents: x.contentsObj?.str || x.contents || undefined, field: x.fieldName, value: x.fieldValue })); nAnn += a.length }
      nItems += its.length
      pages.push(page); setP(i / doc.numPages)
    }
    const info = meta.info ?? {}
    const out = { file: file.name, pageCount: doc.numPages, metadata: { title: info.Title, author: info.Author, subject: info.Subject, keywords: info.Keywords, creator: info.Creator, producer: info.Producer, created: info.CreationDate, modified: info.ModDate, pdfVersion: info.PDFFormatVersion, encrypted: !!info.IsEncrypted || undefined }, outline: flat(outline), formFields: fields ? Object.fromEntries(Object.entries(fields).map(([k, v]: any) => [k, v.map((f: any) => ({ type: f.type, value: f.value, page: f.page != null ? f.page + 1 : undefined }))])) : {}, pages }
    setJson(JSON.stringify(out, null, 2)); setStats({ pages: doc.numPages, items: nItems, annots: nAnn, fields: fields ? Object.keys(fields).length : 0 })
  })
  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF" sub="Export text with positions and fonts, lines, metadata, bookmarks, links and form fields as JSON for scripts, data pipelines or AI." />
  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={() => { setFile(null); setJson(null); setStats(null) }} />
      <ToolGrid
        main={error ? <div className="text-sm text-danger">{error}</div> : json ? <>
          {stats && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Tile label="Pages" value={stats.pages} /><Tile label="Text items" value={stats.items.toLocaleString()} /><Tile label="Annotations" value={stats.annots} /><Tile label="Form fields" value={stats.fields} /></div>}
          <Label hint={`${(json.length / 1024).toFixed(0)} KB`}>JSON</Label>
          <pre className="scrollbar-thin max-h-[560px] overflow-auto rounded-xl border border-border bg-surface p-3 font-mono text-[11px] leading-4">{json.length > 300000 ? json.slice(0, 300000) + '\n... (download for the full file)' : json}</pre>
        </> : <div className="grid min-h-60 place-items-center rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">Pick what to include, then export.</div>}
        side={<>
          <Switch checked={lines} onChange={(v) => { setLines(v); setJson(null) }} label="Text lines (reading order)" />
          <Switch checked={items} onChange={(v) => { setItems(v); setJson(null) }} label="Text items with x, y, font and size" />
          <Switch checked={annots} onChange={(v) => { setAnnots(v); setJson(null) }} label="Links, comments and fields per page" />
          <p className="text-xs text-muted">Coordinates are in PDF points (1/72 inch) from the top left of each page. Metadata, bookmarks and form fields are always included.</p>
          {job.busy && <Progress value={job.progress} label="Reading pages" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<Braces className="size-5" />} loading={job.busy} disabled={!numPages} onClick={run}>Export JSON</Button>
          {json && <div className="flex gap-2"><CopyButton text={json} /><DlButton name={`${baseName(file.name)}.json`} mime="application/json" data={() => json}>Download</DlButton></div>}
        </>}
      />
    </div>
  )
}
