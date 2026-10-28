import assert from 'node:assert/strict'
import { loadLibs, convert, FORMATS, sniffText, defaultOpts } from '../../../src/lib/b5/dataconv.ts'
const L = await loadLibs()
const sample = { name: 'OpenFile', version: 3, tags: ['a', 'b'], owner: { id: 7, active: true } }
const json = JSON.stringify(sample)
for (const f of FORMATS) {
  if (f.id === 'csv' || f.id === 'tsv' || f.id === 'ini' || f.id === 'ndjson' || f.id === 'xml') continue
  const { out } = convert('json', f.id, json, L)
  const back = convert(f.id, 'json', out, L).value
  assert.deepEqual(back, sample, f.id)
}
// csv
const rows = [{ a: 1, b: 'x', n: { c: 2 } }, { a: 2, b: 'y,z', n: { c: 3 } }]
const csv = convert('json', 'csv', JSON.stringify(rows), L).out
assert.match(csv, /a,b,n\.c/)
assert.deepEqual(convert('csv', 'json', csv, L).value, rows)
// xml round trip
const x = convert('json', 'xml', JSON.stringify({ catalog: { book: [{ '@_id': 1, title: 'A' }, { '@_id': 2, title: 'B' }] } }), L).out
assert.match(x, /<book id="1">/)
assert.equal(convert('xml', 'json', x, L).value.catalog.book[1].title, 'B')
// ini
const ini = convert('json', 'ini', JSON.stringify({ server: { host: 'x', port: 80 } }), L).out
assert.match(ini, /\[server\]/)
assert.equal(convert('ini', 'json', ini, L).value.server.host, 'x')
assert.equal(sniffText('<a/>'), 'xml'); assert.equal(sniffText('{"a":1}'), 'json'); assert.equal(sniffText('a,b\n1,2'), 'csv'); assert.equal(sniffText('a: 1'), 'yaml')
assert.equal(sniffText('title = "x"\n[owner]\nname = "y"'), 'toml')
console.log('dataconv ok')
