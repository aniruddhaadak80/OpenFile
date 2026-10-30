import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import * as D from '../../../src/lib/b14/dev.ts'

// torrent
const enc = (s) => new TextEncoder().encode(s)
const info = 'd6:lengthi1048576e4:name8:demo.bin12:piece lengthi262144e6:pieces80:' + 'x'.repeat(80) + 'e'
const t = enc('d8:announce30:udp://tracker.example.org:13377:comment4:test13:creation datei1700000000e4:info' + info + 'e')
const ti = await D.parseTorrent(t)
assert.equal(ti.name, 'demo.bin'); assert.equal(ti.total, 1048576); assert.equal(ti.pieces, 4); assert.equal(ti.trackers[0], 'udp://tracker.example.org:1337')
assert.equal(ti.infoHash, createHash('sha1').update(info).digest('hex'))
assert.ok(ti.magnet.startsWith('magnet:?xt=urn:btih:' + ti.infoHash))
assert.equal(D.parseMagnet(ti.magnet).name, 'demo.bin')
await assert.rejects(D.parseTorrent(enc('d3:foo3:bare')))

// env
const e = D.parseEnv('# db\nDB_URL="postgres://u:p@h/db" # inline\nexport DEBUG=true\nEMPTY=\nMULTI="a\nb"\nNAME=hello world # c\n')
assert.deepEqual(e.entries.map((x) => x.key), ['DB_URL', 'DEBUG', 'EMPTY', 'MULTI', 'NAME'])
assert.equal(e.entries[0].value, 'postgres://u:p@h/db'); assert.equal(e.entries[0].comment, 'db')
assert.equal(e.entries[3].value, 'a\nb'); assert.equal(e.entries[4].value, 'hello world')
assert.ok(D.writeEnv(e.entries, 'k8s-secret').includes('DEBUG: dHJ1ZQ=='))
assert.equal(JSON.parse(D.writeEnv(e.entries, 'json')).DEBUG, 'true')
assert.deepEqual(D.readEnvAny('{"A":"1","B":2}'), [{ key: 'A', value: '1' }, { key: 'B', value: '2' }])
assert.deepEqual(D.compareEnv([{ key: 'A', value: '1' }], [{ key: 'B', value: '' }]).onlyA, ['A'])

// semver
const v = (s) => D.parseSemver(s)
assert.equal(D.compareSemver(v('1.0.0-alpha'), v('1.0.0-alpha.1')), -1)
assert.equal(D.compareSemver(v('1.0.0-rc.1'), v('1.0.0')), -1)
assert.equal(D.compareSemver(v('1.0.0-beta.11'), v('1.0.0-beta.2')), 1)
assert.ok(D.satisfies(v('1.4.2'), '^1.2.0')); assert.ok(!D.satisfies(v('2.0.0'), '^1.2.0'))
assert.ok(D.satisfies(v('0.2.5'), '^0.2.3')); assert.ok(!D.satisfies(v('0.3.0'), '^0.2.3'))
assert.ok(D.satisfies(v('1.2.9'), '~1.2.3')); assert.ok(!D.satisfies(v('1.3.0'), '~1.2.3'))
assert.ok(D.satisfies(v('1.9.0'), '1.x')); assert.ok(D.satisfies(v('3.0.0'), '<2 || >=3'))
assert.ok(D.satisfies(v('1.5.0'), '1.2.3 - 2.3.4')); assert.ok(!D.satisfies(v('2.4.0'), '1.2.3 - 2.3.4'))
assert.ok(!D.satisfies(v('1.3.0-beta.1'), '^1.2.0')); assert.ok(D.satisfies(v('1.2.0-beta.2'), '>=1.2.0-beta.1 <1.3.0'))
assert.equal(D.fmtSemver(D.bump(v('1.2.3'), 'minor')), '1.3.0')
assert.equal(D.fmtSemver(D.bump(v('1.2.3-beta.1'), 'prerelease')), '1.2.3-beta.2')
assert.equal(D.fmtSemver(D.bump(v('1.2.3'), 'prerelease')), '1.2.4-beta.0')
assert.equal(v('1.2'), null)

// wasm
const wasm = new Uint8Array([0x00,0x61,0x73,0x6d,0x01,0,0,0, 0x01,0x07,0x01,0x60,0x02,0x7f,0x7f,0x01,0x7f, 0x03,0x02,0x01,0x00, 0x07,0x07,0x01,0x03,0x61,0x64,0x64,0x00,0x00, 0x0a,0x09,0x01,0x07,0x00,0x20,0x00,0x20,0x01,0x6a,0x0b])
const w = D.parseWasm(wasm)
assert.equal(w.exports[0].name, 'add'); assert.equal(w.exports[0].type, '(i32, i32) -> i32'); assert.equal(w.functions, 1)
assert.throws(() => D.parseWasm(enc('hello world')))
console.log('b14 dev ok')
