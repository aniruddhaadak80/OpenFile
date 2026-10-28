// Run: npx tsx scripts/tests/b1/ocrtable.test.mjs
import assert from 'node:assert/strict'
import * as T from '../../../src/tools/pdf/_b1/ocrTable.ts'
let passed = 0
const t = (name, fn) => { try { fn(); passed++; console.log('ok  ', name) } catch (e) { console.error('FAIL', name, e); process.exitCode = 1 } }
const W = (text, x, y, w = text.length * 8) => ({ text, x0: x, y0: y, x1: x + w, y1: y + 12 })
t('simple 3x3 grid', () => {
  const words = [
    W('Name', 10, 10), W('Qty', 200, 10), W('Price', 300, 11),
    W('Green', 10, 40), W('apple', 58, 41), W('3', 205, 40), W('1.20', 300, 39),
    W('Pear', 10, 70), W('12', 202, 71), W('0.90', 301, 70),
  ]
  assert.deepEqual(T.wordsToTable(words), [['Name', 'Qty', 'Price'], ['Green apple', '3', '1.20'], ['Pear', '12', '0.90']])
})
t('missing cell stays empty', () => {
  const words = [W('A', 10, 10), W('B', 200, 10), W('C', 300, 10), W('x', 10, 40), W('z', 300, 40)]
  assert.deepEqual(T.wordsToTable(words), [['A', 'B', 'C'], ['x', '', 'z']])
})
t('csv quoting', () => assert.equal(T.toCsv([['a,b', 'say "hi"'], ['1', '2']]), '"a,b","say ""hi"""\r\n1,2'))
t('empty', () => assert.deepEqual(T.wordsToTable([]), []))
console.log(`${passed} passed`)
