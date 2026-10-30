import assert from 'node:assert/strict'
import * as A from '../../../src/lib/b14/ai.ts'
const a = A.shingles('The quick brown fox jumps over the lazy dog'), b = A.shingles('the quick brown fox jumped over the lazy dog!'), c = A.shingles('Completely different words in this one sentence here')
assert.ok(A.jaccard(a, b) > 0.3); assert.equal(A.jaccard(a, c), 0); assert.equal(A.jaccard(a, a), 1)
assert.ok(Math.abs(A.cosineSim([1, 0], [1, 0]) - 1) < 1e-9)
const items = ['apple pie recipe with cinnamon', 'Apple pie recipe, with cinnamon!', 'car repair guide', 'apple pie recipe with cinnamon and sugar']
const sets = items.map((x) => A.shingles(x, 2))
const r = A.clusterPairs(items.length, (i, j) => A.jaccard(sets[i], sets[j]), 0.5)
assert.equal(r.groups.length, 1); assert.deepEqual(r.groups[0].sort(), [0, 1, 3])
assert.deepEqual(A.splitItems('One. Two! Three?', 'sentence'), ['One.', 'Two!', 'Three?'])
assert.deepEqual(A.splitItems('a\n\nb\nc', 'paragraph'), ['a', 'b\nc'])
let calls = []; const v = await A.withCpuFallback('webgpu', async (d) => { calls.push(d); if (d === 'webgpu') throw new Error('gpu lost'); return 7 }, () => calls.push('fb'))
assert.equal(v, 7); assert.deepEqual(calls, ['webgpu', 'fb', 'wasm'])
await assert.rejects(A.withCpuFallback('wasm', async () => { throw new Error('x') }))
console.log('b14 ai ok')
