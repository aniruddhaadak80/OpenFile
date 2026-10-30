// Pure parsers for the Quiz and Flashcard Generator. Small models answer in many shapes, so these
// accept JSON objects with loose keys and plain "Q: / A:" or "A) B) C) D) Answer:" text.

export interface Card { q: string; a: string }
export interface Mcq { q: string; options: string[]; answer: number; explain?: string }

/** Parse "Q: ... A: ..." text when the model does not return JSON. */
export function parseQa(s: string): Card[] {
  const out: Card[] = []
  const re = /(?:^|\n)\s*(?:\d+[.)]\s*)?(?:Q(?:uestion)?\s*[:.-])\s*(.+?)\s*\n\s*(?:A(?:nswer)?\s*[:.-])\s*(.+?)(?=\n\s*(?:\d+[.)]\s*)?Q|\n\n|$)/gis
  for (const m of s.matchAll(re)) out.push({ q: m[1].trim(), a: m[2].trim() })
  return out
}

export function normCards(x: any): Card[] {
  return (Array.isArray(x) ? x : x?.cards ?? x?.flashcards ?? []).map((c: any) => ({ q: String(c?.q ?? c?.question ?? c?.front ?? '').trim(), a: String(c?.a ?? c?.answer ?? c?.back ?? '').trim() })).filter((c: Card) => c.q && c.a)
}

const clean = (s: string) => s.toLowerCase().replace(/^[a-d][.):]\s+/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** Index of the option a free-text answer names: a letter, a 1-based number, or the option text itself. -1 when unclear. */
export function answerIndex(ans: string, options: string[]): number {
  const s = ans.trim()
  const letter = /^\(?([A-D])\)?(?:[.):\s]|$)/i.exec(s)
  if (letter && (s.length <= 3 || /^\(?[A-D]\)?[.):]\s/i.test(s))) { const i = letter[1].toUpperCase().charCodeAt(0) - 65; if (i < options.length) return i }
  const c = clean(s); if (!c) return -1
  const exact = options.findIndex((o) => clean(o) === c); if (exact >= 0) return exact
  const inside = options.map((o, i) => [clean(o), i] as const).filter(([o]) => o.length > 2 && (c.includes(o) || o.includes(c)))
  return inside.length === 1 ? inside[0][1] : -1
}

export function normMcq(x: any): Mcq[] {
  return (Array.isArray(x) ? x : x?.questions ?? []).map((c: any) => {
    const raw = c?.options ?? c?.choices ?? []
    const options: string[] = (Array.isArray(raw) ? raw : typeof raw === 'object' && raw ? Object.values(raw) : []).map((o: any) => String(o).replace(/^[A-D][.)]\s*/, '').trim()).filter(Boolean)
    const a = c?.answer ?? c?.correct ?? c?.correct_answer
    let answer = -1
    if (typeof a === 'number' || (typeof a === 'string' && /^\d$/.test(a.trim()))) {
      const n = Number(a)
      // some small models count from 1; trust the explanation when it names an option, else read n as 1-based only when n is past the end
      const byExplain = typeof c?.explain === 'string' ? answerIndex(c.explain, options) : -1
      answer = byExplain >= 0 && (byExplain === n || byExplain === n - 1) ? byExplain : n >= 0 && n < options.length ? n : n === options.length ? n - 1 : -1
    } else if (typeof a === 'string') answer = answerIndex(a, options)
    return { q: String(c?.q ?? c?.question ?? '').trim(), options, answer, explain: c?.explain ?? c?.explanation }
  }).filter((c: Mcq) => c.q && c.options.length >= 2 && c.answer >= 0 && c.answer < c.options.length)
}

/** Parse plain-text multiple choice: a question line, options "A) ..." to "D) ...", then "Answer: B". */
export function parseMcqText(s: string): Mcq[] {
  const out: Mcq[] = []
  type Cur = { q: string; options: string[]; ans: string; explain: string }
  let cur: Cur | null = null
  const flush = () => {
    if (cur && cur.q && cur.options.length >= 2 && cur.ans) { const answer = answerIndex(cur.ans, cur.options); if (answer >= 0) out.push({ q: cur.q, options: cur.options, answer, ...(cur.explain ? { explain: cur.explain } : {}) }) }
    cur = null
  }
  for (const raw of s.replace(/\r/g, '').split('\n')) {
    const l = raw.trim(); if (!l) continue
    const opt = /^\(?([A-D])\s*[).:-]\s*(.+)$/i.exec(l)
    const an = /^(?:correct\s+)?answer\s*[:.-]\s*(.+)$/i.exec(l)
    const ex = /^(?:explanation|why|reason)\s*[:.-]\s*(.+)$/i.exec(l)
    const c = cur as Cur | null
    if (an && c) c.ans = an[1]
    else if (ex && c) c.explain = ex[1]
    else if (opt && c && !c.ans) c.options.push(opt[2].trim())
    else {
      const q = l.replace(/^(?:\d+[.)]\s*)?(?:Q(?:uestion)?\s*\d*\s*[:.-])?\s*/i, '').trim()
      if (c && !c.options.length && !c.ans) c.q = q
      else { flush(); cur = { q, options: [], ans: '', explain: '' } }
    }
  }
  flush()
  return out
}

/**
 * Build multiple choice from question and answer cards: each card's answer is the correct option and the
 * other cards' answers (then other sentences of the text) are the wrong ones. Used when a small model writes
 * neither JSON nor "A) B) C) D)" quizzes but still writes plain "Q: / A:" pairs (SmolLM2 360M on a CPU, Oct 2026).
 */
export function mcqFromCards(cards: Card[], text = ''): Mcq[] {
  const seen = new Set<string>()
  const uniq = cards.filter((c) => { const k = clean(c.a); if (!k || seen.has(k)) return false; seen.add(k); return true })
  const sentences = text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 12 && s.length < 200)
  const out: Mcq[] = []
  uniq.forEach((c, i) => {
    const key = clean(c.a)
    const differs = (s: string) => { const k = clean(s); return !!k && k !== key && !k.includes(key) && !key.includes(k) }
    const wrong: string[] = []
    for (const s of [...uniq.slice(i + 1), ...uniq.slice(0, i)].map((o) => o.a).concat(sentences)) {
      if (wrong.length === 3) break
      if (differs(s) && !wrong.some((w) => clean(w) === clean(s))) wrong.push(s)
    }
    if (!wrong.length) return
    const answer = i % (wrong.length + 1)
    const options = [...wrong]; options.splice(answer, 0, c.a)
    out.push({ q: c.q, options, answer })
  })
  return out
}
