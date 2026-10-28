/* Pure photo enhancement steps on RGBA buffers (Batch 2, photo-enhancer). Node-testable: no DOM.
   Everything works in place on a Uint8ClampedArray of width w and height h. */

export type Px = Uint8ClampedArray

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)
const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b

/** Percentile (0..1) of a 256-bin histogram with `n` samples. */
function pct(hist: Uint32Array, n: number, p: number, strict = false) {
  const target = n * p; let acc = 0
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (strict ? acc > target : acc >= target) return i }
  return 255
}

/** Auto levels: stretch the tonal range so `clip` (fraction) of pixels go to pure black and white.
    Uses one curve for all channels (from brightness) so colours do not shift. amount 0..1 blends with the original. */
export function autoLevels(d: Px, clip = 0.005, amount = 1) {
  const hist = new Uint32Array(256), n = d.length / 4
  for (let i = 0; i < d.length; i += 4) hist[Math.round(luma(d[i], d[i + 1], d[i + 2]))]++
  let lo = pct(hist, n, clip, true), hi = pct(hist, n, 1 - clip)
  if (hi - lo < 10) return { lo, hi }
  // cap the gain at about 2.5x so foggy or low-key photos are not blown apart
  const span = 100
  if (hi - lo < span) { const mid = (hi + lo) / 2; lo = Math.max(0, mid - span / 2); hi = Math.min(255, lo + span); lo = hi - span }
  const lut = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) lut[v] = clamp(v + (((v - lo) * 255) / (hi - lo) - v) * amount)
  for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]] }
  return { lo, hi }
}

/** White balance from the brighter mid-tones (a robust grey world). amount 0..1. Returns the gains used. */
export function whiteBalance(d: Px, amount = 1): [number, number, number] {
  let r = 0, g = 0, b = 0, k = 0
  for (let i = 0; i < d.length; i += 4) {
    const y = luma(d[i], d[i + 1], d[i + 2])
    if (y < 40 || y > 245) continue // skip deep shadows and clipped highlights
    r += d[i]; g += d[i + 1]; b += d[i + 2]; k++
  }
  if (!k) return [1, 1, 1]
  r /= k; g /= k; b /= k
  const m = (r + g + b) / 3
  const lim = (x: number) => Math.min(1.6, Math.max(0.6, x))
  const gr = 1 + (lim(m / (r || 1)) - 1) * amount, gg = 1 + (lim(m / (g || 1)) - 1) * amount, gb = 1 + (lim(m / (b || 1)) - 1) * amount
  for (let i = 0; i < d.length; i += 4) { d[i] = clamp(d[i] * gr); d[i + 1] = clamp(d[i + 1] * gg); d[i + 2] = clamp(d[i + 2] * gb) }
  return [gr, gg, gb]
}

/** Box mean of a float plane with radius r (O(n), separable running sums). */
export function boxMean(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const row = y * w; let s = 0, c = 0
    for (let x = -r; x <= r; x++) if (x >= 0 && x < w) { s += src[row + x]; c++ }
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s / c
      const xo = x - r, xi = x + r + 1
      if (xo >= 0) { s -= src[row + xo]; c-- }
      if (xi < w) { s += src[row + xi]; c++ }
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0, c = 0
    for (let y = -r; y <= r; y++) if (y >= 0 && y < h) { s += tmp[y * w + x]; c++ }
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / c
      const yo = y - r, yi = y + r + 1
      if (yo >= 0) { s -= tmp[yo * w + x]; c-- }
      if (yi < h) { s += tmp[yi * w + x]; c++ }
    }
  }
  return out
}

/** Skin likelihood 0..1 per pixel from YCbCr ranges, softened. Used to keep faces smooth and natural. */
export function skinMask(d: Px, w: number, h: number, ref = Math.max(w, h)): Float32Array {
  const m = new Float32Array(w * h)
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const r = d[i], g = d[i + 1], b = d[i + 2]
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b, cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
    const y = luma(r, g, b)
    if (y < 45 || y > 250) continue
    // distance to the centre of the classic skin cluster (Cb 77..127, Cr 133..173)
    const dc = Math.hypot((cb - 102) / 25, (cr - 153) / 20)
    m[p] = dc < 1 ? 1 : dc < 1.5 ? (1.5 - dc) * 2 : 0
  }
  return boxMean(m, w, h, Math.max(2, Math.round(ref / 300)))
}

/** Edge-preserving denoise with a guided filter (He et al.) on each channel, guided by itself.
    strength 0..1. `skin` (optional) adds extra smoothing on skin up to skinBoost. */
export function denoise(d: Px, w: number, h: number, strength = 0.5, skin?: Float32Array, skinBoost = 0.5, ref = Math.max(w, h)) {
  if (strength <= 0 && !skin) return
  const n = w * h, r = Math.max(1, Math.round(1 + strength * 3 + ref / 2000))
  const eps = (0.0004 + strength * strength * 0.02) * 255 * 255
  const I = new Float32Array(n), II = new Float32Array(n)
  for (let c = 0; c < 3; c++) {
    for (let p = 0; p < n; p++) { const v = d[p * 4 + c]; I[p] = v; II[p] = v * v }
    const mI = boxMean(I, w, h, r), mII = boxMean(II, w, h, r)
    const A = new Float32Array(n), B = new Float32Array(n)
    for (let p = 0; p < n; p++) { const v = mII[p] - mI[p] * mI[p]; const a = v / (v + eps); A[p] = a; B[p] = mI[p] - a * mI[p] }
    const mA = boxMean(A, w, h, r), mB = boxMean(B, w, h, r)
    for (let p = 0; p < n; p++) {
      const q = mA[p] * I[p] + mB[p]
      const k = Math.min(1, strength + (skin ? skin[p] * skinBoost : 0))
      d[p * 4 + c] = clamp(I[p] + (q - I[p]) * k)
    }
  }
}

/** Unsharp mask on brightness only (no colour fringes). amount 0..2, radius px, threshold 0..255.
    `skin` lowers sharpening on skin so pores and wrinkles are not exaggerated. */
export function sharpen(d: Px, w: number, h: number, amount = 0.6, radius = 1, threshold = 2, skin?: Float32Array) {
  if (amount <= 0) return
  const n = w * h, Y = new Float32Array(n)
  for (let p = 0; p < n; p++) Y[p] = luma(d[p * 4], d[p * 4 + 1], d[p * 4 + 2])
  // two box passes approximate a gaussian
  const r = Math.max(1, Math.round(radius))
  const blur = boxMean(boxMean(Y, w, h, r), w, h, r)
  for (let p = 0; p < n; p++) {
    let diff = Y[p] - blur[p]
    if (Math.abs(diff) < threshold) continue
    diff *= amount * (skin ? 1 - 0.75 * skin[p] : 1)
    d[p * 4] = clamp(d[p * 4] + diff); d[p * 4 + 1] = clamp(d[p * 4 + 1] + diff); d[p * 4 + 2] = clamp(d[p * 4 + 2] + diff)
  }
}

/** Lift shadows and pull highlights gently (0..1 each). */
export function toneRecover(d: Px, shadows = 0, highlights = 0) {
  if (!shadows && !highlights) return
  const lut = new Float32Array(256)
  for (let v = 0; v < 256; v++) {
    const x = v / 255
    const s = shadows * 0.5 * (1 - x) ** 3 * x * 4 // bump centred in the shadows
    const hl = highlights * 0.5 * x ** 3 * (1 - x) * 4
    lut[v] = (x + s - hl) / Math.max(1e-6, x || 1e-6)
  }
  for (let i = 0; i < d.length; i += 4) {
    const y = Math.round(luma(d[i], d[i + 1], d[i + 2])), k = y ? lut[y] : 1 + shadows * 0.1
    d[i] = clamp(d[i] * k); d[i + 1] = clamp(d[i + 1] * k); d[i + 2] = clamp(d[i + 2] * k)
  }
}

/** Vibrance: boost saturation of muted colours more than already saturated ones. amount -1..1. */
export function vibrance(d: Px, amount = 0.2, skin?: Float32Array) {
  if (!amount) return
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const r = d[i], g = d[i + 1], b = d[i + 2]
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0
    const y = luma(r, g, b)
    const k = 1 + amount * (1 - sat) * (skin ? 1 - 0.6 * skin[p] : 1)
    d[i] = clamp(y + (r - y) * k); d[i + 1] = clamp(y + (g - y) * k); d[i + 2] = clamp(y + (b - y) * k)
  }
}

export type EnhanceOpts = {
  levels: number // 0..1
  wb: number // 0..1
  denoise: number // 0..1
  sharpen: number // 0..1.5
  shadows: number // 0..1
  highlights: number // 0..1
  vibrance: number // -0.5..0.8
  face: boolean
}
export const ENHANCE_DEFAULT: EnhanceOpts = { levels: 0.8, wb: 0.6, denoise: 0.25, sharpen: 0.6, shadows: 0.25, highlights: 0.2, vibrance: 0.15, face: true }
export const ENHANCE_PRESETS: Record<string, { label: string; opts: EnhanceOpts }> = {
  auto: { label: 'Auto', opts: ENHANCE_DEFAULT },
  portrait: { label: 'Portrait', opts: { levels: 0.6, wb: 0.5, denoise: 0.35, sharpen: 0.45, shadows: 0.3, highlights: 0.25, vibrance: 0.1, face: true } },
  old: { label: 'Old photo', opts: { levels: 1, wb: 0.8, denoise: 0.55, sharpen: 0.8, shadows: 0.3, highlights: 0.3, vibrance: 0.05, face: true } },
  lowlight: { label: 'Low light', opts: { levels: 0.9, wb: 0.5, denoise: 0.65, sharpen: 0.35, shadows: 0.7, highlights: 0.1, vibrance: 0.2, face: true } },
  crisp: { label: 'Crisp', opts: { levels: 0.7, wb: 0.4, denoise: 0.1, sharpen: 1.1, shadows: 0.15, highlights: 0.2, vibrance: 0.3, face: false } },
}

/** Global steps (need whole-image statistics). In place, no extra memory. */
export function enhanceGlobal(d: Px, o: EnhanceOpts) {
  if (o.wb > 0) whiteBalance(d, o.wb)
  if (o.levels > 0) autoLevels(d, 0.004, o.levels)
  toneRecover(d, o.shadows, o.highlights)
}
/** Local steps (neighbourhood filters). `ref` is the long side of the full image so radii match between a preview,
    a strip of a big image and the whole image. */
export function enhanceLocal(d: Px, w: number, h: number, o: EnhanceOpts, ref = Math.max(w, h)) {
  const skin = o.face ? skinMask(d, w, h, ref) : undefined
  if (o.denoise > 0 || skin) denoise(d, w, h, o.denoise, skin, o.face ? 0.35 : 0, ref)
  vibrance(d, o.vibrance, skin)
  sharpen(d, w, h, o.sharpen, Math.max(1, Math.round(ref / 1500)), 2, skin)
}
/** Run the whole chain in a sensible order. Radii follow the image size so a preview looks like the full-size result. */
export function enhance(d: Px, w: number, h: number, o: EnhanceOpts) {
  enhanceGlobal(d, o)
  enhanceLocal(d, w, h, o)
}

/** Rows of overlap needed around a strip so local filters see the same neighbourhood. */
export const stripOverlap = (ref: number) => 16 + 4 * Math.max(1, Math.round(ref / 1500))
