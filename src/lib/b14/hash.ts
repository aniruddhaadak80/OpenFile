/* Streamed file hashing with hash-wasm (MIT), so multi GB files never load into memory at once. */
import type { Algo } from './archive'

export async function hashFile(f: Blob, algo: Algo, onProgress?: (p: number) => void, signal?: { aborted: boolean }): Promise<string> {
  const h = await import('hash-wasm')
  const hasher = algo === 'md5' ? await h.createMD5() : algo === 'sha1' ? await h.createSHA1() : algo === 'sha256' ? await h.createSHA256() : algo === 'sha512' ? await h.createSHA512() : await h.createCRC32()
  hasher.init()
  const CH = 8 * 1024 * 1024
  for (let at = 0; at < f.size; at += CH) {
    if (signal?.aborted) throw Object.assign(new Error('Cancelled'), { name: 'CancelledError' })
    hasher.update(new Uint8Array(await f.slice(at, at + CH).arrayBuffer()))
    onProgress?.(Math.min(1, (at + CH) / Math.max(1, f.size)))
  }
  return hasher.digest('hex')
}
export const ALGOS: { value: Algo; label: string }[] = [{ value: 'sha256', label: 'SHA-256' }, { value: 'sha1', label: 'SHA-1' }, { value: 'md5', label: 'MD5' }, { value: 'sha512', label: 'SHA-512' }, { value: 'crc32', label: 'CRC32 (SFV)' }]
