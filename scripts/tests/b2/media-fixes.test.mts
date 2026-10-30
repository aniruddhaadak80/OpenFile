// QA media round 2: WOFF2 never empty, CAD "Fit drawing" page keeps the drawing's shape, speech length in seconds.
// Run: npx tsx scripts/tests/b2/media-fixes.test.mts
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { zlibSync, unzlibSync } from 'fflate'
import { writeChecked, outSize } from '../../../src/lib/b2/font-write.ts'
import { fitPageMm } from '../../../src/lib/b2/cad-page.ts'
import { speechLength } from '../../../src/lib/speech-length.ts'
const require = createRequire(import.meta.url)
const { Font, woff2 } = require('fonteditor-core')
await woff2.init()

// fonts: OTF and TTF inputs that made fonteditor's WOFF2 writer return 0 bytes with kerning on
const fonts = [['/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', 'ttf'], ['/usr/share/fonts/opentype/urw-base35/URWBookman-LightItalic.otf', 'otf']]
for (const [p, type] of fonts) {
  if (!fs.existsSync(p)) { console.log('skip (missing)', p); continue }
  const b = fs.readFileSync(p)
  const font = Font.create(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), { type, kerning: true, hinting: true, inflate: (d: number[]) => Array.from(unzlibSync(Uint8Array.from(d))) })
  for (const out of ['woff2', 'woff', 'ttf'] as const) {
    const write = (kerning: boolean) => { const o = font.write({ type: out, toBuffer: false, hinting: true, kerning, deflate: (d: number[]) => Array.from(zlibSync(Uint8Array.from(d))) }); return typeof o === 'string' ? o : new Uint8Array(o) }
    const { data, kerningDropped } = writeChecked(write, out, true)
    assert.ok(outSize(data) > 1000, `${p} -> ${out} is ${outSize(data)} bytes`)
    if (out === 'woff2') {
      const back = Font.create(data, { type: 'woff2' })
      assert.equal(back.get().glyf.length, font.get().glyf.length, 'woff2 keeps every glyph')
    }
    console.log('ok', p.split('/').pop(), '->', out, outSize(data), 'bytes', kerningDropped ? '(written without the kern table)' : '')
  }
}
assert.throws(() => writeChecked(() => new Uint8Array(0), 'woff2'), /Could not write a WOFF2/)
assert.throws(() => writeChecked(() => '', 'svg'), /SVG/)

// CAD page: one scale factor, so the page has the drawing's aspect
{
  const [w, h] = fitPageMm(17, 10.4, 'unitless')
  assert.ok(Math.abs(w / h - 17 / 10.4) < 0.01 && Math.min(w, h) >= 49.99, `small drawing page ${w}x${h}`)
  const [iw, ih] = fitPageMm(17, 11, 'in')
  assert.deepEqual([iw, ih], [431.8, 279.4], 'inch drawing at real size')
  const [bw, bh] = fitPageMm(10000, 2500, 'mm')
  assert.deepEqual([bw, bh], [2000, 500], 'huge drawing scaled down, shape kept')
  const [mw, mh] = fitPageMm(120, 80, 'mm')
  assert.deepEqual([mw, mh], [120, 80], 'normal size untouched')
  console.log('ok cad fit page')
}

// speech length
assert.equal(speechLength(13), 'About 5 seconds of speech')
assert.equal(speechLength(1), 'About 1 second of speech')
assert.equal(speechLength(300), 'About 2 minutes of speech')
assert.equal(speechLength(300, 2), 'About 1 minute of speech')
console.log('ok speech length')
console.log('media-fixes (b2): all passed')
