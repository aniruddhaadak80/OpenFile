/* CAD helpers for round 14: DXF and SVG writers, SVG path flattening, HPGL parsing, involute gears and finger joint boxes.
 * Pure TypeScript, unit tested in Node. Units are millimetres unless said otherwise. */

export type Pt = [number, number]
export interface Poly { pts: Pt[]; closed: boolean; layer?: string; color?: string }
export interface Circle { cx: number; cy: number; r: number; layer?: string }

/* ---------------- writers ---------------- */
const f = (n: number) => (Math.round(n * 10000) / 10000).toString()
/** AutoCAD R12 ASCII DXF (LINE, POLYLINE, CIRCLE): opens in every laser cutter and CNC program. Y is kept as given (DXF y-up). */
export function writeDxf(polys: Poly[], circles: Circle[] = [], units: 'mm' | 'in' = 'mm'): string {
  const o: string[] = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', units === 'mm' ? '4' : '1', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES']
  for (const p of polys) {
    if (p.pts.length < 2) continue
    const layer = p.layer ?? '0'
    o.push('0', 'POLYLINE', '8', layer, '66', '1', '70', p.closed ? '1' : '0')
    for (const [x, y] of p.pts) o.push('0', 'VERTEX', '8', layer, '10', f(x), '20', f(y), '30', '0')
    o.push('0', 'SEQEND', '8', layer)
  }
  for (const c of circles) o.push('0', 'CIRCLE', '8', c.layer ?? '0', '10', f(c.cx), '20', f(c.cy), '30', '0', '40', f(c.r))
  o.push('0', 'ENDSEC', '0', 'EOF')
  return o.join('\n') + '\n'
}

export function bounds(polys: Poly[], circles: Circle[] = []) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of polys) for (const [x, y] of p.pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  for (const c of circles) { x0 = Math.min(x0, c.cx - c.r); x1 = Math.max(x1, c.cx + c.r); y0 = Math.min(y0, c.cy - c.r); y1 = Math.max(y1, c.cy + c.r) }
  if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 0, y1: 0, w: 0, h: 0 }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 }
}

/** SVG in real millimetres with y flipped so it looks like the DXF (y-up). */
export function writeSvg(polys: Poly[], circles: Circle[] = [], o: { stroke?: number; margin?: number; flipY?: boolean; unit?: 'mm' | 'in' } = {}): string {
  const b = bounds(polys, circles), m = o.margin ?? 2, sw = o.stroke ?? 0.2, flip = o.flipY ?? true, u = o.unit ?? 'mm'
  const X = (x: number) => f(x - b.x0 + m), Y = (y: number) => f(flip ? b.y1 - y + m : y - b.y0 + m)
  const W = b.w + m * 2, H = b.h + m * 2
  const body = polys.filter((p) => p.pts.length > 1).map((p) => `<path d="M${p.pts.map(([x, y]) => `${X(x)} ${Y(y)}`).join(' L')}${p.closed ? ' Z' : ''}" stroke="${p.color ?? '#000'}"/>`)
  for (const c of circles) body.push(`<circle cx="${X(c.cx)}" cy="${Y(c.cy)}" r="${f(c.r)}" stroke="#000"/>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${f(W)}${u}" height="${f(H)}${u}" viewBox="0 0 ${f(W)} ${f(H)}" fill="none" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">\n${body.join('\n')}\n</svg>\n`
}

/* ---------------- SVG path flattening ---------------- */
export type Mat = [number, number, number, number, number, number]
export const IDENT: Mat = [1, 0, 0, 1, 0, 0]
export const mul = (a: Mat, b: Mat): Mat => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]
export const apply = (m: Mat, [x, y]: Pt): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
export function parseTransform(s: string | null | undefined): Mat {
  let m: Mat = IDENT
  if (!s) return m
  for (const [, fn, args] of s.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = args.split(/[\s,]+/).filter(Boolean).map(Number)
    let t: Mat = IDENT
    if (fn === 'matrix' && a.length === 6) t = a as Mat
    else if (fn === 'translate') t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0]
    else if (fn === 'scale') t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0]
    else if (fn === 'rotate') { const r = ((a[0] ?? 0) * Math.PI) / 180, c = Math.cos(r), s2 = Math.sin(r); const rot: Mat = [c, s2, -s2, c, 0, 0]; t = a.length >= 3 ? mul(mul([1, 0, 0, 1, a[1], a[2]], rot), [1, 0, 0, 1, -a[1], -a[2]]) : rot }
    else if (fn === 'skewX') t = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0]
    else if (fn === 'skewY') t = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0]
    m = mul(m, t)
  }
  return m
}

/** Flatten an SVG path "d" into polylines. `tol` is the max chord length in user units. */
export function flattenPath(d: string, tol = 0.5): Poly[] {
  const toks = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? []
  const out: Poly[] = []
  let i = 0, cmd = '', cur: Pt = [0, 0], start: Pt = [0, 0], lastC: Pt | null = null, lastQ: Pt | null = null
  let poly: Pt[] = []
  const num = () => Number(toks[i++])
  const flush = (closed: boolean) => { if (poly.length > 1) out.push({ pts: poly, closed }); poly = [] }
  const push = (p: Pt) => { if (!poly.length) poly.push(cur); poly.push(p); cur = p }
  const steps = (len: number) => Math.max(2, Math.min(200, Math.ceil(len / tol)))
  const cubic = (p1: Pt, p2: Pt, p3: Pt) => { const p0 = cur; const n = steps(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1])); for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]) } }
  const quad = (p1: Pt, p2: Pt) => { const p0 = cur; const n = steps(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1])); for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]) } }
  const arc = (rx: number, ry: number, phi: number, large: number, sweep: number, p: Pt) => {
    const [x1, y1] = cur, [x2, y2] = p
    if (!rx || !ry) { push(p); return }
    rx = Math.abs(rx); ry = Math.abs(ry)
    const r = (phi * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2
    const xp = c * dx + s * dy, yp = -s * dx + c * dy
    const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry)
    if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam) }
    const sign = large === sweep ? -1 : 1
    const num2 = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp
    const co = sign * Math.sqrt(Math.max(0, num2 / (rx * rx * yp * yp + ry * ry * xp * xp)))
    const cxp = (co * rx * yp) / ry, cyp = (-co * ry * xp) / rx
    const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2
    const ang = (ux: number, uy: number, vx: number, vy: number) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a }
    const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry)
    let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry)
    if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI
    const n = steps(Math.abs(dt) * Math.max(rx, ry))
    for (let k = 1; k <= n; k++) { const t = t1 + (dt * k) / n; push([cx + rx * Math.cos(t) * c - ry * Math.sin(t) * s, cy + rx * Math.cos(t) * s + ry * Math.sin(t) * c]) }
    cur = p
  }
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++]
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase()
    const P = (x: number, y: number): Pt => (rel ? [cur[0] + x, cur[1] + y] : [x, y])
    if (C === 'M') { flush(false); const p = P(num(), num()); cur = p; start = p; poly = [p]; cmd = rel ? 'l' : 'L'; lastC = lastQ = null; continue }
    if (C === 'Z') { if (poly.length) { push(start); flush(true) } cur = start; lastC = lastQ = null; if (i < toks.length && !/[a-zA-Z]/.test(toks[i])) cmd = 'L'; continue }
    if (C === 'L') { push(P(num(), num())); lastC = lastQ = null }
    else if (C === 'H') { const x = num(); push([rel ? cur[0] + x : x, cur[1]]); lastC = lastQ = null }
    else if (C === 'V') { const y = num(); push([cur[0], rel ? cur[1] + y : y]); lastC = lastQ = null }
    else if (C === 'C') { const p1 = P(num(), num()), p2 = P(num(), num()), p3 = P(num(), num()); cubic(p1, p2, p3); lastC = p2; lastQ = null }
    else if (C === 'S') { const p1: Pt = lastC ? [2 * cur[0] - lastC[0], 2 * cur[1] - lastC[1]] : cur; const p2 = P(num(), num()), p3 = P(num(), num()); cubic(p1, p2, p3); lastC = p2; lastQ = null }
    else if (C === 'Q') { const p1 = P(num(), num()), p2 = P(num(), num()); quad(p1, p2); lastQ = p1; lastC = null }
    else if (C === 'T') { const p1: Pt = lastQ ? [2 * cur[0] - lastQ[0], 2 * cur[1] - lastQ[1]] : cur; const p2 = P(num(), num()); quad(p1, p2); lastQ = p1; lastC = null }
    else if (C === 'A') { const rx = num(), ry = num(), phi = num(), la = num(), sw = num(); arc(rx, ry, phi, la, sw, P(num(), num())); lastC = lastQ = null }
    else { i++ }
  }
  flush(false)
  return out
}

/** Shapes other than path, as path data. */
export function shapeToPath(tag: string, a: (k: string) => number): string | null {
  switch (tag) {
    case 'rect': { const x = a('x'), y = a('y'), w = a('width'), h = a('height'); let rx = a('rx') || a('ry'), ry = a('ry') || a('rx'); rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2); if (!w || !h) return null; return rx ? `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z` : `M${x} ${y}H${x + w}V${y + h}H${x}Z` }
    case 'circle': { const cx = a('cx'), cy = a('cy'), r = a('r'); return r ? `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z` : null }
    case 'ellipse': { const cx = a('cx'), cy = a('cy'), rx = a('rx'), ry = a('ry'); return rx && ry ? `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z` : null }
    case 'line': return `M${a('x1')} ${a('y1')}L${a('x2')} ${a('y2')}`
  }
  return null
}

/* ---------------- HPGL ---------------- */
export const HPGL_UNIT = 0.025 // mm per plotter unit
export function parseHpgl(text: string): { polys: Poly[]; pens: number[]; warnings: string[] } {
  const polys: Poly[] = [], warnings = new Set<string>(), pens = new Set<number>()
  let x = 0, y = 0, down = false, abs = true, pen = 1, cur: Pt[] = []
  const flush = () => { if (cur.length > 1) polys.push({ pts: cur, closed: false, layer: `PEN${pen}` }); cur = [] }
  const cmds = text.replace(/\x03/g, ';').split(/;|\n/).flatMap((s) => s.match(/[A-Z]{2}[^A-Z]*/g) ?? [])
  for (const c of cmds) {
    const op = c.slice(0, 2), args = c.slice(2).split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => Number.isFinite(n))
    const moveTo = (nx: number, ny: number) => { if (down) { if (!cur.length) cur.push([x, y]); cur.push([nx, ny]) } x = nx; y = ny }
    const run = () => { for (let k = 0; k + 1 < args.length; k += 2) abs ? moveTo(args[k], args[k + 1]) : moveTo(x + args[k], y + args[k + 1]) }
    switch (op) {
      case 'IN': case 'DF': abs = true; down = false; flush(); break
      case 'PU': flush(); down = false; run(); break
      case 'PD': if (!down) { down = true; cur = [[x, y]] } run(); break
      case 'PA': abs = true; run(); break
      case 'PR': abs = false; run(); break
      case 'SP': flush(); pen = args[0] ?? 0; if (pen) pens.add(pen); break
      case 'CI': { flush(); const r = args[0] ?? 0; const n = 48; const pts: Pt[] = []; for (let k = 0; k <= n; k++) pts.push([x + r * Math.cos((2 * Math.PI * k) / n), y + r * Math.sin((2 * Math.PI * k) / n)]); polys.push({ pts, closed: true, layer: `PEN${pen}` }); break }
      case 'AA': case 'AR': { const cx = op === 'AA' ? args[0] : x + args[0], cy = op === 'AA' ? args[1] : y + args[1], sweep = ((args[2] ?? 0) * Math.PI) / 180; const r = Math.hypot(x - cx, y - cy), a0 = Math.atan2(y - cy, x - cx); const n = Math.max(4, Math.ceil(Math.abs(sweep) / 0.1)); for (let k = 1; k <= n; k++) { const t = a0 + (sweep * k) / n; const nx = cx + r * Math.cos(t), ny = cy + r * Math.sin(t); if (down) { if (!cur.length) cur.push([x, y]); cur.push([nx, ny]) } x = nx; y = ny } break }
      case 'LB': warnings.add('Text labels (LB) are not drawn.'); break
      case 'PW': case 'LT': case 'VS': case 'IP': case 'SC': case 'RO': case 'CT': case 'WU': case 'PS': case 'FT': case 'PT': break
      default: if (/^[A-Z]{2}$/.test(op)) warnings.add(`Command ${op} is not supported and was skipped.`)
    }
  }
  flush()
  if (pens.size === 0) pens.add(1)
  return { polys, pens: [...pens].sort((a, b) => a - b), warnings: [...warnings] }
}

/* ---------------- gears ---------------- */
export interface GearOpts { teeth: number; module: number; pressure: number; bore: number; steps?: number; backlash?: number }
export function gearInfo(o: GearOpts) {
  const r = (o.module * o.teeth) / 2
  return { pitchDiameter: r * 2, outsideDiameter: r * 2 + 2 * o.module, rootDiameter: r * 2 - 2.5 * o.module, baseDiameter: r * 2 * Math.cos((o.pressure * Math.PI) / 180), circularPitch: Math.PI * o.module }
}
/** Involute spur gear outline centred on 0,0. */
export function gear(o: GearOpts): { outline: Poly; bore: Circle | null } {
  const z = Math.max(4, Math.round(o.teeth)), m = o.module, pa = (o.pressure * Math.PI) / 180
  const r = (m * z) / 2, rb = r * Math.cos(pa), ra = r + m, rf = Math.max(0.1, r - 1.25 * m)
  const inv = (a: number) => Math.tan(a) - a
  const half = Math.PI / (2 * z) - (o.backlash ?? 0) / (2 * r) + inv(pa) // half tooth angle at base circle
  const n = o.steps ?? 10
  const rStart = Math.max(rb, rf)
  const flank: { r: number; a: number }[] = []
  for (let k = 0; k <= n; k++) { const rho = rStart + ((ra - rStart) * k) / n; const alpha = Math.acos(Math.min(1, rb / rho)); flank.push({ r: rho, a: half - inv(alpha) }) }
  const pts: Pt[] = []
  for (let t = 0; t < z; t++) {
    const c = (2 * Math.PI * t) / z
    const at = (rr: number, a: number): Pt => [rr * Math.cos(c + a), rr * Math.sin(c + a)]
    const halfPitch = Math.PI / z
    if (rf < rb) pts.push(at(rf, -flank[0].a))
    for (const p of flank) pts.push(at(p.r, -p.a))
    for (let k = flank.length - 1; k >= 0; k--) pts.push(at(flank[k].r, flank[k].a))
    if (rf < rb) pts.push(at(rf, flank[0].a))
    // root arc to the next tooth
    const a0 = flank[0].a, a1 = 2 * halfPitch - flank[0].a
    for (let k = 1; k < 4; k++) pts.push(at(rf, a0 + ((a1 - a0) * k) / 4))
  }
  return { outline: { pts, closed: true, layer: 'GEAR' }, bore: o.bore > 0 ? { cx: 0, cy: 0, r: o.bore / 2, layer: 'GEAR' } : null }
}

/* ---------------- finger joint box ---------------- */
type Seg = { a: number; b: number }
/** Alternating finger segments along an edge. Odd count so both ends match. startOut = first segment sticks out. */
export function fingers(len: number, width: number): number {
  let n = Math.max(3, Math.floor(len / width))
  if (n % 2 === 0) n--
  return n
}
/** Cells approach: start with a full rectangle and remove notch rectangles, then trace the outline. */
export function panel(w: number, h: number, t: number, edges: { side: 'top' | 'right' | 'bottom' | 'left'; mode: 'A' | 'B' | 'flat'; finger: number; kerf?: number }[]): Pt[] {
  const notches: { x0: number; y0: number; x1: number; y1: number }[] = []
  for (const e of edges) {
    if (e.mode === 'flat') continue
    const horiz = e.side === 'top' || e.side === 'bottom'
    const L = horiz ? w : h
    const n = fingers(L, e.finger), s = L / n
    const k = (e.kerf ?? 0) / 2
    for (let i = 0; i < n; i++) {
      const out = e.mode === 'A' ? i % 2 === 0 : i % 2 === 1
      if (out) continue
      const seg: Seg = { a: i * s + (i === 0 ? 0 : k), b: (i + 1) * s - (i === n - 1 ? 0 : k) }
      if (e.side === 'bottom') notches.push({ x0: seg.a, x1: seg.b, y0: 0, y1: t })
      if (e.side === 'top') notches.push({ x0: seg.a, x1: seg.b, y0: h - t, y1: h })
      if (e.side === 'left') notches.push({ x0: 0, x1: t, y0: seg.a, y1: seg.b })
      if (e.side === 'right') notches.push({ x0: w - t, x1: w, y0: seg.a, y1: seg.b })
    }
  }
  const xs = [...new Set([0, w, ...notches.flatMap((n) => [n.x0, n.x1])])].sort((a, b) => a - b)
  const ys = [...new Set([0, h, ...notches.flatMap((n) => [n.y0, n.y1])])].sort((a, b) => a - b)
  const filled = (i: number, j: number) => { if (i < 0 || j < 0 || i >= xs.length - 1 || j >= ys.length - 1) return false; const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2; return !notches.some((n) => cx > n.x0 && cx < n.x1 && cy > n.y0 && cy < n.y1) }
  // collect directed boundary edges (counter clockwise around filled cells)
  const edgesOut = new Map<string, Pt>()
  const key = (p: Pt) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
    if (!filled(i, j)) continue
    const x0 = xs[i], x1 = xs[i + 1], y0 = ys[j], y1 = ys[j + 1]
    if (!filled(i, j - 1)) edgesOut.set(key([x0, y0]) + '>' + key([x1, y0]), [x1, y0])
    if (!filled(i + 1, j)) edgesOut.set(key([x1, y0]) + '>' + key([x1, y1]), [x1, y1])
    if (!filled(i, j + 1)) edgesOut.set(key([x1, y1]) + '>' + key([x0, y1]), [x0, y1])
    if (!filled(i - 1, j)) edgesOut.set(key([x0, y1]) + '>' + key([x0, y0]), [x0, y0])
  }
  const next = new Map<string, Pt>()
  for (const [k, p] of edgesOut) next.set(k.split('>')[0], p)
  // start at the bottom-left most point and walk
  const startKey = [...next.keys()].sort((a, b) => { const [ax, ay] = a.split(',').map(Number), [bx, by] = b.split(',').map(Number); return ay - by || ax - bx })[0]
  const pts: Pt[] = []
  let k = startKey
  for (let guard = 0; guard < 100000; guard++) {
    const [px, py] = k.split(',').map(Number); pts.push([px, py])
    const n = next.get(k); if (!n) break
    k = key(n); if (k === startKey) break
  }
  // drop collinear points
  return pts.filter((p, i) => { const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length]; return !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1])) })
}

export interface BoxOpts { width: number; depth: number; height: number; thickness: number; finger: number; kerf: number; lid: boolean; outside: boolean; gap: number }
/** Six (or five) panels of a finger joint box, laid out flat with a gap. */
export function box(o: BoxOpts): { panels: { name: string; poly: Poly }[]; size: { w: number; h: number } } {
  const t = o.thickness
  const W = o.outside ? o.width : o.width + 2 * t, D = o.outside ? o.depth : o.depth + 2 * t, H = o.outside ? o.height : o.height + (o.lid ? 2 : 1) * t
  const k = o.kerf, fw = o.finger
  const mk = (name: string, w: number, h: number, e: Parameters<typeof panel>[3]) => ({ name, w: w + k, h: h + k, pts: panel(w + k, h + k, t, e.map((x) => ({ ...x, kerf: k }))) })
  const top: 'A' | 'B' | 'flat' = o.lid ? 'B' : 'flat'
  const list = [
    mk('Bottom', W, D, [{ side: 'bottom', mode: 'A', finger: fw }, { side: 'top', mode: 'A', finger: fw }, { side: 'left', mode: 'A', finger: fw }, { side: 'right', mode: 'A', finger: fw }]),
    ...(o.lid ? [mk('Lid', W, D, [{ side: 'bottom', mode: 'A', finger: fw }, { side: 'top', mode: 'A', finger: fw }, { side: 'left', mode: 'A', finger: fw }, { side: 'right', mode: 'A', finger: fw }])] : []),
    mk('Front', W, H, [{ side: 'bottom', mode: 'B', finger: fw }, { side: 'top', mode: top, finger: fw }, { side: 'left', mode: 'A', finger: fw }, { side: 'right', mode: 'A', finger: fw }]),
    mk('Back', W, H, [{ side: 'bottom', mode: 'B', finger: fw }, { side: 'top', mode: top, finger: fw }, { side: 'left', mode: 'A', finger: fw }, { side: 'right', mode: 'A', finger: fw }]),
    mk('Left', D, H, [{ side: 'bottom', mode: 'B', finger: fw }, { side: 'top', mode: top, finger: fw }, { side: 'left', mode: 'B', finger: fw }, { side: 'right', mode: 'B', finger: fw }]),
    mk('Right', D, H, [{ side: 'bottom', mode: 'B', finger: fw }, { side: 'top', mode: top, finger: fw }, { side: 'left', mode: 'B', finger: fw }, { side: 'right', mode: 'B', finger: fw }]),
  ]
  // simple two row layout
  const g = o.gap
  const row1 = list.filter((p) => ['Bottom', 'Lid', 'Front', 'Back'].includes(p.name)), row2 = list.filter((p) => ['Left', 'Right'].includes(p.name))
  const panels: { name: string; poly: Poly }[] = []
  let x = 0, maxH1 = 0
  for (const p of row1) { panels.push({ name: p.name, poly: { pts: p.pts.map(([a, b]) => [a + x, b] as Pt), closed: true, layer: 'CUT' } }); x += p.w + g; maxH1 = Math.max(maxH1, p.h) }
  let x2 = 0, maxH2 = 0
  for (const p of row2) { panels.push({ name: p.name, poly: { pts: p.pts.map(([a, b]) => [a + x2, b + maxH1 + g] as Pt), closed: true, layer: 'CUT' } }); x2 += p.w + g; maxH2 = Math.max(maxH2, p.h) }
  return { panels, size: { w: Math.max(x, x2) - g, h: maxH1 + g + maxH2 } }
}
