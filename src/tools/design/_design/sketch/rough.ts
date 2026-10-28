/* Hand-drawn "rough" renderer written from scratch: jittered double-stroked lines/curves and hachure fills.
   Everything is produced as path commands so canvas and SVG export draw identical output. */
export type Cmd = ['M', number, number] | ['L', number, number] | ['C', number, number, number, number, number, number] | ['Z']
export type P = [number, number]

export function rng(seed: number) {
  let a = seed >>> 0 || 1
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/** rough.js-like line: cubic bezier with jittered endpoints and bowing */
export function roughLine(x1: number, y1: number, x2: number, y2: number, roughness: number, r: () => number, passes = 2, move = true): Cmd[] {
  const len = Math.hypot(x2 - x1, y2 - y1)
  let off = 1.6 * roughness
  if (len < 200) off = Math.max(0.4, Math.min(off, len / 60 * roughness))
  const out: Cmd[] = []
  for (let p = 0; p < passes; p++) {
    const k = p === 0 ? 1 : 0.6
    const j = () => (r() * 2 - 1) * off * k
    const bow = roughness * 1.0
    const midX = bow * off * (y2 - y1) / 200, midY = bow * off * (x1 - x2) / 200
    const div = 0.2 + r() * 0.2
    if (move || p > 0) out.push(['M', x1 + j(), y1 + j()])
    out.push(['C',
      midX + x1 + (x2 - x1) * div + j(), midY + y1 + (y2 - y1) * div + j(),
      midX + x1 + 2 * (x2 - x1) * div + j(), midY + y1 + 2 * (y2 - y1) * div + j(),
      x2 + j(), y2 + j()])
  }
  return out
}

/** Catmull-Rom spline through points → cubic beziers */
export function curveThrough(pts: P[], closed: boolean, tension = 0): Cmd[] {
  if (pts.length < 2) return []
  const out: Cmd[] = [['M', pts[0][0], pts[0][1]]]
  const n = pts.length
  const get = (i: number) => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]
  const segs = closed ? n : n - 1
  const s = (1 - tension) / 6
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2)
    out.push(['C', p1[0] + (p2[0] - p0[0]) * s, p1[1] + (p2[1] - p0[1]) * s, p2[0] - (p3[0] - p1[0]) * s, p2[1] - (p3[1] - p1[1]) * s, p2[0], p2[1]])
  }
  if (closed) out.push(['Z'])
  return out
}

/** Rough stroke of a smooth (curved) outline: two jittered passes, closed curves overshoot slightly */
export function roughCurve(pts: P[], closed: boolean, roughness: number, r: () => number, passes = 2): Cmd[] {
  const out: Cmd[] = []
  const size = bboxSize(pts)
  const off = Math.min(roughness * 1.4, size / 30 + 0.4)
  for (let p = 0; p < passes; p++) {
    const k = p === 0 ? 1 : 0.7
    let q = pts.map(([x, y]) => [x + (r() * 2 - 1) * off * k, y + (r() * 2 - 1) * off * k] as P)
    if (closed) {
      // rotate start & overshoot to mimic a pen that doesn't meet exactly
      const shift = Math.floor(r() * q.length)
      q = [...q.slice(shift), ...q.slice(0, shift)]
      const extra = Math.max(1, Math.round(q.length * (0.04 + r() * 0.06)))
      const over = q.slice(0, extra + 1).map(([x, y]) => [x + (r() * 2 - 1) * off, y + (r() * 2 - 1) * off] as P)
      out.push(...curveThrough([...q, ...over], false))
    } else out.push(...curveThrough(q, false))
  }
  return out
}

export function roughPolygon(pts: P[], closed: boolean, roughness: number, r: () => number, passes = 2): Cmd[] {
  const out: Cmd[] = []
  const n = closed ? pts.length : pts.length - 1
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; out.push(...roughLine(a[0], a[1], b[0], b[1], roughness, r, passes)) }
  return out
}

export function polyCmds(pts: P[], closed: boolean): Cmd[] {
  if (!pts.length) return []
  const out: Cmd[] = [['M', pts[0][0], pts[0][1]]]
  for (let i = 1; i < pts.length; i++) out.push(['L', pts[i][0], pts[i][1]])
  if (closed) out.push(['Z'])
  return out
}

function bboxSize(pts: P[]) { let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity; for (const [x, y] of pts) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y) } return Math.max(x2 - x1, y2 - y1) }

/** Hachure lines inside polygon (scanline at angle) */
export function hachureLines(poly: P[], gap: number, angleDeg: number): [P, P][] {
  if (poly.length < 3) return []
  const a = (angleDeg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a)
  const rp = poly.map(([x, y]) => [x * cos + y * sin, -x * sin + y * cos] as P)
  let minY = Infinity, maxY = -Infinity
  for (const p of rp) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]) }
  const lines: [P, P][] = []
  for (let y = minY + gap / 2; y < maxY; y += gap) {
    const xs: number[] = []
    for (let i = 0; i < rp.length; i++) {
      const p = rp[i], q = rp[(i + 1) % rp.length]
      if ((p[1] <= y && q[1] > y) || (q[1] <= y && p[1] > y)) xs.push(p[0] + ((y - p[1]) / (q[1] - p[1])) * (q[0] - p[0]))
    }
    xs.sort((m, n) => m - n)
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const un = (x: number): P => [x * cos - y * sin, x * sin + y * cos]
      lines.push([un(xs[i]), un(xs[i + 1])])
    }
  }
  return lines
}

export function cmdsToSvg(c: Cmd[]): string {
  const f = (n: number) => +n.toFixed(2)
  return c.map((k) => k[0] === 'Z' ? 'Z' : k[0] + k.slice(1).map((n) => f(n as number)).join(' ')).join('')
}
export function cmdsToPath2D(c: Cmd[]) {
  const p = new Path2D()
  for (const k of c) {
    if (k[0] === 'M') p.moveTo(k[1], k[2]); else if (k[0] === 'L') p.lineTo(k[1], k[2]); else if (k[0] === 'C') p.bezierCurveTo(k[1], k[2], k[3], k[4], k[5], k[6]); else p.closePath()
  }
  return p
}
