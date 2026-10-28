/* Pure table helpers for the CSV editor (string grid). */
export type Grid = { headers: string[]; rows: string[][] }

export function dedupe(g: Grid, cols?: number[]): { grid: Grid; removed: number } {
  const seen = new Set<string>(); const rows: string[][] = []
  for (const r of g.rows) { const k = JSON.stringify(cols?.length ? cols.map((c) => r[c] ?? '') : r); if (!seen.has(k)) { seen.add(k); rows.push(r) } }
  return { grid: { headers: g.headers, rows }, removed: g.rows.length - rows.length }
}

const numRe = /^\s*-?(\d+([.,]\d+)?|\.\d+)(e[+-]?\d+)?\s*$/i
export function sortRows(rows: string[][], col: number, dir: 1 | -1): string[][] {
  const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
  return [...rows].sort((a, b) => {
    const x = a[col] ?? '', y = b[col] ?? ''
    if (x === '' && y !== '') return 1
    if (y === '' && x !== '') return -1
    if (numRe.test(x) && numRe.test(y)) return (parseFloat(x.replace(',', '.')) - parseFloat(y.replace(',', '.'))) * dir
    return coll.compare(x, y) * dir
  })
}

export function filterRows(rows: string[][], q: string, col: number | null): number[] {
  const idx: number[] = []
  if (!q) return rows.map((_, i) => i)
  const ql = q.toLowerCase()
  rows.forEach((r, i) => { if ((col == null ? r : [r[col] ?? '']).some((c) => (c ?? '').toLowerCase().includes(ql))) idx.push(i) })
  return idx
}

export function findReplace(g: Grid, find: string, repl: string, opts: { regex: boolean; matchCase: boolean; col: number | null }): { grid: Grid; count: number } {
  if (!find) return { grid: g, count: 0 }
  let count = 0
  const re = opts.regex ? new RegExp(find, opts.matchCase ? 'g' : 'gi') : new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), opts.matchCase ? 'g' : 'gi')
  const rows = g.rows.map((r) => r.map((c, j) => {
    if (opts.col != null && j !== opts.col) return c
    const s = c ?? ''
    const hits = s.match(re)?.length ?? 0
    if (!hits) return c
    count += hits
    return s.replace(re, repl)
  }))
  return { grid: { headers: g.headers, rows }, count }
}

export function splitRows(g: Grid, size: number): Grid[] {
  const out: Grid[] = []
  for (let i = 0; i < g.rows.length; i += Math.max(1, size)) out.push({ headers: g.headers, rows: g.rows.slice(i, i + size) })
  return out
}

export function splitByColumn(g: Grid, col: number): Map<string, Grid> {
  const m = new Map<string, Grid>()
  for (const r of g.rows) { const k = r[col] || '(empty)'; if (!m.has(k)) m.set(k, { headers: g.headers, rows: [] }); m.get(k)!.rows.push(r) }
  return m
}

/** Append grids, matching columns by header name. */
export function mergeGrids(grids: Grid[]): Grid {
  const headers: string[] = []
  for (const g of grids) for (const h of g.headers) if (!headers.includes(h)) headers.push(h)
  const rows: string[][] = []
  for (const g of grids) { const map = headers.map((h) => g.headers.indexOf(h)); for (const r of g.rows) rows.push(map.map((j) => (j < 0 ? '' : r[j] ?? ''))) }
  return { headers, rows }
}

export function fromMatrix(m: unknown[][], header = true): Grid {
  const width = Math.max(0, ...m.map((r) => r.length))
  const norm = m.map((r) => Array.from({ length: width }, (_, i) => (r[i] == null ? '' : String(r[i]))))
  if (!header || !norm.length) return { headers: Array.from({ length: width }, (_, i) => colName(i)), rows: norm }
  const hs = norm[0].map((h, i) => h.trim() || colName(i))
  return { headers: hs, rows: norm.slice(1) }
}

export function colName(i: number) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26) } return s }

export function columnStats(rows: string[][], col: number) {
  const vals = rows.map((r) => r[col] ?? '')
  const filled = vals.filter((v) => v !== '')
  const nums = filled.filter((v) => numRe.test(v)).map((v) => parseFloat(v.replace(',', '.')))
  const uniq = new Set(filled).size
  const sum = nums.reduce((a, b) => a + b, 0)
  return { count: vals.length, filled: filled.length, empty: vals.length - filled.length, unique: uniq, numeric: nums.length, sum, min: nums.length ? Math.min(...nums) : null, max: nums.length ? Math.max(...nums) : null, mean: nums.length ? sum / nums.length : null }
}
