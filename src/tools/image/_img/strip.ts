/* Lossless metadata stripping for JPEG, PNG and WEBP (no re-encode). Pure functions — testable in node. */

/** Returns EXIF orientation (1..8) for a JPEG, or 1 when absent. */
export function jpegOrientation(b: Uint8Array): number {
  if (b[0] !== 0xff || b[1] !== 0xd8) return 1
  let i = 2
  while (i + 4 < b.length) {
    if (b[i] !== 0xff) return 1
    const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3]
    if (m === 0xda) return 1
    if (m === 0xe1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) {
      const t = i + 10, le = b[t] === 0x49
      const u16 = (o: number) => (le ? b[t + o] | (b[t + o + 1] << 8) : (b[t + o] << 8) | b[t + o + 1])
      const u32 = (o: number) => (le ? (b[t + o] | (b[t + o + 1] << 8) | (b[t + o + 2] << 16)) + b[t + o + 3] * 2 ** 24 : b[t + o] * 2 ** 24 + ((b[t + o + 1] << 16) | (b[t + o + 2] << 8) | b[t + o + 3]))
      const ifd = u32(4), n = u16(ifd)
      for (let k = 0; k < n; k++) { const e = ifd + 2 + k * 12; if (u16(e) === 0x0112) return u16(e + 8) || 1 }
      return 1
    }
    i += 2 + len
  }
  return 1
}

/** Removes APP1–APP13, APP15 (EXIF, XMP, IPTC/Photoshop…) and COM segments. Keeps JFIF (APP0), ICC? no — APP2 ICC kept for colour accuracy, APP14 Adobe kept. */
export function stripJpeg(b: Uint8Array, keepIcc = true): Uint8Array {
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error('Not a JPEG')
  const parts: Uint8Array[] = [b.subarray(0, 2)]
  let i = 2
  while (i < b.length) {
    if (b[i] !== 0xff) throw new Error('Corrupt JPEG')
    const m = b[i + 1]
    if (m === 0xff) { i++; continue }
    if (m === 0xda) { parts.push(b.subarray(i)); break }
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { parts.push(b.subarray(i, i + 2)); i += 2; continue }
    const len = (b[i + 2] << 8) | b[i + 3]
    const seg = b.subarray(i, i + 2 + len)
    const isApp = m >= 0xe0 && m <= 0xef
    const isIcc = m === 0xe2 && String.fromCharCode(...b.subarray(i + 4, i + 15)) === 'ICC_PROFILE'
    const drop = m === 0xfe || (isApp && m !== 0xe0 && m !== 0xee && !(keepIcc && isIcc))
    if (!drop) parts.push(seg)
    i += 2 + len
  }
  return concat(parts)
}

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10]
const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME', 'dSIG'])
export function stripPng(b: Uint8Array): Uint8Array {
  for (let k = 0; k < 8; k++) if (b[k] !== PNG_SIG[k]) throw new Error('Not a PNG')
  const parts: Uint8Array[] = [b.subarray(0, 8)]
  let i = 8
  while (i + 8 <= b.length) {
    const len = ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3])
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7])
    const end = i + 12 + len
    if (!PNG_DROP.has(type)) parts.push(b.subarray(i, end))
    i = end
    if (type === 'IEND') break
  }
  return concat(parts)
}

export function stripWebp(b: Uint8Array): Uint8Array {
  const s = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n))
  if (s(0, 4) !== 'RIFF' || s(8, 4) !== 'WEBP') throw new Error('Not a WEBP')
  const parts: Uint8Array[] = []
  let i = 12
  while (i + 8 <= b.length) {
    const type = s(i, 4), len = b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24)
    const end = i + 8 + len + (len & 1)
    if (type === 'VP8X') { const c = b.slice(i, end); c[8] &= ~(0x08 | 0x04); parts.push(c) }
    else if (type !== 'EXIF' && type !== 'XMP ') parts.push(b.subarray(i, end))
    i = end
  }
  const body = concat(parts)
  const out = new Uint8Array(12 + body.length)
  out.set(b.subarray(0, 12)); out.set(body, 12)
  const size = out.length - 8
  out[4] = size & 255; out[5] = (size >> 8) & 255; out[6] = (size >> 16) & 255; out[7] = (size >>> 24) & 255
  return out
}

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

export type LosslessKind = 'jpg' | 'png' | 'webp' | null
export function sniff(b: Uint8Array): LosslessKind {
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpg'
  if (b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71) return 'png'
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) return 'webp'
  return null
}

/** PNG tEXt/iTXt/zTXt keywords & (uncompressed) values. */
export function pngText(b: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {}
  if (sniff(b) !== 'png') return out
  let i = 8
  const dec = new TextDecoder()
  while (i + 8 <= b.length) {
    const len = ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3])
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7])
    const data = b.subarray(i + 8, i + 8 + len)
    if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
      const z = data.indexOf(0)
      const key = dec.decode(data.subarray(0, z))
      if (type === 'tEXt') out[key] = dec.decode(data.subarray(z + 1))
      else if (type === 'iTXt') { const comp = data[z + 1]; let p = z + 3; p = data.indexOf(0, p) + 1; p = data.indexOf(0, p) + 1; out[key] = comp ? '(compressed text)' : dec.decode(data.subarray(p)) }
      else out[key] = '(compressed text)'
    }
    if (type === 'IEND') break
    i += 12 + len
  }
  return out
}

/** Raw TIFF/EXIF payload from a WEBP EXIF chunk (exifr can't read WEBP containers directly). */
export function webpExif(b: Uint8Array): Uint8Array | null {
  if (sniff(b) !== 'webp') return null
  let i = 12
  while (i + 8 <= b.length) {
    const type = String.fromCharCode(...b.subarray(i, i + 4)), len = b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24)
    if (type === 'EXIF') { let p = b.subarray(i + 8, i + 8 + len); if (p[0] === 0x45 && p[1] === 0x78) p = p.subarray(6); return p }
    i += 8 + len + (len & 1)
  }
  return null
}
