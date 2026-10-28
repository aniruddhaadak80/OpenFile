/* Read Parquet, Arrow IPC / Feather and Avro into rows (pure, dynamic imports). */
import { readAvro } from './avro.ts'

export type Loaded = { kind: 'Parquet' | 'Arrow' | 'Avro'; columns: string[]; rows: Record<string, unknown>[]; total: number; schema: { name: string; type: string }[]; meta: Record<string, string> }

export function sniff(b: Uint8Array, name = ''): 'parquet' | 'arrow' | 'avro' | null {
  const s = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n))
  if (s(0, 4) === 'PAR1') return 'parquet'
  if (s(0, 6) === 'ARROW1') return 'arrow'
  if (b[0] === 0xff && b[1] === 0xff && b[2] === 0xff && b[3] === 0xff) return 'arrow' // IPC stream
  if (s(0, 3) === 'Obj' && b[3] === 1) return 'avro'
  const e = name.toLowerCase().split('.').pop()
  return e === 'parquet' ? 'parquet' : e === 'arrow' || e === 'feather' || e === 'ipc' ? 'arrow' : e === 'avro' ? 'avro' : null
}

const plain = (v: unknown): unknown => {
  if (typeof v === 'bigint') return Number.isSafeInteger(Number(v)) ? Number(v) : v.toString()
  if (v && typeof v === 'object' && !(v instanceof Date) && !(v instanceof Uint8Array)) {
    if (typeof (v as any).toJSON === 'function' && !Array.isArray(v)) return plain((v as any).toJSON())
    if (Array.isArray(v) || ArrayBuffer.isView(v)) return Array.from(v as any, plain)
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]))
  }
  return v
}

export async function loadColumnar(b: Uint8Array, name: string, maxRows = 1_000_000): Promise<Loaded> {
  const kind = sniff(b, name)
  if (kind === 'parquet') {
    const hp = await import('hyparquet')
    const { compressors } = await import('hyparquet-compressors')
    const file = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
    const md = hp.parquetMetadata(file)
    const total = Number(md.num_rows)
    const rows = (await hp.parquetReadObjects({ file, compressors, rowEnd: Math.min(total, maxRows) })) as Record<string, unknown>[]
    const tree = hp.parquetSchema(md) as any
    const schema = tree.children.map((c: any) => ({ name: c.element.name as string, type: String([c.element.logical_type?.type, c.element.converted_type, c.element.type].filter(Boolean)[0] ?? (c.children?.length ? 'group' : '')) }))
    const meta: Record<string, string> = { 'Created by': md.created_by ?? '', 'Row groups': String(md.row_groups.length), Version: String(md.version) }
    const codecs = new Set(md.row_groups.flatMap((g: any) => g.columns.map((c: any) => c.meta_data?.codec)).filter(Boolean)); meta.Compression = [...codecs].join(', ')
    return { kind: 'Parquet', columns: schema.map((s: any) => s.name), rows: rows.map((r) => plain(r) as Record<string, unknown>), total, schema, meta }
  }
  if (kind === 'arrow') {
    await registerArrowCodecs()
    const { tableFromIPC } = await import('apache-arrow')
    const t = tableFromIPC(b)
    const n = Math.min(t.numRows, maxRows)
    const cols = t.schema.fields.map((f) => f.name)
    const rows: Record<string, unknown>[] = []
    const vecs = cols.map((c) => t.getChild(c))
    for (let i = 0; i < n; i++) { const o: Record<string, unknown> = {}; cols.forEach((c, k) => { o[c] = plain(vecs[k]?.get(i)) }); rows.push(o) }
    return { kind: 'Arrow', columns: cols, rows, total: t.numRows, schema: t.schema.fields.map((f) => ({ name: f.name, type: String(f.type) + (f.nullable ? '' : ' not null') })), meta: { 'Record batches': String(t.batches.length) } }
  }
  if (kind === 'avro') {
    const r = await readAvro(b, maxRows)
    const fields = (r.schema.fields ?? []) as { name: string; type: unknown }[]
    const cols = fields.length ? fields.map((f) => f.name) : ['value']
    return { kind: 'Avro', columns: cols, rows: r.rows.map((x) => (fields.length ? plain(x) : { value: plain(x) }) as Record<string, unknown>), total: r.rows.length, schema: fields.map((f) => ({ name: f.name, type: typeof f.type === 'string' ? f.type : JSON.stringify(f.type) })), meta: { Codec: r.codec, Record: r.schema.name ?? '' } }
  }
  throw new Error('Not a Parquet, Arrow/Feather or Avro file.')
}

/* ---------- Arrow IPC buffer codecs (LZ4 frame, ZSTD) ---------- */
function lz4Block(src: Uint8Array, out: number[]) {
  let i = 0
  while (i < src.length) {
    const token = src[i++]
    let lit = token >> 4
    if (lit === 15) { let b; do { b = src[i++]; lit += b } while (b === 255) }
    for (let k = 0; k < lit; k++) out.push(src[i++])
    if (i >= src.length) break
    const off = src[i++] | (src[i++] << 8)
    if (!off || off > out.length) throw new Error('Bad LZ4 data')
    let ml = token & 15
    if (ml === 15) { let b; do { b = src[i++]; ml += b } while (b === 255) }
    ml += 4
    const start = out.length - off
    for (let k = 0; k < ml; k++) out.push(out[start + k])
  }
}
export function lz4FrameDecode(src: Uint8Array): Uint8Array {
  const dv = new DataView(src.buffer, src.byteOffset, src.byteLength)
  if (dv.getUint32(0, true) !== 0x184d2204) throw new Error('Not an LZ4 frame')
  const flg = src[4]; let p = 6
  if (flg & 0x08) p += 8
  if (flg & 0x01) p += 4
  p += 1 // header checksum
  const blockChecksum = !!(flg & 0x10)
  const out: number[] = []
  while (p + 4 <= src.length) {
    const sz = dv.getUint32(p, true); p += 4
    if (sz === 0) break
    const raw = !!(sz & 0x80000000); const n = sz & 0x7fffffff
    const blk = src.subarray(p, p + n); p += n
    if (raw) for (const x of blk) out.push(x); else lz4Block(blk, out)
    if (blockChecksum) p += 4
  }
  return Uint8Array.from(out)
}

let codecsReady = false
export async function registerArrowCodecs() {
  if (codecsReady) return
  const arrow = await import('apache-arrow')
  const { decompressZstd } = await import('hyparquet-compressors') as any
  arrow.compressionRegistry.set(arrow.CompressionType.LZ4_FRAME, { decode: (d: Uint8Array) => lz4FrameDecode(d) })
  arrow.compressionRegistry.set(arrow.CompressionType.ZSTD, { decode: (d: Uint8Array) => new Uint8Array(decompressZstd(d)) })
  codecsReady = true
}
