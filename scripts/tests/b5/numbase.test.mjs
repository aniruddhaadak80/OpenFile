import assert from 'node:assert/strict'
import * as N from '../../../src/lib/b5/numbase.ts'
assert.equal(N.parseBase('ff', 16), 255n); assert.equal(N.parseBase('0b1010_1010', 2), 170n); assert.equal(N.parseBase('-z', 36), -35n)
assert.equal(N.toBase(255n, 16), 'FF'); assert.equal(N.toBase(255n, 16, false), 'ff')
assert.equal(N.toBase(63n, 64), '/'); assert.equal(N.toBase(64n, 64), '10'); assert.equal(N.toBase(36n, 62), 'a')
for (const r of [2, 7, 36, 37, 58, 62, 64]) for (const v of [0n, 1n, 12345678901234567890n, -999n]) assert.equal(N.parseBase(N.toBase(v, r), r), v, `${r}:${v}`)
assert.throws(() => N.parseBase('g', 16), /not a valid/)
assert.throws(() => N.parseBase('1', 65))
assert.equal(N.toRoman(2026), 'MMXXVI'); assert.equal(N.toRoman(3999), 'MMMCMXCIX'); assert.equal(N.toRoman(4), 'IV')
assert.equal(N.fromRoman('mcmxciv'), 1994); assert.throws(() => N.fromRoman('IIII')); assert.throws(() => N.fromRoman('VX')); assert.throws(() => N.toRoman(0))
assert.equal(N.fromRoman(N.toRoman(123456)), 123456); assert.equal(N.toRoman(5000), 'V\u0305')
for (let i = 1; i < 4000; i++) assert.equal(N.fromRoman(N.toRoman(i)), i)
console.log('numbase ok')
