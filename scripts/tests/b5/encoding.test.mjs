import assert from 'node:assert/strict'
import * as e from '../../../src/lib/b5/encoding.ts'
const s = 'Hello, wörld ✓'
const b = e.utf8(s)
for (const [to, from] of [[e.toB32, e.fromB32], [e.toB58, e.fromB58], [e.toB62, e.fromB62], [e.toA85, e.fromA85], [e.toQP, e.fromQP], [(x) => e.toB64(x, true), e.fromB64], [e.toHex, e.fromHex], [e.toBinary, e.fromBinary]]) assert.equal(e.text(from(to(b))), s, to.name)
assert.equal(e.toB32(e.utf8('foobar')), 'MZXW6YTBOI======')
assert.equal(e.toB58(e.utf8('hello world')), 'StV1DL6CwTryKyV')
assert.equal(e.toA85(e.utf8('Man ')), '<~9jqo^~>')
assert.equal(e.domainToAscii('bücher.example'), 'xn--bcher-kva.example')
assert.equal(e.domainToUnicode('xn--bcher-kva.example'), 'bücher.example')
assert.equal(e.punyEncode('münchen'), 'mnchen-3ya')
assert.equal(e.fromUnicodeEsc(e.toUnicodeEsc('a😀é')), 'a😀é')
// protobuf: field1 varint 150, field2 string "testing"
const pb = Uint8Array.from([0x08, 0x96, 0x01, 0x12, 0x07, ...e.utf8('testing')])
assert.deepEqual(e.protoDecode(pb), { 1: [150], 2: ['testing'] })
const r = await e.runRecipe(e.utf8(s), [{ id: 'gzip', params: {} }, { id: 'to-b64', params: {} }, { id: 'from-b64', params: {} }, { id: 'gunzip', params: {} }])
assert.equal(e.text(r.out), s)
const r2 = await e.runRecipe(e.utf8('{"a":[1,2]}'), [{ id: 'json-msgpack', params: {} }, { id: 'msgpack-json', params: {} }, { id: 'json-min', params: {} }])
assert.equal(e.text(r2.out), '{"a":[1,2]}')
const r3 = await e.runRecipe(e.utf8('abc'), [{ id: 'sha256', params: {} }])
assert.equal(e.text(r3.out), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
console.log('encoding ok')
