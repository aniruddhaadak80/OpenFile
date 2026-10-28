/* Pure binary builders/parsers for icon containers (ICO, CUR, ICNS, ANI). No DOM, Node-testable. */

export type IcoImage = { width: number; height: number; png: Uint8Array; hotspot?: [number, number] }

/** ICO (type 1) or CUR (type 2) holding PNG payloads. */
export function buildIcoFile(images: IcoImage[], type: 1 | 2 = 1): Uint8Array {
  const n = images.length
  const total = 6 + 16 * n + images.reduce((a, p) => a + p.png.length, 0)
  const out = new Uint8Array(total), v = new DataView(out.buffer)
  v.setUint16(0, 0, true); v.setUint16(2, type, true); v.setUint16(4, n, true)
  let off = 6 + 16 * n
  images.forEach((im, i) => {
    const e = 6 + 16 * i
    out[e] = im.width >= 256 ? 0 : im.width; out[e + 1] = im.height >= 256 ? 0 : im.height
    if (type === 2) { v.setUint16(e + 4, im.hotspot?.[0] ?? 0, true); v.setUint16(e + 6, im.hotspot?.[1] ?? 0, true) }
    else { v.setUint16(e + 4, 1, true); v.setUint16(e + 6, 32, true) }
    v.setUint32(e + 8, im.png.length, true); v.setUint32(e + 12, off, true)
    out.set(im.png, off); off += im.png.length
  })
  return out
}

/** Which ICNS chunk type to use for a PNG of a given pixel size. Retina variants share pixel sizes. */
export const ICNS_TYPES: { type: string; px: number; label: string }[] = [
  { type: 'icp4', px: 16, label: '16' }, { type: 'icp5', px: 32, label: '32' }, { type: 'ic11', px: 32, label: '16@2x' },
  { type: 'icp6', px: 64, label: '64' }, { type: 'ic12', px: 64, label: '32@2x' }, { type: 'ic07', px: 128, label: '128' },
  { type: 'ic08', px: 256, label: '256' }, { type: 'ic13', px: 256, label: '128@2x' }, { type: 'ic09', px: 512, label: '512' },
  { type: 'ic14', px: 512, label: '256@2x' }, { type: 'ic10', px: 1024, label: '512@2x' },
]

export function buildIcnsFile(chunks: { type: string; png: Uint8Array }[]): Uint8Array {
  const total = 8 + chunks.reduce((a, c) => a + 8 + c.png.length, 0)
  const out = new Uint8Array(total), v = new DataView(out.buffer)
  const tag = (o: number, s: string) => { for (let i = 0; i < 4; i++) out[o + i] = s.charCodeAt(i) }
  tag(0, 'icns'); v.setUint32(4, total)
  let p = 8
  for (const c of chunks) { tag(p, c.type); v.setUint32(p + 4, 8 + c.png.length); out.set(c.png, p + 8); p += 8 + c.png.length }
  return out
}

/** Animated cursor (RIFF ACON). `frames` are complete ICO/CUR files; rate is in jiffies (1/60 s). */
export function buildAniFile(frames: Uint8Array[], rate: number, size: number): Uint8Array {
  const chunk = (id: string, data: Uint8Array) => {
    const pad = data.length & 1
    const c = new Uint8Array(8 + data.length + pad); const v = new DataView(c.buffer)
    for (let i = 0; i < 4; i++) c[i] = id.charCodeAt(i)
    v.setUint32(4, data.length, true); c.set(data, 8); return c
  }
  const anih = new Uint8Array(36), av = new DataView(anih.buffer)
  av.setUint32(0, 36, true); av.setUint32(4, frames.length, true); av.setUint32(8, frames.length, true)
  av.setUint32(12, size, true); av.setUint32(16, size, true); av.setUint32(20, 32, true); av.setUint32(24, 1, true)
  av.setUint32(28, Math.max(1, Math.round(rate)), true); av.setUint32(32, 1 /* AF_ICON */, true)
  const icons = frames.map((f) => chunk('icon', f))
  const framBody = concat([ascii('fram'), ...icons])
  const list = concat([ascii('LIST'), u32(framBody.length), framBody])
  const body = concat([ascii('ACON'), chunk('anih', anih), list])
  return concat([ascii('RIFF'), u32(body.length), body])
}

export function parseAniFile(u8: Uint8Array): { frames: Uint8Array[]; rate: number; rates?: number[]; seq?: number[] } {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  const str = (o: number) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3])
  if (str(0) !== 'RIFF' || str(8) !== 'ACON') throw new Error('This is not an animated cursor (ANI) file.')
  const frames: Uint8Array[] = []; let rate = 10; let rates: number[] | undefined; let seq: number[] | undefined
  const walk = (start: number, end: number) => {
    let p = start
    while (p + 8 <= end) {
      const id = str(p), len = v.getUint32(p + 4, true), d = p + 8
      if (id === 'LIST') walk(d + 4, d + len)
      else if (id === 'anih') rate = v.getUint32(d + 28, true) || 10
      else if (id === 'icon') frames.push(u8.slice(d, d + len))
      else if (id === 'rate') { rates = []; for (let i = 0; i < len / 4; i++) rates.push(v.getUint32(d + i * 4, true)) }
      else if (id === 'seq ') { seq = []; for (let i = 0; i < len / 4; i++) seq.push(v.getUint32(d + i * 4, true)) }
      p = d + len + (len & 1)
    }
  }
  walk(12, Math.min(u8.length, 8 + v.getUint32(4, true)))
  if (!frames.length) throw new Error('No frames found in this ANI file.')
  return { frames, rate, rates, seq }
}

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0))
const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b }
export function concat(parts: Uint8Array[]) { const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length } return out }
