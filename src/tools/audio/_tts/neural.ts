// In-browser neural text to speech (Kokoro 82M, Apache-2.0) via kokoro-js and Transformers.js.
// Loaded only when used. The model (about 90 MB at q8) and the voice files are cached by the browser,
// so later sessions start quickly and work offline.
import type { KokoroTTS } from 'kokoro-js'

export const NEURAL_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'

export const NEURAL_VOICES: { id: string; name: string; accent: 'US' | 'UK'; gender: 'Female' | 'Male' }[] = [
  { id: 'af_heart', name: 'Heart', accent: 'US', gender: 'Female' },
  { id: 'af_bella', name: 'Bella', accent: 'US', gender: 'Female' },
  { id: 'af_nicole', name: 'Nicole', accent: 'US', gender: 'Female' },
  { id: 'af_sarah', name: 'Sarah', accent: 'US', gender: 'Female' },
  { id: 'af_kore', name: 'Kore', accent: 'US', gender: 'Female' },
  { id: 'am_michael', name: 'Michael', accent: 'US', gender: 'Male' },
  { id: 'am_fenrir', name: 'Fenrir', accent: 'US', gender: 'Male' },
  { id: 'am_puck', name: 'Puck', accent: 'US', gender: 'Male' },
  { id: 'bf_emma', name: 'Emma', accent: 'UK', gender: 'Female' },
  { id: 'bf_isabella', name: 'Isabella', accent: 'UK', gender: 'Female' },
  { id: 'bm_george', name: 'George', accent: 'UK', gender: 'Male' },
  { id: 'bm_fable', name: 'Fable', accent: 'UK', gender: 'Male' },
]

export type LoadProgress = { loaded: number; total: number; file?: string; status: string }

let modelPromise: Promise<KokoroTTS> | null = null
let deviceUsed: 'webgpu' | 'wasm' = 'wasm'
export const neuralDevice = () => deviceUsed

async function hasWebGPU() {
  try { const g = (navigator as any).gpu; return !!(g && (await g.requestAdapter())) } catch { return false }
}

/** Load (once) and return the model. `onProgress` gets byte totals across all files. */
export function loadNeural(onProgress?: (p: LoadProgress) => void): Promise<KokoroTTS> {
  if (modelPromise) return modelPromise
  modelPromise = (async () => {
    const { KokoroTTS } = await import('kokoro-js')
    const files = new Map<string, { loaded: number; total: number }>()
    const report = (status: string, file?: string) => {
      let loaded = 0, total = 0
      files.forEach((f) => { loaded += f.loaded; total += f.total })
      onProgress?.({ loaded, total, file, status })
    }
    const progress_callback = (e: any) => {
      if (e?.status === 'progress' && e.file) { files.set(e.file, { loaded: e.loaded ?? 0, total: e.total ?? 0 }); report('downloading', e.file) }
      else if (e?.status === 'done' && e.file) { const f = files.get(e.file); if (f) f.loaded = f.total; report('downloading', e.file) }
      else if (e?.status === 'ready') report('ready')
    }
    const gpu = await hasWebGPU()
    try {
      deviceUsed = gpu ? 'webgpu' : 'wasm'
      return await KokoroTTS.from_pretrained(NEURAL_MODEL, { dtype: gpu ? 'fp32' : 'q8', device: deviceUsed, progress_callback })
    } catch (err) {
      if (!gpu) throw err
      deviceUsed = 'wasm'
      return await KokoroTTS.from_pretrained(NEURAL_MODEL, { dtype: 'q8', device: 'wasm', progress_callback })
    }
  })()
  modelPromise.catch(() => { modelPromise = null })
  return modelPromise
}

export const neuralLoaded = () => modelPromise !== null || speechPromise !== null

/** What the tools call: one sentence in, mono samples out. */
export type SpeechEngine = { generate: (text: string, o: { voice: any; speed?: number }) => Promise<{ audio: Float32Array; sampling_rate: number }> }

let speechPromise: Promise<SpeechEngine> | null = null
let workerBroken = false
/** How long a new speech worker may stay silent before the on-page engine takes over. */
export const WORKER_SILENT_MS = 25000

/** Kokoro in a background worker, so a long text does not freeze the page (on a CPU one sentence blocked the page
 *  for 30 s or more when it ran here). Some browsers once left that worker silent at 0%, so if it says nothing
 *  within WORKER_SILENT_MS, or fails to start, this falls back to the on-page engine for the rest of the session. */
export function loadSpeech(onProgress?: (p: LoadProgress) => void): Promise<SpeechEngine> {
  if (workerBroken || typeof Worker === 'undefined') return loadNeural(onProgress)
  if (speechPromise) return speechPromise
  speechPromise = (async (): Promise<SpeechEngine> => {
    const gpu = await hasWebGPU()
    const device = gpu ? 'webgpu' : 'wasm'
    const { makeTtsWorker } = await import('@/lib/b4/tts')
    let w: Worker
    try { w = makeTtsWorker() } catch { workerBroken = true; return loadNeural(onProgress) }
    const handlers = new Map<number, (m: any) => void>()
    let seq = 0
    w.onmessage = (e) => handlers.get(e.data?.id)?.(e.data)
    const fail = (why: string) => { for (const h of handlers.values()) h({ type: 'error', message: why }) }
    w.onerror = (e) => { e.preventDefault?.(); workerBroken = true; fail('the speech worker stopped') }
    // warm up: load the model with no text, so a stall shows up before any sentence is queued
    const warm = await new Promise<boolean>((resolve) => {
      const id = ++seq
      let timer = setTimeout(() => resolve(false), WORKER_SILENT_MS)
      handlers.set(id, (m) => {
        clearTimeout(timer); timer = setTimeout(() => resolve(false), WORKER_SILENT_MS * 6)
        if (m.type === 'load') onProgress?.({ loaded: m.loaded, total: m.total, status: 'downloading' })
        else if (m.type === 'ready') onProgress?.({ loaded: 0, total: 0, status: 'ready' })
        else if (m.type === 'done') { clearTimeout(timer); handlers.delete(id); resolve(true) }
        else if (m.type === 'error') { clearTimeout(timer); handlers.delete(id); resolve(false) }
      })
      w.postMessage({ id, texts: [], voice: 'af_heart', speed: 1, device })
    })
    if (!warm) { w.terminate(); workerBroken = true; return loadNeural(onProgress) }
    deviceUsed = device
    return {
      generate: (text, o) => new Promise((resolve, reject) => {
        const id = ++seq
        let out: { audio: Float32Array; sampling_rate: number } | null = null
        handlers.set(id, (m) => {
          if (m.type === 'chunk') out = { audio: m.pcm, sampling_rate: m.sr }
          else if (m.type === 'done') { handlers.delete(id); out ? resolve(out) : reject(new Error('No audio came back for this sentence.')) }
          else if (m.type === 'error') { handlers.delete(id); if (workerBroken) speechPromise = null; reject(new Error(m.message)) }
        })
        w.postMessage({ id, texts: [text], voice: o.voice, speed: o.speed ?? 1, device })
      }),
    }
  })()
  speechPromise.catch(() => { speechPromise = null })
  return speechPromise
}

/** Encode mono float samples as a 16-bit PCM WAV file. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, samples.length * 2, true)
  let o = 44
  for (let i = 0; i < samples.length; i++, o += 2) { const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true) }
  return new Blob([buf], { type: 'audio/wav' })
}

export function concatFloat(parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
