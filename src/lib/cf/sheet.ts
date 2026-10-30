/* Table helpers for the Office & Sheets tools: dedupe, sort and filter, clean, split, CSV writing.
 * Works on plain row arrays so it runs in Node tests. */
export type Cell = string | number | boolean | null
export type Rows = Cell[][]

export const str = (v: Cell | undefined) => (v == null ? '' : typeof v === 'string' ? v : String(v))
const norm = (v: Cell, o: { trim?: boolean; caseless?: boolean; spaces?: boolean }) => { let s = str(v); if (o.trim) s = s.trim(); if (o.spaces) s = s.replace(/\s+/g, ' '); if (o.caseless) s = s.toLowerCase(); return s }

/** Remove duplicate rows by all columns or by the chosen key columns. keep = first or last. */
export function dedupe(rows: Rows, o: { cols: number[] | null; header: boolean; keep: 'first' | 'last'; trim?: boolean; caseless?: boolean; spaces?: boolean }) {
  const head = o.header ? rows.slice(0, 1) : [], body = o.header ? rows.slice(1) : rows
  const key = (r: Cell[]) => (o.cols && o.cols.length ? o.cols.map((c) => norm(r[c] ?? null, o)) : r.map((c) => norm(c, o))).join('\u241f')
  const order = o.keep === 'last' ? [...body].reverse() : body
  const seen = new Map<string, number>(), kept: Cell[][] = [], removed: Cell[][] = []
  for (const r of order) { const k = key(r); if (seen.has(k)) { removed.push(r); seen.set(k, seen.get(k)! + 1) } else { seen.set(k, 1); kept.push(r) } }
  if (o.keep === 'last') { kept.reverse(); removed.reverse() }
  const groups = [...seen.values()].filter((n) => n > 1).length
  return { rows: [...head, ...kept], removed: [...head, ...removed], removedCount: removed.length, groups }
}

export type FilterOp = 'contains' | 'not-contains' | 'equals' | 'not-equals' | 'starts' | 'ends' | 'gt' | 'gte' | 'lt' | 'lte' | 'empty' | 'not-empty' | 'regex'
export interface Filter { col: number; op: FilterOp; value: string }
export const numOf = (v: Cell): number => { if (typeof v === 'number') return v; const t = str(v).replace(/[,\s$€£₹%]/g, ''); return t && /^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(t) ? Number(t) : NaN }
export function testFilter(v: Cell, f: Filter): boolean {
  const s = str(v), lo = s.toLowerCase(), val = f.value.toLowerCase()
  switch (f.op) {
    case 'contains': return lo.includes(val)
    case 'not-contains': return !lo.includes(val)
    case 'equals': return lo === val || (!isNaN(numOf(v)) && numOf(v) === Number(f.value))
    case 'not-equals': return !(lo === val || (!isNaN(numOf(v)) && numOf(v) === Number(f.value)))
    case 'starts': return lo.startsWith(val)
    case 'ends': return lo.endsWith(val)
    case 'gt': case 'gte': case 'lt': case 'lte': {
      const a = numOf(v), b = Number(f.value)
      if (!isNaN(a) && !isNaN(b)) return f.op === 'gt' ? a > b : f.op === 'gte' ? a >= b : f.op === 'lt' ? a < b : a <= b
      const c = s.localeCompare(f.value, undefined, { numeric: true }); return f.op === 'gt' ? c > 0 : f.op === 'gte' ? c >= 0 : f.op === 'lt' ? c < 0 : c <= 0
    }
    case 'empty': return s.trim() === ''
    case 'not-empty': return s.trim() !== ''
    case 'regex': try { return new RegExp(f.value, 'i').test(s) } catch { return false }
  }
}
export interface SortKey { col: number; dir: 'asc' | 'desc'; as: 'auto' | 'text' | 'number' | 'date' }
const dateOf = (v: Cell) => { const t = Date.parse(str(v)); return isNaN(t) ? NaN : t }
export function compareCells(a: Cell, b: Cell, as: SortKey['as']) {
  const ea = str(a).trim() === '', eb = str(b).trim() === ''
  if (ea || eb) return ea && eb ? 0 : ea ? 1 : -1 // blanks last
  if (as === 'number' || as === 'auto') { const x = numOf(a), y = numOf(b); if (!isNaN(x) && !isNaN(y)) return x - y; if (as === 'number') return isNaN(x) ? 1 : -1 }
  if (as === 'date') { const x = dateOf(a), y = dateOf(b); if (!isNaN(x) && !isNaN(y)) return x - y }
  return str(a).localeCompare(str(b), undefined, { numeric: true, sensitivity: 'base' })
}
export function sortFilter(rows: Rows, o: { header: boolean; filters: Filter[]; match: 'all' | 'any'; sort: SortKey[] }) {
  const head = o.header ? rows.slice(0, 1) : [], body = o.header ? rows.slice(1) : rows
  const fs = o.filters.filter((f) => f.col >= 0)
  const kept = fs.length ? body.filter((r) => (o.match === 'all' ? fs.every((f) => testFilter(r[f.col] ?? null, f)) : fs.some((f) => testFilter(r[f.col] ?? null, f)))) : [...body]
  if (o.sort.length) kept.sort((a, b) => { for (const k of o.sort) { const blankA = str(a[k.col] ?? null).trim() === '', blankB = str(b[k.col] ?? null).trim() === ''; if (blankA !== blankB) return blankA ? 1 : -1; const c = compareCells(a[k.col] ?? null, b[k.col] ?? null, k.as); if (c) return k.dir === 'asc' ? c : -c } return 0 })
  return [...head, ...kept]
}

export interface CleanOpts { trim: boolean; collapse: boolean; blankRows: boolean; blankCols: boolean; nbsp: boolean; caseMode: 'none' | 'lower' | 'upper' | 'title'; numbers: boolean; dates: boolean; header: boolean; transpose: boolean; fill: boolean }
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s(\-'/])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase())
/** Clean a table in one pass and report what changed. */
export function cleanRows(rows: Rows, o: CleanOpts) {
  let changed = 0
  let out: Rows = rows.map((r, ri) => r.map((v) => {
    if (typeof v !== 'string') return v
    let s = v
    if (o.nbsp) s = s.replace(/[\u00a0\u2007\u202f\u200b\ufeff]/g, (c) => (c === '\u200b' || c === '\ufeff' ? '' : ' '))
    if (o.trim) s = s.trim()
    if (o.collapse) s = s.replace(/[ \t]+/g, ' ')
    if (o.caseMode !== 'none' && !(o.header && ri === 0)) s = o.caseMode === 'lower' ? s.toLowerCase() : o.caseMode === 'upper' ? s.toUpperCase() : titleCase(s)
    let res: Cell = s
    if (o.numbers && !(o.header && ri === 0) && /^\s*[-+]?[$€£₹]?\s?\d{1,3}([, ]\d{3})*(\.\d+)?%?\s*$|^\s*[-+]?\d+(\.\d+)?\s*$/.test(s)) { const n = Number(s.replace(/[,\s$€£₹%]/g, '')); if (isFinite(n)) res = s.trim().endsWith('%') ? n / 100 : n }
    if (o.dates && typeof res === 'string' && !(o.header && ri === 0)) { const m = res.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); if (m) { const [d, mo] = +m[1] > 12 ? [+m[1], +m[2]] : [+m[2], +m[1]]; res = `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` } }
    if (res !== v) changed++
    return res
  }))
  let blankRowsRemoved = 0, blankColsRemoved = 0
  if (o.blankRows) { const n = out.length; out = out.filter((r) => r.some((v) => str(v).trim() !== '')); blankRowsRemoved = n - out.length }
  if (o.blankCols && out.length) {
    const w = Math.max(...out.map((r) => r.length))
    const keep = Array.from({ length: w }, (_, c) => out.some((r, ri) => !(o.header && ri === 0) && str(r[c] ?? null).trim() !== '') || (o.header && str(out[0][c] ?? null).trim() !== '' && out.length === 1))
    blankColsRemoved = keep.filter((k) => !k).length
    out = out.map((r) => r.filter((_, c) => keep[c]))
  }
  if (o.fill) { for (let ri = (o.header ? 1 : 0) + 1; ri < out.length; ri++) out[ri] = out[ri].map((v, c) => (str(v).trim() === '' ? out[ri - 1][c] ?? v : v)) }
  if (o.transpose && out.length) { const w = Math.max(...out.map((r) => r.length)); out = Array.from({ length: w }, (_, c) => out.map((r) => r[c] ?? null)) }
  return { rows: out, changed, blankRowsRemoved, blankColsRemoved }
}

/** Split rows into parts by row count, by approximate byte size, or by a column value. */
export function splitRows(rows: Rows, o: { header: boolean; mode: 'rows' | 'size' | 'value' | 'parts'; n: number; col?: number; csvLine?: (r: Cell[]) => string }) {
  const head = o.header ? rows[0] : null, body = o.header ? rows.slice(1) : rows
  const parts: { name: string; rows: Rows }[] = []
  const withHead = (rs: Rows) => (head ? [head, ...rs] : rs)
  if (o.mode === 'rows' || o.mode === 'parts') {
    const per = o.mode === 'rows' ? Math.max(1, o.n) : Math.max(1, Math.ceil(body.length / Math.max(1, o.n)))
    for (let i = 0; i < body.length; i += per) parts.push({ name: String(parts.length + 1), rows: withHead(body.slice(i, i + per)) })
  } else if (o.mode === 'size') {
    const line = o.csvLine ?? ((r: Cell[]) => r.map(str).join(','))
    const limit = Math.max(1024, o.n), headBytes = head ? line(head).length + 2 : 0
    let cur: Rows = [], size = headBytes
    for (const r of body) { const b = line(r).length + 2; if (cur.length && size + b > limit) { parts.push({ name: String(parts.length + 1), rows: withHead(cur) }); cur = []; size = headBytes } cur.push(r); size += b }
    if (cur.length) parts.push({ name: String(parts.length + 1), rows: withHead(cur) })
  } else {
    const g = new Map<string, Rows>()
    for (const r of body) { const k = str(r[o.col ?? 0] ?? null).trim() || 'blank'; if (!g.has(k)) g.set(k, []); g.get(k)!.push(r) }
    for (const [k, v] of g) parts.push({ name: k, rows: withHead(v) })
  }
  return parts
}

export const csvCell = (v: Cell, d = ',') => { const s = str(v); return s.includes(d) || /["\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
export const toCsvText = (rows: Rows, d = ',', eol = '\r\n') => rows.map((r) => r.map((c) => csvCell(c, d)).join(d)).join(eol) + eol
/** Rows to JSON: array of objects keyed by header, or array of arrays. Numbers stay numbers. */
export function rowsToJson(rows: Rows, o: { header: boolean; shape: 'objects' | 'arrays' | 'columns'; nest?: boolean }) {
  if (o.shape === 'arrays' || !o.header) return rows
  const head = (rows[0] ?? []).map((h, i) => str(h).trim() || `column${i + 1}`)
  const body = rows.slice(1)
  if (o.shape === 'columns') return Object.fromEntries(head.map((h, i) => [h, body.map((r) => r[i] ?? null)]))
  return body.map((r) => {
    const obj: any = {}
    head.forEach((h, i) => {
      const v = r[i] ?? null
      if (o.nest && h.includes('.')) { const ks = h.split('.'); let cur = obj; ks.slice(0, -1).forEach((k) => { cur[k] ??= {}; cur = cur[k] }); cur[ks.at(-1)!] = v } else obj[h] = v
    })
    return obj
  })
}
/** Guess the delimiter of a CSV-like text from its first lines. */
export function sniffDelimiter(text: string) {
  const lines = text.split(/\r?\n/).slice(0, 20).filter(Boolean)
  let best = ',', score = -1
  for (const d of [',', ';', '\t', '|']) {
    const counts = lines.map((l) => l.split(d).length - 1)
    if (!counts[0]) continue
    const same = counts.filter((c) => c === counts[0]).length
    const s = same * 10 + counts[0]
    if (s > score) { score = s; best = d }
  }
  return best
}
/** Turn typed CSV strings into numbers, booleans and blanks where it is safe (keeps leading zeros like 007). */
export function typeCell(s: string): Cell {
  const t = s.trim()
  if (t === '') return null
  if (/^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(t)) return Number(t)
  if (/^(true|false)$/i.test(t)) return t.toLowerCase() === 'true'
  return s
}
