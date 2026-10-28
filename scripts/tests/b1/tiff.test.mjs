// Run: npx tsx scripts/tests/b1/tiff.test.mjs   (set OUT=dir to also write files for external checks)
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { encodeTiff } from '../../../src/tools/convert/_b1/tiff.ts'
const UTIF = createRequire(import.meta.url)('utif')

const W = 37, H = 23
const page = (seed) => { const a = new Uint8Array(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; a[i] = (x * 7 + seed) & 255; a[i + 1] = (y * 11) & 255; a[i + 2] = x > W / 2 ? 255 : 0; a[i + 3] = 255 } return { width: W, height: H, rgba: a } }
for (const color of ['rgb', 'gray', 'bw']) for (const compression of ['none', 'lzw', 'deflate', 'packbits']) { if (process.env.DEBUG) console.log(color, compression)
  const t = encodeTiff([page(0), page(90)], { compression, color, dpi: 150 })
  if (process.env.OUT) fs.writeFileSync(`${process.env.OUT}/t-${color}-${compression}.tif`, t)
  const ifds = UTIF.decode(t.buffer.slice(t.byteOffset, t.byteOffset + t.byteLength))
  assert.equal(ifds.length, 2, `${color}/${compression} pages`)
  UTIF.decodeImage(t.buffer.slice(t.byteOffset, t.byteOffset + t.byteLength), ifds[1])
  const rgba = UTIF.toRGBA8(ifds[1])
  assert.equal(ifds[1].width, W)
  const i = (5 * W + 30) * 4
  if (color === 'rgb') { assert.equal(rgba[i], (30 * 7 + 90) & 255); assert.equal(rgba[i + 2], 255) }
  if (color === 'bw') assert.ok(rgba[i] === 0 || rgba[i] === 255)
}
console.log('ok   tiff: 3 color modes x 4 compressions decode with UTIF')

// large noisy page exercises LZW table resets
{
  const w = 400, h = 300, a = new Uint8Array(w * h * 4); let s = 7
  for (let i = 0; i < a.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; a[i] = i % 4 === 3 ? 255 : (s >> 16) & (i % 3 ? 255 : 15) }
  const t = encodeTiff([{ width: w, height: h, rgba: a }], { compression: 'lzw', color: 'rgb', dpi: 72 })
  if (process.env.OUT) { fs.writeFileSync(`${process.env.OUT}/big-lzw.tif`, t); fs.writeFileSync(`${process.env.OUT}/big.rgb`, Buffer.from(a)) }
  const buf = t.buffer.slice(t.byteOffset, t.byteOffset + t.byteLength)
  const ifds = UTIF.decode(buf); UTIF.decodeImage(buf, ifds[0]); const back = UTIF.toRGBA8(ifds[0])
  for (let i = 0; i < a.length; i++) if (i % 4 !== 3 && back[i] !== a[i]) throw new Error('LZW mismatch at ' + i)
  console.log('ok   large LZW round trip, ratio', (t.length / (w * h * 3)).toFixed(2))
}
