// node --experimental-strip-types scripts/tests/b2/medical.test.mjs  (synthetic uncompressed DICOM)
import assert from 'node:assert'
const { readDicom, renderSlice } = await import('../../../src/lib/b2/medical.ts')
function el(g, e, vr, val) {
  const long = ['OB', 'OW', 'SQ', 'UN', 'UT'].includes(vr)
  const body = typeof val === 'string' ? Buffer.from(val.length % 2 ? val + '\0' : val, 'latin1') : val
  const h = Buffer.alloc(long ? 12 : 8)
  h.writeUInt16LE(g, 0); h.writeUInt16LE(e, 2); h.write(vr, 4, 'latin1')
  if (long) h.writeUInt32LE(body.length, 8); else h.writeUInt16LE(body.length, 6)
  return Buffer.concat([h, body])
}
const us = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b }
function dicom(inst, value) {
  const W = 4, H = 3, px = Buffer.alloc(W * H * 2)
  for (let i = 0; i < W * H; i++) px.writeUInt16LE(value + i, i * 2)
  const meta = el(2, 0x10, 'UI', '1.2.840.10008.1.2.1')
  const metaLen = el(2, 0, 'UL', (() => { const b = Buffer.alloc(4); b.writeUInt32LE(meta.length); return b })())
  return Buffer.concat([Buffer.alloc(128), Buffer.from('DICM'), metaLen, meta,
    el(8, 0x60, 'CS', 'CT'), el(0x20, 0x13, 'IS', String(inst)), el(0x28, 2, 'US', us(1)), el(0x28, 0x10, 'US', us(H)), el(0x28, 0x11, 'US', us(W)),
    el(0x28, 0x100, 'US', us(16)), el(0x28, 0x103, 'US', us(0)), el(0x28, 0x1052, 'DS', '-1024'), el(0x28, 0x1053, 'DS', '1'), el(0x7fe0, 0x10, 'OW', px)])
}
const toAB = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
const v = await readDicom([{ name: 'b.dcm', data: toAB(dicom(2, 2000)) }, { name: 'a.dcm', data: toAB(dicom(1, 1000)) }])
assert.equal(v.depth, 2); assert.equal(v.width, 4); assert.equal(v.height, 3)
assert.equal(v.slices[0][0], 1000 - 1024, 'sorted by instance + rescale applied')
assert.equal(v.meta.find(([k]) => k === 'Modality')[1], 'CT')
const rgba = renderSlice(v, 1, 1000, 100, false)
assert.equal(rgba.length, 4 * 3 * 4)
console.log('ok dicom', v.depth, 'slices, min', v.min, 'max', v.max)
