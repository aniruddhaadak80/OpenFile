/* Load CSV, TSV, XLSX, ODS, JSON and JSONL files as simple tables. */
import { readBook } from '@/lib/bcat/sheets'
import { recordsToTable, uniqueHeaders } from './data'

export interface Table { name: string; header: string[]; rows: unknown[][] }
export const TABLE_ACCEPT = '.csv,.tsv,.txt,.xlsx,.xlsm,.xls,.ods,.json,.jsonl,.ndjson'

export async function loadTables(f: File): Promise<Table[]> {
  const n = f.name.toLowerCase()
  const base = f.name.replace(/\.[^.]+$/, '')
  if (/\.(jsonl|ndjson)$/.test(n)) { const recs = (await f.text()).split(/\r?\n/).filter((l) => l.trim()).map((l, i) => { try { return JSON.parse(l) } catch { throw new Error(`Line ${i + 1} is not valid JSON.`) } }); const t = recordsToTable(recs); return [{ name: base, header: uniqueHeaders(t.header), rows: t.rows }] }
  if (n.endsWith('.json')) {
    let v: any
    try { v = JSON.parse(await f.text()) } catch (e: any) { throw new Error('This JSON file is not valid: ' + (e?.message ?? '')) }
    const arr = Array.isArray(v) ? v : Object.values(v).find(Array.isArray) ?? [v]
    const t = recordsToTable(arr.map((x: any) => (x && typeof x === 'object' ? x : { value: x })))
    return [{ name: base, header: uniqueHeaders(t.header), rows: t.rows }]
  }
  const book = await readBook(f)
  return book.sheets.filter((s) => s.rows.length).map((s) => ({ name: book.sheets.length > 1 ? `${base} ${s.name}` : base, header: uniqueHeaders((s.rows[0] ?? []).map((x) => String(x ?? ''))), rows: s.rows.slice(1) }))
}
