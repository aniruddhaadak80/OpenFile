import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import * as P from '../../../src/lib/b14/pdf.ts'
const make = async (n, size = [595, 842]) => { const d = await PDFDocument.create(); for (let i = 0; i < n; i++) d.addPage(size); return d.save() }
assert.equal(P.batesLabel(7, { prefix: 'ABC', suffix: '-X', digits: 6 }), 'ABC000007-X')
const r = await P.batesNumber([await make(3), await make(2)], { prefix: 'CASE', suffix: '', start: 100, digits: 5, position: 'br', size: 9, color: '#000000', font: 'Helvetica', margin: 20, box: true })
assert.deepEqual(r.ranges.map((x) => [x.first, x.last]), [['CASE00100', 'CASE00102'], ['CASE00103', 'CASE00104']])
assert.equal((await PDFDocument.load(r.outputs[1])).getPageCount(), 2)
const s = await P.stampPdf(await make(2), { text: 'PAID', sub: '29 Oct 2026', color: '#0F9F6E', position: 'tr', size: 40, angle: -15, opacity: 0.8, margin: 40, double: true, font: 'Helvetica-Bold', pages: [0] })
assert.ok(s.length > 500)
const st = await P.stackPages(await make(30), { gap: 10 })
assert.equal(st.length, 2) // 30 x 842 is above the 14400 pt limit, so it splits in two
const one = await PDFDocument.load(st[0]); assert.ok(one.getPage(0).getSize().height <= 14400)
const pl = P.place('br', 600, 800, 100, 20, 10); assert.deepEqual(pl, { x: 490, y: 10 })
console.log('b14 pdf ok')
