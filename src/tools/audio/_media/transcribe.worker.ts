/// <reference lib="webworker" />
/* Whisper speech recognition in a Web Worker (transformers.js). */
import { pipeline, env, WhisperTextStreamer } from '@huggingface/transformers'

env.allowLocalModels = false

type Msg = { type: 'run'; audio: Float32Array; model: string; language: string; task: 'transcribe' | 'translate'; device: 'wasm' | 'webgpu' }
const post = (m: any) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m)

let asr: any = null
let loadedKey = ''

self.onmessage = async (e: MessageEvent<Msg>) => {
  const d = e.data
  if (d.type !== 'run') return
  try {
    const key = `${d.model}|${d.device}`
    if (!asr || loadedKey !== key) {
      try { await asr?.dispose?.() } catch { /* ignore */ }
      asr = null
      post({ type: 'status', text: 'Downloading model…' })
      asr = await pipeline('automatic-speech-recognition', d.model, {
        device: d.device,
        progress_callback: (p: any) => {
          if (p.status === 'progress_total') post({ type: 'load', progress: (p.progress ?? 0) / 100, loaded: p.loaded, total: p.total })
          else if (p.status === 'initiate' || p.status === 'download') post({ type: 'status', text: `Downloading ${p.file ?? 'model'}…` })
        },
      })
      loadedKey = key
    }
    post({ type: 'ready' })

    // progress: count model.generate calls against the number of 30 s windows the pipeline will create
    const sr = 16000, win = 30 * sr, stride = 5 * sr, jump = win - 2 * stride
    const total = d.audio.length <= win ? 1 : 1 + Math.ceil((d.audio.length - win) / jump)
    let done = 0
    const model = asr.model
    const orig = model.generate.bind(model)
    model.generate = async (...args: any[]) => { const r = await orig(...args); done++; post({ type: 'progress', done, total }); return r }

    let streamer: any
    try { streamer = new WhisperTextStreamer(asr.tokenizer, { skip_prompt: true, callback_function: (text: string) => post({ type: 'partial', text }) }) } catch { streamer = undefined }

    const opts: Record<string, any> = { chunk_length_s: 30, stride_length_s: 5, return_timestamps: true, task: d.task }
    if (d.language && d.language !== 'auto') opts.language = d.language
    if (streamer) opts.streamer = streamer
    let out: any
    try { out = await asr(d.audio, opts) }
    finally { model.generate = orig }
    post({ type: 'done', result: Array.isArray(out) ? out[0] : out })
  } catch (err: any) {
    post({ type: 'error', message: err?.message || String(err) })
  }
}
