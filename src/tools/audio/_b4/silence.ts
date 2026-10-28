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
