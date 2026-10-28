import { El, FONT, FontFamily } from './types'
import { Cmd, P, rng, roughLine, roughCurve, roughPolygon, polyCmds, curveThrough, hachureLines, cmdsToSvg, cmdsToPath2D } from './rough'
import { shapeOutline, linePts, bounds, sampleCatmull } from './geometry'
import { getStroke, strokeToPath } from './freehand'
import { STENCIL_ICONS } from './icons'

export type Op =
  | { t: 'path'; cmds?: Cmd[]; d?: string; stroke?: string; fill?: string; width?: number; dash?: number[]; alpha?: number }
  | { t: 'text'; lines: string[]; x: number; y: number; size: number; family: FontFamily; color: string; align: 'left' | 'center' | 'right'; weight?: number; alpha?: number }
  | { t: 'image'; src: string; x: number; y: number; w: number; h: number }
  | { t: 'icon'; d: string; x: number; y: number; size: number; color: string; width: number }
  | { t: 'shadow'; x: number; y: number; w: number; h: number; r: number }

export const LINE_H = 1.25
let mctx: CanvasRenderingContext2D | null = null
function mc() { if (!mctx) mctx = document.createElement('canvas').getContext('2d')!; return mctx }
export const fontStr = (size: number, fam: FontFamily, weight = 400) => `${fam === 'hand' ? Math.max(weight, 500) : weight} ${size}px ${FONT[fam]}`
export function measure(text: string, size: number, fam: FontFamily) {
  const c = mc(); c.font = fontStr(size, fam)
  const lines = (text || ' ').split('\n')
  return { w: Math.max(4, ...lines.map((l) => c.measureText(l || ' ').width)), h: lines.length * size * LINE_H, lines }
}
export function wrap(text: string, maxW: number, size: number, fam: FontFamily, weight = 400) {
  const c = mc(); c.font = fontStr(size, fam, weight)
  const out: string[] = []
  for (const para of (text ?? '').split('\n')) {
    const words = para.split(/(\s+)/)
    let line = ''
    for (const w of words) {
      const test = line + w
      if (c.measureText(test).width > maxW && line.trim()) { out.push(line.trimEnd()); line = w.trimStart() }
      else line = test
      // hard-break very long words
      while (c.measureText(line).width > maxW && line.length > 1) {
        let i = line.length - 1; while (i > 1 && c.measureText(line.slice(0, i)).width > maxW) i--
        out.push(line.slice(0, i)); line = line.slice(i)
      }
    }
    out.push(line)
  }
  return out
}

const dashFor = (el: El): number[] | undefined => el.strokeStyle === 'dashed' ? [8 + el.strokeWidth * 1.5, 7 + el.strokeWidth] : el.strokeStyle === 'dotted' ? [0.5, 5 + el.strokeWidth * 1.6] : undefined
const hasFill = (el: El) => el.fillStyle !== 'none' && el.fill && el.fill !== 'transparent'

function fillOps(el: El, poly: P[], r: () => number): Op[] {
  if (!hasFill(el)) return []
  if (el.fillStyle === 'solid') return [{ t: 'path', cmds: polyCmds(poly, true), fill: el.fill }]
  const gap = Math.max(5, el.strokeWidth * 4.5)
  const ang = [-41, ...(el.fillStyle === 'cross' ? [49] : [])]
  const cmds: Cmd[] = []
  for (const a of ang) for (const [p, q] of hachureLines(poly, gap, a)) {
    if (el.rough) cmds.push(...roughLine(p[0], p[1], q[0], q[1], el.rough * 0.7, r, 1))
    else cmds.push(['M', p[0], p[1]], ['L', q[0], q[1]])
  }
  return [{ t: 'path', cmds, stroke: el.fill, width: Math.max(1, el.strokeWidth / 2) }]
}

function labelOps(el: El, boxW: number, cx: number, cy: number): Op[] {
  if (!el.text) return []
  const size = el.fontSize ?? 20, fam = el.fontFamily ?? 'hand'
  const lines = wrap(el.text, Math.max(20, boxW), size, fam)
  const h = lines.length * size * LINE_H
  return [{ t: 'text', lines, x: cx, y: cy - h / 2, size, family: fam, color: el.stroke, align: 'center' }]
}

function headOps(el: El, tip: P, from: P, head: string): Op[] {
  if (!head || head === 'none') return []
  const ang = Math.atan2(tip[1] - from[1], tip[0] - from[0])
  const segLen = Math.hypot(tip[0] - from[0], tip[1] - from[1])
  const L = Math.min(Math.max(12, el.strokeWidth * 4 + 10), Math.max(8, segLen * 0.6))
  const sw = el.strokeWidth
  const at = (a: number, l = L): P => [tip[0] - Math.cos(ang + a) * l, tip[1] - Math.sin(ang + a) * l]
  const r = rng(el.seed + 7)
  if (head === 'arrow') {
    const a = at(0.45), b = at(-0.45)
    const cmds: Cmd[] = el.rough ? [...roughLine(a[0], a[1], tip[0], tip[1], el.rough * 0.6, r, 2), ...roughLine(b[0], b[1], tip[0], tip[1], el.rough * 0.6, r, 2)] : [['M', a[0], a[1]], ['L', tip[0], tip[1]], ['L', b[0], b[1]]]
    return [{ t: 'path', cmds, stroke: el.stroke, width: sw }]
  }
  if (head === 'triangle') { const a = at(0.42), b = at(-0.42); return [{ t: 'path', cmds: [['M', tip[0], tip[1]], ['L', a[0], a[1]], ['L', b[0], b[1]], ['Z']], fill: el.stroke, stroke: el.stroke, width: sw }] }
  if (head === 'bar') { const a: P = [tip[0] + Math.cos(ang + Math.PI / 2) * L * 0.5, tip[1] + Math.sin(ang + Math.PI / 2) * L * 0.5], b: P = [tip[0] - Math.cos(ang + Math.PI / 2) * L * 0.5, tip[1] - Math.sin(ang + Math.PI / 2) * L * 0.5]; return [{ t: 'path', cmds: [['M', a[0], a[1]], ['L', b[0], b[1]]], stroke: el.stroke, width: sw }] }
  if (head === 'dot') { const rad = Math.max(3, sw * 1.8); const pts: P[] = []; for (let i = 0; i < 16; i++) pts.push([tip[0] + Math.cos((i / 16) * Math.PI * 2) * rad, tip[1] + Math.sin((i / 16) * Math.PI * 2) * rad]); return [{ t: 'path', cmds: polyCmds(pts, true), fill: el.stroke }] }
  return []
}

const cache = new WeakMap<El, Op[]>()
export function elementOps(el: El): Op[] {
  const c = cache.get(el); if (c) return c
  const ops = build(el); cache.set(el, ops); return ops
}

function build(el: El): Op[] {
  const r = rng(el.seed)
  const dash = dashFor(el)
  const passes = dash ? 1 : 2
  const strokeOp = (cmds: Cmd[]): Op => ({ t: 'path', cmds, stroke: el.stroke, width: el.strokeWidth, dash })
  switch (el.type) {
    case 'shape': {
      const fine = shapeOutline(el, true)
      const subs = el.rough ? shapeOutline(el, false) : fine
      const ops: Op[] = [...fillOps(el, fine[0].pts, r)]
      if (el.kind === 'cylinder' && hasFill(el) && el.fillStyle === 'solid') { /* body already filled */ }
      for (const s of subs) {
        const cmds = !el.rough ? polyCmds(s.pts, s.closed) : s.smooth ? roughCurve(s.pts, s.closed, el.rough, r, passes) : roughPolygon(s.pts, s.closed, el.rough, r, passes)
        if (el.strokeWidth > 0 && el.stroke !== 'transparent') ops.push(strokeOp(cmds))
      }
      const bw = el.kind === 'diamond' ? el.w * 0.55 : el.kind === 'ellipse' ? el.w * 0.7 : el.kind === 'hexagon' || el.kind === 'parallelogram' ? el.w * 0.65 : el.w - 20
      ops.push(...labelOps(el, bw, el.x + el.w / 2, el.y + el.h / 2 - (el.kind === 'document' ? el.h * 0.05 : 0) + (el.kind === 'cylinder' ? Math.min(el.h * 0.15, el.w * 0.3) / 2 : 0)))
      return ops
    }
    case 'line': case 'arrow': {
      const raw = (el.points ?? []).map((p) => [el.x + p[0], el.y + p[1]] as P)
      if (raw.length < 2) return []
      const ops: Op[] = []
      const closed = el.type === 'line' && raw.length > 2 && Math.hypot(raw[0][0] - raw[raw.length - 1][0], raw[0][1] - raw[raw.length - 1][1]) < 1
      if (closed) ops.push(...fillOps(el, raw, r))
      const curved = el.roundness && raw.length > 2
      const cmds = !el.rough ? (curved ? curveThrough(raw, false) : polyCmds(raw, false)) : curved ? roughCurve(raw, false, el.rough, r, passes) : roughPolygon(raw, false, el.rough, r, passes)
      ops.push(strokeOp(cmds))
      if (el.type === 'arrow' || el.startHead || el.endHead) {
        const smp = curved ? sampleCatmull(raw, 12) : raw
        const n = smp.length
        const back = (arr: P[], tip: P) => { for (let i = arr.length - 1; i >= 0; i--) if (Math.hypot(arr[i][0] - tip[0], arr[i][1] - tip[1]) > 6) return arr[i]; return arr[0] }
        ops.push(...headOps(el, smp[n - 1], back(smp.slice(0, -1), smp[n - 1]), el.endHead ?? (el.type === 'arrow' ? 'arrow' : 'none')))
        ops.push(...headOps(el, smp[0], back(smp.slice(1).reverse(), smp[0]), el.startHead ?? 'none'))
      }
      return ops
    }
    case 'freedraw': {
      const pts = (el.points ?? []).map((p) => [el.x + p[0], el.y + p[1], p[2] ?? 0.5])
      const o = getStroke(pts, { size: el.strokeWidth * 2.4 + 1.5, thinning: 0.6, streamline: 0.4, simulatePressure: !pts.some((p) => p[2] !== 0.5), last: true })
      return [{ t: 'path', d: strokeToPath(o), fill: el.stroke }]
    }
    case 'text': {
      const size = el.fontSize ?? 20, fam = el.fontFamily ?? 'hand'
      const lines = (el.text ?? '').split('\n')
      const x = el.align === 'center' ? el.x + el.w / 2 : el.align === 'right' ? el.x + el.w : el.x
      return [{ t: 'text', lines, x, y: el.y, size, family: fam, color: el.stroke, align: el.align ?? 'left' }]
    }
    case 'sticky': {
      const pad = 16, size = el.fontSize ?? 22, fam = el.fontFamily ?? 'hand'
      const lines = wrap(el.text ?? '', el.w - pad * 2, size, fam)
      const ops: Op[] = [{ t: 'shadow', x: el.x, y: el.y, w: el.w, h: el.h, r: 4 }, { t: 'path', cmds: polyCmds([[el.x, el.y], [el.x + el.w, el.y], [el.x + el.w, el.y + el.h], [el.x, el.y + el.h]], true), fill: el.fill }]
      const x = el.align === 'left' ? el.x + pad : el.align === 'right' ? el.x + el.w - pad : el.x + el.w / 2
      const th = lines.length * size * LINE_H
      ops.push({ t: 'text', lines, x, y: el.y + Math.max(pad, (el.h - th) / 2), size, family: fam, color: el.stroke, align: el.align ?? 'center' })
      return ops
    }
    case 'image': return el.src ? [{ t: 'image', src: el.src, x: el.x, y: el.y, w: el.w, h: el.h }] : []
    case 'icon': {
      const ic = STENCIL_ICONS.find((i) => i.id === el.icon)
      const size = el.fontSize ?? 16
      const labelH = el.text ? size * LINE_H + 6 : 0
      const s = Math.max(8, Math.min(el.w, el.h - labelH) * 0.82)
      const ops: Op[] = []
      if (hasFill(el)) ops.push(...fillOps(el, roundRectPts(el.x, el.y, el.w, el.h, Math.min(16, el.w * 0.18)), r), { t: 'path', cmds: polyCmds(roundRectPts(el.x, el.y, el.w, el.h, Math.min(16, el.w * 0.18)), true), stroke: el.stroke, width: Math.max(1, el.strokeWidth / 2), alpha: 0.35 })
      if (ic) ops.push({ t: 'icon', d: ic.d, x: el.x + (el.w - s) / 2, y: el.y + (el.h - labelH - s) / 2 + (labelH ? 2 : 0), size: s, color: el.stroke, width: el.strokeWidth })
      if (el.text) ops.push({ t: 'text', lines: wrap(el.text, el.w + 40, size, el.fontFamily ?? 'normal').slice(0, 2), x: el.x + el.w / 2, y: el.y + el.h - labelH + 2, size, family: el.fontFamily ?? 'normal', color: el.stroke, align: 'center', weight: 500 })
      return ops
    }
    case 'table': {
      const size = el.fontSize ?? 16, fam = el.fontFamily ?? 'normal'
      const headH = size * 2.1, rowH = size * 1.8
      const rows = el.rows ?? []
      const ops: Op[] = []
      const box = roundRectPts(el.x, el.y, el.w, el.h, el.roundness ? 8 : 0)
      ops.push({ t: 'path', cmds: polyCmds(box, true), fill: '#ffffff', alpha: 0.98 })
      const head: P[] = [[el.x, el.y], [el.x + el.w, el.y], [el.x + el.w, el.y + headH], [el.x, el.y + headH]]
      ops.push({ t: 'path', cmds: polyCmds(el.roundness ? roundTop(el.x, el.y, el.w, headH, 8) : head, true), fill: el.fill && el.fill !== 'transparent' ? el.fill : '#a5d8ff' })
      const stroke = (cmds: Cmd[]) => ops.push(strokeOp(cmds))
      stroke(el.rough ? (el.roundness ? roughCurve(box, true, el.rough, r, passes) : roughPolygon(box, true, el.rough, r, passes)) : polyCmds(box, true))
      stroke(el.rough ? roughLine(el.x, el.y + headH, el.x + el.w, el.y + headH, el.rough, r, passes) : [['M', el.x, el.y + headH], ['L', el.x + el.w, el.y + headH]])
      ops.push({ t: 'text', lines: [el.text || 'table'], x: el.x + el.w / 2, y: el.y + (headH - size * LINE_H) / 2, size, family: fam, color: el.stroke, align: 'center', weight: 700 })
      rows.forEach((row, i) => {
        const y = el.y + headH + i * rowH
        if (i > 0) ops.push({ t: 'path', cmds: [['M', el.x + 8, y], ['L', el.x + el.w - 8, y]], stroke: el.stroke, width: 1, alpha: 0.18 })
        const m = row.match(/^(\S+)\s*(.*)$/) ?? [row, row, '']
        const isKey = /\b(PK|FK)\b/i.test(m[2])
        ops.push({ t: 'text', lines: [m[1]], x: el.x + 12, y: y + (rowH - size * LINE_H) / 2, size: size * 0.92, family: fam, color: el.stroke, align: 'left', weight: isKey ? 700 : 400 })
        if (m[2]) ops.push({ t: 'text', lines: [m[2]], x: el.x + el.w - 12, y: y + (rowH - size * LINE_H) / 2, size: size * 0.8, family: 'code', color: el.stroke, align: 'right', alpha: 0.6 })
      })
      return ops
    }
    case 'frame': {
      const pts: P[] = [[el.x, el.y], [el.x + el.w, el.y], [el.x + el.w, el.y + el.h], [el.x, el.y + el.h]]
      return [
        { t: 'path', cmds: polyCmds(roundRectPts(el.x, el.y, el.w, el.h, 8), true), stroke: '#a0a4b0', width: 1.5, fill: el.fill !== 'transparent' && el.fillStyle !== 'none' ? el.fill : undefined },
        { t: 'text', lines: [el.name || 'Frame'], x: pts[0][0] + 2, y: el.y - 22, size: 14, family: 'normal', color: '#868e96', align: 'left', weight: 500 },
      ]
    }
  }
  return []
}

export function tableHeight(el: El) { const s = el.fontSize ?? 16; return s * 2.1 + Math.max(1, (el.rows ?? []).length) * s * 1.8 }

function roundRectPts(x: number, y: number, w: number, h: number, r: number): P[] {
  if (!r) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
  const out: P[] = []
  const corner = (cx: number, cy: number, a0: number) => { for (let i = 0; i <= 6; i++) { const a = a0 + (i / 6) * (Math.PI / 2); out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]) } }
  corner(x + w - r, y + r, -Math.PI / 2); corner(x + w - r, y + h - r, 0); corner(x + r, y + h - r, Math.PI / 2); corner(x + r, y + r, Math.PI)
  return out
}
function roundTop(x: number, y: number, w: number, h: number, r: number): P[] {
  const out: P[] = []
  for (let i = 0; i <= 6; i++) { const a = Math.PI + (i / 6) * (Math.PI / 2); out.push([x + r + Math.cos(a) * r, y + r + Math.sin(a) * r]) }
  for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2); out.push([x + w - r + Math.cos(a) * r, y + r + Math.sin(a) * r]) }
  out.push([x + w, y + h], [x, y + h])
  return out
}

/* ---------------- colours for dark canvas ---------------- */
const darkCache = new Map<string, string>()
export function darkColor(c: string) {
  if (!c || c === 'transparent') return c
  const hit = darkCache.get(c); if (hit) return hit
  const m = c.match(/^#([0-9a-f]{3,8})$/i)
  if (!m) return c
  let h = m[1]; if (h.length <= 4) h = h.split('').map((x) => x + x).join('')
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  let hh = 0, s = 0
  if (max !== min) { const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min); hh = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; hh /= 6 }
  const L = 0.07 + (1 - l) * 0.86
  const S = s * 0.9
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S, p = 2 * L - q
  const f = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p }
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0')
  const out = '#' + toHex(f(hh + 1 / 3)) + toHex(f(hh)) + toHex(f(hh - 1 / 3)) + (h.length === 8 ? h.slice(6) : '')
  darkCache.set(c, out); return out
}

/* ---------------- canvas drawing ---------------- */
export type DrawOpts = { dark: boolean; images: Map<string, HTMLImageElement>; onImageLoad: () => void; skipTextOf?: string | null; erasing?: Set<string> }
const p2dCache = new WeakMap<object, Path2D>()
const iconCache = new Map<string, Path2D>()
export function drawElement(ctx: CanvasRenderingContext2D, el: El, o: DrawOpts) {
  const col = (c?: string) => (c && o.dark ? darkColor(c) : c)
  ctx.save()
  ctx.globalAlpha = (el.opacity ?? 100) / 100 * (o.erasing?.has(el.id) ? 0.25 : 1)
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  for (const op of elementOps(el)) {
    if (op.t === 'path') {
      let path = p2dCache.get(op)
      if (!path) { path = op.d ? new Path2D(op.d) : cmdsToPath2D(op.cmds!); p2dCache.set(op, path) }
      const a = ctx.globalAlpha
      if (op.alpha != null) ctx.globalAlpha = a * op.alpha
      if (op.fill) { ctx.fillStyle = col(op.fill)!; ctx.fill(path) }
      if (op.stroke) { ctx.strokeStyle = col(op.stroke)!; ctx.lineWidth = op.width ?? 1; ctx.setLineDash(op.dash ?? []); ctx.stroke(path) }
      ctx.globalAlpha = a
    } else if (op.t === 'text') {
      if (o.skipTextOf === el.id) continue
      const a = ctx.globalAlpha
      if (op.alpha != null) ctx.globalAlpha = a * op.alpha
      ctx.font = fontStr(op.size, op.family, op.weight); ctx.fillStyle = col(op.color)!; ctx.textAlign = op.align; ctx.textBaseline = 'top'
      op.lines.forEach((l, i) => ctx.fillText(l, op.x, op.y + i * op.size * LINE_H + op.size * (LINE_H - 1) / 2))
      ctx.globalAlpha = a
    } else if (op.t === 'image') {
      let img = o.images.get(op.src)
      if (!img) { img = new Image(); img.onload = o.onImageLoad; img.src = op.src; o.images.set(op.src, img) }
      if (img.complete && img.naturalWidth) ctx.drawImage(img, op.x, op.y, op.w, op.h)
      else { ctx.fillStyle = '#8882'; ctx.fillRect(op.x, op.y, op.w, op.h) }
    } else if (op.t === 'icon') {
      let p = iconCache.get(op.d); if (!p) { p = new Path2D(op.d); iconCache.set(op.d, p) }
      ctx.save(); ctx.translate(op.x, op.y); ctx.scale(op.size / 24, op.size / 24)
      ctx.strokeStyle = col(op.color)!; ctx.lineWidth = Math.max(1, op.width * 0.9); ctx.setLineDash([]); ctx.stroke(p); ctx.restore()
    } else if (op.t === 'shadow') {
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5; ctx.fillStyle = col('#ffffff')!
      ctx.beginPath(); ctx.roundRect(op.x + 2, op.y + 4, op.w - 4, op.h - 4, op.r); ctx.fill(); ctx.restore()
    }
  }
  ctx.restore()
}

/* ---------------- SVG export ---------------- */
const escX = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export function elementsToSvg(els: El[], o: { bg: string | null; dark: boolean; padding?: number }) {
  const pad = o.padding ?? 24
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const e of els) { const b = bounds(e); x1 = Math.min(x1, b.x1); y1 = Math.min(y1, b.y1 - (e.type === 'frame' ? 24 : 0)); x2 = Math.max(x2, b.x2); y2 = Math.max(y2, b.y2) }
  if (!isFinite(x1)) { x1 = y1 = 0; x2 = y2 = 100 }
  const W = Math.ceil(x2 - x1 + pad * 2), H = Math.ceil(y2 - y1 + pad * 2)
  const col = (c?: string) => (c && o.dark ? darkColor(c) : c)
  const parts: string[] = []
  const f = (n: number) => +n.toFixed(2)
  for (const el of sortForRender(els)) {
    const g: string[] = []
    for (const op of elementOps(el)) {
      if (op.t === 'path') {
        const d = op.d ?? cmdsToSvg(op.cmds!)
        g.push(`<path d="${d}" fill="${op.fill ? col(op.fill) : 'none'}"${op.stroke ? ` stroke="${col(op.stroke)}" stroke-width="${f(op.width ?? 1)}" stroke-linecap="round" stroke-linejoin="round"${op.dash ? ` stroke-dasharray="${op.dash.join(' ')}"` : ''}` : ''}${op.alpha != null ? ` opacity="${op.alpha}"` : ''}/>`)
      } else if (op.t === 'text') {
        const anchor = op.align === 'center' ? 'middle' : op.align === 'right' ? 'end' : 'start'
        g.push(`<text font-family="${escX(FONT[op.family])}" font-size="${op.size}" font-weight="${op.family === 'hand' ? Math.max(op.weight ?? 400, 500) : op.weight ?? 400}" fill="${col(op.color)}" text-anchor="${anchor}" dominant-baseline="text-before-edge"${op.alpha != null ? ` opacity="${op.alpha}"` : ''}>${op.lines.map((l, i) => `<tspan x="${f(op.x)}" y="${f(op.y + i * op.size * LINE_H + op.size * (LINE_H - 1) / 2)}">${escX(l) || ' '}</tspan>`).join('')}</text>`)
      } else if (op.t === 'image') g.push(`<image href="${op.src}" x="${f(op.x)}" y="${f(op.y)}" width="${f(op.w)}" height="${f(op.h)}" preserveAspectRatio="none"/>`)
      else if (op.t === 'icon') g.push(`<path d="${op.d}" transform="translate(${f(op.x)} ${f(op.y)}) scale(${f(op.size / 24)})" fill="none" stroke="${col(op.color)}" stroke-width="${f(Math.max(1, op.width * 0.9))}" stroke-linecap="round" stroke-linejoin="round"/>`)
      else if (op.t === 'shadow') g.push(`<rect x="${f(op.x + 2)}" y="${f(op.y + 6)}" width="${f(op.w - 4)}" height="${f(op.h - 4)}" rx="${op.r}" fill="#000" opacity="0.12" filter="url(#ofblur)"/>`)
    }
    parts.push(`<g${(el.opacity ?? 100) < 100 ? ` opacity="${el.opacity / 100}"` : ''}>${g.join('')}</g>`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${f(x1 - pad)} ${f(y1 - pad)} ${W} ${H}">
<defs><style>@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&amp;display=swap');</style><filter id="ofblur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter></defs>
${o.bg ? `<rect x="${f(x1 - pad)}" y="${f(y1 - pad)}" width="${W}" height="${H}" fill="${o.bg}"/>` : ''}
${parts.join('\n')}
</svg>`
}

/** frames render beneath everything else */
export function sortForRender(els: El[]) { return [...els.filter((e) => e.type === 'frame'), ...els.filter((e) => e.type !== 'frame')] }
export { linePts }
