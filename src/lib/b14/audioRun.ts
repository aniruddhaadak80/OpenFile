/* Client for the audio analysis worker, with cancel. */
let worker: Worker | null = null
let seq = 0
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void; onProgress?: (p: number) => void }>()
function w() {
  if (!worker) {
    worker = new Worker(new URL('./audio.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e) => { const m = e.data, p = pending.get(m.id); if (!p) return; if (m.type === 'progress') p.onProgress?.(m.p); else if (m.type === 'done') { pending.delete(m.id); p.resolve(m.result) } else if (m.type === 'error') { pending.delete(m.id); p.reject(new Error(m.message)) } }
    worker.onerror = (e) => { pending.forEach((p) => p.reject(new Error(e.message || 'The analysis stopped'))); pending.clear(); worker?.terminate(); worker = null }
  }
  return worker
}
export function analyse<T>(op: 'loudness' | 'bpm', chans: Float32Array[], sampleRate: number, opts: any = {}, onProgress?: (p: number) => void): Promise<T> {
  const id = ++seq
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject, onProgress }); const copy = chans.map((c) => c.slice()); w().postMessage({ id, op, chans: copy, sampleRate, opts }, copy.map((c) => c.buffer)) })
}
export function cancelAnalysis() { worker?.terminate(); worker = null; pending.forEach((p) => p.reject(Object.assign(new Error('Cancelled'), { name: 'CancelledError' }))); pending.clear() }
