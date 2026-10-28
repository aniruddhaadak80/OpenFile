/* GIF decode (gifuct-js) and an optimising GIF encoder built on gifenc.
 * The encoder adds what gifenc lacks: frame offsets (only the changed rectangle is stored),
 * transparency for unchanged pixels, lossy matching, Floyd-Steinberg dithering and global or
 * per-frame palettes. */
import { parseGIF, decompressFrames } from 'gifuct-js'
import * as gifencNs from 'gifenc'
import type { Anim, Frame } from './core'

/** Loop count from the NETSCAPE2.0 block: 0 = forever, n = n loops, 1 when absent (plays once). */
export function gifLoopCount(bytes: Uint8Array): number {
  const sig = [0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30] // NETSCAPE2.0
  outer: for (let i = 0; i < bytes.length - 16; i++) {
    for (let k = 0; k < sig.length; k++) if (bytes[i + k] !== sig[k]) continue outer
    const p = i + sig.length
    if (bytes[p] === 3 && bytes[p + 1] === 1) return bytes[p + 2] | (bytes[p + 3] << 8)
  }
  return 1
}

/** Browsers show delays under 20 ms as 100 ms; mirror that so previews match. */
export const normDelay = (ms: number) => (!ms || ms < 20 ? 100 : ms)

export function decodeGif(buf: ArrayBuffer | Uint8Array): Anim {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  const ab = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer as ArrayBuffer : bytes.slice().buffer
  const gif = parseGIF(ab)
  const raw = decompressFrames(gif, true)
  const w = gif.lsd.width, h = gif.lsd.height
  if (!w || !h) throw new Error('This GIF has no size information. It may be damaged; try Repair GIF.')
  if (!raw.length) throw new Error('No frames could be read from this GIF. It may be damaged; try Repair GIF.')
  const canvas = new Uint8ClampedArray(w * h * 4)
  const frames: Frame[] = []
  for (const f of raw) {
    const { left, top, width, height } = f.dims
    const backup = f.disposalType === 3 ? canvas.slice() : null
    const patch = f.patch
    for (let y = 0; y < height; y++) {
      const cy = top + y; if (cy < 0 || cy >= h) continue
      for (let x = 0; x < width; x++) {
        const cx = left + x; if (cx < 0 || cx >= w) continue
        const pi = (y * width + x) * 4
        if (patch[pi + 3] === 0) continue
        const ci = (cy * w + cx) * 4
        canvas[ci] = patch[pi]; canvas[ci + 1] = patch[pi + 1]; canvas[ci + 2] = patch[pi + 2]; canvas[ci + 3] = 255
      }
    }
    frames.push({ rgba: canvas.slice(), delay: normDelay(f.delay) })
    if (f.disposalType === 2) {
      for (let y = Math.max(0, top); y < Math.min(h, top + height); y++) canvas.fill(0, (y * w + Math.max(0, left)) * 4, (y * w + Math.min(w, left + width)) * 4)
    } else if (backup) canvas.set(backup)
  }
  return { width: w, height: h, frames, loop: gifLoopCount(bytes), source: 'GIF' }
}

/* ------------------------------------------------------------------ encoder */

export interface GifOptions {
  /** palette size 2..256 */
  colors?: number
  /** one palette for the whole file, or one per frame */
  palette?: 'global' | 'local'
  /** 0..1 Floyd-Steinberg strength */
  dither?: number
  /** 0..100: how different a pixel must be before it is redrawn (higher = smaller, lossier) */
  lossy?: number
  /** store only the changed rectangle of each frame */
  optimize?: boolean
  /** alpha below this becomes fully transparent */
  alphaThreshold?: number
  /** overrides anim.loop */
  loop?: number
  onProgress?: (p: number) => void
}

type RGB = [number, number, number]
const gifenc: any = (gifencNs as any).GIFEncoder ? gifencNs : (gifencNs as any).default
const GIFEncoder = (...a: any[]) => gifenc.GIFEncoder(...a)
const quantize = (...a: any[]) => gifenc.quantize(...a)

class Mapper {
  private cache = new Int16Array(1 << 15).fill(-1)
  constructor(private pal: RGB[], private count: number) {}
  nearest(r: number, g: number, b: number): number {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    const c = this.cache[key]; if (c >= 0) return c
    let best = 0, bd = Infinity
    for (let i = 0; i < this.count; i++) {
      const p = this.pal[i]
      const dr = p[0] - r, dg = p[1] - g, db = p[2] - b
      const d = dr * dr * 2 + dg * dg * 4 + db * db * 3
      if (d < bd) { bd = d; best = i; if (!d) break }
    }
    this.cache[key] = best
    return best
  }
}

function samplePixels(frames: Uint8ClampedArray[], alphaThreshold: number, maxPixels = 600_000): Uint8Array {
  const total = frames.reduce((s, f) => s + f.length / 4, 0)
  const step = Math.max(1, Math.floor(total / maxPixels))
  const out: number[] = []
  let k = 0
  for (const f of frames) for (let i = 0; i < f.length; i += 4) {
    if (k++ % step) continue
    if (f[i + 3] < alphaThreshold) continue
    out.push(f[i], f[i + 1], f[i + 2], 255)
  }
  if (!out.length) out.push(0, 0, 0, 255)
  return Uint8Array.from(out)
}

function buildPalette(sample: Uint8Array, colors: number): RGB[] {
  const pal = quantize(sample, Math.max(2, colors), { format: 'rgb565' }) as RGB[]
  return pal.length ? pal : [[0, 0, 0]]
}

/** Map RGBA to palette indices for the masked pixels; returns indices plus the colours actually shown. */
function indexFrame(src: Uint8ClampedArray, w: number, h: number, map: Mapper, pal: RGB[], mask: Uint8Array | null, tIndex: number, alphaThreshold: number, dither: number, shown: Uint8ClampedArray) {
  const idx = new Uint8Array(w * h)
  const err = dither > 0 ? new Float32Array(w * h * 3) : null
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, i = p * 4
    if (mask && !mask[p]) { idx[p] = tIndex; continue }
    if (src[i + 3] < alphaThreshold) { idx[p] = tIndex; shown[i + 3] = 0; continue }
    let r = src[i], g = src[i + 1], b = src[i + 2]
    if (err) { r = clamp(r + err[p * 3]); g = clamp(g + err[p * 3 + 1]); b = clamp(b + err[p * 3 + 2]) }
    const k = map.nearest(r, g, b)
    idx[p] = k
    const c = pal[k]
    shown[i] = c[0]; shown[i + 1] = c[1]; shown[i + 2] = c[2]; shown[i + 3] = 255
    if (err) {
      const er = (r - c[0]) * dither, eg = (g - c[1]) * dither, eb = (b - c[2]) * dither
      const spread = (dx: number, dy: number, f: number) => {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || nx >= w || ny >= h) return
        const q = (ny * w + nx); if (mask && !mask[q]) return
        err[q * 3] += er * f; err[q * 3 + 1] += eg * f; err[q * 3 + 2] += eb * f
      }
      spread(1, 0, 7 / 16); spread(-1, 1, 3 / 16); spread(0, 1, 5 / 16); spread(1, 1, 1 / 16)
    }
  }
  return idx
}
const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

export function encodeGif(anim: Anim, opts: GifOptions = {}): Uint8Array {
  const { width: W, height: H } = anim
  const colors = Math.min(256, Math.max(2, Math.round(opts.colors ?? 256)))
  const alphaThreshold = opts.alphaThreshold ?? 128
  const dither = Math.max(0, Math.min(1, opts.dither ?? 0))
  const fuzz = Math.max(0, Math.min(100, opts.lossy ?? 0)) * 1.2
  const optimize = opts.optimize ?? true
  const loop = opts.loop ?? anim.loop
  const repeat = loop === 1 ? -1 : loop === 0 ? 0 : Math.max(0, loop)
  const hasAlpha = anim.frames.some((f) => { for (let i = 3; i < f.rgba.length; i += 4) if (f.rgba[i] < alphaThreshold) return true; return false })
  // diffing needs a transparent index; with real transparency we fall back to full frames + clear
  const diff = optimize && !hasAlpha
  const needT = diff || hasAlpha
  const realColors = needT ? colors - 1 : colors
  const enc = GIFEncoder()
  const globalPal = opts.palette !== 'local' ? buildPalette(samplePixels(anim.frames.map((f) => f.rgba), alphaThreshold), realColors) : null
  const shown = new Uint8ClampedArray(W * H * 4) // what a viewer displays after the previous frame
  const n = anim.frames.length
  for (let fi = 0; fi < n; fi++) {
    const f = anim.frames[fi]
    let x0 = 0, y0 = 0, x1 = W - 1, y1 = H - 1
    let mask: Uint8Array | null = null
    if (diff && fi > 0) {
      mask = new Uint8Array(W * H)
      x0 = W; y0 = H; x1 = -1; y1 = -1
      const src = f.rgba
      for (let p = 0, i = 0; p < W * H; p++, i += 4) {
        const d = Math.max(Math.abs(src[i] - shown[i]), Math.abs(src[i + 1] - shown[i + 1]), Math.abs(src[i + 2] - shown[i + 2]))
        if (d > fuzz) {
          mask[p] = 1
          const x = p % W, y = (p / W) | 0
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
        }
      }
      if (x1 < 0) { x0 = 0; y0 = 0; x1 = 0; y1 = 0 } // nothing changed: 1x1 transparent frame keeps the timing
    }
    const fw = x1 - x0 + 1, fh = y1 - y0 + 1
    // crop source + mask to the rectangle
    const sub = new Uint8ClampedArray(fw * fh * 4)
    const subMask = mask ? new Uint8Array(fw * fh) : null
    const subShown = new Uint8ClampedArray(fw * fh * 4)
    for (let y = 0; y < fh; y++) {
      sub.set(f.rgba.subarray(((y + y0) * W + x0) * 4, ((y + y0) * W + x0 + fw) * 4), y * fw * 4)
      subShown.set(shown.subarray(((y + y0) * W + x0) * 4, ((y + y0) * W + x0 + fw) * 4), y * fw * 4)
      if (subMask && mask) subMask.set(mask.subarray((y + y0) * W + x0, (y + y0) * W + x0 + fw), y * fw)
    }
    let pal = globalPal
    if (!pal) {
      const pix: Uint8ClampedArray[] = [subMask ? sub.filter((_, i) => subMask[(i / 4) | 0] === 1) : sub]
      pal = buildPalette(samplePixels(pix, alphaThreshold), realColors)
    }
    const palette: RGB[] = pal.slice()
    let tIndex = -1
    if (needT) { tIndex = palette.length; palette.push([0, 0, 0]) }
    const map = new Mapper(pal, pal.length)
    const index = indexFrame(sub, fw, fh, map, pal, subMask, Math.max(0, tIndex), alphaThreshold, dither, subShown)
    const before = enc.bytesView().length
    enc.writeFrame(index, fi === 0 ? W : fw, fi === 0 ? H : fh, {
      palette: fi === 0 || !globalPal ? palette : undefined,
      delay: f.delay,
      repeat,
      transparent: needT,
      transparentIndex: Math.max(0, tIndex),
      dispose: hasAlpha ? 2 : 1,
    })
    if (fi === 0 && (fw !== W || fh !== H)) throw new Error('internal: first frame must cover the canvas')
    if (fi > 0 && (x0 || y0)) {
      // gifenc always writes left/top = 0; patch the image descriptor that follows the 8-byte GCE
      const view = enc.bytesView()
      const p = before + 8
      if (view[p] === 0x2c) { view[p + 1] = x0 & 255; view[p + 2] = x0 >> 8; view[p + 3] = y0 & 255; view[p + 4] = y0 >> 8 }
    }
    // update what the viewer shows
    if (hasAlpha) shown.fill(0)
    for (let y = 0; y < fh; y++) shown.set(subShown.subarray(y * fw * 4, (y + 1) * fw * 4), ((y + y0) * W + x0) * 4)
    opts.onProgress?.((fi + 1) / n)
  }
  enc.finish()
  return enc.bytes()
}
