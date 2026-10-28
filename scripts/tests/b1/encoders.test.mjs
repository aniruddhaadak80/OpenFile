// Run: npx tsx scripts/tests/b1/encoders.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { encodeBmp, encodeGif } from '../../../src/tools/convert/_b1/encoders.ts'
const w = 5, h = 3, px = new Uint8ClampedArray(w * h * 4)
for (let i = 0; i < w * h; i++) { px[i * 4] = i * 15; px[i * 4 + 1] = 200; px[i * 4 + 2] = 255 - i * 10; px[i * 4 + 3] = 255 }
const bmp = encodeBmp(px, w, h)
assert.equal(String.fromCharCode(bmp[0], bmp[1]), 'BM'); assert.equal(bmp.length, 54 + 16 * 3)
// top-left pixel is stored in the last row (bottom-up), as BGR
const o = 54 + 2 * 16; assert.deepEqual([bmp[o], bmp[o + 1], bmp[o + 2]], [255, 200, 0])
const gif = await encodeGif(px, w, h)
assert.equal(new TextDecoder().decode(gif.subarray(0, 6)), 'GIF89a')
if (process.env.OUT) { fs.writeFileSync(process.env.OUT + '/t.bmp', bmp); fs.writeFileSync(process.env.OUT + '/t.gif', gif) }
console.log('ok   bmp and gif encoders')
