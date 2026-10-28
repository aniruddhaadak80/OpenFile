/* Shared image codecs for OpenFile (Batch 2 owns this module).
   Decoding: browser-native first, then WASM/JS fallbacks (TIFF, JPEG XL, QOI, AVIF, HEIC, ICO/CUR, PSD, Netpbm, TGA).
   Encoding: MozJPEG, libwebp, libavif, libjxl, QOI, OxiPNG, TIFF, BMP, GIF, ICO.
   Every heavy library is loaded with dynamic import() the first time it is needed. */

export type RGBA = { data: Uint8ClampedArray; width: number; height: number }

export const extOf = (name: string) => (name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '')

/* ------------------------------------------------------------------ */
/* canvas <-> ImageData                                                 */
/* ------------------------------------------------------------------ */

export function rgbaToCanvas(img: RGBA): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = img.width; c.height = img.height
  const ctx = c.getContext('2d')!
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data.buffer as ArrayBuffer, img.data.byteOffset, img.width * img.height * 4), img.width, img.height), 0, 0)
  return c
}
export function canvasToRGBA(c: HTMLCanvasElement): ImageData {
  return c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
}
export function drawableToCanvas(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, w); c.height = Math.max(1, h)
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height)
  return c
}

/* ------------------------------------------------------------------ */
/* sniffing                                                             */
/* ------------------------------------------------------------------ */

export function sniff(b: Uint8Array, name = ''): string {
  const s = (o: number, str: string) => [...str].every((ch, i) => b[o + i] === ch.charCodeAt(0))
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpg'
  if (s(0, '\x89PNG')) return 'png'
  if (s(0, 'GIF8')) return 'gif'
  if (s(0, 'RIFF') && s(8, 'WEBP')) return 'webp'
  if (s(0, 'BM')) return 'bmp'
  if ((s(0, 'II*\0') || s(0, 'MM\0*'))) return 'tiff'
  if (s(0, 'qoif')) return 'qoi'
  if (s(0, '8BPS')) return 'psd'
  if (s(0, 'icns')) return 'icns'
  if ((b[0] === 0xff && b[1] === 0x0a) || s(4, 'JXL ')) return 'jxl'
  if (s(4, 'ftyp')) {
    const brand = String.fromCharCode(...b.slice(8, 12))
    if (/avi[fs]/.test(brand)) return 'avif'
    if (/hei[cfsx]|mif1|msf1|hevc/.test(brand)) return name.toLowerCase().endsWith('.avif') ? 'avif' : 'heic'
  }
  if (b[0] === 0 && b[1] === 0 && (b[2] === 1 || b[2] === 2) && b[3] === 0) return b[2] === 2 ? 'cur' : 'ico'
  if (b[0] === 0x50 && b[1] >= 0x31 && b[1] <= 0x37) return 'pnm'
  if (s(0, '#?RADIANCE') || s(0, '#?RGBE')) return 'hdr'
  if (b[0] === 0x76 && b[1] === 0x2f && b[2] === 0x31 && b[3] === 0x01) return 'exr'
  if (s(0, '<?xml') || s(0, '<svg')) return 'svg'
  return extOf(name)
}

/* ------------------------------------------------------------------ */
/* decoders                                                             */
/* ------------------------------------------------------------------ */

async function nativeDecode(blob: Blob): Promise<HTMLCanvasElement> {
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions)
      const c = drawableToCanvas(bmp, bmp.width, bmp.height); bmp.close(); return c
    } catch { /* fall through to <img> */ }
  }
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => { const c = drawableToCanvas(img, img.naturalWidth, img.naturalHeight); URL.revokeObjectURL(url); res(c) }
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('The browser could not decode this image.')) }
    img.src = url
  })
}

export async function decodeTIFF(buf: ArrayBuffer, page = 0): Promise<{ pages: number; image: RGBA }> {
  const UTIF: any = (await import('utif')).default ?? (await import('utif'))
  const ifds = UTIF.decode(buf)
  const imgs = ifds.filter((i: any) => i.t256 && i.t257)
  if (!imgs.length) throw new Error('No images found in this TIFF file.')
  const ifd = imgs[Math.min(page, imgs.length - 1)]
  UTIF.decodeImage(buf, ifd, ifds)
  const rgba = UTIF.toRGBA8(ifd)
  return { pages: imgs.length, image: { data: new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length), width: ifd.width, height: ifd.height } }
}

export async function decodeJXL(buf: ArrayBuffer): Promise<RGBA> {
  const m = await import('@jsquash/jxl/decode')
  return m.default(buf)
}
export async function decodeQOI(buf: ArrayBuffer): Promise<RGBA> {
  const m = await import('@jsquash/qoi/decode')
  return m.default(buf)
}
export async function decodeAVIFWasm(buf: ArrayBuffer): Promise<RGBA> {
  const m = await import('@jsquash/avif/decode')
  const r = await m.default(buf)
  if (!r) throw new Error('Could not decode this AVIF file.')
  return r as RGBA
}

export async function decodeHEIC(blob: Blob): Promise<HTMLCanvasElement> {
  const heic2any: any = (await import('heic2any')).default
  const out = await heic2any({ blob, toType: 'image/png' })
  return nativeDecode(Array.isArray(out) ? out[0] : out)
}

/** Netpbm: P1-P6 and P7 (PAM). */
export function decodePNM(u8: Uint8Array): RGBA {
  let pos = 0
  const magic = String.fromCharCode(u8[0], u8[1]); pos = 2
  const isWS = (c: number) => c === 32 || c === 9 || c === 10 || c === 13
  if (magic === 'P7') {
    const headerEnd = findSeq(u8, 'ENDHDR')
    const head = new TextDecoder().decode(u8.slice(0, headerEnd))
    const get = (k: string) => Number(head.match(new RegExp(k + '\\s+(\\d+)'))?.[1] ?? 0)
    const w = get('WIDTH'), h = get('HEIGHT'), depth = get('DEPTH'), max = get('MAXVAL') || 255
    let p = headerEnd + 6; while (isWS(u8[p])) p++
    const out = new Uint8ClampedArray(w * h * 4); const bpp = max > 255 ? 2 : 1
    for (let i = 0; i < w * h; i++) {
      const px: number[] = []
      for (let c = 0; c < depth; c++) { const v = bpp === 2 ? (u8[p] << 8) | u8[p + 1] : u8[p]; p += bpp; px.push((v * 255) / max) }
      const [r, g = r, b = r, a = 255] = depth === 2 ? [px[0], px[0], px[0], px[1]] : px
      out.set([r, g, b, depth === 4 || depth === 2 ? a : 255], i * 4)
    }
    return { data: out, width: w, height: h }
  }
  const tok = () => {
    while (pos < u8.length) {
      if (u8[pos] === 35) { while (pos < u8.length && u8[pos] !== 10) pos++ } else if (isWS(u8[pos])) pos++
      else break
    }
    let s = ''; while (pos < u8.length && !isWS(u8[pos]) && u8[pos] !== 35) s += String.fromCharCode(u8[pos++])
    return s
  }
  const w = Number(tok()), h = Number(tok())
  const bitmap = magic === 'P1' || magic === 'P4'
  const max = bitmap ? 1 : Number(tok())
  if (!w || !h) throw new Error('This Netpbm file has an invalid header.')
  const out = new Uint8ClampedArray(w * h * 4)
  const ascii = magic === 'P1' || magic === 'P2' || magic === 'P3'
  const ch = magic === 'P3' || magic === 'P6' ? 3 : 1
  if (ascii) {
    for (let i = 0; i < w * h; i++) {
      const vals: number[] = []
      for (let c = 0; c < ch; c++) {
        if (magic === 'P1') { while (isWS(u8[pos]) || u8[pos] === 35) { if (u8[pos] === 35) while (u8[pos] !== 10) pos++; pos++ } vals.push(u8[pos++] === 49 ? 0 : 255) }
        else vals.push((Number(tok()) * 255) / max)
      }
      const [r, g = r, b = r] = vals; out.set([r, g, b, 255], i * 4)
    }
  } else {
    pos++ // single whitespace after header
    if (magic === 'P4') {
      const row = Math.ceil(w / 8)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const bit = (u8[pos + y * row + (x >> 3)] >> (7 - (x & 7))) & 1; const v = bit ? 0 : 255; out.set([v, v, v, 255], (y * w + x) * 4) }
    } else {
      const bpp = max > 255 ? 2 : 1
      for (let i = 0; i < w * h; i++) {
        const vals: number[] = []
        for (let c = 0; c < ch; c++) { const v = bpp === 2 ? (u8[pos] << 8) | u8[pos + 1] : u8[pos]; pos += bpp; vals.push((v * 255) / max) }
        const [r, g = r, b = r] = vals; out.set([r, g, b, 255], i * 4)
      }
    }
  }
  return { data: out, width: w, height: h }
}
function findSeq(u8: Uint8Array, str: string) {
  const codes = [...str].map((c) => c.charCodeAt(0))
  outer: for (let i = 0; i < u8.length - codes.length; i++) { for (let j = 0; j < codes.length; j++) if (u8[i + j] !== codes[j]) continue outer; return i }
  return -1
}

/** Truevision TGA (uncompressed and RLE, 8/16/24/32-bit, colour-mapped and grey). */
export function decodeTGA(u8: Uint8Array): RGBA {
  const idLen = u8[0], cmapType = u8[1], type = u8[2]
  const cmapLen = u8[5] | (u8[6] << 8), cmapDepth = u8[7]
  const w = u8[12] | (u8[13] << 8), h = u8[14] | (u8[15] << 8), bpp = u8[16], desc = u8[17]
  if (![1, 2, 3, 9, 10, 11].includes(type) || !w || !h) throw new Error('Unsupported or invalid TGA file.')
  let p = 18 + idLen
  const cmap: number[][] = []
  if (cmapType) { const cb = Math.ceil(cmapDepth / 8); for (let i = 0; i < cmapLen; i++) { cmap.push(readPx(u8, p, cmapDepth)); p += cb } }
  const Bpp = Math.ceil(bpp / 8)
  const px = new Uint8ClampedArray(w * h * 4)
  const put = (i: number, at: number) => {
    let c: number[]
    if (type === 1 || type === 9) c = cmap[u8[at] | (Bpp > 1 ? u8[at + 1] << 8 : 0)] ?? [0, 0, 0, 255]
    else if (type === 3 || type === 11) c = [u8[at], u8[at], u8[at], Bpp > 1 ? u8[at + 1] : 255]
    else c = readPx(u8, at, bpp)
    px.set(c, i * 4)
  }
  const n = w * h
  if (type < 9) { for (let i = 0; i < n; i++) { put(i, p); p += Bpp } }
  else {
    let i = 0
    while (i < n && p < u8.length) {
      const hdr = u8[p++], count = (hdr & 0x7f) + 1
      if (hdr & 0x80) { for (let k = 0; k < count && i < n; k++) put(i++, p); p += Bpp }
      else { for (let k = 0; k < count && i < n; k++) { put(i++, p); p += Bpp } }
    }
  }
  const out = new Uint8ClampedArray(n * 4)
  const topDown = !!(desc & 0x20), rightLeft = !!(desc & 0x10)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sy = topDown ? y : h - 1 - y, sx = rightLeft ? w - 1 - x : x
    out.set(px.subarray((sy * w + sx) * 4, (sy * w + sx) * 4 + 4), (y * w + x) * 4)
  }
  const alphaBits = desc & 0x0f
  if (bpp === 32 && alphaBits === 0) { let allZero = true; for (let i = 3; i < out.length; i += 4) if (out[i]) { allZero = false; break } if (allZero) for (let i = 3; i < out.length; i += 4) out[i] = 255 }
  return { data: out, width: w, height: h }
}
function readPx(u8: Uint8Array, at: number, bits: number): number[] {
  if (bits === 8) return [u8[at], u8[at], u8[at], 255]
  if (bits === 15 || bits === 16) { const v = u8[at] | (u8[at + 1] << 8); return [((v >> 10) & 31) * 255 / 31, ((v >> 5) & 31) * 255 / 31, (v & 31) * 255 / 31, 255] }
  if (bits === 24) return [u8[at + 2], u8[at + 1], u8[at], 255]
  return [u8[at + 2], u8[at + 1], u8[at], u8[at + 3]]
}

/** Windows ICO / CUR: returns every entry (PNG or BMP/DIB payloads). */
export type IcoEntry = { width: number; height: number; bpp: number; hotspot?: [number, number]; png: boolean; image: RGBA }
export async function decodeICO(u8: Uint8Array): Promise<IcoEntry[]> {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  const type = v.getUint16(2, true), count = v.getUint16(4, true)
  const out: IcoEntry[] = []
  for (let i = 0; i < count; i++) {
    const e = 6 + i * 16
    const size = v.getUint32(e + 8, true), off = v.getUint32(e + 12, true)
    const data = u8.subarray(off, off + size)
    const hot: [number, number] | undefined = type === 2 ? [v.getUint16(e + 4, true), v.getUint16(e + 6, true)] : undefined
    if (data[0] === 0x89 && data[1] === 0x50) {
      const c = await nativeDecode(new Blob([data as BlobPart], { type: 'image/png' }))
      const id = canvasToRGBA(c)
      out.push({ width: c.width, height: c.height, bpp: 32, hotspot: hot, png: true, image: { data: id.data, width: c.width, height: c.height } })
    } else {
      const img = decodeDIB(data)
      out.push({ width: img.width, height: img.height, bpp: img.bpp, hotspot: hot, png: false, image: img })
    }
  }
  return out
}
/** BMP DIB inside ICO: height is doubled (XOR + AND masks). */
export function decodeDIB(d: Uint8Array): RGBA & { bpp: number } {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const hs = v.getUint32(0, true), w = v.getInt32(4, true), h2 = v.getInt32(8, true), bpp = v.getUint16(14, true)
  const h = Math.abs(h2) / 2
  let ncol = v.getUint32(32, true); if (!ncol && bpp <= 8) ncol = 1 << bpp
  const palOff = hs, pal: number[][] = []
  for (let i = 0; i < ncol; i++) pal.push([d[palOff + i * 4 + 2], d[palOff + i * 4 + 1], d[palOff + i * 4], 255])
  let p = palOff + ncol * 4
  const stride = Math.ceil((w * bpp) / 32) * 4
  const out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    const row = p + (h - 1 - y) * stride
    for (let x = 0; x < w; x++) {
      let c: number[]
      if (bpp === 32) c = [d[row + x * 4 + 2], d[row + x * 4 + 1], d[row + x * 4], d[row + x * 4 + 3]]
      else if (bpp === 24) c = [d[row + x * 3 + 2], d[row + x * 3 + 1], d[row + x * 3], 255]
      else { const per = 8 / bpp, byte = d[row + Math.floor(x / per)], shift = (per - 1 - (x % per)) * bpp; c = pal[(byte >> shift) & ((1 << bpp) - 1)] ?? [0, 0, 0, 255] }
      out.set(c, (y * w + x) * 4)
    }
  }
  // AND mask (1 = transparent) for non-32-bit entries, or 32-bit with zero alpha everywhere
  const maskOff = p + stride * h, mstride = Math.ceil(w / 32) * 4
  let alphaUsed = false
  if (bpp === 32) for (let i = 3; i < out.length; i += 4) if (out[i]) { alphaUsed = true; break }
  if (!alphaUsed && maskOff + mstride * h <= d.length) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const bit = (d[maskOff + (h - 1 - y) * mstride + (x >> 3)] >> (7 - (x & 7))) & 1
      out[(y * w + x) * 4 + 3] = bit ? 0 : 255
    }
  }
  return { data: out, width: w, height: h, bpp }
}

/** Apple ICNS: decodes PNG/JPEG 2000-free entries (PNG payloads, which modern icns files use). */
export async function decodeICNS(u8: Uint8Array): Promise<{ type: string; image: RGBA }[]> {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  const total = v.getUint32(4)
  const out: { type: string; image: RGBA }[] = []
  let p = 8
  while (p + 8 <= Math.min(total, u8.length)) {
    const type = String.fromCharCode(...u8.subarray(p, p + 4)), len = v.getUint32(p + 4)
    if (len < 8) break
    const data = u8.subarray(p + 8, p + len)
    if (data[0] === 0x89 && data[1] === 0x50) {
      try { const c = await nativeDecode(new Blob([data as BlobPart], { type: 'image/png' })); const id = canvasToRGBA(c); out.push({ type, image: { data: id.data, width: c.width, height: c.height } }) } catch { /* skip */ }
    }
    p += len
  }
  if (!out.length) throw new Error('No PNG icons were found inside this ICNS file. Very old ICNS files use a legacy format that is not supported.')
  return out.sort((a, b) => b.image.width - a.image.width)
}

export async function decodePSD(buf: ArrayBuffer): Promise<HTMLCanvasElement> {
  const { readPsd } = await import('ag-psd')
  const psd = readPsd(buf, { skipLayerImageData: true, skipThumbnail: true, useImageData: false })
  if (!psd.canvas) throw new Error('This PSD has no saved composite image. Re-save it with "Maximize compatibility" turned on.')
  return psd.canvas as HTMLCanvasElement
}

export type Decoded = { canvas: HTMLCanvasElement; format: string; pages?: number }

/** Decode almost any still image into a canvas. */
export async function decodeAny(file: Blob & { name?: string }, opts: { page?: number } = {}): Promise<Decoded> {
  const name = file.name ?? ''
  const buf = await file.arrayBuffer()
  const u8 = new Uint8Array(buf)
  const fmt = sniff(u8, name)
  switch (fmt) {
    case 'tiff': case 'tif': { const r = await decodeTIFF(buf, opts.page); return { canvas: rgbaToCanvas(r.image), format: 'tiff', pages: r.pages } }
    case 'jxl': return { canvas: rgbaToCanvas(await decodeJXL(buf)), format: 'jxl' }
    case 'qoi': return { canvas: rgbaToCanvas(await decodeQOI(buf)), format: 'qoi' }
    case 'heic': case 'heif': return { canvas: await decodeHEIC(file), format: 'heic' }
    case 'psd': case 'psb': return { canvas: await decodePSD(buf), format: 'psd' }
    case 'pnm': case 'ppm': case 'pgm': case 'pbm': case 'pam': return { canvas: rgbaToCanvas(decodePNM(u8)), format: 'pnm' }
    case 'tga': return { canvas: rgbaToCanvas(decodeTGA(u8)), format: 'tga' }
    case 'icns': { const r = await decodeICNS(u8); return { canvas: rgbaToCanvas(r[0].image), format: 'icns' } }
    case 'ico': case 'cur': {
      const es = await decodeICO(u8); const best = es.sort((a, b) => b.width * b.height - a.width * a.height)[0]
      if (!best) throw new Error('This icon file is empty.')
      return { canvas: rgbaToCanvas(best.image), format: fmt }
    }
    case 'avif':
      try { return { canvas: await nativeDecode(file), format: 'avif' } } catch { return { canvas: rgbaToCanvas(await decodeAVIFWasm(buf)), format: 'avif' } }
    case 'svg': case 'svgz': {
      let text: string
      if (u8[0] === 0x1f && u8[1] === 0x8b) { const { gunzipSync, strFromU8 } = await import('fflate'); text = strFromU8(gunzipSync(u8)) } else text = new TextDecoder().decode(u8)
      return { canvas: await nativeDecode(new Blob([text], { type: 'image/svg+xml' })), format: 'svg' }
    }
    default:
      try { return { canvas: await nativeDecode(new Blob([buf], { type: (file as Blob).type || 'image/' + fmt })), format: fmt || 'image' } }
      catch { throw new Error(`Could not read ${name || 'this file'}. The format${fmt ? ` (${fmt.toUpperCase()})` : ''} is not supported by this decoder.`) }
  }
}

/* ------------------------------------------------------------------ */
/* encoders                                                             */
/* ------------------------------------------------------------------ */

export type OutFmt = 'jpg' | 'png' | 'webp' | 'avif' | 'jxl' | 'qoi' | 'tiff' | 'bmp' | 'gif' | 'ico'
export const OUT_MIME: Record<OutFmt, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', jxl: 'image/jxl', qoi: 'image/qoi', tiff: 'image/tiff', bmp: 'image/bmp', gif: 'image/gif', ico: 'image/x-icon' }

export type EncodeOpts = { quality?: number /* 0..100 */; lossless?: boolean; effort?: number /* 0..9 */; bg?: string; progressive?: boolean; oxipngLevel?: number }

function flattenTo(c: HTMLCanvasElement, bg: string) {
  const o = document.createElement('canvas'); o.width = c.width; o.height = c.height
  const ctx = o.getContext('2d')!; ctx.fillStyle = bg; ctx.fillRect(0, 0, o.width, o.height); ctx.drawImage(c, 0, 0)
  return o
}

export async function encodeJPEG(id: ImageData, quality = 80, progressive = true): Promise<Uint8Array> {
  const m = await import('@jsquash/jpeg/encode')
  return new Uint8Array(await m.default(id, { quality, progressive, optimize_coding: true } as any))
}
export async function encodeWEBP(id: ImageData, quality = 80, lossless = false, effort = 4): Promise<Uint8Array> {
  const m = await import('@jsquash/webp/encode')
  return new Uint8Array(await m.default(id, { quality, lossless: lossless ? 1 : 0, method: Math.max(0, Math.min(6, effort)) } as any))
}
export async function encodeAVIF(id: ImageData, quality = 60, lossless = false, effort = 4): Promise<Uint8Array> {
  const m = await import('@jsquash/avif/encode')
  return new Uint8Array(await m.default(id, { quality, lossless, speed: Math.max(0, Math.min(10, 10 - effort)) } as any))
}
export async function encodeJXL(id: ImageData, quality = 80, lossless = false, effort = 7): Promise<Uint8Array> {
  const m = await import('@jsquash/jxl/encode')
  return new Uint8Array(await m.default(id, { quality, lossless, effort: Math.max(1, Math.min(9, effort)) } as any))
}
export async function encodeQOI(id: ImageData): Promise<Uint8Array> {
  const m = await import('@jsquash/qoi/encode')
  return new Uint8Array(await m.default(id))
}
/** Lossless PNG optimisation with OxiPNG (level 1..6). */
export async function optimisePNG(png: ArrayBuffer, level = 2): Promise<Uint8Array> {
  const m = await import('@jsquash/oxipng/optimise')
  return new Uint8Array(await m.default(png, { level, interlace: false, optimiseAlpha: true } as any))
}
export async function encodeTIFF(id: ImageData): Promise<Uint8Array> {
  const mod: any = await import('utif'); const UTIF = mod.default ?? mod
  return new Uint8Array(UTIF.encodeImage(new Uint8Array(id.data.buffer, id.data.byteOffset, id.data.length), id.width, id.height))
}

/** Encode a canvas to any supported output format. */
export async function encodeCanvas(c: HTMLCanvasElement, fmt: OutFmt, o: EncodeOpts = {}): Promise<Blob> {
  const q = o.quality ?? 82, bg = o.bg ?? '#ffffff'
  const mk = (d: Uint8Array | ArrayBuffer) => new Blob([d as BlobPart], { type: OUT_MIME[fmt] })
  switch (fmt) {
    case 'jpg': return mk(await encodeJPEG(canvasToRGBA(flattenTo(c, bg)), q, o.progressive ?? true))
    case 'webp': return mk(await encodeWEBP(canvasToRGBA(c), q, o.lossless, o.effort ?? 4))
    case 'avif': return mk(await encodeAVIF(canvasToRGBA(c), q, o.lossless, o.effort ?? 4))
    case 'jxl': return mk(await encodeJXL(canvasToRGBA(c), q, o.lossless, o.effort ?? 7))
    case 'qoi': return mk(await encodeQOI(canvasToRGBA(c)))
    case 'tiff': return mk(await encodeTIFF(canvasToRGBA(c)))
    case 'png': {
      const raw = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG export failed'))), 'image/png'))
      if (!o.oxipngLevel) return raw
      try { return mk(await optimisePNG(await raw.arrayBuffer(), o.oxipngLevel)) } catch { return raw }
    }
    case 'bmp': case 'gif': case 'ico': {
      const kit = await import('@/tools/image/_img/kit')
      return kit.exportCanvas(c, fmt, q / 100, bg)
    }
  }
}

/** Reduce a canvas to `colors` (2..256) using median cut plus optional Floyd-Steinberg dithering. Returns a new canvas. */
export async function quantize(c: HTMLCanvasElement, colors: number, dither = true): Promise<HTMLCanvasElement> {
  const { buildPalette, applyPalette } = await import('./palette')
  const id = canvasToRGBA(c)
  const pal = buildPalette(id.data, colors)
  const out = applyPalette(id.data, id.width, id.height, pal, dither ? 'floyd' : 'none')
  const o = document.createElement('canvas'); o.width = c.width; o.height = c.height
  o.getContext('2d')!.putImageData(new ImageData(out as Uint8ClampedArray<ArrayBuffer>, id.width, id.height), 0, 0)
  return o
}
