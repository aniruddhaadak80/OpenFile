import assert from 'node:assert/strict'
import * as I from '../../../src/lib/b5/ids.ts'
assert.equal(I.generate('v5', { name: 'www.example.com', namespace: I.NAMESPACES.DNS }), '2ed6657d-e927-568b-95e1-2665a8aea6a2')
assert.equal(I.generate('v3', { name: 'www.example.com', namespace: I.NAMESPACES.DNS }), '5df41881-3aed-3515-88a7-2f4a814cf09e')
for (const k of ['v1', 'v4', 'v6', 'v7']) { const u = I.generate(k); assert.ok(I.uuidValidate(u), k); assert.equal(u[14], k[1]) }
const us = Array.from({ length: 200 }, () => I.ulid(1700000000000))
assert.equal(new Set(us).size, 200)
assert.deepEqual([...us].sort(), us)
assert.equal(I.parseUlid(us[0]).ms, 1700000000000)
assert.equal(I.parseUlid('01ARZ3NDEKTSV4RRFFQ69G5FAV').ms, 1469922850259)
assert.ok(I.uuidValidate(I.ulidToUuid(us[0])) || /^[0-9a-f-]{36}$/.test(I.ulidToUuid(us[0])))
assert.equal(I.parseUlid('nope'), null)
const n = I.nanoid(); assert.equal(n.length, 21); assert.match(n, /^[A-Za-z0-9_-]+$/)
const h = I.nanoid(10, '0123456789abcdef'); assert.match(h, /^[0-9a-f]{10}$/)
assert.throws(() => I.nanoid(5, 'aaaa'))
assert.equal(I.generateMany('v5', 0, { name: 'a\nb', namespace: I.NAMESPACES.URL }).length, 2)
assert.equal(I.generateMany('v7', 50).length, 50)
console.log('ids ok')
