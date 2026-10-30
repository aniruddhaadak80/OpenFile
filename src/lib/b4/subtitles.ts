/* Subtitle model shared by the subtitle tools: parse and write SRT, VTT, ASS/SSA, SBV, MicroDVD SUB,
 * LRC, SAMI, TTML/DFXP, JSON and CSV. Pure TypeScript with no imports, so it is unit tested in Node. */

export interface Cue { start: number; end: number; text: string; style?: string; actor?: string }
export type SubFormat = 'srt' | 'vtt' | 'ass' | 'ssa' | 'sbv' | 'sub' | 'lrc' | 'smi' | 'ttml' | 'json' | 'csv' | 'txt'
export interface SubDoc { cues: Cue[]; format: SubFormat; assHeader?: string }

export const SUB_FORMATS: { id: SubFormat; label: string; ext: string; mime: string }[] = [
  { id: 'srt', label: 'SRT (SubRip)', ext: 'srt', mime: 'application/x-subrip' },
  { id: 'vtt', label: 'WebVTT', ext: 'vtt', mime: 'text/vtt' },
  { id: 'ass', label: 'ASS (Advanced SubStation)', ext: 'ass', mime: 'text/x-ssa' },
  { id: 'ssa', label: 'SSA (SubStation Alpha)', ext: 'ssa', mime: 'text/x-ssa' },
  { id: 'sbv', label: 'SBV (YouTube)', ext: 'sbv', mime: 'text/plain' },
  { id: 'sub', label: 'MicroDVD SUB', ext: 'sub', mime: 'text/plain' },
  { id: 'lrc', label: 'LRC (lyrics)', ext: 'lrc', mime: 'text/plain' },
  { id: 'smi', label: 'SAMI', ext: 'smi', mime: 'application/smil' },
  { id: 'ttml', label: 'TTML / DFXP', ext: 'ttml', mime: 'application/ttml+xml' },
  { id: 'json', label: 'JSON', ext: 'json', mime: 'application/json' },
  { id: 'csv', label: 'CSV', ext: 'csv', mime: 'text/csv' },
  { id: 'txt', label: 'Plain text (no timing)', ext: 'txt', mime: 'text/plain' },
]
export const subExt = (f: SubFormat) => SUB_FORMATS.find((x) => x.id === f)!.ext
export const subMime = (f: SubFormat) => SUB_FORMATS.find((x) => x.id === f)!.mime
export const SUB_ACCEPT = '.srt,.vtt,.ass,.ssa,.sbv,.sub,.lrc,.smi,.sami,.ttml,.dfxp,.xml,.json,.csv,.txt'

/* ---------------- time helpers ---------------- */
const p2 = (n: number) => String(Math.floor(n)).padStart(2, '0')
const p3 = (n: number) => String(Math.floor(n)).padStart(3, '0')

/** seconds -> 00:01:02,345 (sep ',') or 00:01:02.345 */
export function fmtClock(t: number, sep = ',', hours = true): string {
  const ms = Math.max(0, Math.round(t * 1000))
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000)
  return (hours || h ? p2(h) + ':' : '') + p2(m) + ':' + p2(s) + sep + p3(ms % 1000)
}
/** ASS uses h:mm:ss.cc (centiseconds) */
export function fmtAss(t: number): string {
  const cs = Math.max(0, Math.round(t * 100))
  const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100)
  return `${h}:${p2(m)}:${p2(s)}.${p2(cs % 100)}`
}
/** "01:02:03,456", "02:03.4", "1:02:03.45", "83.5" -> seconds */
export function parseClock(v: string): number {
  const t = v.trim().replace(',', '.')
  if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t)
  const parts = t.split(':')
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return NaN
  return parts.reduce((a, p) => a * 60 + parseFloat(p), 0)
}

/* ---------------- text helpers ---------------- */
const decodeEntities = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&')
const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** Remove HTML-ish tags (<i>, <font>) and ASS override blocks ({\an8}) */
export const plainText = (s: string) => decodeEntities(s.replace(/\{\\[^}]*\}/g, '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/\\N/gi, '\n').replace(/\\h/g, ' ')
/** Keep simple <i>/<b>/<u> but convert ASS tags to them */
const assToHtml = (s: string) => s.replace(/\\N/gi, '\n').replace(/\\n/g, '\n').replace(/\\h/g, ' ').replace(/\{\\i1\}/g, '<i>').replace(/\{\\i0?\}/g, '</i>').replace(/\{\\b1\}/g, '<b>').replace(/\{\\b0?\}/g, '</b>').replace(/\{\\u1\}/g, '<u>').replace(/\{\\u0?\}/g, '</u>').replace(/\{[^}]*\}/g, '')
const htmlToAss = (s: string) => s.replace(/<i>/gi, '{\\i1}').replace(/<\/i>/gi, '{\\i0}').replace(/<b>/gi, '{\\b1}').replace(/<\/b>/gi, '{\\b0}').replace(/<u>/gi, '{\\u1}').replace(/<\/u>/gi, '{\\u0}').replace(/<[^>]+>/g, '').replace(/\r?\n/g, '\\N')

const normNl = (s: string) => s.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
const clean = (cues: Cue[]) => cues.filter((c) => Number.isFinite(c.start) && Number.isFinite(c.end) && c.text.trim() !== '').map((c) => ({ ...c, end: Math.max(c.end, c.start) }))

/* ---------------- detection ---------------- */
export function detectFormat(text: string, name = ''): SubFormat {
  const ext = (name.split('.').pop() || '').toLowerCase()
  const t = normNl(text).trimStart()
  if (/^WEBVTT/.test(t)) return 'vtt'
  if (/^\[Script Info\]/i.test(t) || /^\s*\[V4\+? Styles\]/im.test(t)) return /ScriptType:\s*v4\.00\+/i.test(t) || /\[V4\+ Styles\]/i.test(t) ? 'ass' : 'ssa'
  if (/<sami/i.test(t)) return 'smi'
  if (/<tt[\s>]/i.test(t)) return 'ttml'
  if (/^[[{]/.test(t)) { try { JSON.parse(t); return 'json' } catch { /* not json */ } }
  if (/^\{\d+\}\{\d*\}/m.test(t)) return 'sub'
  if (/^\d+\s*\n\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->/m.test(t) || /^\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->/m.test(t)) return 'srt'
  if (/^"?(start|begin)"?[,;]/i.test(t)) return 'csv'
  if (/^\d+:\d{2}:\d{2}\.\d{3},\d+:\d{2}:\d{2}\.\d{3}\s*$/m.test(t)) return 'sbv'
  if (/^\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/m.test(t)) return 'lrc'
  const byExt: Record<string, SubFormat> = { srt: 'srt', vtt: 'vtt', ass: 'ass', ssa: 'ssa', sbv: 'sbv', sub: 'sub', lrc: 'lrc', smi: 'smi', sami: 'smi', ttml: 'ttml', dfxp: 'ttml', xml: 'ttml', json: 'json', csv: 'csv', txt: 'txt' }
  return byExt[ext] || 'srt'
}

/* ---------------- WebVTT text escaping ---------------- */
// WebVTT cue text is HTML-like: a literal & or < has to be written as &amp; or &lt;, and readers turn them back.
const VTT_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', nbsp: '\u00a0', lrm: '\u200e', rlm: '\u200f', quot: '"', apos: "'" }
export function vttDecode(t: string): string {
  return t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m }
    return VTT_ENTITIES[e.toLowerCase()] ?? m
  })
}
/** Escape & and any < that does not open a WebVTT tag (b, i, u, c, v, lang, ruby, rt, or a timestamp). */
export function vttEncode(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/<(?!\/?(?:b|i|u|c|v|lang|ruby|rt)\b|\d+:\d{2})/gi, '&lt;')
}

/* ---------------- parsers ---------------- */
function parseSrtLike(text: string): Cue[] {
  const blocks = normNl(text).replace(/^WEBVTT[^\n]*\n/, '').split(/\n{2,}/)
  const cues: Cue[] = []
  for (const b of blocks) {
    const lines = b.split('\n').filter((l, i) => i > 0 || l.trim() !== '')
    const ti = lines.findIndex((l) => l.includes('-->'))
    if (ti < 0) continue
    const m = lines[ti].match(/((?:\d+:)?\d{1,2}:\d{2}(?:[,.]\d{1,3})?)\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}(?:[,.]\d{1,3})?)/)
    if (!m) continue
    const txt = lines.slice(ti + 1).join('\n').trim()
    cues.push({ start: parseClock(m[1]), end: parseClock(m[2]), text: txt })
  }
  return cues
}

function parseAss(text: string): { cues: Cue[]; header: string } {
  const lines = normNl(text).split('\n').map((l) => l.replace(/^[ \t]+/, ''))
  let fmt: string[] = ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text']
  const cues: Cue[] = []
  let headerEnd = lines.length
  let inEvents = false
  lines.forEach((l, i) => {
    if (/^\[Events\]/i.test(l.trim())) { inEvents = true; headerEnd = Math.min(headerEnd, i); return }
    if (/^\[.*\]$/.test(l.trim())) { inEvents = false; return }
    if (!inEvents) return
    const fm = l.match(/^Format:\s*(.*)$/i)
    if (fm) { fmt = fm[1].split(',').map((s) => s.trim().toLowerCase()); return }
    const dm = l.match(/^Dialogue:\s*(.*)$/i)
    if (!dm) return
    const parts = dm[1].split(',')
    const textIdx = fmt.indexOf('text')
    const vals = parts.slice(0, textIdx).concat(parts.slice(textIdx).join(','))
    const get = (k: string) => vals[fmt.indexOf(k)] ?? ''
    cues.push({ start: parseClock(get('start')), end: parseClock(get('end')), text: assToHtml(get('text')), style: get('style') || undefined, actor: get('name') || undefined })
  })
  return { cues, header: lines.slice(0, headerEnd).join('\n').trim() }
}

function parseSbv(text: string): Cue[] {
  return normNl(text).split(/\n{2,}/).map((b) => {
    const [time, ...rest] = b.trim().split('\n')
    const m = time?.match(/^(\d+:\d{2}:\d{2}\.\d{1,3}),(\d+:\d{2}:\d{2}\.\d{1,3})/)
    return m ? { start: parseClock(m[1]), end: parseClock(m[2]), text: rest.join('\n').replace(/\[br\]/gi, '\n') } : null
  }).filter(Boolean) as Cue[]
}

function parseMicroDvd(text: string, fps: number): Cue[] {
  const cues: Cue[] = []
  for (const l of normNl(text).split('\n')) {
    const m = l.match(/^\{(\d+)\}\{(\d*)\}(.*)$/)
    if (!m) continue
    const a = +m[1], b = m[2] ? +m[2] : a + fps * 2
    if (a === 1 && b === 1 && /^\d+(\.\d+)?$/.test(m[3].trim())) { fps = parseFloat(m[3]); continue }
    const txt = m[3].replace(/\{[^}]*\}/g, '').split('|').join('\n')
    cues.push({ start: a / fps, end: b / fps, text: txt })
  }
  return cues
}

function parseLrc(text: string): Cue[] {
  const raw: { t: number; text: string }[] = []
  let offset = 0
  for (const l of normNl(text).split('\n')) {
    const off = l.match(/^\[offset:\s*([+-]?\d+)\]/i); if (off) { offset = +off[1] / 1000; continue }
    const tags = [...l.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
    if (!tags.length) continue
    const body = l.replace(/\[[^\]]*\]/g, '').replace(/<\d+:\d+(?:\.\d+)?>/g, '').trim()
    for (const t of tags) {
      const frac = t[3] ? parseFloat('0.' + t[3]) : 0
      raw.push({ t: +t[1] * 60 + +t[2] + frac - offset, text: body })
    }
  }
  raw.sort((a, b) => a.t - b.t)
  return raw.map((r, i) => ({ start: Math.max(0, r.t), end: raw[i + 1] ? raw[i + 1].t : r.t + 4, text: r.text }))
}

function parseSami(text: string): Cue[] {
  const syncs = [...normNl(text).matchAll(/<sync[^>]*start\s*=\s*"?(\d+)"?[^>]*>([\s\S]*?)(?=<sync|<\/body|$)/gi)]
  const raw = syncs.map((m) => ({ t: +m[1] / 1000, text: plainText(m[2].replace(/<p[^>]*>/gi, '').replace(/\n/g, ' ')).replace(/[ \t]+/g, ' ').trim() }))
  const cues: Cue[] = []
  raw.forEach((r, i) => { if (r.text) cues.push({ start: r.t, end: raw[i + 1] ? raw[i + 1].t : r.t + 4, text: r.text }) })
  return cues
}

function ttmlTime(v: string | null, fps = 30, tickRate = 10000000): number {
  if (!v) return NaN
  const s = v.trim()
  let m = s.match(/^(\d+):(\d{2}):(\d{2})(?:\.(\d+))?$/)
  if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3] + (m[4] ? parseFloat('0.' + m[4]) : 0)
  m = s.match(/^(\d+):(\d{2}):(\d{2}):(\d+)$/)
  if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / fps
  m = s.match(/^([\d.]+)(h|m|s|ms|f|t)$/)
  if (m) { const n = parseFloat(m[1]); return { h: n * 3600, m: n * 60, s: n, ms: n / 1000, f: n / fps, t: n / tickRate }[m[2] as 'h']! }
  return parseClock(s)
}

function parseTtml(text: string): Cue[] {
  const cues: Cue[] = []
  const fps = +(text.match(/frameRate="(\d+)"/)?.[1] ?? 30)
  const tick = +(text.match(/tickRate="(\d+)"/)?.[1] ?? 10000000)
  for (const m of normNl(text).matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)) {
    const attrs = m[1]
    const a = (k: string) => attrs.match(new RegExp(`\\b${k}="([^"]*)"`))?.[1] ?? null
    const start = ttmlTime(a('begin'), fps, tick)
    let end = ttmlTime(a('end'), fps, tick)
    if (!Number.isFinite(end)) end = start + ttmlTime(a('dur'), fps, tick)
    const body = plainText(m[2].replace(/\n\s*/g, ' ').replace(/<br\s*\/?>/gi, '\n')).replace(/[ \t]+/g, ' ').split('\n').map((x) => x.trim()).join('\n').trim()
    cues.push({ start, end, text: body })
  }
  return cues
}

function parseJson(text: string): Cue[] {
  const d = JSON.parse(text)
  const arr: any[] = Array.isArray(d) ? d : d.cues || d.subtitles || d.segments || d.events || d.chunks || []
  const num = (v: any) => (typeof v === 'number' ? (v > 100000 ? v / 1000 : v) : parseClock(String(v ?? '')))
  return arr.map((c) => {
    if (Array.isArray(c.timestamp)) return { start: num(c.timestamp[0]), end: num(c.timestamp[1] ?? c.timestamp[0]), text: String(c.text ?? '') }
    const start = c.startMs != null ? c.startMs / 1000 : num(c.start ?? c.begin ?? c.from ?? c.startTime)
    let end = c.endMs != null ? c.endMs / 1000 : num(c.end ?? c.to ?? c.endTime)
    if (!Number.isFinite(end) && c.duration != null) end = start + num(c.duration)
    return { start, end, text: String(c.text ?? c.content ?? c.caption ?? '') }
  })
}

/** Minimal CSV reader with quotes */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false
  const t = normNl(text)
  const delim = (t.split('\n')[0].match(/;/g)?.length ?? 0) > (t.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ','
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += ch }
    else if (ch === '"') q = true
    else if (ch === delim) { row.push(cell); cell = '' }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += ch
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim()))
}

function parseCsv(text: string): Cue[] {
  const rows = parseCsvRows(text)
  if (!rows.length) return []
  const head = rows[0].map((h) => h.trim().toLowerCase())
  const hasHead = head.some((h) => /start|begin|text/.test(h))
  const si = hasHead ? head.findIndex((h) => /start|begin/.test(h)) : 0
  const ei = hasHead ? head.findIndex((h) => /end|stop/.test(h)) : 1
  const ti = hasHead ? head.findIndex((h) => /text|caption|subtitle|line/.test(h)) : 2
  return rows.slice(hasHead ? 1 : 0).map((r) => ({ start: parseClock(r[si] ?? ''), end: parseClock(r[ei] ?? ''), text: (r[ti] ?? '').replace(/\\n/g, '\n') }))
}

function parseTxt(text: string): Cue[] {
  const paras = normNl(text).split(/\n{2,}|\n/).map((s) => s.trim()).filter(Boolean)
  let t = 0
  return paras.map((p) => { const d = Math.max(1.5, Math.min(7, p.split(/\s+/).length * 0.4)); const c = { start: t, end: t + d, text: p }; t += d + 0.1; return c })
}

export function parseSubtitles(text: string, opts: { name?: string; format?: SubFormat; fps?: number } = {}): SubDoc {
  const format = opts.format ?? detectFormat(text, opts.name)
  let cues: Cue[] = []
  let assHeader: string | undefined
  switch (format) {
    case 'srt': cues = parseSrtLike(text); break
    case 'vtt': cues = parseSrtLike(text).map((c) => ({ ...c, text: vttDecode(c.text) })); break
    case 'ass': case 'ssa': { const r = parseAss(text); cues = r.cues; assHeader = r.header; break }
    case 'sbv': cues = parseSbv(text); break
    case 'sub': cues = parseMicroDvd(text, opts.fps ?? 23.976); break
    case 'lrc': cues = parseLrc(text); break
    case 'smi': cues = parseSami(text); break
    case 'ttml': cues = parseTtml(text); break
    case 'json': cues = parseJson(text); break
    case 'csv': cues = parseCsv(text); break
    case 'txt': cues = parseTxt(text); break
  }
  cues = clean(cues).sort((a, b) => a.start - b.start)
  if (!cues.length) throw new Error(`No subtitle lines were found. The file does not look like valid ${format.toUpperCase()}.`)
  return { cues, format, assHeader }
}

/* ---------------- writers ---------------- */
export interface WriteOpts { fps?: number; stripTags?: boolean; assHeader?: string; title?: string; lang?: string; assStyle?: { font: string; size: number; primary: string; outline: string } }

const tx = (c: Cue, o: WriteOpts) => (o.stripTags ? plainText(c.text) : c.text).trim()
const csvCell = (s: string) => (/[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s)
/** #RRGGBB -> &H00BBGGRR */
const assColor = (hex: string) => { const h = hex.replace('#', '').padEnd(6, '0'); return `&H00${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase() }

function defaultAssHeader(o: WriteOpts, ssa: boolean) {
  const st = o.assStyle ?? { font: 'Arial', size: 48, primary: '#FFFFFF', outline: '#000000' }
  if (ssa) return `[Script Info]\nTitle: ${o.title ?? 'Subtitles'}\nScriptType: v4.00\nPlayResX: 1920\nPlayResY: 1080\n\n[V4 Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, TertiaryColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, AlphaLevel, Encoding\nStyle: Default,${st.font},${st.size},${parseInt(assColor(st.primary).slice(4), 16)},65535,${parseInt(assColor(st.outline).slice(4), 16)},0,0,0,1,2,1,2,20,20,40,0,1`
  return `[Script Info]\nTitle: ${o.title ?? 'Subtitles'}\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${st.font},${st.size},${assColor(st.primary)},&H000000FF,${assColor(st.outline)},&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,20,20,40,1`
}

export function writeSubtitles(cues: Cue[], format: SubFormat, o: WriteOpts = {}): string {
  const list = [...cues].sort((a, b) => a.start - b.start)
  switch (format) {
    case 'srt': return list.map((c, i) => `${i + 1}\n${fmtClock(c.start)} --> ${fmtClock(c.end)}\n${tx(c, o)}\n`).join('\n')
    case 'vtt': return 'WEBVTT\n\n' + list.map((c) => `${fmtClock(c.start, '.')} --> ${fmtClock(c.end, '.')}\n${vttEncode(tx(c, o))}\n`).join('\n')
    case 'ass': case 'ssa': {
      const ssa = format === 'ssa'
      const keep = o.assHeader && (ssa ? !/\[V4\+ Styles\]/i.test(o.assHeader) : /\[V4\+ Styles\]/i.test(o.assHeader))
      const head = keep ? o.assHeader! : defaultAssHeader(o, ssa)
      const fmt = ssa ? 'Format: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text' : 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
      const lines = list.map((c) => `Dialogue: ${ssa ? 'Marked=0' : '0'},${fmtAss(c.start)},${fmtAss(c.end)},${c.style || 'Default'},${c.actor || ''},0,0,0,,${o.stripTags ? plainText(c.text).replace(/\n/g, '\\N') : htmlToAss(c.text)}`)
      return `${head}\n\n[Events]\n${fmt}\n${lines.join('\n')}\n`
    }
    case 'sbv': return list.map((c) => `${fmtClock(c.start, '.', true).replace(/^0(\d):/, '$1:')},${fmtClock(c.end, '.', true).replace(/^0(\d):/, '$1:')}\n${tx(c, o)}\n`).join('\n')
    case 'sub': { const fps = o.fps ?? 23.976; return list.map((c) => `{${Math.round(c.start * fps)}}{${Math.round(c.end * fps)}}${plainText(c.text).split('\n').join('|')}`).join('\n') + '\n' }
    case 'lrc': {
      const t = (s: number) => { const cs = Math.round(s * 100); return `[${p2(Math.floor(cs / 6000))}:${p2(Math.floor(cs / 100) % 60)}.${p2(cs % 100)}]` }
      const out: string[] = o.title ? [`[ti:${o.title}]`] : []
      list.forEach((c, i) => { out.push(t(c.start) + plainText(c.text).replace(/\n/g, ' ')); const next = list[i + 1]; if (!next || next.start - c.end > 0.5) out.push(t(c.end)) })
      return out.join('\n') + '\n'
    }
    case 'smi': {
      const body = list.map((c, i) => { const next = list[i + 1]; const gap = !next || next.start - c.end > 0.01; return `<SYNC Start=${Math.round(c.start * 1000)}><P Class=${(o.lang || 'en').toUpperCase()}CC>${escXml(plainText(c.text)).replace(/\n/g, '<br>')}${gap ? `\n<SYNC Start=${Math.round(c.end * 1000)}><P Class=${(o.lang || 'en').toUpperCase()}CC>&nbsp;` : ''}` }).join('\n')
      return `<SAMI>\n<HEAD>\n<TITLE>${escXml(o.title ?? 'Subtitles')}</TITLE>\n<STYLE TYPE="text/css">\n<!--\nP { font-family: Arial; text-align: center; }\n.${(o.lang || 'en').toUpperCase()}CC { Name: English; lang: ${o.lang || 'en'}; }\n-->\n</STYLE>\n</HEAD>\n<BODY>\n${body}\n</BODY>\n</SAMI>\n`
    }
    case 'ttml': {
      const t = (s: number) => fmtClock(s, '.')
      const ps = list.map((c, i) => `      <p xml:id="c${i + 1}" begin="${t(c.start)}" end="${t(c.end)}">${escXml(plainText(c.text)).replace(/\n/g, '<br/>')}</p>`).join('\n')
      return `<?xml version="1.0" encoding="UTF-8"?>\n<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="${o.lang || 'en'}">\n  <body>\n    <div>\n${ps}\n    </div>\n  </body>\n</tt>\n`
    }
    case 'json': return JSON.stringify(list.map((c) => ({ start: +c.start.toFixed(3), end: +c.end.toFixed(3), text: tx(c, o) })), null, 2)
    case 'csv': return 'start,end,text\n' + list.map((c) => `${fmtClock(c.start, '.')},${fmtClock(c.end, '.')},${csvCell(tx(c, o))}`).join('\n') + '\n'
    case 'txt': return list.map((c) => plainText(c.text).trim()).join('\n') + '\n'
  }
}

/* ---------------- timing tools ---------------- */
export const shiftCues = (cues: Cue[], sec: number) => cues.map((c) => ({ ...c, start: Math.max(0, c.start + sec), end: Math.max(0, c.end + sec) }))
/** Frame-rate fix: times scale by from/to (e.g. 25 -> 23.976 PAL speed-up fix). */
export const scaleCues = (cues: Cue[], factor: number, anchor = 0) => cues.map((c) => ({ ...c, start: Math.max(0, anchor + (c.start - anchor) * factor), end: Math.max(0, anchor + (c.end - anchor) * factor) }))
/** Two-point sync: the cue at a1 should be at b1, the cue at a2 should be at b2. Linear map. */
export function twoPointSync(cues: Cue[], a1: number, b1: number, a2: number, b2: number): Cue[] {
  if (a2 === a1) throw new Error('Pick two different reference lines.')
  const k = (b2 - b1) / (a2 - a1)
  const f = (t: number) => Math.max(0, b1 + (t - a1) * k)
  return cues.map((c) => ({ ...c, start: f(c.start), end: f(c.end) }))
}
/** Make sure no cue overlaps the next and each lasts at least `min` seconds. */
export function fixOverlaps(cues: Cue[], min = 0.3, gap = 0.04): Cue[] {
  const s = [...cues].sort((a, b) => a.start - b.start).map((c) => ({ ...c }))
  for (let i = 0; i < s.length; i++) {
    if (s[i].end - s[i].start < min) s[i].end = s[i].start + min
    const n = s[i + 1]
    if (n && s[i].end > n.start - gap) s[i].end = Math.max(s[i].start + 0.05, n.start - gap)
  }
  return s
}
/** Characters per second, a common readability check. */
export const cps = (c: Cue) => plainText(c.text).replace(/\s+/g, '').length / Math.max(0.001, c.end - c.start)
