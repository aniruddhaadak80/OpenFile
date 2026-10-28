/* Shared loader for the ffmpeg.wasm core files.
 * Tries the copy bundled with OpenFile first (same origin, works offline once cached),
 * then two public CDNs. Progress is read from the stream without trusting Content-Length,
 * because CDNs often serve the .wasm compressed and the header then reports the compressed size. */
const SOURCES = [
  `${import.meta.env.BASE_URL}ffmpeg`,
  'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm',
  'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm',
]
export const CORE_WASM_SIZE = 32_232_419

async function blobURL(url: string, type: string, onBytes?: (n: number) => void): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  if (!res.body || !onBytes) return URL.createObjectURL(new Blob([await res.arrayBuffer()], { type }))
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let n = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value); n += value.byteLength; onBytes(n)
  }
  return URL.createObjectURL(new Blob(chunks as BlobPart[], { type }))
}

export async function coreURLs(onBytes?: (received: number) => void): Promise<{ coreURL: string; wasmURL: string }> {
  let last: unknown
  for (const base of SOURCES) {
    try {
      const coreURL = await blobURL(`${base}/ffmpeg-core.js`, 'text/javascript')
      const wasmURL = await blobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm', onBytes)
      return { coreURL, wasmURL }
    } catch (e) { last = e; console.warn('[ffmpeg] source failed', base, e) }
  }
  throw last instanceof Error ? last : new Error(String(last))
}
