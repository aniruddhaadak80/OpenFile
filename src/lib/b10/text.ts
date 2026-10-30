/* Batch 10 pure text logic: readability, keywords, similarity, statistics, ASCII tables, numbers to words.
   No DOM access, so it can be tested in Node. */

// ---------------- Readability ----------------
export function countSyllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  if (w.length <= 3) return 1
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '')
  const m = w.match(/[aeiouy]{1,2}/g)
  return Math.max(1, m ? m.length : 1)
}

/** A sentence ends at . ? or ! even when closing quotes or brackets follow it ('late!’ (when', 'know, sir.” Alice'),
 * and the next one may open with a curly quote or a bracket. */
export function splitSentences(text: string): string[] {
  return text.replace(/\s+/g, ' ').split(/(?<=[.?!]['"\u2019\u201D)\]]*)\s+(?=[A-Z0-9"'(\[\u2018\u201C])/).map((s) => s.trim()).filter((s) => /[A-Za-z0-9]/.test(s))
}

export function words(text: string): string[] {
  return (text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || [])
}

export interface Readability {
  sentences: number; words: number; syllables: number; chars: number; complex: number; polysyllables: number
  fleschEase: number; fleschKincaid: number; gunningFog: number; smog: number; colemanLiau: number; ari: number
  avgGrade: number; readingMinutes: number; speakingMinutes: number
  hardSentences: { text: string; words: number; grade: number }[]
}

const r1 = (n: number) => Math.round(n * 10) / 10

export function readability(text: string): Readability {
  const sents = splitSentences(text)
  const ws = words(text)
  const S = Math.max(1, sents.length), W = Math.max(1, ws.length)
  let syl = 0, complex = 0, chars = 0
  for (const w of ws) { const s = countSyllables(w); syl += s; if (s >= 3) complex++; chars += w.replace(/[^\p{L}\p{N}]/gu, '').length }
  const fleschEase = 206.835 - 1.015 * (W / S) - 84.6 * (syl / W)
  const fleschKincaid = 0.39 * (W / S) + 11.8 * (syl / W) - 15.59
  const gunningFog = 0.4 * (W / S + 100 * (complex / W))
  const smog = 1.043 * Math.sqrt(complex * (30 / S)) + 3.1291
  const L = (chars / W) * 100, Sx = (S / W) * 100
  const colemanLiau = 0.0588 * L - 0.296 * Sx - 15.8
  const ari = 4.71 * (chars / W) + 0.5 * (W / S) - 21.43
  const grades = [fleschKincaid, gunningFog, smog, colemanLiau, ari]
  const hardSentences = sents.map((t) => {
    const sw = words(t); const n = Math.max(1, sw.length); const sy = sw.reduce((a, w) => a + countSyllables(w), 0)
    return { text: t, words: sw.length, grade: r1(0.39 * n + 11.8 * (sy / n) - 15.59) }
  }).filter((s) => s.words >= 20 || s.grade >= 12).sort((a, b) => b.grade - a.grade).slice(0, 25)
  return {
    sentences: sents.length, words: ws.length, syllables: syl, chars, complex, polysyllables: complex,
    fleschEase: r1(fleschEase), fleschKincaid: r1(fleschKincaid), gunningFog: r1(gunningFog), smog: r1(smog), colemanLiau: r1(colemanLiau), ari: r1(ari),
    avgGrade: r1(grades.reduce((a, b) => a + b, 0) / grades.length),
    readingMinutes: ws.length / 238, speakingMinutes: ws.length / 140, hardSentences,
  }
}

export function easeLabel(score: number): string {
  if (score >= 90) return 'Very easy'
  if (score >= 80) return 'Easy'
  if (score >= 70) return 'Fairly easy'
  if (score >= 60) return 'Plain English'
  if (score >= 50) return 'Fairly hard'
  if (score >= 30) return 'Hard'
  return 'Very hard'
}

/** Bold the first part of each word (a reading aid). Returns HTML. */
export function bionic(text: string, ratio = 0.45): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return text.split(/(\s+)/).map((tok) => {
    if (/^\s+$/.test(tok) || !tok) return tok.replace(/\n/g, '<br>')
    const m = tok.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}'’-]+)(.*)$/u)
    if (!m) return esc(tok)
    const n = Math.max(1, Math.ceil(m[2].length * ratio))
    return esc(m[1]) + '<b>' + esc(m[2].slice(0, n)) + '</b>' + esc(m[2].slice(n)) + esc(m[3])
  }).join('')
}

// ---------------- Keywords ----------------
export const STOPWORDS = new Set(('a about above after again against all am an and any are aren\'t as at be because been before being below between both but by can can\'t cannot could couldn\'t did didn\'t do does doesn\'t doing don\'t down during each few for from further had hadn\'t has hasn\'t have haven\'t having he he\'d he\'ll he\'s her here here\'s hers herself him himself his how how\'s i i\'d i\'ll i\'m i\'ve if in into is isn\'t it it\'s its itself let\'s me more most mustn\'t my myself no nor not of off on once only or other ought our ours ourselves out over own same shan\'t she she\'d she\'ll she\'s should shouldn\'t so some such than that that\'s the their theirs them themselves then there there\'s these they they\'d they\'ll they\'re they\'ve this those through to too under until up very was wasn\'t we we\'d we\'ll we\'re we\'ve were weren\'t what what\'s when when\'s where where\'s which while who who\'s whom why why\'s with won\'t would wouldn\'t you you\'d you\'ll you\'re you\'ve your yours yourself yourselves also just will may might must shall one two us use used using get got like even much many well way new now see make made').split(' '))

export function wordFrequency(text: string, opts: { stop?: boolean; minLen?: number } = {}): { word: string; count: number; pct: number }[] {
  const ws = words(text.toLowerCase())
  const map = new Map<string, number>()
  for (const w of ws) { if ((opts.minLen ?? 1) > w.length) continue; if (opts.stop && STOPWORDS.has(w)) continue; map.set(w, (map.get(w) || 0) + 1) }
  const total = ws.length || 1
  return [...map].map(([word, count]) => ({ word, count, pct: (count / total) * 100 })).sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
}

export function ngrams(text: string, n: number, stop = true): { phrase: string; count: number }[] {
  const ws = words(text.toLowerCase())
  const map = new Map<string, number>()
  for (let i = 0; i + n <= ws.length; i++) {
    const g = ws.slice(i, i + n)
    if (stop && (STOPWORDS.has(g[0]) || STOPWORDS.has(g[n - 1]))) continue
    const k = g.join(' ')
    map.set(k, (map.get(k) || 0) + 1)
  }
  return [...map].filter(([, c]) => c > 1).map(([phrase, count]) => ({ phrase, count })).sort((a, b) => b.count - a.count)
}

/** RAKE: Rapid Automatic Keyword Extraction. */
export function rake(text: string, maxWords = 4): { phrase: string; score: number; count: number }[] {
  const chunks = text.toLowerCase().split(/[.,;:!?()\[\]{}"“”\n\r\t]+|\s[-–]\s/)
  const phrases: string[][] = []
  for (const c of chunks) {
    let cur: string[] = []
    for (const w of words(c)) {
      if (STOPWORDS.has(w) || /^\d+$/.test(w)) { if (cur.length) phrases.push(cur); cur = [] } else cur.push(w)
    }
    if (cur.length) phrases.push(cur)
  }
  const freq = new Map<string, number>(), deg = new Map<string, number>()
  for (const p of phrases) { if (p.length > maxWords) continue; for (const w of p) { freq.set(w, (freq.get(w) || 0) + 1); deg.set(w, (deg.get(w) || 0) + p.length - 1) } }
  const out = new Map<string, { score: number; count: number }>()
  for (const p of phrases) {
    if (p.length > maxWords) continue
    const k = p.join(' ')
    const score = p.reduce((a, w) => a + ((deg.get(w) || 0) + (freq.get(w) || 0)) / (freq.get(w) || 1), 0)
    const prev = out.get(k)
    out.set(k, { score, count: (prev?.count || 0) + 1 })
  }
  return [...out].map(([phrase, v]) => ({ phrase, score: Math.round(v.score * 100) / 100, count: v.count })).sort((a, b) => b.score - a.score || b.count - a.count)
}

// ---------------- Similarity ----------------
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const A = [...a], B = [...b]
  if (!A.length) return B.length
  if (!B.length) return A.length
  let prev = Array.from({ length: B.length + 1 }, (_, i) => i)
  for (let i = 1; i <= A.length; i++) {
    const cur = [i]
    for (let j = 1; j <= B.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[B.length]
}

export function damerau(a: string, b: string): number {
  const A = [...a], B = [...b]
  const d: number[][] = Array.from({ length: A.length + 1 }, (_, i) => Array.from({ length: B.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= A.length; i++) for (let j = 1; j <= B.length; j++) {
    const cost = A[i - 1] === B[j - 1] ? 0 : 1
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
    if (i > 1 && j > 1 && A[i - 1] === B[j - 2] && A[i - 2] === B[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
  }
  return d[A.length][B.length]
}

export function hamming(a: string, b: string): number | null {
  const A = [...a], B = [...b]
  if (A.length !== B.length) return null
  let n = 0; for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) n++
  return n
}

export function jaro(a: string, b: string): number {
  if (a === b) return 1
  const A = [...a], B = [...b]
  if (!A.length || !B.length) return 0
  const range = Math.max(0, Math.floor(Math.max(A.length, B.length) / 2) - 1)
  const am = new Array(A.length).fill(false), bm = new Array(B.length).fill(false)
  let m = 0
  for (let i = 0; i < A.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(B.length, i + range + 1); j++) {
      if (bm[j] || A[i] !== B[j]) continue
      am[i] = bm[j] = true; m++; break
    }
  }
  if (!m) return 0
  let t = 0, k = 0
  for (let i = 0; i < A.length; i++) { if (!am[i]) continue; while (!bm[k]) k++; if (A[i] !== B[k]) t++; k++ }
  return (m / A.length + m / B.length + (m - t / 2) / m) / 3
}

export function jaroWinkler(a: string, b: string, p = 0.1): number {
  const j = jaro(a, b)
  let l = 0
  while (l < 4 && l < a.length && l < b.length && a[l] === b[l]) l++
  return j + l * p * (1 - j)
}

function vec(text: string): Map<string, number> {
  const m = new Map<string, number>()
  for (const w of words(text.toLowerCase())) m.set(w, (m.get(w) || 0) + 1)
  return m
}
export function cosine(a: string, b: string): number {
  const A = vec(a), B = vec(b)
  let dot = 0, na = 0, nb = 0
  for (const [k, v] of A) { na += v * v; dot += v * (B.get(k) || 0) }
  for (const v of B.values()) nb += v * v
  return na && nb ? dot / Math.sqrt(na * nb) : (a === b ? 1 : 0)
}
export function jaccard(a: string, b: string): number {
  const A = new Set(words(a.toLowerCase())), B = new Set(words(b.toLowerCase()))
  if (!A.size && !B.size) return 1
  let inter = 0; for (const w of A) if (B.has(w)) inter++
  return inter / (A.size + B.size - inter)
}
export function diceBigram(a: string, b: string): number {
  const bg = (s: string) => { const t = s.toLowerCase().replace(/\s+/g, ' '); const m = new Map<string, number>(); for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1) } return m }
  const A = bg(a), B = bg(b)
  let inter = 0, na = 0, nb = 0
  for (const v of A.values()) na += v
  for (const v of B.values()) nb += v
  for (const [k, v] of A) inter += Math.min(v, B.get(k) || 0)
  return na + nb ? (2 * inter) / (na + nb) : (a === b ? 1 : 0)
}
export function levRatio(a: string, b: string): number {
  const n = Math.max([...a].length, [...b].length)
  return n ? 1 - levenshtein(a, b) / n : 1
}

/** For each item in list A, find the best match in list B. */
export function fuzzyMatch(listA: string[], listB: string[], caseInsensitive = true): { a: string; b: string; score: number }[] {
  const norm = (s: string) => (caseInsensitive ? s.toLowerCase() : s).trim()
  const nb = listB.map(norm)
  return listA.map((a) => {
    const na = norm(a); let best = -1, bi = -1
    nb.forEach((b, i) => { const s = jaroWinkler(na, b) * 0.5 + levRatio(na, b) * 0.5; if (s > best) { best = s; bi = i } })
    return { a, b: bi >= 0 ? listB[bi] : '', score: Math.max(0, best) }
  })
}

// ---------------- Statistics ----------------
export function parseNumbers(text: string): number[] {
  return (text.match(/[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?(?:e[-+]?\d+)?/gi) || []).filter((s) => /\d/.test(s)).map((s) => Number(s.replace(/,/g, ''))).filter((n) => Number.isFinite(n))
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export interface Stats {
  n: number; sum: number; mean: number; median: number; modes: number[]; min: number; max: number; range: number
  q1: number; q3: number; iqr: number; varPop: number; varSample: number; sdPop: number; sdSample: number
  geoMean: number | null; harmMean: number | null; skewness: number; kurtosis: number; cv: number; sem: number
  outliers: number[]; ci95: [number, number]
}

export function describe(xs: number[]): Stats {
  const n = xs.length
  const s = [...xs].sort((a, b) => a - b)
  const sum = xs.reduce((a, b) => a + b, 0)
  const mean = n ? sum / n : NaN
  const counts = new Map<number, number>(); let maxc = 0
  for (const x of xs) { const c = (counts.get(x) || 0) + 1; counts.set(x, c); if (c > maxc) maxc = c }
  const modes = maxc > 1 ? [...counts].filter(([, c]) => c === maxc).map(([v]) => v).sort((a, b) => a - b) : []
  const ss = xs.reduce((a, x) => a + (x - mean) ** 2, 0)
  const varPop = n ? ss / n : NaN, varSample = n > 1 ? ss / (n - 1) : NaN
  const sdPop = Math.sqrt(varPop), sdSample = Math.sqrt(varSample)
  const q1 = quantile(s, 0.25), q3 = quantile(s, 0.75), iqr = q3 - q1
  const m3 = n ? xs.reduce((a, x) => a + (x - mean) ** 3, 0) / n : NaN
  const m4 = n ? xs.reduce((a, x) => a + (x - mean) ** 4, 0) / n : NaN
  const allPos = n > 0 && xs.every((x) => x > 0)
  const sem = n > 1 ? sdSample / Math.sqrt(n) : NaN
  return {
    n, sum, mean, median: quantile(s, 0.5), modes, min: s[0], max: s[n - 1], range: s[n - 1] - s[0], q1, q3, iqr,
    varPop, varSample, sdPop, sdSample,
    geoMean: allPos ? Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / n) : null,
    harmMean: allPos ? n / xs.reduce((a, x) => a + 1 / x, 0) : null,
    skewness: varPop ? m3 / varPop ** 1.5 : 0, kurtosis: varPop ? m4 / varPop ** 2 - 3 : 0,
    cv: mean ? sdSample / Math.abs(mean) : NaN, sem,
    outliers: xs.filter((x) => x < q1 - 1.5 * iqr || x > q3 + 1.5 * iqr),
    ci95: [mean - 1.96 * sem, mean + 1.96 * sem],
  }
}

export function histogram(xs: number[], bins?: number): { from: number; to: number; count: number }[] {
  if (!xs.length) return []
  const min = Math.min(...xs), max = Math.max(...xs)
  const k = bins ?? Math.max(1, Math.min(40, Math.ceil(Math.log2(xs.length) + 1)))
  if (min === max) return [{ from: min, to: max, count: xs.length }]
  const w = (max - min) / k
  const out = Array.from({ length: k }, (_, i) => ({ from: min + i * w, to: min + (i + 1) * w, count: 0 }))
  for (const x of xs) out[Math.min(k - 1, Math.floor((x - min) / w))].count++
  return out
}

export function regression(xs: number[], ys: number[]): { slope: number; intercept: number; r: number; r2: number } | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 2) return null
  let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxy += xs[i] * ys[i]; sxx += xs[i] ** 2; syy += ys[i] ** 2 }
  const den = n * sxx - sx * sx
  if (!den) return null
  const slope = (n * sxy - sx * sy) / den
  const intercept = (sy - slope * sx) / n
  const rd = Math.sqrt(den * (n * syy - sy * sy))
  const r = rd ? (n * sxy - sx * sy) / rd : 0
  return { slope, intercept, r, r2: r * r }
}

// ---------------- ASCII tables ----------------
export type TableStyle = 'ascii' | 'unicode' | 'rounded' | 'double' | 'heavy' | 'markdown' | 'rst' | 'compact' | 'dots'

export function parseTable(text: string, delimiter?: string): string[][] {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '')
  if (!lines.length) return []
  // Markdown table input
  if (lines.every((l) => /^\s*\|.*\|\s*$/.test(l))) {
    return lines.filter((l) => !/^\s*\|[\s:|-]+\|\s*$/.test(l)).map((l) => l.trim().slice(1, -1).split('|').map((c) => c.trim()))
  }
  const d = delimiter || (lines[0].includes('\t') ? '\t' : lines[0].includes(',') ? ',' : lines[0].includes(';') ? ';' : lines[0].includes('|') ? '|' : '  ')
  return lines.map((l) => (d === '  ' ? l.trim().split(/\s{2,}/) : splitCsvLine(l, d)).map((c) => c.trim()))
}

export function splitCsvLine(line: string, d: string): string[] {
  const out: string[] = []; let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') q = false; else cur += ch }
    else if (ch === '"' && cur === '') q = true
    else if (line.startsWith(d, i)) { out.push(cur); cur = ''; i += d.length - 1 }
    else cur += ch
  }
  out.push(cur)
  return out
}

/** Display width: counts wide East Asian characters and most emoji as 2 columns. */
export function strWidth(s: string): number {
  let w = 0
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    if (c === 0x200b || (c >= 0x300 && c <= 0x36f) || c === 0xfe0f) continue
    w += (c >= 0x1100 && (c <= 0x115f || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x1f300 && c <= 0x1faff) || (c >= 0x20000 && c <= 0x3fffd))) ? 2 : 1
  }
  return w
}

const BOX: Record<string, string[]> = {
  // tl, t, tm, tr, l, m, r, ml, mm, mr, bl, b, bm, br, v
  ascii: ['+', '-', '+', '+', '|', '|', '|', '+', '+', '+', '+', '-', '+', '+'],
  unicode: ['┌', '─', '┬', '┐', '│', '│', '│', '├', '┼', '┤', '└', '─', '┴', '┘'],
  rounded: ['╭', '─', '┬', '╮', '│', '│', '│', '├', '┼', '┤', '╰', '─', '┴', '╯'],
  double: ['╔', '═', '╦', '╗', '║', '║', '║', '╠', '╬', '╣', '╚', '═', '╩', '╝'],
  heavy: ['┏', '━', '┳', '┓', '┃', '┃', '┃', '┣', '╋', '┫', '┗', '━', '┻', '┛'],
  dots: ['.', '.', '.', '.', ':', ':', ':', ':', '.', ':', ':', '.', ':', ':'],
}

export function renderTable(rows: string[][], style: TableStyle, opts: { header?: boolean; align?: ('l' | 'c' | 'r')[]; rowLines?: boolean; padding?: number } = {}): string {
  if (!rows.length) return ''
  const header = opts.header ?? true
  const cols = Math.max(...rows.map((r) => r.length))
  // Markdown cells are escaped before widths are measured, so columns stay aligned and a cell can never close early.
  const mdc = (c: string) => (style === 'markdown' ? c.replace(/\\/g, '\\\\').replace(/\|/g, '\\|') : c)
  const R = rows.map((r) => Array.from({ length: cols }, (_, i) => mdc((r[i] ?? '').replace(/\n/g, ' '))))
  const wid = Array.from({ length: cols }, (_, i) => Math.max(style === 'markdown' ? 3 : 1, ...R.map((r) => strWidth(r[i]))))
  const isNum = Array.from({ length: cols }, (_, i) => R.slice(header ? 1 : 0).every((r) => r[i] === '' || /^[-+]?[\d,]*\.?\d+%?$/.test(r[i])) && R.length > (header ? 1 : 0))
  const al = (i: number) => opts.align?.[i] ?? (isNum[i] ? 'r' : 'l')
  const pad = (s: string, w: number, a: 'l' | 'c' | 'r') => {
    const d = w - strWidth(s)
    if (a === 'r') return ' '.repeat(d) + s
    if (a === 'c') return ' '.repeat(Math.floor(d / 2)) + s + ' '.repeat(Math.ceil(d / 2))
    return s + ' '.repeat(d)
  }
  const p = ' '.repeat(opts.padding ?? 1)
  if (style === 'markdown') {
    const line = (r: string[]) => '|' + r.map((c, i) => p + pad(c, wid[i], al(i)) + p).join('|') + '|'
    const sep = '|' + wid.map((w, i) => { const a = al(i); const dash = '-'.repeat(w + 2 * p.length - (a === 'c' ? 2 : 1)); return a === 'c' ? ':' + dash + ':' : a === 'r' ? dash + ':' : ':' + dash }).join('|') + '|'
    const body = header ? R.slice(1) : R
    const head = header ? R[0] : wid.map((_, i) => 'Column ' + (i + 1))
    return [line(head), sep, ...body.map(line)].join('\n')
  }
  if (style === 'rst') {
    const sep = (ch: string) => '+' + wid.map((w) => ch.repeat(w + 2 * p.length)).join('+') + '+'
    const line = (r: string[]) => '|' + r.map((c, i) => p + pad(c, wid[i], al(i)) + p).join('|') + '|'
    const out = [sep('-')]
    R.forEach((r, i) => { out.push(line(r)); out.push(sep(header && i === 0 ? '=' : '-')) })
    return out.join('\n')
  }
  if (style === 'compact') {
    const line = (r: string[]) => r.map((c, i) => pad(c, wid[i], al(i))).join('  ').trimEnd()
    const out = R.map(line)
    if (header) out.splice(1, 0, wid.map((w) => '-'.repeat(w)).join('  '))
    return out.join('\n')
  }
  const b = BOX[style]
  const hr = (l: string, m: string, r: string, h: string) => l + wid.map((w) => h.repeat(w + 2 * p.length)).join(m) + r
  const line = (r: string[]) => b[4] + r.map((c, i) => p + pad(c, wid[i], al(i)) + p).join(b[5]) + b[6]
  const out = [hr(b[0], b[2], b[3], b[1])]
  R.forEach((r, i) => {
    out.push(line(r))
    if (i < R.length - 1 && ((header && i === 0) || opts.rowLines)) out.push(hr(b[7], b[8], b[9], b[1]))
  })
  out.push(hr(b[10], b[12], b[13], b[11]))
  return out.join('\n')
}

// ---------------- Numbers to words ----------------
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const SCALES = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion', 'quintillion', 'sextillion', 'septillion', 'octillion', 'nonillion', 'decillion']

function below100(n: number): string { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '') }
function below1000(n: number, and: boolean): string {
  const h = Math.floor(n / 100), r = n % 100
  if (!h) return below100(r)
  return ONES[h] + ' hundred' + (r ? (and ? ' and ' : ' ') + below100(r) : '')
}

export function intToWords(nIn: bigint, system: 'intl' | 'indian' = 'intl', and = false): string {
  if (nIn < 0n) return 'minus ' + intToWords(-nIn, system, and)
  if (nIn === 0n) return 'zero'
  if (system === 'indian') {
    const parts: string[] = []
    let n = nIn
    const crore = n / 10000000n; n %= 10000000n
    if (crore) parts.push((crore >= 1000n ? intToWords(crore, 'indian', and) : below1000(Number(crore), and)) + ' crore')
    const lakh = Number(n / 100000n); n %= 100000n
    if (lakh) parts.push(below100(lakh) + ' lakh')
    const th = Number(n / 1000n); n %= 1000n
    if (th) parts.push(below100(th) + ' thousand')
    if (n) parts.push(below1000(Number(n), and))
    return parts.join(' ')
  }
  const groups: number[] = []
  let n = nIn
  while (n > 0n) { groups.push(Number(n % 1000n)); n /= 1000n }
  if (groups.length > SCALES.length) throw new Error('Number is too large')
  const out: string[] = []
  for (let i = groups.length - 1; i >= 0; i--) if (groups[i]) out.push(below1000(groups[i], and) + (SCALES[i] ? ' ' + SCALES[i] : ''))
  return out.join(' ')
}

export function numberToWords(input: string, opts: { system?: 'intl' | 'indian'; and?: boolean; mode?: 'plain' | 'ordinal' | 'currency' | 'cheque' | 'year'; currency?: { major: string; majorPl: string; minor: string; minorPl: string } } = {}): string {
  const s = input.trim().replace(/[,_\s]/g, '')
  if (!/^[-+]?\d+(\.\d+)?$/.test(s)) throw new Error('Enter a number like 1234.56')
  const neg = s.startsWith('-')
  const [ip, fp = ''] = s.replace(/^[-+]/, '').split('.')
  const whole = BigInt(ip)
  const sys = opts.system ?? 'intl'
  const and = opts.and ?? false
  const mode = opts.mode ?? 'plain'
  const sign = neg ? 'minus ' : ''
  if (mode === 'year') {
    const y = Number(whole)
    if (y >= 1100 && y < 10000 && y % 100 !== 0 && Math.floor(y / 100) % 10 !== 0) return sign + below100(Math.floor(y / 100)) + ' ' + (y % 100 < 10 ? 'oh-' + ONES[y % 100] : below100(y % 100))
    if (y >= 1100 && y < 10000 && y % 100 === 0 && Math.floor(y / 100) % 10 !== 0) return sign + below100(Math.floor(y / 100)) + ' hundred'
    return sign + intToWords(whole, sys, and)
  }
  if (mode === 'ordinal') return sign + toOrdinal(intToWords(whole, sys, and))
  if (mode === 'currency' || mode === 'cheque') {
    const c = opts.currency ?? { major: 'dollar', majorPl: 'dollars', minor: 'cent', minorPl: 'cents' }
    const cents = Number((fp + '00').slice(0, 2)) + (fp.length > 2 && Number(fp[2]) >= 5 ? 1 : 0)
    const major = intToWords(whole, sys, and)
    let out = sign + major + ' ' + (whole === 1n ? c.major : c.majorPl)
    if (mode === 'cheque') {
      out = out + ' and ' + String(cents).padStart(2, '0') + '/100'
      return out.replace(/^./, (m) => m.toUpperCase()) + ' only'
    }
    if (cents) out += ' and ' + below100(cents) + ' ' + (cents === 1 ? c.minor : c.minorPl)
    return out
  }
  let out = sign + intToWords(whole, sys, and)
  if (fp) out += ' point ' + [...fp].map((d) => ONES[Number(d)]).join(' ')
  return out
}

export function toOrdinal(w: string): string {
  const irregular: Record<string, string> = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' }
  return w.replace(/([a-z]+)$/, (last) => irregular[last] ?? (last.endsWith('y') ? last.slice(0, -1) + 'ieth' : last + 'th'))
}

const WORD_VALUES: Record<string, number> = Object.fromEntries([...ONES.map((w, i) => [w, i]), ...TENS.map((w, i) => [w, i * 10]).filter(([w]) => w)])
const MULT: Record<string, bigint> = { hundred: 100n, thousand: 1000n, lakh: 100000n, lac: 100000n, crore: 10000000n, million: 10n ** 6n, billion: 10n ** 9n, trillion: 10n ** 12n, quadrillion: 10n ** 15n }

/** Words back to a number, e.g. "two lakh fifty thousand and five" -> 250005 */
export function wordsToNumber(text: string): string {
  const toks = text.toLowerCase().replace(/-/g, ' ').replace(/[^a-z\s.]/g, ' ').split(/\s+/).filter((t) => t && t !== 'and')
  if (!toks.length) throw new Error('Type some number words, like two hundred and five')
  let neg = false
  if (toks[0] === 'minus' || toks[0] === 'negative') { neg = true; toks.shift() }
  let total = 0n, cur = 0n, i = 0, dec = ''
  for (; i < toks.length; i++) {
    const t = toks[i]
    if (t === 'point') { dec = toks.slice(i + 1).map((d) => { if (!(d in WORD_VALUES) || WORD_VALUES[d] > 9) throw new Error('After "point" use single digits, like point five two'); return WORD_VALUES[d] }).join(''); break }
    if (t in WORD_VALUES) cur += BigInt(WORD_VALUES[t])
    else if (t === 'hundred') cur = (cur || 1n) * 100n
    else if (t in MULT) { const m = MULT[t]; const segTotal = total % m; const base = segTotal + cur; total = total - segTotal + (base || 1n) * m; cur = 0n }
    else throw new Error(`I do not know the word "${t}"`)
  }
  const v = (total + cur).toString() + (dec ? '.' + dec : '')
  return (neg ? '-' : '') + v
}
