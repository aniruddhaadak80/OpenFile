import type { El } from './types'
import type { P } from './rough'

export type Sub = { pts: P[]; closed: boolean; smooth: boolean }
export type Box = { x1: number; y1: number; x2: number; y2: number }

function arcPts(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number): P[] {
  const out: P[] = []
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]) }
  return out
}
/** round the corners of a polygon by sampling quadratic-ish arcs */
export function roundPoly(pts: P[], radius: number, segs = 5): P[] {
  const out: P[] = []
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n]
    const d1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
    if (d1 < 1e-6 || d2 < 1e-6) { out.push(p1); continue }
    const r = Math.min(radius, d1 / 2, d2 / 2)
    const a: P = [p1[0] + ((p0[0] - p1[0]) / d1) * r, p1[1] + ((p0[1] - p1[1]) / d1) * r]
    const b: P = [p1[0] + ((p2[0] - p1[0]) / d2) * r, p1[1] + ((p2[1] - p1[1]) / d2) * r]
    for (let s = 0; s <= segs; s++) {
      const t = s / segs, u = 1 - t
      out.push([u * u * a[0] + 2 * u * t * p1[0] + t * t * b[0], u * u * a[1] + 2 * u * t * p1[1] + t * t * b[1]])
    }
  }
  return out
}

export function shapeOutline(el: El, fine = true): Sub[] {
  const { x, y, w, h } = el
  const kind = el.kind ?? 'rectangle'
  const rr = el.roundness ? Math.min(32, Math.min(w, h) * 0.25) : 0
  switch (kind) {
    case 'rectangle': {
      const pts: P[] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
      return [rr ? { pts: roundPoly(pts, rr, fine ? 6 : 3), closed: true, smooth: !fine } : { pts, closed: true, smooth: false }]
    }
    case 'diamond': {
      const pts: P[] = [[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]]
      return [rr ? { pts: roundPoly(pts, rr * 0.8, fine ? 6 : 3), closed: true, smooth: !fine } : { pts, closed: true, smooth: false }]
    }
    case 'ellipse': return [{ pts: arcPts(x + w / 2, y + h / 2, w / 2, h / 2, 0, Math.PI * 2, fine ? 72 : 14).slice(0, -1), closed: true, smooth: !fine }]
    case 'pill': {
      const r = Math.min(w, h) / 2
      const pts: P[] = w >= h
        ? [...arcPts(x + w - r, y + r, r, r, -Math.PI / 2, Math.PI / 2, fine ? 16 : 4), ...arcPts(x + r, y + r, r, r, Math.PI / 2, Math.PI * 1.5, fine ? 16 : 4)]
        : [...arcPts(x + r, y + r, r, r, Math.PI, Math.PI * 2, fine ? 16 : 4), ...arcPts(x + r, y + h - r, r, r, 0, Math.PI, fine ? 16 : 4)]
      return [{ pts, closed: true, smooth: !fine }]
    }
    case 'document': {
      const wave = h * 0.1, base = y + h - wave
      const pts: P[] = [[x, y], [x + w, y], [x + w, base]]
      const n = fine ? 24 : 8
      for (let i = 1; i < n; i++) { const t = i / n; pts.push([x + w - w * t, base + Math.sin(t * Math.PI * 2) * wave]) }
      pts.push([x, base])
      return [{ pts, closed: true, smooth: false }]
    }
    case 'parallelogram': { const s = Math.min(w * 0.22, h * 0.6); return [{ pts: [[x + s, y], [x + w, y], [x + w - s, y + h], [x, y + h]], closed: true, smooth: false }] }
    case 'hexagon': { const s = Math.min(w * 0.25, h * 0.5); return [{ pts: [[x + s, y], [x + w - s, y], [x + w, y + h / 2], [x + w - s, y + h], [x + s, y + h], [x, y + h / 2]], closed: true, smooth: false }] }
    case 'cylinder': {
      const ry = Math.min(h * 0.15, w * 0.3), cx = x + w / 2, rx = w / 2, n = fine ? 24 : 6
      const body: P[] = [...arcPts(cx, y + ry, rx, ry, Math.PI, Math.PI * 2, n), ...arcPts(cx, y + h - ry, rx, ry, 0, Math.PI, n)]
      const front = arcPts(cx, y + ry, rx, ry, 0, Math.PI, n)
      return [{ pts: body, closed: true, smooth: !fine }, { pts: front, closed: false, smooth: !fine }]
    }
  }
  return []
}

export function bounds(el: El): Box {
  if (el.points && (el.type === 'line' || el.type === 'arrow' || el.type === 'freedraw')) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
    for (const p of el.points) { x1 = Math.min(x1, p[0]); y1 = Math.min(y1, p[1]); x2 = Math.max(x2, p[0]); y2 = Math.max(y2, p[1]) }
    return { x1: el.x + x1, y1: el.y + y1, x2: el.x + x2, y2: el.y + y2 }
  }
  return { x1: el.x, y1: el.y, x2: el.x + el.w, y2: el.y + el.h }
}
export function unionBounds(els: El[]): Box | null {
  if (!els.length) return null
  const b = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity }
  for (const e of els) { const o = bounds(e); b.x1 = Math.min(b.x1, o.x1); b.y1 = Math.min(b.y1, o.y1); b.x2 = Math.max(b.x2, o.x2); b.y2 = Math.max(b.y2, o.y2) }
  return b
}

export function distSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy
  let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
export function distPoly(px: number, py: number, pts: P[], closed: boolean) {
  let d = Infinity
  const n = closed ? pts.length : pts.length - 1
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; d = Math.min(d, distSeg(px, py, a[0], a[1], b[0], b[1])) }
  if (pts.length === 1) d = Math.hypot(px - pts[0][0], py - pts[0][1])
  return d
}
export function inPoly(px: number, py: number, pts: P[]) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j]
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** world-space polyline of a line/arrow (curved if roundness) */
export function linePts(el: El): P[] {
  const pts = (el.points ?? []).map((p) => [el.x + p[0], el.y + p[1]] as P)
  if (el.roundness && pts.length > 2) return sampleCatmull(pts, 12)
  return pts
}
export function sampleCatmull(pts: P[], per: number): P[] {
  const out: P[] = []
  const n = pts.length
  const g = (i: number) => pts[Math.max(0, Math.min(n - 1, i))]
  for (let i = 0; i < n - 1; i++) {
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2)
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ])
    }
  }
  out.push(pts[n - 1])
  return out
}

const filled = (el: El) => el.fillStyle !== 'none' && el.fill !== 'transparent'
export function hit(el: El, x: number, y: number, tol: number): boolean {
  const b = bounds(el)
  const pad = tol + (el.strokeWidth || 1)
  if (x < b.x1 - pad || x > b.x2 + pad || y < b.y1 - pad || y > b.y2 + pad) return false
  switch (el.type) {
    case 'shape': {
      const subs = shapeOutline(el, true)
      if (filled(el) || el.text) { if (inPoly(x, y, subs[0].pts)) return true }
      return subs.some((s) => distPoly(x, y, s.pts, s.closed) <= pad)
    }
    case 'line': case 'arrow': {
      const pts = linePts(el)
      if (el.type === 'line' && pts.length > 2 && filled(el) && dist(pts[0], pts[pts.length - 1]) < 1 && inPoly(x, y, pts)) return true
      return distPoly(x, y, pts, false) <= pad + 2
    }
    case 'freedraw': return distPoly(x, y, (el.points ?? []).map((p) => [el.x + p[0], el.y + p[1]] as P), false) <= pad + el.strokeWidth * 1.5
    case 'frame': return (x >= b.x1 && x <= b.x2 && y >= b.y1 - 24 / 1 && y <= b.y1) || distPoly(x, y, [[b.x1, b.y1], [b.x2, b.y1], [b.x2, b.y2], [b.x1, b.y2]], true) <= pad
    default: return x >= b.x1 && x <= b.x2 && y >= b.y1 && y <= b.y2
  }
}
const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1])

export function center(el: El): P { const b = bounds(el); return [(b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2] }

/** Point on the element border along the ray from its centre towards `toward`, pushed out by `gap` */
export function borderPoint(el: El, toward: P, gap = 6): P {
  const c = center(el)
  let poly: P[]
  if (el.type === 'shape') poly = shapeOutline(el, true)[0].pts
  else { const b = bounds(el); poly = [[b.x1, b.y1], [b.x2, b.y1], [b.x2, b.y2], [b.x1, b.y2]] }
  const dx = toward[0] - c[0], dy = toward[1] - c[1]
  const L = Math.hypot(dx, dy) || 1
  const far: P = [c[0] + (dx / L) * 1e5, c[1] + (dy / L) * 1e5]
  let best: P | null = null, bt = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const r = segInt(c, far, a, b)
    if (r && r.t < bt) { bt = r.t; best = r.p }
  }
  if (!best) return c
  return [best[0] + (dx / L) * gap, best[1] + (dy / L) * gap]
}
function segInt(p: P, p2: P, q: P, q2: P) {
  const r = [p2[0] - p[0], p2[1] - p[1]], s = [q2[0] - q[0], q2[1] - q[1]]
  const d = r[0] * s[1] - r[1] * s[0]
  if (Math.abs(d) < 1e-9) return null
  const t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / d
  const u = ((q[0] - p[0]) * r[1] - (q[1] - p[1]) * r[0]) / d
  if (t < 0 || u < 0 || u > 1) return null
  return { t, p: [p[0] + t * r[0], p[1] + t * r[1]] as P }
}

export function boxContains(outer: Box, inner: Box) { return inner.x1 >= outer.x1 && inner.y1 >= outer.y1 && inner.x2 <= outer.x2 && inner.y2 <= outer.y2 }
