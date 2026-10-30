import { useEffect, useMemo, useState } from 'react'
import { FileDown, AlertTriangle, Eye, FileCheck2 } from 'lucide-react'
import { Button, Dropzone, ToolGrid, Label, Select, Segmented, Slider, Switch, Progress, ErrorNote, ResultCard, Tabs, Badge, useJob, Field } from '@/components/ui'
import { toast } from '@/components/toast'
import { baseName } from '@/lib/files'
import { FileBar, FramePreview, PdfPreview, Reveal, Stat, pageDims, mm, type PageSizeKey } from './_conv/shared'
import { renderHtmlToPdf, addPageNumbers, htmlDoc, previewDoc, pdfToBlob } from './_conv/htmlPdf'
import { WORD_CSS } from './_conv/docCss'

const FONTS = {
  doc: { label: 'As in document (Calibri-like)', css: "Calibri, Carlito, 'Segoe UI', Arial, sans-serif" },
  serif: { label: 'Serif (Times / Georgia)', css: "'Times New Roman', Tinos, Georgia, serif" },
  sans: { label: 'Sans (Arial / Helvetica)', css: 'Arial, Helvetica, Arimo, sans-serif' },
}
type FontKey = keyof typeof FONTS

export default function WordToPdf() {
  const [file, setFile] = useState<File | null>(null)
  const [html, setHtml] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [size, setSize] = useState<PageSizeKey>('a4')
  const [orient, setOrient] = useState<'portrait' | 'landscape'>('portrait')
  const [marginMm, setMarginMm] = useState(20)
  const [font, setFont] = useState<FontKey>('doc')
  const [fontSize, setFontSize] = useState(11)
  const [numbers, setNumbers] = useState(true)
  const [tab, setTab] = useState<'doc' | 'pdf'>('doc')
  const [result, setResult] = useState<Blob | null>(null)
  const [pages, setPages] = useState(0)
  const load = useJob()
  const conv = useJob()

  useEffect(() => {
    if (!file) return
    setHtml(''); setResult(null); setWarnings([])
    load.run(async () => {
      if (!/\.docx$/i.test(file.name)) throw new Error('Only .docx files are supported. Open old .doc files in Word/LibreOffice and save as .docx first.')
      const mammoth: any = await import('mammoth')
      const lib = mammoth.default ?? mammoth
      const res = await lib.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, {
        styleMap: ["p[style-name='Title'] => h1.doc-title:fresh", "p[style-name='Subtitle'] => p.doc-subtitle:fresh", "p[style-name='Quote'] => blockquote:fresh", "p[style-name='Intense Quote'] => blockquote:fresh"],
        includeDefaultStyleMap: true,
      })
      if (!res.value.trim()) throw new Error('This document appears to be empty.')
      setHtml(res.value)
      setWarnings([...new Set<string>(res.messages.filter((m: any) => m.type === 'warning').map((m: any) => m.message))].slice(0, 6))
    })
  }, [file]) // eslint-disable-line

  const dims = pageDims(size, orient)
  const marginPt = mm(marginMm)
  const css = WORD_CSS(FONTS[font].css, fontSize) + '.doc-title{text-align:center;font-size:' + fontSize * 2.3 + 'pt;margin-top:0;}.doc-subtitle{text-align:center;color:#555;font-size:' + fontSize * 1.3 + 'pt;}'
  const preview = useMemo(() => (html ? previewDoc(html, css, dims.w, marginPt) : ''), [html, css, dims.w, marginPt])
  const stats = useMemo(() => {
    if (!html) return { words: 0, images: 0, tables: 0 }
    const text = html.replace(/<[^>]+>/g, ' ')
    return { words: (text.match(/\S+/g) ?? []).length, images: (html.match(/<img/g) ?? []).length, tables: (html.match(/<table/g) ?? []).length }
  }, [html])

  useEffect(() => { setResult(null); setTab('doc') }, [size, orient, marginMm, font, fontSize, numbers])

  const convert = () => conv.run(async (setP) => {
    const bottom = numbers ? Math.max(marginPt, 36) : marginPt
    const { pdf, pages } = await renderHtmlToPdf(htmlDoc(html, css, baseName(file!.name)), { pageWidth: dims.w, pageHeight: dims.h, margin: { top: marginPt, right: marginPt, bottom, left: marginPt }, onProgress: (p) => setP(p) })
    if (numbers) addPageNumbers(pdf, { bottom: Math.min(bottom / 2, 24) })
    pdf.setProperties({ title: baseName(file!.name), creator: 'OpenFile' })
    setPages(pages)
    setResult(pdfToBlob(pdf))
    setTab('pdf')
    toast('PDF ready', 'success')
  })

  const reset = () => { setFile(null); setHtml(''); setResult(null) }

  if (!file) return <Dropzone accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onFiles={(f) => setFile(f[0])} label="Drop a Word document (.docx)" />

  return (
    <div className="space-y-5">
      <FileBar name={file.name} size={file.size} sub={html ? `${stats.words.toLocaleString()} words` : 'reading…'} onReset={reset} />
      <ToolGrid
        main={<>
          {load.busy && <Progress value={0.5} label="Reading document" />}
          <ErrorNote error={load.error} />
          {result && <Reveal k="r"><ResultCard blob={result} filename={`${baseName(file.name)}.pdf`} title={`PDF ready · ${pages} page${pages > 1 ? 's' : ''}`} originalSize={file.size} onReset={reset} /></Reveal>}
          {html && <>
            <Tabs value={tab} onChange={setTab} tabs={[{ value: 'doc', label: <span className="inline-flex items-center gap-1.5"><Eye className="size-4" />Document preview</span> }, ...(result ? [{ value: 'pdf' as const, label: <span className="inline-flex items-center gap-1.5"><FileCheck2 className="size-4" />PDF result</span> }] : [])]} />
            {tab === 'pdf' && result ? <PdfPreview blob={result} height={640} /> : <FramePreview srcDoc={preview} />}
          </>}
          {warnings.length > 0 && (
            <details className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-2 text-xs text-muted">
              <summary className="flex cursor-pointer items-center gap-2 text-warn"><AlertTriangle className="size-3.5" />{warnings.length} formatting note{warnings.length > 1 ? 's' : ''} from the converter</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </details>
          )}
        </>}
        side={<>
          <div className="grid grid-cols-3 gap-2"><Stat label="Words" value={stats.words.toLocaleString()} /><Stat label="Images" value={stats.images} /><Stat label="Tables" value={stats.tables} /></div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Page size"><Select value={size} onChange={setSize} options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }, { value: 'legal', label: 'Legal' }, { value: 'a5', label: 'A5' }]} /></Field>
            <div><Label>Orientation</Label><Segmented value={orient} onChange={setOrient} options={[{ value: 'portrait', label: 'Port.' }, { value: 'landscape', label: 'Land.' }]} /></div>
          </div>
          <Slider label="Margins" value={marginMm} onChange={setMarginMm} min={5} max={40} suffix=" mm" />
          <Field label="Font"><Select value={font} onChange={setFont} options={(Object.keys(FONTS) as FontKey[]).map((k) => ({ value: k, label: FONTS[k].label }))} /></Field>
          <Slider label="Base font size" value={fontSize} onChange={setFontSize} min={8} max={16} step={0.5} suffix=" pt" />
          <Switch checked={numbers} onChange={setNumbers} label="Page numbers in footer" />
          {conv.busy && <Progress value={conv.progress} label="Rendering pages" />}
          <ErrorNote error={conv.error} />
          <Button size="lg" className="w-full" loading={conv.busy} disabled={!html} icon={<FileDown className="size-5" />} onClick={convert}>Convert to PDF</Button>
          <p className="text-[11px] text-muted">Headings, lists, tables and images are preserved. Lines and images are never split across pages. <Badge>A4 margins</Badge></p>
        </>}
      />
    </div>
  )
}
