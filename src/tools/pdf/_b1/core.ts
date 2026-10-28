/* Batch 1 low-level PDF helpers built on pdf-lib. Pure functions (no DOM) so they run in Node tests too. */
import {
  PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFHexString, PDFNumber, PDFRef, PDFStream, PDFRawStream, PDFPage,
  PDFBool, PDFObject, PDFNull, decodePDFRawStream,
} from 'pdf-lib'

export type Bytes = Uint8Array
export type Box = { x0: number; y0: number; x1: number; y1: number }

export const N = (s: string) => PDFName.of(s)
export const enc = (s: string) => new TextEncoder().encode(s)

export async function open(bytes: Bytes | ArrayBuffer) {
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  } catch (e: any) {
    throw new Error('Could not read this PDF. It may be damaged. Try Repair PDF first. (' + (e?.message || e) + ')')
  }
}
export const isEncrypted = (doc: PDFDocument) => !!doc.context.trailerInfo.Encrypt
export function assertNotEncrypted(doc: PDFDocument) {
  if (isEncrypted(doc)) throw new Error('This PDF is encrypted. Remove the password first with Unlock PDF, then try again.')
}

/* ------------------------------------------------------------------ object helpers */
export function lookup(doc: PDFDocument, o: PDFObject | undefined): PDFObject | undefined {
  if (!o) return undefined
  return o instanceof PDFRef ? doc.context.lookup(o) : o
}
export function dictOf(doc: PDFDocument, o: PDFObject | undefined): PDFDict | undefined {
  const v = lookup(doc, o)
  if (v instanceof PDFDict) return v
  if (v instanceof PDFStream) return (v as any).dict as PDFDict
  return undefined
}
export function arrOf(doc: PDFDocument, o: PDFObject | undefined): PDFArray | undefined {
  const v = lookup(doc, o)
  return v instanceof PDFArray ? v : undefined
}
export function nameOf(doc: PDFDocument, o: PDFObject | undefined): string | undefined {
  const v = lookup(doc, o)
  return v instanceof PDFName ? v.decodeText() : undefined
}
export function numOf(doc: PDFDocument, o: PDFObject | undefined): number | undefined {
  const v = lookup(doc, o)
  return v instanceof PDFNumber ? v.asNumber() : undefined
}
export function textOf(doc: PDFDocument, o: PDFObject | undefined): string | undefined {
  const v = lookup(doc, o)
  if (v instanceof PDFString || v instanceof PDFHexString) return v.decodeText()
  if (v instanceof PDFName) return v.decodeText()
  return undefined
}
export function boolOf(doc: PDFDocument, o: PDFObject | undefined): boolean | undefined {
  const v = lookup(doc, o)
  return v instanceof PDFBool ? v.asBoolean() : undefined
}
export const pdfText = (s: string) => PDFHexString.fromText(s)

/** All indirect objects */
export function allObjects(doc: PDFDocument) { return doc.context.enumerateIndirectObjects() }

/** Map page ref string → index */
export function pageIndexMap(doc: PDFDocument) {
  const m = new Map<string, number>()
  doc.getPages().forEach((p, i) => m.set(p.ref.toString(), i))
  return m
}

/** Stream bytes, decoded when possible */
export function streamBytes(s: PDFStream): Uint8Array | null {
  try {
    if (s instanceof PDFRawStream) return decodePDFRawStream(s).decode()
    return (s as any).getContents?.() ?? null
  } catch { return null }
}

/* ------------------------------------------------------------------ page geometry */
export function cropBox(page: PDFPage): Box {
  const b = page.getCropBox()
  return { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height }
}
export const rotOf = (page: PDFPage) => ((((page.getRotation().angle ?? 0) % 360) + 360) % 360) as 0 | 90 | 180 | 270
/** Visual size of a page (what a viewer shows), in points */
export function visualSize(page: PDFPage): [number, number] {
  const b = cropBox(page); const w = b.x1 - b.x0, h = b.y1 - b.y0
  return rotOf(page) % 180 ? [h, w] : [w, h]
}

/** Create a content stream and register it */
function contentStream(doc: PDFDocument, ops: string) {
  return doc.context.register(doc.context.flateStream(enc(ops)))
}
const f = (n: number) => (Math.round(n * 10000) / 10000).toString()

/** Draw an XObject (embedded page) with an explicit matrix. `under` puts it below existing content. Optional clip in page space. */
export function placeXObject(page: PDFPage, xref: PDFRef, m: number[], opts: { under?: boolean; clip?: Box; opacityGs?: string } = {}) {
  const name = page.node.newXObject('B1X', xref)
  let ops = 'q\n'
  if (opts.clip) ops += `${f(opts.clip.x0)} ${f(opts.clip.y0)} ${f(opts.clip.x1 - opts.clip.x0)} ${f(opts.clip.y1 - opts.clip.y0)} re W n\n`
  if (opts.opacityGs) ops += `/${opts.opacityGs} gs\n`
  ops += `${m.map(f).join(' ')} cm\n/${name.decodeText()} Do\nQ\n`
  const ref = contentStream(page.doc, ops)
  if (opts.under) {
    const c = page.node.get(N('Contents'))
    if (c instanceof PDFArray) c.insert(0, ref)
    else if (c) page.node.set(N('Contents'), page.doc.context.obj([ref, c]))
    else page.node.set(N('Contents'), ref)
  } else {
    // make sure previous content cannot leak a transform into ours
    page.node.wrapContentStreams(page.doc.context.getPushGraphicsStateContentStream(), page.doc.context.getPopGraphicsStateContentStream())
    page.node.addContentStream(ref)
  }
}

/** Matrix that draws a source page box (w×h, rotated by `rot` like /Rotate) into a visual target rect at scale s. */
export function rotatedMatrix(rot: number, w: number, h: number, x: number, y: number, s: number): number[] {
  switch (rot) {
    case 90: return [0, -s, s, 0, x, y + w * s]
    case 180: return [-s, 0, 0, -s, x + w * s, y + h * s]
    case 270: return [0, s, -s, 0, x + h * s, y]
    default: return [s, 0, 0, s, x, y]
  }
}

/** Embed pages of `src` (by index) into `out` using their crop boxes. */
export async function embedPages(out: PDFDocument, src: PDFDocument, idx: number[]) {
  const pages = idx.map((i) => src.getPage(i))
  const boxes = pages.map((p) => { const b = cropBox(p); return { left: b.x0, bottom: b.y0, right: b.x1, top: b.y1 } })
  return out.embedPages(pages, boxes)
}

/* ------------------------------------------------------------------ resize pages */
export const SHEETS: Record<string, [number, number]> = {
  a3: [841.89, 1190.55], a4: [595.28, 841.89], a5: [419.53, 595.28], a6: [297.64, 419.53], b5: [498.9, 708.66],
  letter: [612, 792], legal: [612, 1008], tabloid: [792, 1224], executive: [521.86, 756],
}
export type FitMode = 'fit' | 'fill' | 'stretch' | 'none'
export interface ResizeOpts { size: [number, number]; orientation: 'auto' | 'portrait' | 'landscape'; fit: FitMode; margin: number; pages?: number[]; align?: 'center' | 'top' }
export async function resizePages(bytes: Bytes, o: ResizeOpts) {
  const src = await open(bytes); assertNotEncrypted(src)
  const out = await PDFDocument.create()
  const n = src.getPageCount()
  const target = new Set(o.pages ?? Array.from({ length: n }, (_, i) => i))
  const emb = await embedPages(out, src, Array.from({ length: n }, (_, i) => i))
  for (let i = 0; i < n; i++) {
    const sp = src.getPage(i)
    const [vw, vh] = visualSize(sp)
    if (!target.has(i)) { const [p] = await out.copyPages(src, [i]); out.addPage(p); continue }
    let [W, H] = o.size
    const land = o.orientation === 'landscape' || (o.orientation === 'auto' && vw > vh)
    if (land ? W < H : W > H) [W, H] = [H, W]
    const page = out.addPage([W, H])
    const aw = Math.max(1, W - 2 * o.margin), ah = Math.max(1, H - 2 * o.margin)
    const b = cropBox(sp); const w = b.x1 - b.x0, h = b.y1 - b.y0
    const rot = rotOf(sp)
    let sx: number, sy: number
    if (o.fit === 'stretch') { sx = aw / vw; sy = ah / vh } else {
      const s = o.fit === 'none' ? 1 : o.fit === 'fill' ? Math.max(aw / vw, ah / vh) : Math.min(aw / vw, ah / vh)
      sx = sy = s
    }
    const dw = vw * sx, dh = vh * sy
    const x = o.margin + (aw - dw) / 2
    const y = o.align === 'top' ? H - o.margin - dh : o.margin + (ah - dh) / 2
    const base = rotatedMatrix(rot, w, h, 0, 0, 1)
    // base maps the box onto [0,vw]x[0,vh]; then scale and translate
    const m = [base[0] * sx, base[1] * sy, base[2] * sx, base[3] * sy, base[4] * sx + x, base[5] * sy + y]
    placeXObject(page, emb[i].ref, m, { clip: o.fit === 'fill' || o.fit === 'none' ? { x0: o.margin, y0: o.margin, x1: W - o.margin, y1: H - o.margin } : undefined })
  }
  copyInfo(src, out)
  return out.save()
}

export function copyInfo(src: PDFDocument, out: PDFDocument) {
  try {
    const t = src.getTitle(); if (t) out.setTitle(t)
    const a = src.getAuthor(); if (a) out.setAuthor(a)
    const s = src.getSubject(); if (s) out.setSubject(s)
    const k = src.getKeywords(); if (k) out.setKeywords([k])
  } catch { /* ignore */ }
  out.setProducer('OpenFile')
}

/* ------------------------------------------------------------------ split pages in half */
export type HalfDir = 'vertical' | 'horizontal'
/** The two halves of a page in user space, in visual reading order (left→right or top→bottom). */
export function halves(b: Box, rot: number, dir: HalfDir, ratio = 0.5): [Box, Box] {
  const xm = b.x0 + (b.x1 - b.x0) * ratio, ym = b.y0 + (b.y1 - b.y0) * ratio
  const xmr = b.x0 + (b.x1 - b.x0) * (1 - ratio), ymr = b.y0 + (b.y1 - b.y0) * (1 - ratio)
  const L = (x: number): Box => ({ ...b, x1: x }), R = (x: number): Box => ({ ...b, x0: x })
  const B = (y: number): Box => ({ ...b, y1: y }), T = (y: number): Box => ({ ...b, y0: y })
  // visual-first, visual-second for each rotation
  if (dir === 'vertical') {
    if (rot === 0) return [L(xm), R(xm)]
    if (rot === 90) return [B(ym), T(ym)]
    if (rot === 180) return [R(xmr), L(xmr)]
    return [T(ymr), B(ymr)]
  }
  if (rot === 0) return [T(ymr), B(ymr)]
  if (rot === 90) return [L(xm), R(xm)]
  if (rot === 180) return [B(ym), T(ym)]
  return [R(xmr), L(xmr)]
}
export interface HalvesOpts { dir: HalfDir; rtl?: boolean; skipFirst?: boolean; skipLast?: boolean; ratio?: number; onlyLandscape?: boolean }
export async function splitHalves(bytes: Bytes, o: HalvesOpts) {
  const src = await open(bytes); assertNotEncrypted(src)
  const out = await PDFDocument.create()
  const n = src.getPageCount()
  for (let i = 0; i < n; i++) {
    const sp = src.getPage(i)
    const [vw, vh] = visualSize(sp)
    const skip = (o.skipFirst && i === 0) || (o.skipLast && i === n - 1 && n > 1) || (o.onlyLandscape && (o.dir === 'vertical' ? vw <= vh : vh <= vw))
    if (skip) { const [p] = await out.copyPages(src, [i]); out.addPage(p); continue }
    let [a, b] = halves(cropBox(sp), rotOf(sp), o.dir, o.ratio ?? 0.5)
    if (o.rtl && o.dir === 'vertical') [a, b] = [b, a]
    for (const box of [a, b]) {
      const [p] = await out.copyPages(src, [i])
      p.setMediaBox(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0)
      p.setCropBox(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0)
      p.node.delete(N('TrimBox')); p.node.delete(N('BleedBox')); p.node.delete(N('ArtBox'))
      out.addPage(p)
    }
  }
  copyInfo(src, out)
  return out.save()
}

/* ------------------------------------------------------------------ flip / mirror */
export async function flipPages(bytes: Bytes, o: { horizontal: boolean; vertical: boolean; pages?: number[] }) {
  const doc = await open(bytes); assertNotEncrypted(doc)
  const pages = doc.getPages()
  const target = o.pages ?? pages.map((_, i) => i)
  for (const i of target) {
    const p = pages[i]; if (!p) continue
    const rot = rotOf(p)
    // visual horizontal flip = user-space x flip when upright, y flip when rotated 90/270
    let fx = o.horizontal, fy = o.vertical
    if (rot % 180) [fx, fy] = [fy, fx]
    if (!fx && !fy) continue
    const mb = p.getMediaBox()
    const a = fx ? -1 : 1, d = fy ? -1 : 1
    const e = fx ? 2 * mb.x + mb.width : 0, fty = fy ? 2 * mb.y + mb.height : 0
    const start = contentStream(doc, `q ${a} 0 0 ${d} ${f(e)} ${f(fty)} cm\n`)
    const end = contentStream(doc, '\nQ\n')
    p.node.wrapContentStreams(start, end)
    // mirror annotation rectangles so links stay over the right spot
    const annots = arrOf(doc, p.node.get(N('Annots')))
    if (annots) for (let k = 0; k < annots.size(); k++) {
      const ad = dictOf(doc, annots.get(k)); const r = ad && arrOf(doc, ad.get(N('Rect')))
      if (!ad || !r || r.size() < 4) continue
      let [x0, y0, x1, y1] = [0, 1, 2, 3].map((j) => numOf(doc, r.get(j)) ?? 0)
      if (fx) [x0, x1] = [e - x1, e - x0]
      if (fy) [y0, y1] = [fty - y1, fty - y0]
      ad.set(N('Rect'), doc.context.obj([x0, y0, x1, y1]))
    }
  }
  return doc.save()
}

/* ------------------------------------------------------------------ overlay */
export interface OverlayOpts { mode: 'over' | 'under'; repeat: 'first' | 'cycle' | 'match'; fit: 'fit' | 'stretch' | 'none'; opacity?: number; pages?: number[] }
export async function overlayPdf(baseBytes: Bytes, ovBytes: Bytes, o: OverlayOpts) {
  const doc = await open(baseBytes); assertNotEncrypted(doc)
  const ov = await open(ovBytes); assertNotEncrypted(ov)
  const on = ov.getPageCount()
  const emb = await embedPages(doc, ov, Array.from({ length: on }, (_, i) => i))
  let gs: string | undefined
  const pages = doc.getPages()
  const target = new Set(o.pages ?? pages.map((_, i) => i))
  pages.forEach((page, i) => {
    if (!target.has(i)) return
    const k = o.repeat === 'first' ? 0 : o.repeat === 'cycle' ? i % on : i
    if (k >= on) return
    const op = ov.getPage(k)
    const [ow, oh] = visualSize(op)
    const b = cropBox(op); const w = b.x1 - b.x0, h = b.y1 - b.y0
    const pb = cropBox(page); const pw = pb.x1 - pb.x0, ph = pb.y1 - pb.y0
    const prot = rotOf(page)
    // target visual size in page user space (handle rotated base pages by working in user space)
    const tw = prot % 180 ? ph : pw, th = prot % 180 ? pw : ph
    let sx = 1, sy = 1
    if (o.fit === 'stretch') { sx = tw / ow; sy = th / oh } else if (o.fit === 'fit') { sx = sy = Math.min(tw / ow, th / oh) }
    const dw = ow * sx, dh = oh * sy
    const base = rotatedMatrix(rotOf(op), w, h, 0, 0, 1)
    // visual placement (centered) in a virtual upright frame of size tw×th
    let m = [base[0] * sx, base[1] * sy, base[2] * sx, base[3] * sy, base[4] * sx + (tw - dw) / 2, base[5] * sy + (th - dh) / 2]
    // then undo base page rotation so the overlay appears upright to the reader
    const undo = rotatedMatrix((360 - prot) % 360, tw, th, pb.x0, pb.y0, 1)
    m = mul(m, undo)
    if (o.opacity !== undefined && o.opacity < 1) {
      if (!gs) gs = 'B1GS'
      const res = page.node.normalizedEntries().Resources
      let ext = res.lookup(N('ExtGState'))
      if (!(ext instanceof PDFDict)) { ext = doc.context.obj({}); res.set(N('ExtGState'), ext) }
      ;(ext as PDFDict).set(N(gs), doc.context.obj({ Type: 'ExtGState', ca: o.opacity, CA: o.opacity }))
    }
    placeXObject(page, emb[k].ref, m, { under: o.mode === 'under', opacityGs: gs && o.opacity !== undefined && o.opacity < 1 ? gs : undefined })
  })
  return doc.save()
}
/** Multiply affine matrices: apply a then b */
export function mul(a: number[], b: number[]) {
  return [
    a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
  ]
}

/* ------------------------------------------------------------------ poster / tiling */
export interface PosterOpts { page: number; cols: number; rows: number; sheet: [number, number]; landscape: boolean; margin: number; overlap: number; marks: boolean; labels: boolean }
export function posterLayout(o: Pick<PosterOpts, 'cols' | 'rows' | 'sheet' | 'landscape' | 'margin' | 'overlap'>, vw: number, vh: number) {
  let [W, H] = o.sheet; if (o.landscape ? W < H : W > H) [W, H] = [H, W]
  const cw = W - 2 * o.margin, ch = H - 2 * o.margin
  const totalW = o.cols * cw - (o.cols - 1) * o.overlap
  const totalH = o.rows * ch - (o.rows - 1) * o.overlap
  const s = Math.min(totalW / vw, totalH / vh)
  return { W, H, cw, ch, s, posterW: vw * s, posterH: vh * s, offX: (totalW - vw * s) / 2, offY: (totalH - vh * s) / 2 }
}
export async function makePoster(bytes: Bytes, o: PosterOpts) {
  const src = await open(bytes); assertNotEncrypted(src)
  const out = await PDFDocument.create()
  const sp = src.getPage(o.page)
  const [emb] = await embedPages(out, src, [o.page])
  const [vw, vh] = visualSize(sp)
  const b = cropBox(sp); const w = b.x1 - b.x0, h = b.y1 - b.y0
  const L = posterLayout(o, vw, vh)
  const font = await out.embedFont('Helvetica')
  for (let r = 0; r < o.rows; r++) for (let c = 0; c < o.cols; c++) {
    const page = out.addPage([L.W, L.H])
    // poster coordinates: origin at top-left of whole poster; this tile shows [tx, tx+cw] × [ty, ty+ch]
    const tx = c * (L.cw - o.overlap), ty = r * (L.ch - o.overlap)
    const totalH = o.rows * L.ch - (o.rows - 1) * o.overlap
    // position of poster image bottom-left in this page's coordinates
    const px = o.margin - tx + L.offX
    const py = o.margin + L.ch - (totalH - ty) + (totalH - L.offY - L.posterH)
    const m = rotatedMatrix(rotOf(sp), w, h, px, py, L.s)
    placeXObject(page, emb.ref, m, { clip: { x0: o.margin, y0: o.margin, x1: L.W - o.margin, y1: L.H - o.margin } })
    const g = 0.45
    if (o.marks) {
      const len = Math.min(18, o.margin * 0.8)
      const ops = [] as string[]
      const corners: [number, number][] = [[o.margin, o.margin], [L.W - o.margin, o.margin], [o.margin, L.H - o.margin], [L.W - o.margin, L.H - o.margin]]
      for (const [x, y] of corners) {
        const dx = x < L.W / 2 ? -1 : 1, dy = y < L.H / 2 ? -1 : 1
        ops.push(`${f(x)} ${f(y + dy * 2)} m ${f(x)} ${f(y + dy * (2 + len))} l S`, `${f(x + dx * 2)} ${f(y)} m ${f(x + dx * (2 + len))} ${f(y)} l S`)
      }
      if (o.overlap > 0) {
        ops.push('[3 3] 0 d')
        if (c > 0) ops.push(`${f(o.margin + o.overlap)} ${f(o.margin)} m ${f(o.margin + o.overlap)} ${f(L.H - o.margin)} l S`)
        if (r > 0) ops.push(`${f(o.margin)} ${f(L.H - o.margin - o.overlap)} m ${f(L.W - o.margin)} ${f(L.H - o.margin - o.overlap)} l S`)
      }
      page.node.addContentStream(contentStream(out, `q ${g} G 0.5 w ${ops.join('\n')} Q\n`))
    }
    if (o.labels && o.margin >= 10) {
      const label = `${String.fromCharCode(65 + (r % 26))}${c + 1}  (row ${r + 1}, column ${c + 1} of ${o.rows}×${o.cols})`
      page.drawText(label, { x: o.margin, y: Math.max(3, o.margin / 2 - 3), size: Math.min(8, o.margin / 2.5), font, color: { type: 'RGB', red: g, green: g, blue: g } as any })
    }
  }
  out.setProducer('OpenFile')
  return out.save()
}

/* ------------------------------------------------------------------ alternate / mix */
export interface MixSource { bytes: Bytes; reverse?: boolean }
export async function alternateMix(sources: MixSource[], o: { chunk: number[]; loopRest: boolean }) {
  const out = await PDFDocument.create()
  const docs = await Promise.all(sources.map((s) => open(s.bytes)))
  docs.forEach(assertNotEncrypted)
  const orders = docs.map((d, k) => { const a = Array.from({ length: d.getPageCount() }, (_, i) => i); return sources[k].reverse ? a.reverse() : a })
  const pos = orders.map(() => 0)
  const plan: [number, number][] = []
  while (pos.some((p, k) => p < orders[k].length)) {
    let progressed = false
    for (let k = 0; k < docs.length; k++) {
      const take = Math.max(1, o.chunk[k] ?? 1)
      for (let t = 0; t < take && pos[k] < orders[k].length; t++) { plan.push([k, orders[k][pos[k]++]]); progressed = true }
    }
    if (!o.loopRest && pos.some((p, k) => p >= orders[k].length)) {
      // append what is left in order
      for (let k = 0; k < docs.length; k++) while (pos[k] < orders[k].length) plan.push([k, orders[k][pos[k]++]])
    }
    if (!progressed) break
  }
  for (const [k, i] of plan) { const [p] = await out.copyPages(docs[k], [i]); out.addPage(p) }
  out.setProducer('OpenFile')
  return { bytes: await out.save(), plan }
}

/* ------------------------------------------------------------------ annotations */
export interface AnnotInfo { page: number; subtype: string; contents?: string; rect: number[]; uri?: string; dest?: number }
export function listAnnotations(doc: PDFDocument): AnnotInfo[] {
  const map = pageIndexMap(doc)
  const out: AnnotInfo[] = []
  doc.getPages().forEach((p, i) => {
    const annots = arrOf(doc, p.node.get(N('Annots')))
    if (!annots) return
    for (let k = 0; k < annots.size(); k++) {
      const d = dictOf(doc, annots.get(k)); if (!d) continue
      const r = arrOf(doc, d.get(N('Rect')))
      const info: AnnotInfo = { page: i, subtype: nameOf(doc, d.get(N('Subtype'))) ?? 'Unknown', contents: textOf(doc, d.get(N('Contents'))), rect: r ? [0, 1, 2, 3].map((j) => numOf(doc, r.get(j)) ?? 0) : [0, 0, 0, 0] }
      const a = dictOf(doc, d.get(N('A')))
      if (a) {
        const s = nameOf(doc, a.get(N('S')))
        if (s === 'URI') info.uri = textOf(doc, a.get(N('URI')))
        if (s === 'GoTo') info.dest = destPage(doc, a.get(N('D')), map)
      }
      const dd = d.get(N('Dest')); if (dd) info.dest = destPage(doc, dd, map)
      out.push(info)
    }
  })
  return out
}
export function destPage(doc: PDFDocument, dest: PDFObject | undefined, map = pageIndexMap(doc)): number | undefined {
  let v = lookup(doc, dest)
  if (v instanceof PDFString || v instanceof PDFHexString || v instanceof PDFName) v = resolveNamedDest(doc, v instanceof PDFName ? v.decodeText() : v.decodeText())
  if (v instanceof PDFDict) v = lookup(doc, v.get(N('D')))
  if (v instanceof PDFArray && v.size()) {
    const first = v.get(0)
    if (first instanceof PDFRef) return map.get(first.toString())
    if (first instanceof PDFNumber) return first.asNumber()
  }
  return undefined
}
function resolveNamedDest(doc: PDFDocument, name: string): PDFObject | undefined {
  const cat = doc.catalog
  const dests = dictOf(doc, cat.get(N('Dests')))
  if (dests) { const v = dests.get(N(name)); if (v) return lookup(doc, v) }
  const names = dictOf(doc, cat.get(N('Names')))
  const tree = names && dictOf(doc, names.get(N('Dests')))
  if (tree) { let found: PDFObject | undefined; walkNameTree(doc, tree, (k, v) => { if (k === name) found = lookup(doc, v) }); return found }
  return undefined
}
export function walkNameTree(doc: PDFDocument, node: PDFDict, cb: (key: string, val: PDFObject, holder: PDFArray, idx: number) => void, depth = 0) {
  if (depth > 32) return
  const names = arrOf(doc, node.get(N('Names')))
  if (names) for (let i = 0; i + 1 < names.size(); i += 2) cb(textOf(doc, names.get(i)) ?? '', names.get(i + 1), names, i)
  const kids = arrOf(doc, node.get(N('Kids')))
  if (kids) for (let i = 0; i < kids.size(); i++) { const k = dictOf(doc, kids.get(i)); if (k) walkNameTree(doc, k, cb, depth + 1) }
}

export const ANNOT_GROUPS: { id: string; label: string; types: string[] }[] = [
  { id: 'comments', label: 'Comments and notes', types: ['Text', 'FreeText', 'Popup'] },
  { id: 'markup', label: 'Highlights, underlines, strike-outs', types: ['Highlight', 'Underline', 'StrikeOut', 'Squiggly', 'Caret'] },
  { id: 'drawings', label: 'Drawings and shapes', types: ['Ink', 'Line', 'Square', 'Circle', 'Polygon', 'PolyLine'] },
  { id: 'stamps', label: 'Stamps', types: ['Stamp'] },
  { id: 'links', label: 'Links', types: ['Link'] },
  { id: 'files', label: 'File attachments and media', types: ['FileAttachment', 'Sound', 'Movie', 'Screen', 'RichMedia', '3D'] },
  { id: 'forms', label: 'Form fields', types: ['Widget'] },
  { id: 'other', label: 'Other (redact marks, watermarks, print marks)', types: ['Redact', 'Watermark', 'PrinterMark', 'TrapNet'] },
]
export function groupOf(subtype: string) { return ANNOT_GROUPS.find((g) => g.types.includes(subtype))?.id ?? 'other' }

export async function removeAnnotations(bytes: Bytes, groups: Set<string>, pages?: Set<number>) {
  const doc = await open(bytes); assertNotEncrypted(doc)
  let removed = 0
  const removedRefs = new Set<string>()
  doc.getPages().forEach((p, i) => {
    if (pages && !pages.has(i)) return
    const annots = arrOf(doc, p.node.get(N('Annots')))
    if (!annots) return
    const keep: PDFObject[] = []
    for (let k = 0; k < annots.size(); k++) {
      const raw = annots.get(k); const d = dictOf(doc, raw)
      const st = d ? nameOf(doc, d.get(N('Subtype'))) ?? 'Unknown' : 'Unknown'
      if (groups.has(groupOf(st)) || (st === 'Popup' && groups.has('comments'))) { removed++; if (raw instanceof PDFRef) removedRefs.add(raw.toString()) } else keep.push(raw)
    }
    if (keep.length) p.node.set(N('Annots'), doc.context.obj(keep)); else p.node.delete(N('Annots'))
  })
  if (groups.has('forms')) {
    doc.catalog.delete(N('AcroForm'))
  }
  return { bytes: await doc.save(), removed }
}

/* ------------------------------------------------------------------ attachments */
export interface Attachment { name: string; description?: string; size?: number; mime?: string; data?: Uint8Array; source: 'document' | 'annotation'; page?: number; created?: string; modified?: string; relationship?: string }
function fileSpecData(doc: PDFDocument, fs: PDFDict) {
  const ef = dictOf(doc, fs.get(N('EF')))
  const s = ef && lookup(doc, ef.get(N('UF')) ?? ef.get(N('F')))
  if (!(s instanceof PDFStream)) return { data: undefined, mime: undefined, size: undefined }
  const data = streamBytes(s) ?? undefined
  const sd = (s as any).dict as PDFDict
  const mime = nameOf(doc, sd.get(N('Subtype')))
  const params = dictOf(doc, sd.get(N('Params')))
  return { data, mime: mime?.replace(/#2F/gi, '/'), size: data?.length ?? (params ? numOf(doc, params.get(N('Size'))) : undefined) }
}
export function listAttachments(doc: PDFDocument): Attachment[] {
  const out: Attachment[] = []
  const names = dictOf(doc, doc.catalog.get(N('Names')))
  const tree = names && dictOf(doc, names.get(N('EmbeddedFiles')))
  if (tree) walkNameTree(doc, tree, (key, val) => {
    const fs = dictOf(doc, val); if (!fs) return
    const fname = textOf(doc, fs.get(N('UF'))) ?? textOf(doc, fs.get(N('F'))) ?? key
    out.push({ name: fname || key, description: textOf(doc, fs.get(N('Desc'))), ...fileSpecData(doc, fs), source: 'document', relationship: nameOf(doc, fs.get(N('AFRelationship'))) })
  })
  doc.getPages().forEach((p, i) => {
    const annots = arrOf(doc, p.node.get(N('Annots')))
    if (!annots) return
    for (let k = 0; k < annots.size(); k++) {
      const d = dictOf(doc, annots.get(k))
      if (!d || nameOf(doc, d.get(N('Subtype'))) !== 'FileAttachment') continue
      const fs = dictOf(doc, d.get(N('FS'))); if (!fs) continue
      out.push({ name: textOf(doc, fs.get(N('UF'))) ?? textOf(doc, fs.get(N('F'))) ?? 'attachment', description: textOf(doc, d.get(N('Contents'))), ...fileSpecData(doc, fs), source: 'annotation', page: i })
    }
  })
  return out
}
export interface NewAttachment { name: string; data: Uint8Array; mime?: string; description?: string; relationship?: 'Data' | 'Source' | 'Alternative' | 'Supplement' | 'Unspecified' }
/** Rewrite the document-level attachments: keep the ones whose names are in `keep` (by index), add new ones. */
export async function editAttachments(bytes: Bytes, keepIdx: Set<number>, add: NewAttachment[], removeAnnotIdx: Set<number> = new Set()) {
  const doc = await open(bytes); assertNotEncrypted(doc)
  const names = dictOf(doc, doc.catalog.get(N('Names')))
  const tree = names && dictOf(doc, names.get(N('EmbeddedFiles')))
  const keptPairs: [PDFObject, PDFObject][] = []
  let i = 0
  if (tree) walkNameTree(doc, tree, (_k, val, holder, idx) => { if (keepIdx.has(i)) keptPairs.push([holder.get(idx), val]); i++ })
  // file attachment annotations
  if (removeAnnotIdx.size) {
    let a = 0
    doc.getPages().forEach((p) => {
      const annots = arrOf(doc, p.node.get(N('Annots'))); if (!annots) return
      const keep: PDFObject[] = []
      for (let k = 0; k < annots.size(); k++) {
        const d = dictOf(doc, annots.get(k))
        if (d && nameOf(doc, d.get(N('Subtype'))) === 'FileAttachment') { if (removeAnnotIdx.has(a++)) continue }
        keep.push(annots.get(k))
      }
      if (keep.length) p.node.set(N('Annots'), doc.context.obj(keep)); else p.node.delete(N('Annots'))
    })
  }
  if (names) names.delete(N('EmbeddedFiles'))
  // remove AF entries that point at dropped files (rebuilt below for kept + new)
  doc.catalog.delete(N('AF'))
  const afRefs: PDFObject[] = []
  const pairs = [...keptPairs]
  for (const p of keptPairs) { const d = dictOf(doc, p[1]); if (d && d.get(N('AFRelationship'))) afRefs.push(p[1]) }
  for (const a of add) {
    const fs = embedFileSpec(doc, a)
    pairs.push([PDFHexString.fromText(a.name), fs])
    if (a.relationship) afRefs.push(fs)
  }
  pairs.sort((x, y) => (textOf(doc, x[0]) ?? '').localeCompare(textOf(doc, y[0]) ?? ''))
  if (pairs.length) {
    const nd = names ?? doc.context.obj({})
    if (!names) doc.catalog.set(N('Names'), nd)
    ;(nd as PDFDict).set(N('EmbeddedFiles'), doc.context.obj({ Names: pairs.flat() }))
    if (afRefs.length) doc.catalog.set(N('AF'), doc.context.obj(afRefs))
  }
  return doc.save()
}
export function embedFileSpec(doc: PDFDocument, a: NewAttachment) {
  const now = pdfDate(new Date())
  const ctx = doc.context
  const stream = ctx.flateStream(a.data, {
    Type: 'EmbeddedFile',
    ...(a.mime ? { Subtype: a.mime } : {}),
    Params: { Size: a.data.length, CreationDate: PDFString.of(now), ModDate: PDFString.of(now) },
  })
  const sref = ctx.register(stream)
  const spec = ctx.obj({
    Type: 'Filespec', F: PDFString.of(asciiName(a.name)), UF: PDFHexString.fromText(a.name),
    EF: { F: sref, UF: sref },
    ...(a.description ? { Desc: PDFHexString.fromText(a.description) } : {}),
    ...(a.relationship ? { AFRelationship: a.relationship } : {}),
  })
  return ctx.register(spec)
}
const asciiName = (s: string) => s.normalize('NFKD').replace(/[^\x20-\x7e]/g, '_')
export function pdfDate(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  const tz = -d.getTimezoneOffset(); const sign = tz >= 0 ? '+' : '-'; const az = Math.abs(tz)
  return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${sign}${p(Math.floor(az / 60))}'${p(az % 60)}'`
}

/* ------------------------------------------------------------------ bookmarks (outline) */
export interface Bookmark { title: string; page: number; level: number; open?: boolean }
export function readOutline(doc: PDFDocument): Bookmark[] {
  const out: Bookmark[] = []
  const map = pageIndexMap(doc)
  const root = dictOf(doc, doc.catalog.get(N('Outlines')))
  if (!root) return out
  const seen = new Set<string>()
  const walk = (first: PDFObject | undefined, level: number) => {
    let cur = first
    let guard = 0
    while (cur && guard++ < 10000) {
      const key = cur.toString(); if (seen.has(key)) break; seen.add(key)
      const d = dictOf(doc, cur); if (!d) break
      const title = textOf(doc, d.get(N('Title'))) ?? ''
      let page = destPage(doc, d.get(N('Dest')), map)
      const a = dictOf(doc, d.get(N('A')))
      if (page === undefined && a && nameOf(doc, a.get(N('S'))) === 'GoTo') page = destPage(doc, a.get(N('D')), map)
      const count = numOf(doc, d.get(N('Count')))
      out.push({ title, page: page ?? 0, level, open: count === undefined ? false : count > 0 })
      walk(d.get(N('First')), level + 1)
      cur = d.get(N('Next'))
    }
  }
  walk(root.get(N('First')), 0)
  return out
}
/** Write a nested outline from a flat list with levels. Replaces any existing outline. */
export function writeOutline(doc: PDFDocument, items: Bookmark[], showPanel = true) {
  const ctx = doc.context
  const pages = doc.getPages()
  doc.catalog.delete(N('Outlines'))
  if (!items.length) return
  type Node = { item: Bookmark; ref: PDFRef; dict: PDFDict; kids: Node[] }
  const rootRef = ctx.nextRef()
  const rootKids: Node[] = []
  const stack: Node[] = []
  for (const raw of items) {
    const it = { ...raw, level: Math.max(0, Math.min(raw.level, stack.length)) }
    while (stack.length > it.level) stack.pop()
    const p = pages[Math.max(0, Math.min(pages.length - 1, it.page))]
    const dict = ctx.obj({ Title: PDFHexString.fromText(it.title || 'Untitled'), Dest: [p.ref, 'XYZ', null, null, null] }) as PDFDict
    const node: Node = { item: it, ref: ctx.nextRef(), dict, kids: [] }
    ;(stack.length ? stack[stack.length - 1].kids : rootKids).push(node)
    stack.push(node)
  }
  const count = (n: Node): number => n.kids.reduce((s, k) => s + 1 + (k.item.open ? count(k) : 0), 0)
  const link = (parent: PDFRef, kids: Node[]) => {
    kids.forEach((k, i) => {
      k.dict.set(N('Parent'), parent)
      if (i > 0) k.dict.set(N('Prev'), kids[i - 1].ref)
      if (i < kids.length - 1) k.dict.set(N('Next'), kids[i + 1].ref)
      if (k.kids.length) {
        k.dict.set(N('First'), k.kids[0].ref); k.dict.set(N('Last'), k.kids[k.kids.length - 1].ref)
        const c = count(k); k.dict.set(N('Count'), PDFNumber.of(k.item.open ? c : -k.kids.length))
        link(k.ref, k.kids)
      }
      ctx.assign(k.ref, k.dict)
    })
  }
  link(rootRef, rootKids)
  const total = rootKids.reduce((s, k) => s + 1 + (k.item.open ? count(k) : 0), 0)
  ctx.assign(rootRef, ctx.obj({ Type: 'Outlines', First: rootKids[0].ref, Last: rootKids[rootKids.length - 1].ref, Count: total }))
  doc.catalog.set(N('Outlines'), rootRef)
  if (showPanel) doc.catalog.set(N('PageMode'), N('UseOutlines'))
}

/* ------------------------------------------------------------------ links */
export interface LinkSpec { page: number; rect: [number, number, number, number]; kind: 'url' | 'page'; url?: string; target?: number; border?: boolean }
export function readLinks(doc: PDFDocument): LinkSpec[] {
  return listAnnotations(doc).filter((a) => a.subtype === 'Link').map((a) => ({
    page: a.page, rect: [Math.min(a.rect[0], a.rect[2]), Math.min(a.rect[1], a.rect[3]), Math.max(a.rect[0], a.rect[2]), Math.max(a.rect[1], a.rect[3])],
    kind: a.uri !== undefined ? 'url' : 'page', url: a.uri, target: a.dest,
  }))
}
export async function writeLinks(bytes: Bytes, links: LinkSpec[]) {
  const doc = await open(bytes); assertNotEncrypted(doc)
  const pages = doc.getPages()
  for (const p of pages) {
    const annots = arrOf(doc, p.node.get(N('Annots'))); if (!annots) continue
    const keep: PDFObject[] = []
    for (let k = 0; k < annots.size(); k++) { const d = dictOf(doc, annots.get(k)); if (d && nameOf(doc, d.get(N('Subtype'))) === 'Link') continue; keep.push(annots.get(k)) }
    if (keep.length) p.node.set(N('Annots'), doc.context.obj(keep)); else p.node.delete(N('Annots'))
  }
  for (const l of links) {
    const p = pages[l.page]; if (!p) continue
    const base: Record<string, any> = { Type: 'Annot', Subtype: 'Link', Rect: l.rect, Border: [0, 0, l.border ? 1 : 0], F: 4 }
    if (l.border) base.C = [0.13, 0.55, 0.85]
    if (l.kind === 'url') {
      const url = (l.url ?? '').trim(); if (!url) continue
      base.A = { Type: 'Action', S: 'URI', URI: PDFString.of(normalizeUrl(url)) }
    } else {
      const t = pages[Math.max(0, Math.min(pages.length - 1, l.target ?? 0))]
      base.Dest = [t.ref, 'XYZ', null, null, null]
    }
    const ref = doc.context.register(doc.context.obj(base))
    const annots = arrOf(doc, p.node.get(N('Annots')))
    if (annots) annots.push(ref); else p.node.set(N('Annots'), doc.context.obj([ref]))
  }
  return doc.save()
}
export function normalizeUrl(u: string) {
  if (/^(https?|mailto|tel|ftp):/i.test(u)) return u
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u)) return 'mailto:' + u
  return 'https://' + u
}

/* ------------------------------------------------------------------ viewer preferences */
export interface ViewerPrefs {
  pageLayout: '' | 'SinglePage' | 'OneColumn' | 'TwoColumnLeft' | 'TwoColumnRight' | 'TwoPageLeft' | 'TwoPageRight'
  pageMode: '' | 'UseNone' | 'UseOutlines' | 'UseThumbs' | 'FullScreen' | 'UseOC' | 'UseAttachments'
  openPage: number
  zoom: '' | 'Fit' | 'FitH' | 'FitV' | 'FitB' | 'XYZ'
  zoomPercent: number
  hideToolbar: boolean; hideMenubar: boolean; hideWindowUI: boolean; fitWindow: boolean; centerWindow: boolean; displayDocTitle: boolean
  direction: 'L2R' | 'R2L'
  printScaling: 'AppDefault' | 'None'
  duplex: '' | 'Simplex' | 'DuplexFlipShortEdge' | 'DuplexFlipLongEdge'
  title?: string
}
export function readViewerPrefs(doc: PDFDocument): ViewerPrefs {
  const cat = doc.catalog
  const vp = dictOf(doc, cat.get(N('ViewerPreferences')))
  const b = (k: string) => (vp ? boolOf(doc, vp.get(N(k))) ?? false : false)
  let openPage = 0, zoom: ViewerPrefs['zoom'] = '', zoomPercent = 100
  const oa = lookup(doc, cat.get(N('OpenAction')))
  const dest = oa instanceof PDFArray ? oa : oa instanceof PDFDict ? arrOf(doc, oa.get(N('D'))) : undefined
  if (dest && dest.size()) {
    openPage = destPage(doc, dest) ?? 0
    const z = nameOf(doc, dest.get(1)) as ViewerPrefs['zoom']
    if (z) zoom = z
    if (z === 'XYZ') { const zz = numOf(doc, dest.get(4)); if (zz) zoomPercent = Math.round(zz * 100) }
  }
  return {
    pageLayout: (nameOf(doc, cat.get(N('PageLayout'))) ?? '') as any,
    pageMode: (nameOf(doc, cat.get(N('PageMode'))) ?? '') as any,
    openPage, zoom, zoomPercent,
    hideToolbar: b('HideToolbar'), hideMenubar: b('HideMenubar'), hideWindowUI: b('HideWindowUI'), fitWindow: b('FitWindow'), centerWindow: b('CenterWindow'), displayDocTitle: b('DisplayDocTitle'),
    direction: (vp && nameOf(doc, vp.get(N('Direction'))) === 'R2L') ? 'R2L' : 'L2R',
    printScaling: (vp && nameOf(doc, vp.get(N('PrintScaling'))) === 'None') ? 'None' : 'AppDefault',
    duplex: ((vp && nameOf(doc, vp.get(N('Duplex')))) ?? '') as any,
    title: doc.getTitle() ?? '',
  }
}
export async function writeViewerPrefs(bytes: Bytes, v: ViewerPrefs) {
  const doc = await open(bytes); assertNotEncrypted(doc)
  const cat = doc.catalog
  const set = (k: string, val: string) => { if (val) cat.set(N(k), N(val)); else cat.delete(N(k)) }
  set('PageLayout', v.pageLayout); set('PageMode', v.pageMode)
  const prefs: Record<string, any> = {}
  if (v.hideToolbar) prefs.HideToolbar = true
  if (v.hideMenubar) prefs.HideMenubar = true
  if (v.hideWindowUI) prefs.HideWindowUI = true
  if (v.fitWindow) prefs.FitWindow = true
  if (v.centerWindow) prefs.CenterWindow = true
  if (v.displayDocTitle) prefs.DisplayDocTitle = true
  if (v.direction === 'R2L') prefs.Direction = 'R2L'
  if (v.printScaling === 'None') prefs.PrintScaling = 'None'
  if (v.duplex) prefs.Duplex = v.duplex
  if (v.pageMode === 'FullScreen') prefs.NonFullScreenPageMode = 'UseNone'
  if (Object.keys(prefs).length) cat.set(N('ViewerPreferences'), doc.context.obj(prefs)); else cat.delete(N('ViewerPreferences'))
  const pages = doc.getPages()
  const p = pages[Math.max(0, Math.min(pages.length - 1, v.openPage))]
  if (v.zoom || v.openPage > 0) {
    const z = v.zoom || 'XYZ'
    const arr: any[] = [p.ref, z]
    if (z === 'XYZ') arr.push(null, null, v.zoom === 'XYZ' ? v.zoomPercent / 100 : null)
    if (z === 'FitH' || z === 'FitV') arr.push(null)
    cat.set(N('OpenAction'), doc.context.obj(arr))
  } else cat.delete(N('OpenAction'))
  if (v.title !== undefined && v.title !== (doc.getTitle() ?? '')) doc.setTitle(v.title, { showInWindowTitleBar: v.displayDocTitle })
  return doc.save()
}

/* ------------------------------------------------------------------ sanitize */
export interface SanitizeOpts { javascript: boolean; embeddedFiles: boolean; links: boolean; annotations: boolean; metadata: boolean; forms: boolean; layers: boolean; actions: boolean; thumbnails: boolean }
export async function sanitize(bytes: Bytes, o: SanitizeOpts) {
  const doc = await open(bytes); assertNotEncrypted(doc)
  const report: Record<string, number> = {}
  const bump = (k: string, n = 1) => { report[k] = (report[k] ?? 0) + n }
  const cat = doc.catalog
  const names = dictOf(doc, cat.get(N('Names')))
  const DANGER = new Set(['JavaScript', 'Launch', 'SubmitForm', 'ImportData', 'ResetForm', 'GoToR', 'GoToE', 'Rendition', 'Movie', 'Sound'])
  if (o.javascript || o.actions) {
    if (names?.get(N('JavaScript'))) { names.delete(N('JavaScript')); bump('Document scripts') }
    const oa = dictOf(doc, cat.get(N('OpenAction')))
    if (oa && oa.get(N('S'))) { cat.delete(N('OpenAction')); bump('Open actions') }
    for (const [, obj] of allObjects(doc)) {
      const d = obj instanceof PDFDict ? obj : obj instanceof PDFStream ? (obj as any).dict as PDFDict : null
      if (!d) continue
      if (d.get(N('AA'))) { d.delete(N('AA')); bump('Automatic actions') }
      const s = nameOf(doc, d.get(N('S')))
      if (s && (s === 'JavaScript' ? o.javascript : o.actions && DANGER.has(s))) {
        // neutralise the action in place so references stay valid
        for (const k of d.keys()) d.delete(k)
        d.set(N('Type'), N('Action')); d.set(N('S'), N('Named')); d.set(N('N'), N('NextPage'))
        // a harmless named action is safer than a dangling reference; mark it
        bump(s === 'JavaScript' ? 'Script actions' : 'Risky actions (launch, submit, import)')
      }
      if (o.javascript && d.get(N('JS'))) { d.delete(N('JS')); bump('Script actions') }
    }
    const af = dictOf(doc, cat.get(N('AcroForm')))
    if (af?.get(N('XFA'))) { af.delete(N('XFA')); bump('XFA forms') }
  }
  if (o.embeddedFiles) {
    if (names?.get(N('EmbeddedFiles'))) { const n = listAttachments(doc).filter((a) => a.source === 'document').length; names.delete(N('EmbeddedFiles')); bump('Embedded files', n) }
    cat.delete(N('AF'))
  }
  const killTypes = new Set<string>()
  if (o.links) killTypes.add('Link')
  if (o.embeddedFiles) ['FileAttachment', 'RichMedia', 'Movie', 'Sound', 'Screen', '3D'].forEach((t) => killTypes.add(t))
  if (o.annotations) ANNOT_GROUPS.filter((g) => !['links', 'forms'].includes(g.id)).forEach((g) => g.types.forEach((t) => killTypes.add(t)))
  if (o.forms) killTypes.add('Widget')
  for (const p of doc.getPages()) {
    const annots = arrOf(doc, p.node.get(N('Annots')))
    if (annots) {
      const keep: PDFObject[] = []
      for (let k = 0; k < annots.size(); k++) {
        const d = dictOf(doc, annots.get(k)); const st = d ? nameOf(doc, d.get(N('Subtype'))) ?? '' : ''
        if (killTypes.has(st)) bump(st === 'Link' ? 'Links' : st === 'Widget' ? 'Form fields' : ['FileAttachment', 'RichMedia', 'Movie', 'Sound', 'Screen', '3D'].includes(st) ? 'Attached files and media' : 'Annotations')
        else keep.push(annots.get(k))
      }
      if (keep.length) p.node.set(N('Annots'), doc.context.obj(keep)); else p.node.delete(N('Annots'))
    }
    if (o.thumbnails && p.node.get(N('Thumb'))) { p.node.delete(N('Thumb')); bump('Page thumbnails') }
    if (o.metadata && p.node.get(N('PieceInfo'))) { p.node.delete(N('PieceInfo')); bump('Private app data') }
    if (o.metadata && p.node.get(N('Metadata'))) { p.node.delete(N('Metadata')); bump('Page metadata') }
  }
  if (o.forms && cat.get(N('AcroForm'))) cat.delete(N('AcroForm'))
  if (o.layers && cat.get(N('OCProperties'))) {
    // keep layers but make the visibility config explicit: hidden layers are dropped from view state only
    const ocp = dictOf(doc, cat.get(N('OCProperties')))
    const dd = ocp && dictOf(doc, ocp.get(N('D')))
    const off = dd && arrOf(doc, dd.get(N('OFF')))
    const n = off?.size() ?? 0
    removeHiddenLayerContent(doc, off)
    cat.delete(N('OCProperties'))
    bump('Hidden layers removed', n)
  }
  if (o.metadata) {
    if (cat.get(N('Metadata'))) { cat.delete(N('Metadata')); bump('XMP metadata') }
    if (cat.get(N('PieceInfo'))) cat.delete(N('PieceInfo'))
    const info = doc.context.trailerInfo.Info
    if (info) { doc.context.trailerInfo.Info = undefined as any; bump('Document info (title, author, dates, software)') }
    doc.context.trailerInfo.ID = undefined as any
  }
  return { bytes: await doc.save({ useObjectStreams: true }), report }
}

/** Replace marked content belonging to OFF optional-content groups in page streams with nothing. */
function removeHiddenLayerContent(doc: PDFDocument, off: PDFArray | undefined) {
  if (!off || !off.size()) return
  const offRefs = new Set<string>()
  for (let i = 0; i < off.size(); i++) offRefs.add(off.get(i).toString())
  for (const p of doc.getPages()) {
    const res = dictOf(doc, p.node.get(N('Resources')))
    const props = res && dictOf(doc, res.get(N('Properties')))
    if (!props) continue
    const hiddenNames = new Set<string>()
    for (const [k, v] of props.entries()) if (offRefs.has(v.toString())) hiddenNames.add(k.decodeText())
    if (!hiddenNames.size) continue
    const contents = lookup(doc, p.node.get(N('Contents')))
    const list: PDFObject[] = contents instanceof PDFArray ? contents.asArray() : contents ? [p.node.get(N('Contents'))!] : []
    let text = ''
    for (const c of list) { const s = lookup(doc, c); if (s instanceof PDFStream) { const b = streamBytes(s); if (b) text += latin1(b) + '\n' } }
    const cleaned = stripOcBlocks(text, hiddenNames)
    if (cleaned !== text) p.node.set(N('Contents'), doc.context.register(doc.context.flateStream(latin1Bytes(cleaned))))
  }
}
export const latin1 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return s }
export const latin1Bytes = (s: string) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b }
/** Remove `/OC /Name BDC ... EMC` blocks (with nesting) for the given property names. */
export function stripOcBlocks(src: string, names: Set<string>) {
  const re = /\/OC\s*\/([^\s/<>[\]()]+)\s*BDC/g
  let out = '', last = 0, m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    if (!names.has(m[1])) continue
    // find matching EMC accounting for nested BDC/BMC
    const tok = /\b(BDC|BMC|EMC)\b/g; tok.lastIndex = m.index + m[0].length
    let depth = 1, t: RegExpExecArray | null, end = -1
    while ((t = tok.exec(src))) { if (t[1] === 'EMC') { if (--depth === 0) { end = t.index + 3; break } } else depth++ }
    if (end < 0) break
    out += src.slice(last, m.index); last = end; re.lastIndex = end
  }
  return out + src.slice(last)
}

/* ------------------------------------------------------------------ inspector */
export interface FontReport { name: string; type: string; embedded: boolean; subset: boolean; toUnicode: boolean }
export interface ImageReport { w: number; h: number; filter: string; colorSpace: string; bpc: number; bytes: number }
export interface StructReport {
  version: string; pages: number; encrypted: boolean; linearized: boolean; incrementalUpdates: number
  info: Record<string, string>; xmp: string | null; pdfaClaim: string | null; pdfuaClaim: boolean
  pageSizes: { w: number; h: number; count: number; label: string }[]
  fonts: FontReport[]; images: ImageReport[]; javascript: boolean; actions: string[]; attachments: number; formFields: number; xfa: boolean
  annotations: Record<string, number>; tagged: boolean; lang: string | null; outlineItems: number; layers: number; signatures: number
  outputIntents: string[]; objects: number; transparency: boolean
}
export function sizeLabel(w: number, h: number) {
  const a = Math.min(w, h), b = Math.max(w, h)
  for (const [k, [x, y]] of Object.entries(SHEETS)) if (Math.abs(a - x) < 3 && Math.abs(b - y) < 3) return k.charAt(0).toUpperCase() + k.slice(1) + (w > h ? ' landscape' : '')
  return `${(w / 72 * 25.4).toFixed(0)} × ${(h / 72 * 25.4).toFixed(0)} mm`
}
export function inspectStructure(doc: PDFDocument, raw: Uint8Array): StructReport {
  const head = latin1(raw.subarray(0, 1024))
  const tail = latin1(raw.subarray(Math.max(0, raw.length - 4096)))
  const version = head.match(/%PDF-(\d\.\d)/)?.[1] ?? '?'
  const cat = doc.catalog
  const catVersion = nameOf(doc, cat.get(N('Version')))
  const fullText = raw.length < 64 * 1024 * 1024 ? latin1(raw) : head + tail
  const info: Record<string, string> = {}
  const id = doc.context.trailerInfo.Info
  const infoDict = id ? dictOf(doc, id as any) : undefined
  if (infoDict) for (const [k, v] of infoDict.entries()) { const t = textOf(doc, v); if (t) info[k.decodeText()] = t }
  let xmp: string | null = null
  const ms = lookup(doc, cat.get(N('Metadata')))
  if (ms instanceof PDFStream) { const b = streamBytes(ms); if (b) xmp = new TextDecoder().decode(b) }
  const pdfaPart = xmp?.match(/pdfaid:part\s*(?:=\s*["']|>)\s*(\d)/)?.[1]
  const pdfaConf = xmp?.match(/pdfaid:conformance\s*(?:=\s*["']|>)\s*([A-Za-z])/)?.[1]
  const sizes = new Map<string, { w: number; h: number; count: number; label: string }>()
  for (const p of doc.getPages()) {
    const [w, h] = visualSize(p); const k = `${w.toFixed(0)}x${h.toFixed(0)}`
    const e = sizes.get(k) ?? { w, h, count: 0, label: sizeLabel(w, h) }; e.count++; sizes.set(k, e)
  }
  const fonts: FontReport[] = []; const images: ImageReport[] = []
  let javascript = !!dictOf(doc, cat.get(N('Names')))?.get(N('JavaScript'))
  const actions = new Set<string>(); let transparency = false
  for (const [, obj] of allObjects(doc)) {
    const d = obj instanceof PDFDict ? obj : obj instanceof PDFStream ? (obj as any).dict as PDFDict : null
    if (!d) continue
    const type = nameOf(doc, d.get(N('Type'))); const sub = nameOf(doc, d.get(N('Subtype')))
    if (type === 'Font' && sub !== 'CIDFontType0' && sub !== 'CIDFontType2') {
      const base = nameOf(doc, d.get(N('BaseFont'))) ?? '(unnamed)'
      let fd = dictOf(doc, d.get(N('FontDescriptor')))
      if (sub === 'Type0') { const df = arrOf(doc, d.get(N('DescendantFonts'))); const d0 = df && dictOf(doc, df.get(0)); fd = d0 && dictOf(doc, d0.get(N('FontDescriptor'))) }
      const embedded = sub === 'Type3' || !!(fd && (fd.get(N('FontFile')) || fd.get(N('FontFile2')) || fd.get(N('FontFile3'))))
      fonts.push({ name: base.replace(/^[A-Z]{6}\+/, ''), type: sub ?? '?', embedded, subset: /^[A-Z]{6}\+/.test(base), toUnicode: !!d.get(N('ToUnicode')) })
    }
    if (sub === 'Image' && obj instanceof PDFStream) {
      const filt = lookup(doc, d.get(N('Filter')))
      const filter = filt instanceof PDFName ? filt.decodeText() : filt instanceof PDFArray ? filt.asArray().map((x) => (x instanceof PDFName ? x.decodeText() : '?')).join('+') : 'none'
      const cs = lookup(doc, d.get(N('ColorSpace')))
      const colorSpace = cs instanceof PDFName ? cs.decodeText() : cs instanceof PDFArray ? (nameOf(doc, cs.get(0)) ?? '?') : (boolOf(doc, d.get(N('ImageMask'))) ? 'Mask' : '?')
      images.push({ w: numOf(doc, d.get(N('Width'))) ?? 0, h: numOf(doc, d.get(N('Height'))) ?? 0, filter, colorSpace, bpc: numOf(doc, d.get(N('BitsPerComponent'))) ?? 0, bytes: (obj as any).contents?.length ?? 0 })
      if (d.get(N('SMask'))) transparency = true
    }
    if (type === 'Group' || nameOf(doc, d.get(N('S'))) === 'Transparency') transparency = true
    if (type === 'ExtGState') {
      const ca = numOf(doc, d.get(N('ca'))), CA = numOf(doc, d.get(N('CA'))), bm = nameOf(doc, d.get(N('BM'))), sm = d.get(N('SMask'))
      if ((ca !== undefined && ca < 1) || (CA !== undefined && CA < 1) || (bm && bm !== 'Normal' && bm !== 'Compatible') || (sm && nameOf(doc, sm) !== 'None')) transparency = true
    }
    const s = nameOf(doc, d.get(N('S')))
    if (s && ['JavaScript', 'Launch', 'SubmitForm', 'ImportData', 'URI', 'GoToR', 'GoToE', 'Rendition'].includes(s)) actions.add(s)
    if (s === 'JavaScript' || d.get(N('JS'))) javascript = true
  }
  const annots: Record<string, number> = {}
  let formFields = 0
  for (const a of listAnnotations(doc)) { annots[a.subtype] = (annots[a.subtype] ?? 0) + 1; if (a.subtype === 'Widget') formFields++ }
  const af = dictOf(doc, cat.get(N('AcroForm')))
  const fieldsArr = af && arrOf(doc, af.get(N('Fields')))
  let signatures = 0
  if (fieldsArr) {
    const walk = (a: PDFArray, depth = 0) => { for (let i = 0; i < a.size(); i++) { const fd = dictOf(doc, a.get(i)); if (!fd) continue; if (nameOf(doc, fd.get(N('FT'))) === 'Sig' && fd.get(N('V'))) signatures++; const kids = arrOf(doc, fd.get(N('Kids'))); if (kids && depth < 20) walk(kids, depth + 1) } }
    walk(fieldsArr)
    formFields = Math.max(formFields, countFields(doc, fieldsArr))
  }
  const ocp = dictOf(doc, cat.get(N('OCProperties')))
  const ocgs = ocp && arrOf(doc, ocp.get(N('OCGs')))
  const oi = arrOf(doc, cat.get(N('OutputIntents')))
  const outputIntents: string[] = []
  if (oi) for (let i = 0; i < oi.size(); i++) { const d = dictOf(doc, oi.get(i)); if (d) outputIntents.push(`${nameOf(doc, d.get(N('S'))) ?? '?'}: ${textOf(doc, d.get(N('OutputConditionIdentifier'))) ?? ''}`) }
  const markInfo = dictOf(doc, cat.get(N('MarkInfo')))
  return {
    version: catVersion && catVersion > version ? catVersion : version,
    pages: doc.getPageCount(), encrypted: isEncrypted(doc),
    linearized: /\/Linearized\s/.test(head),
    incrementalUpdates: Math.max(0, (fullText.match(/%%EOF/g) ?? []).length - 1),
    info, xmp, pdfaClaim: pdfaPart ? `PDF/A-${pdfaPart}${(pdfaConf ?? '').toLowerCase()}` : null,
    pdfuaClaim: !!xmp && /pdfuaid:part/.test(xmp),
    pageSizes: [...sizes.values()], fonts: dedupeFonts(fonts), images, javascript, actions: [...actions],
    attachments: listAttachments(doc).length, formFields, xfa: !!af?.get(N('XFA')),
    annotations: annots, tagged: (markInfo ? boolOf(doc, markInfo.get(N('Marked'))) : false) === true && !!cat.get(N('StructTreeRoot')),
    lang: textOf(doc, cat.get(N('Lang'))) ?? null, outlineItems: readOutline(doc).length, layers: ocgs?.size() ?? 0, signatures,
    outputIntents, objects: doc.context.enumerateIndirectObjects().length, transparency,
  }
}
function countFields(doc: PDFDocument, a: PDFArray, depth = 0): number {
  let n = 0
  for (let i = 0; i < a.size(); i++) { const d = dictOf(doc, a.get(i)); if (!d) continue; const kids = arrOf(doc, d.get(N('Kids'))); if (kids && depth < 20 && kids.size() && dictOf(doc, kids.get(0))?.get(N('T'))) n += countFields(doc, kids, depth + 1); else n++ }
  return n
}
function dedupeFonts(f: FontReport[]) {
  const m = new Map<string, FontReport>()
  for (const x of f) { const k = x.name + '|' + x.type; const e = m.get(k); if (!e || (!e.embedded && x.embedded)) m.set(k, x) }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFHexString, PDFNumber, PDFRef, PDFStream, PDFRawStream, PDFNull }
