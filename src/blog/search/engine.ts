// Blog search engine: query parser, typo tolerant scorer, snippets and highlight ranges.
// Plain TypeScript with no imports so it runs in the browser and in node tests (node --experimental-strip-types).
//
// Query syntax typed in the box:
//   pdf email          every word must match (AND), prefixes count: "comp" finds "compress"
//   "page range"       quoted phrase, words in that order
//   -video             leave out posts that mention a word
//   tag:pdf            only posts with that tag (repeat for more)
//   has:video          has:listen  has:quiz
//   time:<5  time:>=7  time:6       reading time in minutes

export interface SearchSection { id: string; h: string; text: string }
export interface SearchDoc {
  slug: string; title: string; description: string; tags: string[]; date: string; minutes: number
  video: boolean; listen: boolean; quiz: boolean
  sections?: SearchSection[]
}
export type HasKey = 'video' | 'listen' | 'quiz'
export interface TimeFilter { op: '<' | '<=' | '>' | '>=' | '='; n: number }
export interface ParsedQuery {
  terms: string[]; phrases: string[]; excludes: string[]; tags: string[]; has: HasKey[]; time: TimeFilter | null
  /** true when there is anything to match or filter on */
  active: boolean
  /** true when there is text to rank by (words or phrases) */
  textual: boolean
}
export interface Hit {
  doc: SearchDoc; score: number
  /** normalized words found in the post, used for highlighting */
  words: string[]
  phrases: string[]
  snippet: { text: string; id: string; h: string } | null
}

const HAS: HasKey[] = ['video', 'listen', 'quiz']
const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'it', 'with', 'how', 'what', 'my', 'i'])

/** Escape a string for use inside a RegExp. Backslash first, then the other special characters. */
export function escapeRegExp(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/[.*+?^${}()|[\]/-]/g, '\\$&')
}

/** Lowercase, drop accents, keep letters and digits. */
export function normalize(s: string): string {
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
export const tokenize = (s: string): string[] => { const n = normalize(s); return n ? n.split(' ') : [] }

export function parseQuery(input: string): ParsedQuery {
  const q: ParsedQuery = { terms: [], phrases: [], excludes: [], tags: [], has: [], time: null, active: false, textual: false }
  const re = /(-?)"([^"]*)"?|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(input))) {
    if (m[2] !== undefined) {
      const p = normalize(m[2])
      if (!p) continue
      if (m[1]) q.excludes.push(...p.split(' '))
      else if (p.includes(' ')) q.phrases.push(p)
      else q.terms.push(p)
      continue
    }
    const tok = m[3]
    const f = /^(tag|has|time|is):(.*)$/i.exec(tok)
    if (f) {
      const key = f[1].toLowerCase(), val = f[2].toLowerCase()
      if (key === 'tag' && val) { const t = val.replace(/^#/, ''); if (!q.tags.includes(t)) q.tags.push(t); continue }
      if ((key === 'has' || key === 'is') && (HAS as string[]).includes(val)) { if (!q.has.includes(val as HasKey)) q.has.push(val as HasKey); continue }
      if (key === 'time') {
        const t = /^(<=|>=|<|>|=)?(\d+(?:\.\d+)?)(?:m|min)?$/.exec(val)
        if (t) { q.time = { op: (t[1] || '=') as TimeFilter['op'], n: Number(t[2]) }; continue }
      }
      if (!val) continue // "tag:" while typing
    }
    if (tok.startsWith('-') && tok.length > 1) { q.excludes.push(...tokenize(tok.slice(1))); continue }
    if (tok.startsWith('#') && tok.length > 1) { const t = tok.slice(1).toLowerCase(); if (!q.tags.includes(t)) q.tags.push(t); continue }
    for (const w of tokenize(tok)) q.terms.push(w)
  }
  // drop stop words unless they are all there is
  const kept = q.terms.filter((t) => !STOP.has(t))
  if (kept.length) q.terms = kept
  q.textual = q.terms.length > 0 || q.phrases.length > 0
  q.active = q.textual || q.excludes.length > 0 || q.tags.length > 0 || q.has.length > 0 || q.time !== null
  return q
}

/** Damerau-Levenshtein (optimal string alignment) distance with an early exit above max. */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1
  const al = a.length, bl = b.length
  let p2: number[] = [], p1: number[] = Array.from({ length: bl + 1 }, (_, j) => j)
  for (let i = 1; i <= al; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(p1[j] + 1, cur[j - 1] + 1, p1[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1)
      cur[j] = v
      if (v < rowMin) rowMin = v
    }
    if (rowMin > max) return max + 1
    p2 = p1; p1 = cur
  }
  return p1[bl]
}

const allowedTypos = (len: number) => (len >= 8 ? 2 : len >= 4 ? 1 : 0)

/** How well a query term matches one word of the post: 1 exact, 0.85 prefix, 0.5 typo, 0.4 inside a word. */
export function matchWord(term: string, word: string): number {
  if (word === term) return 1
  if (term.length >= 2 && word.startsWith(term)) return 0.85 - Math.min(0.2, (word.length - term.length) * 0.02)
  const k = allowedTypos(term.length)
  if (k) {
    // compare against the word, or against its start when the term is a typo of a prefix ("compres" for "compression")
    const d = editDistance(term, word, k)
    if (d <= k) return d === 1 ? 0.55 : 0.4
    if (word.length > term.length + 1 && editDistance(term, word.slice(0, term.length), 1) <= 1) return 0.42
  }
  if (term.length >= 4 && word.includes(term)) return 0.4
  return 0
}

interface Field { words: string[]; text: string; weight: number; section?: SearchSection }
interface Prepared { doc: SearchDoc; fields: Field[]; vocab: Set<string> }

const cache = new WeakMap<SearchDoc, Prepared>()
function prepare(doc: SearchDoc): Prepared {
  const hit = cache.get(doc)
  if (hit) return hit
  const mk = (text: string, weight: number, section?: SearchSection): Field => { const n = normalize(text); return { words: n ? n.split(' ') : [], text: n, weight, section } }
  const fields: Field[] = [mk(doc.title, 10), mk(doc.tags.join(' '), 8), mk(doc.description, 4)]
  for (const s of doc.sections ?? []) {
    if (s.h) fields.push(mk(s.h, 3, s))
    fields.push(mk(s.text, 1, s))
  }
  const vocab = new Set<string>()
  for (const f of fields) for (const w of f.words) if (w.length > 1) vocab.add(w)
  const p = { doc, fields, vocab }
  cache.set(doc, p)
  return p
}

function passesFilters(doc: SearchDoc, q: ParsedQuery): boolean {
  if (q.tags.length && !q.tags.every((t) => doc.tags.includes(t))) return false
  if (q.has.length && !q.has.every((h) => doc[h])) return false
  if (q.time) {
    const { op, n } = q.time, m = doc.minutes
    if (!(op === '<' ? m < n : op === '<=' ? m <= n : op === '>' ? m > n : op === '>=' ? m >= n : m === n)) return false
  }
  return true
}

/** Score one post. Returns null when it does not match every word, phrase and filter. */
export function scoreDoc(doc: SearchDoc, q: ParsedQuery, mode: 'all' | 'any' = 'all'): Hit | null {
  if (!passesFilters(doc, q)) return null
  const p = prepare(doc)
  for (const ex of q.excludes) if (p.fields.some((f) => f.words.some((w) => w === ex || (ex.length >= 3 && w.startsWith(ex))))) return null
  let score = 0, matched = 0
  const words = new Set<string>()
  const sectionScore = new Map<SearchSection, number>()
  let titleHits = 0
  for (const term of q.terms) {
    let best = 0, bodyCount = 0
    for (const f of p.fields) {
      let fb = 0
      for (const w of f.words) {
        const s = matchWord(term, w)
        if (s > 0) { words.add(w); if (s > fb) fb = s; if (f.weight === 1) bodyCount++ }
      }
      if (fb > 0) {
        if (f.section) sectionScore.set(f.section, (sectionScore.get(f.section) ?? 0) + fb * f.weight)
        if (fb * f.weight > best) best = fb * f.weight
        if (f.weight === 10 && fb >= 0.85) titleHits++
      }
    }
    if (best === 0) { if (mode === 'all') return null; continue }
    matched++
    score += best + Math.log2(1 + bodyCount) * 0.6
  }
  const phrases: string[] = []
  for (const ph of q.phrases) {
    const re = new RegExp(`(^| )${escapeRegExp(ph)}( |$)`)
    let best = 0
    for (const f of p.fields) if (re.test(f.text)) { best = Math.max(best, f.weight * 1.3); if (f.section) sectionScore.set(f.section, (sectionScore.get(f.section) ?? 0) + f.weight * 2) }
    if (best === 0) { if (mode === 'all') return null; continue }
    matched++
    phrases.push(ph)
    score += best
  }
  if (mode === 'any' && q.textual && matched === 0) return null
  if (q.terms.length > 1 && titleHits >= q.terms.length) score += 6
  // newer posts win ties
  score += (Date.parse(doc.date) || 0) / 1e14
  return { doc, score, words: [...words], phrases, snippet: makeSnippet(p, words, phrases, sectionScore) }
}

export function search(docs: SearchDoc[], q: ParsedQuery, mode: 'all' | 'any' = 'all'): Hit[] {
  const out: Hit[] = []
  for (const d of docs) { const h = scoreDoc(d, q, mode); if (h) out.push(h) }
  return out.sort((a, b) => b.score - a.score)
}

const SNIP = 170
function makeSnippet(p: Prepared, words: Set<string>, phrases: string[], secScore: Map<SearchSection, number>): Hit['snippet'] {
  if (!words.size && !phrases.length) return null
  let best: SearchSection | null = null, bs = 0
  for (const [s, v] of secScore) if (v > bs) { bs = v; best = s }
  if (!best) return null
  const text = best.text
  const pats = [...phrases.map((ph) => ph.split(' ').map(escapeRegExp).join('[^a-z0-9]+')), ...[...words].map(escapeRegExp)]
  const re = new RegExp(`(?:^|[^a-z0-9])(${pats.join('|')})`, 'i')
  const m = re.exec(text.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''))
  if (!m) return { text: cut(text, 0), id: best.id, h: best.h }
  const at = m.index + m[0].length - m[1].length
  return { text: cut(text, at), id: best.id, h: best.h }
}
function cut(text: string, at: number): string {
  if (text.length <= SNIP) return text
  let start = Math.max(0, at - 60)
  if (start > 0) { const sp = text.indexOf(' ', start); start = sp > -1 && sp < at ? sp + 1 : start }
  let end = Math.min(text.length, start + SNIP)
  if (end < text.length) { const sp = text.lastIndexOf(' ', end); if (sp > at) end = sp }
  return (start > 0 ? '... ' : '') + text.slice(start, end).trim() + (end < text.length ? ' ...' : '')
}

/**
 * Split text into plain and matched parts for highlighting. Matches whole words from `words` (normalized)
 * and phrases. Returns ranges, never HTML, so the caller renders them as React text nodes.
 */
export function highlightParts(text: string, words: string[], phrases: string[] = []): { t: string; hit: boolean }[] {
  const pats = [...phrases.map((ph) => ph.split(' ').map(escapeRegExp).join('[^A-Za-z0-9]+')), ...words.filter(Boolean).sort((a, b) => b.length - a.length).map(escapeRegExp)]
  if (!pats.length || !text) return [{ t: text, hit: false }]
  const re = new RegExp(`(?<![A-Za-z0-9])(?:${pats.join('|')})(?![A-Za-z0-9])`, 'gi')
  const out: { t: string; hit: boolean }[] = []
  let last = 0, m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (!m[0]) { re.lastIndex++; continue }
    if (m.index > last) out.push({ t: text.slice(last, m.index), hit: false })
    out.push({ t: m[0], hit: true })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ t: text.slice(last), hit: false })
  return out
}

/** "Did you mean": swap each word that matches nothing for the closest word in the posts. */
export function suggestQuery(docs: SearchDoc[], input: string): string | null {
  const q = parseQuery(input)
  if (!q.terms.length) return null
  const vocab = new Map<string, number>()
  for (const d of docs) { const p = prepare(d); for (const w of p.vocab) vocab.set(w, (vocab.get(w) ?? 0) + 1) }
  let changed = false
  let out = input
  for (const t of q.terms) {
    if ([...vocab.keys()].some((w) => matchWord(t, w) >= 0.85)) continue
    let best = '', bd = 9, bf = 0
    for (const [w, f] of vocab) {
      if (w.length < 3) continue
      const d = editDistance(t, w, 3)
      if (d < bd || (d === bd && f > bf)) { bd = d; best = w; bf = f }
    }
    if (best && bd <= Math.max(2, Math.ceil(t.length / 3))) {
      out = out.replace(new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(t)}(?![A-Za-z0-9])`, 'i'), best)
      changed = true
    }
  }
  return changed && normalize(out) !== normalize(input) ? out : null
}

/** Remove a filter token (like tag:pdf) from the typed text. */
export function stripFilter(input: string, key: string, value?: string): string {
  const v = value ? escapeRegExp(value) : '\\S*'
  return input.replace(new RegExp(`(^|\\s)${escapeRegExp(key)}:${v}(?=\\s|$)`, 'gi'), ' ').replace(/\s+/g, ' ').trim()
}
