import assert from 'node:assert/strict'
import { checkGrammar, words } from '../../../src/lib/b5/grammar.ts'
const t = 'This is is a apple. it was an useful tool,and I could of known.  Faster then light. A hour later an honest man said hi.'
const iss = checkGrammar(t)
const msgs = iss.map((i) => t.slice(i.start, i.end) + ' => ' + i.msg)
assert.ok(msgs.some((m) => m.startsWith('is is')))
assert.ok(msgs.some((m) => m.includes('Use “an” before “apple”')))
assert.ok(msgs.some((m) => m.includes('Use “a” before “useful”')))
assert.ok(msgs.some((m) => m.startsWith('i =>')))
assert.ok(msgs.some((m) => m.startsWith('could of')))
assert.ok(msgs.some((m) => m.startsWith('Faster then')))
assert.ok(msgs.some((m) => m.includes('“an” before “hour”')))
assert.ok(!msgs.some((m) => m.includes('“honest”')))
assert.ok(msgs.some((m) => m.includes('space after')))
assert.deepEqual(words("Don't visit https://x.com or ABC123 now").map((w) => w.w), ["Don't", 'visit', 'or', 'now'])
console.log('grammar ok')
