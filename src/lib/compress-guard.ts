/* Size math and the "never hand back a bigger file" rule shared by every compressor.
 * Pure functions with no imports, so Node tests can load this file directly. */

/** True when the compressed output is not worth giving back: it is the same size or bigger than the original. */
export const notSmaller = (originalSize: number, outputSize: number) => !(outputSize > 0 && outputSize < originalSize)

/** Return the output when it is smaller than the original, otherwise the original itself. */
export function keepSmaller<T extends { size: number }>(original: T, output: T): { blob: T; kept: boolean } {
  return notSmaller(original.size, output.size) ? { blob: original, kept: true } : { blob: output, kept: false }
}

/** Plain message shown when a compressor gives the original back. */
export const KEPT_ORIGINAL = 'This file is already as small as it gets at this quality. Here is your original file.'
export const KEPT_ORIGINAL_VIDEO = 'This video is already as small as it gets at this quality. Here is your original file.'

/* ---------- reading bitrates from the ffmpeg banner (`ffmpeg -i file`) ---------- */

export interface Bitrates { duration: number; totalKbps?: number; videoKbps?: number; audioKbps?: number; acodec?: string; fps?: number }

const toSec = (s: string) => { const m = s.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0 }

export function parseBitrates(text: string): Bitrates {
  const out: Bitrates = { duration: 0 }
  const d = text.match(/Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/); if (d) out.duration = toSec(d[1])
  const t = text.match(/Duration:[^\n]*?bitrate:\s*(\d+(?:\.\d+)?)\s*kb\/s/); if (t) out.totalKbps = +t[1]
  const v = text.match(/Stream #\d+:\d+[^\n]*?: Video: ([^\n]+)/)
  if (v && !/attached pic/.test(v[1])) {
    const b = v[1].match(/(\d+(?:\.\d+)?)\s*kb\/s/); if (b) out.videoKbps = +b[1]
    const f = v[1].match(/([\d.]+) fps/); if (f) out.fps = +f[1]
  }
  const a = text.match(/Stream #\d+:\d+[^\n]*?: Audio: ([^\n]+)/)
  if (a) {
    out.acodec = a[1].split(/[\s,(]/)[0]
    const b = a[1].match(/(\d+(?:\.\d+)?)\s*kb\/s/); if (b) out.audioKbps = +b[1]
  }
  return out
}

/* ---------- video compression plan ---------- */

export type VideoPreset = 'small' | 'balanced' | 'high'
/** Share of the source total bitrate each preset aims for. */
export const PRESET_RATIO: Record<VideoPreset, number> = { small: 0.35, balanced: 0.55, high: 0.75 }
/** Highest short side each preset keeps when the source is above 1080p. */
export const PRESET_MAX_SHORT: Record<VideoPreset, number> = { small: 720, balanced: 1080, high: 1440 }
const PRESET_AUDIO: Record<VideoPreset, number> = { small: 96, balanced: 112, high: 128 }

/** Lowest video bitrate (kb/s) worth encoding at a given short side. */
export function videoFloorKbps(shortSide: number): number {
  if (shortSide >= 1440) return 900
  if (shortSide >= 1080) return 450
  if (shortSide >= 720) return 250
  if (shortSide >= 480) return 150
  return 90
}

export interface VideoSource {
  sizeBytes: number
  duration: number
  width: number
  height: number
  fps?: number
  hasAudio?: boolean
  /** read from the ffmpeg banner when known */
  videoKbps?: number
  audioKbps?: number
  acodec?: string
}

export interface VideoOptions {
  preset: VideoPreset
  /** 'original' or a short side such as 1080, 720, 480 */
  res: 'original' | number
  noAudio?: boolean
  /** target-size mode: the output must fit under this many bytes */
  targetBytes?: number
  /** multiply the planned video bitrate, used for the automatic retry */
  factor?: number
}

export interface VideoPlan {
  /** short side to scale to, or 0 to keep the source size */
  scaleShort: number
  outWidth: number
  outHeight: number
  videoKbps: number
  /** 0 when audio is dropped */
  audioKbps: number
  copyAudio: boolean
  /** expected output size in bytes, an upper bound because the encoder is capped at videoKbps */
  estimateBytes: number
  /** true when the target size cannot be reached even at the lowest sensible quality */
  tooSmall: boolean
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)
/** container overhead for MP4 (moov, headers), about 2 percent */
const OVERHEAD = 1.02

/** Total source bitrate in kb/s from file size and duration. */
export const sourceKbps = (sizeBytes: number, duration: number) => (duration > 0 ? (sizeBytes * 8) / duration / 1000 : 0)

/** Bytes a stream of `kbps` takes over `duration` seconds, container overhead included. */
export const bytesFor = (kbps: number, duration: number) => Math.round(((kbps * 1000 * duration) / 8) * OVERHEAD)

/** Video bitrate that makes the whole file fit under `targetBytes` (two-pass style math: total bits / duration, minus audio). */
export function targetVideoKbps(targetBytes: number, duration: number, audioKbps: number): number {
  if (!(duration > 0)) return 0
  const totalKbps = (targetBytes * 8) / OVERHEAD / duration / 1000
  return Math.floor(totalKbps * 0.95 - audioKbps)
}

export function planVideo(src: VideoSource, o: VideoOptions): VideoPlan {
  const w = src.width || 0, h = src.height || 0
  const short = Math.min(w, h) || 0
  const dur = src.duration > 0 ? src.duration : 0
  const total = sourceKbps(src.sizeBytes, dur)
  const hasAudio = src.hasAudio !== false && !o.noAudio

  const ratio = PRESET_RATIO[o.preset]
  // the whole output (picture + sound) aims for this share of the source bitrate
  const budget = o.targetBytes && dur ? Math.min(targetVideoKbps(o.targetBytes, dur, 0), total * 0.9) : total * ratio

  // audio: copy AAC that is already at or below the preset rate, otherwise AAC at the preset rate,
  // never above the source and never more than about a third of the budget
  let audioKbps = 0, copyAudio = false
  if (hasAudio) {
    const want = PRESET_AUDIO[o.preset]
    const srcA = src.audioKbps
    const share = Math.max(32, Math.round(budget * 0.35))
    if (srcA && srcA <= want && srcA <= share && (src.acodec || '').toLowerCase() === 'aac') { audioKbps = Math.round(srcA); copyAudio = true }
    else audioKbps = Math.max(32, Math.min(want, srcA ? Math.round(srcA) : want, share))
  }

  // source video bitrate: from the banner, or total minus audio
  const srcVideo = src.videoKbps || Math.max(total - (src.audioKbps ?? (src.hasAudio === false ? 0 : Math.min(128, total * 0.3))), total * 0.6)

  let scaleShort = 0
  if (o.res !== 'original' && short > o.res) scaleShort = o.res
  else if (o.res === 'original' && short > 1080 && short > PRESET_MAX_SHORT[o.preset]) scaleShort = PRESET_MAX_SHORT[o.preset]

  let videoKbps = budget - audioKbps
  if (o.targetBytes) {
    // pick a smaller picture when the bitrate is too low for the current size
    if (o.res === 'original') {
      for (const s of [1080, 720, 480, 360]) {
        const cur = scaleShort || short
        if (cur > s && videoKbps < videoFloorKbps(cur)) scaleShort = s
      }
    }
  } else {
    // a lower resolution needs fewer bits; follow the pixel count, but not all the way down
    if (scaleShort && short) videoKbps *= Math.max(0.6, (scaleShort * scaleShort) / (short * short))
    // lift a very low bitrate to the floor for this size, so the picture stays watchable
    videoKbps = Math.max(videoKbps, videoFloorKbps(scaleShort || short))
  }
  // the floor must never push the output above the source: stay well under the source video bitrate
  videoKbps = Math.min(videoKbps, srcVideo * Math.min(0.85, ratio + 0.15))

  if (o.factor && o.factor > 0) videoKbps *= o.factor
  videoKbps = Math.max(32, Math.round(videoKbps))

  const outShort = scaleShort || short
  const k = short && scaleShort ? scaleShort / short : 1
  const outWidth = w ? even(w * k) : 0, outHeight = h ? even(h * k) : 0
  const estimateBytes = dur ? bytesFor(videoKbps + audioKbps, dur) : 0
  const tooSmall = !!o.targetBytes && (videoKbps < Math.min(80, videoFloorKbps(outShort)) || targetVideoKbps(o.targetBytes, dur, audioKbps) <= 32)
  return { scaleShort, outWidth, outHeight, videoKbps, audioKbps, copyAudio, estimateBytes, tooSmall }
}

/** Plan for the automatic retry after an output that did not get smaller: a clearly lower bitrate. */
export const RETRY_FACTOR = 0.6

/** ffmpeg arguments for the video part of a plan (libx264, CRF with a bitrate cap so the size is bounded). */
export function videoArgs(plan: VideoPlan, crf: number, landscape: boolean, mode: 'cap' | 'abr' = 'cap'): string[] {
  const v = plan.videoKbps
  const scale = plan.scaleShort ? ['-vf', landscape ? `scale=-2:${plan.scaleShort}` : `scale=${plan.scaleShort}:-2`] : []
  const rate = mode === 'abr'
    ? ['-b:v', `${v}k`, '-maxrate', `${v}k`, '-bufsize', `${v * 2}k`]
    : ['-crf', String(crf), '-maxrate', `${v}k`, '-bufsize', `${v * 2}k`]
  return [...scale, '-c:v', 'libx264', '-preset', 'superfast', '-pix_fmt', 'yuv420p', ...rate]
}

export function audioArgs(plan: VideoPlan): string[] {
  if (!plan.audioKbps) return ['-an']
  if (plan.copyAudio) return ['-c:a', 'copy']
  return ['-c:a', 'aac', '-b:a', `${plan.audioKbps}k`, '-ac', '2']
}

/** What the compressor should hand back after one or two encodes. */
export type Outcome = { kind: 'compressed'; index: number } | { kind: 'original' }
export function decideOutcome(originalSize: number, outputs: number[]): Outcome {
  let best = -1
  outputs.forEach((s, i) => { if (!notSmaller(originalSize, s) && (best < 0 || s < outputs[best])) best = i })
  return best < 0 ? { kind: 'original' } : { kind: 'compressed', index: best }
}
