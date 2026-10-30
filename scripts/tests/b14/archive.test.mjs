import assert from 'node:assert/strict'
import { zipSync, unzipSync, strToU8 } from 'fflate'
import * as A from '../../../src/lib/b14/archive.ts'
assert.deepEqual(A.partSizes(10, { mode: 'size', size: 4 }), [4, 4, 2])
assert.deepEqual(A.partSizes(10, { mode: 'count', count: 3 }), [4, 4, 2])
assert.equal(A.partName('movie.mkv', 0, 12), 'movie.mkv.001')
const o = A.orderParts(['a.bin.003', 'a.bin.001', 'a.bin.002'])
assert.deepEqual(o.order, [1, 2, 0]); assert.equal(o.joined, 'a.bin'); assert.deepEqual(o.gaps, [])
assert.deepEqual(A.orderParts(['x.001', 'x.003']).gaps, [2])
// salvage: a good zip, then cut the central directory off and damage the end
const z = zipSync({ 'hello.txt': strToU8('hello world '.repeat(200)), 'dir/data.json': strToU8('{"a":1}'), 'raw.bin': [new Uint8Array(500).fill(7), { level: 0 }] })
const cut = z.slice(0, z.length - 60)
const s = A.salvageZip(cut)
assert.equal(s.length, 3, JSON.stringify(s.map((x) => [x.name, x.note])))
assert.equal(new TextDecoder().decode(s[0].data), 'hello world '.repeat(200))
const re = unzipSync(A.rebuildZip(s))
assert.equal(Object.keys(re).length, 3)
// manifests
const m = A.writeManifest([{ path: 'a.txt', hash: 'd41d8cd98f00b204e9800998ecf8427e' }], 'md5', 'gnu')
assert.deepEqual(A.parseManifest(m), [{ hash: 'd41d8cd98f00b204e9800998ecf8427e', path: 'a.txt', algo: 'md5' }])
assert.equal(A.parseManifest('SHA256 (b.iso) = ' + 'a'.repeat(64))[0].algo, 'sha256')
assert.equal(A.parseManifest('; c\nfile one.rar 1A2B3C4D')[0].path, 'file one.rar')
assert.equal(A.parseManifest(A.writeManifest([{ path: 'x', hash: 'deadbeef' }], 'crc32', 'sfv'))[0].hash, 'deadbeef')
console.log('b14 archive ok')
