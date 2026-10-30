/* Design helpers for round 14: blobs and waves, printable paper patterns, simple SVG charts, code image themes.
 * Pure TypeScript, unit tested in Node (scripts/tests/b14/design.test.mjs). */

const r2 = (n: number) => Math.round(n * 100) / 100
const escXml = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Small seeded random generator (mulberry32) so a seed always gives the same shape. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/** Closed smooth path through points (Catmull-Rom turned into cubic Bezier curves). */
export function smoothClosed(pts: [number, number][], tension = 1): string {
  const n = pts.length
  if (n < 3) return ''
  let d = `M${r2(pts[0][0])},${r2(pts[0][1])}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n]
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * tension, p1[1] + ((p2[1] - p0[1]) / 6) * tension]
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * tension, p2[1] - ((p3[1] - p1[1]) / 6) * tension]
    d += `C${r2(c1[0])},${r2(c1[1])} ${r2(c2[0])},${r2(c2[1])} ${r2(p2[0])},${r2(p2[1])}`
  }
  return d + 'Z'
}

/** Organic blob path centred in a size x size box. `edges` points, `growth` 0..1 how wobbly. */
export function blobPath(seed: number, size = 400, edges = 7, growth = 0.5): string {
  const rand = rng(seed), c = size / 2, R = size * 0.42
  const pts: [number, number][] = []
  for (let i = 0; i < edges; i++) {
    const a = (i / edges) * Math.PI * 2
    const r = R * (1 - growth * 0.55 + rand() * growth * 0.55)
    pts.push([c + Math.cos(a) * r, c + Math.sin(a) * r])
  }
  return smoothClosed(pts)
}

/** Stacked wave layers for the bottom (or top) of a w x h banner. */
export function wavePaths(seed: number, w = 1440, h = 320, layers = 3, peaks = 4, amp = 0.5, top = false): string[] {
  const rand = rng(seed), out: string[] = []
  for (let l = 0; l < layers; l++) {
    const base = h * (0.35 + (0.5 * l) / Math.max(1, layers))
    const a = h * 0.18 * amp * (1 - l * 0.15)
    const n = peaks * 2 + 1
    const pts: [number, number][] = Array.from({ length: n + 1 }, (_, i) => [(w * i) / n, base + (rand() * 2 - 1) * a])
    let d = `M0,${r2(pts[0][1])}`
    for (let i = 0; i < n; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], mx = (x0 + x1) / 2
      d += `C${r2(mx)},${r2(y0)} ${r2(mx)},${r2(y1)} ${r2(x1)},${r2(y1)}`
    }
    d += top ? `L${w},0L0,0Z` : `L${w},${h}L0,${h}Z`
    out.push(d)
  }
  return out
}

/** Mix two hex colours, t = 0 gives a, t = 1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const A = p(a), B = p(b)
  return '#' + A.map((x, i) => Math.round(x + (B[i] - x) * t).toString(16).padStart(2, '0')).join('')
}

export interface ShapeOpts { kind: 'blob' | 'wave' | 'scatter' | 'layered-blob'; seed: number; w: number; h: number; c1: string; c2: string; bg: string; gradient: boolean; edges: number; growth: number; layers: number; peaks: number; amp: number; top: boolean; count: number; stroke: boolean }
export function shapeSvg(o: ShapeOpts): string {
  const defs = o.gradient ? `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${o.c1}"/><stop offset="1" stop-color="${o.c2}"/></linearGradient></defs>` : ''
  const fill = o.gradient ? 'url(#g)' : o.c1
  const paint = o.stroke ? `fill="none" stroke="${fill}" stroke-width="4"` : `fill="${fill}"`
  const bg = o.bg === 'none' ? '' : `<rect width="100%" height="100%" fill="${o.bg}"/>`
  let body = ''
  if (o.kind === 'blob') {
    const s = Math.min(o.w, o.h)
    body = `<path transform="translate(${r2((o.w - s) / 2)} ${r2((o.h - s) / 2)})" d="${blobPath(o.seed, s, o.edges, o.growth)}" ${paint}/>`
  } else if (o.kind === 'layered-blob') {
    const s = Math.min(o.w, o.h)
    body = Array.from({ length: o.layers }, (_, i) => { const k = 1 - i / (o.layers + 1), sz = s * k; return `<path transform="translate(${r2((o.w - sz) / 2)} ${r2((o.h - sz) / 2)})" d="${blobPath(o.seed + i * 7, sz, o.edges, o.growth)}" fill="${mix(o.c1, o.c2, i / Math.max(1, o.layers - 1))}"${o.stroke ? ' fill-opacity="0.85"' : ''}/>` }).join('')
  } else if (o.kind === 'wave') {
    const ps = wavePaths(o.seed, o.w, o.h, o.layers, o.peaks, o.amp, o.top)
    body = ps.map((d, i) => `<path d="${d}" fill="${mix(o.c1, o.c2, ps.length > 1 ? i / (ps.length - 1) : 0)}"${o.stroke ? ' fill="none" stroke-width="3"' : ''} ${i < ps.length - 1 ? 'fill-opacity="0.75"' : ''}/>`).join('')
  } else {
    const rand = rng(o.seed)
    body = Array.from({ length: o.count }, (_, i) => { const s = Math.min(o.w, o.h) * (0.08 + rand() * 0.22), x = rand() * (o.w - s), y = rand() * (o.h - s); return `<path transform="translate(${r2(x)} ${r2(y)})" d="${blobPath(o.seed + i * 13, s, o.edges, o.growth)}" fill="${mix(o.c1, o.c2, rand())}" fill-opacity="${r2(0.55 + rand() * 0.4)}"/>` }).join('')
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${o.w} ${o.h}" width="${o.w}" height="${o.h}">${defs}${bg}${body}</svg>`
}

/* ---------------- printable paper ---------------- */
export type PaperKind = 'graph' | 'dot' | 'lined' | 'isometric' | 'hex' | 'music' | 'handwriting' | 'polar' | 'calligraphy' | 'engineering'
export const PAPER_SIZES: Record<string, [number, number]> = { A4: [210, 297], Letter: [215.9, 279.4], A5: [148, 210], Legal: [215.9, 355.6], A3: [297, 420] }
export type Prim = { t: 'line'; x1: number; y1: number; x2: number; y2: number; w: number; c: string; dash?: boolean } | { t: 'dot'; x: number; y: number; r: number; c: string } | { t: 'circle'; x: number; y: number; r: number; w: number; c: string }
export interface PaperOpts { kind: PaperKind; w: number; h: number; margin: number; spacing: number; color: string; accent: string; weight: number; majorEvery: number; header: boolean; marginLine: boolean }

/** Primitives in millimetres for one page. */
export function paperPrims(o: PaperOpts): Prim[] {
  const P: Prim[] = [], m = o.margin, s = Math.max(1, o.spacing)
  const x0 = m, y0 = m + (o.header ? 12 : 0), x1 = o.w - m, y1 = o.h - m, W = x1 - x0, H = y1 - y0
  const L = (x1_: number, y1_: number, x2: number, y2: number, w = o.weight, c = o.color, dash = false) => P.push({ t: 'line', x1: x1_, y1: y1_, x2, y2, w, c, dash })
  if (o.header) L(x0, y0 - 2, x1, y0 - 2, o.weight * 1.6, o.accent)
  switch (o.kind) {
    case 'graph': case 'engineering': {
      const nx = Math.floor(W / s), ny = Math.floor(H / s), ox = x0 + (W - nx * s) / 2, oy = y0 + (H - ny * s) / 2
      for (let i = 0; i <= nx; i++) { const major = o.majorEvery > 0 && i % o.majorEvery === 0; L(ox + i * s, oy, ox + i * s, oy + ny * s, major ? o.weight * 2.2 : o.weight, major ? o.accent : o.color) }
      for (let j = 0; j <= ny; j++) { const major = o.majorEvery > 0 && j % o.majorEvery === 0; L(ox, oy + j * s, ox + nx * s, oy + j * s, major ? o.weight * 2.2 : o.weight, major ? o.accent : o.color) }
      break
    }
    case 'dot': {
      const nx = Math.floor(W / s), ny = Math.floor(H / s), ox = x0 + (W - nx * s) / 2, oy = y0 + (H - ny * s) / 2
      for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) P.push({ t: 'dot', x: ox + i * s, y: oy + j * s, r: Math.max(0.25, o.weight * 1.6), c: o.color })
      break
    }
    case 'lined': {
      for (let y = y0 + s; y <= y1 + 1e-6; y += s) L(x0, y, x1, y)
      if (o.marginLine) L(x0 + 25, y0, x0 + 25, y1, o.weight * 1.4, o.accent)
      break
    }
    case 'handwriting': {
      // four line groups: ascender, dashed midline, baseline, descender gap
      const g = s * 3
      for (let y = y0; y + s * 2 <= y1 + 1e-6; y += g) { L(x0, y, x1, y, o.weight * 1.3, o.color); L(x0, y + s, x1, y + s, o.weight, o.accent, true); L(x0, y + s * 2, x1, y + s * 2, o.weight * 1.3, o.color) }
      break
    }
    case 'music': {
      const gap = s / 4
      for (let y = y0; y + s <= y1 + 1e-6; y += s * 2.4) for (let k = 0; k < 5; k++) L(x0, y + k * gap, x1, y + k * gap)
      break
    }
    case 'isometric': {
      const dy = s, dx = s * Math.sqrt(3) / 2
      for (let x = x0; x <= x1 + 1e-6; x += dx) L(x, y0, x, y1, o.weight * 0.6)
      const t = Math.tan(Math.PI / 6)
      for (let c = y0 - W * t; c <= y1; c += dy) {
        // y = c + (x-x0)*t and y = c + W*t - (x-x0)*t
        const seg = (yA: number, yB: number) => { let xa = x0, ya = yA, xb = x1, yb = yB; const k = (yb - ya) / (xb - xa); if (ya < y0) { xa += (y0 - ya) / k; ya = y0 } if (ya > y1) { xa += (y1 - ya) / k; ya = y1 } if (yb > y1) { xb -= (yb - y1) / k; yb = y1 } if (yb < y0) { xb -= (yb - y0) / k; yb = y0 } if (xa < xb && xa >= x0 - 1e-6 && xb <= x1 + 1e-6) L(xa, ya, xb, yb) }
        seg(c, c + W * t); seg(c + W * t, c)
      }
      break
    }
    case 'hex': {
      const r = s / 2, hw = Math.sqrt(3) * r
      for (let row = 0, y = y0 + r; y + r <= y1 + 1e-6; row++, y += 1.5 * r) for (let x = x0 + hw / 2 + (row % 2 ? hw / 2 : 0); x + hw / 2 <= x1 + 1e-6; x += hw) {
        for (let k = 0; k < 6; k++) { const a1 = Math.PI / 6 + (k * Math.PI) / 3, a2 = a1 + Math.PI / 3; L(x + r * Math.cos(a1), y + r * Math.sin(a1), x + r * Math.cos(a2), y + r * Math.sin(a2)) }
      }
      break
    }
    case 'polar': {
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.min(W, H) / 2
      for (let r = s; r <= R + 1e-6; r += s) P.push({ t: 'circle', x: cx, y: cy, r, w: o.weight, c: o.color })
      for (let k = 0; k < 24; k++) { const a = (k * Math.PI) / 12; L(cx, cy, cx + R * Math.cos(a), cy + R * Math.sin(a), k % 6 === 0 ? o.weight * 2 : o.weight, k % 6 === 0 ? o.accent : o.color) }
      break
    }
    case 'calligraphy': {
      const g = s * 2.5
      for (let y = y0; y + s * 2 <= y1 + 1e-6; y += g) { L(x0, y, x1, y); L(x0, y + s * 0.7, x1, y + s * 0.7, o.weight, o.accent, true); L(x0, y + s * 1.3, x1, y + s * 1.3, o.weight, o.accent, true); L(x0, y + s * 2, x1, y + s * 2) }
      const k = Math.tan((35 * Math.PI) / 180) // 55 degree slant guides
      for (let x = x0; x <= x1 + H * k; x += s * 1.5) { let xa = x, ya = y0, xb = x - H * k, yb = y1; if (xa > x1) { ya += (xa - x1) / k; xa = x1 } if (xb < x0) { yb -= (x0 - xb) / k; xb = x0 } if (ya < yb) L(xa, ya, xb, yb, o.weight * 0.6, o.color) }
      break
    }
  }
  return P
}

export function paperSvg(o: PaperOpts): string {
  const body = paperPrims(o).map((p) => p.t === 'line' ? `<line x1="${r2(p.x1)}" y1="${r2(p.y1)}" x2="${r2(p.x2)}" y2="${r2(p.y2)}" stroke="${p.c}" stroke-width="${p.w}"${p.dash ? ' stroke-dasharray="1.2 1.2"' : ''}/>` : p.t === 'dot' ? `<circle cx="${r2(p.x)}" cy="${r2(p.y)}" r="${r2(p.r)}" fill="${p.c}"/>` : `<circle cx="${r2(p.x)}" cy="${r2(p.y)}" r="${r2(p.r)}" fill="none" stroke="${p.c}" stroke-width="${p.w}"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${o.w}mm" height="${o.h}mm" viewBox="0 0 ${o.w} ${o.h}"><rect width="100%" height="100%" fill="#fff"/>${body}</svg>`
}

/* ---------------- charts ---------------- */
export type ChartKind = 'bar' | 'hbar' | 'stacked' | 'line' | 'area' | 'pie' | 'donut' | 'scatter'
export interface ChartData { labels: string[]; series: { name: string; values: number[] }[] }

/** First row is the header, first column the labels, every other numeric column is a series. */
export function parseChartTable(text: string): ChartData {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) throw new Error('Add a header row and at least one row of data.')
  const delim = lines[0].includes('\t') ? '\t' : lines[0].split(';').length > lines[0].split(',').length ? ';' : ','
  const split = (l: string) => { const out: string[] = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === delim && !q) { out.push(cur.trim()); cur = '' } else cur += ch } out.push(cur.trim()); return out }
  const rows = lines.map(split)
  const head = rows[0], body = rows.slice(1)
  const num = (s: string) => { const v = Number(String(s ?? '').replace(/[,%$€£₹\s]/g, '')); return Number.isFinite(v) ? v : NaN }
  const series = head.slice(1).map((name, i) => ({ name: name || `Series ${i + 1}`, values: body.map((r) => num(r[i + 1])) })).filter((s) => s.values.some((v) => !Number.isNaN(v)))
  if (!series.length) throw new Error('No numbers found. Put labels in the first column and numbers in the next ones.')
  return { labels: body.map((r) => r[0] ?? ''), series: series.map((s) => ({ ...s, values: s.values.map((v) => (Number.isNaN(v) ? 0 : v)) })) }
}

/** Round axis ticks (1, 2, 2.5, 5 times a power of ten). */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) { max = min + 1 }
  const span = max - min, step0 = span / count, mag = Math.pow(10, Math.floor(Math.log10(step0)))
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= step0) ?? 10 * mag
  const a = Math.floor(min / step) * step, b = Math.ceil(max / step) * step, out: number[] = []
  for (let v = a; v <= b + step / 2; v += step) out.push(+v.toFixed(10))
  return out
}

export const fmtNum = (v: number) => (Math.abs(v) >= 1e6 ? r2(v / 1e6) + 'M' : Math.abs(v) >= 1e4 ? r2(v / 1e3) + 'k' : String(r2(v)))

export interface ChartOpts { kind: ChartKind; title: string; w: number; h: number; colors: string[]; bg: string; fg: string; grid: boolean; legend: boolean; values: boolean; font: string }
export function chartSvg(d: ChartData, o: ChartOpts): string {
  const { w, h } = o, col = (i: number) => o.colors[i % o.colors.length]
  const T = o.title ? 44 : 14, multi = d.series.length > 1 || o.kind === 'pie' || o.kind === 'donut'
  const legendItems = o.kind === 'pie' || o.kind === 'donut' ? d.labels : d.series.map((s) => s.name)
  const LG = o.legend && multi ? 30 : 0
  const parts: string[] = []
  const text = (x: number, y: number, s: string, size = 12, anchor = 'middle', extra = '') => `<text x="${r2(x)}" y="${r2(y)}" font-size="${size}" text-anchor="${anchor}" fill="${o.fg}"${extra}>${escXml(s)}</text>`
  if (o.title) parts.push(text(w / 2, 30, o.title, 20, 'middle', ' font-weight="700"'))
  if (LG) {
    let x = 16; const y = T + 6
    legendItems.forEach((n, i) => { parts.push(`<rect x="${x}" y="${y}" width="12" height="12" rx="3" fill="${col(i)}"/>`, text(x + 18, y + 11, n, 12, 'start')); x += 30 + Math.min(160, n.length * 7) })
  }
  const top = T + LG + 10
  if (o.kind === 'pie' || o.kind === 'donut') {
    const vals = d.series[0].values.map((v) => Math.max(0, v)), sum = vals.reduce((a, b) => a + b, 0) || 1
    const cx = w / 2, cy = top + (h - top) / 2, R = Math.min(w, h - top) / 2 - 20, ri = o.kind === 'donut' ? R * 0.58 : 0
    let a = -Math.PI / 2
    vals.forEach((v, i) => {
      const da = (v / sum) * Math.PI * 2, b = a + da, large = da > Math.PI ? 1 : 0
      const p = (r: number, t: number) => `${r2(cx + r * Math.cos(t))},${r2(cy + r * Math.sin(t))}`
      if (v > 0) {
        const path = da >= Math.PI * 2 - 1e-9 ? `M${p(R, a)}A${R},${R} 0 1 1 ${p(R, a + Math.PI)}A${R},${R} 0 1 1 ${p(R, a)}Z` : ri ? `M${p(R, a)}A${R},${R} 0 ${large} 1 ${p(R, b)}L${p(ri, b)}A${ri},${ri} 0 ${large} 0 ${p(ri, a)}Z` : `M${cx},${cy}L${p(R, a)}A${R},${R} 0 ${large} 1 ${p(R, b)}Z`
        parts.push(`<path d="${path}" fill="${col(i)}" stroke="${o.bg === 'none' ? '#fff' : o.bg}" stroke-width="2"/>`)
        if (o.values && da > 0.25) { const m = (a + b) / 2, rr = ri ? (R + ri) / 2 : R * 0.65; parts.push(text(cx + rr * Math.cos(m), cy + rr * Math.sin(m) + 4, `${Math.round((v / sum) * 100)}%`, 13, 'middle', ' font-weight="600"')) }
      }
      a = b
    })
  } else {
    const L = 56, R = 16, B = 46, x0 = L, x1 = w - R, y0 = top, y1 = h - B
    const n = d.labels.length
    const stacked = o.kind === 'stacked'
    const all = stacked ? d.labels.map((_, i) => d.series.reduce((a, s) => a + Math.max(0, s.values[i]), 0)) : d.series.flatMap((s) => s.values)
    const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all))
    const vmin = ticks[0], vmax = ticks[ticks.length - 1]
    const horiz = o.kind === 'hbar'
    const vy = (v: number) => y1 - ((v - vmin) / (vmax - vmin)) * (y1 - y0)
    const vx = (v: number) => x0 + ((v - vmin) / (vmax - vmin)) * (x1 - x0)
    for (const t of ticks) {
      if (horiz) { if (o.grid) parts.push(`<line x1="${r2(vx(t))}" y1="${y0}" x2="${r2(vx(t))}" y2="${y1}" stroke="${o.fg}" stroke-opacity="0.15"/>`); parts.push(text(vx(t), y1 + 18, fmtNum(t), 11)) }
      else { if (o.grid) parts.push(`<line x1="${x0}" y1="${r2(vy(t))}" x2="${x1}" y2="${r2(vy(t))}" stroke="${o.fg}" stroke-opacity="0.15"/>`); parts.push(text(x0 - 8, vy(t) + 4, fmtNum(t), 11, 'end')) }
    }
    const band = ((horiz ? y1 - y0 : x1 - x0) / Math.max(1, n))
    const showEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor((x1 - x0) / 60))))
    d.labels.forEach((l, i) => {
      if (horiz) parts.push(text(x0 - 8, y0 + band * (i + 0.5) + 4, l.slice(0, 14), 11, 'end'))
      else if (i % showEvery === 0) parts.push(text(o.kind === 'scatter' || o.kind === 'line' || o.kind === 'area' ? x0 + (n > 1 ? ((x1 - x0) * i) / (n - 1) : (x1 - x0) / 2) : x0 + band * (i + 0.5), y1 + 18, l.slice(0, 14), 11))
    })
    if (o.kind === 'bar' || o.kind === 'hbar' || o.kind === 'stacked') {
      const k = d.series.length, inner = band * 0.78, bw = stacked ? inner : inner / k
      d.labels.forEach((_, i) => {
        let acc = 0
        d.series.forEach((s, j) => {
          const v = s.values[i]
          if (horiz) { const y = y0 + band * i + (band - inner) / 2 + j * bw, xa = vx(Math.min(0, v)), xb = vx(Math.max(0, v)); parts.push(`<rect x="${r2(xa)}" y="${r2(y)}" width="${r2(xb - xa)}" height="${r2(bw - 2)}" rx="3" fill="${col(j)}"/>`); if (o.values) parts.push(text(xb + 4, y + bw / 2 + 4, fmtNum(v), 11, 'start')) }
          else {
            const x = x0 + band * i + (band - inner) / 2 + (stacked ? 0 : j * bw)
            const a = stacked ? acc : 0, b = stacked ? acc + Math.max(0, v) : v
            const ya = vy(Math.max(a, b)), yb = vy(Math.min(a, b)); acc = stacked ? b : acc
            parts.push(`<rect x="${r2(x + 1)}" y="${r2(ya)}" width="${r2(bw - 2)}" height="${r2(Math.max(0, yb - ya))}" rx="3" fill="${col(j)}"/>`)
            if (o.values && !stacked) parts.push(text(x + bw / 2, ya - 5, fmtNum(v), 11))
          }
        })
        if (o.values && stacked) parts.push(text(x0 + band * (i + 0.5), vy(acc) - 5, fmtNum(acc), 11))
      })
    } else {
      const px = (i: number) => x0 + (n > 1 ? ((x1 - x0) * i) / (n - 1) : (x1 - x0) / 2)
      d.series.forEach((s, j) => {
        const pts = s.values.map((v, i) => `${r2(px(i))},${r2(vy(v))}`)
        if (o.kind === 'area') parts.push(`<path d="M${px(0)},${r2(vy(Math.max(vmin, 0)))}L${pts.join('L')}L${r2(px(n - 1))},${r2(vy(Math.max(vmin, 0)))}Z" fill="${col(j)}" fill-opacity="0.28"/>`)
        if (o.kind !== 'scatter') parts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${col(j)}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`)
        s.values.forEach((v, i) => { parts.push(`<circle cx="${r2(px(i))}" cy="${r2(vy(v))}" r="${o.kind === 'scatter' ? 5 : 3.5}" fill="${col(j)}"/>`); if (o.values) parts.push(text(px(i), vy(v) - 9, fmtNum(v), 10)) })
      })
    }
    parts.push(`<line x1="${x0}" y1="${horiz ? y1 : r2(vy(Math.max(vmin, 0)))}" x2="${x1}" y2="${horiz ? y1 : r2(vy(Math.max(vmin, 0)))}" stroke="${o.fg}" stroke-opacity="0.5"/>`)
  }
  const bg = o.bg === 'none' ? '' : `<rect width="100%" height="100%" fill="${o.bg}" rx="0"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="${escXml(o.font)}">${bg}${parts.join('')}</svg>`
}

/* ---------------- code image themes ---------------- */
export interface CodeTheme { id: string; name: string; bg: string; fg: string; comment: string; keyword: string; string: string; number: string; title: string; attr: string; type: string; meta: string; dark: boolean }
export const CODE_THEMES: CodeTheme[] = [
  { id: 'gold', name: 'Gold night', bg: '#0F1115', fg: '#E8E6E3', comment: '#6B7280', keyword: '#F5A524', string: '#34D399', number: '#FB923C', title: '#38BDF8', attr: '#22D3EE', type: '#2DD4BF', meta: '#A3E635', dark: true },
  { id: 'ocean', name: 'Ocean', bg: '#0B1D2A', fg: '#D7E7F0', comment: '#5B7A8C', keyword: '#22D3EE', string: '#A3E635', number: '#FDBA74', title: '#FBBF24', attr: '#5EEAD4', type: '#38BDF8', meta: '#FCD34D', dark: true },
  { id: 'forest', name: 'Forest', bg: '#0E1A14', fg: '#DDE8DF', comment: '#5F7A68', keyword: '#4ADE80', string: '#FDE68A', number: '#FB923C', title: '#67E8F9', attr: '#A3E635', type: '#2DD4BF', meta: '#FACC15', dark: true },
  { id: 'mono', name: 'Mono dark', bg: '#111111', fg: '#EDEDED', comment: '#777777', keyword: '#FFFFFF', string: '#C8C8C8', number: '#D9D9D9', title: '#FFFFFF', attr: '#BBBBBB', type: '#E0E0E0', meta: '#999999', dark: true },
  { id: 'paper', name: 'Paper', bg: '#FBF8F1', fg: '#1F2328', comment: '#8A8F98', keyword: '#B45309', string: '#047857', number: '#C2410C', title: '#0369A1', attr: '#0E7490', type: '#0F766E', meta: '#4D7C0F', dark: false },
  { id: 'github', name: 'Light', bg: '#FFFFFF', fg: '#24292F', comment: '#6E7781', keyword: '#CF222E', string: '#0A3069', number: '#0550AE', title: '#953800', attr: '#116329', type: '#0550AE', meta: '#57606A', dark: false },
]
/** Colour for a highlight.js class list, for a theme. */
export function tokenColor(cls: string, t: CodeTheme): string | null {
  if (/comment|quote/.test(cls)) return t.comment
  if (/keyword|selector-tag|built_in|literal|doctag/.test(cls)) return t.keyword
  if (/string|regexp|addition|template/.test(cls)) return t.string
  if (/number|symbol|bullet|deletion/.test(cls)) return t.number
  if (/title|section|function/.test(cls)) return t.title
  if (/attr|attribute|property|variable|params|selector-class|selector-id/.test(cls)) return t.attr
  if (/type|class/.test(cls)) return t.type
  if (/meta|tag|name/.test(cls)) return t.meta
  return null
}
