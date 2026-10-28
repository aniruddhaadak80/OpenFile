/* Office and spreadsheet helpers: sheet diff, pivot tables, ICS and vCard parsing, DOCX XML clean-up and
 * find and replace across split runs. Pure string functions, unit tested. */

export type Cell = string | number | boolean | null
const s = (v: unknown) => (v == null ? '' : String(v))

/* ---------- sheet compare ---------- */
export interface CellDiff { row: number; col: number; a: string; b: string }
export interface SheetDiff { changed: CellDiff[]; addedRows: number[]; removedRows: number[]; rowsA: number; rowsB: number; keyed: boolean }
/** Compare two sheets cell by cell, or by a key column when given (row order then does not matter). */
export function diffSheets(a: Cell[][], b: Cell[][], keyCol = -1): SheetDiff {
  const changed: CellDiff[] = [], addedRows: number[] = [], removedRows: number[] = []
  if (keyCol >= 0) {
    const ia = new Map<string, number>(), ib = new Map<string, number>()
    a.forEach((r, i) => { if (i) ia.set(s(r[keyCol]), i) }); b.forEach((r, i) => { if (i) ib.set(s(r[keyCol]), i) })
    for (const [k, i] of ib) { const j = ia.get(k); if (j == null) { addedRows.push(i); continue } const w = Math.max(a[j].length, b[i].length); for (let c = 0; c < w; c++) if (s(a[j][c]) !== s(b[i][c])) changed.push({ row: i, col: c, a: s(a[j][c]), b: s(b[i][c]) }) }
    for (const [k, j] of ia) if (!ib.has(k)) removedRows.push(j)
    return { changed, addedRows, removedRows, rowsA: a.length, rowsB: b.length, keyed: true }
  }
  const h = Math.max(a.length, b.length)
  for (let r = 0; r < h; r++) {
    if (r >= a.length) { addedRows.push(r); continue }
    if (r >= b.length) { removedRows.push(r); continue }
    const w = Math.max(a[r].length, b[r].length)
    for (let c = 0; c < w; c++) if (s(a[r][c]) !== s(b[r][c])) changed.push({ row: r, col: c, a: s(a[r][c]), b: s(b[r][c]) })
  }
  return { changed, addedRows, removedRows, rowsA: a.length, rowsB: b.length, keyed: false }
}
export const colName = (c: number) => { let n = c + 1, out = ''; while (n) { const m = (n - 1) % 26; out = String.fromCharCode(65 + m) + out; n = Math.floor((n - 1) / 26) } return out }

/* ---------- pivot ---------- */
export type Agg = 'sum' | 'count' | 'avg' | 'min' | 'max' | 'distinct'
export function toNum(v: unknown) { if (typeof v === 'number') return v; const t = s(v).replace(/[,\s$€£₹%]/g, ''); const n = parseFloat(t); return isFinite(n) && /^-?[\d.]+(e-?\d+)?$/i.test(t) ? n : NaN }
export function pivot(rows: Record<string, unknown>[], rowF: string, colF: string | null, valF: string | null, agg: Agg) {
  const rk: string[] = [], ck: string[] = [], cells = new Map<string, unknown[]>()
  for (const r of rows) {
    const a = s(r[rowF]) || '(blank)', b = colF ? s(r[colF]) || '(blank)' : 'Value'
    if (!rk.includes(a)) rk.push(a); if (!ck.includes(b)) ck.push(b)
    const k = a + '\u0000' + b; if (!cells.has(k)) cells.set(k, []); cells.get(k)!.push(valF ? r[valF] : 1)
  }
  const reduce = (vals: unknown[]) => {
    if (agg === 'count') return vals.length
    if (agg === 'distinct') return new Set(vals.map(s)).size
    const n = vals.map(toNum).filter((x) => !isNaN(x)); if (!n.length) return null
    return agg === 'sum' ? n.reduce((x, y) => x + y, 0) : agg === 'avg' ? n.reduce((x, y) => x + y, 0) / n.length : agg === 'min' ? Math.min(...n) : Math.max(...n)
  }
  const sortKeys = (k: string[]) => k.sort((x, y) => { const a = toNum(x), b = toNum(y); return !isNaN(a) && !isNaN(b) ? a - b : x.localeCompare(y) })
  sortKeys(rk); sortKeys(ck)
  const table = rk.map((a) => ck.map((b) => { const v = cells.get(a + '\u0000' + b); return v ? reduce(v) : null }))
  const rowTotals = rk.map((a) => reduce(ck.flatMap((b) => cells.get(a + '\u0000' + b) ?? [])))
  const colTotals = ck.map((b) => reduce(rk.flatMap((a) => cells.get(a + '\u0000' + b) ?? [])))
  const grand = reduce([...cells.values()].flat())
  return { rowKeys: rk, colKeys: ck, table, rowTotals, colTotals, grand }
}

/* ---------- ICS ---------- */
export interface IcsEvent { uid?: string; summary: string; start?: Date; end?: Date; allDay: boolean; location?: string; description?: string; organizer?: string; rrule?: string; status?: string; attendees: string[]; tz?: string }
const unesc = (v: string) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')
export function icsDate(v: string, params: string): { d?: Date; allDay: boolean; tz?: string } {
  const tz = params.match(/TZID=([^;:]+)/)?.[1]
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/)
  if (!m) return { allDay: false }
  if (!m[4]) return { d: new Date(+m[1], +m[2] - 1, +m[3]), allDay: true }
  const parts = [+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)] as const
  return { d: m[7] ? new Date(Date.UTC(...parts)) : new Date(...parts), allDay: false, tz: m[7] ? 'UTC' : tz }
}
export function parseIcs(text: string): { name?: string; events: IcsEvent[] } {
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/)
  const events: IcsEvent[] = []; let cur: IcsEvent | null = null, name: string | undefined, depth = 0
  for (const line of lines) {
    const i = line.indexOf(':'); if (i < 0) continue
    const head = line.slice(0, i), val = line.slice(i + 1), [key, ...pp] = head.split(';'), params = pp.join(';'), K = key.toUpperCase()
    if (K === 'BEGIN' && val.toUpperCase() === 'VEVENT') { cur = { summary: '', allDay: false, attendees: [] }; continue }
    if (K === 'BEGIN' && cur) { depth++; continue }
    if (K === 'END' && cur && depth) { depth--; continue }
    if (K === 'END' && val.toUpperCase() === 'VEVENT') { if (cur) events.push(cur); cur = null; continue }
    if (!cur) { if (K === 'X-WR-CALNAME') name = unesc(val); continue }
    if (depth) continue
    if (K === 'SUMMARY') cur.summary = unesc(val)
    else if (K === 'UID') cur.uid = val
    else if (K === 'LOCATION') cur.location = unesc(val)
    else if (K === 'DESCRIPTION') cur.description = unesc(val)
    else if (K === 'STATUS') cur.status = val
    else if (K === 'RRULE') cur.rrule = val
    else if (K === 'ORGANIZER') cur.organizer = (params.match(/CN="?([^";:]+)/)?.[1] ?? '') || val.replace(/^mailto:/i, '')
    else if (K === 'ATTENDEE') cur.attendees.push((params.match(/CN="?([^";:]+)/)?.[1] ?? '') || val.replace(/^mailto:/i, ''))
    else if (K === 'DTSTART') { const r = icsDate(val, params); cur.start = r.d; cur.allDay = r.allDay; cur.tz = r.tz }
    else if (K === 'DTEND') cur.end = icsDate(val, params).d
  }
  return { name, events: events.sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0)) }
}
export function describeRrule(r?: string) {
  if (!r) return ''
  const p = Object.fromEntries(r.split(';').map((x) => x.split('=')))
  const f: Record<string, string> = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }
  const n = +(p.INTERVAL ?? 1)
  let t = `Every ${n > 1 ? n + ' ' : ''}${f[p.FREQ] ?? p.FREQ?.toLowerCase()}${n > 1 ? 's' : ''}`
  if (p.BYDAY) t += ` on ${p.BYDAY.split(',').join(', ')}`
  if (p.COUNT) t += `, ${p.COUNT} times`
  if (p.UNTIL) t += `, until ${p.UNTIL.slice(0, 4)}-${p.UNTIL.slice(4, 6)}-${p.UNTIL.slice(6, 8)}`
  return t
}

/* ---------- vCard ---------- */
export interface Contact { name: string; first?: string; last?: string; org?: string; title?: string; emails: string[]; phones: string[]; address?: string; url?: string; birthday?: string; note?: string }
export function parseVcf(text: string): Contact[] {
  const out: Contact[] = []
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/)
  let c: Contact | null = null
  for (const line of lines) {
    const i = line.indexOf(':'); if (i < 0) continue
    const [rawKey, ...pp] = line.slice(0, i).split(';'), key = rawKey.replace(/^item\d+\./i, '').toUpperCase(), val = unesc(line.slice(i + 1)), params = pp.join(';')
    if (key === 'BEGIN' && /VCARD/i.test(val)) { c = { name: '', emails: [], phones: [] }; continue }
    if (key === 'END' && /VCARD/i.test(val)) { if (c) { if (!c.name) c.name = [c.first, c.last].filter(Boolean).join(' ') || c.emails[0] || c.phones[0] || 'No name'; out.push(c) } c = null; continue }
    if (!c) continue
    const v = /ENCODING=QUOTED-PRINTABLE/i.test(params) ? decodeURIComponent(val.replace(/=([0-9A-F]{2})/gi, '%$1').replace(/=$/, '')) : val
    if (key === 'FN') c.name = v
    else if (key === 'N') { const [l, f] = v.split(';'); c.last = l || undefined; c.first = f || undefined }
    else if (key === 'ORG') c.org = v.replace(/;+$/, '').replace(/;/g, ', ')
    else if (key === 'TITLE') c.title = v
    else if (key === 'EMAIL') c.emails.push(v)
    else if (key === 'TEL') c.phones.push(v.replace(/^tel:/i, ''))
    else if (key === 'ADR') c.address = v.split(';').filter(Boolean).join(', ')
    else if (key === 'URL') c.url = v
    else if (key === 'BDAY') c.birthday = v
    else if (key === 'NOTE') c.note = v
  }
  return out
}
const vesc = (v: string) => v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')
export function toVcf(cs: Contact[]) {
  return cs.map((c) => ['BEGIN:VCARD', 'VERSION:3.0', `FN:${vesc(c.name)}`, `N:${vesc(c.last ?? '')};${vesc(c.first ?? '')};;;`, c.org && `ORG:${vesc(c.org)}`, c.title && `TITLE:${vesc(c.title)}`, ...c.emails.map((e) => `EMAIL;TYPE=INTERNET:${e}`), ...c.phones.map((p) => `TEL:${p}`), c.address && `ADR:;;${vesc(c.address)};;;;`, c.url && `URL:${c.url}`, c.birthday && `BDAY:${c.birthday}`, c.note && `NOTE:${vesc(c.note)}`, 'END:VCARD'].filter(Boolean).join('\r\n')).join('\r\n') + '\r\n'
}
/** Rows (from CSV) to contacts, guessing columns by header name. */
export function rowsToContacts(head: string[], rows: string[][]): Contact[] {
  const find = (re: RegExp) => head.findIndex((h) => re.test(h))
  const iName = find(/^(full ?name|name|display ?name)$/i), iF = find(/first|given/i), iL = find(/last|family|surname/i), iO = find(/org|company/i), iT = find(/title|job/i), iA = find(/address|street/i), iU = find(/url|web/i), iB = find(/birth/i), iN = find(/note/i)
  const iE = head.map((h, i) => (/e-?mail/i.test(h) ? i : -1)).filter((i) => i >= 0), iP = head.map((h, i) => (/phone|mobile|tel|cell/i.test(h) ? i : -1)).filter((i) => i >= 0)
  return rows.map((r) => {
    const g = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '') || undefined
    const first = g(iF), last = g(iL)
    return { name: g(iName) ?? [first, last].filter(Boolean).join(' '), first, last, org: g(iO), title: g(iT), address: g(iA), url: g(iU), birthday: g(iB), note: g(iN), emails: iE.map(g).filter(Boolean) as string[], phones: iP.map(g).filter(Boolean) as string[] }
  }).filter((c) => c.name || c.emails.length || c.phones.length)
}

/* ---------- DOCX clean-up ---------- */
const countRe = (x: string, re: RegExp) => (x.match(re) ?? []).length
/** Accept all tracked changes: keep insertions, drop deletions and formatting-change records. */
export function acceptChanges(xml: string) {
  const n = countRe(xml, /<w:(ins|del|moveFrom|moveTo)\b/g)
  let x = xml.replace(/<w:(del|moveFrom)\b[^>]*\/>/g, '').replace(/<w:(del|moveFrom)\b[^>]*>[\s\S]*?<\/w:\1>/g, '')
  x = x.replace(/<w:(ins|moveTo)\b[^>]*\/>/g, '').replace(/<w:(ins|moveTo)\b[^>]*>([\s\S]*?)<\/w:\1>/g, '$2')
  x = x.replace(/<w:(rPrChange|pPrChange|sectPrChange|tblPrChange|trPrChange|tcPrChange|numberingChange)\b[^>]*>[\s\S]*?<\/w:\1>/g, '').replace(/<w:(moveFromRangeStart|moveFromRangeEnd|moveToRangeStart|moveToRangeEnd)\b[^>]*\/>/g, '')
  return { xml: x, count: n }
}
/** Reject all tracked changes: drop insertions, restore deletions. */
export function rejectChanges(xml: string) {
  const n = countRe(xml, /<w:(ins|del|moveFrom|moveTo)\b/g)
  let x = xml.replace(/<w:(ins|moveTo)\b[^>]*\/>/g, '').replace(/<w:(ins|moveTo)\b[^>]*>[\s\S]*?<\/w:\1>/g, '')
  x = x.replace(/<w:(del|moveFrom)\b[^>]*>([\s\S]*?)<\/w:\1>/g, '$2').replace(/<w:delText\b([^>]*)>/g, '<w:t$1>').replace(/<\/w:delText>/g, '</w:t>')
  x = x.replace(/<w:(rPrChange|pPrChange|sectPrChange|tblPrChange|trPrChange|tcPrChange)\b[^>]*>[\s\S]*?<\/w:\1>/g, '').replace(/<w:(moveFromRangeStart|moveFromRangeEnd|moveToRangeStart|moveToRangeEnd)\b[^>]*\/>/g, '')
  return { xml: x, count: n }
}
export function removeComments(xml: string) {
  const n = countRe(xml, /<w:commentReference\b/g)
  return { xml: xml.replace(/<w:commentRangeStart\b[^>]*\/>|<w:commentRangeEnd\b[^>]*\/>/g, '').replace(/<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:commentReference\b[^>]*\/>(?:(?!<w:r\b)[\s\S])*?<\/w:r>/g, '').replace(/<w:commentReference\b[^>]*\/>/g, ''), count: n }
}
export function removeHighlights(xml: string) { const n = countRe(xml, /<w:highlight\b/g); return { xml: xml.replace(/<w:highlight\b[^>]*\/>/g, ''), count: n } }
export function removeHidden(xml: string) {
  let n = 0
  const x = xml.replace(/<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:vanish\/>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, (m) => (/<w:rPr>[\s\S]*<w:vanish\/>[\s\S]*<\/w:rPr>/.test(m) ? (n++, '') : m))
  return { xml: x, count: n }
}

/* ---------- DOCX find and replace across runs ---------- */
const xmlDec = (t: string) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const xmlEnc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export function escapeRe(t: string) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
/** Replace text inside every <w:p>, even when Word split the words across several runs. Returns new XML and the number of replacements. */
export function docxReplace(xml: string, find: string | RegExp, replace: string, opts: { caseSensitive?: boolean; wholeWord?: boolean } = {}) {
  const src = typeof find === 'string' ? escapeRe(find) : find.source
  if (!src) return { xml, count: 0 }
  const re = new RegExp(opts.wholeWord ? `\\b(?:${src})\\b` : src, 'g' + (opts.caseSensitive ? '' : 'i'))
  let total = 0
  const out = xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (para) => {
    const nodes: { start: number; end: number; open: string; text: string }[] = []
    for (const m of para.matchAll(/(<w:t\b[^>]*>)([^<]*)<\/w:t>/g)) nodes.push({ start: m.index!, end: m.index! + m[0].length, open: m[1], text: xmlDec(m[2]) })
    if (!nodes.length) return para
    const full = nodes.map((n) => n.text).join('')
    const matches = [...full.matchAll(re)].filter((m) => m[0].length)
    if (!matches.length) return para
    total += matches.length
    const offs: number[] = []; let o = 0; for (const n of nodes) { offs.push(o); o += n.text.length }
    const texts = nodes.map((n) => n.text)
    // apply from the end so earlier offsets stay valid
    for (const m of matches.reverse()) {
      const a = m.index!, b = a + m[0].length
      const rep = m[0].replace(new RegExp(re.source, re.flags.replace('g', '')), replace)
      let first = -1
      for (let k = 0; k < nodes.length; k++) {
        const ns = offs[k], ne = ns + nodes[k].text.length
        if (ne <= a || ns >= b) continue
        const ls = Math.max(0, a - ns), le = Math.min(nodes[k].text.length, b - ns)
        // later matches only changed text after this range, so original offsets still hold
        if (first < 0) { first = k; texts[k] = texts[k].slice(0, ls) + rep + texts[k].slice(le) }
        else texts[k] = texts[k].slice(0, ls) + texts[k].slice(le)
      }
    }
    let res = '', last = 0
    nodes.forEach((n, k) => { const open = /xml:space=/.test(n.open) ? n.open : n.open.replace('<w:t', '<w:t xml:space="preserve"'); res += para.slice(last, n.start) + open + xmlEnc(texts[k]) + '</w:t>'; last = n.end })
    return res + para.slice(last)
  })
  return { xml: out, count: total }
}
