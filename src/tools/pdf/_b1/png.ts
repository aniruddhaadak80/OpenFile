/* Minimal PNG encoder (RGBA or RGB or gray, 8-bit) using fflate. Works in browsers and Node. */
import { zlibSync } from 'fflate'

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
export function crc32(buf: Uint8Array, start = 0, end = buf.length) { let c = 0xffffffff; for (let i = start; i < end; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  dv.setUint32(8 + data.length, crc32(out, 4, 8 + data.length))
  return out
}

/** channels: 1 gray, 3 rgb, 4 rgba */
export function encodePng(pixels: Uint8Array | Uint8ClampedArray, w: number, h: number, channels: 1 | 2 | 3 | 4 = 4, level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 = 6) {
  const stride = w * channels
  const raw = new Uint8Array((stride + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 1 // Sub filter: cheap and usually smaller than none
    const row = y * stride, o = y * (stride + 1) + 1
    for (let x = 0; x < stride; x++) raw[o + x] = (pixels[row + x] - (x >= channels ? pixels[row + x - channels] : 0)) & 255
  }
  const ihdr = new Uint8Array(13); const dv = new DataView(ihdr.buffer)
  dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = channels === 1 ? 0 : channels === 2 ? 4 : channels === 3 ? 2 : 6
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw, { level })), chunk('IEND', new Uint8Array(0))]
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
