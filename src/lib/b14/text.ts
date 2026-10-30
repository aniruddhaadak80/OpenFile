/* Text helpers for the round 14 text tools. Pure, unit tested in Node. */

export interface Rule { find: string; replace: string; regex: boolean; caseSensitive: boolean; wholeWord: boolean; on?: boolean }

export const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Build the RegExp for one rule. Throws a readable error for a bad pattern. */
export function ruleRegex(r: Rule): RegExp {
  let src = r.regex ? r.find : escapeRegExp(r.find)
  if (r.wholeWord) src = `(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`
  try { return new RegExp(src, 'gu' + (r.caseSensitive ? '' : 'i') + (r.regex ? 'm' : '')) } catch (e: any) { throw new Error(`Pattern "${r.find}" is not valid: ${e?.message ?? e}`) }
}

/** Plain replacement text: \n and \t become line break and tab; in regex mode $1 groups work. */
const unescape = (s: string) => s.replace(/\\n/g, '\n').replace(/\\t/g, '\t')

/** Apply rules in order. Returns the new text and how many matches each rule replaced. */
export function applyRules(text: string, rules: Rule[]): { text: string; counts: number[] } {
  const counts: number[] = []
  let out = text
  for (const r of rules) {
    if (!r.find || r.on === false) { counts.push(0); continue }
    const re = ruleRegex(r)
    let n = 0
    const rep = unescape(r.replace)
    out = out.replace(re, (...args) => {
      n++
      if (!r.regex) return rep
      // expand $1.. and $& by hand so named groups and literal $ still work
      const m = args[0] as string
      const end = args.findIndex((a, i) => i > 0 && typeof a === 'number')
      const groups = args.slice(1, end < 0 ? undefined : end)
      return rep.replace(/\$(\d{1,2}|&)/g, (_x, g) => (g === '&' ? m : String(groups[+g - 1] ?? '')))
    })
    counts.push(n)
  }
  return { text: out, counts }
}

/** Find all matches of one rule with line numbers, for highlighting. */
export function findMatches(text: string, r: Rule, limit = 2000): { index: number; length: number; line: number }[] {
  if (!r.find) return []
  const re = ruleRegex(r)
  const out: { index: number; length: number; line: number }[] = []
  let m: RegExpExecArray | null
  let line = 1, last = 0
  while ((m = re.exec(text)) && out.length < limit) {
    for (let i = last; i < m.index; i++) if (text.charCodeAt(i) === 10) line++
    last = m.index
    out.push({ index: m.index, length: m[0].length, line })
    if (m[0].length === 0) re.lastIndex++
  }
  return out
}

/** Parse "find => replace" lines (one rule per line) for bulk mode. */
export function parseRuleList(s: string, base: Omit<Rule, 'find' | 'replace'>): Rule[] {
  return s.split(/\r?\n/).filter((l) => l.trim()).map((l) => {
    const i = l.indexOf('=>'), j = i < 0 ? l.indexOf('\t') : -1
    const [f, r] = i >= 0 ? [l.slice(0, i), l.slice(i + 2)] : j >= 0 ? [l.slice(0, j), l.slice(j + 1)] : [l, '']
    return { ...base, find: f.trim(), replace: r.trim() }
  })
}

/* ---------------- repeat ---------------- */
export interface RepeatOpts { count: number; sep: string; numbered: boolean; numberFormat?: string; trailing?: boolean }
export function repeatText(t: string, o: RepeatOpts): string {
  const n = Math.max(0, Math.min(100000, Math.floor(o.count)))
  const parts: string[] = []
  for (let i = 1; i <= n; i++) parts.push(o.numbered ? (o.numberFormat ?? '{n}. ').replace('{n}', String(i)) + t.replace(/\{n\}/g, String(i)) : t.replace(/\{n\}/g, String(i)))
  return parts.join(o.sep) + (o.trailing ? o.sep : '')
}

/* ---------------- columns ---------------- */
export type Delim = ',' | '\t' | ';' | '|' | ' ' | 'ws' | string

/** Guess the delimiter from the first lines. */
export function guessDelimiter(text: string): Delim {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20)
  const cands: Delim[] = ['\t', ',', ';', '|']
  let best: Delim = 'ws', bestScore = 0
  for (const d of cands) {
    const counts = lines.map((l) => splitRow(l, d).length)
    const ok = counts.filter((c) => c > 1 && c === counts[0]).length
    const score = ok * counts[0]
    if (score > bestScore) { bestScore = score; best = d }
  }
  return best
}

/** Split one row, honouring double quotes for comma/semicolon/tab/pipe. 'ws' splits on runs of spaces. */
export function splitRow(line: string, d: Delim): string[] {
  if (d === 'ws') return line.trim().split(/\s+/)
  const out: string[] = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"' && cur === '') q = true
    else if (line.startsWith(d, i)) { out.push(cur); cur = ''; i += d.length - 1 }
    else cur += c
  }
  out.push(cur)
  return out
}

/** "1,3-5,-1" (1 based, negative counts from the end) to zero based indexes. */
export function parseColumns(spec: string, total: number): number[] {
  const out: number[] = []
  for (const part of spec.split(/[,\s]+/).filter(Boolean)) {
    const m = part.match(/^(-?\d+)(?:-(-?\d+))?$/)
    if (!m) continue
    const f = (v: string) => { const n = +v; return n < 0 ? total + n : n - 1 }
    const a = f(m[1]), b = m[2] != null ? f(m[2]) : a
    const step = a <= b ? 1 : -1
    for (let i = a; step > 0 ? i <= b : i >= b; i += step) if (i >= 0 && i < total) out.push(i)
  }
  return out
}

export function quoteCell(s: string, d: string) { return d && (s.includes(d) || s.includes('"') || s.includes('\n')) && d !== ' ' ? `"${s.replace(/"/g, '""')}"` : s }

export function extractColumns(text: string, o: { delim: Delim; cols: string; outDelim: string; skipHeader?: boolean; trim?: boolean; unique?: boolean }): { text: string; rows: number; width: number } {
  const lines = text.split(/\r?\n/).filter((l) => l.length)
  const rows = lines.map((l) => splitRow(l, o.delim).map((c) => (o.trim ? c.trim() : c)))
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0)
  const idx = parseColumns(o.cols, width)
  let body = (o.skipHeader ? rows.slice(1) : rows).map((r) => idx.map((i) => quoteCell(r[i] ?? '', o.outDelim)).join(o.outDelim))
  if (o.unique) body = [...new Set(body)]
  return { text: body.join('\n'), rows: body.length, width }
}

/* ---------------- multi file ---------------- */
/** Count line level changes between two texts, for a quick summary. */
export function changedLines(a: string, b: string): number {
  const x = a.split('\n'), y = b.split('\n')
  let n = Math.abs(x.length - y.length)
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) n++
  return n
}
