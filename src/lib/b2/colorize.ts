/* Pure helpers for DDColor colourisation (Batch 2). Node-testable: no DOM.
   DDColor works in CIE Lab (OpenCV float convention): the model sees a grey RGB image built from L only,
   predicts the a/b channels at 512x512, and we merge them with the full-resolution L of the original. */
import { rgbToLab, labToRgb } from './lab.ts'

export const DDCOLOR_SIZE = 512

// sRGB byte -> linear lookup, used to compute L quickly for big images.
const LIN = new Float32Array(256)
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }

/** CIE L (0..100) of every pixel of an RGBA buffer. */
export function lightness(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Float32Array {
  const n = w * h, out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const Y = 0.212671 * LIN[rgba[i * 4]] + 0.71516 * LIN[rgba[i * 4 + 1]] + 0.072169 * LIN[rgba[i * 4 + 2]]
    out[i] = Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y
  }
  return out
}

/** Model input: planar [3,S,S] float 0..1, the grey RGB image that has the same L as the source and a = b = 0. */
export function ddcolorInput(rgba: Uint8ClampedArray | Uint8Array, S = DDCOLOR_SIZE): Float32Array {
  const L = lightness(rgba, S, S), n = S * S, out = new Float32Array(3 * n)
  for (let i = 0; i < n; i++) { const g = labToRgb(L[i], 0, 0)[0]; out[i] = g; out[n + i] = g; out[2 * n + i] = g }
  return out
}

/** Bilinear sample of a planar S x S float grid at (x, y) in grid pixels (pixel centres at i + 0.5). */
function sample(grid: Float32Array, off: number, S: number, x: number, y: number) {
  const fx = Math.min(S - 1, Math.max(0, x - 0.5)), fy = Math.min(S - 1, Math.max(0, y - 0.5))
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(S - 1, x0 + 1), y1 = Math.min(S - 1, y0 + 1)
  const tx = fx - x0, ty = fy - y0
  const a = grid[off + y0 * S + x0], b = grid[off + y0 * S + x1], c = grid[off + y1 * S + x0], d = grid[off + y1 * S + x1]
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
}

/** Merge predicted ab [2,S,S] with the full-size image's L. strength scales colour (1 = model output). Alpha is kept.
    Writes into and returns a new RGBA buffer. */
export function mergeAB(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, ab: Float32Array, strength = 1, S = DDCOLOR_SIZE): Uint8ClampedArray {
  const L = lightness(rgba, w, h), out = new Uint8ClampedArray(w * h * 4)
  const sx = S / w, sy = S / h
  for (let y = 0; y < h; y++) {
    const gy = (y + 0.5) * sy
    for (let x = 0; x < w; x++) {
      const i = y * w + x, gx = (x + 0.5) * sx
      const a = sample(ab, 0, S, gx, gy) * strength, b = sample(ab, S * S, S, gx, gy) * strength
      const [r, g, bl] = labToRgb(L[i], a, b)
      out[i * 4] = Math.round(r * 255); out[i * 4 + 1] = Math.round(g * 255); out[i * 4 + 2] = Math.round(bl * 255); out[i * 4 + 3] = rgba[i * 4 + 3]
    }
  }
  return out
}

/** Mean chroma (sqrt(a^2 + b^2)) of an RGBA buffer, sampled. Used to tell whether a photo already has colour. */
export function meanChroma(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): number {
  const n = w * h, step = Math.max(1, Math.floor(n / 20000)); let s = 0, k = 0
  for (let i = 0; i < n; i += step) { const [, a, b] = rgbToLab(rgba[i * 4] / 255, rgba[i * 4 + 1] / 255, rgba[i * 4 + 2] / 255); s += Math.hypot(a, b); k++ }
  return k ? s / k : 0
}
