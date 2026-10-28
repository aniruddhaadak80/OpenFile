/* Media engine for the video/audio tools.
 * A thin layer over ffmpeg.wasm (single-thread core from the CDN, same build as `@/lib/ffmpeg`)
 * that adds what the shared helper lacks: load progress, cancellation, accurate progress from
 * `time=` log lines, readable errors, multi-file outputs and a stream probe. */
import type { FFmpeg } from '@ffmpeg/ffmpeg'

const CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm'
const WASM_EST = 32 * 1024 * 1024

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error'
export interface EngineState { status: EngineStatus; loaded: number; total: number; error?: string }

let state: EngineState = { status: 'idle', loaded: 0, total: WASM_EST }
const listeners = new Set<() => void>()
const set = (s: Partial<EngineState>) => { state = { ...state, ...s }; listeners.forEach((l) => l()) }
export const engineState = () => state
export const subscribeEngine = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

let instance: FFmpeg | null = null
let loading: Promise<FFmpeg> | null = null
let cancelled = false
let busy = false
let gen = 0

export class CancelledError extends Error { constructor() { super('Cancelled'); this.name = 'CancelledError' } }
export const isCancel = (e: unknown) => e instanceof CancelledError || (e as any)?.name === 'CancelledError'

export function loadEngine(): Promise<FFmpeg> {
  if (instance) return Promise.resolve(instance)
  if (!loading) {
    const my = ++gen
    loading = (async () => {
      set({ status: 'loading', loaded: 0, total: WASM_EST, error: undefined })
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import('@ffmpeg/ffmpeg'), import('@ffmpeg/util')])
      const coreURL = await toBlobURL(`${CORE}/ffmpeg-core.js`, 'text/javascript')
      const wasmURL = await toBlobURL(`${CORE}/ffmpeg-core.wasm`, 'application/wasm', true, (e) => {
        if (my === gen) set({ loaded: e.received, total: e.total > 0 ? e.total : Math.max(WASM_EST, e.received * 1.02) })
      })
      const ff = new FFmpeg()
      await ff.load({ coreURL, wasmURL })
      if (my !== gen) { ff.terminate(); throw new CancelledError() }
      instance = ff
      set({ status: 'ready', loaded: state.total })
      return ff
    })().catch((e) => {
      if (isCancel(e) || my !== gen) throw new CancelledError()
      loading = null
      set({ status: 'error', error: 'Could not download the video engine. Check your connection and try again.' })
      throw new Error('Could not download the video engine (ffmpeg.wasm). Check your connection and try again.')
    })
  }
  return loading
}

/** Abort whatever ffmpeg is doing right now. The engine is re-created on next use (cached, so fast). */
export function cancelEngine() {
  if (!instance && !loading) return
  cancelled = true
  gen++
  try { instance?.terminate() } catch { /* ignore */ }
  instance = null; loading = null
  set({ status: 'idle', loaded: 0 })
}

export interface RunOpts {
  inputs: { name: string; file: Blob | Uint8Array }[]
  args: string[]
  /** expected output duration in seconds; enables accurate progress from ffmpeg's `time=` log */
  duration?: number
  onProgress?: (p: number) => void
  onLog?: (line: string) => void
}

const parseTime = (s: string) => { const m = s.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : NaN }

function friendly(lines: string[], code: number) {
  const bad = lines.filter((l) => /error|invalid|not supported|unsupported|could not|no such|unknown|failed|does not contain|matches no streams|incorrect codec/i.test(l) && !/^\s*(built with|configuration)/i.test(l))
  const last = (bad.length ? bad.slice(-2) : lines.slice(-2)).join(' · ').trim()
  if (/matches no streams|does not contain any stream|Output file #0 does not contain/i.test(last)) return 'The file has no matching track for this operation (for example, a video with no audio track).'
  if (/Could not find tag for codec|codec not currently supported in container|Could not write header/i.test(last)) return 'These codecs cannot be stored in the chosen container without re-encoding. Switch to re-encode mode or pick another format.'
  if (/Invalid data found when processing input/i.test(last)) return 'This file could not be read. It may be corrupted or use a codec the engine does not support.'
  if (/out of memory|Cannot allocate memory|memory access out of bounds/i.test(last)) return 'The browser ran out of memory. Try a shorter clip, a lower resolution, or a smaller file.'
  return `Processing failed (code ${code}). ${last.slice(0, 220)}`
}

async function exec(opts: RunOpts, collect: (ff: FFmpeg) => Promise<{ name: string; data: Uint8Array }[]>) {
  busy = true; cancelled = false
  const lines: string[] = []
  let ff: FFmpeg | null = null
  const onLog = ({ message }: { message: string }) => {
    lines.push(message); if (lines.length > 60) lines.shift()
    opts.onLog?.(message)
    if (opts.duration && opts.onProgress) {
      const m = message.match(/time=\s*(-?[\d:.]+)/)
      if (m) { const t = parseTime(m[1]); if (Number.isFinite(t) && t >= 0) opts.onProgress(Math.min(0.995, t / opts.duration)) }
    }
  }
  const onProg = ({ progress }: { progress: number }) => { if (!opts.duration && progress >= 0 && progress <= 1) opts.onProgress?.(progress) }
  try {
    ff = await loadEngine()
    if (cancelled) throw new CancelledError()
    ff.on('log', onLog); ff.on('progress', onProg)
    const { fetchFile } = await import('@ffmpeg/util')
    for (const i of opts.inputs) await ff.writeFile(i.name, i.file instanceof Uint8Array ? i.file : await fetchFile(i.file))
    const code = await ff.exec(opts.args)
    if (cancelled) throw new CancelledError()
    if (code !== 0) throw new Error(friendly(lines, code))
    const out = await collect(ff)
    if (!out.length || out.every((o) => !o.data.length)) throw new Error(friendly(lines, code))
    opts.onProgress?.(1)
    return out
  } catch (e) {
    if (cancelled) throw new CancelledError()
    throw e
  } finally {
    busy = false
    if (ff && instance === ff) {
      ff.off('log', onLog); ff.off('progress', onProg)
      try {
        const files = await ff.listDir('/')
        const keep = new Set(['.', '..', 'tmp', 'home', 'dev', 'proc'])
        for (const f of files) if (!f.isDir && !keep.has(f.name)) await ff.deleteFile(f.name).catch(() => {})
      } catch { /* ignore */ }
    }
  }
}

const MIMES: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska', avi: 'video/x-msvideo', gif: 'image/gif', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', aac: 'audio/aac', m4a: 'audio/mp4', flac: 'audio/flac', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }
export const mimeOf = (name: string) => MIMES[(name.split('.').pop() || '').toLowerCase()] || 'application/octet-stream'

/** Run ffmpeg and return the single output file as a Blob. */
export async function ffRun(opts: RunOpts & { output: string }): Promise<Blob> {
  const [o] = await exec(opts, async (ff) => {
    try { return [{ name: opts.output, data: (await ff.readFile(opts.output)) as Uint8Array }] } catch { return [] }
  })
  return new Blob([o.data as BlobPart], { type: mimeOf(opts.output) })
}

/** Run ffmpeg and collect every output file whose name matches `pattern` (e.g. frame_%04d.png). */
export async function ffRunMany(opts: RunOpts & { pattern: RegExp }): Promise<{ name: string; blob: Blob }[]> {
  const inputs = new Set(opts.inputs.map((i) => i.name))
  const out = await exec(opts, async (ff) => {
    const list = (await ff.listDir('/')).filter((f) => !f.isDir && opts.pattern.test(f.name) && !inputs.has(f.name)).map((f) => f.name).sort()
    const res: { name: string; data: Uint8Array }[] = []
    for (const n of list) res.push({ name: n, data: (await ff.readFile(n)) as Uint8Array })
    return res
  })
  return out.map((o) => ({ name: o.name, blob: new Blob([o.data as BlobPart], { type: mimeOf(o.name) }) }))
}

export interface ProbeInfo { duration: number; hasVideo: boolean; hasAudio: boolean; width?: number; height?: number; fps?: number; sampleRate?: number; channels?: number; vcodec?: string; acodec?: string }

/** Read stream info from ffmpeg's banner (`ffmpeg -i file`). */
export async function ffProbe(file: Blob, name = 'probe' + extFromBlob(file)): Promise<ProbeInfo> {
  const lines: string[] = []
  busy = true; cancelled = false
  let ff: FFmpeg | null = null
  const onLog = ({ message }: { message: string }) => lines.push(message)
  try {
    ff = await loadEngine()
    ff.on('log', onLog)
    const { fetchFile } = await import('@ffmpeg/util')
    await ff.writeFile(name, await fetchFile(file))
    await ff.exec(['-hide_banner', '-i', name])
    await ff.deleteFile(name).catch(() => {})
  } catch (e) {
    if (cancelled) throw new CancelledError()
    throw e
  } finally {
    busy = false
    if (ff && instance === ff) ff.off('log', onLog)
  }
  return parseProbe(lines.join('\n'))
}

export function parseProbe(text: string): ProbeInfo {
  const info: ProbeInfo = { duration: 0, hasVideo: false, hasAudio: false }
  const d = text.match(/Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/); if (d) info.duration = parseTime(d[1])
  const v = text.match(/Stream #\d+:\d+[^\n]*?: Video: ([^\n]+)/)
  if (v) {
    info.hasVideo = !/attached pic/.test(v[1]); info.vcodec = v[1].split(/[\s,(]/)[0]
    const r = v[1].match(/, (\d{2,5})x(\d{2,5})/); if (r) { info.width = +r[1]; info.height = +r[2] }
    const f = v[1].match(/([\d.]+) fps/) || v[1].match(/([\d.]+) tbr/); if (f) info.fps = +f[1]
  }
  const a = text.match(/Stream #\d+:\d+[^\n]*?: Audio: ([^\n]+)/)
  if (a) {
    info.hasAudio = true; info.acodec = a[1].split(/[\s,(]/)[0]
    const sr = a[1].match(/(\d+) Hz/); if (sr) info.sampleRate = +sr[1]
    info.channels = /mono/.test(a[1]) ? 1 : 2
  }
  return info
}

export function extFromBlob(b: Blob): string {
  const n = (b as File).name
  if (n && /\.[a-z0-9]{2,5}$/i.test(n)) return n.slice(n.lastIndexOf('.')).toLowerCase()
  const t = b.type
  if (t.includes('webm')) return '.webm'
  if (t.includes('quicktime')) return '.mov'
  if (t.includes('mp4')) return t.startsWith('audio') ? '.m4a' : '.mp4'
  if (t.includes('matroska')) return '.mkv'
  if (t.includes('ogg')) return '.ogg'
  if (t.includes('mpeg')) return '.mp3'
  if (t.includes('wav')) return '.wav'
  if (t.includes('flac')) return '.flac'
  if (t.includes('aac')) return '.aac'
  return '.bin'
}

/** seconds -> ffmpeg time string */
export const ts = (s: number) => Math.max(0, s).toFixed(3)

/** atempo only accepts 0.5–2 per instance on older builds — chain to reach any factor. */
export function atempoChain(speed: number): string {
  const parts: string[] = []
  let s = speed
  while (s > 2) { parts.push('atempo=2'); s /= 2 }
  while (s < 0.5) { parts.push('atempo=0.5'); s /= 0.5 }
  parts.push(`atempo=${+s.toFixed(5)}`)
  return parts.join(',')
}

export const X264 = ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p']
export const VP8 = ['-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-pix_fmt', 'yuv420p']
