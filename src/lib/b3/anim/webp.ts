/* Animated WebP container parser. Each ANMF frame is re-wrapped as a standalone still WebP so the
 * browser's own decoder can read it, then frames are composited with the right blend and disposal.
 * The parser itself is DOM-free (tested in Node); `decodeWebp` needs createImageBitmap. */
import type { Anim, Frame } from './core'

export interface WebpFrameInfo { x: number; y: number; width: number; height: number; duration: number; blend: boolean; disposeToBg: boolean; data: Uint8Array; hasAlpha: boolean }
export interface WebpInfo { width: number; height: number; animated: boolean; loop: number; background: [number, number, number, number]; frames: WebpFrameInfo[]; hasAlpha: boolean }

const u24 = (b: Uint8Array, p: number) => b[p] | (b[p + 1] << 8) | (b[p + 2] << 16)
const u32 = (b: Uint8Array, p: number) => (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0
const fourcc = (b: Uint8Array, p: number) => String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3])

export function isWebp(b: Uint8Array) { return b.length > 16 && fourcc(b, 0) === 'RIFF' && fourcc(b, 8) === 'WEBP' }

function chunks(b: Uint8Array, start: number, end: number) {
  const out: { id: string; data: Uint8Array; raw: Uint8Array }[] = []
  let p = start
  while (p + 8 <= end) {
    const id = fourcc(b, p), size = u32(b, p + 4)
    const dEnd = Math.min(end, p + 8 + size)
    out.push({ id, data: b.subarray(p + 8, dEnd), raw: b.subarray(p, Math.min(end, p + 8 + size + (size & 1))) })
    p += 8 + size + (size & 1)
  }
  return out
}

export function parseWebp(b: Uint8Array): WebpInfo {
  if (!isWebp(b)) throw new Error('Not a WebP file.')
  const all = chunks(b, 12, Math.min(b.length, 8 + u32(b, 4)))
  const vp8x = all.find((c) => c.id === 'VP8X')
  const info: WebpInfo = { width: 0, height: 0, animated: false, loop: 0, background: [0, 0, 0, 0], frames: [], hasAlpha: false }
  if (vp8x) {
    const d = vp8x.data
    info.animated = !!(d[0] & 0x02); info.hasAlpha = !!(d[0] & 0x10)
    info.width = u24(d, 4) + 1; info.height = u24(d, 7) + 1
  }
  const anim = all.find((c) => c.id === 'ANIM')
  if (anim) { const d = anim.data; info.background = [d[2], d[1], d[0], d[3]]; info.loop = d[4] | (d[5] << 8) }
  for (const c of all.filter((x) => x.id === 'ANMF')) {
    const d = c.data
    const sub = chunks(d, 16, d.length)
    info.frames.push({
      x: u24(d, 0) * 2, y: u24(d, 3) * 2, width: u24(d, 6) + 1, height: u24(d, 9) + 1, duration: u24(d, 12),
      blend: !(d[15] & 0x02), disposeToBg: !!(d[15] & 0x01),
      hasAlpha: sub.some((s) => s.id === 'ALPH' || s.id === 'VP8L'),
      data: wrapStill(sub, u24(d, 6) + 1, u24(d, 9) + 1),
    })
  }
  if (!info.frames.length) {
    // still image: report size from the bitstream when there is no VP8X
    if (!info.width) {
      const vp8 = all.find((c) => c.id === 'VP8 '), vp8l = all.find((c) => c.id === 'VP8L')
      if (vp8) { info.width = (vp8.data[6] | (vp8.data[7] << 8)) & 0x3fff; info.height = (vp8.data[8] | (vp8.data[9] << 8)) & 0x3fff }
      if (vp8l) { const d = vp8l.data; const v = u32(d, 1); info.width = (v & 0x3fff) + 1; info.height = ((v >> 14) & 0x3fff) + 1; info.hasAlpha = true }
    }
    info.animated = false
  }
  return info
}

/** Build a standalone WebP file from the sub-chunks (ALPH, VP8, VP8L) of one ANMF frame. */
export function wrapStill(sub: { id: string; raw: Uint8Array }[], w: number, h: number): Uint8Array {
  const alph = sub.find((s) => s.id === 'ALPH'), vp8 = sub.find((s) => s.id === 'VP8 '), vp8l = sub.find((s) => s.id === 'VP8L')
  const parts: Uint8Array[] = []
  if (vp8l) parts.push(vp8l.raw)
  else if (vp8 && alph) {
    const x = new Uint8Array(18)
    x.set([0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0x10, 0, 0, 0])
    const W = w - 1, H = h - 1
    x[12] = W & 255; x[13] = (W >> 8) & 255; x[14] = (W >> 16) & 255; x[15] = H & 255; x[16] = (H >> 8) & 255; x[17] = (H >> 16) & 255
    parts.push(x, alph.raw, vp8.raw)
  } else if (vp8) parts.push(vp8.raw)
  else throw new Error('A WebP frame has no image data.')
  const len = parts.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(12 + len)
  out.set([0x52, 0x49, 0x46, 0x46]); const size = 4 + len
  out[4] = size & 255; out[5] = (size >> 8) & 255; out[6] = (size >> 16) & 255; out[7] = (size >>> 24) & 255
  out.set([0x57, 0x45, 0x42, 0x50], 8)
  let p = 12; for (const part of parts) { out.set(part, p); p += part.length }
  return out
}

async function bitmapToRGBA(blob: Blob, w: number, h: number): Promise<Uint8ClampedArray> {
  const bmp = await createImageBitmap(blob)
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h })
  const ctx = (c as any).getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
  ctx.clearRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0); bmp.close?.()
  return ctx.getImageData(0, 0, w, h).data
}

export async function decodeWebp(b: Uint8Array, onProgress?: (p: number) => void): Promise<Anim> {
  const info = parseWebp(b)
  const W = info.width, H = info.height
  if (!info.animated || !info.frames.length) {
    const rgba = await bitmapToRGBA(new Blob([b as BlobPart], { type: 'image/webp' }), W, H)
    return { width: W, height: H, frames: [{ rgba, delay: 100 }], loop: 0, source: 'WebP' }
  }
  const canvas = new Uint8ClampedArray(W * H * 4)
  const frames: Frame[] = []
  let prev: WebpFrameInfo | null = null
  for (let i = 0; i < info.frames.length; i++) {
    const f = info.frames[i]
    if (prev?.disposeToBg) for (let y = prev.y; y < Math.min(H, prev.y + prev.height); y++) canvas.fill(0, (y * W + prev.x) * 4, (y * W + Math.min(W, prev.x + prev.width)) * 4)
    const px = await bitmapToRGBA(new Blob([f.data as BlobPart], { type: 'image/webp' }), f.width, f.height)
    for (let y = 0; y < f.height; y++) {
      const cy = f.y + y; if (cy >= H) break
      for (let x = 0; x < f.width; x++) {
        const cx = f.x + x; if (cx >= W) break
        const si = (y * f.width + x) * 4, di = (cy * W + cx) * 4
        const sa = px[si + 3]
        if (!f.blend || sa === 255) { canvas[di] = px[si]; canvas[di + 1] = px[si + 1]; canvas[di + 2] = px[si + 2]; canvas[di + 3] = sa; continue }
        if (sa === 0) continue
        const a = sa / 255, ba = canvas[di + 3] / 255, oa = a + ba * (1 - a)
        for (let c = 0; c < 3; c++) canvas[di + c] = (px[si + c] * a + canvas[di + c] * ba * (1 - a)) / (oa || 1)
        canvas[di + 3] = oa * 255
      }
    }
    frames.push({ rgba: canvas.slice(), delay: f.duration < 20 ? 100 : f.duration })
    prev = f
    onProgress?.((i + 1) / info.frames.length)
  }
  return { width: W, height: H, frames, loop: info.loop, source: 'WebP' }
}

/** Rewrite each ANMF frame duration in place (ffmpeg guesses the last frame's duration). */
export function patchWebpDurations(b: Uint8Array, delays: number[]): Uint8Array {
  if (!isWebp(b)) return b
  let p = 12, i = 0
  const end = Math.min(b.length, 8 + u32(b, 4))
  while (p + 8 <= end) {
    const id = fourcc(b, p), size = u32(b, p + 4)
    if (id === 'ANMF' && i < delays.length) {
      const d = Math.max(0, Math.min(0xffffff, Math.round(delays[i++])))
      b[p + 8 + 12] = d & 255; b[p + 8 + 13] = (d >> 8) & 255; b[p + 8 + 14] = (d >> 16) & 255
    }
    p += 8 + size + (size & 1)
  }
  return b
}
