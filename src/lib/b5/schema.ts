/* Infer a JSON Schema from sample data (pure). */
type S = Record<string, any>

function detectFormat(s: string): string | undefined {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(s)) return 'date-time'
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'date'
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'email'
  if (/^https?:\/\/\S+$/.test(s)) return 'uri'
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return 'uuid'
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(s)) return 'ipv4'
  return undefined
}

function typeOf(v: unknown) { return v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'number') : typeof v }

function merge(a: S, b: S): S {
  if (!a) return b
  if (!b) return a
  const ta = [].concat(a.type), tb = [].concat(b.type)
  let types = [...new Set([...ta, ...tb])] as string[]
  if (types.includes('number') && types.includes('integer')) types = types.filter((t) => t !== 'integer')
  const out: S = { type: types.length === 1 ? types[0] : types }
  if (types.includes('object') && (a.properties || b.properties)) {
    const keys = new Set([...Object.keys(a.properties ?? {}), ...Object.keys(b.properties ?? {})])
    out.properties = {}
    for (const k of keys) out.properties[k] = merge(a.properties?.[k], b.properties?.[k])
    const ra = new Set(a.required ?? []), rb = new Set(b.required ?? [])
    out.required = [...keys].filter((k) => (a.properties ? ra.has(k) : true) && (b.properties ? rb.has(k) : true))
    if (!out.required.length) delete out.required
  }
  if (types.includes('array')) out.items = merge(a.items, b.items) ?? {}
  if (a.format && a.format === b.format) out.format = a.format
  return out
}

export function inferSchema(v: unknown, opts: { required?: boolean; formats?: boolean } = { required: true, formats: true }): S {
  const t = typeOf(v)
  if (t === 'object') {
    const props: S = {}
    for (const [k, x] of Object.entries(v as object)) props[k] = inferSchema(x, opts)
    const s: S = { type: 'object', properties: props }
    if (opts.required && Object.keys(props).length) s.required = Object.keys(props)
    return s
  }
  if (t === 'array') {
    const arr = v as unknown[]
    const items = arr.map((x) => inferSchema(x, opts)).reduce<S | undefined>((acc, s) => (acc ? merge(acc, s) : s), undefined)
    return { type: 'array', items: items ?? {} }
  }
  if (t === 'string' && opts.formats) { const f = detectFormat(v as string); return f ? { type: 'string', format: f } : { type: 'string' } }
  return { type: t }
}

export function withMeta(schema: S, draft: '07' | '2020') {
  return { $schema: draft === '2020' ? 'https://json-schema.org/draft/2020-12/schema' : 'http://json-schema.org/draft-07/schema#', ...schema }
}
