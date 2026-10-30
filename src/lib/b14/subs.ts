/* Subtitle helpers for the round 14 subtitle tools: dual merge, cleaning, transcripts, split and join, LRC.
 * Pure TypeScript, unit tested in Node (scripts/tests/b14). */
import { plainText, type Cue } from '../b4/subtitles.ts'

/** Text with <tags> and {\ass} overrides left out, read character by character (used only to test if a line is empty or music). */
function withoutTags(l: string): string {
  let o = '', close = ''
  for (const ch of l) {
    if (close) { if (ch === close) close = ''; continue }
    if (ch === '<' || ch === '{') { close = ch === '<' ? '>' : '}'; continue }
    o += ch
  }
  return o
}

/** Merge two subtitle tracks into stacked cues: every time slice shows the lines of A and B that are on screen. */
export function mergeStacked(a: Cue[], b: Cue[], sep = '\n'): Cue[] {
  const marks = [...new Set([...a, ...b].flatMap((c) => [round3(c.start), round3(c.end)]))].sort((x, y) => x - y)
  const out: Cue[] = []
  for (let i = 0; i < marks.length - 1; i++) {
    const s = marks[i], e = marks[i + 1]
    if (e - s < 0.001) continue
    const mid = (s + e) / 2
    const ta = a.filter((c) => c.start <= mid && c.end > mid).map((c) => c.text.trim()).join('\n')
    const tb = b.filter((c) => c.start <= mid && c.end > mid).map((c) => c.text.trim()).join('\n')
    const text = [ta, tb].filter(Boolean).join(sep)
    if (!text) continue
    const last = out[out.length - 1]
    if (last && last.text === text && Math.abs(last.end - s) < 0.002) last.end = e
    else out.push({ start: s, end: e, text })
  }
  return out
}
const round3 = (n: number) => Math.round(n * 1000) / 1000

/** ASS file with two styles: track A at the bottom, track B at the top (or both bottom, B smaller). */
export function mergeAss(a: Cue[], b: Cue[], o: { layout: 'top-bottom' | 'stacked-bottom'; sizeA: number; sizeB: number; colorA: string; colorB: string; title?: string }): string {
  const col = (hex: string) => { const h = hex.replace('#', '').padEnd(6, '0'); return `&H00${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase() }
  const t = (s: number) => { const cs = Math.max(0, Math.round(s * 100)); const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), x = Math.floor((cs % 6000) / 100); return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}` }
  const alignB = o.layout === 'top-bottom' ? 8 : 2
  const marginB = o.layout === 'top-bottom' ? 40 : 40 + Math.round(o.sizeA * 2.4)
  const head = `[Script Info]\nTitle: ${o.title ?? 'Dual subtitles'}\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Main,Arial,${o.sizeA},${col(o.colorA)},&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,30,30,40,1\nStyle: Second,Arial,${o.sizeB},${col(o.colorB)},&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,${alignB},30,30,${marginB},1`
  const line = (c: Cue, style: string) => `Dialogue: 0,${t(c.start)},${t(c.end)},${style},,0,0,0,,${plainText(c.text).trim().replace(/\r?\n/g, '\\N')}`
  const events = [...a.map((c) => ({ c, s: 'Main' })), ...b.map((c) => ({ c, s: 'Second' }))].sort((x, y) => x.c.start - y.c.start).map((x) => line(x.c, x.s))
  return `${head}\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events.join('\n')}\n`
}

export interface CleanOpts {
  hearingImpaired: boolean // [door slams] (laughs)
  speakers: boolean // JOHN: hello
  music: boolean // lines made of only notes
  tags: boolean // <i> {\an8}
  caps: boolean // ALL CAPS lines to sentence case
  dashes: boolean // leading "- " on single line cues
  dedupe: boolean // same text repeated in a row
  minDuration: number // seconds, 0 = off
  fixOverlap: boolean
  maxLine: number // characters per line, 0 = off
}
export const CLEAN_DEFAULTS: CleanOpts = { hearingImpaired: true, speakers: true, music: true, tags: false, caps: false, dashes: true, dedupe: true, minDuration: 0.7, fixOverlap: true, maxLine: 42 }

export interface CleanReport { removedCues: number; changedCues: number; hi: number; speakers: number; music: number; merged: number; overlaps: number; extended: number; rewrapped: number }

export function wrapLine(text: string, max: number): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  if (text.length <= max || words.length < 2) return text
  // two balanced lines when it fits, otherwise greedy
  if (text.length <= max * 2) {
    let best = 1, bestDiff = Infinity
    for (let i = 1; i < words.length; i++) { const l = words.slice(0, i).join(' ').length, r = words.slice(i).join(' ').length; if (l <= max && r <= max && Math.abs(l - r) < bestDiff) { bestDiff = Math.abs(l - r); best = i } }
    if (bestDiff !== Infinity) return words.slice(0, best).join(' ') + '\n' + words.slice(best).join(' ')
  }
  const lines: string[] = []; let cur = ''
  for (const w of words) { if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w } else cur = (cur + ' ' + w).trim() }
  if (cur) lines.push(cur)
  return lines.join('\n')
}

const sentenceCase = (s: string) => s.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, (m) => m.toUpperCase()).replace(/\bi\b/g, 'I')

export function cleanCues(cues: Cue[], o: CleanOpts): { cues: Cue[]; report: CleanReport } {
  const r: CleanReport = { removedCues: 0, changedCues: 0, hi: 0, speakers: 0, music: 0, merged: 0, overlaps: 0, extended: 0, rewrapped: 0 }
  let out: Cue[] = []
  for (const c0 of [...cues].sort((a, b) => a.start - b.start)) {
    let t = c0.text
    const before = t
    if (o.tags) t = plainText(t)
    if (o.hearingImpaired) { const n = t.replace(/\[[^\]\n]*\]|\([^)\n]*\)|\uFF08[^\uFF09\n]*\uFF09/g, (m) => { r.hi++; return '' }); t = n }
    let lines = t.split(/\r?\n/)
    if (o.speakers) lines = lines.map((l) => l.replace(/^(\s*-?\s*)([A-Z][A-Z0-9 .'&-]{1,24}|[A-Z][a-z]+(?: [A-Z][a-z]+)?):\s+/, (_m, d) => { r.speakers++; return d }))
    if (o.music) lines = lines.filter((l) => { const bare = withoutTags(l).trim(); if (/^[♪♫#*\s]+$/.test(bare) && bare.length) { r.music++; return false } if (/^[♪♫#]/.test(bare) && /[♪♫#]$/.test(bare)) { r.music++; return false } return true })
    lines = lines.map((l) => l.replace(/[ \t]{2,}/g, ' ').trim()).filter((l) => withoutTags(l).replace(/^-\s*$/, '').trim())
    if (o.dashes && lines.length === 1) lines[0] = lines[0].replace(/^-\s*/, '')
    if (o.caps) lines = lines.map((l) => { const letters = l.replace(/[^A-Za-z]/g, ''); return letters.length > 3 && letters === letters.toUpperCase() ? sentenceCase(l) : l })
    t = lines.join('\n')
    if (o.maxLine > 0 && lines.length <= 2 && lines.some((l) => plainText(l).length > o.maxLine)) { const w = wrapLine(lines.join(' '), o.maxLine); if (w !== t) { r.rewrapped++; t = w } }
    if (!t.trim()) { r.removedCues++; continue }
    if (t !== before) r.changedCues++
    const prev = out[out.length - 1]
    if (o.dedupe && prev && plainText(prev.text).trim() === plainText(t).trim() && c0.start - prev.end < 0.5) { prev.end = Math.max(prev.end, c0.end); r.merged++; continue }
    out.push({ ...c0, text: t })
  }
  if (o.minDuration > 0) out.forEach((c, i) => { if (c.end - c.start < o.minDuration) { const next = out[i + 1]; const lim = next ? next.start - 0.04 : Infinity; const e = Math.min(c.start + o.minDuration, lim); if (e > c.end) { c.end = e; r.extended++ } } })
  if (o.fixOverlap) out.forEach((c, i) => { const n = out[i + 1]; if (n && c.end > n.start) { c.end = Math.max(c.start + 0.05, n.start - 0.04); r.overlaps++ } })
  out = out.filter((c) => c.end > c.start)
  return { cues: out, report: r }
}

/** Plain transcript from cues: paragraphs split on long pauses, optional timestamps. */
export function transcript(cues: Cue[], o: { gap: number; stamps: 'none' | 'paragraph' | 'line'; joinLines: boolean; markdown?: boolean }): string {
  const fmt = (s: number) => { const t = Math.floor(s); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0') }
  const lines = [...cues].sort((a, b) => a.start - b.start).map((c) => ({ start: c.start, end: c.end, text: plainText(c.text).replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim() })).filter((c) => c.text)
  // drop rolling duplicates (auto captions repeat the previous line)
  const dedup: typeof lines = []
  for (const l of lines) { const p = dedup[dedup.length - 1]; if (p && (p.text === l.text || p.text.endsWith(l.text))) { p.end = l.end; continue } if (p && l.text.startsWith(p.text)) { p.text = l.text; p.end = l.end; continue } dedup.push({ ...l }) }
  if (o.stamps === 'line') return dedup.map((l) => `${o.markdown ? '**' : '['}${fmt(l.start)}${o.markdown ? '**' : ']'} ${l.text}`).join('\n') + '\n'
  const paras: { start: number; parts: string[] }[] = []
  dedup.forEach((l, i) => { const prev = dedup[i - 1]; if (!prev || l.start - prev.end >= o.gap) paras.push({ start: l.start, parts: [] }); paras[paras.length - 1].parts.push(l.text) })
  return paras.map((p) => (o.stamps === 'paragraph' ? (o.markdown ? `**${fmt(p.start)}** ` : `[${fmt(p.start)}] `) : '') + p.parts.join(o.joinLines ? ' ' : '\n')).join('\n\n') + '\n'
}

/** Split cues at the given times (seconds). Each part can be shifted back to start at zero. */
export function splitAt(cues: Cue[], times: number[], rebase: boolean): Cue[][] {
  const cuts = [...times].filter((t) => t > 0).sort((a, b) => a - b)
  const edges = [0, ...cuts, Infinity]
  const parts: Cue[][] = []
  for (let i = 0; i < edges.length - 1; i++) {
    const s = edges[i], e = edges[i + 1]
    const part = cues.filter((c) => c.start >= s && c.start < e).map((c) => ({ ...c, end: Math.min(c.end, e === Infinity ? c.end : e) }))
    parts.push(rebase ? part.map((c) => ({ ...c, start: c.start - s, end: c.end - s })) : part)
  }
  return parts
}
/** Where to cut between cue i-1 and cue i: the end of the earlier cue when it ends before the next starts,
 * so no line is cut short and a later join (gap 0) puts every line back at its own time. */
function boundary(cues: Cue[], i: number): number {
  const prevEnd = cues.slice(0, i).reduce((m, c) => Math.max(m, c.end), 0)
  return prevEnd <= cues[i].start ? prevEnd : cues[i].start
}
/** Even split into n parts by cue count. */
export function splitCount(cues: Cue[], n: number, rebase: boolean): Cue[][] {
  const per = Math.ceil(cues.length / Math.max(1, n))
  const times: number[] = []
  for (let i = per; i < cues.length; i += per) times.push(boundary(cues, i))
  return splitAt(cues, times, rebase)
}
/** A default cut for short files: the cue boundary closest to the middle, so no line is cut in two. */
export function middleCut(cues: Cue[]): number | null {
  const sorted = [...cues].sort((a, b) => a.start - b.start)
  if (sorted.length < 2) return null
  const end = sorted.reduce((m, c) => Math.max(m, c.end), 0)
  let best: number | null = null
  for (let i = 1; i < sorted.length; i++) { const t = boundary(sorted, i); if (t > 0 && (best === null || Math.abs(t - end / 2) < Math.abs(best - end / 2))) best = t }
  return best
}
/** Join tracks one after another. offsets[i] is where file i starts; when missing, it starts after the previous last cue plus gap. */
export function joinTracks(tracks: Cue[][], offsets: (number | null)[], gap = 1): Cue[] {
  const out: Cue[] = []
  let cursor = 0
  tracks.forEach((t, i) => {
    const off = offsets[i] ?? (i === 0 ? 0 : cursor + gap)
    for (const c of t) out.push({ ...c, start: c.start + off, end: c.end + off })
    const last = t.reduce((m, c) => Math.max(m, c.end), 0)
    cursor = off + last
  })
  return out.sort((a, b) => a.start - b.start)
}

/** Lyrics lines plus stamps (seconds or null) to LRC. */
export function toLrc(lines: { text: string; time: number | null }[], meta: { ti?: string; ar?: string; al?: string } = {}): string {
  const t = (s: number) => { const cs = Math.round(s * 100); return `[${String(Math.floor(cs / 6000)).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}]` }
  const head = (['ti', 'ar', 'al'] as const).filter((k) => meta[k]).map((k) => `[${k}:${meta[k]}]`)
  return [...head, ...lines.filter((l) => l.time != null).map((l) => t(l.time!) + l.text)].join('\n') + '\n'
}
/** Stamped lyric lines to cues (each line ends where the next starts). */
export function lyricsToCues(lines: { text: string; time: number | null }[], tail = 4): Cue[] {
  const st = lines.filter((l) => l.time != null && l.text.trim()).sort((a, b) => a.time! - b.time!)
  return st.map((l, i) => ({ start: l.time!, end: i + 1 < st.length ? Math.max(l.time! + 0.3, st[i + 1].time! - 0.05) : l.time! + tail, text: l.text }))
}
