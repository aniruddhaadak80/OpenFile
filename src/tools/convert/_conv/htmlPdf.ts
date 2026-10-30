/* Render an HTML document into a real, paginated PDF.
 * The HTML is laid out inside an isolated (hidden) iframe at the exact content width of the page,
 * page breaks are chosen so that text lines, images, table rows and headings are never sliced in half
 * (and CSS `break-before/after: page` is honoured), then each page is rasterised with html2canvas
 * in memory-safe chunks and placed into a jsPDF document. */
import type { jsPDF as JsPDF } from 'jspdf'
import { sanitizeMarkup } from '@/lib/safe'

export interface Margins { top: number; right: number; bottom: number; left: number }
export interface HtmlPdfOptions {
  /** page size in pt */
  pageWidth: number
  pageHeight: number
  /** margins in pt */
  margin: number | Margins
  /** render scale (2 = crisp) */
  scale?: number
  /** JPEG quality 0..1 (PNG when 1) */
  quality?: number
  /** fill colour for the full page (behind margins), e.g. dark themes */
  pageBackground?: string
  /** append to an existing document instead of creating a new one */
  pdf?: JsPDF
  /** whether the first page of this render should be appended as a new page (when pdf is given) */
  newPage?: boolean
  onProgress?: (p: number, label?: string) => void
  /** extra time to wait after load (ms), e.g. for web fonts */
  settle?: number
  /** called with the laid-out document before measuring (e.g. to collect heading positions) */
  inspect?: (doc: Document, pageOf: (y: number) => number) => void
  /** lay the HTML out at this CSS width (e.g. 1280 for desktop pages) and scale it down to the page */
  viewportWidth?: number
  /** add invisible text under each page image so the PDF can be searched and copied (default true) */
  textLayer?: boolean
}

interface Word { text: string; x: number; y: number; w: number; h: number }
// Latin-1 only: the built-in PDF fonts cannot encode other scripts, so those words are left out of the text layer.
const LATIN1 = /^[\u0020-\u007e\u00a0-\u00ff]+$/
const TYPO: Record<string, string> = { '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"', '\u2013': '-', '\u2014': '-', '\u2026': '...', '\u2022': '-' }

/** Every visible word of the laid-out document with its box in CSS px (document coordinates). */
function collectWords(doc: Document, limit = 150_000): Word[] {
  const out: Word[] = []
  if (!doc.body) return out
  const win = doc.defaultView!
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  const range = doc.createRange()
  for (let n = walker.nextNode(); n && out.length < limit; n = walker.nextNode()) {
    const t = n.nodeValue ?? ''
    if (!t.trim()) continue
    const el = n.parentElement
    if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|TITLE)$/.test(el.tagName)) continue
    const cs = win.getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue
    const re = /\S+/g
    let m: RegExpExecArray | null
    while ((m = re.exec(t)) && out.length < limit) {
      range.setStart(n, m.index); range.setEnd(n, m.index + m[0].length)
      const r = range.getBoundingClientRect()
      if (r.width < 0.5 || r.height < 0.5) continue
      const text = m[0].replace(/[\u2018\u2019\u201c\u201d\u2013\u2014\u2026\u2022]/g, (c) => TYPO[c])
      if (LATIN1.test(text)) out.push({ text, x: r.left, y: r.top, w: r.width, h: r.height })
    }
  }
  range.detach()
  return out
}

/** Invisible text for one page slice [a, b) of the document, placed over the page image. */
function drawTextLayer(pdf: JsPDF, words: Word[], a: number, b: number, left: number, top: number, pxPerPt: number) {
  const size0 = pdf.getFontSize()
  pdf.setFont('helvetica', 'normal')
  for (const w of words) {
    const cy = w.y + w.h / 2
    if (cy < a || cy >= b) continue
    const size = Math.max(1, (w.h / pxPerPt) * 0.8)
    pdf.setFontSize(size)
    const natural = pdf.getTextWidth(w.text)
    const target = w.w / pxPerPt
    const x = left + w.x / pxPerPt
    const y = top + (w.y - a + w.h * 0.78) / pxPerPt
    pdf.text(w.text, x, y, { renderingMode: 'invisible', horizontalScale: natural > 0 ? Math.min(4, Math.max(0.25, target / natural)) : 1 })
  }
  pdf.setFontSize(size0)
}

export interface HtmlPdfResult { pdf: JsPDF; pages: number; firstPage: number; anchors: { id: string; page: number }[] }

const PX_PER_PT = 96 / 72

const norm = (m: number | Margins): Margins => (typeof m === 'number' ? { top: m, right: m, bottom: m, left: m } : m)

export async function createPdf(w: number, h: number) {
  const { jsPDF } = await import('jspdf')
  return new jsPDF({ unit: 'pt', format: [w, h], orientation: w > h ? 'landscape' : 'portrait', compress: true })
}

function waitLoad(iframe: HTMLIFrameElement, html: string) {
  return new Promise<void>((res) => {
    let done = false
    const finish = () => { if (!done) { done = true; res() } }
    iframe.onload = finish
    // The frame shares the app's origin (html2canvas reads its DOM), so scripts and event handlers from the
    // document (EPUB, HTML, Word or e-mail content) are stripped first. Layout and styles are unchanged.
    iframe.srcdoc = sanitizeMarkup(html)
    setTimeout(finish, 8000)
  })
}

async function waitImages(doc: Document, timeout = 8000) {
  const imgs = Array.from(doc.images)
  await Promise.race([
    Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : new Promise<void>((r) => { img.addEventListener('load', () => r(), { once: true }); img.addEventListener('error', () => r(), { once: true }) })))),
    new Promise((r) => setTimeout(r, timeout)),
  ])
  try { await Promise.race([(doc as any).fonts?.ready, new Promise((r) => setTimeout(r, 2000))]) } catch { /* ignore */ }
}

/** Compute page break positions (CSS px) for a laid-out document. Exported for testing. */
export function computeBreaks(fullH: number, pageH: number, atoms: [number, number][], forced: number[]): [number, number][] {
  const out: [number, number][] = []
  const f = [...new Set(forced.map((v) => Math.round(v)))].filter((v) => v > 1 && v < fullH - 1).sort((a, b) => a - b)
  let y = 0
  let guard = 0
  while (y < fullH - 1 && guard++ < 5000) {
    const limit = y + pageH
    const nf = f.find((v) => v > y + 1)
    if (nf !== undefined && nf <= limit) { out.push([y, nf]); y = nf; continue }
    if (limit >= fullH) { out.push([y, fullH]); break }
    let cut = limit
    for (let k = 0; k < 40; k++) {
      let minTop = Infinity
      for (const [t, b] of atoms) if (t < cut - 0.5 && b > cut + 0.5 && b - t < pageH * 0.9) minTop = Math.min(minTop, t)
      if (minTop === Infinity) break
      const nc = Math.floor(minTop)
      if (nc <= y + pageH * 0.3) break // a huge block: give up and cut at the current position
      cut = nc
    }
    out.push([y, cut]); y = cut
  }
  // drop tiny trailing slivers (whitespace)
  if (out.length > 1 && out[out.length - 1][1] - out[out.length - 1][0] < 3) out.pop()
  return out.length ? out : [[0, Math.max(1, fullH)]]
}

const MODERN = /(oklch|oklab|\blab\(|\blch\(|color\(|color-mix|light-dark)/i
const COLOR_PROPS = ['color', 'background-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-color', 'text-decoration-color', 'column-rule-color', 'caret-color', 'fill', 'stroke']

/** html2canvas 1.x cannot parse modern colour functions (oklch, lab, color-mix…). Rewrite them to rgba() inline. */
export function fixModernColors(doc: Document) {
  const win = doc.defaultView!
  const c = document.createElement('canvas'); c.width = c.height = 1
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  const cache = new Map<string, string>()
  const toRgb = (v: string) => {
    if (cache.has(v)) return cache.get(v)!
    ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = v; ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    const out = `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`
    cache.set(v, out); return out
  }
  let fixed = 0
  for (const el of Array.from(doc.querySelectorAll('*')) as HTMLElement[]) {
    const cs = win.getComputedStyle(el)
    for (const p of COLOR_PROPS) { const v = cs.getPropertyValue(p); if (v && MODERN.test(v)) { el.style.setProperty(p, toRgb(v), 'important'); fixed++ } }
    for (const p of ['background-image', 'box-shadow', 'text-shadow']) { const v = cs.getPropertyValue(p); if (v && MODERN.test(v)) { el.style.setProperty(p, 'none', 'important'); fixed++ } }
  }
  return fixed
}

function collect(doc: Document, pageH: number) {
  const atoms: [number, number][] = []
  const forced: number[] = []
  const win = doc.defaultView!
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  const range = doc.createRange()
  let n: Node | null
  while ((n = walker.nextNode())) {
    if (!n.textContent || !n.textContent.trim()) continue
    range.selectNodeContents(n)
    for (const r of Array.from(range.getClientRects())) if (r.height > 0) atoms.push([r.top, r.bottom])
  }
  for (const el of Array.from(doc.body.querySelectorAll('*')) as HTMLElement[]) {
    const tag = el.tagName.toLowerCase()
    const cs = win.getComputedStyle(el)
    const bb = cs.breakBefore || (cs as any).pageBreakBefore
    const ba = cs.breakAfter || (cs as any).pageBreakAfter
    const rect = el.getBoundingClientRect()
    if (bb === 'page' || bb === 'always' || bb === 'left' || bb === 'right') forced.push(rect.top)
    if (ba === 'page' || ba === 'always' || ba === 'left' || ba === 'right') forced.push(rect.bottom)
    if (rect.height <= 0) continue
    if (['img', 'svg', 'canvas', 'video', 'tr', 'hr', 'figure', 'math'].includes(tag) || cs.breakInside === 'avoid' || cs.breakInside === 'avoid-page') {
      if (rect.height < pageH * 0.9) atoms.push([rect.top, rect.bottom])
    }
    if (/^h[1-6]$/.test(tag)) atoms.push([rect.top, rect.bottom + Math.min(48, pageH * 0.08)]) // keep heading with next line
  }
  return { atoms, forced }
}

/** Render a full HTML document string into PDF pages. */
export async function renderHtmlToPdf(html: string, opts: HtmlPdfOptions): Promise<HtmlPdfResult> {
  const html2canvas = (await import('html2canvas')).default
  const m = norm(opts.margin)
  const scale = opts.scale ?? (opts.viewportWidth && opts.viewportWidth > 1000 ? 1.5 : 2)
  const quality = opts.quality ?? 0.92
  const contentWpt = opts.pageWidth - m.left - m.right
  const contentHpt = opts.pageHeight - m.top - m.bottom
  if (contentWpt < 50 || contentHpt < 50) throw new Error('Margins are too large for this page size.')
  const pxPerPt = opts.viewportWidth ? opts.viewportWidth / contentWpt : PX_PER_PT
  const wPx = Math.round(contentWpt * pxPerPt)
  const pageHPx = contentHpt * pxPerPt

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = `position:fixed;left:-100000px;top:0;width:${wPx}px;height:200px;border:0;opacity:0;pointer-events:none;`
  document.body.appendChild(iframe)
  try {
    opts.onProgress?.(0.02, 'Laying out…')
    await waitLoad(iframe, html)
    const doc = iframe.contentDocument!
    await waitImages(doc)
    if (opts.settle) await new Promise((r) => setTimeout(r, opts.settle))
    let fullH = Math.ceil(Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0))
    iframe.style.height = fullH + 'px'
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    fullH = Math.ceil(Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0, 1))
    iframe.style.height = fullH + 'px'

    try { fixModernColors(doc) } catch { /* best effort */ }
    const { atoms, forced } = collect(doc, pageHPx)
    const pages = computeBreaks(fullH, pageHPx, atoms, forced)

    const pdf = opts.pdf ?? (await createPdf(opts.pageWidth, opts.pageHeight))
    let firstPage = opts.pdf ? pdf.getNumberOfPages() + (opts.newPage === false ? 0 : 1) : 1
    const pageOf = (y: number) => { const i = pages.findIndex(([a, b]) => y >= a && y < b); return firstPage + (i < 0 ? pages.length - 1 : i) }
    opts.inspect?.(doc, pageOf)
    const anchors: { id: string; page: number }[] = []
    doc.querySelectorAll('[id]').forEach((el) => anchors.push({ id: el.id, page: pageOf(el.getBoundingClientRect().top + 1) }))

    // group pages into memory-safe chunks
    const maxArea = 14_000_000
    const maxChunk = Math.max(pageHPx, Math.min(Math.floor(maxArea / (wPx * scale * scale)), Math.floor(28000 / scale)))
    const chunks: { y0: number; y1: number; pages: [number, number][] }[] = []
    for (const p of pages) {
      const c = chunks[chunks.length - 1]
      if (c && p[1] - c.y0 <= maxChunk) { c.y1 = p[1]; c.pages.push(p) } else chunks.push({ y0: p[0], y1: p[1], pages: [p] })
    }
    let words: Word[] = []
    if (opts.textLayer !== false) { try { words = collectWords(doc) } catch { words = [] } }
    const bg = doc.defaultView!.getComputedStyle(doc.body).backgroundColor
    const bgColor = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' ? bg : '#ffffff'
    let done = 0
    let first = true
    for (const c of chunks) {
      const canvas = await html2canvas(doc.documentElement, {
        x: 0, y: c.y0, width: wPx, height: Math.ceil(c.y1 - c.y0), windowWidth: wPx, windowHeight: fullH,
        scrollX: 0, scrollY: 0, scale, useCORS: true, allowTaint: false, backgroundColor: bgColor, logging: false,
      })
      for (const [a, b] of c.pages) {
        const hPx = Math.max(1, Math.round((b - a) * scale))
        const pc = document.createElement('canvas')
        pc.width = canvas.width; pc.height = hPx
        const ctx = pc.getContext('2d')!
        ctx.fillStyle = bgColor; ctx.fillRect(0, 0, pc.width, pc.height)
        ctx.drawImage(canvas, 0, Math.round((a - c.y0) * scale), canvas.width, hPx, 0, 0, canvas.width, hPx)
        if (!(first && (!opts.pdf || opts.newPage === false))) pdf.addPage([opts.pageWidth, opts.pageHeight], opts.pageWidth > opts.pageHeight ? 'landscape' : 'portrait')
        first = false
        if (opts.pageBackground) { pdf.setFillColor(opts.pageBackground); pdf.rect(0, 0, opts.pageWidth, opts.pageHeight, 'F') }
        const isPng = quality >= 1
        const data = pc.toDataURL(isPng ? 'image/png' : 'image/jpeg', quality)
        pdf.addImage(data, isPng ? 'PNG' : 'JPEG', m.left, m.top, contentWpt, (b - a) / pxPerPt, undefined, 'FAST')
        if (words.length) drawTextLayer(pdf, words, a, b, m.left, m.top, pxPerPt)
        done++
        opts.onProgress?.(0.05 + 0.95 * (done / pages.length), `Rendering page ${done} of ${pages.length}`)
      }
      canvas.width = 0; canvas.height = 0
    }
    if (opts.pdf && opts.newPage === false) firstPage = Math.max(1, firstPage)
    return { pdf, pages: pages.length, firstPage, anchors }
  } finally {
    iframe.remove()
  }
}

/** Draw "n / total" footers on every page (call after all content is added). */
export function addPageNumbers(pdf: JsPDF, opts: { from?: number; color?: string; size?: number; format?: (n: number, total: number) => string; bottom?: number } = {}) {
  const total = pdf.getNumberOfPages()
  const from = opts.from ?? 1
  for (let i = from; i <= total; i++) {
    pdf.setPage(i)
    const w = pdf.internal.pageSize.getWidth(), h = pdf.internal.pageSize.getHeight()
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(opts.size ?? 9); pdf.setTextColor(opts.color ?? '#888888')
    pdf.text(opts.format ? opts.format(i - from + 1, total - from + 1) : `${i - from + 1} / ${total - from + 1}`, w / 2, h - (opts.bottom ?? 18), { align: 'center' })
  }
}

export const pdfToBlob = (pdf: JsPDF) => pdf.output('blob') as Blob

/** Wrap a body fragment in a minimal standalone HTML document with CSS. */
export function htmlDoc(body: string, css = '', title = 'Document') {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title><style>html,body{margin:0;padding:0;background:#fff;}*{box-sizing:border-box;}img{max-width:100%;}${css}</style></head><body>${body}</body></html>`
}

/** Continuous "paper" preview document: same CSS + content width as the PDF render, shown on a grey desk. */
export function previewDoc(body: string, css: string, pageWidthPt: number, margin: number | Margins, opts: { pageBg?: string; desk?: string } = {}) {
  const m = norm(margin)
  const px = (pt: number) => (pt * 96) / 72
  const shell = `html{background:${opts.desk ?? '#d9dce3'};}body{margin:0;padding:24px 12px;background:transparent!important;}
  .of-page{box-sizing:border-box;width:${px(pageWidthPt)}px;max-width:100%;margin:0 auto;padding:${px(m.top)}px ${px(m.right)}px ${px(m.bottom)}px ${px(m.left)}px;background:${opts.pageBg ?? '#fff'};box-shadow:0 10px 30px rgba(0,0,0,.18);min-height:${px(pageWidthPt * 1.3)}px;}
  .of-page [style*="break-before: page"],.of-page .page-break{border-top:2px dashed #c7cad3;margin-top:18px;padding-top:18px;}`
  return `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box;}img{max-width:100%;}${css}${shell}</style></head><body><div class="of-page">${body}</div></body></html>`
}
