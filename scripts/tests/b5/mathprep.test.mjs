import assert from 'node:assert/strict'
import { create, all } from 'mathjs'
import { prep } from '../../../src/lib/b5/mathprep.ts'
const m = create(all)
const ev = (s) => m.evaluate(prep(s))
assert.equal(ev('20% of 150'), 30)
assert.equal(+ev('150 + 20%').toFixed(6), 180)
assert.equal(+ev('200 - 10%').toFixed(6), 180)
assert.equal(ev('50 as % of 200'), 25)
assert.equal(ev('1,234 * 2'), 2468)
assert.equal(m.format(ev('5 km in mi'), { precision: 4 }), '3.107 mi')
assert.equal(ev('2 ^ 10'), 1024)
console.log('mathprep ok')
