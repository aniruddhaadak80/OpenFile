export interface Seg { start: number; end: number; text: string }
const pad = (n: number, l = 2) => String(Math.floor(n)).padStart(l, '0')
const stamp = (t: number, sep: ',' | '.') => { const ms = Math.round(t * 1000); return `${pad(ms / 3600000)}:${pad((ms % 3600000) / 60000)}:${pad((ms % 60000) / 1000)}${sep}${pad(ms % 1000, 3)}` }
export const toSrt = (segs: Seg[]) => segs.map((s, i) => `${i + 1}\n${stamp(s.start, ',')} --> ${stamp(s.end, ',')}\n${s.text.trim()}\n`).join('\n')
/** WebVTT cue text is HTML-like, so a spoken & or < is written as an entity. */
export const toVtt = (segs: Seg[]) => 'WEBVTT\n\n' + segs.map((s) => `${stamp(s.start, '.')} --> ${stamp(s.end, '.')}\n${s.text.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;')}\n`).join('\n')
