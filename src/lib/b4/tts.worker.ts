/// <reference lib="webworker" />
/* Kokoro 82M text to speech (kokoro-js, Apache-2.0) in a Web Worker so long documents do not freeze the page. */
import { KokoroTTS } from 'kokoro-js'

const post = (m: any, t?: Transferable[]) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, t ?? [])
let tts: KokoroTTS | null = null
let key = ''

self.onmessage = async (ev: MessageEvent) => {
  const { id, texts, voice, speed, device } = ev.data
  try {
    if (!tts || key !== device) {
      const files = new Map<string, { loaded: number; total: number }>()
      let lastPost = 0
      tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
        dtype: device === 'webgpu' ? 'fp32' : 'q8', device,
        progress_callback: (e: any) => { if (e.status === 'progress' && e.file) { files.set(e.file, { loaded: e.loaded ?? 0, total: e.total ?? 0 }); let l = 0, t = 0; files.forEach((f) => { l += f.loaded; t += f.total }); const now = Date.now(); if (now - lastPost < 200 && l < t) return; lastPost = now; post({ id, type: 'load', loaded: l, total: t }) } },
      })
      key = device
    }
    post({ id, type: 'ready' })
    for (let i = 0; i < texts.length; i++) {
      const a: any = await tts.generate(texts[i], { voice, speed })
      const pcm = (Array.isArray(a.audio) ? a.audio[0] : a.audio) as Float32Array
      const copy = new Float32Array(pcm)
      post({ id, type: 'chunk', index: i, total: texts.length, pcm: copy, sr: a.sampling_rate }, [copy.buffer])
    }
    post({ id, type: 'done' })
  } catch (e: any) { post({ id, type: 'error', message: e?.message || String(e) }) }
}
