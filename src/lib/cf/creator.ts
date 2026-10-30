/* Creator helpers: hashtag candidates, title truncation, giveaway draws, caption (ASS) styling, safe zones.
 * Pure functions for Node tests. */

const STOP = new Set('a an the and or but if then of to in on at by for with from as is are was were be been being this that these those it its into over under than so such not no can could would should will may might must do does did have has had which who whom whose what when where why how there their they them he she his her we our you your i me my also very more most many much some any each other about after before between during through while because just like get got make made really still even only new one two three all out up down off its im youre dont cant wont ive weve'.split(' '))

export const toTag = (s: string, style: 'camel' | 'lower' | 'pascal' = 'pascal') => {
  const words = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
  if (!words.length) return ''
  const body = style === 'lower' ? words.join('').toLowerCase() : words.map((w, i) => (style === 'camel' && i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join('')
  return '#' + body
}
/** Candidate phrases from a text: frequent words and two-word phrases without stop words. */
export function candidatePhrases(text: string, max = 40) {
  const words = (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? []).map((w) => w.replace(/'s$/, ''))
  const f = new Map<string, number>()
  for (let i = 0; i < words.length; i++) {
    const w = words[i]; if (STOP.has(w) || w.length < 3 || /^\d+$/.test(w)) continue
    f.set(w, (f.get(w) ?? 0) + 1)
    const n = words[i + 1]; if (n && !STOP.has(n) && n.length >= 3 && !/^\d+$/.test(n)) f.set(`${w} ${n}`, (f.get(`${w} ${n}`) ?? 0) + 1.5)
  }
  return [...f.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, max).map(([p, s]) => ({ phrase: p, score: s }))
}
/** A compact built-in list of broad community hashtags by topic, used to suggest reach tags. */
export const TOPIC_TAGS: Record<string, string[]> = {
  travel: ['travel', 'wanderlust', 'travelgram', 'roadtrip', 'adventure', 'explore', 'vacation', 'backpacking', 'solotravel', 'travelphotography'],
  food: ['food', 'foodie', 'recipe', 'homecooking', 'healthyfood', 'vegan', 'baking', 'streetfood', 'dessert', 'foodphotography'],
  fitness: ['fitness', 'workout', 'gym', 'running', 'yoga', 'health', 'fitnessmotivation', 'homeworkout', 'strengthtraining', 'wellness'],
  tech: ['tech', 'technology', 'coding', 'programming', 'developer', 'ai', 'opensource', 'webdev', 'javascript', 'productivity'],
  business: ['business', 'entrepreneur', 'startup', 'marketing', 'smallbusiness', 'leadership', 'branding', 'sales', 'career', 'growth'],
  photo: ['photography', 'photooftheday', 'naturephotography', 'portrait', 'streetphotography', 'landscape', 'sunset', 'mobilephotography', 'camera', 'editing'],
  art: ['art', 'artist', 'drawing', 'illustration', 'design', 'digitalart', 'painting', 'sketch', 'creative', 'graphicdesign'],
  music: ['music', 'musician', 'newmusic', 'singer', 'producer', 'guitar', 'piano', 'hiphop', 'cover', 'livemusic'],
  education: ['education', 'learning', 'study', 'students', 'teacher', 'studytips', 'science', 'books', 'reading', 'edtech'],
  fashion: ['fashion', 'style', 'ootd', 'outfit', 'streetstyle', 'beauty', 'makeup', 'skincare', 'model', 'shopping'],
  pets: ['pets', 'dog', 'cat', 'dogsofinstagram', 'catsofinstagram', 'puppy', 'petlovers', 'animals', 'kitten', 'adoptdontshop'],
  nature: ['nature', 'outdoors', 'hiking', 'mountains', 'ocean', 'forest', 'wildlife', 'garden', 'sustainability', 'climate'],
  gaming: ['gaming', 'gamer', 'videogames', 'twitch', 'esports', 'pcgaming', 'playstation', 'xbox', 'nintendo', 'streamer'],
  finance: ['finance', 'money', 'investing', 'personalfinance', 'budget', 'stocks', 'savings', 'financialfreedom', 'crypto', 'wealth'],
  parenting: ['parenting', 'family', 'momlife', 'dadlife', 'kids', 'baby', 'toddler', 'motherhood', 'familytime', 'parentingtips'],
  diy: ['diy', 'crafts', 'homedecor', 'handmade', 'interiordesign', 'woodworking', 'upcycling', 'homeimprovement', 'gardening', 'makers'],
}
export const PLATFORM_TAG_LIMITS: Record<string, { label: string; max: number; best: number; note: string }> = {
  instagram: { label: 'Instagram', max: 30, best: 5, note: 'Up to 30 allowed. 3 to 5 focused tags work best now.' },
  tiktok: { label: 'TikTok', max: 100, best: 5, note: 'Tags count toward the caption limit. 3 to 5 is plenty.' },
  youtube: { label: 'YouTube', max: 15, best: 3, note: 'More than 15 and all are ignored. The first 3 show above the title.' },
  x: { label: 'X', max: 10, best: 2, note: 'One or two tags. More looks like spam.' },
  linkedin: { label: 'LinkedIn', max: 10, best: 3, note: '3 to 5 broad professional tags.' },
  threads: { label: 'Threads', max: 1, best: 1, note: 'Threads allows one topic tag per post.' },
  pinterest: { label: 'Pinterest', max: 20, best: 5, note: 'Keywords in the description matter more than tags.' },
}
/** Score built-in topics by word overlap (quick mode). */
export function topicGuess(text: string) {
  const lw = ' ' + text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ') + ' '
  return Object.entries(TOPIC_TAGS).map(([k, tags]) => ({ topic: k, score: tags.reduce((s, t) => s + (lw.includes(' ' + t + ' ') ? 2 : lw.includes(t) ? 1 : 0), 0) + (lw.includes(' ' + k) ? 3 : 0) })).sort((a, b) => b.score - a.score)
}
export function existingTags(text: string) { return [...new Set((text.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.toLowerCase()))] }

/* ---------------- title truncation ---------------- */
export const TITLE_LIMITS = [
  { id: 'yt-search', label: 'YouTube search (desktop)', chars: 100, px: 525, size: 18 },
  { id: 'yt-home', label: 'YouTube home feed', chars: 60, px: 330, size: 14 },
  { id: 'yt-mobile', label: 'YouTube mobile', chars: 55, px: 300, size: 14 },
  { id: 'google', label: 'Google result', chars: 60, px: 580, size: 20 },
  { id: 'x-card', label: 'X link card', chars: 70, px: 480, size: 15 },
  { id: 'linkedin', label: 'LinkedIn link card', chars: 120, px: 520, size: 14 },
  { id: 'facebook', label: 'Facebook link card', chars: 88, px: 500, size: 16 },
  { id: 'podcast', label: 'Podcast apps', chars: 64, px: 320, size: 15 },
]
export const DESC_LIMITS = [
  { id: 'yt-desc', label: 'YouTube description above "more"', chars: 157 },
  { id: 'meta', label: 'Search snippet', chars: 155 },
  { id: 'ig-caption', label: 'Instagram caption before "more"', chars: 125 },
  { id: 'tiktok', label: 'TikTok caption in feed', chars: 100 },
]

/* ---------------- giveaway ---------------- */
export interface Entry { name: string; text: string; line: number }
/** Read comment exports: one entry per line, "@user: comment", "user, comment" CSV or plain names. */
export function parseEntries(text: string): Entry[] {
  return text.replace(/\r/g, '').split('\n').map((l, i) => ({ l: l.trim(), i })).filter(({ l }) => l).map(({ l, i }) => {
    const m = l.match(/^@?([\w.]{2,40})\s*[:,\t-]\s*(.*)$/) ?? l.match(/^@([\w.]{2,40})\s+(.*)$/)
    return m ? { name: m[1], text: m[2], line: i + 1 } : { name: l.split(/\s+/)[0].replace(/^@/, ''), text: l, line: i + 1 }
  })
}
export function filterEntries(es: Entry[], o: { unique: boolean; mustInclude?: string; minMentions?: number; exclude?: string[] }) {
  let out = es
  if (o.exclude?.length) { const ex = new Set(o.exclude.map((x) => x.toLowerCase().replace(/^@/, ''))); out = out.filter((e) => !ex.has(e.name.toLowerCase())) }
  if (o.mustInclude?.trim()) { const k = o.mustInclude.toLowerCase(); out = out.filter((e) => e.text.toLowerCase().includes(k)) }
  if (o.minMentions) out = out.filter((e) => (e.text.match(/@[\w.]+/g) ?? []).length >= o.minMentions!)
  if (o.unique) { const seen = new Set<string>(); out = out.filter((e) => { const k = e.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true }) }
  return out
}
/** Fair draw with crypto randomness (rejection sampling, no modulo bias). */
export function drawWinners<T>(list: T[], n: number, rand: (max: number) => number = cryptoInt): T[] {
  const pool = [...list], out: T[] = []
  while (out.length < Math.min(n, pool.length + out.length) && pool.length) { const i = rand(pool.length); out.push(pool.splice(i, 1)[0]) }
  return out
}
export function cryptoInt(max: number) {
  const lim = Math.floor(0x100000000 / max) * max, b = new Uint32Array(1)
  do crypto.getRandomValues(b); while (b[0] >= lim)
  return b[0] % max
}

/* ---------------- captions ---------------- */
export interface Cue { start: number; end: number; text: string }
const tc = (s: string) => { const m = s.trim().replace(',', '.').match(/(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)/); return m ? (+(m[1] ?? 0)) * 3600 + +m[2] * 60 + +m[3] : NaN }
export function parseSubs(text: string): Cue[] {
  const t = text.replace(/\r/g, '').replace(/^WEBVTT[^\n]*\n/, '')
  const out: Cue[] = []
  for (const block of t.split(/\n{2,}/)) {
    const lines = block.split('\n').filter(Boolean); const i = lines.findIndex((l) => l.includes('-->')); if (i < 0) continue
    const [a, b] = lines[i].split('-->'); const s = tc(a), e = tc(b.split(/\s/).filter(Boolean)[0] ?? '')
    if (isFinite(s) && isFinite(e)) out.push({ start: s, end: e, text: lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '') })
  }
  return out
}
const assTime = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${h}:${String(m).padStart(2, '0')}:${x.toFixed(2).padStart(5, '0')}` }
const assColor = (hex: string, alpha = 0) => { const h = hex.replace('#', ''); return `&H${alpha.toString(16).padStart(2, '0').toUpperCase()}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase() }
export interface CapStyle { font: string; size: number; color: string; outline: string; outlineW: number; box: boolean; boxColor: string; boxAlpha: number; bold: boolean; upper: boolean; pos: 'bottom' | 'middle' | 'top'; marginV: number; words: number; highlight: string; karaoke: boolean }
/** Split cues into short chunks of n words with evenly spread timing (the short-form caption look). */
export function chunkCues(cues: Cue[], n: number): (Cue & { words: string[] })[] {
  const out: (Cue & { words: string[] })[] = []
  for (const c of cues) {
    const ws = c.text.replace(/\n/g, ' ').split(/\s+/).filter(Boolean); if (!ws.length) continue
    const per = (c.end - c.start) / ws.length
    if (n <= 0 || ws.length <= n) { out.push({ ...c, words: ws }); continue }
    for (let i = 0; i < ws.length; i += n) out.push({ start: c.start + i * per, end: Math.min(c.end, c.start + (i + n) * per), text: ws.slice(i, i + n).join(' '), words: ws.slice(i, i + n) })
  }
  return out
}
export function toAss(cues: Cue[], st: CapStyle, w = 1080, h = 1920) {
  const align = st.pos === 'bottom' ? 2 : st.pos === 'middle' ? 5 : 8
  const back = st.box ? assColor(st.boxColor, Math.round(255 * (1 - st.boxAlpha))) : '&H80000000'
  const head = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${w}\nPlayResY: ${h}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${st.font},${st.size},${assColor(st.color)},${assColor(st.highlight)},${st.box ? back : assColor(st.outline)},${back},${st.bold ? -1 : 0},0,0,0,100,100,0,0,${st.box ? 3 : 1},${st.box ? Math.max(4, st.outlineW) : st.outlineW},0,${align},60,60,${st.marginV},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`
  const lines = chunkCues(cues, st.words).map((c) => {
    let txt = (st.upper ? c.text.toUpperCase() : c.text).replace(/\n/g, '\\N').replace(/[{}]/g, '')
    if (st.karaoke && c.words.length > 1) { const d = Math.round(((c.end - c.start) * 100) / c.words.length); txt = c.words.map((x) => `{\\k${d}}${st.upper ? x.toUpperCase() : x}`).join(' ') }
    return `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${txt}`
  })
  return head + lines.join('\n') + '\n'
}
export function toSrt(cues: Cue[]) { const t = (s: number) => { const ms = Math.round(s * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}` }; return cues.map((c, i) => `${i + 1}\n${t(c.start)} --> ${t(c.end)}\n${c.text}\n`).join('\n') }

/* ---------------- safe zones (percent of the frame) ---------------- */
export const SAFE_ZONES: Record<string, { label: string; ratio: string; zones: { name: string; x: number; y: number; w: number; h: number }[] }> = {
  reels: { label: 'Instagram Reels', ratio: '9:16', zones: [{ name: 'Top bar', x: 0, y: 0, w: 100, h: 14 }, { name: 'Caption and audio', x: 0, y: 66, w: 100, h: 34 }, { name: 'Buttons', x: 83, y: 38, w: 17, h: 48 }] },
  tiktok: { label: 'TikTok', ratio: '9:16', zones: [{ name: 'Top tabs', x: 0, y: 0, w: 100, h: 9 }, { name: 'Caption and sound', x: 0, y: 72, w: 100, h: 28 }, { name: 'Buttons', x: 86, y: 32, w: 14, h: 50 }] },
  shorts: { label: 'YouTube Shorts', ratio: '9:16', zones: [{ name: 'Top', x: 0, y: 0, w: 100, h: 8 }, { name: 'Title and channel', x: 0, y: 74, w: 100, h: 26 }, { name: 'Buttons', x: 85, y: 35, w: 15, h: 55 }] },
  stories: { label: 'Instagram Stories', ratio: '9:16', zones: [{ name: 'Profile bar', x: 0, y: 0, w: 100, h: 14 }, { name: 'Reply bar', x: 0, y: 80, w: 100, h: 20 }] },
  'yt-thumb': { label: 'YouTube thumbnail', ratio: '16:9', zones: [{ name: 'Time stamp', x: 80, y: 82, w: 20, h: 18 }] },
  'feed-45': { label: 'Feed post 4:5', ratio: '4:5', zones: [{ name: 'Grid crop (1:1 shown in profile)', x: 0, y: 0, w: 100, h: 10 }, { name: 'Grid crop', x: 0, y: 90, w: 100, h: 10 }] },
}
