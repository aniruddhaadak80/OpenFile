/* APNG / PNG decode and encode via UPNG.js (MIT). */
import * as UPNGns from 'upng-js'
const UPNG: any = (UPNGns as any).decode ? UPNGns : (UPNGns as any).default
import type { Anim } from './core'

export function decodePng(buf: ArrayBuffer | Uint8Array): Anim {
  const ab = buf instanceof Uint8Array ? buf.slice().buffer : buf
  const img = UPNG.decode(ab)
  const rgba: ArrayBuffer[] = UPNG.toRGBA8(img)
  const animated = !!img.tabs?.acTL && img.frames?.length > 1
  const frames = rgba.map((b, i) => ({ rgba: new Uint8ClampedArray(b), delay: animated ? Math.max(20, img.frames[i]?.delay || 100) : 100 }))
  return { width: img.width, height: img.height, frames, loop: animated ? img.tabs.acTL.num_plays ?? 0 : 0, source: animated ? 'APNG' : 'PNG' }
}

/** True when a PNG file carries an acTL chunk (an animated PNG). */
export function isApng(bytes: Uint8Array): boolean {
  let p = 8
  while (p + 8 < bytes.length) {
    const len = (bytes[p] << 24 | bytes[p + 1] << 16 | bytes[p + 2] << 8 | bytes[p + 3]) >>> 0
    const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7])
    if (type === 'acTL') return true
    if (type === 'IDAT') return false
    p += 12 + len
  }
  return false
}

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
export function crc32(b: Uint8Array, start = 0, end = b.length) { let c = 0xffffffff; for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

export interface ApngOptions {
  /** 0 = lossless, otherwise palette size (e.g. 256) for a much smaller file */
  colors?: number
  loop?: number
  onProgress?: (p: number) => void
}

export function encodeApng(anim: Anim, opts: ApngOptions = {}): Uint8Array {
  opts.onProgress?.(0.1)
  const bufs = anim.frames.map((f) => f.rgba.slice().buffer)
  const dels = anim.frames.map((f) => Math.max(10, Math.round(f.delay)))
  const out = new Uint8Array(UPNG.encode(bufs, anim.width, anim.height, opts.colors ?? 0, dels))
  const loop = opts.loop ?? anim.loop
  if (anim.frames.length > 1 && loop) {
    // UPNG writes num_plays = 0 (forever); patch the acTL chunk when a finite count was asked for
    for (let p = 8; p + 12 < out.length;) {
      const len = (out[p] << 24 | out[p + 1] << 16 | out[p + 2] << 8 | out[p + 3]) >>> 0
      if (out[p + 4] === 0x61 && out[p + 5] === 0x63 && out[p + 6] === 0x54 && out[p + 7] === 0x4c) {
        const q = p + 12
        out[q] = (loop >>> 24) & 255; out[q + 1] = (loop >>> 16) & 255; out[q + 2] = (loop >>> 8) & 255; out[q + 3] = loop & 255
        const crc = crc32(out, p + 4, p + 8 + len)
        out[p + 8 + len] = crc >>> 24; out[p + 9 + len] = (crc >>> 16) & 255; out[p + 10 + len] = (crc >>> 8) & 255; out[p + 11 + len] = crc & 255
        break
      }
      p += 12 + len
    }
  }
  opts.onProgress?.(1)
  return out
}

/** Encode a single RGBA bitmap as PNG (used to feed frames to ffmpeg and for ZIP exports). */
export function encodePngFrame(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  return new Uint8Array(UPNG.encode([rgba.slice().buffer], w, h, 0))
}
