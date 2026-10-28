/* XML <-> table for the table converter. Uses fast-xml-parser (MIT), so it works without a DOM. */
export interface Table { headers: string[]; rows: string[][] }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function flatten(v: unknown, prefix: string, out: Record<string, string>) {
  if (v == null) { if (prefix) out[prefix] = ''; return }
  if (Array.isArray(v)) {
    if (v.every((x) => !isObj(x) && !Array.isArray(x))) { out[prefix] = v.map((x) => String(x ?? '')).join('; '); return }
    v.forEach((x, i) => flatten(x, `${prefix}[${i}]`, out)); return
  }
  if (isObj(v)) {
    const keys = Object.keys(v).sort((a, b) => Number(!a.startsWith('@_')) - Number(!b.startsWith('@_')))
    if (keys.length === 1 && keys[0] === '#text') { out[prefix || 'value'] = String(v['#text']); return }
    for (const k of keys) {
      const name = k === '#text' ? (prefix ? `${prefix}` : 'value') : k.startsWith('@_') ? `${prefix ? prefix + '.' : ''}@${k.slice(2)}` : `${prefix ? prefix + '.' : ''}${k}`
      flatten(v[k], name, out)
    }
    return
  }
  out[prefix || 'value'] = String(v)
}

/** Find the most likely list of records: the largest array of element objects, searching depth first. */
function findRecords(node: unknown, path: string[] = []): { items: unknown[]; path: string[] } | null {
  let best: { items: unknown[]; path: string[] } | null = null
  const consider = (c: { items: unknown[]; path: string[] } | null) => { if (c && (!best || c.items.length > best.items.length)) best = c }
  if (Array.isArray(node)) {
    if (node.length) consider({ items: node, path })
    node.forEach((n) => consider(findRecords(n, path)))
  } else if (isObj(node)) {
    for (const [k, v] of Object.entries(node)) if (!k.startsWith('@_') && k !== '#text' && k !== '?xml') consider(findRecords(v, [...path, k]))
  }
  return best
}

export async function parseXmlTable(xml: string): Promise<Table & { recordPath: string }> {
  const { XMLParser, XMLValidator } = await import('fast-xml-parser')
  const valid = XMLValidator.validate(xml)
  if (valid !== true) throw new Error(`XML error on line ${valid.err.line}: ${valid.err.msg}`)
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false, parseAttributeValue: false, trimValues: true, ignoreDeclaration: true, ignorePiTags: true })
  const doc = parser.parse(xml)
  let rec = findRecords(doc)
  if (!rec) {
    // No repeated element: use the children of the root as one record.
    const root = Object.values(doc).find(isObj)
    if (!root) throw new Error('No records found in this XML')
    rec = { items: [root], path: Object.keys(doc) }
  }
  const flat = rec.items.map((it) => { const o: Record<string, string> = {}; flatten(it, '', o); return o })
  const headers: string[] = []
  const seen = new Set<string>()
  for (const o of flat) for (const k of Object.keys(o)) if (!seen.has(k)) { seen.add(k); headers.push(k) }
  return { headers, rows: flat.map((o) => headers.map((h) => o[h] ?? '')), recordPath: rec.path.join(' > ') }
}

const xmlName = (s: string, i: number) => {
  let n = s.trim().replace(/[^\p{L}\p{N}_.-]+/gu, '_').replace(/^_+|_+$/g, '')
  if (!n || /^[\d.-]/.test(n) || /^xml/i.test(n)) n = `col_${n || i + 1}`
  return n
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

export interface XmlOutOpts { root: string; row: string; attributes: boolean; pretty: boolean }
export function tableToXml(t: Table, o: XmlOutOpts = { root: 'rows', row: 'row', attributes: false, pretty: true }): string {
  const names = t.headers.map(xmlName)
  const root = xmlName(o.root || 'rows', 0), row = xmlName(o.row || 'row', 0)
  const nl = o.pretty ? '\n' : '', i1 = o.pretty ? '  ' : '', i2 = o.pretty ? '    ' : ''
  const body = t.rows.map((r) => {
    if (o.attributes) return `${i1}<${row}${names.map((n, i) => ` ${n}="${esc(r[i] ?? '')}"`).join('')}/>`
    return `${i1}<${row}>${nl}${names.map((n, i) => (r[i] ?? '') === '' ? `${i2}<${n}/>` : `${i2}<${n}>${esc(r[i])}</${n}>`).join(nl)}${nl}${i1}</${row}>`
  })
  return `<?xml version="1.0" encoding="UTF-8"?>${nl}<${root}>${nl}${body.join(nl)}${nl}</${root}>${nl}`
}

export const looksLikeXml = (s: string) => {
  const t = s.trimStart()
  return t.startsWith('<?xml') || (/^<[A-Za-z_][\w.-]*[\s>]/.test(t) && !/^<(table|html|!doctype|thead|tbody|tr|div|body)\b/i.test(t) && !/<table\b/i.test(t))
}
