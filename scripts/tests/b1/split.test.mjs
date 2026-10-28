// Run: npx tsx scripts/tests/b1/split.test.mjs
import assert from 'node:assert/strict'
import * as S from '../../../src/tools/pdf/_b1/splitPoints.ts'
let passed = 0
const t = (name, fn) => { try { fn(); passed++; console.log('ok  ', name) } catch (e) { console.error('FAIL', name, e); process.exitCode = 1 } }
t('starts with front matter', () => {
  const r = S.groupsFromStarts([2, 5], 8, ['Ch 1', 'Ch 2'])
  assert.deepEqual(r.groups, [[0, 1], [2, 3, 4], [5, 6, 7]])
  assert.deepEqual(r.labels, ['front', 'Ch 1', 'Ch 2'])
})
t('starts dedupe and sort', () => {
  const r = S.groupsFromStarts([3, 0, 3, 9], 5)
  assert.deepEqual(r.groups, [[0, 1, 2], [3, 4]])
})
t('no starts gives one group', () => assert.deepEqual(S.groupsFromStarts([], 3).groups, [[0, 1, 2]]))
t('separators dropped', () => {
  const r = S.groupsFromSeparators([false, false, true, false, true, true, false], true, [null, null, 'A', null, 'B', 'C', null])
  assert.deepEqual(r.groups, [[0, 1], [3], [6]])
  assert.deepEqual(r.dropped, [2, 4, 5])
  assert.deepEqual(r.labels, ['', 'A', 'C'])
})
t('separators kept start parts', () => {
  const r = S.groupsFromSeparators([false, true, false, true], false)
  assert.deepEqual(r.groups, [[0], [1, 2], [3]])
})
t('text match plain, case and whitespace', () => {
  const r = S.textStarts(['Cover', 'INVOICE  number 1\nfoo', 'x', 'Invoice number 2'], 'invoice number')
  assert.deepEqual(r.starts, [1, 3])
  assert.equal(r.labels[0], 'INVOICE  number 1')
  assert.deepEqual(S.textStarts(['Invoice number'], 'invoice number', { caseSensitive: true }).starts, [])
})
t('text regex and bad regex', () => {
  assert.deepEqual(S.textStarts(['No. 12', 'none', 'No. 7'], 'No\\.\\s*\\d+', { regex: true }).starts, [0, 2])
  assert.ok(S.textStarts(['a'], '(', { regex: true }).error)
})
t('ink ratio', () => {
  const w = 100, h = 100, d = new Uint8ClampedArray(w * h * 4).fill(255)
  assert.equal(S.inkRatio(d, w, h), 0)
  for (let y = 40; y < 60; y++) for (let x = 40; x < 60; x++) { const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = 0 }
  const r = S.inkRatio(d, w, h)
  assert.ok(r > 0.04 && r < 0.05, String(r))
})
t('slug', () => assert.equal(S.slugPart('Chapter 1: Intro & More'), 'chapter-1-intro-more'))
console.log(`${passed} passed`)
