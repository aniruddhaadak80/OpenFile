// Run: npx tsx scripts/tests/b1/xps.test.mjs
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import * as X from '../../../src/tools/convert/_b1/xpsCore.ts'
let passed = 0
const t = (name, fn) => { try { fn(); passed++; console.log('ok  ', name) } catch (e) { console.error('FAIL', name, e); process.exitCode = 1 } }
t('colors', () => {
  assert.deepEqual(X.parseColor('#FF336699'), { css: '#336699', alpha: 1 })
  assert.deepEqual(X.parseColor('#80000000'), { css: '#000000', alpha: 128 / 255 })
  assert.deepEqual(X.parseColor('#00ff00'), { css: '#00ff00', alpha: 1 })
  assert.deepEqual(X.parseColor('sc#1,1,0,0'), { css: '#ff0000', alpha: 1 })
  assert.equal(X.parseColor('sc#0.5,0.2140,0.2140,0.2140').css, '#7f7f7f')
  assert.equal(X.parseColor('nope'), null)
})
t('matrix', () => { assert.deepEqual(X.parseMatrix('1,0,0,1,10,20'), [1, 0, 0, 1, 10, 20]); assert.deepEqual(X.parseMatrix('bad'), X.IDENT) })
t('geometry', () => {
  assert.deepEqual(X.geometryToSvg('F1 M 0,0 L 10,0 10,10 Z'), { d: 'M 0,0 L 10,0 10,10 Z', rule: 'nonzero' })
  assert.equal(X.geometryToSvg('M 1,1 L 2,2').rule, 'evenodd')
})
t('indices', () => {
  const e = X.parseIndices('(2:1)72,60;;,40,5;12')
  assert.deepEqual(e[0], { cluster: [2, 1], gid: 72, advance: 60 })
  assert.deepEqual(e[1], {})
  assert.deepEqual(e[2], { advance: 40, u: 5 })
  assert.deepEqual(e[3], { gid: 12 })
})
t('layout with advances', () => {
  const r = X.layoutGlyphs('abc', X.parseIndices(',50;,60;,70'), 20, null)
  assert.deepEqual(r.chars.map((c) => c.x), [0, 10, 22])
  assert.equal(r.width, 36)
})
t('layout ligature cluster', () => {
  const r = X.layoutGlyphs('fix', X.parseIndices('(2:1)10,100;20,50'), 10, null)
  assert.equal(r.chars.length, 3)
  assert.equal(r.chars[2].x, 10)
  assert.equal(r.width, 15)
})
t('layout without indices uses fallback width', () => { const r = X.layoutGlyphs('ab', [], 10, null); assert.deepEqual(r.chars.map((c) => c.x), [0, 5]) })
t('unicode escape', () => assert.equal(X.unescapeUnicode('{}{hi}'), '{hi}'))
t('resolve part', () => {
  assert.equal(X.resolvePart('Documents/1/FixedDocument.fdoc', 'Pages/1.fpage'), 'Documents/1/Pages/1.fpage')
  assert.equal(X.resolvePart('Documents/1/Pages/1.fpage', '../Resources/Fonts/A.odttf'), 'Documents/1/Resources/Fonts/A.odttf')
  assert.equal(X.resolvePart('x/y.fpage', '/Resources/img%201.png'), 'Resources/img 1.png')
})
t('deobfuscate round trip', () => {
  const data = new Uint8Array(64).map((_, i) => i)
  const name = '/Resources/0B3A7F4C-1D2E-4F50-8A9B-C0D1E2F3A4B5.odttf'
  const once = X.deobfuscateFont(data, name)
  assert.notDeepEqual(once, data)
  assert.deepEqual(X.deobfuscateFont(once, name), data)
  assert.deepEqual(once.slice(32), data.slice(32))
})
const fontPath = 'node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf'
if (existsSync(fontPath)) t('font metrics from a real TTF', () => {
  const m = X.readFontMetrics(new Uint8Array(readFileSync(fontPath)))
  assert.ok(m && m.unitsPerEm === 2048 && m.isTrueType)
  const gA = m.cmap.get(65)
  assert.ok(gA > 0)
  assert.equal(m.advances[gA], 1366)
})
console.log(`${passed} passed`)
