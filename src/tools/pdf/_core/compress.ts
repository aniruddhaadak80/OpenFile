/* Browser-side PDF compression strategies. Import dynamically. */
import { PDFName, PDFRawStream, PDFDict, PDFArray, PDFNumber, PDFRef, PDFStream, PDFBool } from 'pdf-lib'
import { deflateSync, inflateSync } from 'fflate'
import { load, save, losslessOptimize } from './ops'
import { rasterizePdf } from '@/lib/pdf'

export type Preset = 'low' | 'medium' | 'high' | 'extreme'
export const PRESETS: Record<Preset, { label: string; desc: string; maxPx: number; q: number; dpi: number; rq: number }> = {
  low: { label: 'Low', desc: 'Best quality, light savings', maxPx: 2400, q: 0.85, dpi: 150, rq: 0.82 },
  medium: { label: 'Medium', desc: 'Good quality, solid savings', maxPx: 1600, q: 0.72, dpi: 120, rq: 0.7 },
  high: { label: 'High', desc: 'Smaller, softer images', maxPx: 1100, q: 0.6, dpi: 96, rq: 0.56 },
  extreme: { label: 'Extreme', desc: 'Smallest file, visible loss', maxPx: 750, q: 0.45, dpi: 72, rq: 0.42 },
}

export const lossless = async (bytes: Uint8Array, stripMetadata = false) =>
  (await losslessOptimize(bytes, (b) => deflateSync(b, { level: 9 }), { stripMetadata })).bytes

export async function rasterize(bytes: Uint8Array, dpi: number, quality: number, onProgress?: (p: number) => void) {
  return rasterizePdf(bytes, { scale: dpi / 72, quality, type: 'image/jpeg', onProgress })
}

const num = (doc: any, v: any) => { const o = v instanceof PDFRef ? doc.context.lookup(v) : v; return o instanceof PDFNumber ? o.asNumber() : undefined }

function components(doc: any, cs: any): number | null {
  const o = cs instanceof PDFRef ? doc.context.lookup(cs) : cs
  if (!o) return null
  const s = o.toString()
  if (s === '/DeviceRGB' || s === '/CalRGB') return 3
  if (s === '/DeviceGray' || s === '/CalGray') return 1
  if (o instanceof PDFArray) {
    const kind = o.get(0)?.toString()
    if (kind === '/ICCBased') {
      const st = doc.context.lookup(o.get(1))
      const n = st instanceof PDFStream ? num(doc, st.dict.get(PDFName.of('N'))) : undefined
      return n === 3 || n === 1 ? n : null
    }
    if (kind === '/CalRGB') return 3
    if (kind === '/CalGray') return 1
  }
  return null
}

function unpredict(data: Uint8Array, colors: number, columns: number) {
  const row = colors * columns, bpp = colors
  const rows = Math.floor(data.length / (row + 1))
  const out = new Uint8Array(rows * row)
  for (let y = 0; y < rows; y++) {
    const ft = data[y * (row + 1)], src = y * (row + 1) + 1, dst = y * row
    for (let x = 0; x < row; x++) {
      const a = x >= bpp ? out[dst + x - bpp] : 0, b = y ? out[dst - row + x] : 0, c = y && x >= bpp ? out[dst - row + x - bpp] : 0
      let v = data[src + x]
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1
      else if (ft === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      out[dst + x] = v & 255
    }
  }
  return out
}

/** Re-encode embedded raster images as downsampled JPEGs. Text and vectors stay untouched. */
export async function smartImages(bytes: Uint8Array, maxPx: number, quality: number, onProgress?: (p: number) => void) {
  const doc = await load(bytes)
  const ctx = doc.context
  const all = ctx.enumerateIndirectObjects()
  // images used as soft masks / masks must stay single-channel
  const masks = new Set<string>()
  for (const [, o] of all) {
    const d = o instanceof PDFStream ? o.dict : o instanceof PDFDict ? o : null
    if (!d) continue
    for (const k of ['SMask', 'Mask']) { const v = d.get(PDFName.of(k)); if (v instanceof PDFRef) masks.add(v.toString()) }
  }
  const images = all.filter(([ref, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype'))?.toString() === '/Image' && !masks.has(ref.toString())) as [PDFRef, PDFRawStream][]
  let changed = 0, saved = 0
  for (let k = 0; k < images.length; k++) {
    const [ref, st] = images[k]
    onProgress?.((k + 1) / images.length)
    try {
      const d = st.dict
      if (d.get(PDFName.of('ImageMask')) instanceof PDFBool && (d.get(PDFName.of('ImageMask')) as PDFBool).asBoolean()) continue
      if (d.get(PDFName.of('Decode')) || d.get(PDFName.of('SMaskInData'))) continue
      let filter = d.get(PDFName.of('Filter')) as any
      if (filter instanceof PDFArray) { if (filter.size() !== 1) continue; filter = filter.get(0) }
      const f = filter?.toString()
      const w = num(doc, d.get(PDFName.of('Width'))) ?? 0, h = num(doc, d.get(PDFName.of('Height'))) ?? 0
      if (w * h < 200 * 200 || st.contents.length < 20000) continue
      const comps = components(doc, d.get(PDFName.of('ColorSpace')))
      if (!comps) continue
      let bmp: ImageBitmap
      if (f === '/DCTDecode') {
        bmp = await createImageBitmap(new Blob([st.contents as BlobPart], { type: 'image/jpeg' }))
      } else if (f === '/FlateDecode') {
        if ((num(doc, d.get(PDFName.of('BitsPerComponent'))) ?? 8) !== 8) continue
        let raw = inflateSync(st.contents)
        let parms = d.get(PDFName.of('DecodeParms')) as any
        if (parms instanceof PDFArray) parms = parms.get(0)
        if (parms instanceof PDFRef) parms = ctx.lookup(parms)
        const pred = parms instanceof PDFDict ? num(doc, parms.get(PDFName.of('Predictor'))) ?? 1 : 1
        if (pred >= 10) raw = unpredict(raw, comps, w)
        else if (pred !== 1) continue
        if (raw.length < w * h * comps) continue
        const id = new ImageData(w, h)
        for (let i = 0, j = 0; i < w * h; i++) {
          if (comps === 3) { id.data[j++] = raw[i * 3]; id.data[j++] = raw[i * 3 + 1]; id.data[j++] = raw[i * 3 + 2] }
          else { const g = raw[i]; id.data[j++] = g; id.data[j++] = g; id.data[j++] = g }
          id.data[j++] = 255
        }
        bmp = await createImageBitmap(id)
      } else continue
      const s = Math.min(1, maxPx / Math.max(w, h))
      const nw = Math.max(1, Math.round(w * s)), nh = Math.max(1, Math.round(h * s))
      const c = document.createElement('canvas'); c.width = nw; c.height = nh
      const g = c.getContext('2d')!
      g.fillStyle = '#fff'; g.fillRect(0, 0, nw, nh)
      g.imageSmoothingQuality = 'high'
      g.drawImage(bmp, 0, 0, nw, nh); bmp.close?.()
      const blob: Blob = await new Promise((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('encode failed'))), 'image/jpeg', quality))
      const jpg = new Uint8Array(await blob.arrayBuffer())
      if (jpg.length >= st.contents.length * 0.9) continue
      const nd = d.clone(ctx)
      nd.set(PDFName.of('Filter'), PDFName.of('DCTDecode'))
      nd.delete(PDFName.of('DecodeParms'))
      nd.set(PDFName.of('Width'), PDFNumber.of(nw)); nd.set(PDFName.of('Height'), PDFNumber.of(nh))
      nd.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8))
      nd.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'))
      nd.set(PDFName.of('Length'), PDFNumber.of(jpg.length))
      ctx.assign(ref, PDFRawStream.of(nd, jpg))
      saved += st.contents.length - jpg.length; changed++
    } catch { /* leave this image untouched */ }
  }
  return { bytes: await save(doc, true), images: images.length, changed, saved }
}
