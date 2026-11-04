/// <reference lib="webworker" />
/* Tokenizers for the AI Builder tools (Transformers.js AutoTokenizer, Apache-2.0). Runs in a worker so long texts
 * never freeze the page. Only the tokenizer files (1 to 8 MB) are downloaded, never model weights. */
import { AutoTokenizer, env } from '@huggingface/transformers'
import { chunkText, type Chunk } from './llm'

env.allowLocalModels = false
const post = (m: any) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m)
const cache = new Map<string, any>()

async function get(model: string, id: number) {
  if (cache.has(model)) return cache.get(model)
  post({ id, type: 'status', text: 'Downloading the tokenizer' })
  const files = new Map<string, { l: number; t: number }>()
  const tk = await AutoTokenizer.from_pretrained(model, {
    progress_callback: (e: any) => {
      if (e.status === 'progress' && e.file) { files.set(e.file, { l: e.loaded ?? 0, t: e.total ?? 0 }); let l = 0, t = 0; files.forEach((f) => { l += f.l; t += f.t }); post({ id, type: 'load', loaded: l, total: t }) }
    },
  })
  cache.clear(); cache.set(model, tk)
  return tk
}
const enc = (tk: any, s: string): number[] => tk.encode(s, { add_special_tokens: false })

self.onmessage = async (ev: MessageEvent) => {
  const { id, type, model } = ev.data
  try {
    const tk = await get(model, id)
    if (type === 'load') post({ id, type: 'done', result: true })
    else if (type === 'count') {
      const ids = enc(tk, ev.data.text)
      const max = ev.data.detail ?? 0
      const pieces = max ? ids.slice(0, max).map((i: number) => tk.decode([i])) : []
      post({ id, type: 'done', result: { count: ids.length, ids: ids.slice(0, max), pieces } })
    } else if (type === 'counts') {
      const texts: string[] = ev.data.texts
      const out: number[] = []
      texts.forEach((s, i) => { out.push(enc(tk, s).length); if (i % 200 === 0) post({ id, type: 'progress', done: i, total: texts.length }) })
      post({ id, type: 'done', result: out })
    } else if (type === 'chunk') {
      const chunks: Chunk[] = chunkText(ev.data.text, { ...ev.data.opts, measure: (s: string) => enc(tk, s).length })
      post({ id, type: 'done', result: chunks })
    }
  } catch (e: any) { post({ id, type: 'error', error: e?.message || String(e) }) }
}
