/* Image helpers for round 14: colour replace, DPI metadata, ASCII art, signature cleanup, screenshot overlap. Pure, unit tested. */

export type RGB = [number, number, number]
export const hex2rgb = (h: string): RGB => { const m = h.replace('#', '').padEnd(6, '0'); return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)] }
export const rgb2hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')

/** Colour distance on a 0..100 scale (weighted RGB, close to how people see it). */
export function colorDist(a: RGB, r: number, g: number, b: number) {
  const rm = (a[0] + r) / 2, dr = a[0] - r, dg = a[1] - g, db = a[2] - b
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db) / 7.65
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2
  if (mx === mn) return [0, 0, l]
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}
function hslToRgb(h: number, s: number, l: number): RGB {
  if (!s) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q
  const f = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p }
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]
}

/** Replace pixels near `from` with `to` (or make them transparent). Keeps shading when `keepShade` is on. Returns count changed. */
export function recolor(d: Uint8ClampedArray, o: { from: RGB; to: RGB | null; tolerance: number; feather: number; keepShade: boolean }): number {
  let n = 0
  const [th, ts] = o.to ? rgbToHsl(...o.to) : [0, 0]
  const [, , fl] = rgbToHsl(...o.from)
  const tl = o.to ? rgbToHsl(...o.to)[2] : 0
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue
    const dist = colorDist(o.from, d[i], d[i + 1], d[i + 2])
    if (dist > o.tolerance + o.feather) continue
    const k = dist <= o.tolerance ? 1 : 1 - (dist - o.tolerance) / Math.max(0.001, o.feather)
    n++
    if (!o.to) { d[i + 3] = Math.round(d[i + 3] * (1 - k)); continue }
    let nr: number, ng: number, nb: number
    if (o.keepShade) { const [, , l] = rgbToHsl(d[i], d[i + 1], d[i + 2]); [nr, ng, nb] = hslToRgb(th, ts, Math.max(0, Math.min(1, tl + (l - fl)))) }
    else [nr, ng, nb] = o.to
    d[i] = d[i] + (nr - d[i]) * k; d[i + 1] = d[i + 1] + (ng - d[i + 1]) * k; d[i + 2] = d[i + 2] + (nb - d[i + 2]) * k
  }
  return n
}

/** Most common colours (rounded to 16 levels), for one-click picking. */
export function topColors(d: Uint8ClampedArray, n = 8): string[] {
  const m = new Map<number, number>()
  for (let i = 0; i < d.length; i += 16) { if (d[i + 3] < 128) continue; const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4); m.set(k, (m.get(k) ?? 0) + 1) }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => rgb2hex(((k >> 8) & 15) * 17, ((k >> 4) & 15) * 17, (k & 15) * 17))
}

/* ---------------- DPI ---------------- */
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
export function crc32(b: Uint8Array, start = 0, end = b.length) { let c = 0xffffffff; for (let i = start; i < end; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

export function readDpi(b: Uint8Array): { x: number; y: number; format: 'jpeg' | 'png' | 'other'; source: string } {
  if (b[0] === 0xff && b[1] === 0xd8) {
    let p = 2
    while (p + 4 < b.length && b[p] === 0xff) {
      const m = b[p + 1], len = (b[p + 2] << 8) | b[p + 3]
      if (m === 0xe0 && b[p + 4] === 0x4a && b[p + 5] === 0x46 && b[p + 6] === 0x49 && b[p + 7] === 0x46) {
        const unit = b[p + 11], x = (b[p + 12] << 8) | b[p + 13], y = (b[p + 14] << 8) | b[p + 15]
        if (unit === 1) return { x, y, format: 'jpeg', source: 'JFIF' }
        if (unit === 2) return { x: Math.round(x * 2.54), y: Math.round(y * 2.54), format: 'jpeg', source: 'JFIF (per cm)' }
        return { x: 0, y: 0, format: 'jpeg', source: 'JFIF (no unit, aspect only)' }
      }
      if (m === 0xda) break
      p += 2 + len
    }
    return { x: 0, y: 0, format: 'jpeg', source: 'not set' }
  }
  if (b[0] === 0x89 && b[1] === 0x50) {
    let p = 8
    while (p + 8 < b.length) {
      const len = ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0
      const type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7])
      if (type === 'pHYs') { const dv = new DataView(b.buffer, b.byteOffset + p + 8, 9); const x = dv.getUint32(0), y = dv.getUint32(4); return dv.getUint8(8) === 1 ? { x: Math.round(x * 0.0254), y: Math.round(y * 0.0254), format: 'png', source: 'pHYs' } : { x: 0, y: 0, format: 'png', source: 'pHYs (no unit)' } }
      if (type === 'IDAT' || type === 'IEND') break
      p += 12 + len
    }
    return { x: 0, y: 0, format: 'png', source: 'not set' }
  }
  return { x: 0, y: 0, format: 'other', source: 'unsupported' }
}

/** Set DPI without touching pixels: JFIF APP0 density for JPEG, pHYs chunk for PNG. */
export function setDpi(b: Uint8Array, dpi: number): Uint8Array {
  const d = Math.max(1, Math.min(65535, Math.round(dpi)))
  if (b[0] === 0xff && b[1] === 0xd8) {
    if (b[2] === 0xff && b[3] === 0xe0 && b[6] === 0x4a && b[7] === 0x46 && b[8] === 0x49 && b[9] === 0x46) {
      const out = b.slice(); out[13] = 1; out[14] = d >> 8; out[15] = d & 255; out[16] = d >> 8; out[17] = d & 255; return out
    }
    const app0 = new Uint8Array([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, d >> 8, d & 255, d >> 8, d & 255, 0, 0])
    const out = new Uint8Array(b.length + app0.length); out.set(b.subarray(0, 2)); out.set(app0, 2); out.set(b.subarray(2), 2 + app0.length); return out
  }
  if (b[0] === 0x89 && b[1] === 0x50) {
    const ppm = Math.round(d / 0.0254)
    const chunk = new Uint8Array(21); const dv = new DataView(chunk.buffer)
    dv.setUint32(0, 9); chunk.set([0x70, 0x48, 0x59, 0x73], 4); dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1; dv.setUint32(17, crc32(chunk, 4, 17))
    // drop an existing pHYs, insert ours right after IHDR
    const parts: Uint8Array[] = [b.subarray(0, 8)]
    let p = 8, inserted = false
    while (p + 8 <= b.length) {
      const len = ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0
      const type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7])
      const whole = b.subarray(p, p + 12 + len)
      if (type !== 'pHYs') parts.push(whole)
      if (type === 'IHDR' && !inserted) { parts.push(chunk); inserted = true }
      p += 12 + len
      if (type === 'IEND') break
    }
    const total = parts.reduce((a, x) => a + x.length, 0), out = new Uint8Array(total); let o = 0
    for (const x of parts) { out.set(x, o); o += x.length }
    return out
  }
  throw new Error('Only JPG and PNG files can carry a DPI value. Convert the image first.')
}

/* ---------------- ASCII ---------------- */
export const RAMPS: Record<string, string> = { classic: ' .:-=+*#%@', detailed: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$", blocks: ' ░▒▓█', binary: ' 01', dots: ' ⠁⠃⠇⠏⠟⠿⡿⣿' }
/** Brightness grid (0..1, row major) to text. */
export function toAscii(lum: Float32Array, w: number, h: number, ramp: string, invert: boolean): string {
  const out: string[] = []
  const chars = [...ramp]
  for (let y = 0; y < h; y++) { let row = ''; for (let x = 0; x < w; x++) { let v = lum[y * w + x]; if (!invert) v = 1 - v; row += chars[Math.min(chars.length - 1, Math.floor(v * chars.length))] } out.push(row.replace(/\s+$/, '')) }
  return out.join('\n')
}

/* ---------------- signature ---------------- */
/** Turn a photo of ink on paper into a transparent signature: adaptive threshold, ink colour, soft edge. Returns the ink box. */
export function cleanSignature(d: Uint8ClampedArray, w: number, h: number, o: { threshold: number; ink: RGB | null; smooth: number }): { x0: number; y0: number; x1: number; y1: number } {
  // local background from a coarse grid of bright percentiles, so shadows and uneven light do not become ink
  const G = 24, gw = Math.ceil(w / G), gh = Math.ceil(h / G)
  const bg = new Float32Array(gw * gh)
  const lum = new Float32Array(w * h)
  for (let i = 0, p = 0; i < d.length; i += 4, p++) lum[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const vals: number[] = []
    for (let y = gy * G; y < Math.min(h, gy * G + G); y += 3) for (let x = gx * G; x < Math.min(w, gx * G + G); x += 3) vals.push(lum[y * w + x])
    vals.sort((a, b) => a - b); bg[gy * gw + gx] = vals[Math.floor(vals.length * 0.9)] ?? 255
  }
  const bgAt = (x: number, y: number) => { const fx = Math.min(gw - 1, Math.max(0, x / G - 0.5)), fy = Math.min(gh - 1, Math.max(0, y / G - 0.5)); const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1); const tx = fx - x0, ty = fy - y0; return (bg[y0 * gw + x0] * (1 - tx) + bg[y0 * gw + x1] * tx) * (1 - ty) + (bg[y1 * gw + x0] * (1 - tx) + bg[y1 * gw + x1] * tx) * ty }
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  const t = o.threshold / 100, soft = Math.max(0.01, o.smooth / 100)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, i = p * 4
    const darkness = 1 - lum[p] / Math.max(1, bgAt(x, y))
    const a = Math.max(0, Math.min(1, (darkness - t) / soft + 0.5))
    if (a > 0.5) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
    if (o.ink) { d[i] = o.ink[0]; d[i + 1] = o.ink[1]; d[i + 2] = o.ink[2] }
    d[i + 3] = Math.round(a * 255)
  }
  return { x0, y0, x1, y1 }
}

/* ---------------- stitching ---------------- */
/** Rows of A's bottom that match rows of B's top (scrolling screenshots). `rowHash` gives one number per row. Returns overlap in rows (0 when none). */
export function findOverlap(a: number[], b: number[], minRun = 12): number {
  const max = Math.min(a.length, b.length) - 1
  for (let ov = max; ov >= minRun; ov--) {
    let ok = true
    for (let k = 0; k < ov; k += Math.max(1, Math.floor(ov / 40))) if (a[a.length - ov + k] !== b[k]) { ok = false; break }
    if (ok) { let all = true; const seen = new Set<number>(); for (let k = 0; k < ov; k++) { if (a[a.length - ov + k] !== b[k]) { all = false; break } seen.add(b[k]) } if (all && seen.size >= 4) return ov }
  }
  return 0
}
/** One hash per pixel row, ignoring a margin at the sides (scroll bars). */
export function rowHashes(d: Uint8ClampedArray, w: number, h: number, margin = 0.05): number[] {
  const out: number[] = []
  const x0 = Math.floor(w * margin), x1 = Math.ceil(w * (1 - margin))
  for (let y = 0; y < h; y++) { let hsh = 2166136261; for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; hsh = Math.imul(hsh ^ (d[i] >> 3), 16777619); hsh = Math.imul(hsh ^ (d[i + 1] >> 3), 16777619); hsh = Math.imul(hsh ^ (d[i + 2] >> 3), 16777619) } out.push(hsh >>> 0) }
  return out
}
