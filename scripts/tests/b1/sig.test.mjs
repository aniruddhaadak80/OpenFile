// Run: npx tsx scripts/tests/b1/sig.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { makeTestCertificate, readP12, signPdf, verifyPdf } from '../../../src/tools/pdf/_b1/sig.ts'

const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica)
d.addPage().drawText('Contract', { x: 50, y: 700, size: 24, font: f }); d.addPage()
const pdf = await d.save()
const p12 = await makeTestCertificate({ name: 'Test Signer', email: 't@example.org', password: 'pw' })
assert.throws(() => readP12(p12, 'wrong'), /password/i)
const id = readP12(p12, 'pw')
assert.match(id.subject, /CN=Test Signer/)
const signed = await signPdf(pdf, id, { reason: 'Approval', location: 'Kolkata', visible: { page: 0, rect: [50, 50, 250, 110] } })
if (process.env.OUT) fs.writeFileSync(process.env.OUT, signed)
let r = await verifyPdf(signed)
assert.equal(r.length, 1)
assert.equal(r[0].digestOk, true, 'digest matches')
assert.equal(r[0].signatureOk, true, 'signature verifies')
assert.equal(r[0].coversWholeFile, true)
assert.equal(r[0].certValidAtSigning, true)
assert.equal(r[0].chain[0].selfSigned, true)
assert.equal(r[0].chain[0].signedByNext, true)
assert.equal(r[0].reason, 'Approval')
console.log('ok   sign + verify', r[0].signer, r[0].digestAlg)

// tamper one byte inside the signed range
const bad = new Uint8Array(signed); const i = 12; bad[i] = bad[i] ^ 1
r = await verifyPdf(bad)
assert.equal(r[0].digestOk, false, 'tampering detected')
console.log('ok   tamper detected')

// second signature is appended as an incremental update: both stay valid
const twice = await signPdf(signed, id, {})
r = await verifyPdf(twice)
assert.equal(r.length, 2)
assert.ok(r.every((x) => x.digestOk === true && x.signatureOk === true))
assert.equal(r.find((x) => x.field === 'Signature1').coversWholeFile, false)
assert.equal(r.find((x) => x.field === 'Signature1').laterRevisions, true)
// a PDF saved with object streams (xref stream) also gets a valid incremental signature
const xs = await signPdf(await d.save({ useObjectStreams: true }), id, {})
r = await verifyPdf(xs)
assert.equal(r[0].digestOk, true); assert.equal((await PDFDocument.load(xs)).getPageCount(), 2)
if (process.env.OUT) fs.writeFileSync(process.env.OUT.replace('.pdf', '-2.pdf'), twice)
console.log('ok   second signature', r.map((x) => [x.field, x.digestOk]))
