/* Data format conversion core (pure, runs in the browser and in Node tests). */
export type DataFormat = 'json' | 'yaml' | 'xml' | 'toml' | 'ini' | 'csv' | 'tsv' | 'ndjson' | 'msgpack' | 'cbor' | 'bson'

export const FORMATS: { id: DataFormat; label: string; ext: string; mime: string; binary?: boolean }[] = [
  { id: 'json', label: 'JSON', ext: 'json', mime: 'application/json' },
  { id: 'yaml', label: 'YAML', ext: 'yaml', mime: 'application/yaml' },
  { id: 'xml', label: 'XML', ext: 'xml', mime: 'application/xml' },
  { id: 'toml', label: 'TOML', ext: 'toml', mime: 'application/toml' },
  { id: 'ini', label: 'INI', ext: 'ini', mime: 'text/plain' },
  { id: 'csv', label: 'CSV', ext: 'csv', mime: 'text/csv' },
  { id: 'tsv', label: 'TSV', ext: 'tsv', mime: 'text/tab-separated-values' },
  { id: 'ndjson', label: 'NDJSON', ext: 'ndjson', mime: 'application/x-ndjson' },
  { id: 'msgpack', label: 'MessagePack', ext: 'msgpack', mime: 'application/msgpack', binary: true },
  { id: 'cbor', label: 'CBOR', ext: 'cbor', mime: 'application/cbor', binary: true },
  { id: 'bson', label: 'BSON', ext: 'bson', mime: 'application/bson', binary: true },
]

export function formatFromName(name: string): DataFormat | null {
  const e = name.toLowerCase().split('.').pop() || ''
  const map: Record<string, DataFormat> = { json: 'json', yml: 'yaml', yaml: 'yaml', xml: 'xml', toml: 'toml', ini: 'ini', cfg: 'ini', conf: 'ini', properties: 'ini', csv: 'csv', tsv: 'tsv', tab: 'tsv', ndjson: 'ndjson', jsonl: 'ndjson', msgpack: 'msgpack', mpk: 'msgpack', cbor: 'cbor', bson: 'bson' }
  return map[e] ?? null
}

/** Guess the format of pasted text. */
export function sniffText(t: string): DataFormat {
  const s = t.trimStart()
  if (s.startsWith('<')) return 'xml'
  if (s.startsWith('{') || s.startsWith('[')) {
    const lines = s.split('\n').filter((l) => l.trim())
    if (lines.length > 1 && lines.every((l) => /^\s*[{[]/.test(l) && /[}\]]\s*$/.test(l))) { try { lines.forEach((l) => JSON.parse(l)); return 'ndjson' } catch { /* not ndjson */ } }
    if (/^\[[^\]\n=]+\]\s*$/m.test(s) && /^\s*[\w.-]+\s*=/m.test(s) && !/^\s*[{[]\s*$/.test(lines[0])) return /"|'/.test(s) || /=\s*\d/.test(s) ? 'toml' : 'ini'
    return 'json'
  }
  if (/^\s*\[[^\]]+\]\s*$/m.test(s) && /^\s*[\w.-]+\s*=/m.test(s)) return /=\s*("|'|\d|true|false|\[)/m.test(s) ? 'toml' : 'ini'
  if (/^\s*[\w."-]+\s*=\s*/m.test(s) && !/:\s/.test(s.split('\n')[0])) return 'toml'
  const first = s.split('\n')[0]
  if (first.includes('\t')) return 'tsv'
  if (first.split(',').length > 1 && !/:\s/.test(first)) return 'csv'
  return 'yaml'
}

export type Libs = {
  yaml: typeof import('js-yaml')
  fxp: typeof import('fast-xml-parser')
  toml: typeof import('smol-toml')
  ini: typeof import('ini')
  papa: typeof import('papaparse')
  msgpack: typeof import('@msgpack/msgpack')
  cbor: typeof import('cbor-x')
  bson: typeof import('bson')
}

let libsP: Promise<Libs> | null = null
export function loadLibs(): Promise<Libs> {
  libsP ??= (async () => {
    const [yaml, fxp, toml, ini, papa, msgpack, cbor, bson] = await Promise.all([
      import('js-yaml'), import('fast-xml-parser'), import('smol-toml'), import('ini'), import('papaparse'), import('@msgpack/msgpack'), import('cbor-x'), import('bson'),
    ])
    const d = <T,>(m: any): T => (m && m.default && Object.keys(m).length <= 2 ? m.default : m) as T
    return { yaml: d(yaml), fxp, toml, ini: d(ini), papa: d(papa), msgpack, cbor, bson } as Libs
  })()
  return libsP
}

export interface ConvOpts { indent: number; xmlRoot: string; flatten: boolean; csvHeader: boolean; delimiter?: string; attrPrefix: string }
export const defaultOpts: ConvOpts = { indent: 2, xmlRoot: 'root', flatten: true, csvHeader: true, attrPrefix: '@_' }

/** Convert BSON/CBOR exotic values into JSON-friendly ones. */
export function normalize(v: unknown): unknown {
  if (v === null || v === undefined) return v ?? null
  if (typeof v === 'bigint') return Number.isSafeInteger(Number(v)) ? Number(v) : v.toString()
  if (v instanceof Date) return v.toISOString()
  if (v instanceof Map) return normalize(Object.fromEntries(v))
  if (v instanceof Set) return [...v].map(normalize)
  if (ArrayBuffer.isView(v)) return Array.from(v as unknown as ArrayLike<number>)
  if (Array.isArray(v)) return v.map(normalize)
  if (typeof v === 'object') {
    const o = v as any
    const bt = o._bsontype
    if (bt === 'ObjectId' || bt === 'ObjectID') return o.toHexString()
    if (bt === 'Decimal128' || bt === 'Long' || bt === 'Int32' || bt === 'Double') return bt === 'Long' ? (Number.isSafeInteger(o.toNumber()) ? o.toNumber() : o.toString()) : bt === 'Decimal128' ? o.toString() : o.valueOf()
    if (bt === 'Binary') return o.toString('base64')
    if (bt) return String(o)
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(o)) out[k] = normalize(o[k])
    return out
  }
  return v
}

export function flattenObj(o: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    const keys = Object.keys(o as object)
    if (!keys.length && prefix) out[prefix] = ''
    for (const k of keys) flattenObj((o as any)[k], prefix ? `${prefix}.${k}` : k, out)
  } else if (Array.isArray(o) && o.some((x) => x && typeof x === 'object')) {
    o.forEach((x, i) => flattenObj(x, `${prefix}[${i}]`, out))
  } else if (Array.isArray(o)) out[prefix] = o.join(';')
  else out[prefix] = o
  return out
}

export function unflattenObj(row: Record<string, unknown>): Record<string, unknown> {
  const out: any = {}
  for (const [path, val] of Object.entries(row)) {
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter((p) => p !== '')
    if (parts.length <= 1) { out[path] = val; continue }
    let cur = out
    parts.forEach((p, i) => {
      const last = i === parts.length - 1
      if (last) { cur[p] = val; return }
      const nextIsIdx = /^\d+$/.test(parts[i + 1])
      if (cur[p] === undefined || typeof cur[p] !== 'object') cur[p] = nextIsIdx ? [] : {}
      cur = cur[p]
    })
  }
  return out
}

function toRows(v: unknown, flatten: boolean): Record<string, unknown>[] {
  let arr: unknown[]
  if (Array.isArray(v)) arr = v
  else if (v && typeof v === 'object') {
    const vals = Object.values(v as object)
    // { items: [...] } style wrappers
    const onlyArr = vals.length === 1 && Array.isArray(vals[0]) ? (vals[0] as unknown[]) : null
    arr = onlyArr ?? [v]
  } else arr = [{ value: v }]
  return arr.map((r) => (r && typeof r === 'object' && !Array.isArray(r) ? (flatten ? flattenObj(r) : Object.fromEntries(Object.entries(r as object).map(([k, x]) => [k, x && typeof x === 'object' ? JSON.stringify(x) : x]))) : { value: Array.isArray(r) ? JSON.stringify(r) : r }))
}

const asObject = (v: unknown, key = 'items') => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : { [key]: v })

export const jsonText = (v: unknown, indent: number) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x), indent || undefined)

export function parseData(fmt: DataFormat, input: string | Uint8Array, L: Libs, o: ConvOpts = defaultOpts): unknown {
  const text = typeof input === 'string' ? input : new TextDecoder().decode(input)
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  switch (fmt) {
    case 'json': return JSON.parse(text)
    case 'yaml': { const docs = L.yaml.loadAll(text).filter((d) => d !== undefined); return normalize(docs.length > 1 ? docs : docs[0] ?? null) }
    case 'xml': {
      const valid = L.fxp.XMLValidator.validate(text)
      if (valid !== true) throw new Error(`XML error at line ${valid.err.line}: ${valid.err.msg}`)
      return new L.fxp.XMLParser({ ignoreAttributes: false, attributeNamePrefix: o.attrPrefix, parseAttributeValue: true, trimValues: true, ignoreDeclaration: true }).parse(text)
    }
    case 'toml': return normalize(L.toml.parse(text))
    case 'ini': return L.ini.parse(text)
    case 'csv': case 'tsv': {
      const r = L.papa.parse<Record<string, unknown>>(text.trim(), { header: o.csvHeader, dynamicTyping: true, skipEmptyLines: true, delimiter: fmt === 'tsv' ? '\t' : o.delimiter || '' })
      if (r.errors.length && !r.data.length) throw new Error(r.errors[0].message)
      return o.csvHeader && o.flatten ? (r.data as Record<string, unknown>[]).map(unflattenObj) : r.data
    }
    case 'ndjson': return text.split(/\r?\n/).map((l, i) => { if (!l.trim()) return undefined; try { return JSON.parse(l) } catch (e: any) { throw new Error(`Line ${i + 1}: ${e.message}`) } }).filter((x) => x !== undefined)
    case 'msgpack': return normalize(L.msgpack.decode(bytes, { useBigInt64: true } as any))
    case 'cbor': return normalize(L.cbor.decode(bytes))
    case 'bson': return normalize(L.bson.deserialize(bytes))
  }
}

export function serializeData(fmt: DataFormat, v: unknown, L: Libs, o: ConvOpts = defaultOpts): string | Uint8Array {
  switch (fmt) {
    case 'json': return jsonText(v, o.indent)
    case 'yaml': return L.yaml.dump(v, { indent: o.indent || 2, lineWidth: 120, noRefs: true })
    case 'xml': {
      let root: unknown = v
      const keys = v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v) : []
      if (!(keys.length === 1 && !Array.isArray((v as any)[keys[0]]))) root = { [o.xmlRoot || 'root']: Array.isArray(v) ? { item: v } : v }
      const b = new L.fxp.XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: o.attrPrefix, format: o.indent > 0, indentBy: ' '.repeat(o.indent || 2), suppressEmptyNode: true })
      return '<?xml version="1.0" encoding="UTF-8"?>\n' + String(b.build(root)).trim() + '\n'
    }
    case 'toml': return L.toml.stringify(stripNulls(asObject(v)) as any)
    case 'ini': {
      const obj = asObject(v)
      return L.ini.stringify(obj, { whitespace: true } as any)
    }
    case 'csv': case 'tsv': {
      const rows = toRows(v, o.flatten)
      const fields = [...new Set(rows.flatMap((r) => Object.keys(r)))]
      return L.papa.unparse({ fields, data: rows.map((r) => fields.map((f) => r[f] ?? '')) }, { delimiter: fmt === 'tsv' ? '\t' : o.delimiter || ',', header: o.csvHeader })
    }
    case 'ndjson': return (Array.isArray(v) ? v : [v]).map((x) => jsonText(x, 0)).join('\n') + '\n'
    case 'msgpack': return L.msgpack.encode(v)
    case 'cbor': return new Uint8Array(L.cbor.encode(v))
    case 'bson': return L.bson.serialize(asObject(v))
  }
}

/** TOML has no null; drop null keys and null array items. */
function stripNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.filter((x) => x !== null && x !== undefined).map(stripNulls)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null && x !== undefined).map(([k, x]) => [k, stripNulls(x)]))
  return v
}

export function convert(from: DataFormat, to: DataFormat, input: string | Uint8Array, L: Libs, o: ConvOpts = defaultOpts) {
  const v = parseData(from, input, L, o)
  return { value: v, out: serializeData(to, v, L, o) }
}
