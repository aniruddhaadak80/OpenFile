/* Table model + parsers/serialisers for CSV, TSV, JSON, Markdown, HTML, SQL INSERT and YAML. */
import Papa from 'papaparse'

export interface TableData { headers: string[]; rows: string[][] }
export type InFormat = 'csv' | 'tsv' | 'json' | 'markdown' | 'html' | 'sql'
export type OutFormat = 'csv' | 'tsv' | 'xlsx' | 'json' | 'json-arrays' | 'markdown' | 'html' | 'sql' | 'yaml'

export function detectFormat(text: string): InFormat {
  const t = text.trim()
  if (/^[[{]/.test(t)) return 'json'
  if (/^insert\s+into/i.test(t) || /\binsert\s+into\b[\s\S]*\bvalues\b/i.test(t.slice(0, 2000))) return 'sql'
  if (/<table[\s>]/i.test(t)) return 'html'
  const lines = t.split(/\r?\n/).slice(0, 5)
  if (lines.length >= 2 && lines.every((l) => l.trim().startsWith('|') || l.includes(' | ')) && /^\s*\|?\s*:?-{3,}/.test(lines[1])) return 'markdown'
  const tabs = (lines[0].match(/\t/g) ?? []).length, commas = (lines[0].match(/,/g) ?? []).length, semis = (lines[0].match(/;/g) ?? []).length
  if (tabs > 0 && tabs >= commas) return 'tsv'
  if (semis > commas) return 'csv'
  return 'csv'
}

const str = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))

export function normalize(t: TableData): TableData {
  const width = Math.max(t.headers.length, ...t.rows.map((r) => r.length), 0)
  const headers = Array.from({ length: width }, (_, i) => (t.headers[i] ?? '').toString().trim() || `column_${i + 1}`)
  // de-duplicate header names
  const seen = new Map<string, number>()
  const uniq = headers.map((h) => { const n = seen.get(h) ?? 0; seen.set(h, n + 1); return n ? `${h}_${n + 1}` : h })
  return { headers: uniq, rows: t.rows.map((r) => Array.from({ length: width }, (_, i) => str(r[i]))) }
}

export function fromMatrix(m: unknown[][], hasHeader = true): TableData {
  const rows = m.filter((r) => r.some((c) => str(c).trim() !== ''))
  if (!rows.length) return { headers: [], rows: [] }
  return hasHeader ? normalize({ headers: rows[0].map(str), rows: rows.slice(1).map((r) => r.map(str)) }) : normalize({ headers: [], rows: rows.map((r) => r.map(str)) })
}

export function parseDelimited(text: string, delimiter?: string, hasHeader = true): TableData {
  const res = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { delimiter: delimiter ?? '', skipEmptyLines: 'greedy' })
  return fromMatrix(res.data as unknown[][], hasHeader)
}

export function parseJson(text: string, hasHeader = true): TableData {
  let data = JSON.parse(text)
  if (!Array.isArray(data) && data && typeof data === 'object') {
    const arr = Object.values(data).find(Array.isArray)
    data = arr ?? [data]
  }
  if (!Array.isArray(data)) throw new Error('JSON must be an array of objects or arrays.')
  if (data.every((r) => Array.isArray(r))) return fromMatrix(data as unknown[][], hasHeader)
  const keys: string[] = []
  for (const r of data) if (r && typeof r === 'object') for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k)
  if (!keys.length) return normalize({ headers: ['value'], rows: data.map((v) => [str(v)]) })
  return normalize({ headers: keys, rows: data.map((r) => keys.map((k) => str(r?.[k]))) })
}

export function parseMarkdown(text: string): TableData {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.includes('|'))
  const cells = (l: string) => {
    let s = l.replace(/^\|/, '').replace(/\|$/, '')
    const out: string[] = []; let cur = ''
    for (let i = 0; i < s.length; i++) { if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++ } else if (s[i] === '|') { out.push(cur.trim()); cur = '' } else cur += s[i] }
    out.push(cur.trim())
    return out
  }
  const rows = lines.filter((l) => !/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(l)).map(cells)
  if (!rows.length) throw new Error('No Markdown table found.')
  return normalize({ headers: rows[0], rows: rows.slice(1) })
}

export function parseHtml(text: string, hasHeader = true): TableData {
  const doc = new DOMParser().parseFromString(text, 'text/html')
  const table = doc.querySelector('table')
  if (!table) throw new Error('No <table> found in the HTML.')
  const trs = Array.from(table.querySelectorAll('tr'))
  const m = trs.map((tr) => {
    const out: string[] = []
    for (const c of Array.from(tr.children) as HTMLTableCellElement[]) { out.push((c.textContent ?? '').replace(/\s+/g, ' ').trim()); for (let k = 1; k < (c.colSpan || 1); k++) out.push('') }
    return out
  })
  const headerRow = trs[0]?.querySelector('th') ? true : hasHeader
  return fromMatrix(m, headerRow)
}

/** Tokenise SQL VALUES tuples. */
function sqlTuples(s: string): string[][] {
  const out: string[][] = []
  let i = 0
  while (i < s.length) {
    while (i < s.length && s[i] !== '(') i++
    if (i >= s.length) break
    i++
    const row: string[] = []
    let cur = '', inStr = false, quote = '', depth = 0, wasStr = false
    for (; i < s.length; i++) {
      const ch = s[i]
      if (inStr) {
        if (ch === '\\' && s[i + 1]) { cur += s[i + 1]; i++; continue }
        if (ch === quote) { if (s[i + 1] === quote) { cur += quote; i++; continue } inStr = false; continue }
        cur += ch; continue
      }
      if (ch === "'" || ch === '"') { inStr = true; quote = ch; wasStr = true; continue }
      if (ch === '(') { depth++; cur += ch; continue }
      if (ch === ')' && depth > 0) { depth--; cur += ch; continue }
      if (ch === ',' || ch === ')') {
        const v = cur.trim()
        row.push(!wasStr && /^null$/i.test(v) ? '' : wasStr ? cur : v)
        cur = ''; wasStr = false
        if (ch === ')') { i++; break }
        continue
      }
      if (!wasStr) cur += ch
    }
    out.push(row)
  }
  return out
}

export function parseSql(text: string): TableData & { table?: string } {
  const re = /insert\s+(?:ignore\s+)?into\s+([`"[\]\w.]+)\s*(?:\(([^)]*)\))?\s*values\s*/gi
  let m: RegExpExecArray | null
  let headers: string[] = []
  const rows: string[][] = []
  let table: string | undefined
  const starts: { idx: number; end: number; cols?: string; name: string }[] = []
  while ((m = re.exec(text))) starts.push({ idx: m.index, end: re.lastIndex, cols: m[2], name: m[1] })
  if (!starts.length) throw new Error('No INSERT INTO … VALUES statements found.')
  starts.forEach((st, k) => {
    const body = text.slice(st.end, k + 1 < starts.length ? starts[k + 1].idx : undefined)
    const stmt = body.split(/;\s*(?:\n|$)/)[0]
    if (st.cols && !headers.length) headers = st.cols.split(',').map((c) => c.trim().replace(/^[`"[]|[`"\]]$/g, ''))
    table ??= st.name.replace(/[`"[\]]/g, '')
    rows.push(...sqlTuples(stmt))
  })
  return { ...normalize({ headers, rows }), table }
}

export function parseText(text: string, fmt: InFormat, hasHeader = true): TableData {
  switch (fmt) {
    case 'csv': return parseDelimited(text, undefined, hasHeader)
    case 'tsv': return parseDelimited(text, '\t', hasHeader)
    case 'json': return parseJson(text, hasHeader)
    case 'markdown': return parseMarkdown(text)
    case 'html': return parseHtml(text, hasHeader)
    case 'sql': return parseSql(text)
  }
}

/* ------------------------------- output ------------------------------- */

export function infer(v: string): string | number | boolean | null {
  const t = v.trim()
  if (t === '') return null
  if (/^-?(0|[1-9]\d{0,15})(\.\d+)?([eE][-+]?\d+)?$/.test(t)) return Number(t)
  if (/^(true|false)$/i.test(t)) return t.toLowerCase() === 'true'
  if (/^null$/i.test(t)) return null
  return v
}

export interface OutOpts { tableName?: string; inferTypes?: boolean; pretty?: boolean; createTable?: boolean; delimiter?: string }

const mdEsc = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
const htmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const sqlIdent = (s: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s) ? s : `"${s.replace(/"/g, '""')}"`)

export function toObjects(t: TableData, inferTypes = true) {
  return t.rows.map((r) => Object.fromEntries(t.headers.map((h, i) => [h, inferTypes ? infer(r[i] ?? '') : r[i] ?? ''])))
}

export async function serialize(t: TableData, fmt: Exclude<OutFormat, 'xlsx'>, o: OutOpts = {}): Promise<string> {
  const inferTypes = o.inferTypes ?? true
  switch (fmt) {
    case 'csv': return Papa.unparse([t.headers, ...t.rows], { delimiter: o.delimiter ?? ',' })
    case 'tsv': return [t.headers, ...t.rows].map((r) => r.map((c) => c.replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n')
    case 'json': return JSON.stringify(toObjects(t, inferTypes), null, o.pretty === false ? 0 : 2)
    case 'json-arrays': {
      const all = [t.headers, ...t.rows.map((r) => (inferTypes ? r.map(infer) : r))]
      return o.pretty === false ? JSON.stringify(all) : '[\n' + all.map((r) => '  ' + JSON.stringify(r)).join(',\n') + '\n]'
    }
    case 'markdown': {
      const all = [t.headers, ...t.rows].map((r) => r.map(mdEsc))
      const w = t.headers.map((_, i) => Math.max(3, ...all.map((r) => (r[i] ?? '').length)))
      const numeric = t.headers.map((_, i) => t.rows.length > 0 && t.rows.every((r) => !r[i] || typeof infer(r[i]) === 'number'))
      const line = (r: string[]) => '| ' + r.map((c, i) => (numeric[i] ? c.padStart(w[i]) : c.padEnd(w[i]))).join(' | ') + ' |'
      return [line(all[0]), '| ' + w.map((n, i) => (numeric[i] ? '-'.repeat(n - 1) + ':' : '-'.repeat(n))).join(' | ') + ' |', ...all.slice(1).map(line)].join('\n')
    }
    case 'html': {
      const ind = o.pretty === false ? '' : '  '
      const nl = o.pretty === false ? '' : '\n'
      return `<table>${nl}${ind}<thead>${nl}${ind}${ind}<tr>${t.headers.map((h) => `<th>${htmlEsc(h)}</th>`).join('')}</tr>${nl}${ind}</thead>${nl}${ind}<tbody>${nl}${t.rows.map((r) => `${ind}${ind}<tr>${r.map((c) => `<td>${htmlEsc(c)}</td>`).join('')}</tr>`).join(nl)}${nl}${ind}</tbody>${nl}</table>`
    }
    case 'sql': {
      const name = sqlIdent(o.tableName?.trim() || 'my_table')
      const cols = t.headers.map(sqlIdent).join(', ')
      const val = (v: string) => { if (!inferTypes) return `'${v.replace(/'/g, "''")}'`; const x = infer(v); return x === null ? 'NULL' : typeof x === 'number' ? String(x) : typeof x === 'boolean' ? (x ? 'TRUE' : 'FALSE') : `'${v.replace(/'/g, "''")}'` }
      let out = ''
      if (o.createTable) {
        const types = t.headers.map((_, i) => { const vals = t.rows.map((r) => infer(r[i] ?? '')).filter((v) => v !== null); if (vals.length && vals.every((v) => typeof v === 'number' && Number.isInteger(v))) return 'INTEGER'; if (vals.length && vals.every((v) => typeof v === 'number')) return 'REAL'; if (vals.length && vals.every((v) => typeof v === 'boolean')) return 'BOOLEAN'; return 'TEXT' })
        out += `CREATE TABLE ${name} (\n${t.headers.map((h, i) => `  ${sqlIdent(h)} ${types[i]}`).join(',\n')}\n);\n\n`
      }
      if (!t.rows.length) return out
      // batch 500 rows per statement
      for (let i = 0; i < t.rows.length; i += 500) out += `INSERT INTO ${name} (${cols}) VALUES\n${t.rows.slice(i, i + 500).map((r) => `  (${r.map(val).join(', ')})`).join(',\n')};\n`
      return out.trimEnd()
    }
    case 'yaml': {
      const yaml = await import('js-yaml')
      const dump = (yaml as any).dump ?? (yaml as any).default?.dump
      return dump(toObjects(t, inferTypes), { lineWidth: -1, noRefs: true })
    }
  }
}

export const OUT_EXT: Record<OutFormat, string> = { csv: 'csv', tsv: 'tsv', xlsx: 'xlsx', json: 'json', 'json-arrays': 'json', markdown: 'md', html: 'html', sql: 'sql', yaml: 'yaml' }
export const OUT_MIME: Record<OutFormat, string> = { csv: 'text/csv', tsv: 'text/tab-separated-values', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', json: 'application/json', 'json-arrays': 'application/json', markdown: 'text/markdown', html: 'text/html', sql: 'application/sql', yaml: 'application/yaml' }
