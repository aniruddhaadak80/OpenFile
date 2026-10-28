/* Multi-page baseline TIFF writer: RGB, grayscale or 1-bit, with LZW, Deflate, PackBits or no compression. Pure TS. */
import { zlibSync } from 'fflate'

export type TiffCompression = 'none' | 'lzw' | 'deflate' | 'packbits'
export type TiffColor = 'rgb' | 'gray' | 'bw'
export interface TiffPage { width: number; height: number; rgba: Uint8Array | Uint8ClampedArray }
export interface TiffOpts { compression: TiffCompression; color: TiffColor; dpi: number; threshold?: number; dither?: boolean }

/** TIFF-flavoured LZW (MSB first, early change), as written by libtiff. */
export function lzwEncode(data: Uint8Array): Uint8Array {
  const out: number[] = []
  let bitBuf = 0, bitCnt = 0
  const emit = (code: number, width: number) => { bitBuf = (bitBuf << width) | code; bitCnt += width; while (bitCnt >= 8) { out.push((bitBuf >>> (bitCnt - 8)) & 255); bitCnt -= 8 } bitBuf &= (1 << bitCnt) - 1 }
  const CLEAR = 256, EOI = 257
  let dict = new Map<number, number>()
  let next = 258, width = 9
  emit(CLEAR, width)
  if (!data.length) { emit(EOI, width); if (bitCnt) out.push((bitBuf << (8 - bitCnt)) & 255); return new Uint8Array(out) }
  let prefix = data[0]
  for (let i = 1; i < data.length; i++) {
    const c = data[i]
    const key = (prefix << 8) | c
    const hit = dict.get(key)
    if (hit !== undefined) { prefix = hit; continue }
    emit(prefix, width)
    dict.set(key, next++)
    // same rules as libtiff: reset when the table is full, widen when the next code no longer fits
    if (next === 4094) { emit(CLEAR, width); dict = new Map(); next = 258; width = 9 }
    else if (next > (1 << width) - 1) width++
    prefix = c
  }
  emit(prefix, width)
  next++
  if (next === 4094) { emit(CLEAR, width); width = 9 } else if (next > (1 << width) - 1) width++
  emit(EOI, width)
  if (bitCnt) out.push((bitBuf << (8 - bitCnt)) & 255)
  return new Uint8Array(out)
}

export function packBits(row: Uint8Array): number[] {
  const out: number[] = []
  let i = 0
  while (i < row.length) {
    let run = 1
    while (i + run < row.length && run < 128 && row[i + run] === row[i]) run++
    if (run > 1) { out.push(257 - run, row[i]); i += run; continue }
    let lit = 1
    while (i + lit < row.length && lit < 128 && !(i + lit + 1 < row.length && row[i + lit] === row[i + lit + 1])) lit++
    out.push(lit - 1); for (let k = 0; k < lit; k++) out.push(row[i + k]); i += lit
  }
  return out
}

function samples(p: TiffPage, o: TiffOpts) {
  const { width: w, height: h, rgba } = p
  if (o.color === 'rgb') { const d = new Uint8Array(w * h * 3); for (let i = 0, j = 0; i < w * h * 4; i += 4, j += 3) { d[j] = rgba[i]; d[j + 1] = rgba[i + 1]; d[j + 2] = rgba[i + 2] } return { data: d, rowBytes: w * 3, spp: 3, bps: 8 } }
  const gray = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) gray[i] = rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114
  if (o.color === 'gray') { const d = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) d[i] = gray[i]; return { data: d, rowBytes: w, spp: 1, bps: 8 } }
  // 1-bit, WhiteIsZero = 0 means black is 0 when Photometric = BlackIsZero(1): we use BlackIsZero, so 1 = white
  const t = o.threshold ?? 160
  const rowBytes = Math.ceil(w / 8)
  const d = new Uint8Array(rowBytes * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    const old = gray[i]; const v = old >= t ? 255 : 0
    if (o.dither) { const err = old - v; if (x + 1 < w) gray[i + 1] += err * 7 / 16; if (y + 1 < h) { if (x > 0) gray[i + w - 1] += err * 3 / 16; gray[i + w] += err * 5 / 16; if (x + 1 < w) gray[i + w + 1] += err / 16 } }
    if (v) d[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7)
  }
  return { data: d, rowBytes, spp: 1, bps: 1 }
}

export function encodeTiff(pages: TiffPage[], o: TiffOpts): Uint8Array {
  const strips: { bytes: Uint8Array; s: ReturnType<typeof samples>; p: TiffPage }[] = pages.map((p) => {
    const s = samples(p, o)
    let bytes: Uint8Array
    if (o.compression === 'lzw') bytes = lzwEncode(s.data)
    else if (o.compression === 'deflate') bytes = zlibSync(s.data, { level: 6 })
    else if (o.compression === 'packbits') { const out: number[] = []; for (let y = 0; y < p.height; y++) { const r = packBits(s.data.subarray(y * s.rowBytes, (y + 1) * s.rowBytes)); for (const b of r) out.push(b) } bytes = new Uint8Array(out) }
    else bytes = s.data
    return { bytes, s, p }
  })
  const COMP = { none: 1, lzw: 5, deflate: 8, packbits: 32773 }[o.compression]
  // layout: header, then for each page: [IFD][extra: bps array, xres, yres][strip]
  const chunks: Uint8Array[] = []
  let offset = 8
  const header = new Uint8Array(8); const hv = new DataView(header.buffer)
  header[0] = 0x49; header[1] = 0x49; hv.setUint16(2, 42, true); hv.setUint32(4, 8, true)
  chunks.push(header)
  strips.forEach((st, idx) => {
    const tags: [number, number, number, number | number[]][] = [] // tag, type, count, value(s)
    const { s, p } = st
    const nTags = 13 + (s.spp === 3 ? 0 : 0)
    const ifdSize = 2 + nTags * 12 + 4
    const extraStart = offset + ifdSize
    const bpsOff = extraStart, xresOff = bpsOff + 8, yresOff = xresOff + 8
    const stripOff = yresOff + 8
    const photometric = o.color === 'rgb' ? 2 : 1
    tags.push([254, 4, 1, 0], [256, 4, 1, p.width], [257, 4, 1, p.height])
    tags.push([258, 3, s.spp, s.spp === 3 ? bpsOff : s.bps])
    tags.push([259, 3, 1, COMP], [262, 3, 1, photometric], [273, 4, 1, stripOff], [277, 3, 1, s.spp], [278, 4, 1, p.height], [279, 4, 1, st.bytes.length])
    tags.push([282, 5, 1, xresOff], [283, 5, 1, yresOff], [296, 3, 1, 2])
    tags.sort((a, b) => a[0] - b[0])
    const ifd = new Uint8Array(ifdSize + 24); const dv = new DataView(ifd.buffer)
    dv.setUint16(0, tags.length, true)
    tags.forEach(([tag, type, count, val], i) => {
      const o2 = 2 + i * 12
      dv.setUint16(o2, tag, true); dv.setUint16(o2 + 2, type, true); dv.setUint32(o2 + 4, count, true)
      if (type === 3 && count === 1) dv.setUint16(o2 + 8, val as number, true); else dv.setUint32(o2 + 8, val as number, true)
    })
    const nextIfd = idx < strips.length - 1 ? stripOff + st.bytes.length + ((stripOff + st.bytes.length) & 1) : 0
    dv.setUint32(2 + tags.length * 12, nextIfd, true)
    // extra values
    const e = ifdSize
    if (s.spp === 3) { dv.setUint16(e, 8, true); dv.setUint16(e + 2, 8, true); dv.setUint16(e + 4, 8, true) }
    dv.setUint32(e + 8, o.dpi, true); dv.setUint32(e + 12, 1, true); dv.setUint32(e + 16, o.dpi, true); dv.setUint32(e + 20, 1, true)
    chunks.push(ifd, st.bytes)
    offset = stripOff + st.bytes.length
    if (offset & 1 && idx < strips.length - 1) { chunks.push(new Uint8Array(1)); offset++ }
  })
  const total = chunks.reduce((a, c) => a + c.length, 0)
  const out = new Uint8Array(total); let k = 0
  for (const c of chunks) { out.set(c, k); k += c.length }
  return out
}
