/* Pure helpers for silence detection output (ffmpeg silencedetect) and jump cuts. */
export interface Span { start: number; end: number }

export function parseSilenceLog(lines: string[], duration: number): Span[] {
  const out: Span[] = []
  let cur: number | null = null
  for (const l of lines) {
    const s = l.match(/silence_start:\s*(-?[\d.]+)/); if (s) cur = Math.max(0, +s[1])
    const e = l.match(/silence_end:\s*([\d.]+)/); if (e && cur != null) { out.push({ start: cur, end: +e[1] }); cur = null }
  }
  if (cur != null && duration > cur) out.push({ start: cur, end: duration })
  return out
}

/** Segments to keep: everything except silences, leaving `pad` seconds of each pause. */
export function keepSegments(silences: Span[], duration: number, pad: number): Span[] {
  const keep: Span[] = []
  let t = 0
  for (const s of silences) {
    const a = s.start <= 0.001 ? 0 : s.start + pad
    const b = s.end >= duration - 0.001 ? duration : s.end - pad
    if (b - a <= 0.05) continue
    if (a > t) keep.push({ start: t, end: a })
    t = Math.max(t, b)
  }
  if (duration - t > 0.02) keep.push({ start: t, end: duration })
  return keep.filter((k) => k.end - k.start > 0.02)
}

export const selectExpr = (keep: Span[]) => keep.map((k) => `between(t,${k.start.toFixed(3)},${k.end.toFixed(3)})`).join('+')

/** Find split points in the middle of quiet gaps (RMS in 20 ms windows). Pure, unit tested. */
export function findSilenceSplits(mono: Float32Array, sr: number, thresholdDb: number, minSec: number): number[] {
  const win = Math.max(1, Math.round(sr * 0.02))
  const thr = Math.pow(10, thresholdDb / 20)
  const splits: number[] = []
  let runStart = -1
  const n = Math.floor(mono.length / win)
  for (let w = 0; w <= n; w++) {
    let quiet = false
    if (w < n) { let s = 0; for (let i = w * win; i < (w + 1) * win; i++) s += mono[i] * mono[i]; quiet = Math.sqrt(s / win) < thr }
    if (quiet && runStart < 0) runStart = w
    if (!quiet && runStart >= 0) {
      const a = runStart * win / sr, b = w * win / sr
      if (b - a >= minSec && a > 0.05 && w < n) splits.push((a + b) / 2)
      runStart = -1
    }
  }
  return splits
}

/** Turn split times into [start, end] parts covering 0..duration. */
export function partsFromSplits(splits: number[], duration: number, minPart = 0.2): Span[] {
  const pts = [0, ...splits.filter((t) => t > 0 && t < duration).sort((a, b) => a - b), duration]
  const out: Span[] = []
  for (let i = 0; i < pts.length - 1; i++) if (pts[i + 1] - pts[i] >= minPart) out.push({ start: pts[i], end: pts[i + 1] })
  return out
}
