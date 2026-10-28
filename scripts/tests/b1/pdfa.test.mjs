// Run: npx tsx scripts/tests/b1/pdfa.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { buildSrgbIcc, convertToPdfa, validatePdfa, accessibilityCheck } from '../../../src/tools/pdf/_b1/pdfa.ts'

const icc = buildSrgbIcc()
assert.equal(new DataView(icc.buffer).getUint32(0), icc.length)
assert.equal(new TextDecoder().decode(icc.subarray(36, 40)), 'acsp')
if (process.env.ICC_OUT) fs.writeFileSync(process.env.ICC_OUT, icc)
console.log('ok   icc profile', icc.length, 'bytes')

const d = await PDFDocument.create()
const font = await d.embedFont(StandardFonts.Helvetica)
d.addPage().drawText('Archive me', { x: 50, y: 700, size: 20, font })
d.addJavaScript('x', 'app.alert(1)')
d.setTitle('My report')
const before = await validatePdfa(await d.save())
assert.ok(before.some((f) => f.level === 'fail' && /identification/.test(f.title)))
assert.ok(before.some((f) => f.level === 'fail' && /JavaScript/.test(f.title)))
const { bytes, report } = await convertToPdfa(await d.save(), '2b')
if (process.env.PDFA_OUT) fs.writeFileSync(process.env.PDFA_OUT, bytes)
const after = await validatePdfa(bytes, '2b')
assert.ok(after.some((f) => f.level === 'pass' && /PDF\/A-2b/.test(f.title)), 'declares PDF/A-2b')
assert.ok(!after.some((f) => f.level === 'fail' && /JavaScript|output intent|identifier/.test(f.title)))
assert.ok(after.some((f) => f.level === 'fail' && /not embedded/.test(f.title)), 'standard 14 font flagged')
assert.ok(report.fixed.length >= 3)
console.log('ok   convert + validate', report.fixed)

const a = await accessibilityCheck(bytes, { textPages: 1, pages: 1 })
assert.ok(a.some((f) => /not tagged/.test(f.title)))
console.log('ok   accessibility heuristics')
