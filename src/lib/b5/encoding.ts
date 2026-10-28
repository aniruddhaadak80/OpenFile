/* Encoding operations + recipe engine (pure; runs in browser and Node). */
const te = new TextEncoder()
const td = (b: Uint8Array, fatal = false) => new TextDecoder('utf-8', { fatal }).decode(b)
export const utf8 = (s: string) => te.encode(s)
export const text = (b: Uint8Array) => td(b)

/* ---------- hex / base64 / binary / charcode ---------- */
export const toHex = (b: Uint8Array, sep = '') => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(sep)
export function fromHex(s: string): Uint8Array {
  const t = s.replace(/0x/gi, '').replace(/\\x/g, '').replace(/[^0-9a-f]/gi, '')
  if (t.length % 2) throw new Error('Hex input has an odd number of digits.')
  return Uint8Array.from(t.match(/../g) ?? [], (h) => parseInt(h, 16))
}
export function toB64(b: Uint8Array, url = false) {
  let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  const r = btoa(s); return url ? r.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : r
}
export function fromB64(s: string): Uint8Array {
  let t = s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  if (/[^A-Za-z0-9+/=]/.test(t)) throw new Error('Input has characters that are not Base64.')
  t = t.replace(/=+$/, ''); t += '='.repeat((4 - (t.length % 4)) % 4)
  return Uint8Array.from(atob(t), (c) => c.charCodeAt(0))
}
export const toBinary = (b: Uint8Array) => Array.from(b, (x) => x.toString(2).padStart(8, '0')).join(' ')
export function fromBinary(s: string) { const t = s.replace(/[^01]/g, ''); if (t.length % 8) throw new Error('Binary input length is not a multiple of 8.'); return Uint8Array.from(t.match(/.{8}/g) ?? [], (x) => parseInt(x, 2)) }
export const toCharcode = (s: string, base = 10) => Array.from(s, (c) => c.codePointAt(0)!.toString(base)).join(' ')
export const fromCharcode = (s: string, base = 10) => String.fromCodePoint(...s.trim().split(/[\s,;]+/).filter(Boolean).map((x) => parseInt(x.replace(/^0x|^u\+/i, ''), base)))

/* ---------- base32 (RFC 4648) ---------- */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export function toB32(b: Uint8Array) {
  let bits = 0, val = 0, out = ''
  for (const x of b) { val = (val << 8) | x; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5 } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31]
  while (out.length % 8) out += '='
  return out
}
export function fromB32(s: string) {
  const t = s.toUpperCase().replace(/[\s=]/g, ''); let bits = 0, val = 0; const out: number[] = []
  for (const c of t) { const i = B32.indexOf(c); if (i < 0) throw new Error(`“${c}” is not a Base32 character.`); val = (val << 5) | i; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8 } }
  return new Uint8Array(out)
}

/* ---------- base58 / base62 (big-number alphabets) ---------- */
function toBaseX(b: Uint8Array, alpha: string) {
  let n = 0n; for (const x of b) n = (n << 8n) | BigInt(x)
  let out = ''; const B = BigInt(alpha.length)
  while (n > 0n) { out = alpha[Number(n % B)] + out; n /= B }
  for (const x of b) { if (x === 0) out = alpha[0] + out; else break }
  return out
}
function fromBaseX(s: string, alpha: string) {
  const t = s.trim(); let n = 0n; const B = BigInt(alpha.length)
  for (const c of t) { const i = alpha.indexOf(c); if (i < 0) throw new Error(`“${c}” is not valid in this alphabet.`); n = n * B + BigInt(i) }
  const bytes: number[] = []; while (n > 0n) { bytes.unshift(Number(n & 255n)); n >>= 8n }
  for (const c of t) { if (c === alpha[0]) bytes.unshift(0); else break }
  return new Uint8Array(bytes)
}
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
export const toB58 = (b: Uint8Array) => toBaseX(b, B58), fromB58 = (s: string) => fromBaseX(s, B58)
export const toB62 = (b: Uint8Array) => toBaseX(b, B62), fromB62 = (s: string) => fromBaseX(s, B62)

/* ---------- Ascii85 ---------- */
export function toA85(b: Uint8Array) {
  let out = '<~'
  for (let i = 0; i < b.length; i += 4) {
    const chunk = [b[i] ?? 0, b[i + 1] ?? 0, b[i + 2] ?? 0, b[i + 3] ?? 0]; const n = Math.min(4, b.length - i)
    let v = ((chunk[0] << 24) | (chunk[1] << 16) | (chunk[2] << 8) | chunk[3]) >>> 0
    if (v === 0 && n === 4) { out += 'z'; continue }
    const c: string[] = []; for (let k = 0; k < 5; k++) { c.unshift(String.fromCharCode(33 + (v % 85))); v = Math.floor(v / 85) }
    out += c.slice(0, n + 1).join('')
  }
  return out + '~>'
}
export function fromA85(s: string) {
  const t = s.trim().replace(/^<~/, '').replace(/~>$/, '').replace(/\s+/g, '').replace(/z/g, '!!!!!')
  const out: number[] = []
  for (let i = 0; i < t.length; i += 5) {
    const grp = t.slice(i, i + 5); const n = grp.length; const g = grp.padEnd(5, 'u')
    let v = 0; for (const c of g) { const d = c.charCodeAt(0) - 33; if (d < 0 || d > 84) throw new Error('Invalid Ascii85 character.'); v = v * 85 + d }
    const bytes = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]
    out.push(...bytes.slice(0, n - 1))
  }
  return new Uint8Array(out)
}

/* ---------- quoted-printable ---------- */
export function toQP(b: Uint8Array) {
  let line = '', out = ''
  const push = (tok: string) => { if (line.length + tok.length > 75) { out += line + '=\r\n'; line = '' } line += tok }
  for (let i = 0; i < b.length; i++) {
    const x = b[i]
    if (x === 0x0d && b[i + 1] === 0x0a) { out += line + '\r\n'; line = ''; i++; continue }
    if (x === 0x0a) { out += line + '\n'; line = ''; continue }
    const isLast = i === b.length - 1 || b[i + 1] === 0x0a || b[i + 1] === 0x0d
    if ((x >= 33 && x <= 126 && x !== 61) || ((x === 32 || x === 9) && !isLast)) push(String.fromCharCode(x))
    else push('=' + x.toString(16).toUpperCase().padStart(2, '0'))
  }
  return out + line
}
export function fromQP(s: string) {
  const t = s.replace(/=\r?\n/g, ''); const out: number[] = []
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(t.slice(i + 1, i + 3))) { out.push(parseInt(t.slice(i + 1, i + 3), 16)); i += 2 }
    else out.push(...te.encode(t[i]))
  }
  return new Uint8Array(out)
}

/* ---------- punycode (RFC 3492) ---------- */
const BASE = 36, TMIN = 1, TMAX = 26, SKEW = 38, DAMP = 700, IBIAS = 72, IN = 128
function adapt(delta: number, num: number, first: boolean) { delta = first ? Math.floor(delta / DAMP) : delta >> 1; delta += Math.floor(delta / num); let k = 0; while (delta > ((BASE - TMIN) * TMAX) >> 1) { delta = Math.floor(delta / (BASE - TMIN)); k += BASE } return k + Math.floor(((BASE - TMIN + 1) * delta) / (delta + SKEW)) }
const digit = (d: number) => String.fromCharCode(d + 22 + 75 * (d < 26 ? 1 : 0))
export function punyEncode(input: string) {
  const cps = Array.from(input, (c) => c.codePointAt(0)!); let out = cps.filter((c) => c < 128).map((c) => String.fromCharCode(c)).join('')
  const b = out.length; let h = b; if (b) out += '-'
  let n = IN, delta = 0, bias = IBIAS
  while (h < cps.length) {
    const m = Math.min(...cps.filter((c) => c >= n)); delta += (m - n) * (h + 1); n = m
    for (const c of cps) {
      if (c < n) delta++
      if (c === n) { let q = delta; for (let k = BASE; ; k += BASE) { const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias; if (q < t) break; out += digit(t + ((q - t) % (BASE - t))); q = Math.floor((q - t) / (BASE - t)) } out += digit(q); bias = adapt(delta, h + 1, h === b); delta = 0; h++ }
    }
    delta++; n++
  }
  return out
}
export function punyDecode(input: string) {
  const out: number[] = []; const d = input.lastIndexOf('-'); const basic = d > 0 ? input.slice(0, d) : ''
  for (const c of basic) out.push(c.charCodeAt(0))
  let n = IN, bias = IBIAS, i = 0, pos = d > 0 ? d + 1 : 0
  while (pos < input.length) {
    const old = i; let w = 1
    for (let k = BASE; ; k += BASE) {
      if (pos >= input.length) throw new Error('Bad punycode input.')
      const cp = input.charCodeAt(pos++); const dig = cp - 48 < 10 ? cp - 22 : cp - 65 < 26 ? cp - 65 : cp - 97 < 26 ? cp - 97 : BASE
      if (dig >= BASE) throw new Error('Bad punycode digit.')
      i += dig * w; const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias; if (dig < t) break; w *= BASE - t
    }
    bias = adapt(i - old, out.length + 1, old === 0); n += Math.floor(i / (out.length + 1)); i %= out.length + 1; out.splice(i++, 0, n)
  }
  return String.fromCodePoint(...out)
}
export const domainToAscii = (s: string) => s.split('.').map((l) => (/[^\x00-\x7f]/.test(l) ? 'xn--' + punyEncode(l.toLowerCase()) : l)).join('.')
export const domainToUnicode = (s: string) => s.split('.').map((l) => (/^xn--/i.test(l) ? punyDecode(l.slice(4)) : l)).join('.')

/* ---------- unicode escapes ---------- */
export const toUnicodeEsc = (s: string, all = false) => Array.from(s).map((c) => { const cp = c.codePointAt(0)!; if (!all && cp < 128) return c; return cp > 0xffff ? c.split('').map((u) => '\\u' + u.charCodeAt(0).toString(16).padStart(4, '0')).join('') : '\\u' + cp.toString(16).padStart(4, '0') }).join('')
export const fromUnicodeEsc = (s: string) => s.replace(/\\u\{([0-9a-f]+)\}/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\x([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/U\+([0-9a-f]{4,6})/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))

/* ---------- hexdump ---------- */
export function hexdump(b: Uint8Array, width = 16, max = 65536) {
  const lines: string[] = []
  for (let o = 0; o < Math.min(b.length, max); o += width) {
    const row = b.subarray(o, o + width)
    const hex = Array.from(row, (x) => x.toString(16).padStart(2, '0')).join(' ').padEnd(width * 3 - 1)
    const asc = Array.from(row, (x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : '.')).join('')
    lines.push(`${o.toString(16).padStart(8, '0')}  ${hex}  |${asc}|`)
  }
  if (b.length > max) lines.push(`… ${b.length - max} more bytes`)
  return lines.join('\n')
}

/* ---------- protobuf (schema-less) ---------- */
function readVarint(b: Uint8Array, p: number): [bigint, number] {
  let r = 0n, s = 0n
  for (let i = 0; i < 10; i++) { if (p >= b.length) throw new Error('truncated varint'); const x = b[p++]; r |= BigInt(x & 0x7f) << s; if (!(x & 0x80)) return [r, p]; s += 7n }
  throw new Error('varint too long')
}
export function protoDecode(b: Uint8Array, depth = 0): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {}; let p = 0
  while (p < b.length) {
    const [key, p1] = readVarint(b, p); p = p1
    const field = Number(key >> 3n), wt = Number(key & 7n)
    if (field === 0) throw new Error('field number 0')
    let val: unknown
    if (wt === 0) { const [v, p2] = readVarint(b, p); p = p2; val = v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v.toString() }
    else if (wt === 1) { if (p + 8 > b.length) throw new Error('truncated'); const dv = new DataView(b.buffer, b.byteOffset + p, 8); val = { fixed64: dv.getBigUint64(0, true).toString(), double: dv.getFloat64(0, true) }; p += 8 }
    else if (wt === 5) { if (p + 4 > b.length) throw new Error('truncated'); const dv = new DataView(b.buffer, b.byteOffset + p, 4); val = { fixed32: dv.getUint32(0, true), float: +dv.getFloat32(0, true).toPrecision(7) }; p += 4 }
    else if (wt === 2) {
      const [len, p2] = readVarint(b, p); p = p2; const L = Number(len); if (p + L > b.length) throw new Error('truncated bytes')
      const sub = b.subarray(p, p + L); p += L
      let decoded: unknown = null
      if (depth < 12 && L > 0) { try { const m = protoDecode(sub, depth + 1); if (Object.keys(m).length) decoded = m } catch { /* not a message */ } }
      if (decoded === null) { try { const s = td(sub, true); decoded = /[\x00-\x08\x0e-\x1f]/.test(s) ? { bytes: toHex(sub, ' ') } : s } catch { decoded = { bytes: toHex(sub, ' ') } } }
      val = decoded
    } else throw new Error(`unsupported wire type ${wt}`)
    ;(out[field] ??= []).push(val)
  }
  return out
}

/* ---------- recipe engine ---------- */
export type Data = Uint8Array
export type Param = { key: string; label: string; type: 'text' | 'number' | 'select'; options?: string[]; default: string | number }
export type Op = { id: string; name: string; group: string; params?: Param[]; run: (d: Data, p: Record<string, any>) => Data | Promise<Data> }

const T = (f: (s: string, p: Record<string, any>) => string) => (d: Data, p: Record<string, any>) => utf8(f(text(d), p))

export const OPS: Op[] = [
  { id: 'to-b64', name: 'To Base64', group: 'Base64', params: [{ key: 'v', label: 'Variant', type: 'select', options: ['standard', 'url-safe'], default: 'standard' }], run: (d, p) => utf8(toB64(d, p.v === 'url-safe')) },
  { id: 'from-b64', name: 'From Base64', group: 'Base64', run: (d) => fromB64(text(d)) },
  { id: 'to-hex', name: 'To Hex', group: 'Hex', params: [{ key: 'sep', label: 'Separator', type: 'select', options: ['none', 'space', 'colon', '\\x'], default: 'space' }], run: (d, p) => utf8(p.sep === '\\x' ? Array.from(d, (x) => '\\x' + x.toString(16).padStart(2, '0')).join('') : toHex(d, p.sep === 'space' ? ' ' : p.sep === 'colon' ? ':' : '')) },
  { id: 'from-hex', name: 'From Hex', group: 'Hex', run: (d) => fromHex(text(d)) },
  { id: 'hexdump', name: 'To Hexdump', group: 'Hex', run: (d) => utf8(hexdump(d)) },
  { id: 'to-b32', name: 'To Base32', group: 'Base32/58/62/85', run: (d) => utf8(toB32(d)) },
  { id: 'from-b32', name: 'From Base32', group: 'Base32/58/62/85', run: (d) => fromB32(text(d)) },
  { id: 'to-b58', name: 'To Base58', group: 'Base32/58/62/85', run: (d) => utf8(toB58(d)) },
  { id: 'from-b58', name: 'From Base58', group: 'Base32/58/62/85', run: (d) => fromB58(text(d)) },
  { id: 'to-b62', name: 'To Base62', group: 'Base32/58/62/85', run: (d) => utf8(toB62(d)) },
  { id: 'from-b62', name: 'From Base62', group: 'Base32/58/62/85', run: (d) => fromB62(text(d)) },
  { id: 'to-a85', name: 'To Base85 (Ascii85)', group: 'Base32/58/62/85', run: (d) => utf8(toA85(d)) },
  { id: 'from-a85', name: 'From Base85 (Ascii85)', group: 'Base32/58/62/85', run: (d) => fromA85(text(d)) },
  { id: 'to-bin', name: 'To Binary', group: 'Text', run: (d) => utf8(toBinary(d)) },
  { id: 'from-bin', name: 'From Binary', group: 'Text', run: (d) => fromBinary(text(d)) },
  { id: 'to-charcode', name: 'To Charcode', group: 'Text', params: [{ key: 'base', label: 'Base', type: 'select', options: ['10', '16'], default: '10' }], run: T((s, p) => toCharcode(s, Number(p.base))) },
  { id: 'from-charcode', name: 'From Charcode', group: 'Text', params: [{ key: 'base', label: 'Base', type: 'select', options: ['10', '16'], default: '10' }], run: T((s, p) => fromCharcode(s, Number(p.base))) },
  { id: 'url-enc', name: 'URL Encode', group: 'Text', params: [{ key: 'all', label: 'Mode', type: 'select', options: ['component', 'full URL'], default: 'component' }], run: T((s, p) => (p.all === 'full URL' ? encodeURI(s) : encodeURIComponent(s))) },
  { id: 'url-dec', name: 'URL Decode', group: 'Text', run: T((s) => decodeURIComponent(s.replace(/\+/g, ' '))) },
  { id: 'qp-enc', name: 'To Quoted-Printable', group: 'Text', run: (d) => utf8(toQP(d)) },
  { id: 'qp-dec', name: 'From Quoted-Printable', group: 'Text', run: (d) => fromQP(text(d)) },
  { id: 'puny-enc', name: 'To Punycode (domain)', group: 'Text', run: T(domainToAscii) },
  { id: 'puny-dec', name: 'From Punycode (domain)', group: 'Text', run: T(domainToUnicode) },
  { id: 'uni-esc', name: 'Escape Unicode (\\u)', group: 'Text', params: [{ key: 'all', label: 'Escape', type: 'select', options: ['non-ASCII only', 'everything'], default: 'non-ASCII only' }], run: T((s, p) => toUnicodeEsc(s, p.all === 'everything')) },
  { id: 'uni-unesc', name: 'Unescape Unicode', group: 'Text', run: T(fromUnicodeEsc) },
  { id: 'html-enc', name: 'HTML Entity Encode', group: 'Text', run: T((s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!).replace(/[^\x00-\x7f]/gu, (c) => `&#${c.codePointAt(0)};`)) },
  { id: 'html-dec', name: 'HTML Entity Decode', group: 'Text', run: T((s) => fromUnicodeEsc(s).replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', '#39': "'" })[e as 'amp']!)) },
  { id: 'upper', name: 'Upper case', group: 'Text', run: T((s) => s.toUpperCase()) },
  { id: 'lower', name: 'Lower case', group: 'Text', run: T((s) => s.toLowerCase()) },
  { id: 'reverse', name: 'Reverse', group: 'Text', params: [{ key: 'by', label: 'By', type: 'select', options: ['character', 'byte', 'line'], default: 'character' }], run: (d, p) => p.by === 'byte' ? d.slice().reverse() : utf8(p.by === 'line' ? text(d).split('\n').reverse().join('\n') : Array.from(text(d)).reverse().join('')) },
  { id: 'rot13', name: 'ROT13', group: 'Text', run: T((s) => s.replace(/[a-z]/gi, (c) => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + 13) % 26) + b) })) },
  { id: 'xor', name: 'XOR with key', group: 'Bytes', params: [{ key: 'key', label: 'Key', type: 'text', default: 'key' }, { key: 'kf', label: 'Key format', type: 'select', options: ['text', 'hex'], default: 'text' }], run: (d, p) => { const k = p.kf === 'hex' ? fromHex(p.key) : utf8(String(p.key)); if (!k.length) throw new Error('XOR needs a key.'); return d.map((x, i) => x ^ k[i % k.length]) } },
  { id: 'gzip', name: 'Gzip compress', group: 'Compression', params: [{ key: 'level', label: 'Level', type: 'number', default: 6 }], run: async (d, p) => (await import('fflate')).gzipSync(d, { level: Math.max(0, Math.min(9, Number(p.level))) as any }) },
  { id: 'gunzip', name: 'Gzip decompress', group: 'Compression', run: async (d) => (await import('fflate')).gunzipSync(d) },
  { id: 'deflate', name: 'Raw deflate', group: 'Compression', run: async (d) => (await import('fflate')).deflateSync(d) },
  { id: 'inflate', name: 'Raw inflate', group: 'Compression', run: async (d) => (await import('fflate')).inflateSync(d) },
  { id: 'zlib', name: 'Zlib compress', group: 'Compression', run: async (d) => (await import('fflate')).zlibSync(d) },
  { id: 'unzlib', name: 'Zlib decompress', group: 'Compression', run: async (d) => (await import('fflate')).unzlibSync(d) },
  { id: 'json-msgpack', name: 'JSON to MessagePack', group: 'Serialization', run: async (d) => (await import('@msgpack/msgpack')).encode(JSON.parse(text(d))) },
  { id: 'msgpack-json', name: 'MessagePack to JSON', group: 'Serialization', run: async (d) => utf8(JSON.stringify((await import('@msgpack/msgpack')).decode(d), (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)) },
  { id: 'json-cbor', name: 'JSON to CBOR', group: 'Serialization', run: async (d) => new Uint8Array((await import('cbor-x')).encode(JSON.parse(text(d)))) },
  { id: 'cbor-json', name: 'CBOR to JSON', group: 'Serialization', run: async (d) => utf8(JSON.stringify((await import('cbor-x')).decode(d), (_k, v) => (typeof v === 'bigint' ? v.toString() : v instanceof Uint8Array ? toHex(v) : v), 2)) },
  { id: 'proto-decode', name: 'Protobuf decode (raw)', group: 'Serialization', run: (d) => utf8(JSON.stringify(protoDecode(d), null, 2)) },
  { id: 'json-pretty', name: 'JSON beautify', group: 'Serialization', run: T((s) => JSON.stringify(JSON.parse(s), null, 2)) },
  { id: 'json-min', name: 'JSON minify', group: 'Serialization', run: T((s) => JSON.stringify(JSON.parse(s))) },
  { id: 'sha256', name: 'SHA-256 (hex)', group: 'Hashing', params: [{ key: 'alg', label: 'Algorithm', type: 'select', options: ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'], default: 'SHA-256' }], run: async (d, p) => utf8(toHex(new Uint8Array(await crypto.subtle.digest(p.alg, d as unknown as BufferSource)))) },
]
export const opById = (id: string) => OPS.find((o) => o.id === id)

export type Step = { id: string; params: Record<string, any>; off?: boolean }
export async function runRecipe(input: Data, steps: Step[]): Promise<{ out: Data; trace: { name: string; size: number; err?: string }[] }> {
  let d = input; const trace: { name: string; size: number; err?: string }[] = []
  for (const s of steps) {
    const op = opById(s.id); if (!op || s.off) continue
    const params = Object.fromEntries((op.params ?? []).map((p) => [p.key, s.params[p.key] ?? p.default]))
    try { d = await op.run(d, params); trace.push({ name: op.name, size: d.length }) } catch (e: any) { trace.push({ name: op.name, size: d.length, err: e?.message || String(e) }); throw Object.assign(new Error(`${op.name}: ${e?.message || e}`), { trace }) }
  }
  return { out: d, trace }
}

/** Is the data printable UTF-8 text? */
export function isText(b: Uint8Array) { try { const s = td(b, true); return !/[\x00-\x08\x0e-\x1f\x7f]/.test(s) } catch { return false } }
