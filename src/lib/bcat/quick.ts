/* Fast non-AI fallbacks and helpers for the Local AI tools. Pure functions, unit tested. */

/* ---------- sentiment (lexicon) ---------- */
const POS = 'good great excellent amazing awesome love loved lovely like liked nice happy glad best better fantastic wonderful perfect brilliant enjoy enjoyed fast easy helpful beautiful pleasant superb recommend recommended impressive smooth clean friendly fun cool fine solid reliable worth thanks thank delightful satisfied positive outstanding favourite favorite incredible useful win wins winning works working success successful calm safe kind'.split(' ')
const NEG = 'bad terrible awful horrible hate hated poor worst worse slow broken bug bugs buggy crash crashes crashed ugly annoying angry sad disappointed disappointing useless expensive difficult hard boring rude dirty fail failed fails failure problem problems issue issues wrong waste refund scam noisy pain painful never lost lose losing negative unhappy confusing confused weak late delay delayed cheap fake sucks worthless awkward'.split(' ')
const NEGATORS = new Set(['not', 'no', "don't", 'dont', "didn't", 'didnt', "isn't", 'isnt', "wasn't", 'wasnt', 'never', "can't", 'cant', "won't", 'wont', 'hardly'])
const BOOST = new Set(['very', 'really', 'so', 'extremely', 'super', 'too', 'quite'])
export function lexiconSentiment(text: string) {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? []
  let score = 0; const pos: string[] = [], neg: string[] = []
  words.forEach((w, i) => {
    let v = POS.includes(w) ? 1 : NEG.includes(w) ? -1 : 0
    if (!v) return
    if (BOOST.has(words[i - 1])) v *= 1.5
    if (NEGATORS.has(words[i - 1]) || NEGATORS.has(words[i - 2])) v *= -1
    score += v; (v > 0 ? pos : neg).push(w)
  })
  const norm = words.length ? score / Math.sqrt(words.length) : 0
  const label = norm > 0.15 ? 'POSITIVE' : norm < -0.15 ? 'NEGATIVE' : 'NEUTRAL'
  return { label, score: Math.max(-1, Math.min(1, norm)), positive: pos, negative: neg }
}

/* ---------- entities ---------- */
export interface Entity { type: string; text: string; score?: number }
/** Merge token-classification output (B-/I- tags and ## word pieces) into whole entities. */
export function mergeNer(tokens: { entity: string; word: string; score: number; index: number }[]): Entity[] {
  const out: (Entity & { last: number; n: number })[] = []
  for (const t of tokens) {
    const [bio, type] = t.entity.includes('-') ? t.entity.split('-') : ['B', t.entity]
    const prev = out[out.length - 1]
    const piece = t.word.startsWith('##')
    if (prev && (piece || (bio === 'I' && prev.type === type)) && t.index <= prev.last + 1) {
      prev.text += piece ? t.word.slice(2) : ' ' + t.word
      prev.score = (prev.score! * prev.n + t.score) / (prev.n + 1); prev.n++; prev.last = t.index
    } else out.push({ type, text: piece ? t.word.slice(2) : t.word, score: t.score, last: t.index, n: 1 })
  }
  return out.map(({ type, text, score }) => ({ type, text, score }))
}
const NER_NAMES: Record<string, string> = { PER: 'Person', LOC: 'Place', ORG: 'Organisation', MISC: 'Other' }
export const nerName = (t: string) => NER_NAMES[t] ?? t

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec'
const RULES: [string, RegExp][] = [
  ['Email', /[\w.+-]+@[\w-]+\.[\w.-]+/g],
  ['URL', /\bhttps?:\/\/[^\s<>"')]+/g],
  ['Date', new RegExp(`\\b(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/.]\\d{1,2}[/.]\\d{2,4}|\\d{1,2} (?:${MONTHS})\\.? \\d{4}|(?:${MONTHS})\\.? \\d{1,2},? \\d{4})\\b`, 'g')],
  ['Money', /(?:[$€£₹¥]\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)? ?(?:USD|EUR|GBP|INR|dollars|euros|rupees)\b)/g],
  ['Phone', /(?:\+\d{1,3}[ -]?)?(?:\(\d{2,4}\)[ -]?)?\d{3,5}[ -]\d{3,4}(?:[ -]\d{3,4})?\b/g],
  ['Percent', /\b\d+(?:\.\d+)?\s?%/g],
]
const STOP_CAPS = new Set(['The', 'A', 'An', 'I', 'It', 'This', 'That', 'In', 'On', 'At', 'And', 'But', 'If', 'We', 'He', 'She', 'They', 'You', 'My', 'Our', 'Your', 'His', 'Her', 'Their', 'For', 'Of', 'To', 'As', 'By', 'With', 'From', 'When', 'Then', 'There', 'Here', 'What', 'Why', 'How', 'Who', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
/** Rule based entities: emails, links, dates, money, phones, percents and capitalised names. */
export function ruleEntities(text: string): Entity[] {
  const out: Entity[] = []; const seen = new Set<string>()
  const add = (type: string, t: string) => { const k = type + '|' + t; if (!seen.has(k)) { seen.add(k); out.push({ type, text: t }) } }
  let rest = text
  for (const [type, re] of RULES) { for (const m of rest.matchAll(re)) add(type, m[0].trim()); rest = rest.replace(re, ' ') }
  for (const m of rest.matchAll(/\b[A-Z][a-z]+(?:\s+(?:[A-Z][a-z]+|of|de|van|von))*\s+[A-Z][a-z]+\b|\b[A-Z]{2,6}\b/g)) {
    const words = m[0].split(/\s+/)
    while (words.length && STOP_CAPS.has(words[0])) words.shift()
    if (words.length) add('Name', words.join(' '))
  }
  for (const m of rest.matchAll(/(?<=[a-z,;] )[A-Z][a-z]{2,}\b/g)) if (!STOP_CAPS.has(m[0])) add('Name', m[0])
  return out
}

/* ---------- keyword search (BM25) ---------- */
const tok = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').match(/[\p{L}\p{N}]+/gu) ?? []
export function bm25(docs: string[], query: string, k1 = 1.4, b = 0.75) {
  const toks = docs.map(tok)
  const avg = toks.reduce((s, t) => s + t.length, 0) / Math.max(1, toks.length)
  const df = new Map<string, number>()
  toks.forEach((t) => new Set(t).forEach((w) => df.set(w, (df.get(w) ?? 0) + 1)))
  const q = [...new Set(tok(query))]
  return toks.map((t, i) => {
    const tf = new Map<string, number>(); t.forEach((w) => tf.set(w, (tf.get(w) ?? 0) + 1))
    let s = 0
    for (const w of q) {
      const f = tf.get(w); if (!f) continue
      const idf = Math.log(1 + (docs.length - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5))
      s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * t.length / (avg || 1)))
    }
    return { index: i, score: s }
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score)
}

/* ---------- perceptual hash ---------- */
/** dHash of a 9x8 grayscale thumbnail (72 values), returned as 16 hex chars. */
export function dHash(gray9x8: ArrayLike<number>): string {
  let bits = ''
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += gray9x8[y * 9 + x] > gray9x8[y * 9 + x + 1] ? '1' : '0'
  let hex = ''
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
  return hex
}
export function hamming(a: string, b: string) {
  let d = 0
  for (let i = 0; i < a.length; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { d += x & 1; x >>= 1 } }
  return d
}
/** Group items whose pairwise distance is within a threshold (single link). */
export function groupBy<T>(items: T[], close: (a: T, b: T) => boolean): number[][] {
  const parent = items.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (close(items[i], items[j])) parent[find(i)] = find(j)
  const g = new Map<number, number[]>()
  items.forEach((_, i) => { const r = find(i); g.set(r, [...(g.get(r) ?? []), i]) })
  return [...g.values()].filter((x) => x.length > 1)
}
export const dot = (a: number[], b: number[]) => { let s = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i] * b[i]; return s }

/* ---------- colour clustering (quick segmentation and tags) ---------- */
export function kmeans(px: Uint8ClampedArray | number[], k: number, iters = 8): { centers: number[][]; labels: Uint8Array } {
  const n = px.length / 4
  const centers: number[][] = []
  for (let i = 0; i < k; i++) { const j = Math.floor(((i + 0.5) / k) * n) * 4; centers.push([px[j], px[j + 1], px[j + 2]]) }
  const labels = new Uint8Array(n)
  for (let it = 0; it < iters; it++) {
    const sum = centers.map(() => [0, 0, 0, 0])
    for (let i = 0; i < n; i++) {
      let best = 0, bd = Infinity
      for (let c = 0; c < k; c++) { const d = (px[i * 4] - centers[c][0]) ** 2 + (px[i * 4 + 1] - centers[c][1]) ** 2 + (px[i * 4 + 2] - centers[c][2]) ** 2; if (d < bd) { bd = d; best = c } }
      labels[i] = best; const s = sum[best]; s[0] += px[i * 4]; s[1] += px[i * 4 + 1]; s[2] += px[i * 4 + 2]; s[3]++
    }
    sum.forEach((s, c) => { if (s[3]) centers[c] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]] })
  }
  return { centers, labels }
}

const NAMED: [string, number[]][] = [['black', [20, 20, 20]], ['white', [240, 240, 240]], ['gray', [128, 128, 128]], ['red', [200, 40, 40]], ['orange', [240, 140, 30]], ['yellow', [235, 215, 50]], ['green', [60, 160, 60]], ['teal', [20, 150, 140]], ['blue', [40, 90, 200]], ['brown', [120, 80, 40]], ['beige', [220, 200, 160]]]
export function colorName(c: number[]) {
  let best = NAMED[0][0], bd = Infinity
  for (const [n, v] of NAMED) { const d = (c[0] - v[0]) ** 2 + (c[1] - v[1]) ** 2 + (c[2] - v[2]) ** 2; if (d < bd) { bd = d; best = n } }
  return best
}
/** Simple descriptive tags from pixels: brightness, colourfulness, main colours, orientation. */
export function quickTags(px: Uint8ClampedArray | number[], w: number, h: number): { label: string; score: number }[] {
  const n = px.length / 4
  let lum = 0, sat = 0
  for (let i = 0; i < n; i++) { const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2]; lum += 0.2126 * r + 0.7152 * g + 0.0722 * b; sat += Math.max(r, g, b) - Math.min(r, g, b) }
  lum /= n * 255; sat /= n * 255
  const tags: { label: string; score: number }[] = []
  tags.push({ label: lum < 0.3 ? 'dark' : lum > 0.7 ? 'bright' : 'balanced light', score: 1 })
  tags.push({ label: sat < 0.08 ? 'black and white' : sat > 0.35 ? 'vivid colours' : 'soft colours', score: 1 })
  tags.push({ label: w > h * 1.15 ? 'landscape' : h > w * 1.15 ? 'portrait' : 'square', score: 1 })
  const { centers, labels } = kmeans(px, 4, 6)
  const counts = centers.map((_, c) => labels.reduce((s, l) => s + (l === c ? 1 : 0), 0))
  counts.map((c, i) => ({ c, i })).sort((a, b) => b.c - a.c).forEach(({ c, i }) => { const name = colorName(centers[i]); if (!tags.some((t) => t.label === name)) tags.push({ label: name, score: c / n }) })
  return tags
}
