// Run: node --experimental-strip-types scripts/tests/b4/ai.test.mjs
import assert from 'node:assert/strict'
import { chunkText, extractJson, cosine } from '../../../src/lib/b4/ai.ts'

const text = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} has some words. It ends here.`).join('\n\n')
const ch = chunkText(text, 200)
assert.ok(ch.length > 5 && ch.every((c) => c.length <= 260), 'chunk sizes')
assert.ok(ch.join(' ').includes('Paragraph 29'))
const long = 'A sentence. '.repeat(100)
assert.ok(chunkText(long, 100).every((c) => c.length <= 110))
assert.deepEqual(extractJson('Sure!\n```json\n[{"q":"a","a":"b"}]\n```'), [{ q: 'a', a: 'b' }])
assert.deepEqual(extractJson('noise {"x": 1} tail'), { x: 1 })
assert.equal(extractJson('nothing'), null)
assert.equal(cosine([1, 0], [0.6, 0.8]), 0.6)
console.log('ai helpers: all tests passed')
