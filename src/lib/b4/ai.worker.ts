/// <reference lib="webworker" />
/* On-device text AI (Transformers.js, Apache-2.0) in a Web Worker: translation (NLLB-200), summarization (DistilBART),
 * instruction-following chat (Qwen2.5 Instruct) and sentence embeddings (MiniLM). Models download once and are cached. */
import { pipeline, env, TextStreamer } from '@huggingface/transformers'

env.allowLocalModels = false
const post = (m: any) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m)
const cache = new Map<string, any>()

async function get(task: string, model: string, device: string, dtype: string | undefined, id: number) {
  const key = `${task}|${model}|${device}|${dtype}`
  if (cache.has(key)) return cache.get(key)
  // keep memory low: drop other pipelines of the same task
  for (const [k, p] of cache) if (k.startsWith(task + '|')) { try { await p.dispose?.() } catch { /* ignore */ } cache.delete(k) }
  const files = new Map<string, { loaded: number; total: number }>()
  // Transformers.js reports every downloaded chunk (thousands for a 500 MB model). Posting each one floods the page
  // with messages and re-renders, which can make the tab stop responding on slow CPUs, so updates go out 5 times a second.
  let last = 0
  const p = await pipeline(task as any, model, {
    device: device as any, dtype: dtype as any,
    progress_callback: (e: any) => {
      if (e.status === 'progress' && e.file) { files.set(e.file, { loaded: e.loaded ?? 0, total: e.total ?? 0 }); let l = 0, t = 0; files.forEach((f) => { l += f.loaded; t += f.total }); const now = Date.now(); if (now - last < 200 && l < t) return; last = now; post({ id, type: 'load', loaded: l, total: t, file: e.file }) }
      else if (e.status === 'initiate') post({ id, type: 'status', text: `Downloading ${e.file}` })
      // after the last file arrives ONNX Runtime still has to build the model, which takes a while on a CPU; say so instead of
      // leaving the last "Downloading <file>" line on screen
      else if (e.status === 'done') post({ id, type: 'status', text: 'Preparing the model. On a CPU this can take a minute or two.' })
    },
  })
  cache.set(key, p)
  return p
}

self.onmessage = async (ev: MessageEvent) => {
  const { id, task, model, device, dtype, input, options } = ev.data
  try {
    if (task === 'translation') {
      const p = await get('translation', model, device, dtype, id)
      post({ id, type: 'ready' })
      const texts: string[] = input
      const out: string[] = []
      for (let i = 0; i < texts.length; i++) {
        const t = texts[i]
        if (!t.trim()) { out.push(t); continue }
        const r: any = await p(t, { src_lang: options.src, tgt_lang: options.tgt, max_new_tokens: Math.min(512, Math.ceil(t.length / 2) + 40) })
        out.push((Array.isArray(r) ? r[0] : r).translation_text)
        post({ id, type: 'progress', done: i + 1, total: texts.length, partial: out[out.length - 1] })
      }
      post({ id, type: 'done', result: out }); return
    }
    if (task === 'summarization') {
      const p = await get('summarization', model, device, dtype, id)
      post({ id, type: 'ready' })
      const chunks: string[] = input
      const out: string[] = []
      for (let i = 0; i < chunks.length; i++) {
        const r: any = await p(chunks[i], { max_new_tokens: options.max ?? 140, min_length: options.min ?? 30, no_repeat_ngram_size: 3 })
        out.push((Array.isArray(r) ? r[0] : r).summary_text.trim())
        post({ id, type: 'progress', done: i + 1, total: chunks.length, partial: out[out.length - 1] })
      }
      post({ id, type: 'done', result: out }); return
    }
    if (task === 'text-generation') {
      const p = await get('text-generation', model, device, dtype, id)
      post({ id, type: 'ready' })
      const streamer = new TextStreamer(p.tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: (t: string) => post({ id, type: 'token', text: t }) })
      const r: any = await p(input, { max_new_tokens: options.max ?? 512, do_sample: false, repetition_penalty: 1.1, streamer })
      const g = (Array.isArray(r) ? r[0] : r).generated_text
      post({ id, type: 'done', result: Array.isArray(g) ? g.at(-1).content : String(g) }); return
    }
    if (task === 'feature-extraction') {
      const p = await get('feature-extraction', model, device, dtype, id)
      post({ id, type: 'ready' })
      const texts: string[] = input
      const vecs: number[][] = []
      const B = 16
      for (let i = 0; i < texts.length; i += B) {
        const t: any = await p(texts.slice(i, i + B), { pooling: 'mean', normalize: true })
        vecs.push(...(t.tolist() as number[][]))
        post({ id, type: 'progress', done: Math.min(texts.length, i + B), total: texts.length })
      }
      post({ id, type: 'done', result: vecs }); return
    }
    throw new Error('Unknown task ' + task)
  } catch (e: any) {
    post({ id, type: 'error', message: e?.message || String(e) })
  }
}
