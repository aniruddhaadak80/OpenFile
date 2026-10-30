/* PDF helpers for round 14: Bates numbering, rubber stamps and long-page stitching (pdf-lib, MIT). Tested in Node. */
import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage } from 'pdf-lib'

export type Pos9 = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br'
export type Font = 'Helvetica' | 'Helvetica-Bold' | 'Times-Roman' | 'Times-Bold' | 'Courier' | 'Courier-Bold'
const FONT: Record<Font, StandardFonts> = { 'Helvetica': StandardFonts.Helvetica, 'Helvetica-Bold': StandardFonts.HelveticaBold, 'Times-Roman': StandardFonts.TimesRoman, 'Times-Bold': StandardFonts.TimesRomanBold, 'Courier': StandardFonts.Courier, 'Courier-Bold': StandardFonts.CourierBold }
export const hexToRgb = (h: string) => { const m = h.replace('#', '').padEnd(6, '0'); return rgb(parseInt(m.slice(0, 2), 16) / 255, parseInt(m.slice(2, 4), 16) / 255, parseInt(m.slice(4, 6), 16) / 255) }

/** Where a box of w x h goes on a page box for a 9 point position. Coordinates are bottom-left based. */
export function place(pos: Pos9, pw: number, ph: number, w: number, h: number, margin: number, ox = 0, oy = 0) {
  const x = pos[1] === 'l' ? margin : pos[1] === 'c' ? (pw - w) / 2 : pw - margin - w
  const y = pos[0] === 't' ? ph - margin - h : pos[0] === 'm' ? (ph - h) / 2 : margin
  return { x: x + ox, y: y + oy }
}

export const batesLabel = (n: number, o: { prefix: string; suffix: string; digits: number }) => `${o.prefix}${String(n).padStart(o.digits, '0')}${o.suffix}`

export interface BatesOpts { prefix: string; suffix: string; start: number; digits: number; position: Pos9; size: number; color: string; font: Font; margin: number; box: boolean }
/** Stamp Bates numbers across several PDFs, continuing the count from file to file. */
export async function batesNumber(files: Uint8Array[], o: BatesOpts): Promise<{ outputs: Uint8Array[]; ranges: { first: string; last: string; pages: number }[] }> {
  let n = o.start
  const outputs: Uint8Array[] = [], ranges: { first: string; last: string; pages: number }[] = []
  for (const bytes of files) {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
    const font = await doc.embedFont(FONT[o.font])
    const first = batesLabel(n, o)
    for (const page of doc.getPages()) { drawLabel(page, font, batesLabel(n, o), o); n++ }
    ranges.push({ first, last: batesLabel(n - 1, o), pages: doc.getPageCount() })
    outputs.push(await doc.save())
  }
  return { outputs, ranges }
}
function drawLabel(page: PDFPage, font: PDFFont, text: string, o: { position: Pos9; size: number; color: string; margin: number; box: boolean }) {
  const { width: pw, height: ph } = page.getSize()
  const rot = page.getRotation().angle % 360
  const w = font.widthOfTextAtSize(text, o.size), h = font.heightAtSize(o.size, { descender: false })
  const pad = o.box ? 4 : 0
  // place in the visual (rotated) frame, then map back to page space
  const vw = rot % 180 ? ph : pw, vh = rot % 180 ? pw : ph
  const { x, y } = place(o.position, vw, vh, w + pad * 2, h + pad * 2, o.margin)
  const map = (vx: number, vy: number) => (rot === 90 ? { x: pw - vy, y: vx } : rot === 180 ? { x: pw - vx, y: ph - vy } : rot === 270 ? { x: vy, y: ph - vx } : { x: vx, y: vy })
  const a = map(x, y)
  if (o.box) page.drawRectangle({ x: a.x, y: a.y, width: w + pad * 2, height: h + pad * 2, color: rgb(1, 1, 1), borderColor: hexToRgb(o.color), borderWidth: 0.8, rotate: degrees(rot) })
  const t = map(x + pad, y + pad + h * 0.12)
  page.drawText(text, { x: t.x, y: t.y, size: o.size, font, color: hexToRgb(o.color), rotate: degrees(rot) })
}

export interface StampOpts { text: string; sub: string; color: string; position: Pos9; size: number; angle: number; opacity: number; margin: number; pages?: number[]; double: boolean; font: Font }
export const STAMP_PRESETS: { text: string; color: string }[] = [
  { text: 'APPROVED', color: '#0F9F6E' }, { text: 'PAID', color: '#0F9F6E' }, { text: 'RECEIVED', color: '#0E7490' }, { text: 'REVIEWED', color: '#0369A1' },
  { text: 'DRAFT', color: '#B45309' }, { text: 'CONFIDENTIAL', color: '#B91C1C' }, { text: 'COPY', color: '#475569' }, { text: 'FINAL', color: '#0F766E' },
  { text: 'VOID', color: '#B91C1C' }, { text: 'REJECTED', color: '#B91C1C' }, { text: 'FOR REVIEW', color: '#C2410C' }, { text: 'ORIGINAL', color: '#1D4ED8' },
]
/** Draw a rubber stamp (border, big word, optional small line like a date) on chosen pages. */
export async function stampPdf(bytes: Uint8Array, o: StampOpts): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const font = await doc.embedFont(FONT[o.font])
  const small = await doc.embedFont(StandardFonts.HelveticaBold)
  const col = hexToRgb(o.color)
  const pages = doc.getPages()
  const which = o.pages ?? pages.map((_, i) => i)
  for (const i of which) {
    const page = pages[i]; if (!page) continue
    const { width: pw, height: ph } = page.getSize()
    const tw = font.widthOfTextAtSize(o.text, o.size), th = o.size * 0.72
    const sub = o.sub.trim(), ss = o.size * 0.32
    const sw = sub ? small.widthOfTextAtSize(sub, ss) : 0
    const padX = o.size * 0.45, padY = o.size * 0.35
    const bw = Math.max(tw, sw) + padX * 2, bh = th + (sub ? ss * 1.6 : 0) + padY * 2
    // rotate around the box centre: compute the centre then offset the origin
    const { x, y } = place(o.position, pw, ph, bw, bh, o.margin)
    const cx = x + bw / 2, cy = y + bh / 2
    const r = (o.angle * Math.PI) / 180
    const at = (dx: number, dy: number) => ({ x: cx + dx * Math.cos(r) - dy * Math.sin(r), y: cy + dx * Math.sin(r) + dy * Math.cos(r) })
    const corner = at(-bw / 2, -bh / 2)
    const common = { rotate: degrees(o.angle), opacity: o.opacity, borderOpacity: o.opacity }
    page.drawRectangle({ x: corner.x, y: corner.y, width: bw, height: bh, borderColor: col, borderWidth: Math.max(1.5, o.size * 0.07), ...common })
    if (o.double) { const g = o.size * 0.12; const c2 = at(-bw / 2 + g, -bh / 2 + g); page.drawRectangle({ x: c2.x, y: c2.y, width: bw - g * 2, height: bh - g * 2, borderColor: col, borderWidth: Math.max(0.8, o.size * 0.03), ...common }) }
    const t = at(-tw / 2, bh / 2 - padY - th)
    page.drawText(o.text, { x: t.x, y: t.y, size: o.size, font, color: col, rotate: degrees(o.angle), opacity: o.opacity })
    if (sub) { const s = at(-sw / 2, -bh / 2 + padY); page.drawText(sub, { x: s.x, y: s.y, size: ss, font: small, color: col, rotate: degrees(o.angle), opacity: o.opacity }) }
  }
  return doc.save()
}

/** Put every page under each other on one tall page (vector, no quality loss). Splits when the PDF height limit is reached. */
export async function stackPages(bytes: Uint8Array, o: { gap: number; maxHeight?: number; bg?: string }): Promise<Uint8Array[]> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const maxH = o.maxHeight ?? 14400
  const outs: Uint8Array[] = []
  const pages = src.getPages()
  // blank pages without a content stream cannot be embedded, give them an empty one
  for (const p of pages) if (!p.node.Contents()) p.drawRectangle({ x: 0, y: 0, width: 0, height: 0, opacity: 0 })
  let i = 0
  while (i < pages.length) {
    const doc = await PDFDocument.create()
    const group: number[] = []
    let h = 0, w = 0
    while (i < pages.length) { const s = pages[i].getSize(); const nh = h + (group.length ? o.gap : 0) + s.height; if (group.length && nh > maxH) break; group.push(i); h = nh; w = Math.max(w, s.width); i++ }
    const emb = await doc.embedPdf(src, group)
    const page = doc.addPage([w, h])
    if (o.bg) page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: hexToRgb(o.bg) })
    let y = h
    emb.forEach((e) => { y -= e.height; page.drawPage(e, { x: (w - e.width) / 2, y }); y -= o.gap })
    outs.push(await doc.save())
  }
  return outs
}
