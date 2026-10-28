/* On-device ONNX model loader shared by the AI image tools (Batch 2).
   onnxruntime-web (MIT) with WebGPU when available and a WebAssembly fallback. Model files are cached
   in the browser Cache Storage so they download only once. */
import wasmUrl from '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url'
import mjsUrl from '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url'

export type Ort = typeof import('onnxruntime-web/webgpu')
let ortP: Promise<Ort> | null = null
export function loadOrt(): Promise<Ort> {
  if (!ortP) {
    ortP = (async () => {
      const ort: any = await import('onnxruntime-web/webgpu')
      ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl }
      ort.env.wasm.numThreads = (self as any).crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1
      return ort as Ort
    })()
    ortP.catch(() => { ortP = null })
  }
  return ortP
}

const CACHE = 'openfile-models-v1'

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

export async function isModelCached(url: string) { try { return !!(await (await caches.open(CACHE)).match(url)) } catch { return false } }

const sessions = new Map<string, Promise<{ session: any; ort: Ort; backend: string }>>()
/** Create (or reuse) an inference session. Tries WebGPU first, then WASM. */
export function getSession(url: string, onProgress?: (loaded: number, total: number) => void) {
  let s = sessions.get(url)
  if (!s) {
    s = (async () => {
      const ort = await loadOrt()
      const bytes = await fetchModel(url, onProgress)
      const tries: string[] = (navigator as any).gpu ? ['webgpu', 'wasm'] : ['wasm']
      let last: any
      for (const ep of tries) {
        try { const session = await (ort as any).InferenceSession.create(bytes, { executionProviders: [ep], graphOptimizationLevel: 'all' }); return { session, ort, backend: ep } }
        catch (e) { last = e }
      }
      throw new Error('This device could not run the AI model: ' + (last?.message || last))
    })()
    s.catch(() => sessions.delete(url))
    sessions.set(url, s)
  }
  return s
}

/** Canvas -> planar float tensor data [1,3,H,W] in 0..1 (or custom normalisation). */
export function toCHW(c: HTMLCanvasElement, norm: (v: number, ch: number) => number = (v) => v / 255): Float32Array {
  const { width: w, height: h } = c
  const d = c.getContext('2d')!.getImageData(0, 0, w, h).data
  const out = new Float32Array(3 * w * h)
  for (let i = 0; i < w * h; i++) { out[i] = norm(d[i * 4], 0); out[w * h + i] = norm(d[i * 4 + 1], 1); out[2 * w * h + i] = norm(d[i * 4 + 2], 2) }
  return out
}
export function fromCHW(data: Float32Array, w: number, h: number, denorm: (v: number, ch: number) => number = (v) => v): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d')!, id = ctx.createImageData(w, h)
  for (let i = 0; i < w * h; i++) { id.data[i * 4] = denorm(data[i], 0); id.data[i * 4 + 1] = denorm(data[w * h + i], 1); id.data[i * 4 + 2] = denorm(data[2 * w * h + i], 2); id.data[i * 4 + 3] = 255 }
  ctx.putImageData(id, 0, 0)
  return c
}
