import assert from 'node:assert/strict'
import * as C from '../../../src/lib/b5/cronbuild.ts'
const b = C.defaultBuilder()
assert.equal(C.builderToCron(b, false), '* * * * *')
b.minute = { ...b.minute, mode: 'step', step: 15, from: 0 }
b.hour = { ...b.hour, mode: 'range', from: 9, to: 17 }
b.dow = { ...b.dow, mode: 'specific', values: [5, 1, 2, 3, 4] }
assert.equal(C.builderToCron(b, false), '*/15 9-17 * * 1-5')
b.month = { ...b.month, mode: 'specific', values: [1, 2, 6] }
assert.equal(C.builderToCron(b, true), '* */15 9-17 * 1,2,6 1-5')
for (const e of ['*/15 9-17 * * 1-5', '0 0 1 1 *', '5/10 * * * *', '30 18 * * 5', '0 9 1,15 * 1,3-5']) assert.equal(C.builderToCron(C.cronToBuilder(e).state, false), e)
const p = C.cronToBuilder('0 9 * JAN-MAR MON-FRI'); assert.equal(C.builderToCron(p.state, false), '0 9 * 1-3 1-5')
assert.equal(C.cronToBuilder('0 12 L * *'), null)
assert.equal(C.cronToBuilder('0 10 * * 1#1'), null)
assert.equal(C.cronToBuilder('0 0 * * 7').state.dow.values[0], 0)
assert.equal(C.cronToBuilder('*/30 * * * * *').withSeconds, true)
console.log('cronbuild ok')
