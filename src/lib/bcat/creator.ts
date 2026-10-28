/* Creator helpers: post length rules per platform, thread splitting, word frequencies, video chapters. Pure, unit tested. */

const seg = typeof Intl !== 'undefined' && (Intl as any).Segmenter ? new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' }) : null
export const graphemes = (s: string): string[] => (seg ? Array.from(seg.segment(s), (x: any) => x.segment as string) : Array.from(s))
const URL_RE = /\bhttps?:\/\/[^\s]+|\b(?:www\.)?[a-z0-9-]+\.(?:com|org|net|io|dev|app|co|in|uk|me|ai|ly|gg|tv)(?:\/[^\s]*)?/gi

/** Length as X counts it: links are 23, most CJK and emoji count 2. */
export function xLength(s: string) {
  let n = 0
  const rest = s.replace(URL_RE, () => { n += 23; return '' })
  for (const g of graphemes(rest)) { const cp = g.codePointAt(0)!; n += (cp <= 0x10ff || (cp >= 0x2000 && cp <= 0x200d) || (cp >= 0x2010 && cp <= 0x201f) || (cp >= 0x2032 && cp <= 0x2037)) ? 1 : 2 }
  return n
}
export const linkAs23 = (s: string) => { let n = 0; const rest = s.replace(URL_RE, () => { n += 23; return '' }); return n + Array.from(rest).length }
const GSM = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà', GSM_EXT = '^{}\\[~]|€'
export function smsInfo(s: string) {
  const gsm = [...s].every((c) => GSM.includes(c) || GSM_EXT.includes(c))
  const units = gsm ? [...s].reduce((n, c) => n + (GSM_EXT.includes(c) ? 2 : 1), 0) : s.length
  const single = gsm ? 160 : 70, multi = gsm ? 153 : 67
  return { encoding: gsm ? 'GSM-7' : 'Unicode', units, parts: units <= single ? (units ? 1 : 0) : Math.ceil(units / multi), perPart: units <= single ? single : multi }
}

export interface Platform { id: string; name: string; limit: number; fold?: number; count: (s: string) => number; note?: string }
export const PLATFORMS: Platform[] = [
  { id: 'x', name: 'X post', limit: 280, count: xLength, note: 'Links count as 23. Emoji and CJK count as 2.' },
  { id: 'threads', name: 'Threads', limit: 500, count: (s) => graphemes(s).length },
  { id: 'bluesky', name: 'Bluesky', limit: 300, count: (s) => graphemes(s).length },
  { id: 'mastodon', name: 'Mastodon', limit: 500, count: linkAs23, note: 'Links count as 23 on most servers.' },
  { id: 'linkedin', name: 'LinkedIn post', limit: 3000, fold: 210, count: (s) => s.length, note: 'About 210 characters show before "see more".' },
  { id: 'instagram', name: 'Instagram caption', limit: 2200, fold: 125, count: (s) => s.length, note: 'About 125 characters show before "more". Up to 30 hashtags.' },
  { id: 'facebook', name: 'Facebook post', limit: 63206, fold: 477, count: (s) => s.length },
  { id: 'tiktok', name: 'TikTok caption', limit: 4000, fold: 100, count: (s) => s.length },
  { id: 'youtube-title', name: 'YouTube title', limit: 100, fold: 70, count: (s) => s.length, note: 'Around 70 characters show in search.' },
  { id: 'youtube-desc', name: 'YouTube description', limit: 5000, fold: 157, count: (s) => s.length },
  { id: 'pinterest', name: 'Pinterest description', limit: 500, count: (s) => s.length },
  { id: 'meta', name: 'Search snippet (meta description)', limit: 160, count: (s) => s.length, note: 'Search results usually cut around 155 to 160 characters.' },
]
export const hashtags = (s: string) => s.match(/(^|\s)#[\p{L}\p{N}_]+/gu)?.map((x) => x.trim()) ?? []
export const mentions = (s: string) => s.match(/(^|\s)@[\w.]+/g)?.map((x) => x.trim()) ?? []

/** Split long text into numbered posts that each fit the limit, breaking at sentence then word boundaries. */
export function splitThread(text: string, limit = 280, count: (s: string) => number = xLength, number = true) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  const reserve = number ? 8 : 0
  const posts: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w
    if (count(next) + reserve > limit && cur) {
      const cut = Math.max(cur.lastIndexOf('. '), cur.lastIndexOf('? '), cur.lastIndexOf('! '))
      if (cut > cur.length * 0.6) { posts.push(cur.slice(0, cut + 1)); cur = cur.slice(cut + 2) + ' ' + w }
      else { posts.push(cur); cur = w }
    } else cur = next
  }
  if (cur) posts.push(cur)
  return number && posts.length > 1 ? posts.map((p, i) => `${p} ${i + 1}/${posts.length}`) : posts
}

/* ---------- word frequencies ---------- */
export const STOP = new Set('a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves also get got one two us like may might much many even well back way make made new use used using said says im dont cant its thats ive youre theyre wont didnt doesnt isnt arent wasnt de la le et les des en un une el los las del que'.split(' '))
export function wordFreq(text: string, opts: { min?: number; stop?: boolean; extraStop?: string[]; caseSensitive?: boolean } = {}) {
  const extra = new Set((opts.extraStop ?? []).map((w) => w.toLowerCase()))
  const m = new Map<string, number>()
  for (const raw of text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []) {
    const w = raw.replace(/['’]s$/i, '').replace(/['’-]+$/, '')
    const k = opts.caseSensitive ? w : w.toLowerCase()
    if (k.length < (opts.min ?? 3) || /^\d+$/.test(k)) continue
    if ((opts.stop ?? true) && (STOP.has(k.toLowerCase()) || extra.has(k.toLowerCase()))) continue
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()].map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
}

/* ---------- chapters ---------- */
export interface Chapter { start: number; title: string }
export function parseTime(t: string): number { const p = t.trim().split(':').map(Number); if (p.some((x) => !isFinite(x))) return NaN; return p.reduce((s, x) => s * 60 + x, 0) }
export function fmtChapterTime(s: number, forceHours = false) { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h || forceHours ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}` }
/** Read chapters from lines like "0:00 Intro", "1:02:03 - Topic", "Intro 00:00", or WebVTT / SRT cues. */
export function parseChapters(text: string): Chapter[] {
  const out: Chapter[] = []
  const cue = /(\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?\s*-->\s*[\d:.,]+\s*\n([^\n]+)/g
  if (cue.test(text)) { for (const m of text.matchAll(/((?:\d{1,2}:)?\d{1,2}:\d{2})(?:[.,]\d{1,3})?\s*-->\s*[\d:.,]+[^\n]*\n([^\n]+)/g)) out.push({ start: parseTime(m[1]), title: m[2].trim() }); return out }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*[[(]?((?:\d{1,2}:)?\d{1,2}:\d{2})[\])]?\s*[-\u2013:|.)]?\s*(.+?)\s*$/) ?? line.match(/^\s*(.+?)\s*[-\u2013:|(]?\s*[[(]?((?:\d{1,2}:)?\d{1,2}:\d{2})[\])]?\s*$/)
    if (!m) continue
    const [t, title] = /^\s*[[(]?\d/.test(line) && /\d:\d{2}/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]]
    out.push({ start: parseTime(t), title: title.trim() })
  }
  return out.filter((c) => isFinite(c.start)).sort((a, b) => a.start - b.start)
}
export function checkYouTube(cs: Chapter[]) {
  const issues: string[] = []
  if (!cs.length) return ['Add at least three chapters.']
  if (cs[0].start !== 0) issues.push('The first chapter must start at 0:00.')
  if (cs.length < 3) issues.push('YouTube needs at least three chapters.')
  cs.forEach((c, i) => { if (i && c.start - cs[i - 1].start < 10) issues.push(`"${c.title}" starts less than 10 seconds after the one before it.`) })
  if (new Set(cs.map((c) => c.start)).size !== cs.length) issues.push('Two chapters share the same start time.')
  return issues
}
export function toYouTube(cs: Chapter[]) { const h = cs.some((c) => c.start >= 3600); return cs.map((c) => `${fmtChapterTime(c.start, h)} ${c.title}`).join('\n') }
const vttTime = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${x.toFixed(3).padStart(6, '0')}` }
export function toVtt(cs: Chapter[], duration: number) { return 'WEBVTT\n\n' + cs.map((c, i) => `${i + 1}\n${vttTime(c.start)} --> ${vttTime(cs[i + 1]?.start ?? Math.max(duration, c.start + 1))}\n${c.title}`).join('\n\n') + '\n' }
export function toFfmetadata(cs: Chapter[], duration: number) { return ';FFMETADATA1\n' + cs.map((c, i) => `\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(c.start * 1000)}\nEND=${Math.round((cs[i + 1]?.start ?? Math.max(duration, c.start + 1)) * 1000)}\ntitle=${c.title.replace(/([=;#\\\n])/g, '\\$1')}`).join('\n') + '\n' }
export function toPodcastJson(cs: Chapter[]) { return JSON.stringify({ version: '1.2.0', chapters: cs.map((c) => ({ startTime: c.start, title: c.title })) }, null, 2) }
