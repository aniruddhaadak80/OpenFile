/* Study helpers: flashcards, quizzes, worksheets, word puzzles, citations, BibTeX and RIS, GPA and grades, typing.
 * Pure functions, seeded randomness so puzzles can be rebuilt and tested. */

export function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 } }
export const shuffle = <T,>(a: T[], r: () => number) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [x[i], x[j]] = [x[j], x[i]] } return x }

/* ---------------- flashcards ---------------- */
export interface Card { front: string; back: string; tags?: string }
/** Read cards from CSV/TSV, "term - definition", "term: definition" or Q/A blocks. */
export function parseCards(text: string): Card[] {
  const t = text.replace(/\r/g, '').trim(); if (!t) return []
  const ls = t.split('\n').filter((l) => l.trim())
  if (/^(Q|Question)\s*[:.]/i.test(ls[0])) {
    const out: Card[] = []
    for (let i = 0; i < ls.length; i++) { const q = ls[i].match(/^(?:Q|Question)\s*[:.]\s*(.+)$/i); if (q) { const a = ls[i + 1]?.match(/^(?:A|Answer)\s*[:.]\s*(.+)$/i); out.push({ front: q[1].trim(), back: a ? a[1].trim() : '' }); if (a) i++ } }
    return out
  }
  const delim = ls.every((l) => l.includes('\t')) ? '\t' : ls.filter((l) => /,/.test(l)).length >= ls.length * 0.8 && !ls.some((l) => / - |: /.test(l)) ? ',' : null
  return ls.map((l) => {
    let parts: string[]
    if (delim === '\t') parts = l.split('\t')
    else if (delim === ',') parts = csvSplit(l)
    else { const m = l.match(/^(.+?)\s+(?:-|–|=|:)\s+(.+)$/) ?? l.match(/^(.+?):\s*(.+)$/); parts = m ? [m[1], m[2]] : [l, ''] }
    return { front: (parts[0] ?? '').trim(), back: (parts[1] ?? '').trim(), tags: parts[2]?.trim() || undefined }
  }).filter((c) => c.front && !/^(front|term|question)$/i.test(c.front))
}
export function csvSplit(line: string, d = ','): string[] {
  const out: string[] = []; let cur = '', q = false
  for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') q = false; else cur += ch } else if (ch === '"') q = true; else if (ch === d) { out.push(cur); cur = '' } else cur += ch }
  out.push(cur); return out
}
/** Anki imports plain text with tabs, HTML allowed. */
export const cardsToAnki = (cs: Card[]) => '#separator:tab\n#html:false\n' + cs.map((c) => [c.front, c.back, c.tags ?? ''].map((x) => x.replace(/[\t\n]/g, ' ')).join('\t')).join('\n') + '\n'
export const cardsToCsv = (cs: Card[]) => 'Front,Back,Tags\r\n' + cs.map((c) => [c.front, c.back, c.tags ?? ''].map((x) => (/[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x)).join(',')).join('\r\n') + '\r\n'

/** Leitner boxes: right answers move a card up a box, wrong ones send it back to box 1. */
export interface Leitner { box: number[]; due: number[] }
export const LEITNER_GAP = [0, 1, 2, 4, 8, 16]
export function leitnerAnswer(l: Leitner, i: number, right: boolean, round: number): Leitner {
  const box = [...l.box], due = [...l.due]
  box[i] = right ? Math.min(5, box[i] + 1) : 1
  due[i] = round + LEITNER_GAP[box[i]]
  return { box, due }
}
export function leitnerNext(l: Leitner, round: number, last = -1) {
  const due = l.due.map((d, i) => [d, i]).filter(([d]) => d <= round).map(([, i]) => i)
  const pool = due.length ? due : l.due.map((_, i) => i)
  const pick = pool.filter((i) => i !== last)
  const list = pick.length ? pick : pool
  return list.sort((a, b) => l.box[a] - l.box[b] || l.due[a] - l.due[b])[0]
}

/* ---------------- cloze cards from notes ---------------- */
const STOP = new Set('a an the and or but if then of to in on at by for with from as is are was were be been being this that these those it its into over under than so such not no can could would should will may might must do does did have has had which who whom whose what when where why how there their they them he she his her we our you your i me my also very more most many much some any each other about after before between during through while because'.split(' '))
export function sentenceSplit(text: string) {
  return text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/).map((s) => s.trim()).filter((s) => s.split(' ').length >= 6 && s.length <= 300)
}
/** Pick the word or phrase to blank out: prefer numbers, capitalised terms and long rare words. */
export function clozeTarget(sentence: string, freq: Map<string, number>): string | null {
  const words = sentence.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? []
  let best: string | null = null, bestScore = 0
  const cap = sentence.match(/(?:[A-Z][\p{L}-]+\s){1,3}[A-Z][\p{L}-]+/u)?.[0]
  words.forEach((w, i) => {
    const lw = w.toLowerCase(); if (STOP.has(lw) || w.length < 4) return
    let s = Math.min(w.length, 12) / (1 + (freq.get(lw) ?? 0) * 0.3)
    if (/\d/.test(w)) s += 6
    if (i > 0 && /^[A-Z]/.test(w)) s += 4
    if (s > bestScore) { bestScore = s; best = w }
  })
  if (cap && cap.split(' ').length > 1 && !sentence.startsWith(cap)) return cap
  return best
}
export function makeCloze(sentence: string, target: string): Card {
  const i = sentence.indexOf(target)
  return { front: sentence.slice(0, i) + '_____' + sentence.slice(i + target.length), back: target }
}
export function wordFreq(text: string) { const m = new Map<string, number>(); for (const w of text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []) m.set(w, (m.get(w) ?? 0) + 1); return m }
/** Quick (no model) ranking: sentences that share many frequent content words with the rest of the notes. */
export function rankSentencesQuick(sents: string[], keyword = '') {
  const freq = wordFreq(sents.join(' '))
  const kw = keyword.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
  return sents.map((s, i) => { const lo = s.toLowerCase(); const ws = (lo.match(/[\p{L}\p{N}']+/gu) ?? []).filter((w) => !STOP.has(w) && w.length > 3); const score = ws.reduce((a, w) => a + Math.log(1 + (freq.get(w) ?? 0)), 0) / Math.sqrt(ws.length + 1) + kw.filter((w) => lo.includes(w)).length * 2; return { i, score } }).sort((a, b) => b.score - a.score)
}
/** Rank by embedding centrality and pick diverse sentences (maximal marginal relevance). */
export function rankByEmbedding(vecs: number[][], k: number, lambda = 0.7) {
  const n = vecs.length; const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0)
  const centroid = vecs[0].map((_, j) => vecs.reduce((s, v) => s + v[j], 0) / n)
  const rel = vecs.map((v) => dot(v, centroid))
  const chosen: number[] = []
  while (chosen.length < Math.min(k, n)) {
    let best = -1, bs = -Infinity
    for (let i = 0; i < n; i++) { if (chosen.includes(i)) continue; const red = chosen.length ? Math.max(...chosen.map((c) => dot(vecs[i], vecs[c]))) : 0; const s = lambda * rel[i] - (1 - lambda) * red; if (s > bs) { bs = s; best = i } }
    chosen.push(best)
  }
  return chosen
}

/* ---------------- quiz ---------------- */
export interface Question { q: string; options: string[]; answer: number[]; kind: 'single' | 'multi' | 'text' | 'tf'; explain?: string }
/** Plain text quiz format:
 * 1. Question text
 * a) wrong
 * *b) right   (a star marks correct answers)
 * = typed answer (for short-answer questions)
 * > explanation */
export function parseQuiz(text: string): Question[] {
  const out: Question[] = []; let cur: Question | null = null
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const l = raw.trim(); if (!l) continue
    const opt = l.match(/^(\*)?\s*(?:[a-hA-H][).]|[-•])\s+(.+)$/)
    if (cur && opt) { if (opt[1]) cur.answer.push(cur.options.length); cur.options.push(opt[2].trim()); continue }
    if (cur && l.startsWith('=')) { cur.kind = 'text'; cur.options.push(l.slice(1).trim()); cur.answer.push(cur.options.length - 1); continue }
    if (cur && l.startsWith('>')) { cur.explain = l.slice(1).trim(); continue }
    const q = l.match(/^(?:\d+[).]|Q\d*[:.])\s*(.+)$/i)
    if (q || !cur || cur.options.length) { cur = { q: (q ? q[1] : l).trim(), options: [], answer: [], kind: 'single' }; out.push(cur) } else cur.q += ' ' + l
  }
  for (const qq of out) {
    if (qq.kind === 'text') continue
    const lo = qq.options.map((o) => o.toLowerCase())
    if (lo.length === 2 && lo.includes('true') && lo.includes('false')) qq.kind = 'tf'
    if (qq.answer.length > 1) qq.kind = 'multi'
  }
  return out.filter((x) => x.options.length)
}
export function gradeAnswer(q: Question, given: number[] | string) {
  if (q.kind === 'text') { const g = String(given).trim().toLowerCase().replace(/\s+/g, ' '); return q.options.some((o) => o.toLowerCase().split('|').map((x) => x.trim()).includes(g)) }
  const a = [...(given as number[])].sort().join(','), b = [...q.answer].sort().join(',')
  return a === b
}

/* ---------------- math worksheets ---------------- */
export type Op = '+' | '-' | '×' | '÷'
export interface Problem { a: number; b: number; op: Op; answer: number; text: string }
export function makeProblems(o: { ops: Op[]; min: number; max: number; count: number; seed: number; noNegative?: boolean; wholeDivision?: boolean }): Problem[] {
  const r = rng(o.seed), ri = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))
  const out: Problem[] = []
  for (let i = 0; i < o.count; i++) {
    const op = o.ops[Math.floor(r() * o.ops.length)]
    let a = ri(o.min, o.max), b = ri(o.min, o.max)
    if (op === '-' && o.noNegative && b > a) [a, b] = [b, a]
    if (op === '÷') { if (b === 0) b = 1; if (o.wholeDivision !== false) a = b * ri(Math.max(0, o.min), Math.max(1, o.max)) }
    const answer = op === '+' ? a + b : op === '-' ? a - b : op === '×' ? a * b : Math.round((a / b) * 100) / 100
    out.push({ a, b, op, answer, text: `${a} ${op} ${b} =` })
  }
  return out
}

/* ---------------- word search ---------------- */
const DIRS = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]]
export function wordSearch(words: string[], size: number, o: { seed: number; diagonal: boolean; backwards: boolean; alphabet?: string }) {
  const r = rng(o.seed)
  const list = [...new Set(words.map((w) => w.toUpperCase().replace(/[^\p{L}]/gu, '')).filter((w) => w.length >= 2 && w.length <= size))].sort((a, b) => b.length - a.length)
  const grid: string[][] = Array.from({ length: size }, () => Array(size).fill(''))
  const dirs = DIRS.filter(([dr, dc]) => (o.diagonal || dr === 0 || dc === 0) && (o.backwards || dc > 0 || (dc === 0 && dr > 0)))
  const placed: { word: string; r: number; c: number; dr: number; dc: number }[] = [], skipped: string[] = []
  for (const w of list) {
    let ok = false
    for (let t = 0; t < 400 && !ok; t++) {
      const [dr, dc] = dirs[Math.floor(r() * dirs.length)]
      const rr = Math.floor(r() * size), cc = Math.floor(r() * size)
      const er = rr + dr * (w.length - 1), ec = cc + dc * (w.length - 1)
      if (er < 0 || er >= size || ec < 0 || ec >= size) continue
      let fits = true
      for (let k = 0; k < w.length; k++) { const g = grid[rr + dr * k][cc + dc * k]; if (g && g !== w[k]) { fits = false; break } }
      if (!fits) continue
      for (let k = 0; k < w.length; k++) grid[rr + dr * k][cc + dc * k] = w[k]
      placed.push({ word: w, r: rr, c: cc, dr, dc }); ok = true
    }
    if (!ok) skipped.push(w)
  }
  const letters = o.alphabet ?? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const filled = grid.map((row) => row.map((ch) => ch || letters[Math.floor(r() * letters.length)]))
  return { grid: filled, solution: grid, placed, skipped }
}

/* ---------------- crossword (greedy builder) ---------------- */
export interface CwEntry { word: string; clue: string; r: number; c: number; across: boolean; num?: number }
export function crossword(items: { word: string; clue: string }[], o: { seed: number; tries?: number }) {
  const clean = items.map((x) => ({ word: x.word.toUpperCase().replace(/[^\p{L}]/gu, ''), clue: x.clue.trim() })).filter((x) => x.word.length >= 2)
  if (!clean.length) throw new Error('Add at least one word with a clue.')
  let best: { entries: CwEntry[]; skipped: string[]; area: number } | null = null
  const r = rng(o.seed)
  for (let attempt = 0; attempt < (o.tries ?? 30); attempt++) {
    const order = attempt === 0 ? [...clean].sort((a, b) => b.word.length - a.word.length) : shuffle(clean, r)
    const cells = new Map<string, string>()
    const entries: CwEntry[] = [], skipped: string[] = []
    const at = (rr: number, cc: number) => cells.get(`${rr},${cc}`)
    const canPlace = (w: string, rr: number, cc: number, across: boolean) => {
      let cross = 0
      if (at(rr - (across ? 0 : 1), cc - (across ? 1 : 0)) || at(rr + (across ? 0 : w.length), cc + (across ? w.length : 0))) return -1
      for (let k = 0; k < w.length; k++) {
        const r2 = rr + (across ? 0 : k), c2 = cc + (across ? k : 0), g = at(r2, c2)
        if (g) { if (g !== w[k]) return -1; cross++ }
        else if (at(r2 + (across ? 1 : 0), c2 + (across ? 0 : 1)) || at(r2 - (across ? 1 : 0), c2 - (across ? 0 : 1))) return -1
      }
      return cross
    }
    const put = (it: { word: string; clue: string }, rr: number, cc: number, across: boolean) => { for (let k = 0; k < it.word.length; k++) cells.set(`${rr + (across ? 0 : k)},${cc + (across ? k : 0)}`, it.word[k]); entries.push({ ...it, r: rr, c: cc, across }) }
    put(order[0], 0, 0, true)
    for (const it of order.slice(1)) {
      let opt: [number, number, boolean, number] | null = null
      for (const e of entries) for (let i = 0; i < e.word.length; i++) for (let j = 0; j < it.word.length; j++) {
        if (e.word[i] !== it.word[j]) continue
        const across = !e.across
        const rr = e.across ? e.r - j : e.r + i, cc = e.across ? e.c + i : e.c - j
        const sc = canPlace(it.word, rr, cc, across)
        if (sc > 0 && (!opt || sc > opt[3])) opt = [rr, cc, across, sc]
      }
      if (opt) put(it, opt[0], opt[1], opt[2]); else skipped.push(it.word)
    }
    const rs = [...cells.keys()].map((k) => k.split(',').map(Number))
    const area = (Math.max(...rs.map((x) => x[0])) - Math.min(...rs.map((x) => x[0])) + 1) * (Math.max(...rs.map((x) => x[1])) - Math.min(...rs.map((x) => x[1])) + 1)
    if (!best || skipped.length < best.skipped.length || (skipped.length === best.skipped.length && area < best.area)) best = { entries, skipped, area }
  }
  const { entries, skipped } = best!
  const minR = Math.min(...entries.map((e) => e.r)), minC = Math.min(...entries.map((e) => e.c))
  for (const e of entries) { e.r -= minR; e.c -= minC }
  const rows = Math.max(...entries.map((e) => e.r + (e.across ? 1 : e.word.length))), cols = Math.max(...entries.map((e) => e.c + (e.across ? e.word.length : 1)))
  const starts = [...new Set(entries.map((e) => `${e.r},${e.c}`))].map((k) => k.split(',').map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  for (const e of entries) e.num = starts.findIndex(([rr, cc]) => rr === e.r && cc === e.c) + 1
  const grid: (string | null)[][] = Array.from({ length: rows }, () => Array(cols).fill(null))
  for (const e of entries) for (let k = 0; k < e.word.length; k++) grid[e.r + (e.across ? 0 : k)][e.c + (e.across ? k : 0)] = e.word[k]
  return { entries, skipped, grid, rows, cols }
}

/* ---------------- citations ---------------- */
export interface Ref { type: 'book' | 'article' | 'web' | 'chapter' | 'thesis' | 'report'; authors: { family: string; given: string }[]; title: string; year?: string; container?: string; publisher?: string; place?: string; volume?: string; issue?: string; pages?: string; doi?: string; url?: string; accessed?: string; edition?: string; editors?: string; month?: string; day?: string; key?: string }
export function parseAuthors(s: string): Ref['authors'] {
  return s.split(/\s*(?:;|\band\b|\n)\s*/).map((a) => a.trim()).filter(Boolean).map((a) => {
    if (a.includes(',')) { const [f, g] = a.split(',').map((x) => x.trim()); return { family: f, given: g ?? '' } }
    const p = a.split(/\s+/); return { family: p.pop() ?? '', given: p.join(' ') }
  })
}
const initials = (g: string, dots = true, space = true) => g.split(/[\s-]+/).filter(Boolean).map((x) => x[0].toUpperCase() + (dots ? '.' : '')).join(space ? ' ' : '')
const sentenceCase = (t: string) => t ? t.charAt(0).toUpperCase() + t.slice(1) : t
const end = (s: string) => (/[.?!]$/.test(s) ? s : s + '.')
export type Style = 'apa' | 'mla' | 'chicago' | 'harvard' | 'ieee' | 'vancouver'
/** Returns plain text with *asterisks* around italic parts so callers can render or strip them. */
export function cite(r: Ref, style: Style, n = 1): string {
  const A = r.authors.filter((a) => a.family)
  const doi = r.doi ? `https://doi.org/${r.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}` : ''
  const link = doi || r.url || ''
  const pages = r.pages ? r.pages.replace(/-+/g, '–') : ''
  const yr = r.year || 'n.d.'
  if (style === 'apa') {
    const names = A.map((a) => `${a.family}, ${initials(a.given)}`)
    const au = names.length > 20 ? [...names.slice(0, 19), '. . .', names.at(-1)].join(', ') : names.length > 1 ? names.slice(0, -1).join(', ') + ', & ' + names.at(-1) : names[0] ?? ''
    const head = au ? `${au} (${yr}). ` : ''
    if (r.type === 'article') return `${head}${end(r.title)} *${r.container ?? ''}*${r.volume ? `, *${r.volume}*` : ''}${r.issue ? `(${r.issue})` : ''}${pages ? `, ${pages}` : ''}.${link ? ' ' + link : ''}`.trim()
    if (r.type === 'web') return `${head}*${r.title}*. ${r.container ? r.container + '. ' : ''}${link}`.trim()
    if (r.type === 'chapter') return `${head}${end(r.title)} In ${r.editors ? r.editors + ' (Eds.), ' : ''}*${r.container ?? ''}*${pages ? ` (pp. ${pages})` : ''}. ${r.publisher ?? ''}.${link ? ' ' + link : ''}`.trim()
    return `${head}*${r.title}*${r.edition ? ` (${r.edition} ed.)` : ''}. ${r.publisher ? r.publisher + '.' : ''}${link ? ' ' + link : ''}`.trim()
  }
  if (style === 'mla') {
    const au = A.length === 0 ? '' : A.length === 1 ? `${A[0].family}, ${A[0].given}. ` : A.length === 2 ? `${A[0].family}, ${A[0].given}, and ${A[1].given} ${A[1].family}. ` : `${A[0].family}, ${A[0].given}, et al. `
    if (r.type === 'article') return `${au}"${end(r.title)}" *${r.container ?? ''}*${r.volume ? `, vol. ${r.volume}` : ''}${r.issue ? `, no. ${r.issue}` : ''}, ${yr}${pages ? `, pp. ${pages}` : ''}${link ? `, ${link.replace(/^https?:\/\//, '')}` : ''}.`
    if (r.type === 'web') return `${au}"${end(r.title)}" *${r.container ?? ''}*, ${[r.day, r.month, r.year].filter(Boolean).join(' ') || 'n.d.'}${link ? `, ${link.replace(/^https?:\/\//, '')}` : ''}.${r.accessed ? ` Accessed ${r.accessed}.` : ''}`
    return `${au}*${r.title}*.${r.edition ? ` ${r.edition} ed.,` : ''} ${r.publisher ?? ''}, ${yr}.`
  }
  if (style === 'chicago') {
    const au = A.length === 0 ? '' : A.length === 1 ? `${A[0].family}, ${A[0].given}. ` : A.length <= 10 ? `${A[0].family}, ${A[0].given}, ${A.slice(1, -1).map((a) => `${a.given} ${a.family}, `).join('')}and ${A.at(-1)!.given} ${A.at(-1)!.family}. ` : `${A[0].family}, ${A[0].given}, et al. `
    if (r.type === 'article') return `${au}${yr}. "${end(r.title)}" *${r.container ?? ''}* ${r.volume ?? ''}${r.issue ? ` (${r.issue})` : ''}${pages ? `: ${pages}` : ''}.${link ? ' ' + link + '.' : ''}`
    if (r.type === 'web') return `${au}${yr}. "${end(r.title)}" ${r.container ? r.container + '. ' : ''}${link}.`
    return `${au}${yr}. *${r.title}*. ${r.place ? r.place + ': ' : ''}${r.publisher ?? ''}.`
  }
  if (style === 'harvard') {
    const names = A.map((a) => `${a.family}, ${initials(a.given, true, false)}`)
    const au = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names.at(-1) : names[0] ?? ''
    if (r.type === 'article') return `${au} (${yr}) '${r.title}', *${r.container ?? ''}*${r.volume ? `, ${r.volume}` : ''}${r.issue ? `(${r.issue})` : ''}${pages ? `, pp. ${pages}` : ''}.${doi ? ` doi: ${r.doi}.` : r.url ? ` Available at: ${r.url}` : ''}`
    if (r.type === 'web') return `${au} (${yr}) *${r.title}*. Available at: ${link}${r.accessed ? ` (Accessed: ${r.accessed})` : ''}.`
    return `${au} (${yr}) *${r.title}*.${r.edition ? ` ${r.edition} edn.` : ''} ${r.place ? r.place + ': ' : ''}${r.publisher ?? ''}.`
  }
  const names = A.map((a) => style === 'ieee' ? `${initials(a.given)} ${a.family}` : `${a.family} ${initials(a.given, false, false)}`)
  if (style === 'ieee') {
    const au = names.length > 6 ? names[0] + ' et al.' : names.length === 2 ? names.join(' and ') : names.length > 1 ? names.slice(0, -1).join(', ') + ', and ' + names.at(-1) : names[0] ?? ''
    if (r.type === 'article') return `[${n}] ${au}, "${r.title}," *${r.container ?? ''}*${r.volume ? `, vol. ${r.volume}` : ''}${r.issue ? `, no. ${r.issue}` : ''}${pages ? `, pp. ${pages}` : ''}, ${yr}${doi ? `, doi: ${r.doi}` : ''}.`
    if (r.type === 'web') return `[${n}] ${au}, "${r.title}," ${r.container ? r.container + ', ' : ''}${yr}. [Online]. Available: ${link}`
    return `[${n}] ${au}, *${r.title}*${r.edition ? `, ${r.edition} ed` : ''}. ${r.place ? r.place + ': ' : ''}${r.publisher ?? ''}, ${yr}.`
  }
  const au = (names.length > 6 ? names.slice(0, 6).join(', ') + ', et al' : names.join(', '))
  if (r.type === 'article') return `${n}. ${au}. ${end(r.title)} ${r.container ?? ''}. ${yr}${r.volume ? `;${r.volume}` : ''}${r.issue ? `(${r.issue})` : ''}${pages ? `:${pages}` : ''}.${doi ? ` doi:${r.doi}` : ''}`
  return `${n}. ${au}. ${end(r.title)} ${r.place ? r.place + ': ' : ''}${r.publisher ?? ''}; ${yr}.`
}
export const plainCite = (s: string) => s.replace(/\*/g, '')
export const htmlCite = (s: string, esc: (x: string) => string) => esc(s).replace(/\*([^*]+)\*/g, '<i>$1</i>')
export function inText(r: Ref, style: Style, n = 1) {
  const A = r.authors, y = r.year || 'n.d.'
  const who = A.length === 0 ? sentenceCase(r.title.split(' ').slice(0, 3).join(' ')) : A.length === 1 ? A[0].family : A.length === 2 ? `${A[0].family} ${style === 'apa' ? '&' : 'and'} ${A[1].family}` : `${A[0].family} et al.`
  if (style === 'ieee' || style === 'vancouver') return `[${n}]`
  if (style === 'mla') return `(${who}${r.pages ? ' ' + r.pages.split(/[-–]/)[0] : ''})`
  return `(${who}${style === 'chicago' ? '' : ','} ${y})`
}

/* ---------------- BibTeX and RIS ---------------- */
const BIB_TYPE: Record<string, Ref['type']> = { article: 'article', book: 'book', inbook: 'chapter', incollection: 'chapter', phdthesis: 'thesis', mastersthesis: 'thesis', techreport: 'report', misc: 'web', online: 'web', inproceedings: 'chapter' }
export function parseBibtex(text: string): Ref[] {
  const out: Ref[] = []
  const re = /@(\w+)\s*\{\s*([^,\s]+)\s*,/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    let depth = 1, i = re.lastIndex
    for (; i < text.length && depth > 0; i++) { if (text[i] === '{') depth++; else if (text[i] === '}') depth-- }
    const body = text.slice(re.lastIndex, i - 1)
    const f: Record<string, string> = {}
    const fr = /(\w+)\s*=\s*/g; let fm: RegExpExecArray | null
    while ((fm = fr.exec(body))) {
      let j = fr.lastIndex, v = ''
      if (body[j] === '{') { let d = 0; const s = j; for (; j < body.length; j++) { if (body[j] === '{') d++; else if (body[j] === '}') { d--; if (!d) break } } v = body.slice(s + 1, j); j++ }
      else if (body[j] === '"') { const e = body.indexOf('"', j + 1); v = body.slice(j + 1, e); j = e + 1 }
      else { const e = body.slice(j).search(/[,}\n]/); v = body.slice(j, e < 0 ? undefined : j + e).trim(); j += e < 0 ? body.length : e }
      f[fm[1].toLowerCase()] = v.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim(); fr.lastIndex = j
    }
    out.push({ key: m[2], type: BIB_TYPE[m[1].toLowerCase()] ?? 'web', authors: parseAuthors(f.author ?? ''), title: f.title ?? '', year: f.year ?? f.date?.slice(0, 4), container: f.journal ?? f.journaltitle ?? f.booktitle ?? f.howpublished, publisher: f.publisher ?? f.institution ?? f.school, place: f.address ?? f.location, volume: f.volume, issue: f.number ?? f.issue, pages: f.pages?.replace(/--/g, '-'), doi: f.doi, url: f.url, edition: f.edition, editors: f.editor, month: f.month, accessed: f.urldate })
    re.lastIndex = i
  }
  return out
}
const BIB_OUT: Record<Ref['type'], string> = { article: 'article', book: 'book', chapter: 'incollection', web: 'misc', thesis: 'phdthesis', report: 'techreport' }
export function citeKey(r: Ref) { return (r.key || `${(r.authors[0]?.family ?? 'anon').toLowerCase().replace(/[^a-z]/g, '')}${r.year ?? ''}${(r.title.match(/[A-Za-z]{4,}/)?.[0] ?? '').toLowerCase()}`) }
export function toBibtex(refs: Ref[]) {
  return refs.map((r) => {
    const f: [string, string | undefined][] = [['author', r.authors.map((a) => `${a.family}, ${a.given}`).join(' and ')], ['title', r.title], [r.type === 'article' ? 'journal' : r.type === 'chapter' ? 'booktitle' : r.type === 'web' ? 'howpublished' : 'series', r.type === 'book' ? undefined : r.container], ['year', r.year], ['volume', r.volume], ['number', r.issue], ['pages', r.pages?.replace(/[-–]+/, '--')], ['publisher', r.publisher], ['address', r.place], ['edition', r.edition], ['doi', r.doi], ['url', r.url]]
    return `@${BIB_OUT[r.type]}{${citeKey(r)},\n` + f.filter(([, v]) => v).map(([k, v]) => `  ${k} = {${v}}`).join(',\n') + '\n}'
  }).join('\n\n') + '\n'
}
const RIS_TYPE: Record<string, Ref['type']> = { JOUR: 'article', BOOK: 'book', CHAP: 'chapter', ELEC: 'web', WEB: 'web', THES: 'thesis', RPRT: 'report', GEN: 'web', CONF: 'chapter' }
export function parseRis(text: string): Ref[] {
  const out: Ref[] = []; let cur: any = null
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const m = line.match(/^([A-Z][A-Z0-9])  - ?(.*)$/); if (!m) continue
    const [, k, v] = m
    if (k === 'TY') { cur = { type: RIS_TYPE[v.trim()] ?? 'web', authors: [], title: '' }; continue }
    if (!cur) continue
    if (k === 'ER') { out.push(cur); cur = null; continue }
    if (k === 'AU' || k === 'A1') cur.authors.push(...parseAuthors(v))
    else if (k === 'TI' || k === 'T1') cur.title = v.trim()
    else if (k === 'PY' || k === 'Y1' || k === 'DA') cur.year ??= v.match(/\d{4}/)?.[0]
    else if (k === 'JO' || k === 'T2' || k === 'JF' || k === 'BT') cur.container ??= v.trim()
    else if (k === 'VL') cur.volume = v.trim()
    else if (k === 'IS') cur.issue = v.trim()
    else if (k === 'SP') cur.pages = v.trim() + (cur.pages?.startsWith('-') ? cur.pages : '')
    else if (k === 'EP') cur.pages = (cur.pages ?? '') + '-' + v.trim()
    else if (k === 'PB') cur.publisher = v.trim()
    else if (k === 'CY') cur.place = v.trim()
    else if (k === 'DO') cur.doi = v.trim()
    else if (k === 'UR') cur.url = v.trim()
    else if (k === 'ET') cur.edition = v.trim()
  }
  return out
}
const RIS_OUT: Record<Ref['type'], string> = { article: 'JOUR', book: 'BOOK', chapter: 'CHAP', web: 'ELEC', thesis: 'THES', report: 'RPRT' }
export function toRis(refs: Ref[]) {
  return refs.map((r) => {
    const L = [`TY  - ${RIS_OUT[r.type]}`, ...r.authors.map((a) => `AU  - ${a.family}, ${a.given}`), `TI  - ${r.title}`]
    if (r.year) L.push(`PY  - ${r.year}`)
    if (r.container) L.push(`${r.type === 'article' ? 'JO' : 'T2'}  - ${r.container}`)
    if (r.volume) L.push(`VL  - ${r.volume}`); if (r.issue) L.push(`IS  - ${r.issue}`)
    if (r.pages) { const [sp, ep] = r.pages.split(/[-–]+/); L.push(`SP  - ${sp}`); if (ep) L.push(`EP  - ${ep}`) }
    if (r.publisher) L.push(`PB  - ${r.publisher}`); if (r.place) L.push(`CY  - ${r.place}`)
    if (r.doi) L.push(`DO  - ${r.doi}`); if (r.url) L.push(`UR  - ${r.url}`)
    L.push('ER  - ')
    return L.join('\n')
  }).join('\n\n') + '\n'
}
export function toCslJson(refs: Ref[]) {
  const T: Record<Ref['type'], string> = { article: 'article-journal', book: 'book', chapter: 'chapter', web: 'webpage', thesis: 'thesis', report: 'report' }
  return JSON.stringify(refs.map((r) => ({ id: citeKey(r), type: T[r.type], title: r.title, author: r.authors.map((a) => ({ family: a.family, given: a.given })), issued: r.year ? { 'date-parts': [[+r.year]] } : undefined, 'container-title': r.container, publisher: r.publisher, 'publisher-place': r.place, volume: r.volume, issue: r.issue, page: r.pages, DOI: r.doi, URL: r.url })), null, 2) + '\n'
}
export function parseCslJson(text: string): Ref[] {
  const arr = JSON.parse(text); const list = Array.isArray(arr) ? arr : [arr]
  const T: Record<string, Ref['type']> = { 'article-journal': 'article', article: 'article', book: 'book', chapter: 'chapter', webpage: 'web', thesis: 'thesis', report: 'report' }
  return list.map((x: any) => ({ key: x.id, type: T[x.type] ?? 'web', title: x.title ?? '', authors: (x.author ?? []).map((a: any) => ({ family: a.family ?? a.literal ?? '', given: a.given ?? '' })), year: x.issued?.['date-parts']?.[0]?.[0]?.toString(), container: x['container-title'], publisher: x.publisher, place: x['publisher-place'], volume: x.volume?.toString(), issue: x.issue?.toString(), pages: x.page, doi: x.DOI, url: x.URL }))
}
export function detectRefFormat(text: string): 'bibtex' | 'ris' | 'csl' | null {
  const t = text.trim()
  if (/^\s*@\w+\s*\{/m.test(t)) return 'bibtex'
  if (/^TY  - /m.test(t)) return 'ris'
  if (/^[[{]/.test(t)) { try { JSON.parse(t); return 'csl' } catch { return null } }
  return null
}

/* ---------------- GPA and grades ---------------- */
export const GPA_SCALES: Record<string, { label: string; max: number; grades: [string, number][] }> = {
  us4: { label: 'US 4.0 (A to F)', max: 4, grades: [['A+', 4], ['A', 4], ['A-', 3.7], ['B+', 3.3], ['B', 3], ['B-', 2.7], ['C+', 2.3], ['C', 2], ['C-', 1.7], ['D+', 1.3], ['D', 1], ['F', 0]] },
  in10: { label: 'India 10 point (O to F)', max: 10, grades: [['O', 10], ['A+', 9], ['A', 8], ['B+', 7], ['B', 6], ['C', 5], ['P', 4], ['F', 0]] },
  uk: { label: 'UK percentages (classification)', max: 100, grades: [['First (70+)', 75], ['2:1 (60-69)', 65], ['2:2 (50-59)', 55], ['Third (40-49)', 45], ['Fail', 30]] },
  pct: { label: 'Percent (0 to 100)', max: 100, grades: [] },
}
export function gpa(rows: { credits: number; points: number }[]) {
  const c = rows.reduce((s, r) => s + (r.credits > 0 ? r.credits : 0), 0)
  const p = rows.reduce((s, r) => s + (r.credits > 0 ? r.credits * r.points : 0), 0)
  return { credits: c, points: p, gpa: c ? p / c : 0 }
}
/** CGPA with past credits included. */
export const cumulative = (prevGpa: number, prevCredits: number, now: { credits: number; points: number }) => (prevCredits + now.credits ? (prevGpa * prevCredits + now.points) / (prevCredits + now.credits) : 0)
/** Final exam score needed: (target - current * (1 - w)) / w. */
export function neededOnFinal(current: number, target: number, weightPct: number) {
  const w = weightPct / 100; if (!(w > 0 && w <= 1)) throw new Error('The final exam weight must be between 1 and 100 percent.')
  return (target - current * (1 - w)) / w
}
/** Weighted average of graded parts. Parts without a score are left out and reported. */
export function weightedGrade(parts: { name: string; weight: number; score: number | null }[]) {
  const done = parts.filter((p) => p.score != null && p.weight > 0)
  const w = done.reduce((s, p) => s + p.weight, 0)
  const avg = w ? done.reduce((s, p) => s + p.weight * (p.score as number), 0) / w : 0
  const totalW = parts.reduce((s, p) => s + Math.max(0, p.weight), 0)
  return { average: avg, counted: w, remaining: Math.max(0, totalW - w), totalWeight: totalW }
}
export function letter(pct: number) { return pct >= 97 ? 'A+' : pct >= 93 ? 'A' : pct >= 90 ? 'A-' : pct >= 87 ? 'B+' : pct >= 83 ? 'B' : pct >= 80 ? 'B-' : pct >= 77 ? 'C+' : pct >= 73 ? 'C' : pct >= 70 ? 'C-' : pct >= 67 ? 'D+' : pct >= 60 ? 'D' : 'F' }

/* ---------------- typing ---------------- */
export function typingStats(target: string, typed: string, seconds: number) {
  let correct = 0
  for (let i = 0; i < typed.length; i++) if (typed[i] === target[i]) correct++
  const errors = typed.length - correct
  const minutes = Math.max(seconds, 1) / 60
  return { wpm: Math.round(typed.length / 5 / minutes), net: Math.max(0, Math.round((typed.length / 5 - errors) / minutes)), accuracy: typed.length ? correct / typed.length : 1, errors, chars: typed.length }
}
export const TYPING_TEXTS = [
  'Good habits are built one small step at a time. Pick one thing you want to get better at, practise it for a few minutes every day, and look back after a month. You will be surprised how far you came.',
  'A file you open in your browser does not have to leave your computer. Modern browsers can read, change and save files on their own, which keeps your work private and fast even on a slow network.',
  'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump. These short lines use every letter of the alphabet at least once.',
  'Rivers carry water from the mountains to the sea. Along the way they shape valleys, feed farms and give homes to fish and birds. A healthy river is a sign of a healthy land around it.',
  'When you study, test yourself instead of reading the same page again. Recalling an answer from memory, even when it feels hard, makes it stick far better than looking at the notes one more time.',
]
