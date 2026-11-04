// Estimate the IJG quality (1-100) a JPEG was saved at, from its luminance quantisation table.
// Used so re-encoders can match the source instead of saving at a fixed high quality and growing the file.
const STD_LUMA = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
]

/** Returns the estimated quality, or null when the bytes are not a baseline/progressive JPEG with a DQT. */
export function estimateJpegQuality(buf: ArrayBuffer | Uint8Array): number | null {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) { i++; continue }
    const m = b[i + 1]
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) { i += m === 0xff ? 1 : 2; continue }
    if (m === 0xd9 || m === 0xda) break
    const len = (b[i + 2] << 8) | b[i + 3]
    if (m === 0xdb) {
      let p = i + 4
      const end = i + 2 + len
      while (p < end) {
        const pq = b[p] >> 4, tq = b[p] & 15
        const n = pq ? 128 : 64
        if (tq === 0) {
          let sum = 0, std = 0
          for (let k = 0; k < 64; k++) { sum += pq ? (b[p + 1 + k * 2] << 8) | b[p + 2 + k * 2] : b[p + 1 + k]; std += STD_LUMA[k] }
          // Tables are stored in zigzag order but the sum is order independent.
          const scale = (sum * 100) / std
          if (scale <= 1) return 100
          const q = scale <= 100 ? (200 - scale) / 2 : 5000 / scale
          return Math.max(1, Math.min(100, Math.round(q)))
        }
        p += 1 + n
      }
    }
    i += 2 + len
  }
  return null
}

/**
 * Encode with `enc(q)` so that, for a same-format re-encode, the result is not bigger than `limit` bytes where avoidable.
 * Starts at the source-like quality (capped by `maxQ`) and steps down a few times; returns the smallest attempt.
 */
export async function encodeNotBigger(enc: (q: number) => Promise<Blob>, limit: number, startQ: number, minQ = 0.5): Promise<Blob> {
  let q = startQ
  let best = await enc(q)
  while (best.size > limit && q - 0.08 >= minQ) {
    q = Math.round((q - 0.08) * 100) / 100
    const b = await enc(q)
    if (b.size < best.size) best = b
  }
  return best
}
