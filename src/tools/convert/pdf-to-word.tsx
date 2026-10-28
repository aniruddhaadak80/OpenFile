import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { FileType, ScanLine, Heading1, Table2, Info } from 'lucide-react'
import { Button, Dropzone, ToolGrid, Label, Switch, Slider, Progress, ErrorNote, ResultCard, Badge, Segmented, useJob } from '@/components/ui'
import { toast } from '@/components/toast'
import { baseName, canvasToBlob } from '@/lib/files'
import { renderPage, type PdfJsDoc } from '@/lib/pdf'
import { FileBar, Reveal, Stat, pdfError } from './_conv/shared'
import { openPdfRich, pageLayout } from './_conv/pdfOpen'
import { groupLines, bodySize, headingSizesOf, buildBlocks, splitTables, type Line, type Block } from './_conv/pdfText'
import { buildDocx, type DocNode } from './_conv/docxBuild'

interface PageInfo { lines: Line[]; width: number; height: number; chars: number; thumb?: string }
type PNode = { type: 'block'; block: Block } | { type: 'table'; rows: string[][] } | { type: 'scan'; page: number }

export default function PdfToWord() {
  const [file, setFile] = useState<File | null>(null)
  const [doc, setDoc] = useState<PdfJsDoc | null>(null)
  const [pages, setPages] = useState<PageInfo[]>([])
  const [headings, setHeadings] = useState(true)
  const [tables, setTables] = useState(true)
  const [keepSizes, setKeepSizes] = useState(false)
  const [breaks, setBreaks] = useState(true)
  const [scanImages, setScanImages] = useState(true)
  const [minChars, setMinChars] = useState(40)
  const [font, setFont] = useState<'Calibri' | 'Times New Roman' | 'Arial'>('Calibri')
  const [result, setResult] = useState<Blob | null>(null)
  const load = useJob()
  const conv = useJob()

  useEffect(() => {
    if (!file) return
    setPages([]); setResult(null); setDoc(null)
    load.run(async (setP) => {
      const d = await openPdfRich(file).catch((e) => { throw new Error(pdfError(e)) })
      setDoc(d)
      const out: PageInfo[] = []
      for (let i = 1; i <= d.numPages; i++) {
        const lay = await pageLayout(d, i, true)
        const info: PageInfo = { lines: groupLines(lay.items), width: lay.width, height: lay.height, chars: lay.chars }
        if (lay.chars < 200) { const c = await renderPage(d, i, 0.6); info.thumb = c.toDataURL('image/jpeg', 0.7) }
        out.push(info)
        setP(i / d.numPages)
      }
      setPages(out)
    })
  }, [file]) // eslint-disable-line

  const { body, hs } = useMemo(() => { const all = pages.flatMap((p) => p.lines); const b = bodySize(all); return { body: b, hs: headings ? headingSizesOf(all, b) : [] } }, [pages, headings])

  const model = useMemo(() => {
    const perPage: PNode[][] = pages.map((p, i) => {
      if (scanImages && p.chars < minChars) return [{ type: 'scan', page: i + 1 }]
      const segs = tables ? splitTables(p.lines, p.width) : [{ type: 'text' as const, lines: p.lines }]
      const out: PNode[] = []
      for (const s of segs) {
        if (s.type === 'table') out.push({ type: 'table', rows: s.rows })
        else for (const b of buildBlocks(s.lines, body, headings ? hs : [], p.width)) out.push({ type: 'block', block: headings ? b : { ...b, kind: b.kind.startsWith('h') ? 'p' : b.kind } })
      }
      return out
    })
    return perPage
  }, [pages, body, hs, headings, tables, scanImages, minChars])

  const stats = useMemo(() => {
    const flat = model.flat()
    return { paras: flat.filter((n) => n.type === 'block' && !n.block.kind.startsWith('h')).length, heads: flat.filter((n) => n.type === 'block' && n.block.kind.startsWith('h')).length, tables: flat.filter((n) => n.type === 'table').length, scans: flat.filter((n) => n.type === 'scan').length }
  }, [model])

  useEffect(() => setResult(null), [model, keepSizes, breaks, font])

  const convert = () => conv.run(async (setP) => {
    if (!doc || !file) return
    const nodes: DocNode[] = []
    for (let i = 0; i < model.length; i++) {
      if (i > 0 && breaks) nodes.push({ type: 'pagebreak' })
      for (const n of model[i]) {
        if (n.type === 'scan') {
          const c = await renderPage(doc, n.page, 2)
          const blob = await canvasToBlob(c, 'image/png')
          nodes.push({ type: 'image', data: new Uint8Array(await blob.arrayBuffer()), w: c.width / 2 * (96 / 72), h: c.height / 2 * (96 / 72) })
          c.width = c.height = 0
        } else nodes.push(n)
      }
      setP(((i + 1) / model.length) * 0.85)
    }
    const first = pages[0]
    const { doc: docx, Packer } = await buildDocx(nodes, { pageW: first?.width ?? 595, pageH: first?.height ?? 842, body, title: baseName(file.name), keepSizes, font })
    const blob = await Packer.toBlob(docx)
    setP(1)
    setResult(blob)
    toast('Word document ready', 'success')
  })

  const reset = () => { setFile(null); setPages([]); setResult(null); setDoc(null) }

  if (!file) return <Dropzone accept="application/pdf,.pdf" onFiles={(f) => setFile(f[0])} label="Drop a PDF to convert to Word (DOCX)" />

  return (
    <div className="space-y-5">
      <FileBar name={file.name} size={file.size} sub={pages.length ? `${pages.length} page${pages.length > 1 ? 's' : ''}` : 'analysing…'} onReset={reset} />
      <ToolGrid
        main={<>
          {load.busy && <Progress value={load.progress} label="Analysing layout, fonts and structure" />}
          <ErrorNote error={load.error} />
          {result && <Reveal k="r"><ResultCard blob={result} filename={`${baseName(file.name)}.docx`} title="Your Word document is ready" onReset={reset} /></Reveal>}
          {pages.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted"><Info className="size-3.5" /> Live preview of the structure that will be written to the DOCX.</div>
              <div className="max-h-[70vh] space-y-4 overflow-auto rounded-2xl border border-border bg-surface-2/60 p-3 scrollbar-thin sm:p-5">
                {model.map((nodes, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.4) }} className="mx-auto max-w-[720px] rounded-md bg-white px-6 py-7 text-[13px] leading-relaxed text-neutral-800 shadow-lg ring-1 ring-black/5 sm:px-10" style={{ fontFamily: font === 'Times New Roman' ? 'Times New Roman, serif' : font === 'Arial' ? 'Arial, sans-serif' : 'Calibri, Carlito, Segoe UI, sans-serif' }}>
                    <div className="mb-3 text-right font-mono text-[10px] text-neutral-400">Page {i + 1}</div>
                    {nodes.length === 0 && <div className="py-8 text-center text-neutral-400">Empty page</div>}
                    {nodes.map((n, k) => {
                      if (n.type === 'scan') return <div key={k} className="space-y-2 text-center">{pages[i].thumb ? <img src={pages[i].thumb} alt="" className="mx-auto max-h-80 rounded shadow" /> : null}<div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] text-amber-800"><ScanLine className="size-3" />Scanned page, inserted as an image</div></div>
                      if (n.type === 'table') return (
                        <div key={k} className="my-3 overflow-x-auto"><table className="w-full border-collapse text-[12px]"><tbody>{n.rows.map((r, ri) => <tr key={ri} className={ri === 0 ? 'bg-neutral-100 font-semibold' : ''}>{r.map((c, ci) => <td key={ci} className="border border-neutral-300 px-2 py-1">{c}</td>)}</tr>)}</tbody></table></div>
                      )
                      const b = n.block
                      const content = b.runs.map((r, ri) => <span key={ri} className={`${r.bold ? 'font-bold' : ''} ${r.italic ? 'italic' : ''}`}>{r.text}</span>)
                      const style = { textAlign: b.align === 'center' ? 'center' as const : undefined, fontSize: keepSizes && !b.kind.startsWith('h') && Math.abs(b.size - body) > 1 ? `${(b.size / body) * 13}px` : undefined, paddingLeft: b.kind === 'p' && b.indent > 12 ? Math.min(b.indent, 144) * 0.6 : undefined }
                      if (b.kind === 'h1') return <h1 key={k} style={style} className="mb-2 mt-4 text-2xl font-bold text-[#1f3864]">{b.text}</h1>
                      if (b.kind === 'h2') return <h2 key={k} style={style} className="mb-2 mt-3 text-xl font-semibold text-[#2f5496]">{b.text}</h2>
                      if (b.kind === 'h3') return <h3 key={k} style={style} className="mb-1.5 mt-3 text-base font-semibold text-[#2f5496]">{b.text}</h3>
                      if (b.kind === 'li') return <div key={k} style={style} className="my-1 flex gap-2 pl-4"><span>•</span><span>{content}</span></div>
                      return <p key={k} style={style} className="my-2">{content}</p>
                    })}
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </>}
        side={<>
          <div className="grid grid-cols-2 gap-2"><Stat label="Headings" value={stats.heads} /><Stat label="Paragraphs" value={stats.paras} /><Stat label="Tables" value={stats.tables} /><Stat label="Scanned" value={stats.scans} /></div>
          <div className="space-y-3">
            <Switch checked={headings} onChange={setHeadings} label={<span className="inline-flex items-center gap-1.5"><Heading1 className="size-4 text-muted" />Detect headings (by font size)</span>} />
            <Switch checked={tables} onChange={setTables} label={<span className="inline-flex items-center gap-1.5"><Table2 className="size-4 text-muted" />Rebuild tables</span>} />
            <Switch checked={keepSizes} onChange={setKeepSizes} label="Keep original font sizes" />
            <Switch checked={breaks} onChange={setBreaks} label="Page break after each PDF page" />
            <Switch checked={scanImages} onChange={setScanImages} label={<span className="inline-flex items-center gap-1.5"><ScanLine className="size-4 text-muted" />Insert scanned pages as images</span>} />
            {scanImages && <Slider label="Treat page as scanned below" value={minChars} onChange={setMinChars} min={5} max={200} step={5} suffix=" chars" />}
          </div>
          <div><Label>Body font</Label><Segmented value={font} onChange={setFont} options={['Calibri', 'Arial', 'Times New Roman']} /></div>
          {stats.scans > 0 && <div className="flex gap-2 rounded-xl bg-warn/10 px-3 py-2 text-[11px] text-warn"><Badge color="#f59e0b">TIP</Badge>Scanned pages become images. Run OCR PDF first for editable text.</div>}
          {conv.busy && <Progress value={conv.progress} label="Building DOCX" />}
          <ErrorNote error={conv.error} />
          <Button size="lg" className="w-full" loading={conv.busy} disabled={!pages.length || load.busy} icon={<FileType className="size-5" />} onClick={convert}>Convert to Word</Button>
        </>}
      />
    </div>
  )
}
