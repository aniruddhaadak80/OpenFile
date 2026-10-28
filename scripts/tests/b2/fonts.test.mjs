// Node test: fonteditor-core round trips used by font-converter / font-subsetter.
import fs from 'node:fs'
import assert from 'node:assert'
import { createRequire } from 'node:module'
import { zlibSync, unzlibSync } from 'fflate'
const require = createRequire(import.meta.url)
const { Font, woff2 } = require('fonteditor-core')
await woff2.init()
const ttf = fs.readFileSync('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf')
const ab = ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength)
const font = Font.create(ab, { type: 'ttf', hinting: true })
const n = font.get().glyf.length
for (const type of ['woff', 'woff2', 'eot', 'svg', 'ttf']) {
  const out = font.write({ type, toBuffer: false, deflate: (d) => Array.from(zlibSync(Uint8Array.from(d))) })
  const size = typeof out === 'string' ? out.length : out.byteLength
  assert.ok(size > 1000, type + ' output too small')
  if (type === 'woff' || type === 'woff2') {
    const back = Font.create(out, { type, inflate: (d) => Array.from(unzlibSync(Uint8Array.from(d))) })
    assert.equal(back.get().glyf.length, n, type + ' glyph count changed')
  }
  console.log('ok', type, size)
}
// subset: keep only "Hello"
const sub = Font.create(ab, { type: 'ttf', subset: [...'Helo'].map((c) => c.codePointAt(0)) })
const subOut = sub.write({ type: 'woff2', toBuffer: false })
assert.ok(sub.get().glyf.length <= 6, 'subset glyph count ' + sub.get().glyf.length)
console.log('ok subset', sub.get().glyf.length, 'glyphs', subOut.byteLength, 'bytes vs', ttf.length)
const otf = fs.readFileSync('/usr/share/fonts/opentype/urw-base35/URWBookman-LightItalic.otf')
const of = Font.create(otf.buffer.slice(otf.byteOffset, otf.byteOffset + otf.byteLength), { type: 'otf' })
const ofOut = of.write({ type: 'ttf', toBuffer: false })
assert.ok(ofOut.byteLength > 1000)
console.log('ok otf->ttf', of.get().glyf.length, 'glyphs')
