/* Security and privacy helpers: PII finder, hidden characters, entropy, checksum lists, LSB steganography,
 * and metadata stripping for JPEG, PNG, WEBP and MP3. Pure functions, unit tested. */

/* ---------- PII ---------- */
export type PiiKind = 'email' | 'phone' | 'card' | 'iban' | 'ip' | 'ssn' | 'aadhaar' | 'pan' | 'url' | 'date'
export const PII_LABEL: Record<PiiKind, string> = { email: 'Email', phone: 'Phone', card: 'Card number', iban: 'IBAN', ip: 'IP address', ssn: 'US SSN', aadhaar: 'Aadhaar', pan: 'PAN (India)', url: 'Link', date: 'Date' }
export function luhn(num: string) {
  const d = num.replace(/\D/g, ''); if (d.length < 12 || d.length > 19) return false
  let s = 0, alt = false
  for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9 } s += n; alt = !alt }
  return s % 10 === 0
}
export function ibanOk(iban: string) {
  const s = iban.replace(/\s/g, '').toUpperCase(); if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false
  const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55))
  let m = 0; for (const ch of r) m = (m * 10 + +ch) % 97
  return m === 1
}
const PII_RES: [PiiKind, RegExp, ((m: string) => boolean)?][] = [
  ['email', /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g],
  ['url', /\bhttps?:\/\/[^\s<>"')]+/g],
  ['iban', /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g, ibanOk],
  ['card', /\b(?:\d[ -]?){12,18}\d\b/g, luhn],
  ['aadhaar', /\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b/g],
  ['ssn', /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g],
  ['pan', /\b[A-Z]{5}\d{4}[A-Z]\b/g],
  ['ip', /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b|\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b/gi],
  ['date', /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{4})\b/g],
  ['phone', /(?:\+\d{1,3}[ .-]?)?(?:\(\d{1,4}\)[ .-]?)?\d{2,5}[ .-]\d{3,4}[ .-]?\d{3,4}\b|\+\d{10,13}\b/g],
]
export interface PiiHit { kind: PiiKind; start: number; end: number; text: string }
export function findPii(text: string, kinds: PiiKind[]): PiiHit[] {
  const hits: PiiHit[] = []
  const taken = (s: number, e: number) => hits.some((h) => s < h.end && e > h.start)
  for (const [kind, re, ok] of PII_RES) {
    if (!kinds.includes(kind)) continue
    for (const m of text.matchAll(re)) {
      const s = m.index!, e = s + m[0].length
      if (ok && !ok(m[0])) continue
      if (kind === 'phone' && m[0].replace(/\D/g, '').length < 8) continue
      if (!taken(s, e)) hits.push({ kind, start: s, end: e, text: m[0] })
    }
  }
  return hits.sort((a, b) => a.start - b.start)
}
export type MaskStyle = 'label' | 'block' | 'partial' | 'token'
export function maskOne(h: PiiHit, style: MaskStyle, n: number) {
  if (style === 'label') return `[${PII_LABEL[h.kind].toUpperCase()}]`
  if (style === 'block') return h.text.replace(/[^\s@.-]/g, '█')
  if (style === 'token') return `[${h.kind.toUpperCase()}_${n}]`
  if (h.kind === 'email') { const [u, d] = h.text.split('@'); return u[0] + '***@' + d.replace(/^[^.]+/, (x) => x[0] + '***') }
  const keep = 4, digits = h.text.replace(/\W/g, '')
  return digits.length <= keep ? '****' : h.text.slice(0, -keep).replace(/[A-Za-z0-9]/g, '*') + h.text.slice(-keep)
}
export function redact(text: string, hits: PiiHit[], style: MaskStyle) {
  let out = '', last = 0
  const tokens = new Map<string, number>()
  for (const h of hits) {
    if (!tokens.has(h.kind + h.text)) tokens.set(h.kind + h.text, [...tokens.keys()].filter((k) => k.startsWith(h.kind)).length + 1)
    out += text.slice(last, h.start) + maskOne(h, style, tokens.get(h.kind + h.text)!); last = h.end
  }
  return out + text.slice(last)
}

/* ---------- hidden characters ---------- */
export type HiddenKind = 'zero-width' | 'bidi' | 'control' | 'space' | 'lookalike' | 'tag'
export interface HiddenHit { index: number; char: string; code: string; name: string; kind: HiddenKind; line: number; col: number }
const NAMES: Record<number, [string, HiddenKind]> = {
  0x200b: ['Zero width space', 'zero-width'], 0x200c: ['Zero width non-joiner', 'zero-width'], 0x200d: ['Zero width joiner', 'zero-width'], 0x2060: ['Word joiner', 'zero-width'], 0xfeff: ['Byte order mark / zero width no-break space', 'zero-width'], 0x180e: ['Mongolian vowel separator', 'zero-width'], 0x00ad: ['Soft hyphen', 'zero-width'], 0x034f: ['Combining grapheme joiner', 'zero-width'],
  0x202a: ['Left-to-right embedding', 'bidi'], 0x202b: ['Right-to-left embedding', 'bidi'], 0x202c: ['Pop directional formatting', 'bidi'], 0x202d: ['Left-to-right override', 'bidi'], 0x202e: ['Right-to-left override', 'bidi'], 0x2066: ['Left-to-right isolate', 'bidi'], 0x2067: ['Right-to-left isolate', 'bidi'], 0x2068: ['First strong isolate', 'bidi'], 0x2069: ['Pop directional isolate', 'bidi'], 0x200e: ['Left-to-right mark', 'bidi'], 0x200f: ['Right-to-left mark', 'bidi'], 0x061c: ['Arabic letter mark', 'bidi'],
  0x00a0: ['No-break space', 'space'], 0x2007: ['Figure space', 'space'], 0x202f: ['Narrow no-break space', 'space'], 0x2000: ['En quad', 'space'], 0x2001: ['Em quad', 'space'], 0x2002: ['En space', 'space'], 0x2003: ['Em space', 'space'], 0x2004: ['Three-per-em space', 'space'], 0x2005: ['Four-per-em space', 'space'], 0x2006: ['Six-per-em space', 'space'], 0x2008: ['Punctuation space', 'space'], 0x2009: ['Thin space', 'space'], 0x200a: ['Hair space', 'space'], 0x205f: ['Medium math space', 'space'], 0x3000: ['Ideographic space', 'space'], 0x3164: ['Hangul filler', 'space'], 0x2800: ['Braille blank', 'space'],
}
// Cyrillic and Greek letters that look like Latin ones
const LOOK: Record<string, string> = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ɡ': 'g', 'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X', 'І': 'I', 'Ј': 'J', 'Ѕ': 'S', 'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X', 'ο': 'o', 'ν': 'v', 'ϲ': 'c' }
export function scanHidden(text: string): HiddenHit[] {
  const out: HiddenHit[] = []
  let line = 1, col = 0, i = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    col++
    let hit: [string, HiddenKind] | undefined = NAMES[cp]
    if (!hit && cp >= 0xe0000 && cp <= 0xe007f) hit = ['Tag character (invisible)', 'tag']
    if (!hit && cp >= 0xfe00 && cp <= 0xfe0f && !/\p{Extended_Pictographic}/u.test(text.slice(Math.max(0, i - 2), i))) hit = ['Variation selector', 'zero-width']
    if (!hit && (cp < 32 && cp !== 9 && cp !== 10 && cp !== 13 || (cp >= 0x7f && cp < 0xa0))) hit = ['Control character', 'control']
    if (!hit && LOOK[ch]) hit = [`Looks like Latin "${LOOK[ch]}"`, 'lookalike']
    if (hit) out.push({ index: i, char: ch, code: 'U+' + cp.toString(16).toUpperCase().padStart(4, '0'), name: hit[0], kind: hit[1], line, col })
    if (ch === '\n') { line++; col = 0 }
    i += ch.length
  }
  return out
}
export function cleanHidden(text: string, kinds: HiddenKind[]) {
  const hits = scanHidden(text).filter((h) => kinds.includes(h.kind))
  let out = '', last = 0
  for (const h of hits) { out += text.slice(last, h.index) + (h.kind === 'space' ? ' ' : h.kind === 'lookalike' ? LOOK[h.char] : ''); last = h.index + h.char.length }
  return out + text.slice(last)
}

/* ---------- entropy ---------- */
export function entropy(b: Uint8Array, start = 0, end = b.length) {
  const f = new Uint32Array(256); for (let i = start; i < end; i++) f[b[i]]++
  const n = end - start; if (!n) return 0
  let h = 0; for (const c of f) if (c) { const p = c / n; h -= p * Math.log2(p) }
  return h
}
export function entropyBlocks(b: Uint8Array, blocks = 256) {
  const size = Math.max(256, Math.ceil(b.length / blocks))
  const out: { offset: number; size: number; h: number }[] = []
  for (let o = 0; o < b.length; o += size) out.push({ offset: o, size: Math.min(size, b.length - o), h: entropy(b, o, Math.min(b.length, o + size)) })
  return out
}
export const entropyVerdict = (h: number) => h > 7.6 ? 'Looks encrypted or compressed' : h > 6.5 ? 'Packed data or media' : h > 4.5 ? 'Mixed binary' : h > 0.5 ? 'Text or structured data' : 'Empty or repeated bytes'

/* ---------- checksum lists ---------- */
export interface SumLine { hash: string; name: string; algo: string }
export const algoByLen = (n: number) => ({ 32: 'MD5', 40: 'SHA-1', 64: 'SHA-256', 96: 'SHA-384', 128: 'SHA-512' } as Record<number, string>)[n] ?? ''
export function parseSums(text: string): SumLine[] {
  const out: SumLine[] = []
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim(); if (!l || l.startsWith('#')) continue
    let m = l.match(/^(MD5|SHA1|SHA-1|SHA224|SHA256|SHA-256|SHA384|SHA512|SHA-512)\s*\((.+)\)\s*=\s*([0-9a-fA-F]+)$/)
    if (m) { out.push({ hash: m[3].toLowerCase(), name: m[2], algo: algoByLen(m[3].length) }); continue }
    m = l.match(/^([0-9a-fA-F]{32,128})\s+[* ]?(.+)$/)
    if (m) { out.push({ hash: m[1].toLowerCase(), name: m[2].trim().replace(/^\.\//, ''), algo: algoByLen(m[1].length) }); continue }
    m = l.match(/^([0-9a-fA-F]{32,128})$/)
    if (m) out.push({ hash: m[1].toLowerCase(), name: '', algo: algoByLen(m[1].length) })
  }
  return out
}

/* ---------- LSB steganography ---------- */
const MAGIC = [0x4f, 0x46, 0x53, 0x31] // "OFS1"
/** Capacity in bytes when using `bits` low bits of R, G and B. */
export const stegoCapacity = (pixels: number, bits = 1) => Math.max(0, Math.floor((pixels * 3 * bits) / 8) - 9 * bits)
export function stegoEmbed(rgba: Uint8ClampedArray, payload: Uint8Array, bits = 1, flags = 0) {
  const header = new Uint8Array(9); header.set(MAGIC); new DataView(header.buffer).setUint32(4, payload.length); header[8] = flags | (bits << 4)
  const all = new Uint8Array(9 + payload.length); all.set(header); all.set(payload, 9)
  if (payload.length > stegoCapacity(rgba.length / 4, bits)) throw new Error('The message is too large for this image. Use a bigger image or a shorter message.')
  const out = new Uint8ClampedArray(rgba)
  // header always at 1 bit per channel so the reader can find the bit depth
  let ch = 0
  for (let i = 0; i < 9; i++) for (let b = 7; b >= 0; b--) { while (ch % 4 === 3) ch++; out[ch] = (out[ch] & ~1) | ((all[i] >> b) & 1); ch++ }
  let k = bits - 1
  for (let i = 9; i < all.length; i++) for (let b = 7; b >= 0; b--) {
    while (ch % 4 === 3) ch++
    const mask = 1 << k; out[ch] = (out[ch] & ~mask) | (((all[i] >> b) & 1) << k)
    if (k === 0) { k = bits - 1; ch++ } else k--
  }
  return out
}
export function stegoExtract(rgba: Uint8ClampedArray): { payload: Uint8Array; flags: number } | null {
  let ch = 0
  const next1 = () => { while (ch % 4 === 3) ch++; return rgba[ch++] & 1 }
  const header = new Uint8Array(9)
  for (let i = 0; i < 9; i++) { let v = 0; for (let b = 0; b < 8; b++) v = (v << 1) | next1(); header[i] = v }
  if (!MAGIC.every((m, i) => header[i] === m)) return null
  const len = new DataView(header.buffer).getUint32(4), bits = header[8] >> 4 || 1, flags = header[8] & 15
  if (len > stegoCapacity(rgba.length / 4, bits)) return null
  const payload = new Uint8Array(len)
  let k = bits - 1
  for (let i = 0; i < len; i++) { let v = 0; for (let b = 0; b < 8; b++) { while (ch % 4 === 3) ch++; v = (v << 1) | ((rgba[ch] >> k) & 1); if (k === 0) { k = bits - 1; ch++ } else k-- } payload[i] = v }
  return { payload, flags }
}

/* ---------- password encryption (AES-256-GCM, PBKDF2-SHA256) ---------- */
export async function pwEncrypt(data: Uint8Array, password: string, iter = 250000) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt, iter)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data as BufferSource))
  const out = new Uint8Array(4 + 16 + 12 + ct.length)
  new DataView(out.buffer).setUint32(0, iter); out.set(salt, 4); out.set(iv, 20); out.set(ct, 32)
  return out
}
export async function pwDecrypt(blob: Uint8Array, password: string) {
  const iter = new DataView(blob.buffer, blob.byteOffset).getUint32(0)
  const key = await deriveKey(password, blob.slice(4, 20), iter)
  try { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.slice(20, 32) }, key, blob.slice(32))) } catch { throw new Error('Wrong password, or the data was changed.') }
}
async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}
export const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s) }
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

/* ---------- metadata stripping ---------- */
export interface Strip { out: Uint8Array; removed: string[] }
export function stripJpeg(b: Uint8Array, keepIcc = true): Strip {
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error('Not a JPEG file')
  const parts: Uint8Array[] = [b.subarray(0, 2)], removed: string[] = []
  let i = 2
  while (i < b.length) {
    if (b[i] !== 0xff) throw new Error('Damaged JPEG')
    const m = b[i + 1]
    if (m === 0xda) { parts.push(b.subarray(i)); break } // start of scan: rest is image data
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { parts.push(b.subarray(i, i + 2)); i += 2; continue }
    const len = (b[i + 2] << 8) | b[i + 3], seg = b.subarray(i, i + 2 + len)
    const id = String.fromCharCode(...b.subarray(i + 4, i + 4 + 12))
    let drop = false, what = ''
    if (m === 0xe1) { drop = true; what = id.startsWith('Exif') ? 'EXIF (camera, GPS, dates)' : id.startsWith('http') ? 'XMP' : 'APP1' }
    else if (m === 0xed) { drop = true; what = 'IPTC / Photoshop' }
    else if (m === 0xfe) { drop = true; what = 'Comment' }
    else if (m === 0xe2 && id.startsWith('ICC_PROFILE')) { drop = !keepIcc; what = 'ICC colour profile' }
    else if (m >= 0xe3 && m <= 0xef) { drop = true; what = `APP${m - 0xe0}` }
    if (drop) removed.push(what); else parts.push(seg)
    i += 2 + len
  }
  return { out: concat(parts), removed }
}
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
export const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
export function stripPng(b: Uint8Array, keepIcc = true): Strip {
  const sig = [0x89, 0x50, 0x4e, 0x47]; if (!sig.every((s, i) => b[i] === s)) throw new Error('Not a PNG file')
  const parts: Uint8Array[] = [b.subarray(0, 8)], removed: string[] = []
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  let i = 8
  while (i < b.length) {
    const len = dv.getUint32(i), type = String.fromCharCode(...b.subarray(i + 4, i + 8)), end = i + 12 + len
    const drop = ['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME', 'dSIG'].includes(type) || (type === 'iCCP' && !keepIcc)
    if (drop) removed.push(type === 'eXIf' ? 'EXIF' : type === 'tIME' ? 'Last changed time' : type === 'iCCP' ? 'ICC colour profile' : `Text (${type})`)
    else parts.push(b.subarray(i, end))
    i = end
    if (type === 'IEND') break
  }
  return { out: concat(parts), removed }
}
export function stripWebp(b: Uint8Array): Strip {
  const s = (o: number, n = 4) => String.fromCharCode(...b.subarray(o, o + n))
  if (s(0) !== 'RIFF' || s(8) !== 'WEBP') throw new Error('Not a WEBP file')
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const parts: Uint8Array[] = [], removed: string[] = []
  let i = 12
  while (i + 8 <= b.length) {
    const type = s(i), len = dv.getUint32(i + 4, true), end = i + 8 + len + (len & 1)
    if (type === 'EXIF' || type === 'XMP ') removed.push(type.trim())
    else if (type === 'VP8X') { const c = b.slice(i, end); c[8] &= ~(0x08 | 0x04); parts.push(c) } // clear EXIF and XMP flags
    else parts.push(b.subarray(i, end))
    i = end
  }
  const body = concat(parts), out = new Uint8Array(12 + body.length)
  out.set(b.subarray(0, 12)); out.set(body, 12); new DataView(out.buffer).setUint32(4, 4 + body.length, true)
  return { out, removed }
}
export function stripMp3(b: Uint8Array): Strip {
  let start = 0, end = b.length; const removed: string[] = []
  while (b[start] === 0x49 && b[start + 1] === 0x44 && b[start + 2] === 0x33) { // ID3v2 (may repeat)
    const size = ((b[start + 6] & 0x7f) << 21) | ((b[start + 7] & 0x7f) << 14) | ((b[start + 8] & 0x7f) << 7) | (b[start + 9] & 0x7f)
    start += 10 + size + (b[start + 5] & 0x10 ? 10 : 0); removed.push('ID3v2 tags (title, artist, cover art, comments)')
  }
  if (end - start > 128 && b[end - 128] === 0x54 && b[end - 127] === 0x41 && b[end - 126] === 0x47) { end -= 128; removed.push('ID3v1 tag') }
  return { out: b.slice(start, end), removed }
}
function concat(parts: Uint8Array[]) { const n = parts.reduce((s, p) => s + p.length, 0), o = new Uint8Array(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length } return o }
