/* Model download with progress and Cache Storage, shared by the main thread and the ONNX worker. */
export const CACHE = 'openfile-models-v1'

/** Download a model with progress, caching it for next time. */
export async function fetchModel(url: string, onProgress?: (loaded: number, total: number) => void): Promise<Uint8Array> {
  try {
    const cache = await caches.open(CACHE)
    const hit = await cache.match(url)
    if (hit) { const b = new Uint8Array(await hit.arrayBuffer()); onProgress?.(b.length, b.length); return b }
  } catch { /* Cache Storage not available (private mode) */ }
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Could not download the AI model (${res.status}). Check your connection and try again.`)
  const total = Number(res.headers.get('content-length')) || 0
  const reader = res.body.getReader(); const parts: Uint8Array[] = []; let loaded = 0
  for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); loaded += value.length; onProgress?.(loaded, total) }
  const out = new Uint8Array(loaded); let o = 0; for (const p of parts) { out.set(p, o); o += p.length }
  try { const cache = await caches.open(CACHE); await cache.put(url, new Response(out.slice().buffer, { headers: { 'content-type': 'application/octet-stream' } })) } catch { /* quota */ }
  return out
}
