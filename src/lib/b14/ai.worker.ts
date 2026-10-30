/// <reference lib="webworker" />
/* Round 14 on-device audio AI (Transformers.js, Apache-2.0). Runs off the main thread so the page never freezes. */
import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false
const post = (m: any) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m)
const cache = new Map<string, any>()

async function get(task: string, model: string, device: string, dtype: string | undefined, id: number) {
  const key = `${task}|${model}|${device}|${dtype}`
  if (cache.has(key)) return cache.get(key)
  for (const [k, p] of cache) { try { await p.dispose?.() } catch { /* ignore */ } cache.delete(k) }
  const files = new Map<string, { loaded: number; total: number }>()
  let last = 0
  post({ id, type: 'status', text: 'Getting the AI model ready' })
  const p = await pipeline(task as any, model, {
    device: device as any, dtype: dtype as any,
    progress_callback: (e: any) => {
      if (e.status === 'progress' && e.file) {
        files.set(e.file, { loaded: e.loaded ?? 0, total: e.total ?? 0 })
        let l = 0, t = 0; files.forEach((f) => { l += f.loaded; t += f.total })
        const now = Date.now(); if (now - last < 200 && l < t) return; last = now
        post({ id, type: 'load', loaded: l, total: t })
      }
    },
  })
  cache.set(key, p)
  return p
}

self.onmessage = async (ev: MessageEvent) => {
  const { id, task, model, device, dtype, input, options = {} } = ev.data
  try {
    if (task !== 'audio-classification') throw new Error('Unknown task ' + task)
    const p = await get(task, model, device, dtype, id)
    post({ id, type: 'ready' })
    const pcm: Float32Array = input
    const sr = 16000, win = Math.max(1, options.win ?? 5) * sr
    const n = Math.max(1, Math.ceil(pcm.length / win))
    const out: { start: number; labels: { label: string; score: number }[] }[] = []
    for (let i = 0; i < n; i++) {
      const seg = pcm.subarray(i * win, Math.min(pcm.length, (i + 1) * win))
      // skip near silent windows, they only return "Silence"
      let e = 0; for (let k = 0; k < seg.length; k += 8) e += seg[k] * seg[k]
      if (seg.length < sr * 0.5 || e / (seg.length / 8) < 1e-7) { out.push({ start: i * (options.win ?? 5), labels: [{ label: 'Silence', score: 1 }] }); post({ id, type: 'progress', done: i + 1, total: n }); continue }
      const r: any[] = await p(seg, { top_k: options.topK ?? 5 })
      out.push({ start: i * (options.win ?? 5), labels: r.map((x) => ({ label: x.label, score: x.score })) })
      post({ id, type: 'progress', done: i + 1, total: n })
    }
    post({ id, type: 'done', result: out })
  } catch (e: any) {
    post({ id, type: 'error', message: e?.message || String(e) })
  }
}
