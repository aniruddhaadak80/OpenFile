// Run: npx tsx scripts/tests/b1/einvoice.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import * as E from '../../../src/tools/pdf/_b1/einvoice.ts'
import { makeFacturX, invoiceXmlFromPdf } from '../../../src/tools/pdf/_b1/facturx.ts'
import { validatePdfa } from '../../../src/tools/pdf/_b1/pdfa.ts'
const require = createRequire(import.meta.url)
const fontkit = require('@pdf-lib/fontkit')
const rd = (p) => new Uint8Array(fs.readFileSync(require.resolve('pdfjs-dist/standard_fonts/' + p)))

const inv = {
  number: 'RE-2026-0042', issueDate: '2026-10-28', dueDate: '2026-11-27', deliveryDate: '2026-10-20', typeCode: '380', currency: 'EUR', buyerReference: '04011000-12345-34', note: 'Thank you & see you soon <3',
  seller: { name: 'Müller Software GmbH', street: 'Hauptstraße 5', city: 'Berlin', zip: '10115', country: 'DE', vatId: 'DE123456789', email: 'billing@mueller.example', contact: 'Anna Müller', phone: '+49 30 1234' },
  buyer: { name: 'Stadt Köln', street: 'Rathausplatz 1', city: 'Köln', zip: '50667', country: 'DE', vatId: '', email: 'rechnung@koeln.example' },
  lines: [
    { id: '1', name: 'Consulting', description: 'Workshop on PDF tooling', qty: 7.5, unit: 'HUR', price: 120, vatCategory: 'S', vatRate: 19 },
    { id: '2', name: 'Book', qty: 3, unit: 'C62', price: 19.99, vatCategory: 'S', vatRate: 7 },
    { id: '3', name: 'Training (exempt)', qty: 1, unit: 'LS', price: 500, vatCategory: 'E', vatRate: 0 },
  ],
  payment: { meansCode: '58', iban: 'DE89 3704 0044 0532 0130 00', bic: 'COBADEFFXXX', accountName: 'Müller Software GmbH', terms: 'Net 30 days', reference: 'RE-2026-0042' },
}
const t = E.totals(inv)
assert.equal(t.lineTotal, 900 + 59.97 + 500); assert.equal(t.taxTotal, E.r2(171 + 4.2)); assert.equal(t.grandTotal, E.r2(1459.97 + 175.2))
assert.ok(E.ibanOk(inv.payment.iban)); assert.ok(!E.ibanOk('DE89370400440532013001'))
console.log('ok   totals and IBAN', t.grandTotal)

for (const [label, xml] of [['CII factur-x', E.toCII(inv, 'facturx')], ['CII xrechnung', E.toCII(inv, 'xrechnung-cii')], ['UBL', E.toUBL(inv)]]) {
  const p = E.parseInvoice(xml)
  assert.equal(p.invoice.number, inv.number, label); assert.equal(p.invoice.seller.name, inv.seller.name); assert.equal(p.invoice.lines.length, 3)
  assert.equal(p.declared.grandTotal, t.grandTotal); assert.equal(p.invoice.payment.iban, 'DE89370400440532013000')
  assert.equal(p.invoice.note, inv.note)
  const fails = E.checkRules(p).filter((r) => r.level !== 'pass')
  assert.deepEqual(fails, [], label + ' rules')
  if (process.env.OUT) fs.writeFileSync(`${process.env.OUT}/inv-${label.replace(/\s+/g, '-')}.xml`, xml)
}
console.log('ok   CII and UBL round trip, all rules pass')

// broken totals are caught
const bad = E.toCII(inv).replace('<ram:GrandTotalAmount>1635.17', '<ram:GrandTotalAmount>1600.00')
assert.ok(E.checkRules(E.parseInvoice(bad)).some((r) => r.id === 'BR-CO-15' && r.level === 'fail'))
console.log('ok   wrong totals detected')

const pdf = await E.renderInvoicePdf(inv, { regular: rd('LiberationSans-Regular.ttf'), bold: rd('LiberationSans-Bold.ttf'), fontkit }, { lang: 'de' })
const { bytes, report } = await makeFacturX(pdf, E.toCII(inv), { title: 'Rechnung RE-2026-0042', author: inv.seller.name })
if (process.env.OUT) fs.writeFileSync(`${process.env.OUT}/facturx.pdf`, bytes)
const back = await invoiceXmlFromPdf(bytes)
assert.equal(back.name, 'factur-x.xml'); assert.equal(E.parseInvoice(back.xml).invoice.number, inv.number)
const pa = await validatePdfa(bytes, '3b')
assert.deepEqual(pa.filter((f) => f.level === 'fail').map((f) => f.title), [])
assert.ok(new TextDecoder('latin1').decode(bytes).includes('urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#'))
console.log('ok   Factur-X PDF/A-3b built and XML extracted', report.fixed.length, 'fixes')
