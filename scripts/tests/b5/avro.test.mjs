import assert from 'node:assert/strict'
import avro from 'avsc'
import { readAvro } from '../../../src/lib/b5/avro.ts'
import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'
const type = avro.Type.forSchema({ type: 'record', name: 'User', namespace: 'ex', fields: [{ name: 'id', type: 'long' }, { name: 'name', type: 'string' }, { name: 'tags', type: { type: 'array', items: 'string' } }, { name: 'score', type: ['null', 'double'] }, { name: 'kind', type: { type: 'enum', name: 'Kind', symbols: ['A', 'B'] } }, { name: 'friend', type: ['null', 'User'], default: null }] })
for (const codec of ['null', 'deflate']) {
  const path = `${tmpdir()}/b5-${codec}.avro`
  await new Promise((res, rej) => { const enc = avro.createFileEncoder(path, type, { codec }); for (let i = 0; i < 1500; i++) enc.write({ id: i, name: 'u' + i, tags: ['x', 'y'], score: i % 2 ? null : i / 2, kind: i % 2 ? 'B' : 'A', friend: i === 3 ? { id: 99, name: 'f', tags: [], score: null, kind: 'A', friend: null } : null }); enc.end(); enc.on('finish', res); enc.on('error', rej) })
  await new Promise((r) => setTimeout(r, 100))
  const out = await readAvro(new Uint8Array(readFileSync(path)))
  assert.equal(out.rows.length, 1500, codec)
  assert.deepEqual(out.rows[2], { id: 2, name: 'u2', tags: ['x', 'y'], score: 1, kind: 'A', friend: null })
  assert.equal(out.rows[3].friend.id, 99)
}
console.log('avro ok')
