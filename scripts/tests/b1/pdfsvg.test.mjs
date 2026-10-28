// Run: npx tsx scripts/tests/b1/pdfsvg.test.mjs
import assert from 'node:assert/strict'
import * as S from '../../../src/tools/convert/_b1/pdfsvg.ts'
let passed = 0
const t = (name, fn) => { try { fn(); passed++; console.log('ok  ', name) } catch (e) { console.error('FAIL', name, e); process.exitCode = 1 } }
t('mul identity', () => assert.deepEqual(S.mul(S.IDENT, [2, 0, 0, 3, 4, 5]), [2, 0, 0, 3, 4, 5]))
t('mul order (translate then scale)', () => assert.deepEqual(S.mul([1, 0, 0, 1, 10, 20], [2, 0, 0, 2, 0, 0]), [2, 0, 0, 2, 10, 20]))
t('inverse', () => { const m = [2, 1, -1, 3, 5, 7]; const p = S.mul(m, S.inv(m)); p.forEach((v, i) => assert.ok(Math.abs(v - S.IDENT[i]) < 1e-9)) })
t('draw ops', () => assert.equal(S.drawOpsToD(new Float32Array([0, 1, 2, 1, 3, 4, 2, 1, 1, 2, 2, 3, 3, 4])), 'M1 2L3 4C1 1 2 2 3 3Z'))
t('draw ops quad and empty', () => { assert.equal(S.drawOpsToD([3, 1, 2, 3, 4]), 'Q1 2 3 4'); assert.equal(S.drawOpsToD(null), '') })
t('matStr rounding', () => assert.equal(S.matStr([1, 0, 0, -1, 0.00001, 842.123456]), 'matrix(1 0 0 -1 0 842.123)'))
t('escape and xml safe', () => { assert.equal(S.esc('<a & "b">'), '&lt;a &amp; &quot;b&quot;&gt;'); assert.equal(S.xmlSafe('a\u0001b'), 'ab') })
t('b64', () => assert.equal(S.b64(new Uint8Array([104, 105])), 'aGk='))
console.log(`${passed} passed`)
