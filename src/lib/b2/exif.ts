/* EXIF writing helpers on top of piexifjs (MIT). JPEG uses APP1; PNG uses an eXIf chunk; WebP uses a RIFF EXIF chunk. */

export const toBin = (u8: Uint8Array) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + 0x8000))); return s }
export const fromBin = (s: string) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u }

export type ExifFields = {
  artist: string; copyright: string; description: string; make: string; model: string; software: string
  dateTaken: string /* YYYY-MM-DDTHH:mm */; orientation: number
  gps: { lat: number; lng: number; alt?: number } | null
  keepOther: boolean
}

let _p: any = null
export async function piexif() { if (!_p) { const m: any = await import('piexifjs'); _p = m.default ?? m } return _p }

const toExifDate = (iso: string) => iso ? iso.replace('T', ' ').replace(/-/g, ':').slice(0, 19).padEnd(19, ':00').slice(0, 19) : ''
export const fromExifDate = (s?: string) => s ? s.replace(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}).*$/, '$1-$2-$3T$4:$5') : ''

/** Build the raw EXIF segment ("Exif\0\0" + TIFF) from fields, optionally merging with an existing exif object. */
export async function buildExif(f: ExifFields, existing?: any): Promise<string> {
  const P = await piexif()
  const base = f.keepOther && existing ? existing : { '0th': {}, Exif: {}, GPS: {}, '1st': {}, thumbnail: null }
  const z = base['0th'], e = base.Exif
  const setOr = (obj: any, tag: number, v: string) => { if (v) obj[tag] = v; else delete obj[tag] }
  setOr(z, P.ImageIFD.Artist, f.artist); setOr(z, P.ImageIFD.Copyright, f.copyright); setOr(z, P.ImageIFD.ImageDescription, f.description)
  setOr(z, P.ImageIFD.Make, f.make); setOr(z, P.ImageIFD.Model, f.model); setOr(z, P.ImageIFD.Software, f.software)
  if (f.orientation) z[P.ImageIFD.Orientation] = f.orientation
  const d = toExifDate(f.dateTaken)
  if (d) { e[P.ExifIFD.DateTimeOriginal] = d; e[P.ExifIFD.DateTimeDigitized] = d; z[P.ImageIFD.DateTime] = d } else { delete e[P.ExifIFD.DateTimeOriginal]; delete e[P.ExifIFD.DateTimeDigitized] }
  if (f.gps) {
    const g: any = {}
    g[P.GPSIFD.GPSVersionID] = [2, 3, 0, 0]
    g[P.GPSIFD.GPSLatitudeRef] = f.gps.lat >= 0 ? 'N' : 'S'; g[P.GPSIFD.GPSLatitude] = P.GPSHelper.degToDmsRational(Math.abs(f.gps.lat))
    g[P.GPSIFD.GPSLongitudeRef] = f.gps.lng >= 0 ? 'E' : 'W'; g[P.GPSIFD.GPSLongitude] = P.GPSHelper.degToDmsRational(Math.abs(f.gps.lng))
    if (f.gps.alt !== undefined && Number.isFinite(f.gps.alt)) { g[P.GPSIFD.GPSAltitudeRef] = f.gps.alt < 0 ? 1 : 0; g[P.GPSIFD.GPSAltitude] = [Math.round(Math.abs(f.gps.alt) * 100), 100] }
    base.GPS = g
  } else base.GPS = {}
  // thumbnails often break after edits; drop them
  base['1st'] = {}; base.thumbnail = null
  return P.dump(base)
}

export async function readExifObject(u8: Uint8Array, kind: string): Promise<any | null> {
  const P = await piexif()
  try {
    if (kind === 'jpg') return P.load(toBin(u8))
    const raw = kind === 'png' ? pngExif(u8) : kind === 'webp' ? webpExif(u8) : null
    if (!raw) return null
    return P.load('Exif\x00\x00' + toBin(raw))
  } catch { return null }
}

/* ---------- containers ---------- */

const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
export function crc32(u8: Uint8Array) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

function pngChunks(u8: Uint8Array) {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); const out: { type: string; start: number; end: number; data: Uint8Array }[] = []
  let p = 8
  while (p + 8 <= u8.length) { const len = v.getUint32(p); const type = String.fromCharCode(...u8.subarray(p + 4, p + 8)); out.push({ type, start: p, end: p + 12 + len, data: u8.subarray(p + 8, p + 8 + len) }); p += 12 + len; if (type === 'IEND') break }
  return out
}
function pngExif(u8: Uint8Array) { const c = pngChunks(u8).find((x) => x.type === 'eXIf'); return c ? c.data : null }

/** Replace or remove the eXIf chunk. `tiff` is the TIFF part (without "Exif\0\0"). */
export function pngWithExif(u8: Uint8Array, tiff: Uint8Array | null): Uint8Array {
  const chunks = pngChunks(u8).filter((c) => c.type !== 'eXIf')
  const parts: Uint8Array[] = [u8.subarray(0, 8)]
  let done = false
  for (const c of chunks) {
    if (c.type === 'IDAT' && tiff && !done) {
      const body = new Uint8Array(4 + tiff.length); body.set([0x65, 0x58, 0x49, 0x66]); body.set(tiff, 4)
      const chunk = new Uint8Array(12 + tiff.length), v = new DataView(chunk.buffer)
      v.setUint32(0, tiff.length); chunk.set(body, 4); v.setUint32(8 + tiff.length, crc32(body))
      parts.push(chunk); done = true
    }
    parts.push(u8.subarray(c.start, c.end))
  }
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length } return out
}

function webpChunks(u8: Uint8Array) {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); const out: { id: string; data: Uint8Array }[] = []
  let p = 12
  while (p + 8 <= u8.length) { const id = String.fromCharCode(...u8.subarray(p, p + 4)); const len = v.getUint32(p + 4, true); out.push({ id, data: u8.subarray(p + 8, p + 8 + len) }); p += 8 + len + (len & 1) }
  return out
}
function webpExif(u8: Uint8Array) { const c = webpChunks(u8).find((x) => x.id === 'EXIF'); if (!c) return null; const d = c.data; return d[0] === 0x45 && d[1] === 0x78 ? d.subarray(6) : d }

/** Insert or replace the EXIF chunk in a WebP (adds a VP8X header when needed). */
export function webpWithExif(u8: Uint8Array, tiff: Uint8Array | null): Uint8Array {
  let chunks = webpChunks(u8).filter((c) => c.id !== 'EXIF')
  const vp8x = chunks.find((c) => c.id === 'VP8X')
  if (!vp8x && tiff) {
    // derive canvas size from the VP8 / VP8L header
    const img = chunks.find((c) => c.id === 'VP8 ' || c.id === 'VP8L')
    if (!img) throw new Error('Unsupported WebP layout.')
    let w = 0, h = 0, alpha = false
    const d = img.data
    if (img.id === 'VP8 ') { w = (d[6] | (d[7] << 8)) & 0x3fff; h = (d[8] | (d[9] << 8)) & 0x3fff }
    else { const b = d[1] | (d[2] << 8) | (d[3] << 16) | (d[4] << 24); w = (b & 0x3fff) + 1; h = ((b >> 14) & 0x3fff) + 1; alpha = !!((b >> 28) & 1) }
    const x = new Uint8Array(10); x[0] = alpha ? 0x10 : 0
    const W = w - 1, H = h - 1; x[4] = W & 255; x[5] = (W >> 8) & 255; x[6] = (W >> 16) & 255; x[7] = H & 255; x[8] = (H >> 8) & 255; x[9] = (H >> 16) & 255
    chunks = [{ id: 'VP8X', data: x }, ...chunks]
  }
  const head = chunks.find((c) => c.id === 'VP8X')
  if (head) { const flags = new Uint8Array(head.data); flags[0] = tiff ? flags[0] | 0x08 : flags[0] & ~0x08; head.data = flags }
  if (tiff) chunks.push({ id: 'EXIF', data: tiff })
  const size = 4 + chunks.reduce((a, c) => a + 8 + c.data.length + (c.data.length & 1), 0)
  const out = new Uint8Array(8 + size), v = new DataView(out.buffer)
  out.set([0x52, 0x49, 0x46, 0x46]); v.setUint32(4, size, true); out.set([0x57, 0x45, 0x42, 0x50], 8)
  let p = 12
  for (const c of chunks) { for (let i = 0; i < 4; i++) out[p + i] = c.id.charCodeAt(i); v.setUint32(p + 4, c.data.length, true); out.set(c.data, p + 8); p += 8 + c.data.length + (c.data.length & 1) }
  return out
}

/** Write EXIF into a JPEG, PNG or WebP. exif = piexif.dump() output (binary string starting with "Exif\0\0"), or null to remove. */
export async function writeExif(u8: Uint8Array, kind: string, exif: string | null): Promise<Uint8Array> {
  const P = await piexif()
  if (kind === 'jpg') { let s = toBin(u8); try { s = P.remove(s) } catch { /* no exif */ } return fromBin(exif ? P.insert(exif, s) : s) }
  const tiff = exif ? fromBin(exif.slice(6)) : null
  if (kind === 'png') return pngWithExif(u8, tiff)
  if (kind === 'webp') return webpWithExif(u8, tiff)
  throw new Error('Writing metadata is supported for JPEG, PNG and WebP.')
}
