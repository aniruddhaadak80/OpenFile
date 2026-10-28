/* Multi-resolution ICO encoder. Each image: RGBA pixels (top-down). Sizes <= 64 are stored as 32-bit BMP DIBs (max compatibility),
   larger ones (e.g. 256) as embedded PNG if `png` bytes are provided. */
export type IcoImage = { size: number; rgba: Uint8ClampedArray | Uint8Array; png?: Uint8Array }

function bmpEntry(size: number, rgba: Uint8ClampedArray | Uint8Array) {
  const maskRow = Math.ceil(size / 32) * 4
  const header = 40, pix = size * size * 4, mask = maskRow * size
  const buf = new Uint8Array(header + pix + mask)
  const dv = new DataView(buf.buffer)
  dv.setUint32(0, 40, true); dv.setInt32(4, size, true); dv.setInt32(8, size * 2, true)
  dv.setUint16(12, 1, true); dv.setUint16(14, 32, true); dv.setUint32(16, 0, true); dv.setUint32(20, pix + mask, true)
  let o = header
  for (let y = size - 1; y >= 0; y--) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4
    buf[o++] = rgba[i + 2]; buf[o++] = rgba[i + 1]; buf[o++] = rgba[i]; buf[o++] = rgba[i + 3]
  }
  // AND mask: 1 = transparent
  for (let y = size - 1; y >= 0; y--) {
    const row = header + pix + (size - 1 - y) * maskRow
    for (let x = 0; x < size; x++) if (rgba[(y * size + x) * 4 + 3] < 128) buf[row + (x >> 3)] |= 0x80 >> (x & 7)
  }
  return buf
}

export function encodeIco(images: IcoImage[]): Uint8Array {
  const entries = images.map((im) => (im.png && im.size > 64 ? im.png : bmpEntry(im.size, im.rgba)))
  const head = 6 + 16 * images.length
  const total = head + entries.reduce((s, e) => s + e.length, 0)
  const out = new Uint8Array(total), dv = new DataView(out.buffer)
  dv.setUint16(0, 0, true); dv.setUint16(2, 1, true); dv.setUint16(4, images.length, true)
  let off = head
  images.forEach((im, i) => {
    const p = 6 + i * 16
    out[p] = im.size >= 256 ? 0 : im.size; out[p + 1] = im.size >= 256 ? 0 : im.size; out[p + 2] = 0; out[p + 3] = 0
    dv.setUint16(p + 4, 1, true); dv.setUint16(p + 6, 32, true)
    dv.setUint32(p + 8, entries[i].length, true); dv.setUint32(p + 12, off, true)
    out.set(entries[i], off); off += entries[i].length
  })
  return out
}
