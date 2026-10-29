/* Gettext PO / MO parsing and writing (pure). */
export type Entry = { ctx?: string; id: string; plural?: string; str: string[]; comments?: string[]; extracted?: string[]; refs?: string[]; flags?: string[] }
export type Catalog = { headers: Record<string, string>; entries: Entry[] }

const unq = (s: string) => {
  const m = s.trim().match(/^"(.*)"$/s); if (!m) throw new Error(`Expected a quoted string, got: ${s.slice(0, 40)}`)
  return m[1].replace(/\\(.)/g, (_, c) => ({ n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', a: '\x07', b: '\b', f: '\f', v: '\v' } as Record<string, string>)[c] ?? c)
}
const q = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n') + '"'

export function parseHeaders(s: string) { const h: Record<string, string> = {}; for (const line of s.split('\n')) { const i = line.indexOf(':'); if (i > 0) h[line.slice(0, i).trim()] = line.slice(i + 1).trim() } return h }
export const headersText = (h: Record<string, string>) => Object.entries(h).map(([k, v]) => `${k}: ${v}\n`).join('')

export function parsePo(text: string): Catalog {
  const entries: Entry[] = []; let headers: Record<string, string> = {}
  const blocks = text.replace(/\r\n/g, '\n').split(/\n\s*\n/)
  blocks.forEach((block, bi) => {
    const e: Entry = { id: '', str: [] }; let cur: { key: string; idx?: number } | null = null; let any = false; let obsolete = false
    for (const raw of block.split('\n')) {
      let line = raw.trim(); if (!line) continue
      if (line.startsWith('#~')) { obsolete = true; continue }
      if (line.startsWith('#.')) { (e.extracted ??= []).push(line.slice(2).trim()); continue }
      if (line.startsWith('#:')) { (e.refs ??= []).push(...line.slice(2).trim().split(/\s+/)); continue }
      if (line.startsWith('#,')) { (e.flags ??= []).push(...line.slice(2).split(',').map((f) => f.trim()).filter(Boolean)); continue }
      if (line.startsWith('#')) { (e.comments ??= []).push(line.slice(1).trim()); continue }
      const m = line.match(/^(msgctxt|msgid_plural|msgid|msgstr)(?:\[(\d+)\])?\s+(".*")$/)
      try {
        if (m) {
          any = true; cur = { key: m[1], idx: m[2] !== undefined ? Number(m[2]) : undefined }
          const v = unq(m[3])
          if (cur.key === 'msgctxt') e.ctx = v; else if (cur.key === 'msgid') e.id = v; else if (cur.key === 'msgid_plural') e.plural = v; else e.str[cur.idx ?? 0] = v
        } else if (line.startsWith('"') && cur) {
          const v = unq(line)
          if (cur.key === 'msgctxt') e.ctx += v; else if (cur.key === 'msgid') e.id += v; else if (cur.key === 'msgid_plural') e.plural += v; else e.str[cur.idx ?? 0] = (e.str[cur.idx ?? 0] ?? '') + v
        } else throw new Error(`Unexpected line: ${line.slice(0, 60)}`)
      } catch (err: any) { throw new Error(`Block ${bi + 1}: ${err.message}`) }
    }
    if (!any || obsolete) return
    if (e.id === '' && !e.ctx) headers = parseHeaders(e.str[0] ?? '')
    else entries.push(e)
  })
  return { headers, entries }
}

export function writePo(c: Catalog): string {
  const out: string[] = []
  const lines = (key: string, v: string) => { if (v.includes('\n') && v.indexOf('\n') < v.length - 1) { const parts = v.split(/(?<=\n)/); return `${key} ""\n` + parts.map(q).join('\n') } return `${key} ${q(v)}` }
  out.push('msgid ""\n' + lines('msgstr', headersText(c.headers)))
  for (const e of c.entries) {
    const b: string[] = []
    e.comments?.forEach((x) => b.push(`# ${x}`)); e.extracted?.forEach((x) => b.push(`#. ${x}`)); if (e.refs?.length) b.push(`#: ${e.refs.join(' ')}`); if (e.flags?.length) b.push(`#, ${e.flags.join(', ')}`)
    if (e.ctx !== undefined) b.push(lines('msgctxt', e.ctx))
    b.push(lines('msgid', e.id))
    if (e.plural !== undefined) { b.push(lines('msgid_plural', e.plural)); const n = Math.max(2, e.str.length); for (let i = 0; i < n; i++) b.push(lines(`msgstr[${i}]`, e.str[i] ?? '')) }
    else b.push(lines('msgstr', e.str[0] ?? ''))
    out.push(b.join('\n'))
  }
  return out.join('\n\n') + '\n'
}

const te = new TextEncoder(), td = new TextDecoder()

export function writeMo(c: Catalog): Uint8Array {
  const items: [string, string][] = [['', headersText(c.headers)]]
  for (const e of c.entries) {
    if (!e.str.some((s) => s)) continue // untranslated entries are skipped, like msgfmt
    const key = (e.ctx !== undefined ? e.ctx + '\x04' : '') + e.id + (e.plural !== undefined ? '\0' + e.plural : '')
    items.push([key, e.plural !== undefined ? e.str.join('\0') : e.str[0] ?? ''])
  }
  items.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const keys = items.map(([k]) => te.encode(k)), vals = items.map(([, v]) => te.encode(v))
  const N = items.length, headerSize = 28, origTab = headerSize, transTab = origTab + N * 8
  let off = transTab + N * 8
  const total = off + keys.reduce((a, k) => a + k.length + 1, 0) + vals.reduce((a, v) => a + v.length + 1, 0)
  const buf = new Uint8Array(total); const dv = new DataView(buf.buffer)
  dv.setUint32(0, 0x950412de, true); dv.setUint32(4, 0, true); dv.setUint32(8, N, true); dv.setUint32(12, origTab, true); dv.setUint32(16, transTab, true); dv.setUint32(20, 0, true); dv.setUint32(24, 0, true)
  keys.forEach((k, i) => { dv.setUint32(origTab + i * 8, k.length, true); dv.setUint32(origTab + i * 8 + 4, off, true); buf.set(k, off); off += k.length + 1 })
  vals.forEach((v, i) => { dv.setUint32(transTab + i * 8, v.length, true); dv.setUint32(transTab + i * 8 + 4, off, true); buf.set(v, off); off += v.length + 1 })
  return buf
}

export function parseMo(b: Uint8Array): Catalog {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const magic = dv.getUint32(0, true); const le = magic === 0x950412de
  if (!le && dv.getUint32(0, false) !== 0x950412de) throw new Error('Not a gettext MO file (wrong magic number).')
  const u32 = (o: number) => dv.getUint32(o, le)
  const N = u32(8), ot = u32(12), tt = u32(16)
  const str = (tab: number, i: number) => { const len = u32(tab + i * 8), o = u32(tab + i * 8 + 4); return td.decode(b.subarray(o, o + len)) }
  let headers: Record<string, string> = {}; const entries: Entry[] = []
  for (let i = 0; i < N; i++) {
    let k = str(ot, i); const v = str(tt, i)
    if (k === '') { headers = parseHeaders(v); continue }
    const e: Entry = { id: '', str: [] }
    const ci = k.indexOf('\x04'); if (ci >= 0) { e.ctx = k.slice(0, ci); k = k.slice(ci + 1) }
    const pi = k.indexOf('\0'); if (pi >= 0) { e.id = k.slice(0, pi); e.plural = k.slice(pi + 1); e.str = v.split('\0') } else { e.id = k; e.str = [v] }
    entries.push(e)
  }
  return { headers, entries }
}

export function toRows(c: Catalog, maxPlurals = 2): string[][] {
  const n = Math.max(1, maxPlurals, ...c.entries.map((e) => e.str.length))
  const head = ['context', 'msgid', 'msgid_plural', ...Array.from({ length: n }, (_, i) => (i ? `msgstr[${i}]` : 'msgstr')), 'comments', 'references', 'flags']
  return [head, ...c.entries.map((e) => [e.ctx ?? '', e.id, e.plural ?? '', ...Array.from({ length: n }, (_, i) => e.str[i] ?? ''), [...(e.comments ?? []), ...(e.extracted ?? [])].join(' | '), (e.refs ?? []).join(' '), (e.flags ?? []).join(', ')])]
}

export function fromRows(rows: string[][]): Catalog {
  const [head, ...data] = rows; const idx = (k: string) => head.findIndex((h) => h.trim().toLowerCase() === k)
  const iId = idx('msgid') >= 0 ? idx('msgid') : 0
  if (iId < 0) throw new Error('The CSV needs a msgid column.')
  const iCtx = idx('context'), iPl = idx('msgid_plural'), iCm = idx('comments'), iRf = idx('references'), iFl = idx('flags')
  const strCols = head.map((h, i) => [h.trim().toLowerCase(), i] as const).filter(([h]) => /^msgstr(\[\d+\])?$/.test(h)).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
  const fallback = strCols.length ? strCols : [['msgstr', iId + 1] as const]
  return { headers: { 'Content-Type': 'text/plain; charset=UTF-8', 'Content-Transfer-Encoding': '8bit' }, entries: data.filter((r) => r[iId]).map((r) => {
    const e: Entry = { id: r[iId], str: fallback.map(([, i]) => r[i] ?? '') }
    if (iCtx >= 0 && r[iCtx]) e.ctx = r[iCtx]
    if (iPl >= 0 && r[iPl]) e.plural = r[iPl]; else e.str = [e.str[0] ?? '']
    if (iCm >= 0 && r[iCm]) e.comments = r[iCm].split(' | ')
    if (iRf >= 0 && r[iRf]) e.refs = r[iRf].split(/\s+/)
    if (iFl >= 0 && r[iFl]) e.flags = r[iFl].split(/,\s*/)
    return e
  }) }
}

export function toJsonMap(c: Catalog) { const o: Record<string, string | string[]> = {}; for (const e of c.entries) o[(e.ctx ? e.ctx + '|' : '') + e.id] = e.plural !== undefined ? e.str : e.str[0] ?? ''; return o }
export function stats(c: Catalog) { const total = c.entries.length; const done = c.entries.filter((e) => e.str.length && e.str.every((s) => s)).length; const fuzzy = c.entries.filter((e) => e.flags?.includes('fuzzy')).length; return { total, done, fuzzy, empty: total - done } }
