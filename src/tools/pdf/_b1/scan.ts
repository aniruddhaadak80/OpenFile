/* Document scanner maths: corner detection, perspective correction and scan enhancement. Pure, works on RGBA buffers. */
export type Pt = { x: number; y: number }
export type Quad = [Pt, Pt, Pt, Pt] // top-left, top-right, bottom-right, bottom-left
export interface Img { data: Uint8ClampedArray | Uint8Array; width: number; height: number }

/** Solve the 3x3 homography mapping src[i] -> dst[i] (4 points). */
export function homography(src: Pt[], dst: Pt[]): number[] {
  const A: number[][] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: u, y: v } = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v])
  }
  // gaussian elimination on 8x9
  for (let c = 0; c < 8; c++) {
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r
    ;[A[c], A[p]] = [A[p], A[c]]
    const d = A[c][c] || 1e-12
    for (let k = c; k < 9; k++) A[c][k] /= d
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c]; for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k] }
  }
  return [A[0][8], A[1][8], A[2][8], A[3][8], A[4][8], A[5][8], A[6][8], A[7][8], 1]
}
export const applyH = (h: number[], x: number, y: number): Pt => { const w = h[6] * x + h[7] * y + h[8]; return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w } }
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

/** Output size of the straightened page from the quad's side lengths. */
export function quadSize(q: Quad, maxSide = 2400) {
  let w = Math.max(dist(q[0], q[1]), dist(q[3], q[2])), h = Math.max(dist(q[0], q[3]), dist(q[1], q[2]))
  const s = Math.min(1, maxSide / Math.max(w, h))
  return { w: Math.max(8, Math.round(w * s)), h: Math.max(8, Math.round(h * s)) }
}

/** Warp the quad of `src` into a w×h rectangle (bilinear sampling). */
export function warp(src: Img, q: Quad, w: number, h: number): Uint8ClampedArray {
  const H = homography([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], q) // dst rect -> src quad
  const out = new Uint8ClampedArray(w * h * 4)
  const { data, width: sw, height: sh } = src
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = applyH(H, x + 0.5, y + 0.5)
    const fx = Math.max(0, Math.min(sw - 1.001, p.x - 0.5)), fy = Math.max(0, Math.min(sh - 1.001, p.y - 0.5))
    const x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0
    const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4
    const o = (y * w + x) * 4
    for (let c = 0; c < 3; c++) out[o + c] = (data[i00 + c] * (1 - ax) + data[i10 + c] * ax) * (1 - ay) + (data[i01 + c] * (1 - ax) + data[i11 + c] * ax) * ay
    out[o + 3] = 255
  }
  return out
}

/** Otsu threshold of a grayscale histogram */
function otsu(gray: Uint8Array) {
  const hist = new Array(256).fill(0); for (const v of gray) hist[v]++
  const total = gray.length; let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0, wB = 0, best = 0, t = 128
  for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = total - wB; if (!wF) break; sumB += i * hist[i]; const mB = sumB / wB, mF = (sum - sumB) / wF; const between = wB * wF * (mB - mF) ** 2; if (between > best) { best = between; t = i } }
  return t
}

/** Find the page: the largest bright connected region, then its four extreme corners. Falls back to a small inset. */
export function detectQuad(src: Img): Quad {
  const scale = Math.min(1, 320 / Math.max(src.width, src.height))
  const w = Math.max(4, Math.round(src.width * scale)), h = Math.max(4, Math.round(src.height * scale))
  const gray = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(src.width - 1, Math.floor(x / scale)), sy = Math.min(src.height - 1, Math.floor(y / scale))
    const i = (sy * src.width + sx) * 4
    gray[y * w + x] = src.data[i] * 0.299 + src.data[i + 1] * 0.587 + src.data[i + 2] * 0.114
  }
  // light blur to remove text holes
  const bl = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h && xx >= 0 && xx < w) { s += gray[yy * w + xx]; n++ } } bl[y * w + x] = s / n }
  const t = otsu(bl)
  const mask = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) mask[i] = bl[i] > t ? 1 : 0
  // largest component (4-connected) via BFS
  const label = new Int32Array(w * h); let best = -1, bestSize = 0, cur = 0
  const stack: number[] = []
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || label[i]) continue
    cur++; let size = 0; stack.push(i); label[i] = cur
    while (stack.length) { const k = stack.pop()!; size++; const x = k % w, y = (k / w) | 0; const nb = [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1]; for (const n of nb) if (n >= 0 && mask[n] && !label[n]) { label[n] = cur; stack.push(n) } }
    if (size > bestSize) { bestSize = size; best = cur }
  }
  const inset = (): Quad => { const ix = src.width * 0.06, iy = src.height * 0.06; return [{ x: ix, y: iy }, { x: src.width - ix, y: iy }, { x: src.width - ix, y: src.height - iy }, { x: ix, y: src.height - iy }] }
  if (best < 0 || bestSize < w * h * 0.08 || bestSize > w * h * 0.985) return inset()
  let tl = { x: 0, y: 0, v: Infinity }, tr = { x: 0, y: 0, v: -Infinity }, br = { x: 0, y: 0, v: -Infinity }, bl2 = { x: 0, y: 0, v: Infinity }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (label[y * w + x] !== best) continue
    const s = x + y, d = x - y
    if (s < tl.v) tl = { x, y, v: s }; if (s > br.v) br = { x, y, v: s }
    if (d > tr.v) tr = { x, y, v: d }; if (d < bl2.v) bl2 = { x, y, v: d }
  }
  const up = (p: { x: number; y: number }): Pt => ({ x: Math.min(src.width, (p.x + 0.5) / scale), y: Math.min(src.height, (p.y + 0.5) / scale) })
  const q: Quad = [up(tl), up(tr), up(br), up(bl2)]
  // reject degenerate shapes
  const area = Math.abs((q[0].x * q[1].y - q[1].x * q[0].y) + (q[1].x * q[2].y - q[2].x * q[1].y) + (q[2].x * q[3].y - q[3].x * q[2].y) + (q[3].x * q[0].y - q[0].x * q[3].y)) / 2
  if (area < src.width * src.height * 0.08) return inset()
  return q
}

export type Enhance = 'original' | 'color' | 'gray' | 'bw'
/** In-place scan enhancement */
export function enhance(px: Uint8ClampedArray, w: number, h: number, mode: Enhance, strength = 0.5) {
  if (mode === 'original') return
  if (mode === 'color' || mode === 'gray') {
    // auto levels per channel using 1% / 99% percentiles, then a whitening curve
    const lo = [0, 0, 0], hi = [255, 255, 255]
    for (let c = 0; c < 3; c++) {
      const hist = new Array(256).fill(0); for (let i = c; i < px.length; i += 4) hist[px[i]]++
      const n = w * h; let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > n * 0.01) { lo[c] = v; break } }
      acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > n * 0.04) { hi[c] = v; break } }
    }
    const gamma = 1 - strength * 0.35
    for (let i = 0; i < px.length; i += 4) {
      for (let c = 0; c < 3; c++) { const v = Math.max(0, Math.min(1, (px[i + c] - lo[c]) / Math.max(1, hi[c] - lo[c]))); px[i + c] = Math.pow(v, gamma) * 255 }
      if (mode === 'gray') { const y = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114; px[i] = px[i + 1] = px[i + 2] = y }
    }
    return
  }
  // adaptive threshold (Bradley) with an integral image
  const gray = new Float64Array(w * h)
  for (let i = 0; i < w * h; i++) gray[i] = px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114
  const integral = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += gray[y * w + x]; integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row } }
  const s = Math.max(8, Math.round(Math.max(w, h) / 16)), t = 0.08 + strength * 0.12
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x1 = Math.max(0, x - s), x2 = Math.min(w - 1, x + s), y1 = Math.max(0, y - s), y2 = Math.min(h - 1, y + s)
    const count = (x2 - x1 + 1) * (y2 - y1 + 1)
    const sum = integral[(y2 + 1) * (w + 1) + x2 + 1] - integral[y1 * (w + 1) + x2 + 1] - integral[(y2 + 1) * (w + 1) + x1] + integral[y1 * (w + 1) + x1]
    const v = gray[y * w + x] * count < sum * (1 - t) ? 0 : 255
    const i = (y * w + x) * 4; px[i] = px[i + 1] = px[i + 2] = v
  }
}

/** Rotate an RGBA buffer by 90 degrees clockwise */
export function rotate90(px: Uint8ClampedArray, w: number, h: number) {
  const out = new Uint8ClampedArray(px.length)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = (y * w + x) * 4, d = (x * h + (h - 1 - y)) * 4; out[d] = px[s]; out[d + 1] = px[s + 1]; out[d + 2] = px[s + 2]; out[d + 3] = px[s + 3] }
  return { px: out, w: h, h: w }
}
