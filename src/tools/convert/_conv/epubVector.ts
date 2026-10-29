/* EPUB to PDF with real, selectable vector text.
 * Each chapter is parsed into simple blocks (headings, paragraphs, list items, quotes, preformatted text, images, rules),
 * then laid out with jsPDF text: word wrapping, optional justification, page breaks, chapter starts on a new page,
 * images embedded only where the book has an actual <img> or SVG <image>, a printed contents page with links,
 * page numbers and a PDF outline (bookmarks) per TOC entry.
 * Nothing from the book is ever inserted into a live DOM: chapters go through an inert DOMParser document and only
 * their text and image paths are read. External links pass through safeUrl.
 * Runs in the browser and in Node (unit tested in scripts/tests/b1/epub-vector.test.mts with @xmldom as DOMParser). */
import type { jsPDF as JsPDF } from 'jspdf'
import { safeUrl } from '../../../lib/safe'
import { resolvePath, type Book, type TocEntry } from './epub'

export interface Run { text: string; b?: boolean; i?: boolean; mono?: boolean; href?: string }
type Align = 'left' | 'center' | 'right' | 'justify'
export type Block =
  | { t: 'h'; level: number; runs: Run[]; ids: string[]; align: Align }
  | { t: 'p'; runs: Run[]; ids: string[]; indent: number; align: Align; kind: 'p' | 'quote' | 'li' | 'pre'; bullet?: string }
  | { t: 'img'; src: string; alt: string; ids: string[] }
  | { t: 'hr'; ids: string[] }

const SKIP = new Set(['head', 'script', 'style', 'noscript', 'template', 'title', 'iframe', 'object', 'embed', 'form', 'button', 'input', 'select', 'textarea', 'audio', 'video', 'canvas', 'math', 'map'])
const BLOCK = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'aside', 'main', 'nav', 'figure', 'figcaption', 'dd', 'dt', 'dl', 'address', 'center', 'body', 'hgroup', 'details', 'summary', 'caption'])
const XLINK = 'http://www.w3.org/1999/xlink'

const nameOf = (el: Element) => String(el.localName || el.nodeName || '').toLowerCase().replace(/^.*:/, '')
const attr = (el: Element, n: string) => (typeof el.getAttribute === 'function' ? el.getAttribute(n) : null) || ''
const hidden = (el: Element) => el.hasAttribute?.('hidden') || /display\s*:\s*none/i.test(attr(el, 'style'))
function alignOf(el: Element): Align | undefined {
  const a = attr(el, 'align').toLowerCase()
  const s = /text-align\s*:\s*(left|center|right|justify)/i.exec(attr(el, 'style'))?.[1]?.toLowerCase()
  const v = s || a || (/\b(center|centered|centre|c)\b/i.test(attr(el, 'class')) || nameOf(el) === 'center' ? 'center' : '')
  return v === 'left' || v === 'center' || v === 'right' || v === 'justify' ? v : undefined
}

/** Parse one chapter document into layout blocks. `href` is the chapter path inside the EPUB (for image paths). */
export function chapterBlocks(doc: Document, href: string): Block[] {
  const out: Block[] = []
  let runs: Run[] = []
  let ids: string[] = []
  interface Ctx { b: boolean; i: boolean; mono: boolean; pre: boolean; href?: string; indent: number; kind: 'p' | 'quote' | 'li' | 'pre'; align?: Align; bullet?: string; heading?: number }
  let pendingBullet: string | undefined
  let pendingCtx: Ctx | null = null
  const flush = (ctx: Ctx) => {
    const has = runs.some((r) => r.text.trim())
    if (has) {
      const c = pendingCtx ?? ctx
      if (c.heading) out.push({ t: 'h', level: c.heading, runs, ids, align: c.align ?? 'left' })
      else out.push({ t: 'p', runs, ids, indent: c.indent, align: c.align ?? (c.pre ? 'left' : 'justify'), kind: c.pre ? 'pre' : c.kind, bullet: pendingBullet })
      ids = []; pendingBullet = undefined
    }
    runs = []; pendingCtx = null
  }
  const pushText = (s: string, ctx: Ctx) => {
    if (!s) return
    const text = ctx.pre ? s.replace(/\r\n?/g, '\n') : s.replace(/[\s\u00ad]+/g, (m) => (m === '\u00ad' ? '' : ' '))
    if (!text) return
    if (!runs.length) pendingCtx = ctx
    const last = runs[runs.length - 1]
    if (last && last.b === ctx.b && last.i === ctx.i && last.mono === ctx.mono && last.href === ctx.href) last.text += text
    else runs.push({ text, b: ctx.b, i: ctx.i, mono: ctx.mono, href: ctx.href })
  }
  const image = (src: string, alt: string, ctx: Ctx) => {
    if (!src || /^(https?:|data:)/i.test(src)) return
    flush(ctx)
    out.push({ t: 'img', src: resolvePath(href, src), alt, ids }); ids = []
  }
  const walk = (node: Node, ctx: Ctx, list?: { ordered: boolean; n: number }) => {
    const kids = node.childNodes
    for (let k = 0; k < kids.length; k++) {
      const n = kids[k]
      if (n.nodeType === 3 || n.nodeType === 4) { pushText(n.nodeValue ?? '', ctx); continue }
      if (n.nodeType !== 1) continue
      const el = n as Element
      const tag = nameOf(el)
      if (SKIP.has(tag) || hidden(el)) continue
      const id = attr(el, 'id') || (tag === 'a' ? attr(el, 'name') : '')
      if (id) ids.push(id)
      if (/^h[1-6]$/.test(tag)) {
        flush(ctx)
        const c: Ctx = { ...ctx, b: true, heading: +tag[1], align: alignOf(el) ?? ctx.align }
        walk(el, c); flush(c); continue
      }
      switch (tag) {
        case 'br': if (runs.length) pushText('\n', { ...ctx, pre: true }); continue
        case 'img': image(attr(el, 'src'), attr(el, 'alt'), ctx); continue
        case 'image': image(el.getAttributeNS?.(XLINK, 'href') || attr(el, 'xlink:href') || attr(el, 'href'), '', ctx); continue
        case 'svg': {
          const imgs = el.getElementsByTagName('image')
          for (let j = 0; j < imgs.length; j++) image(imgs[j].getAttributeNS?.(XLINK, 'href') || attr(imgs[j], 'xlink:href') || attr(imgs[j], 'href'), '', ctx)
          continue
        }
        case 'hr': flush(ctx); out.push({ t: 'hr', ids }); ids = []; continue
        case 'b': case 'strong': case 'th': walk(el, { ...ctx, b: true }, list); continue
        case 'i': case 'em': case 'cite': case 'var': case 'dfn': walk(el, { ...ctx, i: !ctx.i }, list); continue
        case 'code': case 'tt': case 'kbd': case 'samp': walk(el, { ...ctx, mono: true }, list); continue
        case 'a': { const h = attr(el, 'href'); walk(el, { ...ctx, href: h || ctx.href }, list); continue }
        case 'pre': { flush(ctx); const c: Ctx = { ...ctx, pre: true, mono: true, kind: 'pre' }; walk(el, c); flush(c); continue }
        case 'blockquote': { flush(ctx); const c: Ctx = { ...ctx, indent: ctx.indent + 1, kind: 'quote' }; walk(el, c); flush(c); continue }
        case 'ul': case 'ol': {
          flush(ctx)
          const start = parseInt(attr(el, 'start'), 10)
          walk(el, { ...ctx, indent: ctx.indent + 1 }, { ordered: tag === 'ol', n: Number.isFinite(start) ? start - 1 : 0 })
          continue
        }
        case 'li': {
          flush(ctx)
          if (list) list.n++
          pendingBullet = list?.ordered ? `${list.n}.` : '\u2022'
          const c: Ctx = { ...ctx, kind: 'li', align: 'left' }
          walk(el, c); flush(c); pendingBullet = undefined; continue
        }
        case 'table': case 'thead': case 'tbody': case 'tfoot': flush(ctx); walk(el, ctx); continue
        case 'tr': {
          flush(ctx)
          const c: Ctx = { ...ctx, align: 'left' }
          const cells = el.childNodes
          let first = true
          for (let j = 0; j < cells.length; j++) {
            const cell = cells[j] as Element
            if (cell.nodeType !== 1 || !/^t[dh]$/.test(nameOf(cell))) continue
            if (!first) pushText('   ', { ...c, pre: true })
            walk(cell, nameOf(cell) === 'th' ? { ...c, b: true } : c); first = false
          }
          flush(c); continue
        }
        case 'span': case 'font': case 'small': case 'big': case 'sup': case 'sub': case 'u': case 's': case 'del': case 'ins': case 'mark': case 'abbr': case 'q': case 'label': case 'time': case 'bdi': case 'bdo': case 'ruby': {
          const st = attr(el, 'style')
          const c: Ctx = { ...ctx, b: ctx.b || /font-weight\s*:\s*(bold|[6-9]00)/i.test(st), i: ctx.i !== /font-style\s*:\s*italic/i.test(st) ? true : ctx.i }
          if (tag === 'q') pushText('\u201c', c)
          walk(el, c, list)
          if (tag === 'q') pushText('\u201d', c)
          continue
        }
        case 'rt': case 'rp': continue
        default:
          if (BLOCK.has(tag) || tag === 'td') {
            flush(ctx)
            const a = alignOf(el)
            const c: Ctx = a ? { ...ctx, align: a } : ctx
            walk(el, c, list); flush(c)
          } else walk(el, ctx, list)
      }
    }
  }
  const body = doc.getElementsByTagName('body')[0] ?? doc.documentElement
  const root: Ctx = { b: false, i: false, mono: false, pre: false, indent: 0, kind: 'p' }
  if (body) { walk(body, root); flush(root) }
  if (ids.length) out.push({ t: 'hr', ids: [...ids] }) // trailing anchors still need a page; drawn as nothing when last
  return out
}

/* ---------- text encoding ---------- */

// Characters the standard PDF fonts (WinAnsi) can show besides Latin-1
const WIN_EXTRA = new Set('\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178'.split(''))
export function winAnsiSafe(s: string) {
  for (const ch of s) { const c = ch.codePointAt(0)!; if (!((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || c === 10 || WIN_EXTRA.has(ch))) return false }
  return true
}
const FALLBACK: Record<string, string> = { '\u2010': '-', '\u2011': '-', '\u2012': '-', '\u2015': '\u2014', '\u2032': "'", '\u2033': '"', '\u2009': ' ', '\u200a': ' ', '\u2002': ' ', '\u2003': ' ', '\u202f': ' ', '\u2007': ' ', '\u2008': ' ', '\u200b': '', '\u200c': '', '\u200d': '', '\ufeff': '', '\u2060': '' }
const normalizeText = (s: string) => s.replace(/[\u2010-\u2012\u2015\u2032\u2033\u2002-\u200d\u202f\u2060\ufeff]/g, (c) => FALLBACK[c] ?? c)

/* ---------- layout ---------- */

export interface VectorImage { data: Uint8Array; format: 'JPEG' | 'PNG'; w: number; h: number }
export interface VectorOptions {
  pageWidth: number; pageHeight: number; margin: number
  fontSize: number; font: 'serif' | 'sans'; justify?: boolean; lineHeight?: number
  cover?: boolean; toc?: boolean; pageNumbers?: boolean
  /** Base64 TrueType files (normal, bold, italic, bolditalic) for a Unicode family; used for sans text and for any word the standard fonts cannot show. */
  unicodeFonts?: Partial<Record<'normal' | 'bold' | 'italic' | 'bolditalic', string>> | null
  /** Turn a GIF, WebP, SVG or other image into PNG or JPEG bytes (browser canvas). Return null to skip the image. */
  convertImage?: (bytes: Uint8Array, mime: string) => Promise<VectorImage | null>
  onProgress?: (p: number, chapter: number) => void
  /** Called between chapters so the page can stay responsive; may be slow on purpose. */
  yieldFn?: () => Promise<void>
  signal?: AbortSignal
}
export interface VectorResult { pdf: JsPDF; pages: number; chapterPage: Map<string, number>; anchorPage: Map<string, number>; tocEntries: (TocEntry & { page: number })[] }

interface Seg { text: string; font: string; style: string; w: number; href?: string; size: number }
interface Word { segs: Seg[]; w: number; space: number; brk?: boolean }

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp' }
const abortErr = () => Object.assign(new Error('Conversion cancelled'), { name: 'AbortError' })

export async function buildVectorPdf(book: Book, o: VectorOptions): Promise<VectorResult> {
  const { jsPDF } = await import('jspdf')
  const W = o.pageWidth, H = o.pageHeight, M = o.margin
  const pdf = new jsPDF({ unit: 'pt', format: [W, H], orientation: W > H ? 'landscape' : 'portrait', compress: true })
  // the Unicode family is registered on first use, so books that only need the standard fonts do not carry it
  const uniStyles = new Set(Object.keys(o.unicodeFonts ?? {}).filter((k) => (o.unicodeFonts as any)[k]))
  const uni = o.unicodeFonts?.normal ? 'OFUni' : ''
  const registered = new Set<string>()
  const needUni = (style: string) => {
    const st = uniStyles.has(style) ? style : 'normal'
    if (!registered.has(st)) {
      const fn = `OFUni-${st}.ttf`
      pdf.addFileToVFS(fn, (o.unicodeFonts as any)[st]); pdf.addFont(fn, uni, st); registered.add(st)
    }
    return st
  }
  const base = o.font === 'sans' ? (uni || 'helvetica') : 'times'
  const size = o.fontSize
  const LH = o.lineHeight ?? 1.45
  const bottomPad = o.pageNumbers ? Math.max(M, 30) : M
  const contentW = W - 2 * M
  const top = M, bottom = H - bottomPad

  // width measurement with a cache (unit widths are size independent)
  const unitCache = new Map<string, number>()
  let curFont = '', curStyle = ''
  const setFont = (f: string, s: string) => { if (f !== curFont || s !== curStyle) { pdf.setFont(f, s); curFont = f; curStyle = s } }
  const unitW = (text: string, f: string, s: string) => {
    const k = f + '|' + s + '|' + text
    let v = unitCache.get(k)
    if (v === undefined) { setFont(f, s); v = pdf.getStringUnitWidth(text); unitCache.set(k, v) }
    return v
  }
  const baseFont = (style: string): [string, string] => (base === uni && uni ? [uni, needUni(style)] : [base, style])
  const styleOf = (b?: boolean, i?: boolean) => (b && i ? 'bolditalic' : b ? 'bold' : i ? 'italic' : 'normal')
  const pick = (r: Run, text: string): [string, string, string] => {
    const st = styleOf(r.b, r.i)
    const fam = r.mono ? 'courier' : base
    if (fam === uni) return [fam, needUni(st), text]
    if (winAnsiSafe(text)) return [fam, st, text]
    if (uni) return [uni, needUni(st), text]
    return [fam, st, [...text].map((ch) => (winAnsiSafe(ch) ? ch : '?')).join('')]
  }

  const toWords = (runs: Run[], sz: number, pre = false): Word[] => {
    const words: Word[] = []
    let cur: Word | null = null
    for (const r of runs) {
      // a line may break after an em or en dash (marked with \u0001); preformatted spaces never break
      const t = pre ? normalizeText(r.text).replace(/[ \t]/g, '\u00a0') : normalizeText(r.text).replace(/\u0001/g, '').replace(/([\u2014\u2013])(?=[^\s\u2014\u2013])/g, '$1\u0001')
      const parts = t.split(/(\n|\u0001|[ \t\u00a0]+)/)
      for (const part of parts) {
        if (!part) continue
        if (part === '\u0001') { if (cur) { words.push(cur); cur = null } continue }
        if (part === '\n') {
          if (cur) { words.push(cur); cur = null; words[words.length - 1].brk = true }
          else if (words.length && words[words.length - 1].brk) words.push({ segs: [], w: 0, space: 0, brk: true }) // blank line (two <br>)
          else if (words.length) words[words.length - 1].brk = true
          continue
        }
        if (/^[ \t\u00a0]+$/.test(part) && !part.includes('\u00a0')) {
          if (cur) { const [f, s] = pick(r, ' '); cur.space = unitW(' ', f, s) * sz; words.push(cur); cur = null }
          continue
        }
        const [f, s, txt] = pick(r, part)
        const w = unitW(txt, f, s) * sz
        const seg: Seg = { text: txt, font: f, style: s, w, href: r.href, size: sz }
        if (!cur) cur = { segs: [], w: 0, space: 0 }
        cur.segs.push(seg); cur.w += w
      }
    }
    if (cur) words.push(cur)
    return words
  }
  // break a single word wider than the line into pieces
  const splitWide = (wd: Word, maxW: number): Word[] => {
    const out: Word[] = []
    let piece: Word = { segs: [], w: 0, space: 0 }
    for (const sg of wd.segs) {
      let buf = ''
      for (const ch of sg.text) {
        const cw = unitW(ch, sg.font, sg.style) * sg.size
        if (piece.w + cw > maxW && (piece.segs.length || buf)) {
          if (buf) { const w = unitW(buf, sg.font, sg.style) * sg.size; piece.segs.push({ ...sg, text: buf, w }); }
          out.push(piece); piece = { segs: [], w: 0, space: 0 }; buf = ''
        }
        buf += ch; piece.w += cw
      }
      if (buf) piece.segs.push({ ...sg, text: buf, w: unitW(buf, sg.font, sg.style) * sg.size })
    }
    piece.space = wd.space; piece.brk = wd.brk
    out.push(piece)
    return out
  }

  // page state
  let page = 1, y = top, pageHasContent = false
  const newPage = () => { pdf.addPage([W, H], W > H ? 'landscape' : 'portrait'); page = pdf.getNumberOfPages(); y = top; pageHasContent = false }
  const ensure = (h: number) => { if (y + h > bottom && pageHasContent) newPage() }
  const internalLinks: { page: number; x: number; y: number; w: number; h: number; target: string }[] = []
  const chapterPage = new Map<string, number>()
  const anchorPage = new Map<string, number>()
  let curChapter = ''
  const mark = (ids: string[]) => { for (const id of ids) if (!anchorPage.has(`${curChapter}#${id}`)) anchorPage.set(`${curChapter}#${id}`, page) }

  const drawLines = (words: Word[], sz: number, x0: number, maxW: number, align: Align, color: string, lineGap: number) => {
    let i = 0
    const lh = sz * LH
    pdf.setTextColor(color)
    while (i < words.length) {
      // fill one line
      let j = i, w = 0
      const line: Word[] = []
      while (j < words.length) {
        let wd = words[j]
        const add = (line.length ? line[line.length - 1].space : 0) + wd.w
        if (line.length && w + add > maxW) break
        if (!line.length && wd.w > maxW) { const parts = splitWide(wd, maxW); words.splice(j, 1, ...parts); wd = parts[0] }
        w += (line.length ? line[line.length - 1].space : 0) + wd.w
        line.push(wd); j++
        if (wd.brk) break
      }
      ensure(lh)
      const baseline = y + sz * 0.92
      const last = j >= words.length || line[line.length - 1].brk
      const gaps = line.slice(0, -1).filter((wd) => wd.space > 0).length
      let extra = 0, x = x0
      if (align === 'justify' && !last && gaps > 0) extra = (maxW - w) / gaps
      else if (align === 'center') x = x0 + (maxW - w) / 2
      else if (align === 'right') x = x0 + maxW - w
      const single = line.every((wd) => wd.segs.every((sg) => sg.font !== uni))
      if (extra > 0 && !single) {
        // Identity-H text ignores word spacing (Tw), so place each word
        for (let k = 0; k < line.length; k++) { x = drawWord(line[k], x, baseline, sz); x += line[k].space ? line[k].space + extra : 0 }
      } else {
        // one text call per font change; justified lines use the PDF word spacing operator on the spaces
        const write = (pdf as any).internal.write as (...a: string[]) => void
        if (extra > 0) write(`${extra.toFixed(3)} Tw`)
        let buf = '', bx = x, bf = '', bs = '', bw = 0, bh: string | undefined
        const out = () => { if (buf) { setFont(bf, bs); pdf.setFontSize(sz); pdf.text(buf, bx, baseline); linkFor(bh, bx, baseline, bw, sz) } buf = ''; bw = 0 }
        for (let k = 0; k < line.length; k++) {
          const wd = line[k]
          for (const sg of wd.segs) {
            if (sg.font !== bf || sg.style !== bs || sg.href !== bh) { out(); bx = x; bf = sg.font; bs = sg.style; bh = sg.href }
            buf += sg.text; bw += sg.w; x += sg.w
          }
          if (k < line.length - 1) {
            if (wd.space) { buf += ' '; bw += wd.space + extra; x += wd.space + extra }
          }
        }
        out()
        if (extra > 0) write('0 Tw')
      }
      y += lh; pageHasContent = true
      i = j
    }
    y += lineGap
  }
  const linkFor = (href: string | undefined, x: number, baseline: number, w: number, sz: number) => {
    if (!href || w <= 0) return
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      const u = safeUrl(href)
      if (u && /^(https?:|mailto:)/i.test(u)) pdf.link(x, baseline - sz * 0.8, w, sz * 1.05, { url: u })
      return
    }
    const target = href.startsWith('#') ? `${curChapter}${href}` : resolvePath(curChapter, href) + (href.includes('#') ? '#' + href.split('#')[1] : '')
    internalLinks.push({ page, x, y: baseline - sz * 0.8, w, h: sz * 1.05, target })
  }
  const drawWord = (wd: Word, x: number, baseline: number, sz: number) => {
    for (const sg of wd.segs) {
      setFont(sg.font, sg.style); pdf.setFontSize(sz)
      pdf.text(sg.text, x, baseline)
      linkFor(sg.href, x, baseline, sg.w, sz)
      x += sg.w
    }
    return x
  }

  // images
  const imgCache = new Map<string, (VectorImage & { alias: string }) | null>()
  const getImage = async (path: string) => {
    if (imgCache.has(path)) return imgCache.get(path)!
    let res: (VectorImage & { alias: string }) | null = null
    try {
      const f = book.zip.file(path)
      if (f) {
        const bytes = await f.async('uint8array')
        const ext = path.split('.').pop()?.toLowerCase() ?? ''
        const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8
        const isPng = bytes[0] === 0x89 && bytes[1] === 0x50
        if (isJpeg || isPng) {
          const p = pdf.getImageProperties(bytes)
          res = { data: bytes, format: isJpeg ? 'JPEG' : 'PNG', w: p.width, h: p.height, alias: 'img' + imgCache.size }
        } else if (o.convertImage) {
          const c = await o.convertImage(bytes, MIME[ext] ?? 'application/octet-stream')
          if (c) res = { ...c, alias: 'img' + imgCache.size }
        }
      }
    } catch { res = null }
    imgCache.set(path, res)
    return res
  }
  const drawImage = async (path: string, ids: string[]) => {
    const im = await getImage(path)
    if (!im) return
    const availH = bottom - top
    let w = im.w * 0.75, h = im.h * 0.75
    const s = Math.min(1, contentW / w, (availH * 0.92) / h)
    w *= s; h *= s
    if (y + h > bottom && pageHasContent) newPage()
    mark(ids)
    pdf.addImage(im.data, im.format, M + (contentW - w) / 2, y, w, h, im.alias, 'FAST')
    y += h + size * 0.6; pageHasContent = true
  }

  // cover
  let coverPages = 0
  const cover = o.cover && book.coverHref ? await getImage(book.coverHref) : null
  if (cover) {
    const s = Math.min(W / cover.w, H / cover.h)
    pdf.addImage(cover.data, cover.format, (W - cover.w * s) / 2, (H - cover.h * s) / 2, cover.w * s, cover.h * s, cover.alias, 'FAST')
    coverPages = 1
  }

  // reserve contents pages (entries are known before layout)
  const tocSrc: TocEntry[] = book.toc.length ? book.toc : book.chapters.map((c, i) => ({ title: c.title || `Section ${i + 1}`, href: c.href, level: 0 }))
  const tocLineH = 18
  const tocPerPage = Math.max(5, Math.floor((bottom - top - 50) / tocLineH))
  const tocPages = o.toc && tocSrc.length ? Math.ceil(tocSrc.length / tocPerPage) : 0
  for (let k = 0; k < tocPages; k++) { if (coverPages || k > 0) newPage(); pageHasContent = true }
  let firstChapter = true
  if (coverPages && !tocPages) pageHasContent = true

  const parser = new DOMParser()
  const n = book.chapters.length
  for (let ci = 0; ci < n; ci++) {
    if (o.signal?.aborted) throw abortErr()
    const ch = book.chapters[ci]
    o.onProgress?.(ci / n, ci)
    const raw = await book.zip.file(ch.href)?.async('string')
    if (!raw) continue
    let doc = parser.parseFromString(raw, 'application/xhtml+xml')
    if (doc.getElementsByTagName('parsererror').length || !doc.getElementsByTagName('body').length) doc = parser.parseFromString(raw, 'text/html')
    const blocks = chapterBlocks(doc, ch.href)
    const hasText = blocks.some((b) => b.t === 'h' || b.t === 'p')
    const imgs = blocks.filter((b) => b.t === 'img') as Extract<Block, { t: 'img' }>[]
    // a cover-only page when the cover is already drawn
    if (!hasText && imgs.length <= 1 && (imgs.length === 0 || (cover && (imgs[0].src === book.coverHref || ci === 0)))) {
      if (imgs.length && cover) chapterPage.set(ch.href, 1)
      continue
    }
    if (!firstChapter || pageHasContent) newPage()
    firstChapter = false
    curChapter = ch.href
    chapterPage.set(ch.href, page)
    // chapters without any heading get their TOC title
    if (!blocks.some((b) => b.t === 'h') && ch.title && hasText) blocks.unshift({ t: 'h', level: 2, runs: [{ text: ch.title, b: true }], ids: [], align: 'left' })
    let since = 0
    for (const b of blocks) {
      if (++since % 400 === 0) { if (o.signal?.aborted) throw abortErr(); await o.yieldFn?.() }
      if (b.t === 'img') { await drawImage(b.src, b.ids); continue }
      if (b.t === 'hr') {
        mark(b.ids)
        if (b === blocks[blocks.length - 1]) continue
        ensure(size)
        pdf.setDrawColor('#b8bcc6'); pdf.setLineWidth(0.6)
        pdf.line(M + contentW * 0.35, y + size * 0.5, M + contentW * 0.65, y + size * 0.5)
        y += size * 1.2; pageHasContent = true; continue
      }
      if (b.t === 'h') {
        const sz = size * ([1.9, 1.55, 1.3, 1.15, 1.05, 1][b.level - 1] ?? 1)
        const before = pageHasContent && y > top ? sz * 0.9 : 0
        // keep the heading with at least two lines of the next block
        if (y + before + sz * LH + size * LH * 2 > bottom && pageHasContent) newPage()
        else y += before
        mark(b.ids)
        drawLines(toWords(b.runs.map((r) => ({ ...r, b: true })), sz), sz, M, contentW, b.align === 'justify' ? 'left' : b.align, '#111111', sz * 0.55)
        continue
      }
      const ind = Math.min(b.indent, 6) * size * 1.4
      const sz = b.kind === 'pre' ? size * 0.88 : size
      const words = toWords(b.runs, sz, b.kind === 'pre')
      if (!words.length) continue
      ensure(sz * LH)
      mark(b.ids)
      if (b.bullet) {
        setFont(...baseFont('normal')); pdf.setFontSize(sz); pdf.setTextColor('#333333')
        const bw = unitW(b.bullet, curFont, curStyle) * sz
        pdf.text(b.bullet, M + ind - bw - sz * 0.4, y + sz * 0.92)
      }
      const align: Align = b.align === 'justify' && o.justify === false ? 'left' : b.align
      drawLines(words, sz, M + ind, contentW - ind - (b.kind === 'quote' ? size * 1.4 : 0), align, b.kind === 'quote' ? '#333333' : '#1a1a1a', sz * (b.kind === 'li' ? 0.25 : 0.45))
    }
    await o.yieldFn?.()
  }
  if (o.signal?.aborted) throw abortErr()
  o.onProgress?.(0.98, n)

  // internal links
  const resolveTarget = (t: string) => anchorPage.get(t) ?? chapterPage.get(t.split('#')[0])
  for (const l of internalLinks) {
    const p = resolveTarget(l.target)
    if (!p) continue
    pdf.setPage(l.page); pdf.link(l.x, l.y, l.w, l.h, { pageNumber: p })
  }

  // contents
  const total = pdf.getNumberOfPages()
  const label = (p: number) => String(p - coverPages)
  const entries = tocSrc.map((t) => ({ ...t, page: resolveTarget(t.href)! })).filter((t) => t.page)
  if (tocPages) {
    for (let k = 0; k < tocPages; k++) {
      pdf.setPage(coverPages + 1 + k)
      let ty = top + 10
      if (k === 0) { setFont(...baseFont('bold')); pdf.setFontSize(20); pdf.setTextColor('#111111'); pdf.text('Contents', M, ty + 14); ty += 44 }
      for (const e of entries.slice(k * tocPerPage, (k + 1) * tocPerPage)) {
        const indent = Math.min(e.level, 3) * 14
        const st = e.level ? 'normal' : 'bold'
        const fs = e.level ? 10.5 : 11.5
        const [f, s, txt] = pick({ text: e.title || 'Untitled', b: !e.level }, normalizeText(e.title || 'Untitled'))
        setFont(f, s || st); pdf.setFontSize(fs); pdf.setTextColor('#222222')
        const maxW = contentW - indent - 40
        let title = txt
        while (title.length > 1 && unitW(title, f, s) * fs > maxW) title = title.slice(0, -2) + '\u2026'
        pdf.text(title, M + indent, ty)
        const tw = unitW(title, f, s) * fs
        setFont(...baseFont('normal')); pdf.setTextColor('#9aa0ad')
        const dw = unitW('.', curFont, curStyle) * fs
        const dots = '.'.repeat(Math.max(0, Math.floor((contentW - indent - tw - 30) / dw)))
        pdf.text(dots, M + indent + tw + 4, ty)
        pdf.setTextColor('#222222')
        pdf.text(label(e.page), W - M, ty, { align: 'right' })
        pdf.link(M + indent, ty - 10, contentW - indent, 14, { pageNumber: e.page })
        ty += tocLineH
      }
    }
  }
  // page numbers
  if (o.pageNumbers) {
    for (let p = coverPages + 1; p <= total; p++) {
      pdf.setPage(p); setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor('#8a8f9c')
      pdf.text(label(p), W / 2, H - Math.min(bottomPad / 2, 20), { align: 'center' })
    }
  }
  // outline
  const parents: unknown[] = []
  const outline = (pdf as any).outline
  for (const e of entries) {
    const node = outline.add(e.level > 0 ? parents[e.level - 1] ?? null : null, (e.title || 'Untitled').replace(/\s+/g, ' ').trim(), { pageNumber: e.page })
    parents[e.level] = node; parents.length = e.level + 1
  }
  pdf.setProperties({ title: book.title, author: book.author, creator: 'OpenFile', subject: 'Converted from EPUB' })
  if (book.language) (pdf as any).setLanguage?.(book.language)
  o.onProgress?.(1, n)
  return { pdf, pages: total, chapterPage, anchorPage, tocEntries: entries }
}
