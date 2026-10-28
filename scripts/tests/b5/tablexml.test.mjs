import assert from 'node:assert/strict'
import { parseXmlTable, tableToXml, looksLikeXml } from '../../../src/lib/b5/tablexml.ts'
const xml = `<?xml version="1.0"?><catalog><book id="b1"><title>Dune</title><author>Herbert</author><price cur="USD">9.99</price></book>
<book id="b2"><title>Emma &amp; Co</title><author>Austen</author></book><book id="b3"><title>Ubik</title><tags><tag>sf</tag><tag>pkd</tag></tags></book></catalog>`
const t = await parseXmlTable(xml)
assert.deepEqual(t.headers, ['@id', 'title', 'author', 'price.@cur', 'price', 'tags.tag'])
assert.deepEqual(t.rows[1], ['b2', 'Emma & Co', 'Austen', '', '', ''])
assert.equal(t.rows[0][4], '9.99'); assert.equal(t.rows[2][5], 'sf; pkd')
assert.equal(t.recordPath, 'catalog > book')
const out = tableToXml({ headers: ['first name', '2nd', 'a&b'], rows: [['Ada <3', '', 'x']] })
assert.ok(out.includes('<first_name>Ada &lt;3</first_name>')); assert.ok(out.includes('<col_2nd/>'))
const back = await parseXmlTable(out); assert.deepEqual(back.rows, [['Ada <3', '', 'x']])
const attr = tableToXml({ headers: ['a', 'b'], rows: [['1', '"q"'], ['2', '']] }, { root: 'data', row: 'item', attributes: true, pretty: false })
assert.equal(attr, '<?xml version="1.0" encoding="UTF-8"?><data><item a="1" b="&quot;q&quot;"/><item a="2" b=""/></data>')
const back2 = await parseXmlTable(attr); assert.deepEqual(back2.rows, [['1', '"q"'], ['2', '']])
await assert.rejects(parseXmlTable('<a><b></a>'), /XML error/)
assert.ok(looksLikeXml(xml)); assert.ok(!looksLikeXml('<table><tr><td>1</td></tr></table>')); assert.ok(!looksLikeXml('a,b'))
console.log('tablexml ok')
