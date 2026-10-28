/* Pure helpers for reading XPS / OpenXPS fixed pages. No DOM, so they run in Node tests
 * (scripts/tests/b1/xps.test.mjs). Units are XPS units: 1/96 inch. */

export type Mat = [number, number, number, number, number, number]
export const IDENT: Mat = [1, 0, 0, 1, 0, 0]
export const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
]
export const apply = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

/** XPS matrix "m11,m12,m21,m22,offsetX,offsetY" (SVG order a,b,c,d,e,f). */
export function parseMatrix(s: string | null | undefined): Mat {
  if (!s) return IDENT
  const n = s.trim().split(/[\s,]+/).map(Number)
  return n.length === 6 && n.every(Number.isFinite) ? (n as Mat) : IDENT
}

export interface Color { css: string; alpha: number }
/** XPS colors: #RGB? no. #RRGGBB, #AARRGGBB, sc#R,G,B or sc#A,R,G,B (scRGB floats), ContextColor (unsupported, approximated). */
export function parseColor(s: string | null | undefined): Color | null {
  if (!s) return null
  const t = s.trim()
  let m = /^#([0-9a-f]{8})$/i.exec(t)
  if (m) { const v = m[1]; return { css: '#' + v.slice(2).toLowerCase(), alpha: parseInt(v.slice(0, 2), 16) / 255 } }
  m = /^#([0-9a-f]{6})$/i.exec(t)
  if (m) return { css: '#' + m[1].toLowerCase(), alpha: 1 }
  m = /^sc#\s*(.+)$/i.exec(t)
  if (m) {
    const n = m[1].split(/[\s,]+/).map(Number)
    const [a, r, g, b] = n.length === 4 ? n : [1, ...n]
    // scRGB is linear light; convert to sRGB gamma
    const enc = (c: number) => { const x = Math.max(0, Math.min(1, c)); return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)) }
    const hex = (v: number) => v.toString(16).padStart(2, '0')
    return { css: `#${hex(enc(r))}${hex(enc(g))}${hex(enc(b))}`, alpha: Math.max(0, Math.min(1, a)) }
  }
  if (/^ContextColor/i.test(t)) {
    // ContextColor profile a,c1,c2,... : treat the last three numbers as RGB 0..1 when present
    const n = t.replace(/^ContextColor\s+\S+\s*/i, '').split(/[\s,]+/).map(Number).filter(Number.isFinite)
    if (n.length >= 4) { const [a, r, g, b] = n; const hx = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0'); return { css: `#${hx(r)}${hx(g)}${hx(b)}`, alpha: a } }
    return { css: '#000000', alpha: 1 }
  }
  return null
}

/** Abbreviated geometry syntax to SVG path data. Returns the fill rule from the optional F0/F1 prefix. */
export function geometryToSvg(s: string | null | undefined): { d: string; rule: 'evenodd' | 'nonzero' } {
  if (!s) return { d: '', rule: 'evenodd' }
  let t = s.trim(), rule: 'evenodd' | 'nonzero' = 'evenodd'
  const m = /^F\s*([01])/i.exec(t)
  if (m) { rule = m[1] === '1' ? 'nonzero' : 'evenodd'; t = t.slice(m[0].length) }
  // XPS and SVG share M L H V C Q S A Z (and lower-case relative forms); commas are fine in SVG too.
  return { d: t.replace(/\s+/g, ' ').trim(), rule }
}

export interface GlyphEntry { gid?: number; advance?: number; u?: number; v?: number; cluster?: [number, number] }
/** Glyphs Indices: "(c:g)gid,advance,uOffset,vOffset;..." */
export function parseIndices(s: string | null | undefined): GlyphEntry[] {
  if (!s) return []
  return s.split(';').map((part) => {
    const e: GlyphEntry = {}
    let p = part.trim()
    const cm = /^\((\d+)(?::(\d+))?\)/.exec(p)
    if (cm) { e.cluster = [+cm[1], cm[2] ? +cm[2] : 1]; p = p.slice(cm[0].length) }
    const f = p.split(',')
    if (f[0]?.trim()) e.gid = +f[0]
    if (f[1]?.trim()) e.advance = +f[1]
    if (f[2]?.trim()) e.u = +f[2]
    if (f[3]?.trim()) e.v = +f[3]
    return e
  })
}

/** UnicodeString may start with "{}" as an escape for strings beginning with "{". */
export const unescapeUnicode = (s: string | null | undefined) => (s ? s.replace(/^\{\}/, '') : '')

export interface FontMetrics { unitsPerEm: number; advances: Uint16Array; cmap: Map<number, number>; isTrueType: boolean }

/** Read just enough of an OpenType font for glyph advances and a Unicode cmap. */
export function readFontMetrics(buf: Uint8Array): FontMetrics | null {
  try {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    let off = 0
    const tag0 = dv.getUint32(0)
    if (tag0 === 0x74746366) off = dv.getUint32(12) // 'ttcf': first font
    const num = dv.getUint16(off + 4)
    const tables = new Map<string, number>()
    for (let i = 0; i < num; i++) {
      const r = off + 12 + i * 16
      const tag = String.fromCharCode(buf[r], buf[r + 1], buf[r + 2], buf[r + 3])
      tables.set(tag, dv.getUint32(r + 8))
    }
    const head = tables.get('head'), hhea = tables.get('hhea'), hmtx = tables.get('hmtx'), maxp = tables.get('maxp')
    if (head === undefined || hhea === undefined || hmtx === undefined || maxp === undefined) return null
    const unitsPerEm = dv.getUint16(head + 18) || 1000
    const nh = dv.getUint16(hhea + 34), ng = dv.getUint16(maxp + 4)
    const advances = new Uint16Array(ng)
    let last = 0
    for (let g = 0; g < ng; g++) { if (g < nh) last = dv.getUint16(hmtx + g * 4); advances[g] = last }
    const cmap = new Map<number, number>()
    const cm = tables.get('cmap')
    if (cm !== undefined) {
      const n = dv.getUint16(cm + 2)
      let best = -1, bestFmt = 0
      for (let i = 0; i < n; i++) {
        const pid = dv.getUint16(cm + 4 + i * 8), eid = dv.getUint16(cm + 6 + i * 8), so = cm + dv.getUint32(cm + 8 + i * 8)
        const fmt = dv.getUint16(so)
        const good = (pid === 3 && (eid === 1 || eid === 10 || eid === 0)) || pid === 0
        if (good && (fmt === 12 || (fmt === 4 && bestFmt !== 12))) { best = so; bestFmt = fmt }
      }
      if (best >= 0 && bestFmt === 4) {
        const segX2 = dv.getUint16(best + 6), seg = segX2 / 2
        const ends = best + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ro = deltas + segX2
        for (let s = 0; s < seg; s++) {
          const end = dv.getUint16(ends + s * 2), start = dv.getUint16(starts + s * 2), delta = dv.getInt16(deltas + s * 2), rOff = dv.getUint16(ro + s * 2)
          for (let c = start; c <= end && c !== 0xffff; c++) {
            let gid: number
            if (rOff === 0) gid = (c + delta) & 0xffff
            else { const gi = ro + s * 2 + rOff + (c - start) * 2; gid = dv.getUint16(gi); if (gid) gid = (gid + delta) & 0xffff }
            if (gid) cmap.set(c, gid)
          }
        }
      } else if (best >= 0 && bestFmt === 12) {
        const groups = dv.getUint32(best + 12)
        for (let i = 0; i < groups && i < 20000; i++) {
          const g = best + 16 + i * 12
          const sc = dv.getUint32(g), ec = dv.getUint32(g + 4), sg = dv.getUint32(g + 8)
          for (let c = sc; c <= ec && c - sc < 65536; c++) cmap.set(c, sg + (c - sc))
        }
      }
    }
    return { unitsPerEm, advances, cmap, isTrueType: tables.has('glyf') }
  } catch { return null }
}

/** Obfuscated fonts (.odttf): the first 32 bytes are XORed with the GUID in the part name. */
export function deobfuscateFont(data: Uint8Array, partName: string): Uint8Array {
  const hex = (partName.split('/').pop() || '').replace(/\.[^.]*$/, '').replace(/[^0-9a-f]/gi, '')
  if (hex.length !== 32) return data
  const key = new Uint8Array(16)
  for (let i = 0; i < 16; i++) key[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  const out = data.slice()
  for (let i = 0; i < 16 && i + 16 < out.length; i++) { out[i] ^= key[15 - i]; out[i + 16] ^= key[15 - i] }
  return out
}

export interface PlacedChar { ch: string; x: number; y: number }
/** Lay out a Glyphs run: x/y positions (in the run's own space, origin at OriginX/OriginY) for each output character. */
export function layoutGlyphs(text: string, indices: GlyphEntry[], emSize: number, metrics: FontMetrics | null, sideways = false): { chars: PlacedChar[]; width: number } {
  const cps = Array.from(text)
  const chars: PlacedChar[] = []
  let x = 0, ci = 0
  const n = Math.max(indices.length, indices.length ? 0 : cps.length)
  const adv = (gid: number | undefined, cp: string | undefined) => {
    if (!metrics) return emSize * 0.5
    const g = gid ?? (cp ? metrics.cmap.get(cp.codePointAt(0)!) : undefined)
    if (g === undefined) return emSize * 0.5
    return ((metrics.advances[Math.min(g, metrics.advances.length - 1)] || 0) / metrics.unitsPerEm) * emSize
  }
  for (let i = 0; i < n; i++) {
    const e = indices[i] ?? {}
    const [cc, gc] = e.cluster ?? [1, 1]
    const clusterChars = cps.slice(ci, ci + cc)
    const u = ((e.u ?? 0) * emSize) / 100, v = ((e.v ?? 0) * emSize) / 100
    if (clusterChars.length) clusterChars.forEach((c, k) => chars.push({ ch: c, x: x + u + (k ? (k * adv(undefined, c)) : 0), y: -v }))
    ci += cc
    const a = e.advance !== undefined ? (e.advance * emSize) / 100 : adv(e.gid, clusterChars[0])
    x += a
    // a cluster of several glyphs: skip the extra glyph entries
    for (let k = 1; k < gc; k++) { const e2 = indices[i + k]; if (!e2) break; x += e2.advance !== undefined ? (e2.advance * emSize) / 100 : adv(e2.gid, undefined) }
    if (gc > 1) i += gc - 1
  }
  // leftover characters without index entries
  for (; ci < cps.length; ci++) { chars.push({ ch: cps[ci], x, y: 0 }); x += adv(undefined, cps[ci]) }
  void sideways
  return { chars, width: x }
}

/** Resolve a part reference against the part that references it. Returns a zip path without a leading slash. */
export function resolvePart(base: string, ref: string): string {
  const clean = ref.split('#')[0]
  if (clean.startsWith('/')) return normalize(clean.slice(1))
  const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : ''
  return normalize(dir + clean)
}
function normalize(p: string) {
  const out: string[] = []
  for (const s of decodeURIComponent(p).replace(/\\/g, '/').split('/')) { if (s === '..') out.pop(); else if (s && s !== '.') out.push(s) }
  return out.join('/')
}
