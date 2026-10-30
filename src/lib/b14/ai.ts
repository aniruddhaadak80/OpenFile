/* Round 14 local AI: a small worker client for audio classification, a GPU to CPU retry helper,
 * and pure helpers for near duplicate detection (shingles, Jaccard, clustering). */

/* ---------------- pure helpers (tested) ---------------- */
export function normText(s: string) { return s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim() }
/** Word shingles (k words) as a set of hashes. */
export function shingles(s: string, k = 3): Set<number> {
  const w = normText(s).split(' ').filter(Boolean)
  const out = new Set<number>()
  if (w.length < k) { if (w.length) out.add(hash(w.join(' '))); return out }
  for (let i = 0; i + k <= w.length; i++) out.add(hash(w.slice(i, i + k).join(' ')))
  return out
}
function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0 }
export function jaccard(a: Set<number>, b: Set<number>) { if (!a.size && !b.size) return 1; let n = 0; const [s, l] = a.size < b.size ? [a, b] : [b, a]; for (const x of s) if (l.has(x)) n++; return n / (a.size + b.size - n) }
export const cosineSim = (a: number[], b: number[]) => { let s = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] } return s / (Math.sqrt(na * nb) || 1) }
/** Group items whose pairwise similarity is at least `min` (union find). Returns groups of 2 or more, with the best pair score. */
export function clusterPairs(n: number, sim: (i: number, j: number) => number, min: number) {
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])))
  const pairs: { i: number; j: number; s: number }[] = []
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const s = sim(i, j); if (s >= min) { pairs.push({ i, j, s }); parent[find(i)] = find(j) } }
  const groups = new Map<number, number[]>()
  for (let i = 0; i < n; i++) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r)!.push(i) }
  return { pairs: pairs.sort((a, b) => b.s - a.s), groups: [...groups.values()].filter((g) => g.length > 1) }
}
/** Split text into items: by blank lines (paragraphs), by line, or by sentence. */
export function splitItems(text: string, by: 'line' | 'paragraph' | 'sentence'): string[] {
  const t = text.replace(/\r/g, '')
  const parts = by === 'line' ? t.split('\n') : by === 'paragraph' ? t.split(/\n\s*\n/) : t.split(/(?<=[.!?])\s+(?=[\p{Lu}\d"'(])/u)
  return parts.map((s) => s.trim()).filter(Boolean)
}

/* ---------------- GPU to CPU retry ---------------- */
/** Run on WebGPU first; if the GPU path fails (driver, memory, adapter lost), say so and retry on the CPU worker. */
export async function withCpuFallback<T>(device: 'wasm' | 'webgpu', go: (d: 'wasm' | 'webgpu') => Promise<T>, onFallback?: (msg: string) => void): Promise<T> {
  try { return await go(device) } catch (e: any) {
    if (device !== 'webgpu' || e?.name === 'CancelledError') throw e
    onFallback?.('The GPU could not run this model, so it is running on the CPU instead. This is slower but works.')
    return go('wasm')
  }
}

/* ---------------- audio worker client ---------------- */
export interface AudioModel { id: string; label: string; size: string; dtype: Partial<Record<'wasm' | 'webgpu', string>> }
export const SOUND_MODEL: AudioModel = { id: 'Xenova/ast-finetuned-audioset-10-10-0.4593', label: 'Audio Spectrogram Transformer (527 AudioSet sounds)', size: 'about 90 MB', dtype: { wasm: 'q8', webgpu: 'fp32' } }
export interface Cb { onLoad?: (l: number, t: number) => void; onStatus?: (s: string) => void; onReady?: () => void; onProgress?: (d: number, t: number) => void }
let worker: Worker | null = null
let seq = 0
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void; cb: Cb }>()
function w() {
  if (!worker) {
    worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e) => {
      const m = e.data, p = pending.get(m.id); if (!p) return
      if (m.type === 'load') p.cb.onLoad?.(m.loaded, m.total)
      else if (m.type === 'status') p.cb.onStatus?.(m.text)
      else if (m.type === 'ready') p.cb.onReady?.()
      else if (m.type === 'progress') p.cb.onProgress?.(m.done, m.total)
      else if (m.type === 'done') { pending.delete(m.id); p.resolve(m.result) }
      else if (m.type === 'error') { pending.delete(m.id); p.reject(new Error(m.message)) }
    }
    worker.onerror = (e) => { const err = new Error(e.message || 'The AI worker stopped'); pending.forEach((p) => p.reject(err)); pending.clear(); worker?.terminate(); worker = null }
  }
  return worker
}
export function cancelAudioAi() { worker?.terminate(); worker = null; pending.forEach((p) => p.reject(Object.assign(new Error('Cancelled'), { name: 'CancelledError' }))); pending.clear() }
/** Classify sounds in windows of `win` seconds. `pcm` is mono 16 kHz. */
export function classifySound(pcm: Float32Array, o: { device: 'wasm' | 'webgpu'; win: number; topK: number }, cb: Cb = {}): Promise<{ start: number; labels: { label: string; score: number }[] }[]> {
  const id = ++seq
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, cb })
    const copy = pcm.slice()
    w().postMessage({ id, task: 'audio-classification', model: SOUND_MODEL.id, device: o.device, dtype: SOUND_MODEL.dtype[o.device], input: copy, options: { win: o.win, topK: o.topK } }, [copy.buffer])
  })
}
