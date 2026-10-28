/* Palette extraction: k-means++ (in OKLab-ish perceptual space) and median-cut, plus Vibrant/Muted swatches. Pure functions. */
import { RGBA, rgbToHsl, rgbToOklab } from './color'

export type Swatch = { color: RGBA; population: number; share: number }

/** Sample opaque pixels down to at most `max` entries */
export function samplePixels(data: Uint8ClampedArray, max = 24000): number[][] {
  const total = data.length / 4
  const step = Math.max(1, Math.floor(total / max))
  const out: number[][] = []
  for (let i = 0; i < total; i += step) {
    const o = i * 4
    if (data[o + 3] < 125) continue
    out.push([data[o], data[o + 1], data[o + 2]])
  }
  return out
}

function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 } }

export function kmeans(px: number[][], k: number, iters = 18): Swatch[] {
  if (!px.length) return []
  const rand = rng(42)
  const lab = px.map(([r, g, b]) => { const o = rgbToOklab({ r, g, b, a: 1 }); return [o.L, o.a, o.b] })
  const d2 = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  // k-means++ init
  const cents: number[][] = [lab[Math.floor(rand() * lab.length)].slice()]
  const dist = new Float64Array(lab.length).fill(Infinity)
  while (cents.length < k) {
    let sum = 0
    const c = cents[cents.length - 1]
    for (let i = 0; i < lab.length; i++) { const d = d2(lab[i], c); if (d < dist[i]) dist[i] = d; sum += dist[i] }
    if (sum === 0) break
    let t = rand() * sum, idx = 0
    for (; idx < lab.length - 1; idx++) { t -= dist[idx]; if (t <= 0) break }
    cents.push(lab[idx].slice())
  }
  const assign = new Int32Array(lab.length)
  for (let it = 0; it < iters; it++) {
    let moved = 0
    for (let i = 0; i < lab.length; i++) {
      let best = 0, bd = Infinity
      for (let j = 0; j < cents.length; j++) { const d = d2(lab[i], cents[j]); if (d < bd) { bd = d; best = j } }
      if (assign[i] !== best) { assign[i] = best; moved++ }
    }
    const acc = cents.map(() => [0, 0, 0, 0])
    for (let i = 0; i < lab.length; i++) { const a = acc[assign[i]]; a[0] += lab[i][0]; a[1] += lab[i][1]; a[2] += lab[i][2]; a[3]++ }
    acc.forEach((a, j) => { if (a[3]) cents[j] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]] })
    if (it > 2 && moved < lab.length * 0.002) break
  }
  // average in RGB for exact display colours
  const rgb = cents.map(() => [0, 0, 0, 0])
  for (let i = 0; i < px.length; i++) { const a = rgb[assign[i]]; a[0] += px[i][0]; a[1] += px[i][1]; a[2] += px[i][2]; a[3]++ }
  return finish(rgb.filter((a) => a[3] > 0).map((a) => ({ color: { r: a[0] / a[3], g: a[1] / a[3], b: a[2] / a[3], a: 1 }, population: a[3] })), px.length)
}

export function medianCut(px: number[][], k: number): Swatch[] {
  if (!px.length) return []
  type Box = number[][]
  const range = (b: Box) => { const mn = [255, 255, 255], mx = [0, 0, 0]; for (const p of b) for (let c = 0; c < 3; c++) { if (p[c] < mn[c]) mn[c] = p[c]; if (p[c] > mx[c]) mx[c] = p[c] } return mx.map((v, i) => v - mn[i]) }
  const boxes: Box[] = [px.slice()]
  while (boxes.length < k) {
    // split box with biggest (range * count)
    let bi = -1, score = -1
    boxes.forEach((b, i) => { if (b.length < 2) return; const r = range(b); const s = Math.max(...r) * Math.sqrt(b.length); if (s > score) { score = s; bi = i } })
    if (bi < 0) break
    const b = boxes[bi]; const r = range(b); const ch = r.indexOf(Math.max(...r))
    b.sort((x, y) => x[ch] - y[ch])
    // split at the mean value of the channel (keeps clusters together better than the count median)
    let mean = 0; for (const p of b) mean += p[ch]; mean /= b.length
    let mid = b.findIndex((p) => p[ch] > mean)
    if (mid <= 0 || mid >= b.length) mid = b.length >> 1
    boxes.splice(bi, 1, b.slice(0, mid), b.slice(mid))
  }
  return finish(boxes.map((b) => { const s = [0, 0, 0]; for (const p of b) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2] } return { color: { r: s[0] / b.length, g: s[1] / b.length, b: s[2] / b.length, a: 1 }, population: b.length } }), px.length)
}

function finish(list: { color: RGBA; population: number }[], total: number): Swatch[] {
  // merge near-duplicates
  const out: { color: RGBA; population: number }[] = []
  for (const s of list.sort((a, b) => b.population - a.population)) {
    const o = rgbToOklab(s.color)
    const dup = out.find((x) => { const p = rgbToOklab(x.color); return (p.L - o.L) ** 2 + (p.a - o.a) ** 2 + (p.b - o.b) ** 2 < 0.0004 })
    if (dup) dup.population += s.population; else out.push({ ...s })
  }
  return out.sort((a, b) => b.population - a.population).map((s) => ({ ...s, color: { r: Math.round(s.color.r), g: Math.round(s.color.g), b: Math.round(s.color.b), a: 1 }, share: s.population / total }))
}

/** node-vibrant style named swatches */
export const VIBRANT_TARGETS = [
  { name: 'Vibrant', l: 0.5, minL: 0.3, maxL: 0.7, s: 1, minS: 0.35 , maxS: 1 },
  { name: 'Light Vibrant', l: 0.74, minL: 0.55, maxL: 0.9, s: 1, minS: 0.35, maxS: 1 },
  { name: 'Dark Vibrant', l: 0.26, minL: 0, maxL: 0.45, s: 1, minS: 0.35, maxS: 1 },
  { name: 'Muted', l: 0.5, minL: 0.3, maxL: 0.7, s: 0.3, minS: 0, maxS: 0.4 },
  { name: 'Light Muted', l: 0.74, minL: 0.55, maxL: 1, s: 0.3, minS: 0, maxS: 0.4 },
  { name: 'Dark Muted', l: 0.26, minL: 0, maxL: 0.45, s: 0.3, minS: 0, maxS: 0.4 },
]
export function vibrantSwatches(px: number[][]): { name: string; color: RGBA | null }[] {
  const cands = medianCut(px, 48)
  const maxPop = Math.max(1, ...cands.map((c) => c.population))
  const used = new Set<Swatch>()
  return VIBRANT_TARGETS.map((t) => {
    let best: Swatch | null = null, bs = -Infinity
    for (const c of cands) {
      if (used.has(c)) continue
      const { s, l } = rgbToHsl(c.color); const S = s / 100, L = l / 100
      if (S < t.minS || S > t.maxS || L < t.minL || L > t.maxL) continue
      const score = (1 - Math.abs(S - t.s)) * 3 + (1 - Math.abs(L - t.l)) * 6 + (c.population / maxPop) * 1
      if (score > bs) { bs = score; best = c }
    }
    if (best) used.add(best)
    return { name: t.name, color: best ? best.color : null }
  })
}
