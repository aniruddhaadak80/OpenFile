// Keeps re-encodes close to the source size. Converters and effects pick a quality (CRF, -b:v, -b:a) that can be far
// above what the source was encoded at, which makes the copy bigger with no visible gain. These helpers read the
// source bitrate and cap the encoder at a little above it.
import type { ProbeInfo } from './engine'

/** "160k" -> 160, "4M" -> 4000, "128000" -> 128 (kb/s). */
export function kbpsOf(v: string | undefined): number {
  const m = /^([\d.]+)\s*([kKmM]?)$/.exec(String(v ?? '').trim())
  if (!m) return NaN
  const n = +m[1], u = m[2].toLowerCase()
  return u === 'm' ? n * 1000 : u === 'k' ? n : n / 1000
}

export interface SourceRate { total: number; video: number; audio: number }

/** Source bitrates in kb/s, from the probe when it has them, else from file size and duration. */
export function sourceRate(info: ProbeInfo | null | undefined, size: number, duration: number): SourceRate {
  const dur = info?.duration || duration
  const total = info?.totalKbps || (dur > 0 ? (size * 8) / dur / 1000 : 0)
  const audio = info?.hasAudio === false ? 0 : info?.audioKbps || (info?.hasAudio ? Math.min(128, total * 0.2) : 0)
  const video = info?.hasVideo === false ? 0 : info?.videoKbps || Math.max(0, total - audio)
  return { total, video, audio }
}

/** MP2 and AC-3 encoders only accept fixed bitrates: an in-between value makes the encoder refuse to start. */
const FIXED_RATES: Record<string, number[]> = {
  mp2: [32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  ac3: [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 448, 512, 576, 640],
}
/** The capped audio bitrate, moved up to the next rate the encoder accepts (never above the recipe's own rate). */
export function snapAudioKbps(codec: string, kbps: number, recipe: number): number {
  const steps = FIXED_RATES[codec]
  if (!steps) return kbps
  return steps.find((s) => s >= kbps && (!(recipe > 0) || s <= recipe)) ?? (recipe > 0 ? recipe : steps[steps.length - 1])
}

/** Lowest video cap in kb/s. */
export const VIDEO_FLOOR_KBPS = 32

const CAPPABLE = ['libx264', 'libx265', 'libvpx', 'libvpx-vp9', 'mpeg4', 'msmpeg4', 'mpeg2video', 'wmv2']

/** Caps video and audio bitrates in an ffmpeg argument list at `slack` times the source. Unknown rates are left alone. */
export function capToSource(args: string[], src: SourceRate, slack = 1.1): string[] {
  const out = [...args]
  // the floor only keeps a near-empty estimate usable: a 200 kb/s floor made 60 kb/s screen clips come back
  // three times bigger, so very low sources keep their own rate (plus the slack)
  const v = src.video > 0 ? Math.max(VIDEO_FLOOR_KBPS, Math.round(src.video * slack)) : 0
  const a = src.audio > 0 ? Math.max(48, Math.round(src.audio * slack)) : 0
  if (v) {
    const bi = out.indexOf('-b:v')
    if (bi >= 0 && !(kbpsOf(out[bi + 1]) <= v)) out[bi + 1] = `${v}k`
    const ci = out.indexOf('-c:v')
    if (ci >= 0 && CAPPABLE.includes(out[ci + 1]) && !out.includes('-maxrate')) out.push('-maxrate', `${v}k`, '-bufsize', `${v * 2}k`)
  }
  if (a) {
    const ci = out.indexOf('-c:a'), ac = ci >= 0 ? out[ci + 1] : ''
    for (let i = 0; i < out.length - 1; i++) if (out[i] === '-b:a' && !(kbpsOf(out[i + 1]) <= a)) out[i + 1] = `${snapAudioKbps(ac, a, kbpsOf(out[i + 1]))}k`
  }
  return out
}

/** A standard audio bitrate close to the source (for "Same as source"), 64 to 320 kb/s. */
export function matchAudioKbps(kbps: number, fallback = 192): number {
  if (!(kbps > 0) || kbps > 400) return fallback // unknown, or a lossless source
  const steps = [64, 96, 112, 128, 160, 192, 224, 256, 320]
  return steps.find((s) => s >= kbps * 0.98) ?? 320
}
