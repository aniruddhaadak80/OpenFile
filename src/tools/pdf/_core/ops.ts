/* Pure pdf-lib operations for the core PDF tools (no DOM). Import this module dynamically
   from tool components so pdf-lib stays out of the initial tool chunk. */
import {
  PDFDocument, PDFPage, PDFFont, PDFName, PDFDict, PDFArray, PDFNumber, PDFRef, PDFHexString, PDFString, PDFRawStream, PDFStream,
  StandardFonts, rgb, degrees, PDFContentStream, PDFOperator, PDFImage,
} from 'pdf-lib'

export type Bytes = Uint8Array
export type Rot = 0 | 90 | 180 | 270

/* ---------------------------------------------------------------- loading */

export class PdfError extends Error {}

export async function load(bytes: Bytes | ArrayBuffer, opts: { allowEncrypted?: boolean; updateMetadata?: boolean } = {}) {
  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: opts.updateMetadata ?? false })
  } catch (e: any) {
    throw new PdfError(`This file could not be parsed as a PDF (${e?.message ?? e}). Try the Repair PDF tool first.`)
  }
  if (doc.isEncrypted && !opts.allowEncrypted) throw new PdfError('This PDF is encrypted. Remove the password with Unlock PDF first, then try again.')
  return doc
}

export const save = (doc: PDFDocument, objectStreams = true) => doc.save({ useObjectStreams: objectStreams })

export function normRot(a: number): Rot { return ((((Math.round(a / 90) * 90) % 360) + 360) % 360) as Rot }

/** Visible box (crop box) of a page */
export function box(page: PDFPage) {
  const b = page.getCropBox()
  return { x: b.x, y: b.y, w: b.width, h: b.height }
}

/** Frame in "visual" coordinates (how the page appears in a viewer, origin bottom-left) → raw coordinates. */
export function visualFrame(page: PDFPage) {
  const r = normRot(page.getRotation().angle)
  const { x, y, w, h } = box(page)
  const vw = r % 180 ? h : w, vh = r % 180 ? w : h
  const toRaw = (vx: number, vy: number): [number, number] => {
    switch (r) {
      case 90: return [x + w - vy, y + vx]
      case 180: return [x + w - vx, y + h - vy]
      case 270: return [x + vy, y + h - vx]
      default: return [x + vx, y + vy]
    }
  }
  return { r, vw, vh, toRaw }
}

/* ---------------------------------------------------------------- page sets */

export async function copyInto(out: PDFDocument, src: PDFDocument, indices: number[]) {
  const pages = await out.copyPages(src, indices)
  pages.forEach((p) => out.addPage(p))
  return pages
}

/** Build a new PDF containing `indices` (0-based, may repeat) of the source. */
export async function pick(bytes: Bytes, indices: number[], rotations?: Record<number, number>) {
  const src = await load(bytes)
  const out = await PDFDocument.create()
  const pages = await copyInto(out, src, indices)
  if (rotations) pages.forEach((p, k) => { const extra = rotations[indices[k]] ?? 0; if (extra) p.setRotation(degrees(normRot(p.getRotation().angle + extra))) })
  return save(out)
}

export async function pageCount(bytes: Bytes) { return (await load(bytes, { allowEncrypted: true })).getPageCount() }

/* ---------------------------------------------------------------- merge */

export type MergeInput = { name: string; bytes: Bytes; indices?: number[]; rotate?: number }
export async function merge(inputs: MergeInput[], opts: { bookmarks?: boolean; onProgress?: (p: number) => void } = {}) {
  const out = await PDFDocument.create()
  const marks: { title: string; page: PDFPage }[] = []
  for (let k = 0; k < inputs.length; k++) {
    const inp = inputs[k]
    let src: PDFDocument
    try { src = await load(inp.bytes) } catch (e: any) { throw new PdfError(`${inp.name}: ${e.message}`) }
    const idx = inp.indices ?? src.getPageIndices()
    if (!idx.length) continue
    const pages = await copyInto(out, src, idx)
    if (inp.rotate) pages.forEach((p) => p.setRotation(degrees(normRot(p.getRotation().angle + inp.rotate!))))
    marks.push({ title: inp.name.replace(/\.pdf$/i, ''), page: pages[0] })
    opts.onProgress?.((k + 1) / inputs.length)
  }
  if (!out.getPageCount()) throw new PdfError('Nothing to merge — every page range was empty.')
  if (opts.bookmarks) addOutline(out, marks)
  return save(out)
}

/** Flat outline (bookmarks) */
export function addOutline(doc: PDFDocument, items: { title: string; page: PDFPage }[]) {
  if (!items.length) return
  const ctx = doc.context
  const rootRef = ctx.nextRef()
  const refs = items.map(() => ctx.nextRef())
  items.forEach((it, i) => {
    const d = ctx.obj({}) as PDFDict
    d.set(PDFName.of('Title'), PDFHexString.fromText(it.title))
    d.set(PDFName.of('Parent'), rootRef)
    d.set(PDFName.of('Dest'), ctx.obj([it.page.ref, PDFName.of('Fit')]))
    if (i > 0) d.set(PDFName.of('Prev'), refs[i - 1])
    if (i < items.length - 1) d.set(PDFName.of('Next'), refs[i + 1])
    ctx.assign(refs[i], d)
  })
  const root = ctx.obj({}) as PDFDict
  root.set(PDFName.of('Type'), PDFName.of('Outlines'))
  root.set(PDFName.of('First'), refs[0])
  root.set(PDFName.of('Last'), refs[refs.length - 1])
  root.set(PDFName.of('Count'), PDFNumber.of(items.length))
  ctx.assign(rootRef, root)
  doc.catalog.set(PDFName.of('Outlines'), rootRef)
  doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'))
}

/* ---------------------------------------------------------------- split */

/** Groups of 0-based page indices */
export function groupsEvery(total: number, n: number) {
  const g: number[][] = []
  for (let i = 0; i < total; i += n) g.push(Array.from({ length: Math.min(n, total - i) }, (_, k) => i + k))
  return g
}

/** "1-3, 4-8, 9-" → [[0,1,2],[3..7],[8..]] — each comma-separated part becomes its own group */
export function groupsFromRanges(input: string, total: number) {
  const g: number[][] = []
  for (const part of input.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d*)\s*-\s*(\d*)$/)
    let a: number, b: number
    if (m) { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : total }
    else if (/^\d+$/.test(part)) { a = b = +part }
    else throw new PdfError(`"${part}" is not a valid range. Use forms like 1-3, 5, 8-.`)
    const lo = Math.max(1, Math.min(a, b)), hi = Math.min(total, Math.max(a, b))
    if (lo > total) continue
    const arr: number[] = []
    if (a <= b) for (let i = lo; i <= hi; i++) arr.push(i - 1)
    else for (let i = hi; i >= lo; i--) arr.push(i - 1) // reversed range "5-1"
    if (arr.length) g.push(arr)
  }
  return g
}

export async function splitGroups(bytes: Bytes, groups: number[][], onProgress?: (p: number) => void) {
  const src = await load(bytes)
  const outs: Bytes[] = []
  for (let k = 0; k < groups.length; k++) {
    const out = await PDFDocument.create()
    await copyInto(out, src, groups[k])
    outs.push(await save(out))
    onProgress?.((k + 1) / groups.length)
  }
  return outs
}

/** Greedy grouping so every part stays under ~maxBytes (approximation based on per-page size). */
export async function groupsBySize(bytes: Bytes, maxBytes: number, onProgress?: (p: number) => void) {
  const src = await load(bytes)
  const n = src.getPageCount()
  const empty = (await save(await PDFDocument.create())).length
  const sizes: number[] = []
  for (let i = 0; i < n; i++) {
    const out = await PDFDocument.create(); await copyInto(out, src, [i])
    sizes.push((await save(out)).length - empty)
    onProgress?.((i + 1) / n * 0.5)
  }
  // shared resources (fonts) are counted per page; refine by actually measuring candidate parts
  const groups: number[][] = []
  let cur: number[] = [], est = empty
  for (let i = 0; i < n; i++) {
    if (cur.length && est + sizes[i] > maxBytes) {
      // try real size, shared fonts often make it fit
      const out = await PDFDocument.create(); await copyInto(out, src, [...cur, i])
      const real = (await save(out)).length
      if (real > maxBytes) { groups.push(cur); cur = []; est = empty }
      else { est = real; cur.push(i); onProgress?.(0.5 + (i + 1) / n * 0.5); continue }
    }
    cur.push(i); est += sizes[i]
    onProgress?.(0.5 + (i + 1) / n * 0.5)
  }
  if (cur.length) groups.push(cur)
  return groups
}

/* ---------------------------------------------------------------- rotate */

export async function rotate(bytes: Bytes, rotations: Record<number, number>) {
  const doc = await load(bytes)
  doc.getPages().forEach((p, i) => { const r = rotations[i]; if (r) p.setRotation(degrees(normRot(p.getRotation().angle + r))) })
  return save(doc)
}

/* ---------------------------------------------------------------- organize */

export type OrgItem = { kind: 'page'; src: number; page: number; rotate: number } | { kind: 'blank'; w: number; h: number; rotate: number }
export async function organize(sources: Bytes[], items: OrgItem[]) {
  const docs = await Promise.all(sources.map((b) => load(b)))
  const out = await PDFDocument.create()
  // copy all needed pages per source in one go (keeps shared resources deduped)
  const need = docs.map(() => new Set<number>())
  items.forEach((it) => { if (it.kind === 'page') need[it.src].add(it.page) })
  const copied = await Promise.all(docs.map(async (d, s) => {
    const idx = [...need[s]]
    const pages = idx.length ? await out.copyPages(d, idx) : []
    const m = new Map<number, PDFPage>(); idx.forEach((p, k) => m.set(p, pages[k])); return m
  }))
  const used = new Set<PDFPage>()
  for (const it of items) {
    if (it.kind === 'blank') {
      const p = out.addPage([it.w, it.h]); if (it.rotate) p.setRotation(degrees(normRot(it.rotate))); continue
    }
    let p = copied[it.src].get(it.page)!
    if (used.has(p)) { [p] = await out.copyPages(docs[it.src], [it.page]) } // duplicates need their own page object
    used.add(p)
    out.addPage(p)
    if (it.rotate) p.setRotation(degrees(normRot(p.getRotation().angle + it.rotate)))
  }
  if (!out.getPageCount()) throw new PdfError('The document has no pages left.')
  return save(out)
}

/* ---------------------------------------------------------------- insert */

export type Insertion = { at: number; kind: 'blank'; count: number; size?: [number, number] } | { at: number; kind: 'pdf'; bytes: Bytes; indices?: number[] }
/** `at` = number of original pages that come before the insertion (0 = start). */
export async function insertPages(bytes: Bytes, insertions: Insertion[]) {
  const src = await load(bytes)
  const n = src.getPageCount()
  const out = await PDFDocument.create()
  const all = await out.copyPages(src, src.getPageIndices())
  const sorted = [...insertions].sort((a, b) => a.at - b.at)
  const extDocs = new Map<Bytes, PDFDocument>()
  let k = 0
  const flush = async (at: number) => {
    while (k < sorted.length && sorted[k].at === at) {
      const ins = sorted[k++]
      if (ins.kind === 'blank') {
        const ref = all[Math.min(Math.max(at - 1, 0), n - 1)]
        const size: [number, number] = ins.size ?? visualSize(ref)
        for (let c = 0; c < ins.count; c++) out.addPage(size)
      } else {
        let d = extDocs.get(ins.bytes)
        if (!d) { d = await load(ins.bytes); extDocs.set(ins.bytes, d) }
        await copyInto(out, d, ins.indices ?? d.getPageIndices())
      }
    }
  }
  for (let i = 0; i <= n; i++) { await flush(i); if (i < n) out.addPage(all[i]) }
  return save(out)
}

export function visualSize(p: PDFPage): [number, number] {
  const { vw, vh } = visualFrame(p); return [vw, vh]
}

/* ---------------------------------------------------------------- text helpers */

export type FontName = 'Helvetica' | 'Helvetica-Bold' | 'Times-Roman' | 'Times-Bold' | 'Courier' | 'Courier-Bold'
export const FONT_OPTIONS: { value: FontName; label: string }[] = [
  { value: 'Helvetica', label: 'Helvetica' }, { value: 'Helvetica-Bold', label: 'Helvetica Bold' },
  { value: 'Times-Roman', label: 'Times' }, { value: 'Times-Bold', label: 'Times Bold' },
  { value: 'Courier', label: 'Courier' }, { value: 'Courier-Bold', label: 'Courier Bold' },
]
const FONT_MAP: Record<FontName, StandardFonts> = {
  Helvetica: StandardFonts.Helvetica, 'Helvetica-Bold': StandardFonts.HelveticaBold, 'Times-Roman': StandardFonts.TimesRoman,
  'Times-Bold': StandardFonts.TimesRomanBold, Courier: StandardFonts.Courier, 'Courier-Bold': StandardFonts.CourierBold,
}
export const embedFont = (doc: PDFDocument, f: FontName) => doc.embedFont(FONT_MAP[f] ?? StandardFonts.Helvetica)

/** Replace characters the standard (WinAnsi) fonts cannot encode */
export function safeText(font: PDFFont, s: string) {
  const norm = s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...')
  let out = ''
  for (const ch of norm) { try { font.encodeText(ch); out += ch } catch { out += '?' } }
  return out
}

export function hexToRgb(hex: string) {
  const h = hex.replace('#', '')
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0')
  const n = parseInt(v.slice(0, 6), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/** Draw text so that it appears upright (or at `angle`) in the viewer regardless of /Rotate.
    (vx, vy) is the baseline-left origin in visual coordinates. */
function drawVisualText(page: PDFPage, text: string, vx: number, vy: number, o: { font: PDFFont; size: number; color: ReturnType<typeof rgb>; opacity?: number; angle?: number }) {
  const f = visualFrame(page)
  const [x, y] = f.toRaw(vx, vy)
  page.drawText(text, { x, y, font: o.font, size: o.size, color: o.color, opacity: o.opacity, rotate: degrees(f.r + (o.angle ?? 0)) })
}

export type Pos6 = 'tl' | 'tc' | 'tr' | 'bl' | 'bc' | 'br'
export type Pos9 = Pos6 | 'ml' | 'mc' | 'mr'

/* ---------------------------------------------------------------- page numbers */

export type NumberFormat = 'n' | 'page-n' | 'page-n-of' | 'n-of' | 'dash' | 'roman'
export const toRoman = (num: number) => {
  if (num <= 0) return String(num)
  const map: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]
  let s = ''; for (const [v, r] of map) while (num >= v) { s += r; num -= v } return s
}
export function formatNumber(fmt: NumberFormat, n: number, total: number) {
  switch (fmt) {
    case 'page-n': return `Page ${n}`
    case 'page-n-of': return `Page ${n} of ${total}`
    case 'n-of': return `${n} / ${total}`
    case 'dash': return `- ${n} -`
    case 'roman': return toRoman(n)
    default: return String(n)
  }
}

export type PageNumberOpts = {
  position: Pos6; format: NumberFormat; start: number; size: number; margin: number; color: string; font: FontName
  skipFirst: boolean; pages?: number[] /* 0-based target pages; undefined = all */; mirror?: boolean
  /** preview support: treat page i as original page indexBase+i, out of totalOverride */
  indexBase?: number; totalOverride?: number
}
export async function addPageNumbers(bytes: Bytes, o: PageNumberOpts) {
  const doc = await load(bytes)
  const font = await embedFont(doc, o.font)
  const color = hexToRgb(o.color)
  const pages = doc.getPages()
  const totalPages = o.totalOverride ?? pages.length
  const target = new Set(o.pages ?? Array.from({ length: totalPages }, (_, i) => i))
  if (o.skipFirst) target.delete(0)
  const numbered = [...target].sort((a, b) => a - b)
  const total = numbered.length + o.start - 1
  pages.forEach((page, i) => {
    const gi = (o.indexBase ?? 0) + i
    const ord = numbered.indexOf(gi)
    if (ord < 0) return
    const n = o.start + ord
    const text = safeText(font, formatNumber(o.format, n, total))
    let pos = o.position
    if (o.mirror && n % 2 === 0) pos = pos.replace('l', 'X').replace('r', 'l').replace('X', 'r') as Pos6
    stampAt(page, text, pos, font, o.size, o.margin, color)
  })
  return save(doc)
}

function stampAt(page: PDFPage, text: string, pos: Pos9, font: PDFFont, size: number, margin: number, color: ReturnType<typeof rgb>, opacity?: number) {
  const { vw, vh } = visualFrame(page)
  const w = font.widthOfTextAtSize(text, size)
  const asc = font.heightAtSize(size, { descender: false })
  const col = pos[1], row = pos[0]
  const vx = col === 'l' ? margin : col === 'r' ? vw - margin - w : (vw - w) / 2
  const vy = row === 't' ? vh - margin - asc : row === 'b' ? margin : (vh - asc) / 2
  drawVisualText(page, text, vx, vy, { font, size, color, opacity })
}

/* ---------------------------------------------------------------- header / footer */

export type HFOpts = {
  header: [string, string, string]; footer: [string, string, string]
  size: number; color: string; font: FontName; marginX: number; marginY: number
  filename: string; title?: string; date?: string; start: number; skipFirst: boolean; pages?: number[]; line: boolean
  indexBase?: number; totalOverride?: number
}
export function expandTokens(s: string, t: { page: number; total: number; date: string; filename: string; title: string }) {
  return s.replace(/\{page\}/gi, String(t.page)).replace(/\{total\}/gi, String(t.total)).replace(/\{date\}/gi, t.date)
    .replace(/\{filename\}/gi, t.filename).replace(/\{title\}/gi, t.title).replace(/\{time\}/gi, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
}
export async function addHeaderFooter(bytes: Bytes, o: HFOpts) {
  const doc = await load(bytes)
  const font = await embedFont(doc, o.font)
  const color = hexToRgb(o.color)
  const pages = doc.getPages()
  const totalPages = o.totalOverride ?? pages.length
  const target = new Set(o.pages ?? Array.from({ length: totalPages }, (_, i) => i))
  if (o.skipFirst) target.delete(0)
  const total = totalPages + o.start - 1
  const date = o.date ?? new Date().toLocaleDateString()
  const title = o.title || doc.getTitle() || o.filename.replace(/\.pdf$/i, '')
  pages.forEach((page, i) => {
    const gi = (o.indexBase ?? 0) + i
    if (!target.has(gi)) return
    const tok = { page: gi + o.start, total, date, filename: o.filename, title }
    const { vw, vh } = visualFrame(page)
    const asc = font.heightAtSize(o.size, { descender: false })
    const rows: [Pos6, string][] = [['tl', o.header[0]], ['tc', o.header[1]], ['tr', o.header[2]], ['bl', o.footer[0]], ['bc', o.footer[1]], ['br', o.footer[2]]]
    for (const [pos, raw] of rows) {
      if (!raw.trim()) continue
      const text = safeText(font, expandTokens(raw, tok))
      const w = font.widthOfTextAtSize(text, o.size)
      const vx = pos[1] === 'l' ? o.marginX : pos[1] === 'r' ? vw - o.marginX - w : (vw - w) / 2
      const vy = pos[0] === 't' ? vh - o.marginY - asc : o.marginY
      drawVisualText(page, text, vx, vy, { font, size: o.size, color })
    }
    if (o.line) {
      const hasH = o.header.some((s) => s.trim()), hasF = o.footer.some((s) => s.trim())
      const f = visualFrame(page)
      const seg = (vy: number) => { const [x1, y1] = f.toRaw(o.marginX, vy), [x2, y2] = f.toRaw(vw - o.marginX, vy); page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.5, color, opacity: 0.6 }) }
      if (hasH) seg(vh - o.marginY - asc - o.size * 0.45)
      if (hasF) seg(o.marginY + asc + o.size * 0.45)
    }
  })
  return save(doc)
}

/* ---------------------------------------------------------------- watermark */

export type WatermarkOpts = {
  kind: 'text' | 'image'
  text: string; font: FontName; size: number; color: string
  image?: { bytes: Bytes; type: 'png' | 'jpg' }; imageScale: number /* fraction of page width */
  opacity: number; angle: number; position: Pos9 | 'tile'; tileGap: number; pages?: number[]; indexBase?: number
}
export async function watermark(bytes: Bytes, o: WatermarkOpts) {
  const doc = await load(bytes)
  const color = hexToRgb(o.color)
  let font: PDFFont | null = null, img: PDFImage | null = null, text = ''
  if (o.kind === 'text') { font = await embedFont(doc, o.font); text = safeText(font, o.text || ' ') }
  else {
    if (!o.image) throw new PdfError('Choose a logo image first.')
    img = o.image.type === 'png' ? await doc.embedPng(o.image.bytes) : await doc.embedJpg(o.image.bytes)
  }
  const target = o.pages ? new Set(o.pages) : null
  doc.getPages().forEach((page, i) => {
    if (target && !target.has((o.indexBase ?? 0) + i)) return
    const f = visualFrame(page)
    let w: number, h: number
    if (font) { w = font.widthOfTextAtSize(text, o.size); h = font.heightAtSize(o.size, { descender: false }) }
    else { w = f.vw * o.imageScale; h = w * (img!.height / img!.width) }
    const rad = (o.angle * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad)
    // rotated bounding box size, used to keep the stamp inside the page
    const bw = Math.abs(w * cos) + Math.abs(h * sin), bh = Math.abs(w * sin) + Math.abs(h * cos)
    const drawCentered = (cx: number, cy: number) => {
      // origin such that the rotated box centre lands on (cx,cy)
      const ox = cx - (cos * w / 2 - sin * h / 2), oy = cy - (sin * w / 2 + cos * h / 2)
      const [x, y] = f.toRaw(ox, oy)
      const rot = degrees(f.r + o.angle)
      if (font) page.drawText(text, { x, y, font, size: o.size, color, opacity: o.opacity, rotate: rot })
      else page.drawImage(img!, { x, y, width: w, height: h, opacity: o.opacity, rotate: rot })
    }
    if (o.position === 'tile') {
      const sx = bw + o.tileGap, sy = bh + o.tileGap
      let row = 0
      for (let cy = sy / 2; cy < f.vh + sy; cy += sy, row++) {
        const off = row % 2 ? sx / 2 : 0
        for (let cx = sx / 2 - off; cx < f.vw + sx; cx += sx) drawCentered(cx, cy)
      }
    } else {
      const m = Math.min(f.vw, f.vh) * 0.05
      const col = o.position[1], rw = o.position[0]
      const cx = col === 'l' ? m + bw / 2 : col === 'r' ? f.vw - m - bw / 2 : f.vw / 2
      const cy = rw === 't' ? f.vh - m - bh / 2 : rw === 'b' ? m + bh / 2 : f.vh / 2
      drawCentered(cx, cy)
    }
  })
  return save(doc)
}

/* ---------------------------------------------------------------- crop */

/** Margins as fractions (0..1) of the page's visual (as displayed) box */
export type CropFrac = { l: number; t: number; r: number; b: number }
export function cropRaw(page: PDFPage, c: CropFrac) {
  const rot = normRot(page.getRotation().angle)
  // map visual margins to raw-page margins
  const m = rot === 90 ? { l: c.t, t: c.r, r: c.b, b: c.l } : rot === 180 ? { l: c.r, t: c.b, r: c.l, b: c.t } : rot === 270 ? { l: c.b, t: c.l, r: c.t, b: c.r } : c
  const { x, y, w, h } = box(page)
  return { x: x + w * m.l, y: y + h * m.b, w: w * (1 - m.l - m.r), h: h * (1 - m.t - m.b) }
}
export async function crop(bytes: Bytes, perPage: (i: number) => CropFrac | null, hard: boolean) {
  const doc = await load(bytes)
  doc.getPages().forEach((p, i) => {
    const c = perPage(i); if (!c) return
    const b = cropRaw(p, c)
    if (b.w < 1 || b.h < 1) throw new PdfError(`Crop on page ${i + 1} leaves nothing visible.`)
    p.setCropBox(b.x, b.y, b.w, b.h)
    if (hard) { p.setMediaBox(b.x, b.y, b.w, b.h); p.setTrimBox(b.x, b.y, b.w, b.h); p.setBleedBox(b.x, b.y, b.w, b.h); p.setArtBox(b.x, b.y, b.w, b.h) }
  })
  return save(doc)
}

/* ---------------------------------------------------------------- metadata */

export type Meta = { title: string; author: string; subject: string; keywords: string; creator: string; producer: string; created: Date | null; modified: Date | null }
export async function readMeta(bytes: Bytes) {
  const doc = await load(bytes, { allowEncrypted: true })
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 16))
  const version = head.match(/%PDF-(\d\.\d)/)?.[1] ?? '?'
  const first = doc.getPageCount() ? doc.getPage(0) : null
  const safe = <T,>(f: () => T): T | undefined => { try { return f() } catch { return undefined } }
  const meta: Meta = {
    title: safe(() => doc.getTitle()) ?? '', author: safe(() => doc.getAuthor()) ?? '', subject: safe(() => doc.getSubject()) ?? '',
    keywords: safe(() => doc.getKeywords()) ?? '', creator: safe(() => doc.getCreator()) ?? '', producer: safe(() => doc.getProducer()) ?? '',
    created: safe(() => doc.getCreationDate()) ?? null, modified: safe(() => doc.getModificationDate()) ?? null,
  }
  return {
    meta, version, pages: doc.getPageCount(), encrypted: doc.isEncrypted,
    hasXmp: !!doc.catalog.get(PDFName.of('Metadata')),
    pageSize: first ? visualSize(first) : null,
    hasForm: safe(() => doc.getForm().getFields().length) ?? 0,
  }
}
export async function writeMeta(bytes: Bytes, m: Meta | null) {
  const doc = await load(bytes)
  // always drop XMP: pdf-lib cannot update it and stale XMP would override the Info dictionary in many readers
  doc.catalog.delete(PDFName.of('Metadata'))
  const infoRef = doc.context.trailerInfo.Info
  if (!m) {
    if (infoRef) {
      const info = doc.context.lookup(infoRef)
      if (info instanceof PDFDict) for (const k of info.keys()) info.delete(k)
    }
    return save(doc)
  }
  doc.setTitle(m.title); doc.setAuthor(m.author); doc.setSubject(m.subject)
  doc.setKeywords([])
  doc.setCreator(m.creator); doc.setProducer(m.producer)
  if (m.created) doc.setCreationDate(m.created)
  if (m.modified) doc.setModificationDate(m.modified)
  const info = doc.context.lookup(doc.context.trailerInfo.Info)
  if (info instanceof PDFDict) {
    // pdf-lib joins keywords with spaces; keep the user's comma-separated list intact
    info.set(PDFName.of('Keywords'), PDFHexString.fromText(m.keywords.split(/[,;]+/).map((s) => s.trim()).filter(Boolean).join(', ')))
    // empty strings → remove the key entirely
    for (const k of ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer']) {
      const v = info.get(PDFName.of(k))
      if ((v instanceof PDFHexString || v instanceof PDFString) && v.decodeText() === '') info.delete(PDFName.of(k))
    }
    if (!m.created) info.delete(PDFName.of('CreationDate'))
    if (!m.modified) info.delete(PDFName.of('ModDate'))
  }
  return save(doc)
}

/* ---------------------------------------------------------------- n-up / booklet */

export type NupOpts = {
  perSheet: 2 | 4 | 6 | 8 | 9 | 16; sheet: [number, number]; orientation: 'auto' | 'portrait' | 'landscape'
  margin: number; gap: number; border: boolean; order: 'row' | 'col'; maxSheets?: number
}
export const SHEETS: Record<string, [number, number]> = { A4: [595.28, 841.89], Letter: [612, 792], A3: [841.89, 1190.55], Legal: [612, 1008], A5: [419.53, 595.28] }

function gridFor(n: number): [number, number] { // [cols, rows] in portrait
  return ({ 2: [1, 2], 4: [2, 2], 6: [2, 3], 8: [2, 4], 9: [3, 3], 16: [4, 4] } as Record<number, [number, number]>)[n] ?? [2, 2]
}

async function embedVisual(out: PDFDocument, pages: PDFPage[]) {
  const boxes = pages.map((p) => { const b = box(p); return { left: b.x, bottom: b.y, right: b.x + b.w, top: b.y + b.h } })
  const emb = await out.embedPages(pages, boxes)
  return emb.map((e, i) => ({ e, r: normRot(pages[i].getRotation().angle), w: boxes[i].right - boxes[i].left, h: boxes[i].top - boxes[i].bottom }))
}

/** Draw an embedded page (raw w×h, rotation r) fitted & centred inside the visual cell (x,y,cw,ch) */
function drawFitted(sheet: PDFPage, it: { e: any; r: Rot; w: number; h: number }, x: number, y: number, cw: number, ch: number) {
  const vw = it.r % 180 ? it.h : it.w, vh = it.r % 180 ? it.w : it.h
  const s = Math.min(cw / vw, ch / vh)
  const dw = vw * s, dh = vh * s
  const bx = x + (cw - dw) / 2, by = y + (ch - dh) / 2
  const o = it.r === 90 ? [bx, by + dh] : it.r === 180 ? [bx + dw, by + dh] : it.r === 270 ? [bx + dw, by] : [bx, by]
  sheet.drawPage(it.e, { x: o[0], y: o[1], xScale: s, yScale: s, rotate: degrees(-it.r) })
  return { bx, by, dw, dh }
}

export async function nup(bytes: Bytes, o: NupOpts) {
  const src = await load(bytes)
  const out = await PDFDocument.create()
  let [cols, rows] = gridFor(o.perSheet)
  const firstVis = visualSize(src.getPage(0))
  const srcLandscape = firstVis[0] > firstVis[1]
  // auto: 2/8-up of portrait pages look best on landscape sheets; square grids keep the source orientation
  let landscape = o.orientation === 'landscape' || (o.orientation === 'auto' && (cols !== rows ? !srcLandscape : srcLandscape))
  if (landscape) [cols, rows] = [rows, cols]
  const [sw0, sh0] = o.sheet
  const sw = landscape ? Math.max(sw0, sh0) : Math.min(sw0, sh0), sh = landscape ? Math.min(sw0, sh0) : Math.max(sw0, sh0)
  const items = await embedVisual(out, src.getPages())
  const cw = (sw - 2 * o.margin - (cols - 1) * o.gap) / cols, ch = (sh - 2 * o.margin - (rows - 1) * o.gap) / rows
  if (cw <= 4 || ch <= 4) throw new PdfError('Margins and gaps are too large for this sheet size.')
  let sheets = Math.ceil(items.length / o.perSheet)
  if (o.maxSheets) sheets = Math.min(sheets, o.maxSheets)
  for (let s = 0; s < sheets; s++) {
    const sheet = out.addPage([sw, sh])
    for (let k = 0; k < o.perSheet; k++) {
      const it = items[s * o.perSheet + k]; if (!it) break
      const c = o.order === 'row' ? k % cols : Math.floor(k / rows), r = o.order === 'row' ? Math.floor(k / cols) : k % rows
      const x = o.margin + c * (cw + o.gap), y = sh - o.margin - (r + 1) * ch - r * o.gap
      const d = drawFitted(sheet, it, x, y, cw, ch)
      if (o.border) sheet.drawRectangle({ x: d.bx, y: d.by, width: d.dw, height: d.dh, borderColor: rgb(0.55, 0.55, 0.6), borderWidth: 0.6 })
    }
  }
  return save(out)
}

/** Saddle-stitch booklet order for n pages (padded to a multiple of 4). Returns [left,right] pairs per sheet side; -1 = blank */
export function bookletOrder(n: number) {
  const total = Math.ceil(n / 4) * 4
  const pairs: [number, number][] = []
  for (let i = 0; i < total / 4; i++) {
    pairs.push([total - 1 - 2 * i, 2 * i])
    pairs.push([2 * i + 1, total - 2 - 2 * i])
  }
  return pairs.map(([a, b]) => [a < n ? a : -1, b < n ? b : -1] as [number, number])
}

export async function booklet(bytes: Bytes, o: { sheet: [number, number]; margin: number; gap: number; border: boolean; maxSheets?: number; pairs?: [number, number][] }) {
  const src = await load(bytes)
  const out = await PDFDocument.create()
  const items = await embedVisual(out, src.getPages())
  const sw = Math.max(...o.sheet), sh = Math.min(...o.sheet)
  const cw = (sw - 2 * o.margin - o.gap) / 2, ch = sh - 2 * o.margin
  let pairs = o.pairs ?? bookletOrder(items.length)
  if (o.maxSheets) pairs = pairs.slice(0, o.maxSheets)
  for (const [l, r] of pairs) {
    const sheet = out.addPage([sw, sh])
    ;[l, r].forEach((idx, side) => {
      if (idx < 0) return
      const x = o.margin + side * (cw + o.gap)
      const d = drawFitted(sheet, items[idx], x, o.margin, cw, ch)
      if (o.border) sheet.drawRectangle({ x: d.bx, y: d.by, width: d.dw, height: d.dh, borderColor: rgb(0.55, 0.55, 0.6), borderWidth: 0.6 })
    })
  }
  return save(out)
}

/* ---------------------------------------------------------------- flatten */

type Mat = [number, number, number, number, number, number]
const numArr = (doc: PDFDocument, v: unknown): number[] | null => {
  const a = v instanceof PDFRef ? doc.context.lookup(v) : v
  if (!(a instanceof PDFArray)) return null
  return a.asArray().map((x) => { const n = x instanceof PDFRef ? doc.context.lookup(x) : x; return n instanceof PDFNumber ? n.asNumber() : 0 })
}

/** Burn annotation appearance streams into the page content (vector), then remove those annotations. */
export function flattenAnnotations(doc: PDFDocument, keepLinks = true) {
  let count = 0
  doc.getPages().forEach((page, pi) => {
    const annotsRaw = page.node.get(PDFName.of('Annots'))
    const annots = annotsRaw instanceof PDFRef ? doc.context.lookup(annotsRaw) : annotsRaw
    if (!(annots instanceof PDFArray)) return
    const keep: any[] = []
    const ops: string[] = []
    annots.asArray().forEach((ref, ai) => {
      const a = ref instanceof PDFRef ? doc.context.lookup(ref) : ref
      if (!(a instanceof PDFDict)) return
      const sub = a.get(PDFName.of('Subtype'))?.toString()
      if ((keepLinks && sub === '/Link') || sub === '/Popup') { if (sub === '/Link') keep.push(ref); return }
      const flags = (a.get(PDFName.of('F')) as PDFNumber | undefined)?.asNumber?.() ?? 0
      if (flags & 2 || flags & 32) return // hidden / no-view: drop
      const ap = a.lookup(PDFName.of('AP'))
      let n: any = ap instanceof PDFDict ? ap.get(PDFName.of('N')) : undefined
      let nObj = n instanceof PDFRef ? doc.context.lookup(n) : n
      if (nObj instanceof PDFDict && !(nObj instanceof PDFStream)) { // appearance sub-dictionary keyed by state
        const as = a.get(PDFName.of('AS'))
        n = as ? nObj.get(as as PDFName) : undefined
        nObj = n instanceof PDFRef ? doc.context.lookup(n) : n
      }
      const rect = numArr(doc, a.get(PDFName.of('Rect')))
      if (!(nObj instanceof PDFStream) || !rect) { keep.push(ref); return }
      const bbox = numArr(doc, nObj.dict.get(PDFName.of('BBox'))) ?? [0, 0, rect[2] - rect[0], rect[3] - rect[1]]
      const m = (numArr(doc, nObj.dict.get(PDFName.of('Matrix'))) ?? [1, 0, 0, 1, 0, 0]) as Mat
      const pts = [[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[0], bbox[3]], [bbox[2], bbox[3]]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]])
      const minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0]))
      const minY = Math.min(...pts.map((p) => p[1])), maxY = Math.max(...pts.map((p) => p[1]))
      const rx = Math.min(rect[0], rect[2]), ry = Math.min(rect[1], rect[3]), rw = Math.abs(rect[2] - rect[0]), rh = Math.abs(rect[3] - rect[1])
      const sx = maxX - minX ? rw / (maxX - minX) : 1, sy = maxY - minY ? rh / (maxY - minY) : 1
      const name = `FlatA${pi}_${ai}`
      const xobjRef = n instanceof PDFRef ? n : doc.context.register(nObj)
      if (!nObj.dict.get(PDFName.of('Subtype'))) nObj.dict.set(PDFName.of('Subtype'), PDFName.of('Form'))
      if (!nObj.dict.get(PDFName.of('Type'))) nObj.dict.set(PDFName.of('Type'), PDFName.of('XObject'))
      const resources = page.node.Resources() ?? (() => { const r = doc.context.obj({}) as PDFDict; page.node.set(PDFName.of('Resources'), r); return r })()
      let xo = resources.lookup(PDFName.of('XObject'))
      if (!(xo instanceof PDFDict)) { xo = doc.context.obj({}); resources.set(PDFName.of('XObject'), xo as PDFDict) }
      ;(xo as PDFDict).set(PDFName.of(name), xobjRef)
      const f = (v: number) => (Math.round(v * 10000) / 10000).toString()
      ops.push(`q ${f(sx)} 0 0 ${f(sy)} ${f(rx - minX * sx)} ${f(ry - minY * sy)} cm /${name} Do Q`)
      count++
    })
    if (ops.length) {
      // wrap existing content in q/Q so its graphics state cannot leak into the burned-in annotations
      const pre = doc.context.flateStream('q\n')
      const post = doc.context.flateStream('\nQ\n' + ops.join('\n') + '\n')
      const contents = page.node.Contents()
      const arr = doc.context.obj([]) as PDFArray
      arr.push(doc.context.register(pre))
      if (contents instanceof PDFArray) contents.asArray().forEach((c) => arr.push(c))
      else if (contents) arr.push(page.node.get(PDFName.of('Contents'))!)
      arr.push(doc.context.register(post))
      page.node.set(PDFName.of('Contents'), arr)
    }
    if (keep.length) page.node.set(PDFName.of('Annots'), doc.context.obj(keep)); else page.node.delete(PDFName.of('Annots'))
  })
  return count
}

export async function flatten(bytes: Bytes, o: { annotations: boolean }) {
  const doc = await load(bytes)
  let fields = 0
  const report: string[] = []
  try {
    const form = doc.getForm()
    fields = form.getFields().length
    if (fields) {
      try { form.updateFieldAppearances() } catch { /* fields with custom fonts keep their existing appearance */ }
      form.flatten({ updateFieldAppearances: false })
      report.push(`${fields} form field${fields > 1 ? 's' : ''} flattened`)
    }
  } catch (e: any) { report.push(`Form flatten skipped (${e?.message ?? e})`) }
  // remove a leftover AcroForm / XFA so viewers do not re-create fields
  doc.catalog.delete(PDFName.of('AcroForm'))
  if (o.annotations) {
    const n = flattenAnnotations(doc)
    report.push(n ? `${n} annotation${n > 1 ? 's' : ''} burned into the page` : 'No visible annotations to flatten')
  }
  if (!fields) report.unshift('No fillable form fields found')
  return { bytes: await save(doc), report, fields }
}

/* ---------------------------------------------------------------- lossless optimise */

/** Deflate any uncompressed streams and re-save with object streams. `deflate` is injected (fflate) to keep this file pure. */
export async function losslessOptimize(bytes: Bytes, deflate: (b: Uint8Array) => Uint8Array, opts: { stripMetadata?: boolean } = {}) {
  const doc = await load(bytes)
  let recompressed = 0
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue
    if (obj.dict.get(PDFName.of('Filter'))) continue
    const type = obj.dict.get(PDFName.of('Type'))?.toString()
    if (type === '/XRef' || type === '/ObjStm') continue
    if (type === '/Metadata' && opts.stripMetadata) continue
    const raw = obj.contents
    if (raw.length < 64) continue
    const z = deflate(raw)
    if (z.length >= raw.length * 0.95) continue
    const d = obj.dict.clone(doc.context)
    d.set(PDFName.of('Filter'), PDFName.of('FlateDecode'))
    d.set(PDFName.of('Length'), PDFNumber.of(z.length))
    doc.context.assign(ref, PDFRawStream.of(d, z))
    recompressed++
  }
  if (opts.stripMetadata) doc.catalog.delete(PDFName.of('Metadata'))
  // drop unused objects by rebuilding the reachable graph is not supported by pdf-lib; object streams still help a lot
  return { bytes: await save(doc, true), recompressed }
}

/* ---------------------------------------------------------------- repair */

export type RepairResult = { bytes: Bytes | null; log: string[]; recovered: number; failed: number[] }
/** Structural repair with pdf-lib. Pages that fail to copy are reported in `failed` (0-based). */
export async function repairStructure(bytes: Bytes): Promise<RepairResult> {
  const log: string[] = []
  let src: PDFDocument
  try {
    src = await PDFDocument.load(bytes, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false } as any)
    log.push('Parsed document structure (lenient mode)')
  } catch (e: any) {
    log.push(`pdf-lib could not parse the file: ${e?.message ?? e}`)
    return { bytes: null, log, recovered: 0, failed: [] }
  }
  if (src.isEncrypted) log.push('Warning: document is encrypted — content streams may be unreadable')
  let n = 0
  try { n = src.getPageCount() } catch (e: any) { log.push(`Page tree is broken: ${e?.message ?? e}`); return { bytes: null, log, recovered: 0, failed: [] } }
  if (!n) { log.push('No pages found in the page tree'); return { bytes: null, log, recovered: 0, failed: [] } }
  log.push(`Found ${n} page${n > 1 ? 's' : ''} in the page tree`)
  const out = await PDFDocument.create()
  const failed: number[] = []
  const slots: (PDFPage | null)[] = []
  for (let i = 0; i < n; i++) {
    try { const [p] = await out.copyPages(src, [i]); slots.push(p) } catch { failed.push(i); slots.push(null) }
  }
  slots.forEach((p) => { if (p) out.addPage(p); else out.addPage([595.28, 841.89]) }) // placeholders, replaced by caller if possible
  try { const t = src.getTitle(); if (t) out.setTitle(t); const a = src.getAuthor(); if (a) out.setAuthor(a) } catch { /* ignore */ }
  log.push(`Rebuilt a fresh cross-reference table and page tree with ${n - failed.length} page${n - failed.length === 1 ? '' : 's'}`)
  if (failed.length) log.push(`${failed.length} page${failed.length > 1 ? 's' : ''} could not be copied: ${failed.map((i) => i + 1).join(', ')}`)
  return { bytes: await save(out), log, recovered: n - failed.length, failed }
}

/** Replace page slots (0-based) in `bytes` with image pages */
export async function replaceWithImages(bytes: Bytes, images: Map<number, { jpg: Bytes; w: number; h: number }>) {
  const doc = await load(bytes)
  for (const [i, im] of images) {
    const img = await doc.embedJpg(im.jpg)
    doc.removePage(i)
    const p = doc.insertPage(i, [im.w, im.h])
    p.drawImage(img, { x: 0, y: 0, width: im.w, height: im.h })
  }
  return save(doc)
}

export async function imagesToPdf(images: { jpg: Bytes; w: number; h: number }[]) {
  const doc = await PDFDocument.create()
  for (const im of images) { const img = await doc.embedJpg(im.jpg); doc.addPage([im.w, im.h]).drawImage(img, { x: 0, y: 0, width: im.w, height: im.h }) }
  return save(doc)
}

// re-export for convenience in components that already loaded this module
export { PDFDocument, PDFName, PDFDict, PDFRawStream, PDFNumber, PDFArray, PDFRef, PDFContentStream, PDFOperator, degrees, rgb }
