/* ID generators: UUID (via uuid, MIT), ULID and NanoID (plain TS, Web Crypto randomness). */
import { v1, v3, v4, v5, v6, v7, NIL, MAX, validate as uuidValidate } from 'uuid'

export type IdKind = 'v4' | 'v7' | 'v1' | 'v6' | 'v3' | 'v5' | 'ulid' | 'nanoid' | 'nil' | 'max'
export const NAMESPACES: Record<string, string> = {
  DNS: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  URL: '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
  OID: '6ba7b812-9dad-11d1-80b4-00c04fd430c8',
  X500: '6ba7b814-9dad-11d1-80b4-00c04fd430c8',
}

const rnd = (n: number) => crypto.getRandomValues(new Uint8Array(n))

/* ---------- ULID ---------- */
export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
let ulidLastMs = -1
let ulidLastRand: number[] = []
function encodeTime(ms: number) {
  let s = ''
  for (let i = 0; i < 10; i++) { s = CROCKFORD[ms % 32] + s; ms = Math.floor(ms / 32) }
  return s
}
/** Monotonic ULID: inside the same millisecond the random part is incremented by one. */
export function ulid(now = Date.now()): string {
  if (now === ulidLastMs) {
    let i = 15
    while (i >= 0 && ulidLastRand[i] === 31) { ulidLastRand[i] = 0; i-- }
    if (i < 0) throw new Error('ULID random part overflowed in this millisecond')
    ulidLastRand[i]++
  } else {
    ulidLastMs = now
    ulidLastRand = Array.from(rnd(16), (b) => b & 31)
  }
  return encodeTime(now) + ulidLastRand.map((v) => CROCKFORD[v]).join('')
}
export function parseUlid(s: string): { ms: number; date: Date } | null {
  const u = s.trim().toUpperCase().replace(/[IL]/g, '1').replace(/O/g, '0')
  if (!/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(u)) return null
  let ms = 0
  for (const c of u.slice(0, 10)) ms = ms * 32 + CROCKFORD.indexOf(c)
  return { ms, date: new Date(ms) }
}
/** ULID as a UUID string (the same 128 bits). */
export function ulidToUuid(s: string): string {
  let n = 0n
  for (const c of s.toUpperCase()) n = n * 32n + BigInt(CROCKFORD.indexOf(c))
  const h = n.toString(16).padStart(32, '0')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/* ---------- NanoID ---------- */
export const NANO_ALPHABETS: Record<string, string> = {
  'URL safe (default)': 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict',
  'Alphanumeric': '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  'Lowercase + digits': '0123456789abcdefghijklmnopqrstuvwxyz',
  'Numbers': '0123456789',
  'Hex': '0123456789abcdef',
  'No look-alikes': '6789BCDFGHJKLMNPQRTWbcdfghjkmnpqrtwz',
}
/** Unbiased NanoID with any alphabet (2 to 256 symbols), same mask method as the reference library. */
export function nanoid(size = 21, alphabet = NANO_ALPHABETS['URL safe (default)']): string {
  const chars = Array.from(new Set(Array.from(alphabet)))
  if (chars.length < 2) throw new Error('The alphabet needs at least 2 different characters')
  if (chars.length > 256) throw new Error('The alphabet can have at most 256 characters')
  if (size < 1 || size > 1024) throw new Error('Length must be between 1 and 1024')
  const mask = (2 << (31 - Math.clz32((chars.length - 1) | 1))) - 1
  const step = Math.ceil((1.6 * mask * size) / chars.length)
  let id = ''
  for (;;) {
    const bytes = rnd(step)
    for (let i = 0; i < step; i++) {
      const c = chars[bytes[i] & mask]
      if (c !== undefined) { id += c; if (id.length === size) return id }
    }
  }
}
/** Rough collision estimate: IDs needed for a 1% chance of a collision. */
export function nanoCollision(size: number, alphabetLen: number): number {
  const bits = size * Math.log2(alphabetLen)
  return Math.sqrt(2 * Math.pow(2, bits) * 0.01005)
}

/* ---------- UUID ---------- */
export interface GenOpts { namespace?: string; name?: string; nanoSize?: number; nanoAlphabet?: string }
export function generate(kind: IdKind, o: GenOpts = {}): string {
  switch (kind) {
    case 'v4': return v4()
    case 'v7': return v7()
    case 'v1': return v1()
    case 'v6': return v6()
    case 'v3': case 'v5': {
      const ns = o.namespace ?? NAMESPACES.DNS
      if (!uuidValidate(ns)) throw new Error('The namespace must be a valid UUID')
      return (kind === 'v3' ? v3 : v5)(o.name ?? '', ns)
    }
    case 'ulid': return ulid()
    case 'nanoid': return nanoid(o.nanoSize, o.nanoAlphabet)
    case 'nil': return NIL
    case 'max': return MAX
  }
}
/** Name-based IDs are the same every time, so a bulk list makes one per input line. */
export function generateMany(kind: IdKind, count: number, o: GenOpts = {}): string[] {
  if (kind === 'v3' || kind === 'v5') {
    const names = (o.name ?? '').split(/\r?\n/)
    return names.map((name) => generate(kind, { ...o, name }))
  }
  if (kind === 'nil' || kind === 'max') return [generate(kind)]
  return Array.from({ length: count }, () => generate(kind, o))
}
export { uuidValidate }
