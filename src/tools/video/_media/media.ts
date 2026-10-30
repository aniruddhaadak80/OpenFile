/* Browser-side media helpers shared by the video & audio tools. */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { toast } from '@/components/toast'
import { cancelEngine, engineState, isCancel, subscribeEngine } from './engine'

/** 83.456 -> "1:23.45" (or "1:02:03.4" with hours) */
export function fmtTime(s: number, decimals = 2): string {
  if (!Number.isFinite(s) || s < 0) s = 0
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const ss = sec.toFixed(decimals).padStart(decimals ? 3 + decimals : 2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
/** short clock: 83 -> "1:23" */
export const clock = (s: number) => fmtTime(s, 0)

/** "1:23.4", "83.4", "0:01:23" -> seconds (NaN when invalid) */
export function parseTimeInput(v: string): number {
  const t = v.trim().replace(',', '.')
  if (!t) return NaN
  if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t)
  const parts = t.split(':')
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return NaN
  return parts.reduce((acc, p) => acc * 60 + parseFloat(p), 0)
}

export function useObjectUrl(blob: Blob | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) { setUrl(null); return }
    const u = URL.createObjectURL(blob); setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

export interface VideoMeta { duration: number; width: number; height: number; playable: boolean }

/** Read duration/dimensions using a hidden <video>. Fixes the Infinity duration of MediaRecorder WebM files. */
export function probeVideo(src: string, timeoutMs = 15000): Promise<VideoMeta> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.preload = 'metadata'; v.muted = true; v.playsInline = true
    let done = false
    const finish = (m: VideoMeta) => { if (done) return; done = true; clearTimeout(timer); v.removeAttribute('src'); v.load(); resolve(m) }
    const timer = setTimeout(() => finish({ duration: 0, width: 0, height: 0, playable: false }), timeoutMs)
    v.onerror = () => finish({ duration: 0, width: 0, height: 0, playable: false })
    v.onloadedmetadata = () => {
      if (Number.isFinite(v.duration) && v.duration > 0) return finish({ duration: v.duration, width: v.videoWidth, height: v.videoHeight, playable: true })
      v.ontimeupdate = () => { v.ontimeupdate = null; finish({ duration: Number.isFinite(v.duration) ? v.duration : 0, width: v.videoWidth, height: v.videoHeight, playable: true }) }
      v.currentTime = 1e7
    }
    v.src = src
  })
}

export function useVideoMeta(file: Blob | null) {
  const url = useObjectUrl(file)
  const [meta, setMeta] = useState<VideoMeta | null>(null)
  useEffect(() => {
    setMeta(null)
    if (!url) return
    let alive = true
    probeVideo(url).then((m) => { if (alive) setMeta(m) })
    return () => { alive = false }
  }, [url])
  return { url, meta }
}

const seekTo = (v: HTMLVideoElement, t: number) => new Promise<void>((res, rej) => {
  const to = setTimeout(() => { cleanup(); res() }, 4000)
  const ok = () => { cleanup(); res() }
  const bad = () => { cleanup(); rej(new Error('Seek failed')) }
  const cleanup = () => { clearTimeout(to); v.removeEventListener('seeked', ok); v.removeEventListener('error', bad) }
  v.addEventListener('seeked', ok); v.addEventListener('error', bad)
  v.currentTime = t
})

/** Grab frames at the given times from a video URL. Calls onFrame as each frame is ready. */
export async function captureFrames(src: string, times: number[], opts: { width?: number; type?: string; quality?: number; onFrame?: (i: number, blob: Blob, t: number) => void; signal?: { aborted: boolean } } = {}): Promise<Blob[]> {
  const v = document.createElement('video')
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous'
  v.src = src
  await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('This video cannot be decoded by your browser.')) })
  const w = opts.width ? Math.min(opts.width, v.videoWidth) : v.videoWidth
  const h = Math.round((w / v.videoWidth) * v.videoHeight)
  const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h)
  const ctx = c.getContext('2d')!
  const out: Blob[] = []
  for (let i = 0; i < times.length; i++) {
    if (opts.signal?.aborted) break
    await seekTo(v, Math.min(Math.max(0, times[i]), Math.max(0, (v.duration || times[i]) - 0.04)))
    ctx.drawImage(v, 0, 0, c.width, c.height)
    const b = await new Promise<Blob>((res, rej) => c.toBlob((x) => (x ? res(x) : rej(new Error('Frame export failed'))), opts.type ?? 'image/jpeg', opts.quality ?? 0.7))
    out.push(b); opts.onFrame?.(i, b, times[i])
  }
  v.removeAttribute('src'); v.load()
  return out
}

/** Thumbnail strip (object URLs) for a timeline. */
export function useThumbStrip(url: string | null, duration: number, count = 10, width = 160) {
  const [thumbs, setThumbs] = useState<string[]>([])
  useEffect(() => {
    if (!url || !duration) { setThumbs([]); return }
    const signal = { aborted: false }
    const made: string[] = []
    const times = Array.from({ length: count }, (_, i) => (duration * (i + 0.5)) / count)
    captureFrames(url, times, { width, signal, onFrame: (i, b) => { const u = URL.createObjectURL(b); made.push(u); setThumbs((t) => { const n = [...t]; n[i] = u; return n }) } }).catch(() => {})
    return () => { signal.aborted = true; made.forEach((u) => URL.revokeObjectURL(u)); setThumbs([]) }
  }, [url, duration, count, width])
  return thumbs
}

export function useEngine() { return useSyncExternalStore(subscribeEngine, engineState, engineState) }

export type Phase = 'idle' | 'running' | 'done' | 'error'

/** Job state for ffmpeg-backed work: progress, label, ETA, cancel. */
export function useMediaJob() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [label, setLabel] = useState('Processing…')
  const [error, setError] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState(0)
  const abort = useRef({ aborted: false })
  const run = useCallback(async <T,>(fn: (ctx: { setProgress: (p: number) => void; setLabel: (s: string) => void; signal: { aborted: boolean } }) => Promise<T>): Promise<T | undefined> => {
    abort.current = { aborted: false }
    const signal = abort.current
    setPhase('running'); setError(null); setProgress(0); setLabel('Processing…'); setStartedAt(Date.now())
    try {
      const r = await fn({ setProgress: (p) => { if (!signal.aborted) setProgress(p) }, setLabel: (s) => { if (!signal.aborted) setLabel(s) }, signal })
      if (signal.aborted) return undefined
      setPhase('done'); setProgress(1)
      return r
    } catch (e: any) {
      if (signal.aborted || isCancel(e)) { setPhase('idle'); return undefined }
      console.error(e)
      const m = e?.message || String(e)
      setError(m); setPhase('error'); toast(m, 'error')
      return undefined
    }
  }, [])
  const cancel = useCallback(() => {
    abort.current.aborted = true
    cancelEngine()
    setPhase('idle'); setProgress(0)
    toast('Cancelled', 'info')
  }, [])
  const reset = useCallback(() => { setPhase('idle'); setError(null); setProgress(0) }, [])
  return { phase, busy: phase === 'running', progress, label, error, startedAt, run, cancel, reset, setError }
}
export type MediaJob = ReturnType<typeof useMediaJob>

/** Interval-driven clock that keeps ticking in background tabs (rAF pauses there). */
export function workerTicker(fps: number, tick: () => void): () => void {
  try {
    const code = `let t=null;onmessage=e=>{if(e.data==='stop'){clearInterval(t);close();}else{t=setInterval(()=>postMessage(0),${Math.round(1000 / fps)})}}`
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
    const w = new Worker(url)
    w.onmessage = tick; w.postMessage('start')
    return () => { w.postMessage('stop'); w.terminate(); URL.revokeObjectURL(url) }
  } catch {
    const t = setInterval(tick, 1000 / fps)
    return () => clearInterval(t)
  }
}

/** Pick the best MediaRecorder mime type the browser supports. */
export function pickRecorderMime(kind: 'video' | 'audio'): string {
  const list = kind === 'video'
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1,mp4a', 'video/mp4']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  if (typeof MediaRecorder === 'undefined') return ''
  return list.find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
}
export const recExt = (mime: string) => (mime.includes('mp4') ? (mime.startsWith('audio') ? 'm4a' : 'mp4') : mime.includes('ogg') ? 'ogg' : 'webm')

export function stamp() {
  const d = new Date(); const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
}

export function stopStream(s: MediaStream | null | undefined) { s?.getTracks().forEach((t) => t.stop()) }

/** Human message for getUserMedia/getDisplayMedia failures. */
export function mediaError(e: any, what = 'camera or microphone'): string {
  const n = e?.name
  if (n === 'NotAllowedError' || n === 'SecurityError') return `Permission to use the ${what} was denied. Allow it in your browser's address bar and try again.`
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return `No ${what} was found. Plug one in or pick another device.`
  if (n === 'NotReadableError') return `The ${what} is busy in another app. Close it there and try again.`
  if (n === 'AbortError') return 'Cancelled.'
  return e?.message || `Could not access the ${what}.`
}

/** Smoothed estimates per job (keyed by its start time), so the time left does not swing when one step is slower. */
const etaState = new Map<number, { at: number; rem: number }>()

/** Time left from elapsed time and progress. The raw estimate is blended in over about 8 seconds and the shown value
 *  counts down in between, so a part that starts slowly does not make the estimate jump from 3 to 12 minutes. */
export function eta(startedAt: number, p: number): string | null {
  if (!startedAt || p < 0.03 || p >= 1) return null
  const now = Date.now()
  const el = (now - startedAt) / 1000
  const raw = el / p - el
  if (!Number.isFinite(raw) || raw < 0) return null
  const s = etaState.get(startedAt)
  let rem = raw
  if (s) {
    const dt = Math.max(0, (now - s.at) / 1000)
    const carried = Math.max(0, s.rem - dt)
    rem = carried + (raw - carried) * Math.min(1, dt / 8)
  } else if (etaState.size > 16) etaState.clear()
  etaState.set(startedAt, { at: now, rem })
  return rem < 60 ? `~${Math.max(1, Math.round(rem))}s left` : `~${Math.round(rem / 60)} min left`
}

export function useInterval(fn: () => void, ms: number | null) {
  const ref = useRef(fn); ref.current = fn
  useEffect(() => { if (ms == null) return; const t = setInterval(() => ref.current(), ms); return () => clearInterval(t) }, [ms])
}

/** List media devices of a kind; refreshes after permission is granted. */
export function useDevices(kind: MediaDeviceKind) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const refresh = useCallback(async () => {
    try { const all = await navigator.mediaDevices.enumerateDevices(); setDevices(all.filter((d) => d.kind === kind && d.deviceId)) } catch { setDevices([]) }
  }, [kind])
  useEffect(() => {
    refresh()
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refresh)
  }, [refresh])
  return { devices, refresh }
}
