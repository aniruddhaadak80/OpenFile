import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { BookOpen, FileDown, ListTree, Check, Loader2, User } from 'lucide-react'
import { Button, Dropzone, ToolGrid, Label, Select, Segmented, Slider, Switch, Progress, ErrorNote, ResultCard, Badge, useJob, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { baseName, loadImage } from '@/lib/files'
import { FileBar, PdfPreview, Reveal, Stat, mm } from './_conv/shared'
import { renderHtmlToPdf, createPdf, addPageNumbers, pdfToBlob } from './_conv/htmlPdf'
import { openEpub, chapterHtml, dataUrl, CLEAN_CSS, BOOK_FIX_CSS, type Book } from './_conv/epub'

const SIZES = { book: { label: 'Book (6 × 9 in)', w: 432, h: 648 }, a5: { label: 'A5', w: 419.53, h: 595.28 }, a4: { label: 'A4', w: 595.28, h: 841.89 }, letter: { label: 'US Letter', w: 612, h: 792 } }
type SizeKey = keyof typeof SIZES
const FONTS = { serif: "Georgia,'Times New Roman',Tinos,serif", sans: "'Helvetica Neue',Arial,Arimo,sans-serif" }

export default function EpubToPdf() {
  const [file, setFile] = useState<File | null>(null)
  const [book, setBook] = useState<Book | null>(null)
  const [cover, setCover] = useState<string | null>(null)
  const [size, setSize] = useState<SizeKey>('a5')
  const [marginMm, setMarginMm] = useState(16)
  const [styles, setStyles] = useState<'book' | 'clean'>('clean')
  const [fontSize, setFontSize] = useState(11)
  const [font, setFont] = useState<'serif' | 'sans'>('serif')
  const [withCover, setWithCover] = useState(true)
  const [withToc, setWithToc] = useState(true)
  const [numbers, setNumbers] = useState(true)
  const [current, setCurrent] = useState(-1)
  const [result, setResult] = useState<{ blob: Blob; pages: number } | null>(null)
  const load = useJob()
  const conv = useJob()

  useEffect(() => {
    if (!file) return
    setBook(null); setCover(null); setResult(null)
    load.run(async () => {
      const b = await openEpub(file)
      setBook(b)
      if (b.coverHref) setCover(await dataUrl(b.zip, b.coverHref))
    })
  }, [file]) // eslint-disable-line
  useEffect(() => setResult(null), [size, marginMm, styles, fontSize, font, withCover, withToc, numbers])

  const tocList = useMemo(() => (book ? (book.toc.length ? book.toc : book.chapters.map((c, i) => ({ title: c.title || `Section ${i + 1}`, href: c.href, level: 0 }))) : []), [book])

  const convert = () => conv.run(async (setP) => {
    if (!book) return
    const { w, h } = SIZES[size]
    const m = mm(marginMm)
    const bottom = numbers ? Math.max(m, 30) : m
    const css = styles === 'clean' ? CLEAN_CSS(fontSize, FONTS[font]) : BOOK_FIX_CSS + `body{font-size:${fontSize}pt;}`
    const pdf = await createPdf(w, h)
    let used = false // whether page 1 has content
    let coverPages = 0
    if (withCover && cover) {
      const img = await loadImage(cover)
      const nw = img.naturalWidth || 1200, nh = img.naturalHeight || 1800
      const s = Math.min(w / nw, h / nh)
      const iw = nw * s, ih = nh * s
      // normalise any format (SVG, WEBP, GIF…) to JPEG for the PDF
      const k = Math.min(1, 2400 / Math.max(nw, nh))
      const c = document.createElement('canvas'); c.width = Math.round(nw * k); c.height = Math.round(nh * k)
      const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height)
      pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', (w - iw) / 2, (h - ih) / 2, iw, ih, undefined, 'FAST')
      c.width = c.height = 0
      used = true; coverPages = 1
    }
    const cache = new Map<string, string | null>()
    const chapterPage = new Map<string, number>()
    const anchorPage = new Map<string, number>()
    const n = book.chapters.length
    for (let i = 0; i < n; i++) {
      const ch = book.chapters[i]
      setCurrent(i)
      const { html, chars, isCoverOnly, firstImg } = await chapterHtml(book, ch, { bookStyles: styles === 'book', css }, cache)
      if (!html) continue
      if (withCover && cover && isCoverOnly && (firstImg === book.coverHref || i === 0)) { chapterPage.set(ch.href, 1); continue }
      if (chars === 0 && !/<(img|svg|image)\b/i.test(html)) continue
      const res = await renderHtmlToPdf(html, {
        pageWidth: w, pageHeight: h, margin: { top: m, right: m, bottom, left: m }, pdf, newPage: used, scale: 2, quality: 0.9,
        onProgress: (p) => setP(Math.min(0.97, (i + p) / n)),
      })
      used = true
      chapterPage.set(ch.href, res.firstPage)
      for (const a of res.anchors) anchorPage.set(`${ch.href}#${a.id}`, a.page)
    }
    setCurrent(-1)
    // table of contents entries with resolved pages
    const entries = tocList.map((t) => ({ ...t, page: anchorPage.get(t.href) ?? chapterPage.get(t.href.split('#')[0]) })).filter((t) => t.page)
    let shift = 0
    if (withToc && entries.length) {
      const total0 = pdf.getNumberOfPages()
      const lineH = 18, perPage = Math.max(5, Math.floor((h - m * 2 - 50) / lineH))
      const tocPages = Math.ceil(entries.length / perPage)
      shift = tocPages
      for (let p = 0; p < tocPages; p++) {
        pdf.addPage([w, h], 'portrait')
        let y = m + 10
        if (p === 0) { pdf.setFont('times', 'bold'); pdf.setFontSize(20); pdf.setTextColor('#111111'); pdf.text('Contents', m, y + 14); y += 44 }
        for (const e of entries.slice(p * perPage, (p + 1) * perPage)) {
          const indent = Math.min(e.level, 3) * 14
          pdf.setFont('times', e.level ? 'normal' : 'bold'); pdf.setFontSize(e.level ? 10.5 : 11.5); pdf.setTextColor('#222222')
          const pageLabel = String(e.page! + (e.page! > coverPages ? tocPages : 0) - coverPages)
          const maxW = w - m * 2 - indent - 40
          const title = (pdf.splitTextToSize(e.title || 'Untitled', maxW) as string[])[0]
          pdf.text(title, m + indent, y)
          const tw = pdf.getTextWidth(title)
          pdf.setTextColor('#9aa0ad'); pdf.setFont('times', 'normal')
          const dots = '.'.repeat(Math.max(0, Math.floor((w - m * 2 - indent - tw - 30) / pdf.getTextWidth('.'))))
          pdf.text(dots, m + indent + tw + 4, y)
          pdf.setTextColor('#222222')
          pdf.text(pageLabel, w - m, y, { align: 'right' })
          pdf.link(m + indent, y - 10, w - m * 2 - indent, 14, { pageNumber: e.page! + (e.page! > coverPages ? tocPages : 0) })
          y += lineH
        }
      }
      // move TOC pages right after the cover
      for (let k = 0; k < tocPages; k++) (pdf as any).movePage(total0 + 1 + k, coverPages + 1 + k)
    }
    if (numbers) addPageNumbers(pdf, { from: coverPages + 1, color: '#8a8f9c', bottom: Math.min(bottom / 2, 20) })
    // PDF bookmarks (outline)
    const parents: any[] = []
    for (const e of entries) {
      const page = e.page! + (e.page! > coverPages ? shift : 0)
      const node = (pdf as any).outline.add(e.level > 0 ? parents[e.level - 1] ?? null : null, e.title || 'Untitled', { pageNumber: page })
      parents[e.level] = node; parents.length = e.level + 1
    }
    pdf.setProperties({ title: book.title, author: book.author, creator: 'OpenFile' })
    setP(1)
    setResult({ blob: pdfToBlob(pdf), pages: pdf.getNumberOfPages() })
    toast('Your PDF book is ready', 'success')
  })

  const reset = () => { setFile(null); setBook(null); setResult(null); setCover(null) }

  if (!file) return <Dropzone accept=".epub,application/epub+zip" onFiles={(f) => setFile(f[0])} label="Drop an EPUB e-book" sub="DRM-free EPUB 2 & 3, converted entirely in your browser." />

  return (
    <div className="space-y-5">
      <FileBar name={file.name} size={file.size} sub={book ? `${book.chapters.length} chapters` : 'reading…'} onReset={reset} />
      <ToolGrid
        main={<>
          {load.busy && <Progress value={0.5} label="Opening e-book" />}
          <ErrorNote error={load.error} />
          {book && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 sm:flex-row">
              <div className="mx-auto w-36 shrink-0 sm:mx-0">
                {cover ? <img src={cover} alt="Cover" className="w-full rounded-lg shadow-xl ring-1 ring-black/10" /> : <div className="grid aspect-[2/3] place-items-center rounded-lg bg-gradient-brand text-on-accent shadow-xl"><BookOpen className="size-10" /></div>}
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div><div className="font-display text-xl font-bold leading-tight">{book.title}</div>{book.author && <div className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted"><User className="size-3.5" />{book.author}</div>}</div>
                <div className="flex flex-wrap gap-2"><Badge>{book.chapters.length} spine items</Badge><Badge>{book.toc.length} TOC entries</Badge>{book.language && <Badge>{book.language.toUpperCase()}</Badge>}</div>
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted"><ListTree className="size-3.5" />Table of contents</div>
                  <div className="max-h-72 space-y-0.5 overflow-auto pr-2 scrollbar-thin">
                    {tocList.map((t, i) => {
                      const chIdx = book.chapters.findIndex((c) => c.href === t.href.split('#')[0])
                      const done = conv.busy ? chIdx >= 0 && chIdx < current : !!result
                      const active = conv.busy && chIdx === current
                      return (
                        <div key={i} className={cn('flex items-center gap-2 rounded-lg px-2 py-1 text-sm transition', active && 'bg-accent/10 text-accent')} style={{ paddingLeft: 8 + Math.min(t.level, 4) * 14 }}>
                          <span className="grid size-4 shrink-0 place-items-center">{active ? <Loader2 className="size-3.5 animate-spin" /> : done ? <Check className="size-3.5 text-success" /> : <span className="size-1 rounded-full bg-muted" />}</span>
                          <span className={cn('truncate', t.level === 0 && 'font-medium')}>{t.title || 'Untitled'}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          {result && <Reveal k="r" className="space-y-3"><ResultCard blob={result.blob} filename={`${baseName(file.name)}.pdf`} title={`PDF ready · ${result.pages} pages`} onReset={reset} /><PdfPreview blob={result.blob} height={640} /></Reveal>}
        </>}
        side={<>
          {book && <div className="grid grid-cols-2 gap-2"><Stat label="Chapters" value={book.chapters.length} /><Stat label="Pages" value={result?.pages ?? '-'} /></div>}
          <div><Label>Page size</Label><Select value={size} onChange={setSize} options={(Object.keys(SIZES) as SizeKey[]).map((k) => ({ value: k, label: SIZES[k].label }))} /></div>
          <div>
            <Label>Styling</Label>
            <Segmented value={styles} onChange={setStyles} options={[{ value: 'clean', label: 'Clean reading' }, { value: 'book', label: "Book's own CSS" }]} />
          </div>
          {styles === 'clean' && <div><Label>Typeface</Label><Segmented value={font} onChange={setFont} options={[{ value: 'serif', label: 'Serif' }, { value: 'sans', label: 'Sans' }]} /></div>}
          <Slider label="Font size" value={fontSize} onChange={setFontSize} min={8} max={16} step={0.5} suffix=" pt" />
          <Slider label="Margins" value={marginMm} onChange={setMarginMm} min={6} max={30} suffix=" mm" />
          <div className="space-y-2.5">
            <Switch checked={withCover} onChange={setWithCover} label={`Cover page${cover ? '' : ' (none found)'}`} />
            <Switch checked={withToc} onChange={setWithToc} label="Printed table of contents" />
            <Switch checked={numbers} onChange={setNumbers} label="Page numbers" />
          </div>
          {conv.busy && <Progress value={conv.progress} label={current >= 0 && book ? `Chapter ${current + 1} of ${book.chapters.length}` : 'Finishing…'} />}
          <ErrorNote error={conv.error} />
          <Button size="lg" className="w-full" loading={conv.busy} disabled={!book} icon={<FileDown className="size-5" />} onClick={convert}>Convert to PDF</Button>
          <p className="text-[11px] text-muted">Every chapter starts on a new page; the PDF gets clickable bookmarks for each TOC entry. DRM-protected books can't be opened.</p>
        </>}
      />
    </div>
  )
}
