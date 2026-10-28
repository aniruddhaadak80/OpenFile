/* Minimal Avro Object Container File reader (pure). Supports null, deflate and snappy codecs. */
type Schema = any

class Reader {
  p = 0
  b: Uint8Array
  constructor(b: Uint8Array) { this.b = b }
  long(): number {
    let n = 0n, s = 0n, x: number
    do { if (this.p >= this.b.length) throw new Error('Unexpected end of Avro data'); x = this.b[this.p++]; n |= BigInt(x & 0x7f) << s; s += 7n } while (x & 0x80)
    const v = (n >> 1n) ^ -(n & 1n)
    return Number(v)
  }
  bytes(): Uint8Array { const n = this.long(); const v = this.b.subarray(this.p, this.p + n); this.p += n; return v }
  string() { return new TextDecoder().decode(this.bytes()) }
  float() { const v = new DataView(this.b.buffer, this.b.byteOffset + this.p, 4).getFloat32(0, true); this.p += 4; return v }
  double() { const v = new DataView(this.b.buffer, this.b.byteOffset + this.p, 8).getFloat64(0, true); this.p += 8; return v }
  fixed(n: number) { const v = this.b.subarray(this.p, this.p + n); this.p += n; return v }
}

function resolveNamed(schema: Schema, names: Map<string, Schema>, ns = ''): Schema {
  if (typeof schema === 'string') return names.get(schema) ?? names.get(ns ? `${ns}.${schema}` : schema) ?? schema
  if (Array.isArray(schema)) return schema.map((s) => resolveNamed(s, names, ns))
  if (schema && typeof schema === 'object' && schema.name && ['record', 'enum', 'fixed', 'error'].includes(schema.type)) {
    const full = schema.name.includes('.') ? schema.name : (schema.namespace ?? ns) ? `${schema.namespace ?? ns}.${schema.name}` : schema.name
    names.set(full, schema); names.set(schema.name, schema)
    if (schema.fields) for (const f of schema.fields) f.type = resolveNamed(f.type, names, schema.namespace ?? ns)
    return schema
  }
  if (schema && typeof schema === 'object') {
    if (schema.items) schema.items = resolveNamed(schema.items, names, ns)
    if (schema.values) schema.values = resolveNamed(schema.values, names, ns)
  }
  return schema
}

function read(r: Reader, s: Schema): unknown {
  if (Array.isArray(s)) return read(r, s[r.long()])
  const t = typeof s === 'string' ? s : s.type
  switch (t) {
    case 'null': return null
    case 'boolean': return r.b[r.p++] === 1
    case 'int': case 'long': return r.long()
    case 'float': return r.float()
    case 'double': return r.double()
    case 'bytes': return r.bytes()
    case 'string': return r.string()
    case 'fixed': return r.fixed(s.size)
    case 'enum': return s.symbols[r.long()]
    case 'array': { const out: unknown[] = []; let n: number; while ((n = r.long()) !== 0) { if (n < 0) { n = -n; r.long() } for (let i = 0; i < n; i++) out.push(read(r, s.items)) } return out }
    case 'map': { const out: Record<string, unknown> = {}; let n: number; while ((n = r.long()) !== 0) { if (n < 0) { n = -n; r.long() } for (let i = 0; i < n; i++) { const k = r.string(); out[k] = read(r, s.values) } } return out }
    case 'record': case 'error': { const o: Record<string, unknown> = {}; for (const f of s.fields) o[f.name] = read(r, f.type); return o }
    default: if (typeof s === 'object' && s.type) return read(r, s.type); throw new Error(`Unsupported Avro type ${JSON.stringify(t)}`)
  }
}

export async function readAvro(b: Uint8Array, maxRows = Infinity) {
  if (!(b[0] === 0x4f && b[1] === 0x62 && b[2] === 0x6a && b[3] === 1)) throw new Error('Not an Avro container file (missing Obj header).')
  const r = new Reader(b); r.p = 4
  const meta = read(r, { type: 'map', values: 'bytes' }) as Record<string, Uint8Array>
  const sync = r.fixed(16)
  const schema = JSON.parse(new TextDecoder().decode(meta['avro.schema']))
  const codec = meta['avro.codec'] ? new TextDecoder().decode(meta['avro.codec']) : 'null'
  const resolved = resolveNamed(structuredClone(schema), new Map())
  const rows: unknown[] = []
  let inflate: ((d: Uint8Array) => Uint8Array) | null = null
  let snappy: ((i: Uint8Array, o: Uint8Array) => void) | null = null
  if (codec === 'deflate') inflate = (await import('fflate')).inflateSync
  else if (codec === 'snappy') snappy = (await import('hyparquet')).snappyUncompress as any
  else if (codec !== 'null') throw new Error(`Avro codec "${codec}" is not supported (null, deflate and snappy are).`)
  while (r.p < b.length && rows.length < maxRows) {
    const count = r.long(); const size = r.long()
    let block = r.fixed(size)
    if (inflate) block = inflate(block)
    else if (snappy) {
      const data = block.subarray(0, block.length - 4)
      let len = 0, sh = 0, i = 0; for (; ; i++) { const x = data[i]; len |= (x & 0x7f) << sh; if (!(x & 0x80)) break; sh += 7 }
      const out = new Uint8Array(len); snappy(data, out); block = out
    }
    const br = new Reader(block)
    for (let i = 0; i < count && rows.length < maxRows; i++) rows.push(read(br, resolved))
    const s2 = r.fixed(16); if (!s2.every((x, k) => x === sync[k])) throw new Error('Avro sync marker mismatch; the file may be damaged.')
  }
  return { schema, codec, rows }
}
