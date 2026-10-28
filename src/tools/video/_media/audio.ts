/* Web Audio helpers: decoding, WAV encoding and buffer operations (no dependencies). */
import { ffRun, extFromBlob } from './engine'

let shared: AudioContext | null = null
export function audioCtx(): AudioContext {
  if (!shared || shared.state === 'closed') shared = new (window.AudioContext || (window as any).webkitAudioContext)()
  return shared
}

/** Decode any audio (or video with audio) into an AudioBuffer. Falls back to ffmpeg for formats the browser can't decode. */
export async function decodeAudioFile(file: Blob, opts: { sampleRate?: number; onFallback?: () => void; onProgress?: (p: number) => void } = {}): Promise<AudioBuffer> {
  const ctx: BaseAudioContext = opts.sampleRate ? new OfflineAudioContext(1, 1, opts.sampleRate) : audioCtx()
  try {
    return await ctx.decodeAudioData(await file.arrayBuffer())
  } catch {
    opts.onFallback?.()
    const wav = await ffRun({ inputs: [{ name: 'in' + extFromBlob(file), file }], args: ['-i', 'in' + extFromBlob(file), '-vn', '-ac', '2', '-c:a', 'pcm_s16le', ...(opts.sampleRate ? ['-ar', String(opts.sampleRate)] : []), 'out.wav'], output: 'out.wav', onProgress: opts.onProgress })
    try { return await ctx.decodeAudioData(await wav.arrayBuffer()) } catch { throw new Error('This file has no audio track that can be decoded.') }
  }
}

/** Encode PCM channels to a 16-bit (or 32-bit float) WAV file. */
export function encodeWav(channels: Float32Array[], sampleRate: number, float = false): Blob {
  const n = channels.length, len = channels[0]?.length ?? 0
  const bps = float ? 4 : 2
  const dataSize = len * n * bps
  const buf = new ArrayBuffer(44 + dataSize)
  const v = new DataView(buf)
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); w(8, 'WAVE'); w(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, float ? 3 : 1, true); v.setUint16(22, n, true)
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * n * bps, true); v.setUint16(32, n * bps, true); v.setUint16(34, bps * 8, true)
  w(36, 'data'); v.setUint32(40, dataSize, true)
  let o = 44
  if (float) { for (let i = 0; i < len; i++) for (let c = 0; c < n; c++) { v.setFloat32(o, channels[c][i], true); o += 4 } }
  else {
    for (let i = 0; i < len; i++) for (let c = 0; c < n; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]))
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2
    }
  }
  return new Blob([buf], { type: 'audio/wav' })
}
export const bufferToWav = (b: AudioBuffer) => encodeWav(chans(b), b.sampleRate)
export const chans = (b: AudioBuffer) => Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i))

export function makeBuffer(channels: Float32Array[], sampleRate: number): AudioBuffer {
  const b = new AudioBuffer({ length: Math.max(1, channels[0].length), numberOfChannels: channels.length, sampleRate })
  channels.forEach((c, i) => b.copyToChannel(c as Float32Array<ArrayBuffer>, i))
  return b
}

const map = (b: AudioBuffer, fn: (c: Float32Array, ch: number) => Float32Array) => makeBuffer(chans(b).map((c, i) => fn(c, i)), b.sampleRate)
const idx = (b: AudioBuffer, t: number) => Math.max(0, Math.min(b.length, Math.round(t * b.sampleRate)))

/** Keep only [s, e] seconds. */
export const trimBuffer = (b: AudioBuffer, s: number, e: number) => map(b, (c) => c.slice(idx(b, s), idx(b, e)))
/** Remove [s, e] seconds. */
export const deleteRange = (b: AudioBuffer, s: number, e: number) => map(b, (c) => { const a = idx(b, s), z = idx(b, e); const o = new Float32Array(c.length - (z - a)); o.set(c.subarray(0, a)); o.set(c.subarray(z), a); return o })
/** Insert silence of `sec` at `at`. */
export const insertSilence = (b: AudioBuffer, at: number, sec: number) => map(b, (c) => { const a = idx(b, at), n = Math.round(sec * b.sampleRate); const o = new Float32Array(c.length + n); o.set(c.subarray(0, a)); o.set(c.subarray(a), a + n); return o })
/** Linear fade across [s, e]; dir 'in' ramps 0→1, 'out' ramps 1→0. Uses an equal-power curve. */
export const fade = (b: AudioBuffer, s: number, e: number, dir: 'in' | 'out') => map(b, (c) => {
  const o = c.slice(); const a = idx(b, s), z = idx(b, e); const n = Math.max(1, z - a)
  for (let i = a; i < z; i++) { const x = (i - a) / n; const g = dir === 'in' ? Math.sin((x * Math.PI) / 2) : Math.cos((x * Math.PI) / 2); o[i] *= g }
  return o
})
export const gain = (b: AudioBuffer, s: number, e: number, db: number) => map(b, (c) => { const o = c.slice(); const g = Math.pow(10, db / 20); for (let i = idx(b, s); i < idx(b, e); i++) o[i] = Math.max(-1, Math.min(1, o[i] * g)); return o })
export function peakOf(b: AudioBuffer, s = 0, e = b.duration) { let m = 0; for (const c of chans(b)) for (let i = idx(b, s); i < idx(b, e); i++) { const v = Math.abs(c[i]); if (v > m) m = v } return m }
export const normalize = (b: AudioBuffer, s: number, e: number, targetDb = -0.5) => { const p = peakOf(b, s, e); if (!p) return b; return gain(b, s, e, targetDb - 20 * Math.log10(p)) }
export const reverse = (b: AudioBuffer, s: number, e: number) => map(b, (c) => { const o = c.slice(); o.subarray(idx(b, s), idx(b, e)).reverse(); return o })

/** Change speed by resampling (pitch changes with it, like a tape). */
export async function changeSpeed(b: AudioBuffer, rate: number): Promise<AudioBuffer> {
  const len = Math.max(1, Math.round(b.length / rate))
  const ctx = new OfflineAudioContext(b.numberOfChannels, len, b.sampleRate)
  const src = ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = rate
  src.connect(ctx.destination); src.start()
  return ctx.startRendering()
}

/** Min/max peaks for drawing (per pixel column). */
export function peaks(b: AudioBuffer, from: number, to: number, columns: number): Float32Array {
  const out = new Float32Array(columns * 2)
  const data = chans(b)
  const a = idx(b, from), z = idx(b, to)
  const per = Math.max(1, (z - a) / columns)
  for (let x = 0; x < columns; x++) {
    let mn = 1, mx = -1
    const s = Math.floor(a + x * per), e = Math.min(z, Math.floor(a + (x + 1) * per))
    const step = Math.max(1, Math.floor((e - s) / 200))
    for (const c of data) for (let i = s; i < e; i += step) { const v = c[i]; if (v < mn) mn = v; if (v > mx) mx = v }
    if (mn > mx) { mn = 0; mx = 0 }
    out[x * 2] = mn; out[x * 2 + 1] = mx
  }
  return out
}

/** Draw a compact mirrored waveform onto a canvas (for lists/previews). */
export function drawMiniWave(canvas: HTMLCanvasElement, b: AudioBuffer, color: string) {
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth || 300, h = canvas.clientHeight || 40
  canvas.width = w * dpr; canvas.height = h * dpr
  const ctx = canvas.getContext('2d')!; ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h)
  const cols = Math.floor(w / 2)
  const p = peaks(b, 0, b.duration, cols)
  ctx.fillStyle = color
  for (let x = 0; x < cols; x++) { const amp = Math.max(Math.abs(p[x * 2]), Math.abs(p[x * 2 + 1])); const bh = Math.max(1, amp * h); ctx.fillRect(x * 2, (h - bh) / 2, 1.4, bh) }
}

/** Encode an AudioBuffer to mp3/ogg/aac/flac/m4a with ffmpeg (WAV stays native). */
export async function encodeBuffer(b: AudioBuffer, fmt: 'wav' | 'mp3' | 'ogg' | 'aac' | 'm4a' | 'flac', bitrate = 192, onProgress?: (p: number) => void): Promise<Blob> {
  const wav = bufferToWav(b)
  if (fmt === 'wav') return wav
  return ffRun({ inputs: [{ name: 'in.wav', file: wav }], args: ['-i', 'in.wav', ...audioCodecArgs(fmt, bitrate), `out.${fmt}`], output: `out.${fmt}`, duration: b.duration, onProgress })
}

export function audioCodecArgs(fmt: string, bitrate: number): string[] {
  switch (fmt) {
    case 'mp3': return ['-c:a', 'libmp3lame', '-b:a', `${bitrate}k`]
    case 'ogg': return ['-c:a', 'libvorbis', '-b:a', `${bitrate}k`]
    case 'aac': return ['-c:a', 'aac', '-b:a', `${bitrate}k`, '-f', 'adts']
    case 'm4a': return ['-c:a', 'aac', '-b:a', `${bitrate}k`, '-movflags', '+faststart']
    case 'flac': return ['-c:a', 'flac', '-compression_level', '5']
    case 'opus': return ['-c:a', 'libopus', '-b:a', `${bitrate}k`]
    default: return ['-c:a', 'pcm_s16le']
  }
}

/** Resolve a CSS variable to a color string usable in canvas. */
export function cssVar(name: string, fallback = '#14b8a6') {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}
