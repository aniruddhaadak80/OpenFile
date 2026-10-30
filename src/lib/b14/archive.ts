/* Archive helpers for round 14: file split and join, ZIP salvage and checksum manifests. Pure where possible, unit tested. */
import { inflateSync, zipSync, type Zippable } from 'fflate'

/* ---------------- split / join ---------------- */
export function partSizes(total: number, o: { mode: 'size'; size: number } | { mode: 'count'; count: number }): number[] {
  if (total <= 0) return [0]
  const size = o.mode === 'size' ? Math.max(1, Math.floor(o.size)) : Math.ceil(total / Math.max(1, Math.floor(o.count)))
  const out: number[] = []
  for (let at = 0; at < total; at += size) out.push(Math.min(size, total - at))
  return out
}
export const partName = (name: string, i: number, total: number, style: 'num' | 'part' = 'num') => (style === 'num' ? `${name}.${String(i + 1).padStart(Math.max(3, String(total).length), '0')}` : `${name}.part${String(i + 1).padStart(String(total).length, '0')}`)
/** Sort part files by their trailing number and guess the joined name. */
export function orderParts(names: string[]): { order: number[]; joined: string; gaps: number[] } {
  const info = names.map((n, i) => { const m = n.match(/^(.*?)(?:\.part(\d+)|\.(\d{2,4})|\.z(\d{2})|\.(zip))$/i); const num = m ? +(m[2] ?? m[3] ?? m[4] ?? 9999) : NaN; return { i, base: m ? m[1] : n, num } })
  info.sort((a, b) => (Number.isNaN(a.num) ? 1e9 : a.num) - (Number.isNaN(b.num) ? 1e9 : b.num) || names[a.i].localeCompare(names[b.i], undefined, { numeric: true }))
  const nums = info.map((x) => x.num).filter((n) => !Number.isNaN(n) && n !== 9999)
  const gaps: number[] = []
  if (nums.length) for (let n = nums[0]; n <= nums[nums.length - 1]; n++) if (!nums.includes(n)) gaps.push(n)
  return { order: info.map((x) => x.i), joined: info[0]?.base ?? 'joined.bin', gaps }
}

/* ---------------- ZIP salvage ---------------- */
export interface Salvaged { name: string; data: Uint8Array | null; method: number; size: number; ok: boolean; note: string; mtime?: Date }
const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8)
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
const dosDate = (t: number, d: number) => new Date(((d >> 9) & 0x7f) + 1980, ((d >> 5) & 0xf) - 1, d & 0x1f, (t >> 11) & 0x1f, (t >> 5) & 0x3f, (t & 0x1f) * 2)

/** Walk local file headers from the start of the file, ignoring the central directory. Works on truncated or damaged ZIPs. */
export function salvageZip(b: Uint8Array): Salvaged[] {
  const out: Salvaged[] = []
  const dec = new TextDecoder()
  let p = 0
  const next = (from: number) => { for (let i = from; i < b.length - 3; i++) if (b[i] === 0x50 && b[i + 1] === 0x4b && ((b[i + 2] === 3 && b[i + 3] === 4) || (b[i + 2] === 1 && b[i + 3] === 2) || (b[i + 2] === 7 && b[i + 3] === 8))) return i; return b.length }
  while (p < b.length - 30) {
    if (!(b[p] === 0x50 && b[p + 1] === 0x4b && b[p + 2] === 3 && b[p + 3] === 4)) { const n = next(p + 1); if (n >= b.length) break; if (b[n + 2] !== 3) { p = n + 4; continue } p = n; continue }
    const flags = u16(b, p + 6), method = u16(b, p + 8), mt = u16(b, p + 10), md = u16(b, p + 12)
    let csize = u32(b, p + 18); const usize = u32(b, p + 22)
    const nl = u16(b, p + 26), xl = u16(b, p + 28)
    const name = dec.decode(b.subarray(p + 30, p + 30 + nl))
    const start = p + 30 + nl + xl
    if (flags & 1) { out.push({ name, data: null, method, size: usize, ok: false, note: 'Encrypted, cannot be recovered without the password' }); p = start + csize; continue }
    let end = start + csize
    if ((flags & 8) || csize === 0 || end > b.length) {
      // sizes unknown or file cut short: read until the next header
      end = Math.min(next(start), b.length)
      csize = end - start
    }
    const raw = b.subarray(start, Math.min(end, b.length))
    let data: Uint8Array | null = null, ok = false, note = ''
    try {
      if (method === 0) { data = raw.slice(0, usize || raw.length); ok = !usize || data.length === usize; note = ok ? 'Stored' : 'Stored, cut short' }
      else if (method === 8) { data = inflateSync(raw); ok = !usize || data.length === usize || (flags & 8) !== 0; note = ok ? 'Recovered' : 'Partly recovered' }
      else note = `Compression method ${method} is not supported`
    } catch {
      // try to keep what inflates before the damage
      try { data = inflateSync(raw.subarray(0, Math.max(0, raw.length - 1))); note = 'Partly recovered (data was damaged)' } catch { note = 'Damaged, could not be decompressed' }
    }
    if (!name.endsWith('/')) out.push({ name, data, method, size: data?.length ?? 0, ok, note, mtime: dosDate(mt, md) })
    p = Math.max(end, p + 30)
    if ((flags & 8) && b[p] === 0x50 && b[p + 1] === 0x4b && b[p + 2] === 7 && b[p + 3] === 8) p += 16
  }
  return out
}
export function rebuildZip(items: Salvaged[]): Uint8Array {
  const z: Zippable = {}
  const used = new Set<string>()
  for (const it of items) {
    if (!it.data) continue
    let n = it.name || 'file'
    let k = 2
    while (used.has(n)) n = it.name.replace(/(\.[^./]+)?$/, `-${k++}$1`)
    used.add(n)
    z[n] = [it.data, { level: 6, mtime: it.mtime && !Number.isNaN(it.mtime.getTime()) && it.mtime.getFullYear() >= 1980 ? it.mtime : new Date() }]
  }
  return zipSync(z)
}

/* ---------------- checksum manifests ---------------- */
export type Algo = 'md5' | 'sha1' | 'sha256' | 'sha512' | 'crc32'
export interface ManifestLine { hash: string; path: string; algo?: Algo }
export function writeManifest(rows: { path: string; hash: string }[], algo: Algo, style: 'gnu' | 'bsd' | 'sfv'): string {
  if (style === 'sfv' || algo === 'crc32') return '; Generated by OpenFile\n' + rows.map((r) => `${r.path} ${r.hash.toUpperCase()}`).join('\n') + '\n'
  if (style === 'bsd') return rows.map((r) => `${algo.toUpperCase()} (${r.path}) = ${r.hash}`).join('\n') + '\n'
  return rows.map((r) => `${r.hash}  ${r.path}`).join('\n') + '\n'
}
const byLen: Record<number, Algo> = { 8: 'crc32', 32: 'md5', 40: 'sha1', 64: 'sha256', 128: 'sha512' }
/** Read GNU (hash  path), BSD (SHA256 (path) = hash) and SFV (path CRC32) lines. */
export function parseManifest(text: string): ManifestLine[] {
  const out: ManifestLine[] = []
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const l = raw.trim()
    if (!l || l.startsWith(';') || l.startsWith('#')) continue
    let m = l.match(/^(MD5|SHA1|SHA256|SHA512|SHA-256|SHA-1|SHA-512|CRC32)\s*\((.+)\)\s*=\s*([0-9a-fA-F]+)$/i)
    if (m) { out.push({ algo: m[1].toLowerCase().replace('-', '') as Algo, path: m[2], hash: m[3].toLowerCase() }); continue }
    m = l.match(/^([0-9a-fA-F]{8}|[0-9a-fA-F]{32}|[0-9a-fA-F]{40}|[0-9a-fA-F]{64}|[0-9a-fA-F]{128})\s+[ *]?(.+)$/)
    if (m) { out.push({ hash: m[1].toLowerCase(), path: m[2].replace(/^\.\//, ''), algo: byLen[m[1].length] }); continue }
    m = l.match(/^(.+?)\s+([0-9a-fA-F]{8})$/)
    if (m) out.push({ path: m[1], hash: m[2].toLowerCase(), algo: 'crc32' })
  }
  return out
}
export const baseOf = (p: string) => p.replace(/\\/g, '/').split('/').pop()!
