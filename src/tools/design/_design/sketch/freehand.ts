/* A small perfect-freehand-style stroke outliner written from scratch.
   Input: points [x, y, pressure?]. Output: closed outline polygon, rendered as a smooth path. */
type V = [number, number]
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]]
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1]]
const mul = (a: V, s: number): V => [a[0] * s, a[1] * s]
const len = (a: V) => Math.hypot(a[0], a[1])
const norm = (a: V): V => { const l = len(a) || 1; return [a[0] / l, a[1] / l] }
const perp = (a: V): V => [a[1], -a[0]]
const lerp = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const rot = (p: V, c: V, r: number): V => { const s = Math.sin(r), co = Math.cos(r), x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + x * co - y * s, c[1] + x * s + y * co] }

export type FreehandOpts = { size: number; thinning?: number; smoothing?: number; streamline?: number; taperStart?: number; taperEnd?: number; simulatePressure?: boolean; last?: boolean }

export function getStroke(input: number[][], o: FreehandOpts): V[] {
  const { size, thinning = 0.6, streamline = 0.45, taperStart = 0, taperEnd = 0, simulatePressure = true } = o
  if (!input.length) return []
  // 1. streamline (exponential smoothing) + running length
  const pts: { p: V; pr: number; d: number; v: V }[] = []
  let prev: V = [input[0][0], input[0][1]]
  let total = 0
  const t = 0.15 + (1 - streamline) * 0.85
  pts.push({ p: prev, pr: input[0][2] ?? 0.5, d: 0, v: [1, 1] })
  for (let i = 1; i < input.length; i++) {
    const raw: V = [input[i][0], input[i][1]]
    const p = i === input.length - 1 && o.last ? raw : lerp(prev, raw, t)
    const dist = len(sub(p, prev))
    if (dist < 0.4 && i < input.length - 1) continue
    total += dist
    pts.push({ p, pr: input[i][2] ?? 0.5, d: total, v: norm(sub(prev, p)) })
    prev = p
  }
  if (pts.length === 1) { // dot
    const r = size / 2, c = pts[0].p, out: V[] = []
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) out.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r])
    return out
  }
  pts[0].v = pts[1].v
  // 2. radii from pressure (real or simulated from velocity)
  let pressure = pts[0].pr
  const radii = pts.map((pt, i) => {
    let pr = pt.pr
    if (simulatePressure) {
      const seg = i ? pt.d - pts[i - 1].d : 0
      const sp = Math.min(1, seg / size)
      const rp = Math.min(1, 1 - sp)
      pressure = Math.min(1, pressure + (rp - pressure) * sp * 0.27 + (i < 4 ? 0.1 : 0))
      pr = pressure
    }
    let r = Math.max(0.01, (size / 2) * (1 - thinning * (1 - pr * 1.6 + 0.3)))
    r = Math.min(r, size * 0.75)
    if (taperStart && pt.d < taperStart) r *= Math.sin((pt.d / taperStart) * (Math.PI / 2)) * 0.8 + 0.2
    if (taperEnd && total - pt.d < taperEnd) r *= Math.sin(((total - pt.d) / taperEnd) * (Math.PI / 2)) * 0.8 + 0.2
    return r
  })
  // smooth radii
  for (let k = 0; k < 2; k++) for (let i = 1; i < radii.length - 1; i++) radii[i] = (radii[i - 1] + radii[i] * 2 + radii[i + 1]) / 4
  // 3. offset left / right
  const left: V[] = [], right: V[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i].v, b = pts[Math.min(i + 1, pts.length - 1)].v
    const dir = norm(add(a, b))
    const n = mul(perp(dir[0] === 0 && dir[1] === 0 ? a : dir), radii[i])
    left.push(sub(pts[i].p, n)); right.push(add(pts[i].p, n))
  }
  // 4. round caps (semicircles that bulge away from the stroke)
  const cap = (c: V, from: V, to: V, via: V): V[] => {
    const r = len(sub(from, c)); const t0 = Math.atan2(from[1] - c[1], from[0] - c[0])
    const sign = Math.cos(t0 + Math.PI / 2) * via[0] + Math.sin(t0 + Math.PI / 2) * via[1] >= 0 ? 1 : -1
    const out: V[] = []
    for (let s = 1; s < 8; s++) { const t = t0 + sign * (Math.PI * s) / 8; out.push([c[0] + Math.cos(t) * r, c[1] + Math.sin(t) * r]) }
    void to
    return out
  }
  const L = pts.length - 1
  const endCap = cap(pts[L].p, left[L], right[L], mul(pts[L].v, -1))
  const startCap = cap(pts[0].p, right[0], left[0], pts[0].v)
  return [...left, ...endCap, ...right.slice().reverse(), ...startCap]
}

/** Smooth closed path through outline points (quadratic midpoints) as SVG path data */
export function strokeToPath(o: V[]): string {
  if (o.length < 3) return ''
  const f = (n: number) => +n.toFixed(2)
  let d = `M${f((o[0][0] + o[1][0]) / 2)} ${f((o[0][1] + o[1][1]) / 2)}`
  for (let i = 1; i < o.length; i++) {
    const a = o[i], b = o[(i + 1) % o.length]
    d += `Q${f(a[0])} ${f(a[1])} ${f((a[0] + b[0]) / 2)} ${f((a[1] + b[1]) / 2)}`
  }
  return d + 'Z'
}
