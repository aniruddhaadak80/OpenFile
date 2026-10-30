import assert from 'node:assert/strict'
import * as I from '../../../src/lib/b14/image.ts'
// recolor
const px = new Uint8ClampedArray([255, 0, 0, 255, 250, 5, 5, 255, 0, 0, 255, 255])
assert.equal(I.recolor(px, { from: [255, 0, 0], to: [0, 255, 0], tolerance: 10, feather: 0, keepShade: false }), 2)
assert.deepEqual([...px.slice(0, 4)], [0, 255, 0, 255]); assert.deepEqual([...px.slice(8, 12)], [0, 0, 255, 255])
const t = new Uint8ClampedArray([255, 255, 255, 255]); I.recolor(t, { from: [255, 255, 255], to: null, tolerance: 5, feather: 0, keepShade: false }); assert.equal(t[3], 0)
assert.equal(I.topColors(new Uint8ClampedArray(64).fill(255))[0], '#ffffff')
// dpi jpeg: minimal SOI + JFIF + EOI
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9])
assert.equal(I.readDpi(jpg).x, 0)
const j2 = I.setDpi(jpg, 300); assert.deepEqual(I.readDpi(j2), { x: 300, y: 300, format: 'jpeg', source: 'JFIF' }); assert.equal(j2.length, jpg.length)
const bare = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]); assert.equal(I.readDpi(I.setDpi(bare, 72)).x, 72)
// dpi png: build a 1x1 png with zlib
const { deflateSync } = await import('node:zlib')
const chunk = (type, data) => { const c = new Uint8Array(12 + data.length); const dv = new DataView(c.buffer); dv.setUint32(0, data.length); c.set([...type].map((x) => x.charCodeAt(0)), 4); c.set(data, 8); dv.setUint32(8 + data.length, I.crc32(c, 4, 8 + data.length)); return c }
const ihdr = new Uint8Array(13); new DataView(ihdr.buffer).setUint32(0, 1); new DataView(ihdr.buffer).setUint32(4, 1); ihdr[8] = 8; ihdr[9] = 2
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0]))), chunk('IEND', new Uint8Array(0))])
const p2 = I.setDpi(new Uint8Array(png), 300); assert.equal(I.readDpi(p2).x, 300)
const p3 = I.setDpi(p2, 96); assert.equal(I.readDpi(p3).x, 96); assert.equal(p3.length, p2.length)
assert.throws(() => I.setDpi(new Uint8Array([1, 2, 3]), 300))
// ascii
assert.equal(I.toAscii(Float32Array.from([0, 1]), 2, 1, ' #', false), '#')
// overlap
const A = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
const B = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]
assert.equal(I.findOverlap(A, B, 5), 10)
assert.equal(I.findOverlap([1, 1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1], 3), 0)
// signature
const w = 50, h = 50, sig = new Uint8ClampedArray(w * h * 4).fill(240); for (let y = 20; y < 25; y++) for (let x = 10; x < 40; x++) { const i = (y * w + x) * 4; sig[i] = sig[i + 1] = sig[i + 2] = 20 }
const box = I.cleanSignature(sig, w, h, { threshold: 35, ink: [0, 0, 128], smooth: 10 })
assert.deepEqual(box, { x0: 10, y0: 20, x1: 39, y1: 24 }); assert.equal(sig[3], 0); assert.equal(sig[(22 * w + 15) * 4 + 3], 255)
console.log('b14 image ok')
