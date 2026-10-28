import assert from 'node:assert/strict'
import * as t from '../../../src/lib/b11/text.ts'
assert.equal(t.toRoman(1994), 'MCMXCIV'); assert.equal(t.fromRoman('MCMXCIV'), 1994); assert.ok(Number.isNaN(t.fromRoman('IIII')))
assert.equal(t.toMorse('SOS'), '... --- ...'); assert.equal(t.fromMorse('... --- ... / .-'), 'SOS A')
assert.equal(t.dedupe('a\nA\nb\na', { ignoreCase: true, trim: true, dropEmpty: false, onlyDuplicates: false }).text, 'a\nb')
assert.equal(t.sortLines('b\na10\na2', 'natural', true), 'a2\na10\nb')
assert.equal(t.wrapText('aa bb cc', 5), 'aa bb\ncc')
assert.ok(Math.abs(t.wcag('#000', '#fff').ratio - 21) < 0.01)
console.log('b11 ok')
