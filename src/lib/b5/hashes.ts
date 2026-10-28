/* Hash algorithms backed by hash-wasm (MIT). Pure logic, also used by Node tests. */

export type HashGroup = 'Classic' | 'SHA-2' | 'SHA-3' | 'BLAKE' | 'Checksum' | 'Other'
export interface HashAlgo {
  id: string
  group: HashGroup
  bits: number
  /** How a secret key is used: hmac = wrapped in HMAC, native = keyed mode of the algorithm itself, none = no keyed form. */
  keyed: 'hmac' | 'native' | 'none'
  note?: string
}

export const HASH_ALGOS: HashAlgo[] = [
  { id: 'MD5', group: 'Classic', bits: 128, keyed: 'hmac', note: 'Broken for security, fine for checksums' },
  { id: 'MD4', group: 'Classic', bits: 128, keyed: 'hmac', note: 'Legacy, broken' },
  { id: 'SHA-1', group: 'Classic', bits: 160, keyed: 'hmac', note: 'Legacy, collisions are practical' },
  { id: 'RIPEMD-160', group: 'Classic', bits: 160, keyed: 'hmac', note: 'Used in Bitcoin addresses' },
  { id: 'SHA-224', group: 'SHA-2', bits: 224, keyed: 'hmac' },
  { id: 'SHA-256', group: 'SHA-2', bits: 256, keyed: 'hmac' },
  { id: 'SHA-384', group: 'SHA-2', bits: 384, keyed: 'hmac' },
  { id: 'SHA-512', group: 'SHA-2', bits: 512, keyed: 'hmac' },
  { id: 'SHA3-224', group: 'SHA-3', bits: 224, keyed: 'hmac' },
  { id: 'SHA3-256', group: 'SHA-3', bits: 256, keyed: 'hmac' },
  { id: 'SHA3-384', group: 'SHA-3', bits: 384, keyed: 'hmac' },
  { id: 'SHA3-512', group: 'SHA-3', bits: 512, keyed: 'hmac' },
  { id: 'Keccak-256', group: 'SHA-3', bits: 256, keyed: 'hmac', note: 'Original Keccak padding, as used by Ethereum' },
  { id: 'BLAKE2b-512', group: 'BLAKE', bits: 512, keyed: 'native' },
  { id: 'BLAKE2b-256', group: 'BLAKE', bits: 256, keyed: 'native' },
  { id: 'BLAKE2s-256', group: 'BLAKE', bits: 256, keyed: 'native' },
  { id: 'BLAKE3', group: 'BLAKE', bits: 256, keyed: 'native', note: 'Keyed mode needs a 32 byte key' },
  { id: 'CRC32', group: 'Checksum', bits: 32, keyed: 'none' },
  { id: 'CRC32C', group: 'Checksum', bits: 32, keyed: 'none', note: 'Castagnoli polynomial' },
  { id: 'CRC64', group: 'Checksum', bits: 64, keyed: 'none', note: 'ECMA-182' },
  { id: 'Adler-32', group: 'Checksum', bits: 32, keyed: 'none' },
  { id: 'xxHash32', group: 'Checksum', bits: 32, keyed: 'none' },
  { id: 'xxHash64', group: 'Checksum', bits: 64, keyed: 'none' },
  { id: 'xxHash3', group: 'Checksum', bits: 64, keyed: 'none' },
  { id: 'xxHash128', group: 'Checksum', bits: 128, keyed: 'none' },
  { id: 'Whirlpool', group: 'Other', bits: 512, keyed: 'hmac' },
  { id: 'SM3', group: 'Other', bits: 256, keyed: 'hmac', note: 'Chinese national standard' },
]
export const HASH_IDS = HASH_ALGOS.map((a) => a.id)
export const algoById = (id: string) => HASH_ALGOS.find((a) => a.id === id)

type HW = typeof import('hash-wasm')
type IHasher = Awaited<ReturnType<HW['createSHA256']>>
let hwP: Promise<HW> | null = null
export const loadHashWasm = () => (hwP ??= import('hash-wasm'))

function base(hw: HW, id: string, key?: Uint8Array): Promise<IHasher> {
  switch (id) {
    case 'MD5': return hw.createMD5()
    case 'MD4': return hw.createMD4()
    case 'SHA-1': return hw.createSHA1()
    case 'RIPEMD-160': return hw.createRIPEMD160()
    case 'SHA-224': return hw.createSHA224()
    case 'SHA-256': return hw.createSHA256()
    case 'SHA-384': return hw.createSHA384()
    case 'SHA-512': return hw.createSHA512()
    case 'SHA3-224': return hw.createSHA3(224)
    case 'SHA3-256': return hw.createSHA3(256)
    case 'SHA3-384': return hw.createSHA3(384)
    case 'SHA3-512': return hw.createSHA3(512)
    case 'Keccak-256': return hw.createKeccak(256)
    case 'BLAKE2b-512': return hw.createBLAKE2b(512, key)
    case 'BLAKE2b-256': return hw.createBLAKE2b(256, key)
    case 'BLAKE2s-256': return hw.createBLAKE2s(256, key)
    case 'BLAKE3': return hw.createBLAKE3(256, key)
    case 'CRC32': return hw.createCRC32()
    case 'CRC32C': return hw.createCRC32(0x82f63b78)
    case 'CRC64': return hw.createCRC64()
    case 'Adler-32': return hw.createAdler32()
    case 'xxHash32': return hw.createXXHash32(0)
    case 'xxHash64': return hw.createXXHash64(0, 0)
    case 'xxHash3': return hw.createXXHash3(0, 0)
    case 'xxHash128': return hw.createXXHash128(0, 0)
    case 'Whirlpool': return hw.createWhirlpool()
    case 'SM3': return hw.createSM3()
  }
  throw new Error('Unknown algorithm ' + id)
}

/** Validate a key for an algorithm. Returns an error message or null. */
export function keyProblem(id: string, key: Uint8Array): string | null {
  const a = algoById(id)
  if (!a || a.keyed !== 'native') return null
  if (id === 'BLAKE3' && key.length !== 32) return `BLAKE3 keyed mode needs exactly 32 bytes (yours is ${key.length})`
  if (id.startsWith('BLAKE2b') && (key.length < 1 || key.length > 64)) return 'BLAKE2b keys must be 1 to 64 bytes'
  if (id.startsWith('BLAKE2s') && (key.length < 1 || key.length > 32)) return 'BLAKE2s keys must be 1 to 32 bytes'
  return null
}

/** Create a streaming hasher. key = null for a plain hash. Returns null when the algorithm has no keyed form. */
export async function createHasher(id: string, key: Uint8Array | null): Promise<IHasher | null> {
  const hw = await loadHashWasm()
  const a = algoById(id)
  if (!a) throw new Error('Unknown algorithm ' + id)
  if (key == null) return base(hw, id)
  if (a.keyed === 'none') return null
  if (a.keyed === 'native') { const p = keyProblem(id, key); if (p) throw new Error(p); return base(hw, id, key) }
  return hw.createHMAC(base(hw, id), key)
}

export type HashResult = Record<string, { hex?: string; error?: string }>

/** Hash a byte source made of chunks (sync array or async generator). All hashers are fed in one pass. */
export async function hashChunks(chunks: Iterable<Uint8Array> | AsyncIterable<Uint8Array>, ids: string[], key: Uint8Array | null): Promise<HashResult> {
  const out: HashResult = {}
  const live: [string, IHasher][] = []
  for (const id of ids) {
    try {
      const h = await createHasher(id, key)
      if (!h) { out[id] = { error: 'No keyed form' }; continue }
      h.init(); live.push([id, h])
    } catch (e) { out[id] = { error: (e as Error).message } }
  }
  for await (const c of chunks as AsyncIterable<Uint8Array>) for (const [, h] of live) h.update(c)
  for (const [id, h] of live) out[id] = { hex: h.digest('hex') as string }
  return out
}

export const hashBytes = (bytes: Uint8Array, ids: string[], key: Uint8Array | null) => hashChunks([bytes], ids, key)

export const CHUNK = 4 * 1024 * 1024
/** Read a Blob in chunks, reporting progress 0..1. Memory stays flat for any file size. */
export async function* blobChunks(blob: Blob, onP?: (p: number) => void): AsyncGenerator<Uint8Array> {
  if (blob.size === 0) { onP?.(1); return }
  for (let o = 0; o < blob.size; o += CHUNK) {
    yield new Uint8Array(await blob.slice(o, o + CHUNK).arrayBuffer())
    onP?.(Math.min(1, (o + CHUNK) / blob.size))
  }
}

export type KeyFormat = 'utf8' | 'hex' | 'base64'
export function parseKey(s: string, fmt: KeyFormat): Uint8Array {
  if (fmt === 'utf8') return new TextEncoder().encode(s)
  if (fmt === 'hex') {
    const h = s.replace(/^0x/i, '').replace(/[\s:]/g, '')
    if (h.length % 2 || /[^0-9a-f]/i.test(h)) throw new Error('Key is not valid hex')
    return Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16))
  }
  try { const b = atob(s.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)) } catch { throw new Error('Key is not valid Base64') }
}

export const hexToB64 = (h: string) => { let s = ''; for (let i = 0; i < h.length; i += 2) s += String.fromCharCode(parseInt(h.slice(i, i + 2), 16)); return btoa(s) }

/** Parse a checksum file (sha256sum / md5sum / BSD style) into name -> hash. */
export function parseChecksumList(text: string): { name: string; hash: string; algo?: string }[] {
  const out: { name: string; hash: string; algo?: string }[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    let m = line.match(/^([A-Za-z0-9-]+)\s*\((.+)\)\s*=\s*([0-9a-fA-F]+)$/)
    if (m) { out.push({ algo: m[1], name: m[2], hash: m[3].toLowerCase() }); continue }
    m = line.match(/^([0-9a-fA-F]{8,})\s+[ *]?(.+)$/)
    if (m) { out.push({ name: m[2].trim(), hash: m[1].toLowerCase() }); continue }
    m = line.match(/^([0-9a-fA-F]{8,})$/)
    if (m) out.push({ name: '', hash: m[1].toLowerCase() })
  }
  return out
}

/** Guess candidate algorithms from a hex digest length. */
export function algosForLength(hexLen: number): string[] {
  return HASH_ALGOS.filter((a) => a.bits / 4 === hexLen).map((a) => a.id)
}
