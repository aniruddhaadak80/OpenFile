/* Workbook loading and saving with SheetJS (loaded on demand). */
export type Grid = (string | number | boolean | null)[][]
export interface Book { name: string; sheets: { name: string; rows: Grid }[] }
export const SHEET_ACCEPT = '.xlsx,.xlsm,.xls,.ods,.csv,.tsv,.numbers'
export const xlsx = () => import('xlsx')

export async function readBook(f: File): Promise<Book> {
  const X = await xlsx()
  const n = f.name.toLowerCase()
  const wb = n.endsWith('.csv') || n.endsWith('.tsv') ? X.read(await f.text(), { type: 'string', FS: n.endsWith('.tsv') ? '\t' : undefined, raw: false }) : X.read(new Uint8Array(await f.arrayBuffer()), { type: 'array', cellDates: true })
  return { name: f.name.replace(/\.[^.]+$/, ''), sheets: wb.SheetNames.map((s) => ({ name: s, rows: (X.utils.sheet_to_json(wb.Sheets[s], { header: 1, defval: null, raw: true, blankrows: false }) as Grid).map((r) => r.map((v: any) => (v instanceof Date ? v.toISOString().slice(0, v.getUTCHours() || v.getUTCMinutes() ? 19 : 10).replace('T', ' ') : v))) })) }
}
const safeSheet = (n: string, used: Set<string>) => { let b = n.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet', k = b, i = 2; while (used.has(k.toLowerCase())) k = `${b.slice(0, 28)} ${i++}`; used.add(k.toLowerCase()); return k }
export async function writeBook(sheets: { name: string; rows: Grid }[], type: 'xlsx' | 'ods' | 'csv' = 'xlsx'): Promise<Blob> {
  const X = await xlsx()
  if (type === 'csv') return new Blob(['\ufeff' + X.utils.sheet_to_csv(X.utils.aoa_to_sheet(sheets[0].rows))], { type: 'text/csv' })
  const wb = X.utils.book_new(), used = new Set<string>()
  for (const s of sheets) {
    const ws = X.utils.aoa_to_sheet(s.rows)
    const head = s.rows[0] ?? []
    ws['!cols'] = head.map((_, c) => ({ wch: Math.min(60, Math.max(8, ...s.rows.slice(0, 200).map((r) => String(r[c] ?? '').length + 2))) }))
    if (s.rows.length > 1) ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: s.rows.length - 1, c: Math.max(0, head.length - 1) } }) }
    X.utils.book_append_sheet(wb, ws, safeSheet(s.name, used))
  }
  const out = X.write(wb, { bookType: type, type: 'array', compression: true })
  return new Blob([out], { type: type === 'ods' ? 'application/vnd.oasis.opendocument.spreadsheet' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
/** Stack sheets into one, matching columns by header name. */
export function stack(parts: { label: string; rows: Grid }[], addSource: boolean): Grid {
  const head: string[] = []
  for (const p of parts) for (const h of p.rows[0] ?? []) { const k = String(h ?? ''); if (!head.includes(k)) head.push(k) }
  const out: Grid = [[...(addSource ? ['Source'] : []), ...head]]
  for (const p of parts) {
    const ph = (p.rows[0] ?? []).map((h) => String(h ?? ''))
    for (const r of p.rows.slice(1)) out.push([...(addSource ? [p.label] : []), ...head.map((h) => { const i = ph.indexOf(h); return i >= 0 ? r[i] ?? null : null })])
  }
  return out
}
