/* Fast, model free text helpers used as the no-download fallback of the Local AI tools.
 * Sentence splitting, an extractive summary (TF-IDF centroid with position and length weights),
 * BM25 passage ranking and sentence-level answers from the best passages. Pure functions, no DOM. */

const STOP = new Set(('a an and are as at be been but by can could did do does for from had has have he her his how i if in into is it its ' +
  'just may me more most my no not of on or our out over she so some such than that the their them then there these they this those to ' +
  'too under up us was we were what when where which while who why will with would you your also about after all any because before ' +
  'between both each few here only other own same should very s t don shall upon whom yours ours itself himself herself').split(' '))

export const words = (s: string) => (s.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? []).map((w) => w.replace(/'s$/, ''))
export const terms = (s: string) => words(s).filter((w) => w.length > 1 && !STOP.has(w)).map(stem)

/** A very light English stemmer: enough to match "files" with "file" and "running" with "run". */
export function stem(w: string) {
  if (w.length < 5) return w
  return w.replace(/(ies)$/, 'y').replace(/(ing|edly|ed|ly|es|s)$/, '').replace(/(.)\1$/, '$1') || w
}

/** Split text into sentences, keeping abbreviations like "e.g." and numbers like 3.5 together. */
export function sentences(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  const out: string[] = []
  let start = 0
  const re = /([.!?]["')\]]?)\s+(?=[\p{Lu}\p{N}"'(\[])/gu
  let m: RegExpExecArray | null
  while ((m = re.exec(clean))) {
    const end = m.index + m[1].length
    const prev = clean.slice(Math.max(start, end - 6), end).toLowerCase()
    if (/\b(e\.g|i\.e|mr|mrs|ms|dr|vs|etc|fig|no|st)\.$/.test(prev)) continue
    out.push(clean.slice(start, end).trim())
    start = end
  }
  if (start < clean.length) out.push(clean.slice(start).trim())
  return out.filter((s) => s.length > 1)
}

export interface Scored { text: string; index: number; score: number }

/** Pick the n most central sentences and return them in their original order. */
export function summarize(text: string, n = 5): Scored[] {
  const sents = sentences(text).slice(0, 4000)
  if (sents.length <= n) return sents.map((t, i) => ({ text: t, index: i, score: 1 }))
  const toks = sents.map(terms)
  const df = new Map<string, number>()
  for (const t of toks) for (const w of new Set(t)) df.set(w, (df.get(w) ?? 0) + 1)
  const N = sents.length
  const idf = (w: string) => Math.log(1 + N / (df.get(w) ?? 1))
  const centroid = new Map<string, number>()
  for (const t of toks) for (const w of t) centroid.set(w, (centroid.get(w) ?? 0) + idf(w))
  const scored = sents.map((s, i) => {
    const t = toks[i]
    if (t.length < 3) return { text: s, index: i, score: 0 }
    let sc = 0
    for (const w of new Set(t)) sc += (centroid.get(w) ?? 0) * idf(w)
    sc /= Math.sqrt(t.length) + 2
    const pos = 1 + 0.35 * Math.max(0, 1 - i / Math.max(8, N * 0.15)) // early sentences matter a bit more
    const len = s.length > 400 ? 0.6 : s.length < 40 ? 0.7 : 1
    return { text: s, index: i, score: sc * pos * len }
  })
  // greedy pick with a redundancy penalty so near-duplicate sentences are not picked twice
  const picked: Scored[] = []
  const used: Set<string>[] = []
  const pool = [...scored].sort((a, b) => b.score - a.score)
  for (const c of pool) {
    if (picked.length >= n) break
    const set = new Set(toks[c.index])
    const dup = used.some((u) => { let k = 0; for (const w of set) if (u.has(w)) k++; return k / Math.max(1, Math.min(set.size, u.size)) > 0.7 })
    if (dup || c.score <= 0) continue
    picked.push(c); used.push(set)
  }
  return picked.sort((a, b) => a.index - b.index)
}

/** Top keywords of a text by TF-IDF across its own sentences. */
export function keywords(text: string, n = 8): string[] {
  const sents = sentences(text)
  const df = new Map<string, number>(), tf = new Map<string, number>(), surface = new Map<string, string>()
  for (const s of sents) {
    const seen = new Set<string>()
    for (const w of words(s)) {
      if (w.length < 3 || STOP.has(w) || /^\d+$/.test(w)) continue
      const k = stem(w)
      if (!surface.has(k)) surface.set(k, w)
      tf.set(k, (tf.get(k) ?? 0) + 1)
      if (!seen.has(k)) { seen.add(k); df.set(k, (df.get(k) ?? 0) + 1) }
    }
  }
  const N = Math.max(1, sents.length)
  return [...tf.entries()].map(([k, f]) => ({ k, s: f * Math.log(1 + N / (df.get(k) ?? 1)) })).sort((a, b) => b.s - a.s).slice(0, n).map((x) => surface.get(x.k)!)
}

export interface Passage { page: number; text: string }

/** Rank passages for a query with BM25 (k1 1.4, b 0.75). */
export function bm25<T extends Passage>(passages: T[], query: string, k = 4): { p: T; score: number }[] {
  const q = [...new Set(terms(query))]
  if (!q.length || !passages.length) return []
  const toks = passages.map((p) => terms(p.text))
  const avg = toks.reduce((s, t) => s + t.length, 0) / toks.length || 1
  const df = new Map<string, number>()
  for (const t of toks) for (const w of new Set(t)) df.set(w, (df.get(w) ?? 0) + 1)
  const N = passages.length
  return passages.map((p, i) => {
    const t = toks[i], f = new Map<string, number>()
    for (const w of t) f.set(w, (f.get(w) ?? 0) + 1)
    let s = 0
    for (const w of q) {
      const n = f.get(w); if (!n) continue
      const idf = Math.log(1 + (N - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5))
      s += idf * (n * 2.4) / (n + 1.4 * (1 - 0.75 + 0.75 * t.length / avg))
    }
    return { p, score: s }
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, k)
}

/** Answer a question with the best matching sentences from the top passages, each tagged with its page. */
export function answer<T extends Passage>(passages: T[], question: string, maxSentences = 3): { text: string; page: number }[] {
  const top = bm25(passages, question, 4)
  if (!top.length) return []
  const q = new Set(terms(question))
  const cands: { text: string; page: number; score: number; order: number }[] = []
  top.forEach(({ p, score }, rank) => sentences(p.text).forEach((s, j) => {
    const t = terms(s)
    let hit = 0; for (const w of new Set(t)) if (q.has(w)) hit++
    if (!hit) return
    cands.push({ text: s, page: p.page, score: (hit / Math.sqrt(q.size)) * (1 + score / 10) / (1 + rank * 0.25), order: rank * 1000 + j })
  }))
  return cands.sort((a, b) => b.score - a.score).slice(0, maxSentences).sort((a, b) => a.order - b.order).map(({ text, page }) => ({ text, page }))
}
