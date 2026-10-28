/* Pure image-difference helpers (no DOM). Perceptual YIQ distance, like pixelmatch, plus PSNR. */

function yiqDelta(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  const y = (r1 - r2) * 0.29889531 + (g1 - g2) * 0.58662247 + (b1 - b2) * 0.11448223
  const i = (r1 - r2) * 0.59597799 - (g1 - g2) * 0.2741761 - (b1 - b2) * 0.32180189
  const q = (r1 - r2) * 0.21147017 - (g1 - g2) * 0.52261711 + (b1 - b2) * 0.31114694
  return 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q
}
const MAX_DELTA = 35215

export type DiffResult = { diffCount: number; total: number; percent: number; psnr: number; out: Uint8ClampedArray<ArrayBuffer>; bbox: [number, number, number, number] | null }

/** Compare two RGBA buffers of equal size. threshold 0..1 (0.1 is a good default). */
export function diffImages(a: Uint8ClampedArray | Uint8Array, b: Uint8ClampedArray | Uint8Array, w: number, h: number, opts: { threshold?: number; mode?: 'heatmap' | 'highlight' | 'abs'; color?: [number, number, number] } = {}): DiffResult {
  const thr = (opts.threshold ?? 0.1) ** 2 * MAX_DELTA
  const mode = opts.mode ?? 'highlight'
  const [hr, hg, hb] = opts.color ?? [245, 165, 36]
  const out = new Uint8ClampedArray(w * h * 4)
  let count = 0, se = 0, x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    // blend with white for alpha
    const aA = a[i + 3] / 255, aB = b[i + 3] / 255
    const r1 = 255 + (a[i] - 255) * aA, g1 = 255 + (a[i + 1] - 255) * aA, b1 = 255 + (a[i + 2] - 255) * aA
    const r2 = 255 + (b[i] - 255) * aB, g2 = 255 + (b[i + 1] - 255) * aB, b2 = 255 + (b[i + 2] - 255) * aB
    se += ((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2) / 3
    const d = yiqDelta(r1, g1, b1, r2, g2, b2)
    const hit = d > thr
    if (hit) { count++; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y }
    if (mode === 'abs') { out[i] = Math.abs(r1 - r2); out[i + 1] = Math.abs(g1 - g2); out[i + 2] = Math.abs(b1 - b2); out[i + 3] = 255 }
    else if (mode === 'heatmap') {
      const t = Math.min(1, Math.sqrt(d / MAX_DELTA) * 2.2)
      // dark -> teal -> gold -> white
      const g = 0.1 + 0.9 * (0.299 * r1 + 0.587 * g1 + 0.114 * b1) / 255 * 0.25
      if (t < 0.02) { out[i] = out[i + 1] = out[i + 2] = g * 255 }
      else if (t < 0.5) { const k = t / 0.5; out[i] = 20 + k * (245 - 20); out[i + 1] = 184 + k * (165 - 184); out[i + 2] = 166 + k * (36 - 166) }
      else { const k = (t - 0.5) / 0.5; out[i] = 245 + k * 10; out[i + 1] = 165 + k * 90; out[i + 2] = 36 + k * 219 }
      out[i + 3] = 255
    } else {
      if (hit) { out[i] = hr; out[i + 1] = hg; out[i + 2] = hb; out[i + 3] = 255 }
      else { const l = 255 - (255 - (0.299 * r1 + 0.587 * g1 + 0.114 * b1)) * 0.15; out[i] = out[i + 1] = out[i + 2] = l; out[i + 3] = 255 }
    }
  }
  const mse = se / (w * h)
  return { diffCount: count, total: w * h, percent: (count / (w * h)) * 100, psnr: mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse), out, bbox: x1 >= 0 ? [x0, y0, x1 - x0 + 1, y1 - y0 + 1] : null }
}
