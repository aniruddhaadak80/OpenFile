/* On-device ONNX models for the AI image tools (Batch 2): onnxruntime-web (MIT) runs in a background worker
   (onnx.worker.ts) with WebGPU when available and a WebAssembly fallback. Model files are cached in the browser
   Cache Storage so they download only once. */
import { fetchModel, CACHE } from './onnxfetch'
export { fetchModel }

export async function isModelCached(url: string) { try { return !!(await (await caches.open(CACHE)).match(url)) } catch { return false } }

export interface OnnxOut { outputs: Record<string, { data: Float32Array; dims: number[] }>; names: string[] }
let worker: Worker | null = null
let seq = 0
const pending = new Map<number, { resolve: (v: OnnxOut) => void; reject: (e: any) => void; onLoad?: (l: number, t: number) => void; onReady?: (backend: string) => void; onStatus?: (s: string) => void }>()
/** Run a model in the background worker. Feeds without a name use the model's inputs in order. */
export function runModel(url: string, feeds: { name?: string; type: 'float32'; data: Float32Array; dims: number[] }[], cb: { onLoad?: (l: number, t: number) => void; onReady?: (backend: string) => void; onStatus?: (s: string) => void } = {}): Promise<OnnxOut> {
  if (!worker) {
    worker = new Worker(new URL('./onnx.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e) => {
      const m = e.data, p = pending.get(m.id); if (!p) return
      if (m.type === 'load') p.onLoad?.(m.loaded, m.total)
      else if (m.type === 'status') p.onStatus?.(m.text)
      else if (m.type === 'ready') p.onReady?.(m.backend)
      else if (m.type === 'done') { pending.delete(m.id); p.resolve({ outputs: m.outputs, names: m.names }) }
      else if (m.type === 'error') { pending.delete(m.id); p.reject(new Error(/memory|allocation|bad_alloc/i.test(m.message) ? 'The browser ran out of memory while running the AI model. Close other tabs and try again.' : m.message)) }
    }
    worker.onerror = (e) => { const err = new Error('The AI model stopped: ' + (e.message || 'the background worker crashed')); pending.forEach((p) => p.reject(err)); pending.clear(); worker?.terminate(); worker = null }
  }
  const id = ++seq
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject, ...cb }); worker!.postMessage({ id, url, feeds }) })
}
/** Stop the running model at once by ending the worker. Pending runs reject with a CancelledError. */
export function cancelModel() { worker?.terminate(); worker = null; pending.forEach((p) => p.reject(Object.assign(new Error('Cancelled'), { name: 'CancelledError' }))); pending.clear() }

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
