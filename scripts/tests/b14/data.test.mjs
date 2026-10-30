import assert from 'node:assert/strict'
import * as D from '../../../src/lib/b14/data.ts'
const p = D.profile(['id', 'price', 'city', 'ok', 'when'], [[1, '10.5', 'Pune', 'yes', '2026-01-02'], [2, '1,200', 'Pune', 'no', '2026-02-03'], [3, '', 'Delhi', 'yes', '2026-03-04'], [4, '9999', 'NA', 'no', '2026-04-05']])
assert.equal(p[0].type, 'integer'); assert.ok(p[0].unique); assert.equal(p[1].type, 'number'); assert.equal(p[1].nulls, 1); assert.equal(p[1].max, 9999)
assert.equal(p[2].type, 'text'); assert.equal(p[2].nulls, 1); assert.equal(p[2].top[0].value, 'Pune'); assert.equal(p[3].type, 'boolean'); assert.equal(p[4].type, 'date')
const c = D.correlations(D.profile(['a', 'b'], [[1, 2], [2, 4], [3, 6], [4, 8]]), ['a', 'b'], [[1, 2], [2, 4], [3, 6], [4, 8]]); assert.ok(Math.abs(c[0].r - 1) < 1e-9)
const obj = { id: 1, user: { name: 'Ann', tags: ['a', 'b'] }, items: [{ sku: 'x', qty: 2 }], empty: {} }
const f = D.flatten(obj); assert.deepEqual(f, { id: 1, 'user.name': 'Ann', 'user.tags.0': 'a', 'user.tags.1': 'b', 'items.0.sku': 'x', 'items.0.qty': 2, empty: '{}' })
assert.deepEqual(D.unflatten(f), obj)
assert.equal(D.flatten(obj, { arrays: 'join' })['user.tags'], 'a; b')
const t = D.recordsToTable([{ a: 1 }, { a: 2, b: { c: 3 } }]); assert.deepEqual(t.header, ['a', 'b.c']); assert.deepEqual(t.rows[0], [1, ''])
assert.equal(D.typed('42'), 42); assert.equal(D.typed('007'), '007'); assert.equal(D.typed('true'), true)
assert.equal(D.tableName('2024 Sales-Report.csv', new Set()), 't_2024_sales_report')
assert.deepEqual(D.columnTypes(['a', 'b', 'c'], [['1', '1.5', 'x'], ['2', '3', 'y']]), ['INTEGER', 'REAL', 'TEXT'])
assert.deepEqual(D.uniqueHeaders(['a', 'A', '']), ['a', 'A_2', 'col3'])
// HL7
const hl7 = 'MSH|^~\\&|LAB|HOSP|EHR|CLINIC|20260101120000||ORU^R01|MSG001|P|2.5\rPID|1||12345^^^HOSP||Doe^Jane||19800101|F\rOBX|1|NM|GLU^Glucose||95|mg/dL|70-99|N'
const h = D.parseEdi(hl7); assert.equal(h.kind, 'HL7'); assert.equal(h.segments.length, 3); assert.equal(h.summary['Message type'], 'ORU^R01'); assert.equal(h.summary.Patient, 'Jane Doe'); assert.equal(h.segments[2].elements[4][0][0], '95')
// X12
const isa = 'ISA*00*          *00*          *ZZ*SENDERID       *ZZ*RECEIVERID     *260101*1200*^*00501*000000001*0*P*:~GS*PO*S*R*20260101*1200*1*X*005010~ST*850*0001~BEG*00*SA*PO123**20260101~SE*3*0001~GE*1*1~IEA*1*000000001~'
const x = D.parseEdi(isa); assert.equal(x.kind, 'X12'); assert.equal(x.summary['Transaction set'], '850'); assert.equal(x.summary.Sender, 'SENDERID'); assert.equal(x.segments.find((s) => s.id === 'BEG').elements[2][0][0], 'PO123')
// EDIFACT
const ed = "UNA:+.? 'UNB+UNOC:3+SENDER+RECEIVER+260101:1200+REF1'UNH+1+ORDERS:D:96A:UN'BGM+220+PO?+77+9'UNT+3+1'UNZ+1+REF1'"
const e = D.parseEdi(ed); assert.equal(e.kind, 'EDIFACT'); assert.equal(e.summary.Message, 'ORDERS:D:96A'); assert.equal(e.summary.Document, 'PO+77')
assert.throws(() => D.parseEdi('hello'))
assert.ok(D.ediToJson(h).segments[0].fields.MSH09)
console.log('b14 data ok')
