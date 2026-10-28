/* Password-based encryption container + OpenSSL compatible mode (pure, Web Crypto). */
export type EncAlgo = 'aes-gcm' | 'aes-cbc' | 'chacha20'
const MAGIC = [0x4f, 0x46, 0x45, 0x31] // "OFE1"
const ALGO_ID: Record<EncAlgo, number> = { 'aes-gcm': 1, 'aes-cbc': 2, chacha20: 3 }
const ID_ALGO: Record<number, EncAlgo> = { 1: 'aes-gcm', 2: 'aes-cbc', 3: 'chacha20' }
const subtle = () => globalThis.crypto.subtle
const te = new TextEncoder()
const buf = (u: Uint8Array) => u as unknown as BufferSource

export async function pbkdf2(password: string, salt: Uint8Array, iterations: number, bytes: number, hash = 'SHA-256'): Promise<Uint8Array> {
  const k = await subtle().importKey('raw', buf(te.encode(password)), 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await subtle().deriveBits({ name: 'PBKDF2', salt: buf(salt), iterations, hash }, k, bytes * 8))
}

async function rawEncrypt(algo: EncAlgo, key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  if (algo === 'chacha20') { const { chacha20poly1305 } = await import('@noble/ciphers/chacha.js'); return chacha20poly1305(key, iv).encrypt(data) }
  const name = algo === 'aes-gcm' ? 'AES-GCM' : 'AES-CBC'
  const k = await subtle().importKey('raw', buf(key), name, false, ['encrypt'])
  return new Uint8Array(await subtle().encrypt({ name, iv: buf(iv) }, k, buf(data)))
}
async function rawDecrypt(algo: EncAlgo, key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  if (algo === 'chacha20') { const { chacha20poly1305 } = await import('@noble/ciphers/chacha.js'); return chacha20poly1305(key, iv).decrypt(data) }
  const name = algo === 'aes-gcm' ? 'AES-GCM' : 'AES-CBC'
  const k = await subtle().importKey('raw', buf(key), name, false, ['decrypt'])
  return new Uint8Array(await subtle().decrypt({ name, iv: buf(iv) }, k, buf(data)))
}

const ivLen = (a: EncAlgo) => (a === 'aes-cbc' ? 16 : 12)

/** Layout: magic(4) algo(1) kdf(1)=1 iterations(4 BE) salt(16) iv(12|16) ciphertext */
export async function encryptBytes(data: Uint8Array, password: string, algo: EncAlgo = 'aes-gcm', iterations = 310000): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16)); const iv = crypto.getRandomValues(new Uint8Array(ivLen(algo)))
  const key = await pbkdf2(password, salt, iterations, 32)
  const ct = await rawEncrypt(algo, key, iv, data)
  const out = new Uint8Array(10 + 16 + iv.length + ct.length)
  out.set(MAGIC, 0); out[4] = ALGO_ID[algo]; out[5] = 1
  new DataView(out.buffer).setUint32(6, iterations)
  out.set(salt, 10); out.set(iv, 26); out.set(ct, 26 + iv.length)
  return out
}

export function isContainer(b: Uint8Array) { return b.length > 30 && MAGIC.every((x, i) => b[i] === x) }
export function isOpenSsl(b: Uint8Array) { return b.length >= 16 && new TextDecoder().decode(b.slice(0, 8)) === 'Salted__' }

export async function decryptBytes(b: Uint8Array, password: string): Promise<{ data: Uint8Array; algo: EncAlgo | 'openssl' }> {
  if (isOpenSsl(b)) return { data: await opensslDecrypt(b, password), algo: 'openssl' }
  if (!isContainer(b)) throw new Error('This does not look like data encrypted by this tool or by OpenSSL (enc -pbkdf2).')
  const algo = ID_ALGO[b[4]]; if (!algo) throw new Error('Unknown cipher in header.')
  const iterations = new DataView(b.buffer, b.byteOffset).getUint32(6)
  const salt = b.slice(10, 26); const iv = b.slice(26, 26 + ivLen(algo)); const ct = b.slice(26 + ivLen(algo))
  const key = await pbkdf2(password, salt, iterations, 32)
  try { return { data: await rawDecrypt(algo, key, iv, ct), algo } } catch { throw new Error('Wrong password, or the data was changed.') }
}

/** openssl enc -aes-256-cbc -pbkdf2 -iter N (default 10000) -md sha256 */
export async function opensslEncrypt(data: Uint8Array, password: string, iter = 10000): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(8))
  const kiv = await pbkdf2(password, salt, iter, 48)
  const ct = await rawEncrypt('aes-cbc', kiv.slice(0, 32), kiv.slice(32), data)
  const out = new Uint8Array(16 + ct.length); out.set(te.encode('Salted__')); out.set(salt, 8); out.set(ct, 16)
  return out
}
export async function opensslDecrypt(b: Uint8Array, password: string, iter = 10000): Promise<Uint8Array> {
  const salt = b.slice(8, 16); const kiv = await pbkdf2(password, salt, iter, 48)
  try { return await rawDecrypt('aes-cbc', kiv.slice(0, 32), kiv.slice(32), b.slice(16)) } catch { throw new Error('Wrong password, or the file uses different OpenSSL options (this reads -aes-256-cbc -pbkdf2 with 10000 iterations).') }
}

export const toB64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s) }
export const fromB64 = (s: string) => Uint8Array.from(atob(s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
