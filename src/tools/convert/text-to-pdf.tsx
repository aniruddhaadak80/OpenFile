import { useEffect, useMemo, useRef, useState } from 'react'
import { Upload, FileDown, Languages, Loader2 } from 'lucide-react'
import { Button, ToolGrid, Label, Select, Segmented, Slider, Switch, Input, Progress, ErrorNote, ResultCard, Badge, useJob, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { PdfPreview, Stat, pageDims, mm, useDebounced, type PageSizeKey } from './_conv/shared'
import { renderHtmlToPdf, pdfToBlob } from './_conv/htmlPdf'

type Font = 'helvetica' | 'times' | 'courier'
interface Opts { text: string; font: Font; size: number; lineHeight: number; marginMm: number; page: PageSizeKey; orient: 'portrait' | 'landscape'; title: string; header: boolean; pageNumbers: boolean; lineNumbers: boolean; align: 'left' | 'justify' }

const nonLatin1 = (s: string) => /[^\u0000-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026\u20ac]/.test(s)

async function buildVector(o: Opts) {
  const { jsPDF } = await import('jspdf')
  const d = pageDims(o.page, o.orient)
  const pdf = new jsPDF({ unit: 'pt', format: [d.w, d.h], orientation: o.orient, compress: true })
  const m = mm(o.marginMm)
  const headerH = o.header && o.title ? o.size + 16 : 0
  const footerH = o.pageNumbers ? 18 : 0
  const lh = o.size * o.lineHeight
  const gutter = o.lineNumbers ? pdf.setFont('courier', 'normal').setFontSize(o.size * 0.8).getTextWidth('00000') + 6 : 0
  const textW = d.w - m * 2 - gutter
  pdf.setFont(o.font, 'normal'); pdf.setFontSize(o.size)
  const top = m + headerH, bottom = d.h - m - footerH
  let y = top + o.size
  let first = true
  const src = o.text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ')
  const pages = src.split('\f')
  const newPage = () => { if (!first) pdf.addPage([d.w, d.h], o.orient); first = false; y = top + o.size }
  newPage()
  let lineNo = 0
  pages.forEach((chunk, pi) => {
    if (pi > 0) newPage()
    for (const para of chunk.split('\n')) {
      lineNo++
      const wrapped: string[] = para.length ? pdf.splitTextToSize(para, textW) : ['']
      wrapped.forEach((ln, wi) => {
        if (y > bottom) newPage()
        pdf.setFont(o.font, 'normal'); pdf.setFontSize(o.size); pdf.setTextColor('#111111')
        const last = wi === wrapped.length - 1
        if (o.align === 'justify' && !last && ln.trim().includes(' ')) pdf.text(ln, m + gutter, y, { align: 'justify', maxWidth: textW })
        else pdf.text(ln, m + gutter, y)
        if (o.lineNumbers && wi === 0) { pdf.setFont('courier', 'normal'); pdf.setFontSize(o.size * 0.8); pdf.setTextColor('#9aa0ad'); pdf.text(String(lineNo), m + gutter - 6, y, { align: 'right' }) }
        y += lh
      })
    }
  })
  const n = pdf.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i)
    if (headerH) { pdf.setFont(o.font, 'bold'); pdf.setFontSize(o.size + 1); pdf.setTextColor('#222222'); pdf.text(o.title, m, m + o.size); pdf.setDrawColor('#cccccc'); pdf.setLineWidth(0.5); pdf.line(m, m + o.size + 6, d.w - m, m + o.size + 6) }
    if (o.pageNumbers) { pdf.setFont(o.font, 'normal'); pdf.setFontSize(Math.max(7, o.size - 2)); pdf.setTextColor('#888888'); pdf.text(`Page ${i} of ${n}`, d.w / 2, d.h - m / 2 - 2, { align: 'center' }) }
  }
  pdf.setProperties({ title: o.title || 'Text', creator: 'OpenFile' })
  return { blob: pdfToBlob(pdf), pages: n }
}

async function buildUnicode(o: Opts, onProgress?: (p: number) => void) {
  const d = pageDims(o.page, o.orient)
  const m = mm(o.marginMm)
  const fam = o.font === 'times' ? "'Times New Roman',Tinos,'Noto Serif',serif" : o.font === 'courier' ? "'Courier New',Cousine,'Noto Sans Mono',monospace" : "Helvetica,Arial,'Noto Sans',sans-serif"
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const lines = o.text.replace(/\r\n?/g, '\n').split('\f').map((chunk) => chunk.split('\n').map((l) => `<div class="l">${esc(l) || '&nbsp;'}</div>`).join('')).join('<div style="break-before:page"></div>')
  const css = `body{font-family:${fam};font-size:${o.size}pt;line-height:${o.lineHeight};color:#111;white-space:pre-wrap;word-wrap:break-word;tab-size:4;text-align:${o.align};}${o.lineNumbers ? `body{counter-reset:ln;}.l{position:relative;padding-left:3.2em;}.l::before{counter-increment:ln;content:counter(ln);position:absolute;left:0;width:2.6em;text-align:right;color:#9aa0ad;font-size:.8em;}` : ''}`
  const head = o.header && o.title ? o.size + 16 : 0
  const { pdf, pages } = await renderHtmlToPdf(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}${css}</style></head><body>${lines}</body></html>`, { pageWidth: d.w, pageHeight: d.h, margin: { top: m + head, bottom: m + (o.pageNumbers ? 18 : 0), left: m, right: m }, onProgress })
  const n = pdf.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i)
    if (head && !nonLatin1(o.title)) { pdf.setFont('helvetica', 'bold'); pdf.setFontSize(o.size + 1); pdf.setTextColor('#222222'); pdf.text(o.title, m, m + o.size); pdf.setDrawColor('#cccccc'); pdf.line(m, m + o.size + 6, d.w - m, m + o.size + 6) }
    if (o.pageNumbers) { pdf.setFont('helvetica', 'normal'); pdf.setFontSize(Math.max(7, o.size - 2)); pdf.setTextColor('#888888'); pdf.text(`Page ${i} of ${n}`, d.w / 2, d.h - m / 2 - 2, { align: 'center' }) }
  }
  return { blob: pdfToBlob(pdf), pages }
}

export default function TextToPdf() {
  const [text, setText] = useState('')
  const [font, setFont] = useState<Font>('helvetica')
  const [size, setSize] = useState(11)
  const [lineHeight, setLineHeight] = useState(1.45)
  const [marginMm, setMarginMm] = useState(20)
  const [page, setPage] = useState<PageSizeKey>('a4')
  const [orient, setOrient] = useState<'portrait' | 'landscape'>('portrait')
  const [title, setTitle] = useState('')
  const [header, setHeader] = useState(false)
  const [pageNumbers, setPageNumbers] = useState(true)
  const [lineNumbers, setLineNumbers] = useState(false)
  const [align, setAlign] = useState<'left' | 'justify'>('left')
  const [preview, setPreview] = useState<{ blob: Blob; pages: number } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { busy, progress, error, run } = useJob()
  const unicode = useMemo(() => nonLatin1(text), [text])
  const opts: Opts = { text, font, size, lineHeight, marginMm, page, orient, title: title || 'Untitled', header, pageNumbers, lineNumbers, align }
  const key = useDebounced(JSON.stringify(opts), 450)

  // live vector preview (fast); Unicode text is rendered on export
  useEffect(() => {
    if (!text.trim() || unicode) { setPreview(null); return }
    let off = false
    setPreviewing(true)
    buildVector(JSON.parse(key)).then((r) => { if (!off) setPreview(r) }).catch(() => {}).finally(() => { if (!off) setPreviewing(false) })
    return () => { off = true }
  }, [key, unicode]) // eslint-disable-line

  const [unicodeResult, setUnicodeResult] = useState<{ blob: Blob; pages: number } | null>(null)
  useEffect(() => setUnicodeResult(null), [key])
  const exportUnicode = () => run(async (setP) => { setUnicodeResult(await buildUnicode(opts, setP)); toast('PDF ready', 'success') })

  const onFile = async (f?: File) => { if (!f) return; setText(await f.text()); if (!title) setTitle(f.name.replace(/\.[^.]+$/, '')) }
  const words = (text.match(/\S+/g) ?? []).length
  const outName = `${(title || 'text').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'text'}.pdf`
  const result = unicode ? unicodeResult : preview

  return (
    <ToolGrid
      main={<>
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="flex items-center gap-2 border-b border-border bg-surface-2/40 px-3 py-1.5">
            <input ref={fileRef} type="file" accept=".txt,.text,.log,.csv,.md,.json,.xml,.yml,.yaml,.ini,.cfg,text/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
            <Button size="sm" variant="ghost" icon={<Upload className="size-3.5" />} onClick={() => fileRef.current?.click()}>Open .txt</Button>
            <span className="ml-auto font-mono text-[10px] text-muted">{text.length.toLocaleString()} chars · {words.toLocaleString()} words · use form-feed (\f) for page breaks</span>
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Type or paste text, or drop a .txt file here…" spellCheck={false}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const f = e.dataTransfer.files[0]; if (f) { e.preventDefault(); onFile(f) } }}
            className={cn('h-72 w-full resize-y bg-transparent p-4 text-[13px] leading-relaxed text-fg outline-none scrollbar-thin', font === 'courier' ? 'font-mono' : font === 'times' ? 'font-serif' : 'font-sans')} />
        </div>
        {unicode && <div className="flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm"><Languages className="mt-0.5 size-4 shrink-0 text-accent" /><div>Non-Latin characters detected, this text will be rendered with your system fonts for full Unicode support (pages are images, not selectable text).</div></div>}
        {result ? <>
          <ResultCard blob={result.blob} filename={outName} title={`${result.pages} page${result.pages > 1 ? 's' : ''}`} />
          <PdfPreview blob={result.blob} height={620} />
        </> : text.trim() && !unicode ? <div className="grid h-40 place-items-center text-sm text-muted"><span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" />Rendering preview…</span></div> : null}
      </>}
      side={<>
        <div className="grid grid-cols-3 gap-2"><Stat label="Lines" value={text ? text.split('\n').length.toLocaleString() : 0} /><Stat label="Words" value={words.toLocaleString()} /><Stat label="Pages" value={result?.pages ?? '-'} /></div>
        <div><Label>Font</Label><Segmented value={font} onChange={setFont} options={[{ value: 'helvetica', label: 'Helvetica' }, { value: 'times', label: 'Times' }, { value: 'courier', label: 'Courier' }]} /></div>
        <div className="grid grid-cols-2 gap-3">
          <Slider label="Size" value={size} onChange={setSize} min={7} max={24} step={0.5} suffix="pt" />
          <Slider label="Line height" value={lineHeight} onChange={setLineHeight} min={1} max={2.4} step={0.05} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Page</Label><Select value={page} onChange={setPage} options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }, { value: 'legal', label: 'Legal' }, { value: 'a5', label: 'A5' }]} /></div>
          <div><Label>Orientation</Label><Segmented value={orient} onChange={setOrient} options={[{ value: 'portrait', label: 'Port.' }, { value: 'landscape', label: 'Land.' }]} /></div>
        </div>
        <Slider label="Margins" value={marginMm} onChange={setMarginMm} min={5} max={40} suffix=" mm" />
        <div><Label>Alignment</Label><Segmented value={align} onChange={setAlign} options={[{ value: 'left', label: 'Left' }, { value: 'justify', label: 'Justify' }]} /></div>
        <div className="space-y-2.5">
          <Switch checked={header} onChange={setHeader} label="Header with title" />
          {header && <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title" />}
          <Switch checked={pageNumbers} onChange={setPageNumbers} label="Page numbers (Page X of Y)" />
          <Switch checked={lineNumbers} onChange={setLineNumbers} label="Line numbers" />
        </div>
        {unicode ? <>
          {busy && <Progress value={progress} label="Rendering" />}
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" loading={busy} icon={<FileDown className="size-5" />} onClick={exportUnicode}>Create PDF</Button>
        </> : <p className="text-[11px] text-muted">{previewing ? 'Updating preview…' : 'Live preview, download from the result card.'} <Badge>Vector text</Badge></p>}
        {!text.trim() && <p className="text-xs text-muted">Start typing or open a file to see the PDF.</p>}
      </>}
    />
  )
}
