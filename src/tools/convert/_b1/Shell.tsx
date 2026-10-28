/* Shared shell for PDF → text-document converters (Markdown, HTML, EPUB, RTF, ODF). */
import React, { useEffect, useMemo, useState } from 'react'
import { Button, Dropzone, ToolGrid, Switch, Slider, Progress, ErrorNote, ResultCard, useJob } from '@/components/ui'
import { renderPage, type PdfJsDoc } from '@/lib/pdf'
import { baseName, canvasToBlob } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, Stat } from '../_conv/shared'
import { loadLayout, buildModel, type PageInfo, type PNode, type ModelOpts } from './extract'
import type { PageImage } from './writers'

export interface BuildCtx { doc: PdfJsDoc; pages: PageInfo[]; model: PNode[][]; title: string; author: string; images: Map<number, PageImage>; setP: (p: number) => void; renderImage: (page: number, scale: number, type?: 'image/png' | 'image/jpeg') => Promise<PageImage> }
export interface ShellProps {
  label: string; icon: React.ReactNode; action: string; ext: string | ((ctx: { model: PNode[][] }) => string)
  options?: React.ReactNode; optionDeps?: unknown[]
  /** default model options */
  defaults?: Partial<ModelOpts>
  /** hide model options not used by this format */
  hideModelOptions?: boolean
  preview?: (model: PNode[][], title: string) => React.ReactNode
  build: (ctx: BuildCtx) => Promise<Blob>
  note?: React.ReactNode
}

export function PdfConvertShell(p: ShellProps) {
  const [file, setFile] = useState<File | null>(null)
  const [doc, setDoc] = useState<PdfJsDoc | null>(null)
  const [pages, setPages] = useState<PageInfo[]>([])
  const [headings, setHeadings] = useState(p.defaults?.headings ?? true)
  const [tables, setTables] = useState(p.defaults?.tables ?? true)
  const [scanImages, setScanImages] = useState(p.defaults?.scanImages ?? true)
  const [dropRepeating, setDropRepeating] = useState(p.defaults?.dropRepeating ?? true)
  const [minChars, setMinChars] = useState(p.defaults?.minChars ?? 30)
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null)
  const load = useJob(), conv = useJob()
  const reset = () => { setFile(null); setDoc(null); setPages([]); setResult(null) }

  useEffect(() => {
    if (!file) return
    load.run(async (setP) => { const r = await loadLayout(file, setP); setDoc(r.doc); setPages(r.pages) })
  }, [file]) // eslint-disable-line
  const model = useMemo(() => buildModel(pages, { headings, tables, scanImages, minChars, dropRepeating }), [pages, headings, tables, scanImages, minChars, dropRepeating])
  const stats = useMemo(() => { const f = model.flat(); return { heads: f.filter((n) => n.type === 'block' && n.block.kind.startsWith('h')).length, paras: f.filter((n) => n.type === 'block' && !n.block.kind.startsWith('h')).length, tables: f.filter((n) => n.type === 'table').length, scans: f.filter((n) => n.type === 'scan').length } }, [model])
  useEffect(() => setResult(null), [model, ...(p.optionDeps ?? [])]) // eslint-disable-line
  const title = file ? baseName(file.name).replace(/[-_]+/g, ' ') : ''

  const renderImage = async (page: number, scale: number, type: 'image/png' | 'image/jpeg' = 'image/png'): Promise<PageImage> => {
    const c = await renderPage(doc!, page, scale)
    const blob = await canvasToBlob(c, type, type === 'image/jpeg' ? 0.85 : undefined)
    return { page, name: `page-${String(page).padStart(3, '0')}.${type === 'image/png' ? 'png' : 'jpg'}`, data: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height, mime: type }
  }
  const run = () => conv.run(async (setP) => {
    if (!doc || !file) return
    const images = new Map<number, PageImage>()
    const scans = model.flat().filter((n): n is Extract<PNode, { type: 'scan' }> => n.type === 'scan')
    for (let i = 0; i < scans.length; i++) { images.set(scans[i].page, await renderImage(scans[i].page, 2, 'image/jpeg')); setP((i + 1) / Math.max(1, scans.length) * 0.5) }
    let author = ''
    try { const md: any = await doc.getMetadata(); author = md?.info?.Author ?? '' } catch { /* */ }
    const blob = await p.build({ doc, pages, model, title, author, images, setP: (x) => setP(0.5 + x * 0.5), renderImage })
    const ext = typeof p.ext === 'function' ? p.ext({ model }) : p.ext
    setResult({ blob, name: `${baseName(file.name)}.${ext}` }); setP(1); toast('Converted', 'success')
  })

  if (!file) return <Dropzone accept="application/pdf,.pdf" onFiles={(f) => setFile(f[0])} label={p.label} />
  return (
    <div className="space-y-4">
      <FileBar name={file.name} size={file.size} sub={pages.length ? `${pages.length} pages` : undefined} onReset={reset} />
      {load.busy && <Progress value={load.progress} label="Reading text and layout…" />}
      <ErrorNote error={load.error} />
      {result && <ResultCard blob={result.blob} filename={result.name} title="Converted file ready" onReset={reset} />}
      {pages.length > 0 && <ToolGrid
        main={<div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Headings" value={stats.heads} /><Stat label="Paragraphs" value={stats.paras} /><Stat label="Tables" value={stats.tables} /><Stat label="Image pages" value={stats.scans} /></div>
          {p.preview?.(model, title)}
        </div>}
        side={<>
          {!p.hideModelOptions && <div className="space-y-3">
            <Switch checked={headings} onChange={setHeadings} label="Detect headings" />
            <Switch checked={tables} onChange={setTables} label="Detect tables" />
            <Switch checked={dropRepeating} onChange={setDropRepeating} label="Skip running headers, footers and page numbers" />
            <Switch checked={scanImages} onChange={setScanImages} label="Keep pages without text as images" />
            {scanImages && <Slider label="Treat as image page below" value={minChars} min={0} max={300} step={10} onChange={setMinChars} suffix=" chars" />}
          </div>}
          {p.options}
          {p.note && <div className="rounded-xl bg-surface-2/60 p-3 text-xs leading-relaxed text-muted">{p.note}</div>}
          {conv.busy && <Progress value={conv.progress} label="Converting…" />}
          <ErrorNote error={conv.error} />
          <Button className="w-full" size="lg" icon={p.icon} loading={conv.busy} onClick={run}>{p.action}</Button>
        </>}
      />}
    </div>
  )
}

export function TextPreview({ text, label = 'Preview' }: { text: string; label?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed scrollbar-thin">{text.length > 60000 ? text.slice(0, 60000) + '\n\n… (preview cut short, the file has everything)' : text}</pre>
    </div>
  )
}
export function HtmlPreview({ html }: { html: string }) {
  return <div className="overflow-hidden rounded-2xl border border-border bg-white"><iframe title="Preview" sandbox="" srcDoc={html} className="h-[65vh] w-full" /></div>
}
