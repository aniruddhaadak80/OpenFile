/* Extra still-image encoders for canvases: BMP (24-bit), GIF (gifenc, 256 colors) and TIFF (built-in writer). */
export function encodeBmp(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number) {
  const row = Math.ceil((w * 3) / 4) * 4
  const size = 54 + row * h
  const b = new Uint8Array(size); const dv = new DataView(b.buffer)
  b[0] = 0x42; b[1] = 0x4d; dv.setUint32(2, size, true); dv.setUint32(10, 54, true)
  dv.setUint32(14, 40, true); dv.setInt32(18, w, true); dv.setInt32(22, h, true); dv.setUint16(26, 1, true); dv.setUint16(28, 24, true)
  dv.setUint32(34, row * h, true); dv.setInt32(38, 3780, true); dv.setInt32(42, 3780, true)
  for (let y = 0; y < h; y++) {
    const o = 54 + (h - 1 - y) * row
    for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, a = rgba[i + 3] / 255; b[o + x * 3] = rgba[i + 2] * a + 255 * (1 - a); b[o + x * 3 + 1] = rgba[i + 1] * a + 255 * (1 - a); b[o + x * 3 + 2] = rgba[i] * a + 255 * (1 - a) }
  }
  return b
}
export async function encodeGif(rgba: Uint8ClampedArray, w: number, h: number) {
  const g: any = await import('gifenc')
  const m = g.quantize ? g : g.default?.quantize ? g.default : g.default?.default ?? g
  const { GIFEncoder, quantize, applyPalette } = m
  const palette = quantize(rgba, 256, { format: 'rgb565' })
  const index = applyPalette(rgba, palette, 'rgb565')
  const enc = GIFEncoder(); enc.writeFrame(index, w, h, { palette }); enc.finish()
  return enc.bytes() as Uint8Array
}
export async function encodeCanvasExtra(c: HTMLCanvasElement, fmt: 'bmp' | 'gif' | 'tiff', dpi = 150) {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
  if (fmt === 'bmp') return new Blob([encodeBmp(d.data, c.width, c.height) as BlobPart], { type: 'image/bmp' })
  if (fmt === 'gif') return new Blob([(await encodeGif(d.data, c.width, c.height)) as BlobPart], { type: 'image/gif' })
  const { encodeTiff } = await import('./tiff')
  return new Blob([encodeTiff([{ width: c.width, height: c.height, rgba: d.data }], { compression: 'lzw', color: 'rgb', dpi }) as BlobPart], { type: 'image/tiff' })
}
