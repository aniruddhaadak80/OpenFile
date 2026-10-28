import assert from 'node:assert/strict'
import { pigLatin, nato, upsideDown, removeVowels, leet } from '../../../src/lib/b12/text.ts'
assert.equal(pigLatin('hello apple'), 'ellohay appleway')
assert.equal(nato('ab 1'), 'Alfa Bravo / One')
assert.equal(upsideDown('hi'), 'ᴉɥ')
assert.equal(removeVowels('hello world'), 'hll wrld')
assert.equal(removeVowels('hello', true), 'hll')
assert.equal(leet('leet'), '1337')
console.log('ok')
