/* Font helpers for round 14: load any font into opentype.js, SVG path normalising for icon fonts, bitmap atlas packing. */
import { flattenPath, parseTransform, mul, IDENT, shapeToPath, type Mat } from './cad.ts'

/** Open TTF, OTF, WOFF, WOFF2 or EOT with opentype.js (WOFF2 and EOT go through fonteditor-core first). */
export async function openFont(buf: ArrayBuffer, name: string): Promise<any> {
  const ot: any = await import('opentype.js')
  const parse = ot.parse ?? ot.default?.parse
  const tag = String.fromCharCode(...new Uint8Array(buf.slice(0, 4)))
  if (tag === 'wOF2' || /\.eot$/i.test(name)) {
    const { readFont, writeFont } = await import('@/lib/b2/fonts')
    const { font } = await readFont(buf, name)
    const ttf = (await writeFont(font, 'ttf')) as Uint8Array
    return parse(ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength))
  }
  return parse(buf)
}

/* ---------------- SVG to absolute commands (for icon fonts) ---------------- */
export type Cmd = { t: 'M' | 'L' | 'C' | 'Q' | 'Z'; p: number[] }
const A = (m: Mat, x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

/** Path data to absolute M/L/C/Q/Z with a transform applied. Arcs become cubic curves. */
export function normalizePath(d: string, m: Mat = IDENT): Cmd[] {
  const toks = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? []
  const out: Cmd[] = []
  let i = 0, cmd = '', cx = 0, cy = 0, sx = 0, sy = 0, lc: number[] | null = null, lq: number[] | null = null
  const n = () => Number(toks[i++])
  const emit = (t: Cmd['t'], pts: number[]) => { const p: number[] = []; for (let k = 0; k < pts.length; k += 2) p.push(...A(m, pts[k], pts[k + 1])); out.push({ t, p }) }
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++]
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase()
    const ox = rel ? cx : 0, oy = rel ? cy : 0
    if (C === 'M') { cx = ox + n(); cy = oy + n(); sx = cx; sy = cy; emit('M', [cx, cy]); cmd = rel ? 'l' : 'L'; lc = lq = null }
    else if (C === 'Z') { out.push({ t: 'Z', p: [] }); cx = sx; cy = sy; lc = lq = null; if (i < toks.length && !/[a-zA-Z]/.test(toks[i])) cmd = 'L' }
    else if (C === 'L') { cx = ox + n(); cy = oy + n(); emit('L', [cx, cy]); lc = lq = null }
    else if (C === 'H') { cx = (rel ? cx : 0) + n(); emit('L', [cx, cy]); lc = lq = null }
    else if (C === 'V') { cy = (rel ? cy : 0) + n(); emit('L', [cx, cy]); lc = lq = null }
    else if (C === 'C') { const p = [ox + n(), oy + n(), ox + n(), oy + n(), ox + n(), oy + n()]; emit('C', p); lc = [p[2], p[3]]; cx = p[4]; cy = p[5]; lq = null }
    else if (C === 'S') { const c1: number[] = lc ? [2 * cx - lc[0], 2 * cy - lc[1]] : [cx, cy]; const p: number[] = [c1[0], c1[1], ox + n(), oy + n(), ox + n(), oy + n()]; emit('C', p); lc = [p[2], p[3]]; cx = p[4]; cy = p[5]; lq = null }
    else if (C === 'Q') { const p = [ox + n(), oy + n(), ox + n(), oy + n()]; emit('Q', p); lq = [p[0], p[1]]; cx = p[2]; cy = p[3]; lc = null }
    else if (C === 'T') { const c1: number[] = lq ? [2 * cx - lq[0], 2 * cy - lq[1]] : [cx, cy]; const p: number[] = [c1[0], c1[1], ox + n(), oy + n()]; emit('Q', p); lq = [p[0], p[1]]; cx = p[2]; cy = p[3]; lc = null }
    else if (C === 'A') {
      const rx = n(), ry = n(), phi = n(), la = n(), sw = n(), x = ox + n(), y = oy + n()
      // reuse the flattener for the arc geometry, then emit as line segments in a cubic friendly way
      const seg = flattenPath(`M${cx} ${cy}A${rx} ${ry} ${phi} ${la} ${sw} ${x} ${y}`, 0.25)[0]
      if (seg) for (const [px, py] of seg.pts.slice(1)) emit('L', [px, py])
      cx = x; cy = y; lc = lq = null
    } else i++
  }
  return out
}

export interface IconGlyph { name: string; cmds: Cmd[]; width: number }
/** Read an SVG icon and fit it into a font em box (units per em, y up). */
export function svgIconToGlyph(svgText: string, name: string, em = 1000, ascent = 850): IconGlyph {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  if (doc.getElementsByTagName('parsererror')[0]) throw new Error(`${name}: not a valid SVG`)
  const root = doc.documentElement
  let vb = root.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)
  if (!vb || vb.length !== 4) vb = [0, 0, parseFloat(root.getAttribute('width') ?? '24') || 24, parseFloat(root.getAttribute('height') ?? '24') || 24]
  const s = em / Math.max(vb[2], vb[3])
  // map viewBox to font space: x right, y up, baseline at descent
  const base: Mat = [s, 0, 0, -s, -vb[0] * s + (em - vb[2] * s) / 2, ascent + vb[1] * s]
  const cmds: Cmd[] = []
  const walk = (el: Element, mat: Mat) => {
    const tag = el.nodeName.toLowerCase()
    if (['defs', 'clippath', 'mask', 'title', 'desc', 'style', 'script', 'metadata'].includes(tag)) return
    if (el.getAttribute('fill') === 'none' && el.getAttribute('stroke') && !el.children.length) return // stroke-only shapes have no area
    const M = mul(mat, parseTransform(el.getAttribute('transform')))
    const num = (k: string) => parseFloat(el.getAttribute(k) ?? '0') || 0
    let d: string | null = tag === 'path' ? el.getAttribute('d') : null
    if (tag === 'polygon' || tag === 'polyline') { const p = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number); const pts: string[] = []; for (let k = 0; k + 1 < p.length; k += 2) pts.push(`${p[k]} ${p[k + 1]}`); if (pts.length > 1) d = 'M' + pts.join(' L') + ' Z' }
    else if (!d) d = shapeToPath(tag, num)
    if (d) cmds.push(...normalizePath(d, M))
    for (const c of Array.from(el.children)) walk(c, M)
  }
  walk(root, base)
  if (!cmds.length) throw new Error(`${name}: no filled shapes found (stroke only icons need to be converted to outlines first)`)
  return { name, cmds, width: em }
}

export const iconName = (file: string) => file.replace(/\.svg$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'icon'

/* ---------------- atlas ---------------- */
export interface Box2 { id: number; w: number; h: number; x?: number; y?: number }
/** Shelf packer: tallest first into rows of a power of two width. Returns the atlas size. */
export function packShelves(boxes: Box2[], maxW = 4096): { w: number; h: number } {
  const area = boxes.reduce((a, b) => a + b.w * b.h, 0)
  let W = 64; while (W * W < area * 1.2 && W < maxW) W *= 2
  W = Math.max(W, ...boxes.map((b) => b.w))
  const sorted = [...boxes].sort((a, b) => b.h - a.h)
  let x = 0, y = 0, row = 0
  for (const b of sorted) { if (x + b.w > W) { x = 0; y += row; row = 0 } b.x = x; b.y = y; x += b.w; row = Math.max(row, b.h) }
  let H = 1; while (H < y + row) H *= 2
  return { w: W, h: H }
}
