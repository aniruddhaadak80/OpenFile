/* Pull embedded images out of a PDF at original quality (JPEG/JPEG2000 passthrough, others decoded to PNG). */
import { PDFDocument, PDFName, PDFArray, PDFDict, PDFNumber, PDFRawStream, PDFStream, PDFRef, PDFHexString, PDFString, decodePDFRawStream } from 'pdf-lib'
import { encodePng } from './png'

export interface ExtractedImage { id: string; name: string; ext: 'jpg' | 'jp2' | 'png'; data: Uint8Array; w: number; h: number; colorSpace: string; pages: number[]; bytes: number; note?: string }
export interface ExtractResult { images: ExtractedImage[]; skipped: { reason: string; count: number }[] }

const nm = (o: any) => (o instanceof PDFName ? o.decodeText() : undefined)
const num = (o: any, d = 0) => (o instanceof PDFNumber ? o.asNumber() : d)

function filters(doc: PDFDocument, d: PDFDict): string[] {
  const f = d.lookup(PDFName.of('Filter'))
  if (f instanceof PDFName) return [f.decodeText()]
  if (f instanceof PDFArray) return f.asArray().map((x) => nm(doc.context.lookup(x)) ?? '?')
  return []
}
function parms(doc: PDFDocument, d: PDFDict, i: number): PDFDict | undefined {
  const p = d.lookup(PDFName.of('DecodeParms'))
  if (p instanceof PDFDict) return i === 0 ? p : undefined
  if (p instanceof PDFArray) { const x = doc.context.lookup(p.get(i)); return x instanceof PDFDict ? x : undefined }
  return undefined
}

/** Undo PNG (10-15) and TIFF (2) predictors */
export function unpredict(data: Uint8Array, predictor: number, colors: number, bpc: number, columns: number) {
  if (predictor < 2) return data
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8))
  const rowLen = Math.ceil((columns * colors * bpc) / 8)
  if (predictor === 2) {
    if (bpc !== 8) return data
    const out = new Uint8Array(data)
    for (let r = 0; r * rowLen < out.length; r++) for (let i = bpp; i < rowLen; i++) { const k = r * rowLen + i; if (k < out.length) out[k] = (out[k] + out[k - bpp]) & 255 }
    return out
  }
  const rows = Math.floor(data.length / (rowLen + 1))
  const out = new Uint8Array(rows * rowLen)
  const prev = new Uint8Array(rowLen)
  for (let r = 0; r < rows; r++) {
    const type = data[r * (rowLen + 1)]
    const src = data.subarray(r * (rowLen + 1) + 1, (r + 1) * (rowLen + 1))
    const cur = out.subarray(r * rowLen, (r + 1) * rowLen)
    for (let i = 0; i < rowLen; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0
      let v = src[i]
      if (type === 1) v += a; else if (type === 2) v += b; else if (type === 3) v += (a + b) >> 1
      else if (type === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      cur[i] = v & 255
    }
    prev.set(cur)
  }
  return out
}

type CS = { kind: 'gray' | 'rgb' | 'cmyk' | 'indexed' | 'lab' | 'unknown'; n: number; base?: CS; hival?: number; lookup?: Uint8Array; name: string }
function colorSpace(doc: PDFDocument, o: any, depth = 0): CS {
  const v = o instanceof PDFRef ? doc.context.lookup(o) : o
  const n = nm(v)
  if (n) {
    if (n === 'DeviceGray' || n === 'CalGray' || n === 'G') return { kind: 'gray', n: 1, name: n }
    if (n === 'DeviceRGB' || n === 'CalRGB' || n === 'RGB') return { kind: 'rgb', n: 3, name: n }
    if (n === 'DeviceCMYK' || n === 'CMYK') return { kind: 'cmyk', n: 4, name: n }
    return { kind: 'unknown', n: 0, name: n }
  }
  if (v instanceof PDFArray && depth < 4) {
    const t = nm(doc.context.lookup(v.get(0)))
    if (t === 'ICCBased') {
      const s = doc.context.lookup(v.get(1))
      const dd = s instanceof PDFStream ? (s as any).dict as PDFDict : undefined
      const N = dd ? num(dd.lookup(PDFName.of('N')), 3) : 3
      return { kind: N === 1 ? 'gray' : N === 4 ? 'cmyk' : 'rgb', n: N, name: 'ICCBased' }
    }
    if (t === 'CalRGB') return { kind: 'rgb', n: 3, name: t }
    if (t === 'CalGray') return { kind: 'gray', n: 1, name: t }
    if (t === 'Lab') return { kind: 'lab', n: 3, name: t }
    if (t === 'Indexed' || t === 'I') {
      const base = colorSpace(doc, v.get(1), depth + 1)
      const hival = num(doc.context.lookup(v.get(2)))
      const lk = doc.context.lookup(v.get(3))
      let lookup: Uint8Array | undefined
      if (lk instanceof PDFHexString || lk instanceof PDFString) lookup = lk.asBytes()
      else if (lk instanceof PDFRawStream) { try { lookup = decodePDFRawStream(lk).decode() } catch { /* */ } }
      else if (lk instanceof PDFStream) lookup = (lk as any).getContents?.()
      return { kind: 'indexed', n: 1, base, hival, lookup, name: `Indexed ${base.name}` }
    }
    if (t === 'Separation' || t === 'DeviceN') return { kind: 'unknown', n: 0, name: t }
  }
  return { kind: 'unknown', n: 0, name: '?' }
}

/** Expand packed samples (1/2/4/8/16 bpc) into 8-bit per component */
function unpack(data: Uint8Array, w: number, h: number, comps: number, bpc: number, scaleTo255 = true) {
  const out = new Uint8Array(w * h * comps)
  if (bpc === 8) { out.set(data.subarray(0, out.length)); return out }
  const rowBytes = Math.ceil((w * comps * bpc) / 8)
  const max = (1 << bpc) - 1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w * comps; x++) {
      let v: number
      if (bpc === 16) v = data[y * rowBytes + x * 2]
      else { const bit = x * bpc; const byte = data[y * rowBytes + (bit >> 3)] ?? 0; v = (byte >> (8 - bpc - (bit & 7))) & max; if (scaleTo255) v = Math.round((v * 255) / max) }
      out[y * w * comps + x] = v
    }
  }
  return out
}

function decodeSamples(doc: PDFDocument, s: PDFRawStream): Uint8Array | null {
  const d = (s as any).dict as PDFDict
  try {
    let data = decodePDFRawStream(s).decode()
    const fl = filters(doc, d)
    const p = parms(doc, d, Math.max(0, fl.length - 1))
    if (p) {
      const pred = num(p.lookup(PDFName.of('Predictor')), 1)
      if (pred > 1) data = unpredict(data, pred, num(p.lookup(PDFName.of('Colors')), 1), num(p.lookup(PDFName.of('BitsPerComponent')), 8), num(p.lookup(PDFName.of('Columns')), 1))
    }
    return data
  } catch { return null }
}

/** Decode an image XObject into RGBA. Returns null when the format is not supported. */
export function decodeImage(doc: PDFDocument, s: PDFRawStream): { rgba: Uint8Array; w: number; h: number; cs: string } | { error: string } {
  const d = (s as any).dict as PDFDict
  const w = num(d.lookup(PDFName.of('Width'))), h = num(d.lookup(PDFName.of('Height')))
  if (!w || !h) return { error: 'missing size' }
  const fl = filters(doc, d)
  if (fl.some((f) => f === 'CCITTFaxDecode' || f === 'CCF')) return { error: 'fax-compressed (CCITT) scans' }
  if (fl.some((f) => f === 'JBIG2Decode')) return { error: 'JBIG2 scans' }
  if (fl.some((f) => f === 'DCTDecode' || f === 'JPXDecode')) return { error: 'JPEG inside another filter' }
  const isMask = d.lookup(PDFName.of('ImageMask'))?.toString() === 'true'
  const bpc = isMask ? 1 : num(d.lookup(PDFName.of('BitsPerComponent')), 8)
  const cs = isMask ? { kind: 'gray', n: 1, name: 'Mask' } as CS : colorSpace(doc, d.lookup(PDFName.of('ColorSpace')))
  if (cs.kind === 'unknown' || cs.kind === 'lab') return { error: `${cs.name} colors` }
  const raw = decodeSamples(doc, s)
  if (!raw) return { error: 'unsupported compression' }
  const decodeArr = d.lookup(PDFName.of('Decode'))
  const invert = decodeArr instanceof PDFArray && num(decodeArr.get(0)) === 1 && num(decodeArr.get(1)) === 0
  const rgba = new Uint8Array(w * h * 4)
  if (cs.kind === 'indexed') {
    const idx = unpack(raw, w, h, 1, bpc, false)
    const base = cs.base!, lk = cs.lookup ?? new Uint8Array(0), bn = base.n || 3
    for (let i = 0; i < w * h; i++) {
      const k = idx[i] * bn
      if (base.kind === 'gray') { const g = lk[k] ?? 0; rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = g }
      else if (base.kind === 'cmyk') { const [r, g, b] = cmyk(lk[k], lk[k + 1], lk[k + 2], lk[k + 3]); rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b }
      else { rgba[i * 4] = lk[k] ?? 0; rgba[i * 4 + 1] = lk[k + 1] ?? 0; rgba[i * 4 + 2] = lk[k + 2] ?? 0 }
      rgba[i * 4 + 3] = 255
    }
  } else {
    const n = cs.n
    const px = unpack(raw, w, h, n, bpc)
    for (let i = 0; i < w * h; i++) {
      let r: number, g: number, b: number
      if (n === 1) { r = g = b = px[i] } else if (n === 4) { [r, g, b] = cmyk(px[i * 4], px[i * 4 + 1], px[i * 4 + 2], px[i * 4 + 3]) } else { r = px[i * 3]; g = px[i * 3 + 1]; b = px[i * 3 + 2] }
      if (invert) { r = 255 - r; g = 255 - g; b = 255 - b }
      if (isMask) { // stencil: 0 = paint (black), 1 = transparent (default decode)
        const paint = invert ? px[i] === 255 : px[i] === 0
        rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = 0; rgba[i * 4 + 3] = paint ? 255 : 0; continue
      }
      rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = 255
    }
  }
  // soft mask
  const sm = d.lookup(PDFName.of('SMask'))
  if (sm instanceof PDFRawStream) {
    const md = (sm as any).dict as PDFDict
    const mw = num(md.lookup(PDFName.of('Width'))), mh = num(md.lookup(PDFName.of('Height')))
    const mraw = mw === w && mh === h ? decodeSamples(doc, sm) : null
    if (mraw) { const a = unpack(mraw, w, h, 1, num(md.lookup(PDFName.of('BitsPerComponent')), 8)); for (let i = 0; i < w * h; i++) rgba[i * 4 + 3] = a[i] }
  }
  return { rgba, w, h, cs: cs.name }
}
const cmyk = (c: number, m: number, y: number, k: number): [number, number, number] => [255 - Math.min(255, c + k), 255 - Math.min(255, m + k), 255 - Math.min(255, y + k)]

export async function extractImages(bytes: Uint8Array, opts: { minSize?: number; skipMasks?: boolean; onProgress?: (p: number) => void } = {}): Promise<ExtractResult> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  if (doc.context.trailerInfo.Encrypt) throw new Error('This PDF is encrypted. Remove the password first with Unlock PDF.')
  // which pages use which image refs (direct page resources and nested form XObjects)
  const usage = new Map<string, Set<number>>()
  const smasks = new Set<string>()
  const visit = (res: PDFDict | undefined, page: number, depth: number) => {
    if (!res || depth > 6) return
    const xo = res.lookup(PDFName.of('XObject'))
    if (!(xo instanceof PDFDict)) return
    for (const [, ref] of xo.entries()) {
      const obj = ref instanceof PDFRef ? doc.context.lookup(ref) : ref
      if (!(obj instanceof PDFStream)) continue
      const dd = (obj as any).dict as PDFDict
      const sub = nm(dd.lookup(PDFName.of('Subtype')))
      if (sub === 'Image' && ref instanceof PDFRef) { const k = ref.toString(); if (!usage.has(k)) usage.set(k, new Set()); usage.get(k)!.add(page); const sm = dd.get(PDFName.of('SMask')); if (sm instanceof PDFRef) smasks.add(sm.toString()); const mk = dd.get(PDFName.of('Mask')); if (mk instanceof PDFRef) smasks.add(mk.toString()) }
      else if (sub === 'Form') { const r = dd.lookup(PDFName.of('Resources')); visit(r instanceof PDFDict ? r : undefined, page, depth + 1) }
    }
  }
  doc.getPages().forEach((p, i) => { const r = p.node.Resources(); visit(r, i, 0) })
  const images: ExtractedImage[] = []
  const skipped = new Map<string, number>()
  const entries = [...usage.entries()]
  let k = 0
  for (const [key, pages] of entries) {
    k++
    opts.onProgress?.(k / entries.length)
    if (opts.skipMasks !== false && smasks.has(key)) continue
    const [objNum, gen] = key.split(' ').map(Number)
    const s = doc.context.lookup(PDFRef.of(objNum, gen))
    if (!(s instanceof PDFRawStream)) continue
    const d = (s as any).dict as PDFDict
    const w = num(d.lookup(PDFName.of('Width'))), h = num(d.lookup(PDFName.of('Height')))
    if (opts.minSize && (w < opts.minSize || h < opts.minSize)) { skipped.set('smaller than the size limit', (skipped.get('smaller than the size limit') ?? 0) + 1); continue }
    const fl = filters(doc, d)
    const csName = colorSpace(doc, d.lookup(PDFName.of('ColorSpace'))).name
    const base = `page${[...pages][0] + 1}-img${images.length + 1}`
    if (fl.length === 1 && (fl[0] === 'DCTDecode' || fl[0] === 'JPXDecode')) {
      const data = s.contents
      images.push({ id: key, name: `${base}.${fl[0] === 'DCTDecode' ? 'jpg' : 'jp2'}`, ext: fl[0] === 'DCTDecode' ? 'jpg' : 'jp2', data, w, h, colorSpace: csName, pages: [...pages], bytes: data.length, note: csName.includes('CMYK') || csName === 'ICCBased' && colorSpace(doc, d.lookup(PDFName.of('ColorSpace'))).n === 4 ? 'CMYK JPEG' : undefined })
      continue
    }
    const r = decodeImage(doc, s)
    if ('error' in r) { skipped.set(r.error, (skipped.get(r.error) ?? 0) + 1); continue }
    const opaque = (() => { for (let i = 3; i < r.rgba.length; i += 4) if (r.rgba[i] !== 255) return false; return true })()
    let png: Uint8Array
    if (opaque) { const rgb = new Uint8Array(r.w * r.h * 3); for (let i = 0, j = 0; i < r.rgba.length; i += 4, j += 3) { rgb[j] = r.rgba[i]; rgb[j + 1] = r.rgba[i + 1]; rgb[j + 2] = r.rgba[i + 2] } png = encodePng(rgb, r.w, r.h, 3) }
    else png = encodePng(r.rgba, r.w, r.h, 4)
    images.push({ id: key, name: `${base}.png`, ext: 'png', data: png, w: r.w, h: r.h, colorSpace: r.cs, pages: [...pages], bytes: s.contents.length })
  }
  return { images, skipped: [...skipped.entries()].map(([reason, count]) => ({ reason, count })) }
}
