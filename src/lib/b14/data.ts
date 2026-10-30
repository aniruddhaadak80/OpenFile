/* Data helpers for round 14: column profiling, JSON flatten and unflatten, SQL table loading, HL7 / X12 / EDIFACT parsing.
 * Pure TypeScript, unit tested in Node. */

/* ---------------- profiling ---------------- */
export type ColType = 'empty' | 'integer' | 'number' | 'boolean' | 'date' | 'text'
export interface ColProfile { name: string; type: ColType; count: number; nulls: number; distinct: number; unique: boolean; min?: number | string; max?: number | string; mean?: number; median?: number; std?: number; q1?: number; q3?: number; outliers?: number; minLen: number; maxLen: number; top: { value: string; count: number }[]; hist?: number[]; sample: string[] }

const isNull = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && /^\s*(|null|na|n\/a|nan|none|-)\s*$/i.test(v))
const NUM = /^\s*[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?(?:[eE][-+]?\d+)?\s*$/
const toNum = (s: string) => Number(s.replace(/,/g, ''))
const DATE = /^\s*(\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})\s*$/

export function profileColumn(name: string, raw: unknown[]): ColProfile {
  const vals = raw.filter((v) => !isNull(v)).map((v) => (typeof v === 'string' ? v : v instanceof Date ? v.toISOString() : String(v)))
  const nulls = raw.length - vals.length
  const freq = new Map<string, number>()
  for (const v of vals) freq.set(v, (freq.get(v) ?? 0) + 1)
  const lens = vals.map((v) => v.length)
  const base = { name, count: raw.length, nulls, distinct: freq.size, unique: freq.size === vals.length && vals.length > 0, minLen: lens.length ? Math.min(...lens) : 0, maxLen: lens.length ? Math.max(...lens) : 0, top: [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([value, count]) => ({ value, count })), sample: vals.slice(0, 5) }
  if (!vals.length) return { ...base, type: 'empty' }
  const numeric = vals.filter((v) => v.trim() && NUM.test(v)).length
  if (numeric / vals.length >= 0.95) {
    const ns = vals.filter((v) => NUM.test(v)).map(toNum).filter(Number.isFinite).sort((a, b) => a - b)
    const q = (p: number) => { const k = (ns.length - 1) * p, lo = Math.floor(k), hi = Math.ceil(k); return ns[lo] + (ns[hi] - ns[lo]) * (k - lo) }
    const mean = ns.reduce((a, b) => a + b, 0) / ns.length
    const std = Math.sqrt(ns.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, ns.length - 1))
    const q1 = q(0.25), q3 = q(0.75), iqr = q3 - q1
    const outliers = ns.filter((x) => x < q1 - 1.5 * iqr || x > q3 + 1.5 * iqr).length
    const bins = 12, lo = ns[0], hi = ns[ns.length - 1], hist = new Array(bins).fill(0)
    for (const x of ns) hist[hi === lo ? 0 : Math.min(bins - 1, Math.floor(((x - lo) / (hi - lo)) * bins))]++
    return { ...base, type: ns.every(Number.isInteger) ? 'integer' : 'number', min: lo, max: hi, mean, median: q(0.5), std, q1, q3, outliers, hist }
  }
  if (vals.every((v) => /^(true|false|yes|no|y|n|0|1)$/i.test(v.trim())) && freq.size <= 4) return { ...base, type: 'boolean' }
  if (vals.filter((v) => DATE.test(v)).length / vals.length >= 0.95) { const s = [...vals].sort(); return { ...base, type: 'date', min: s[0], max: s[s.length - 1] } }
  return { ...base, type: 'text' }
}
export function profile(header: string[], rows: unknown[][]): ColProfile[] { return header.map((h, i) => profileColumn(h || `column ${i + 1}`, rows.map((r) => r[i]))) }
/** Pearson correlation between numeric columns (pairs with |r| >= min). */
export function correlations(cols: ColProfile[], header: string[], rows: unknown[][], min = 0.5) {
  const num = cols.map((c, i) => ({ c, i })).filter((x) => x.c.type === 'integer' || x.c.type === 'number')
  const out: { a: string; b: string; r: number }[] = []
  for (let x = 0; x < num.length; x++) for (let y = x + 1; y < num.length; y++) {
    const pairs = rows.map((r) => [r[num[x].i], r[num[y].i]]).filter(([a, b]) => !isNull(a) && !isNull(b)).map(([a, b]) => [toNum(String(a)), toNum(String(b))]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
    if (pairs.length < 3) continue
    const ma = pairs.reduce((s, p) => s + p[0], 0) / pairs.length, mb = pairs.reduce((s, p) => s + p[1], 0) / pairs.length
    let n = 0, da = 0, db = 0; for (const [a, b] of pairs) { n += (a - ma) * (b - mb); da += (a - ma) ** 2; db += (b - mb) ** 2 }
    const r = n / Math.sqrt(da * db || 1)
    if (Math.abs(r) >= min) out.push({ a: header[num[x].i], b: header[num[y].i], r })
  }
  return out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
}

/* ---------------- JSON flatten ---------------- */
export function flatten(v: unknown, o: { sep?: string; arrays?: 'index' | 'join' | 'json'; joinWith?: string } = {}, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  const sep = o.sep ?? '.'
  if (Array.isArray(v)) {
    if (o.arrays === 'join' && v.every((x) => x === null || typeof x !== 'object')) { out[prefix] = v.join(o.joinWith ?? '; '); return out }
    if (o.arrays === 'json') { out[prefix] = JSON.stringify(v); return out }
    if (!v.length) { out[prefix] = '[]'; return out }
    v.forEach((x, i) => flatten(x, o, prefix ? `${prefix}${sep}${i}` : String(i), out))
    return out
  }
  if (v && typeof v === 'object') {
    const keys = Object.keys(v as object)
    if (!keys.length && prefix) { out[prefix] = '{}'; return out }
    for (const k of keys) flatten((v as Record<string, unknown>)[k], o, prefix ? `${prefix}${sep}${k}` : k, out)
    return out
  }
  out[prefix] = v
  return out
}
export function unflatten(obj: Record<string, unknown>, sep = '.'): unknown {
  const root: any = {}
  for (const [k, v] of Object.entries(obj)) {
    const parts = k.split(sep)
    let cur = root
    parts.forEach((p, i) => {
      const last = i === parts.length - 1
      const nextIsIndex = !last && /^\d+$/.test(parts[i + 1])
      if (last) cur[p] = v === '[]' ? [] : v === '{}' ? {} : v
      else { if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = nextIsIndex ? [] : {}; cur = cur[p] }
    })
  }
  const fix = (x: any): any => (Array.isArray(x) ? x.map(fix) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, fix(v)])) : x)
  // root with only numeric keys becomes an array
  const r = fix(root)
  return Object.keys(r).length && Object.keys(r).every((k) => /^\d+$/.test(k)) ? Object.keys(r).sort((a, b) => +a - +b).map((k) => r[k]) : r
}
/** Records to a table with every flattened key as a column (keys in first seen order). */
export function recordsToTable(records: unknown[], o: Parameters<typeof flatten>[1] = {}): { header: string[]; rows: unknown[][] } {
  const flat = records.map((r) => flatten(r, o))
  const header: string[] = []; const seen = new Set<string>()
  for (const f of flat) for (const k of Object.keys(f)) if (!seen.has(k)) { seen.add(k); header.push(k) }
  return { header, rows: flat.map((f) => header.map((h) => f[h] ?? '')) }
}
/** Typed value from a CSV cell for unflattening. */
export function typed(s: string): unknown { if (s === '') return ''; if (/^(true|false)$/.test(s)) return s === 'true'; if (s === 'null') return null; if (/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(s) && !/^-?0\d/.test(s)) return Number(s); return s }

/* ---------------- SQL ---------------- */
export const sqlIdent = (s: string) => '"' + String(s).replace(/"/g, '""') + '"'
export function tableName(file: string, taken: Set<string>) {
  let n = file.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'data'
  if (/^\d/.test(n)) n = 't_' + n
  let k = n, i = 2; while (taken.has(k)) k = `${n}_${i++}`
  taken.add(k); return k
}
export function columnTypes(header: string[], rows: unknown[][]): ('INTEGER' | 'REAL' | 'TEXT')[] {
  return header.map((_, i) => { let int = true, num = true, any = false; for (const r of rows.slice(0, 2000)) { const v = r[i]; if (isNull(v)) continue; any = true; const s = String(v).trim(); if (!/^-?\d+$/.test(s) || s.length > 15) int = false; if (!/^-?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) { num = false; break } } return !any ? 'TEXT' : int ? 'INTEGER' : num ? 'REAL' : 'TEXT' })
}
export function uniqueHeaders(h: string[]) { const seen = new Map<string, number>(); return h.map((x, i) => { const b = String(x ?? '').trim() || `col${i + 1}`; const n = seen.get(b.toLowerCase()) ?? 0; seen.set(b.toLowerCase(), n + 1); return n ? `${b}_${n + 1}` : b }) }

/* ---------------- EDI / HL7 ---------------- */
export interface EdiSegment { id: string; name?: string; elements: string[][][] } // element -> repeats -> components
export interface EdiDoc { kind: 'HL7' | 'X12' | 'EDIFACT'; segments: EdiSegment[]; seps: { segment: string; element: string; component: string; repeat: string } ; summary: Record<string, string> }

const HL7_NAMES: Record<string, string> = { MSH: 'Message header', EVN: 'Event', PID: 'Patient identification', PV1: 'Patient visit', PV2: 'Patient visit extra', OBR: 'Observation request', OBX: 'Observation result', ORC: 'Common order', NK1: 'Next of kin', AL1: 'Allergy', DG1: 'Diagnosis', IN1: 'Insurance', GT1: 'Guarantor', NTE: 'Notes', MSA: 'Message acknowledgement', ERR: 'Error', SCH: 'Schedule', RXA: 'Pharmacy administration', RXE: 'Pharmacy encoded order', TXA: 'Document notification' }
const X12_NAMES: Record<string, string> = { ISA: 'Interchange header', GS: 'Group header', ST: 'Transaction set header', SE: 'Transaction set trailer', GE: 'Group trailer', IEA: 'Interchange trailer', BEG: 'Purchase order start', BIG: 'Invoice start', N1: 'Party name', N3: 'Address', N4: 'City, state, zip', REF: 'Reference', DTM: 'Date and time', PO1: 'Line item', IT1: 'Invoice line', TDS: 'Total amount', CTT: 'Transaction totals', NM1: 'Individual or organisation name', CLM: 'Claim', HL: 'Hierarchy level', SV1: 'Professional service', BHT: 'Hierarchy start', PER: 'Contact', BSN: 'Ship notice', TD5: 'Carrier', SAC: 'Charges', PID: 'Product description' }
const EDIFACT_NAMES: Record<string, string> = { UNA: 'Service string advice', UNB: 'Interchange header', UNH: 'Message header', BGM: 'Beginning of message', DTM: 'Date and time', NAD: 'Name and address', LIN: 'Line item', QTY: 'Quantity', PRI: 'Price', MOA: 'Monetary amount', RFF: 'Reference', UNS: 'Section control', CNT: 'Control total', UNT: 'Message trailer', UNZ: 'Interchange trailer', IMD: 'Item description', PIA: 'Product id', TAX: 'Tax', CUX: 'Currencies', FTX: 'Free text', LOC: 'Place', TDT: 'Transport', ALC: 'Allowance or charge' }

export function parseEdi(text: string): EdiDoc {
  const t = text.replace(/^\uFEFF/, '')
  const s = t.trimStart()
  if (s.startsWith('MSH') || /(^|\r|\n)MSH\|/.test(s)) {
    const head = s.slice(s.indexOf('MSH'))
    const el = head[3], comp = head[4], rep = head[5], esc = head[6], sub = head[7]
    void esc; void sub
    const segs = head.split(/\r\n|\r|\n/).filter((l) => l.trim())
    const segments = segs.map((l) => {
      const f = l.split(el)
      const id = f[0]
      const fields = id === 'MSH' ? [el, head.slice(4, 8), ...f.slice(2)] : f.slice(1)
      return { id, name: HL7_NAMES[id], elements: fields.map((x, i) => (id === 'MSH' && i < 2 ? [[x]] : x.split(rep).map((r) => r.split(comp)))) }
    })
    const msh = segments[0]
    const pid = segments.find((x) => x.id === 'PID')
    const v = (sg: EdiSegment | undefined, i: number, c = 0) => sg?.elements[i - 1]?.[0]?.[c] ?? ''
    return { kind: 'HL7', segments, seps: { segment: '\\r', element: el, component: comp, repeat: rep }, summary: { 'Message type': [v(msh, 9), v(msh, 9, 1)].filter(Boolean).join('^'), 'Sending app': v(msh, 3), 'Sending facility': v(msh, 4), 'Time': v(msh, 7), 'Control id': v(msh, 10), 'Version': v(msh, 12), ...(pid ? { 'Patient': [v(pid, 5, 1), v(pid, 5)].filter(Boolean).join(' ') } : {}) } }
  }
  if (s.startsWith('ISA')) {
    const el = s[3]
    // ISA is fixed width: 106 chars, component separator at 104, segment terminator at 105
    const comp = s[104], term = s[105], rep = s[82]
    const segs = s.split(term).map((x) => x.replace(/^[\r\n]+/, '')).filter((x) => x.trim())
    const segments = segs.map((l) => { const f = l.split(el); return { id: f[0], name: X12_NAMES[f[0]], elements: f.slice(1).map((x) => (f[0] === 'ISA' ? [[x]] : x.split(rep && /[^\w\s]/.test(rep) ? rep : '\u0000').map((r) => r.split(comp)))) } })
    const g = (id: string, i: number) => segments.find((x) => x.id === id)?.elements[i - 1]?.[0]?.[0]?.trim() ?? ''
    return { kind: 'X12', segments, seps: { segment: term, element: el, component: comp, repeat: rep }, summary: { 'Transaction set': g('ST', 1), 'Sender': g('ISA', 6), 'Receiver': g('ISA', 8), 'Date': g('ISA', 9), 'Control number': g('ISA', 13), 'Version': g('GS', 8) } }
  }
  if (s.startsWith('UNA') || s.startsWith('UNB')) {
    let comp = ':', el = '+', dec = '.', rel = '?', term = "'"
    let body = s
    if (s.startsWith('UNA')) { comp = s[3]; el = s[4]; dec = s[5]; rel = s[6]; term = s[8]; body = s.slice(9) }
    void dec
    // split on unescaped separators, keeping release characters until the last level
    const split = (str: string, ch: string) => { const out: string[] = []; let cur = ''; for (let i = 0; i < str.length; i++) { if (str[i] === rel && i + 1 < str.length) { cur += str[i] + str[++i]; continue } if (str[i] === ch) { out.push(cur); cur = '' } else cur += str[i] } out.push(cur); return out }
    const unrel = (x: string) => { let o = ''; for (let i = 0; i < x.length; i++) { if (x[i] === rel && i + 1 < x.length) i++; o += x[i] } return o }
    const segs = split(body, term).map((x) => x.replace(/^[\r\n\s]+/, '')).filter(Boolean)
    const segments = segs.map((l) => { const f = split(l, el); return { id: f[0], name: EDIFACT_NAMES[f[0]], elements: f.slice(1).map((x) => [split(x, comp).map(unrel)]) } })
    const g = (id: string, i: number, c = 0) => segments.find((x) => x.id === id)?.elements[i - 1]?.[0]?.[c] ?? ''
    return { kind: 'EDIFACT', segments, seps: { segment: term, element: el, component: comp, repeat: '' }, summary: { 'Message': [g('UNH', 2), g('UNH', 2, 1), g('UNH', 2, 2)].filter(Boolean).join(':'), 'Sender': g('UNB', 2), 'Receiver': g('UNB', 3), 'Date': g('UNB', 4), 'Reference': g('UNB', 5), 'Document': g('BGM', 2) } }
  }
  throw new Error('This does not look like HL7 (starts with MSH), X12 (starts with ISA) or EDIFACT (starts with UNA or UNB).')
}
export function ediToJson(d: EdiDoc) {
  return { kind: d.kind, summary: d.summary, segments: d.segments.map((s) => ({ id: s.id, name: s.name, fields: Object.fromEntries(s.elements.map((e, i) => [`${s.id}${String(i + 1).padStart(2, '0')}`, e.length === 1 ? (e[0].length === 1 ? e[0][0] : e[0]) : e])) })) }
}
