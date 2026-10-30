// Run: node --experimental-strip-types scripts/tests/b4/ai.test.mjs
import assert from 'node:assert/strict'
import { chunkText, extractJson, cosine, jsonObjects, opusPlan } from '../../../src/lib/b4/ai.ts'

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
// quiz cards stream in: complete objects from a cut-off array, braces inside strings, trailing commas
assert.deepEqual(jsonObjects('```json\n[{"q":"What is {x}?","a":"a \\"y\\""}, {"q":"b","a":"c",}, {"q":"cut'), [{ q: 'What is {x}?', a: 'a "y"' }, { q: 'b', a: 'c' }])
assert.deepEqual(jsonObjects('[{"q":"x","options":["A","B"],"answer":1}]'), [{ q: 'x', options: ['A', 'B'], answer: 1 }])
assert.deepEqual(jsonObjects('no json here'), [])
// light translator: one small OPUS-MT model per pair, en-mul with a language token, pivot through English
assert.deepEqual(opusPlan('eng_Latn', 'spa_Latn'), [{ model: 'Xenova/opus-mt-en-es', prefix: '', to: 'spa_Latn' }])
assert.deepEqual(opusPlan('fra_Latn', 'eng_Latn'), [{ model: 'Xenova/opus-mt-fr-en', prefix: '', to: 'eng_Latn' }])
assert.deepEqual(opusPlan('eng_Latn', 'ben_Beng'), [{ model: 'Xenova/opus-mt-en-mul', prefix: '>>ben<< ', to: 'ben_Beng' }])
assert.equal(opusPlan('eng_Latn', 'zho_Hant')[0].prefix, '>>cmn_Hant<< ')
assert.deepEqual(opusPlan('ben_Beng', 'eng_Latn').map((s) => s.model), ['Xenova/opus-mt-mul-en'])
assert.deepEqual(opusPlan('deu_Latn', 'fra_Latn').map((s) => s.model), ['Xenova/opus-mt-de-en', 'Xenova/opus-mt-en-fr'])
assert.deepEqual(opusPlan('eng_Latn', 'eng_Latn'), [])
assert.throws(() => opusPlan('eng_Latn', 'kor_Hang'), /NLLB-200/)
console.log('ai helpers: all tests passed')
