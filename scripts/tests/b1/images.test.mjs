// Run: npx tsx scripts/tests/b1/images.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { encodePng } from '../../../src/tools/pdf/_b1/png.ts'
import { extractImages, unpredict } from '../../../src/tools/pdf/_b1/images.ts'
import { inkRatio, adjustPixels } from '../../../src/tools/pdf/_b1/pixels.ts'

const jpg = new Uint8Array(fs.readFileSync(new URL('./fixture.jpg', import.meta.url)))
// 4x3 RGBA png with transparency
const px = new Uint8Array(4 * 3 * 4); for (let i = 0; i < 12; i++) { px[i * 4] = i * 20; px[i * 4 + 1] = 100; px[i * 4 + 2] = 200; px[i * 4 + 3] = i % 2 ? 128 : 255 }
const png = encodePng(px, 4, 3, 4)
const d = await PDFDocument.create()
const p = d.addPage()
const ji = await d.embedJpg(jpg), pi = await d.embedPng(png)
p.drawImage(ji, { x: 0, y: 0, width: 100, height: 100 }); p.drawImage(pi, { x: 200, y: 200, width: 40, height: 30 })
d.addPage().drawImage(ji, { x: 0, y: 0, width: 50, height: 50 })
const bytes = await d.save()

const r = await extractImages(bytes, {})
assert.equal(r.images.length, 2, 'two unique images (soft mask not listed separately)')
const j = r.images.find((x) => x.ext === 'jpg')
assert.deepEqual(j.data.subarray(0, 3), new Uint8Array([0xff, 0xd8, 0xff]))
assert.equal(j.data.length, jpg.length, 'jpeg passthrough is byte-identical')
assert.deepEqual(j.pages.sort(), [0, 1])
const pn = r.images.find((x) => x.ext === 'png')
assert.equal(pn.w, 4); assert.equal(pn.h, 3)
assert.deepEqual(pn.data.subarray(1, 4), new Uint8Array([80, 78, 71]))
console.log('ok   extract images (jpeg passthrough, png with alpha)')

// predictor: PNG Up filter rows
const raw = new Uint8Array([2, 1, 2, 3, 2, 1, 1, 1])
assert.deepEqual([...unpredict(raw, 12, 1, 8, 3)], [1, 2, 3, 2, 3, 4])
console.log('ok   png predictor')

const white = new Uint8ClampedArray(100 * 100 * 4).fill(255)
assert.equal(inkRatio(white, 100, 100), 0)
for (let i = 0; i < 400; i++) white[(5000 + i) * 4] = white[(5000 + i) * 4 + 1] = white[(5000 + i) * 4 + 2] = 0
assert.ok(inkRatio(white, 100, 100) > 0.03)
console.log('ok   ink ratio')
const a = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255])
adjustPixels(a, { mode: 'invert', brightness: 0, contrast: 0, saturation: 0, threshold: 128 })
assert.deepEqual([...a], [0, 0, 0, 255, 255, 255, 255, 255])
const b = new Uint8ClampedArray([250, 250, 250, 255])
adjustPixels(b, { mode: 'none', brightness: 0, contrast: 0, saturation: 0, threshold: 128, replace: [{ from: [255, 255, 255], to: [10, 20, 30], tolerance: 5 }] })
assert.deepEqual([...b], [10, 20, 30, 255])
const dk = new Uint8ClampedArray([255, 255, 255, 255])
adjustPixels(dk, { mode: 'dark', brightness: 0, contrast: 0, saturation: 0, threshold: 128 })
assert.ok(dk[0] < 40, 'white paper becomes dark')
console.log('ok   colour adjustments')
