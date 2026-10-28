// Run: npx tsx scripts/tests/b3/sprite-bitmap.test.ts
import assert from 'node:assert/strict'
import { buildSheet, cutSheet, layoutSheet, sheetCss, sheetJson } from '../../../src/lib/b3/sprite'
import { packBits, toCArray, toMono } from '../../../src/lib/b3/bitmap'
import { sameRGBA } from '../../../src/lib/b3/anim/core'
const W = 10, H = 6
const frames = Array.from({ length: 5 }, (_, k) => ({ rgba: new Uint8ClampedArray(W * H * 4).map((_, i) => (i % 4 === 3 ? 255 : (k * 40 + i) & 255)), delay: 50 + k }))
const a = { width: W, height: H, frames, loop: 0 }
const L = layoutSheet(5, W, H, 3, 2)
assert.equal(L.rows, 2); assert.equal(L.width, 3 * W + 4); assert.deepEqual(L.cells[4], { x: W + 2, y: H + 2 })
const { rgba, layout } = buildSheet(a, 3, 2)
const back = cutSheet(rgba, layout.width, layout.height, 3, 2, { pad: 2, count: 5 })
assert.equal(back.frames.length, 5); assert.equal(back.width, W)
back.frames.forEach((f, i) => assert.ok(sameRGBA(f.rgba, frames[i].rgba), 'frame ' + i))
assert.ok(sheetCss('walk', a, layout, 'walk.png').includes('@keyframes walk-play'))
assert.equal(Object.keys(sheetJson('walk', a, layout, 'walk.png').frames).length, 5)
console.log('ok - sprite sheet round trip')
// bitmap: 8x2 image, left half white
const px = new Uint8ClampedArray(8 * 2 * 4); for (let y = 0; y < 2; y++) for (let x = 0; x < 8; x++) { const i = (y * 8 + x) * 4; const v = x < 4 ? 255 : 0; px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255 }
const bits = toMono(px, 8, 2)
assert.deepEqual(Array.from(packBits(bits, 8, 2, 'gfx')), [0xf0, 0xf0])
assert.deepEqual(Array.from(packBits(bits, 8, 2, 'xbm')), [0x0f, 0x0f])
assert.deepEqual(Array.from(packBits(bits, 8, 2, 'ssd1306')), [3, 3, 3, 3, 0, 0, 0, 0])
assert.deepEqual(Array.from(packBits(toMono(px, 8, 2, 128, true), 8, 2, 'gfx')), [0x0f, 0x0f])
const c = toCArray([packBits(bits, 8, 2, 'gfx')], 8, 2, 'my anim', 'gfx', [100])
assert.ok(c.includes('const unsigned char my_anim_0[] PROGMEM = {')); assert.ok(c.includes('0xf0, 0xf0'))
console.log('ok - bitmap packing')
