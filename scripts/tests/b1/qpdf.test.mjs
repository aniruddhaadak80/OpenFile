// Run: node scripts/tests/b1/qpdf.test.mjs  (checks the qpdf flags used by linearize-pdf)
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { PDFDocument, StandardFonts } from 'pdf-lib'
const require = createRequire(import.meta.url)
const createModule = require('@neslinesli93/qpdf-wasm')
const wasm = require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm')
const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica)
for (let i = 0; i < 5; i++) d.addPage().drawText('Hello ' + i, { x: 50, y: 700, size: 20, font: f })
const input = await d.save({ useObjectStreams: false })
const q = await createModule({ locateFile: () => wasm, noInitialRun: true, print: () => {}, printErr: (s) => console.log('qpdf:', s) })
q.FS.writeFile('/in.pdf', input)
const rc = q.callMain(['--linearize', '--object-streams=generate', '--compress-streams=y', '--recompress-flate', '--compression-level=9', '--remove-unreferenced-resources=yes', '/in.pdf', '/out.pdf'])
const out = q.FS.readFile('/out.pdf')
assert.equal(rc, 0)
assert.ok(new TextDecoder().decode(out.slice(0, 300)).includes('/Linearized'))
assert.equal((await PDFDocument.load(out)).getPageCount(), 5)
console.log('ok   qpdf linearize', input.length, '->', out.length, 'bytes')
