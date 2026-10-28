import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadColumnar } from '../../../src/lib/b5/columnar.ts'
for (const f of [new URL('./fixture.parquet', import.meta.url).pathname, '/tmp/b5z.parquet', new URL('./fixture.feather', import.meta.url).pathname]) {
  let b; try { b = new Uint8Array(readFileSync(f)) } catch { console.log('skip', f); continue }
  const r = await loadColumnar(b, f)
  assert.equal(r.total, 3, f); assert.deepEqual(r.columns, ['id', 'name', 'price', 'tags'])
  assert.equal(r.rows[1].name, 'b'); assert.equal(r.rows[2].name, null); assert.deepEqual(r.rows[2].tags, ['y', 'z']); assert.equal(r.rows[0].id, 1)
  console.log(r.kind, JSON.stringify(r.schema), JSON.stringify(r.meta))
}
console.log('columnar ok')
for (const f of ['/tmp/big-lz4.feather', '/tmp/big-zstd.feather', '/tmp/big-none.feather']) {
  let b; try { b = new Uint8Array(readFileSync(f)) } catch { continue }
  const r = await loadColumnar(b, f); assert.equal(r.total, 5000); assert.equal(r.rows[4321].name, 'n4321'); console.log('ok', f)
}
