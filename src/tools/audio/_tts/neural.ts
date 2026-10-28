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

export const neuralLoaded = () => modelPromise !== null

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
