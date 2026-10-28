// Run: npx tsx scripts/tests/b1/pdfsvg-render.test.mts
// Converts a generated PDF (rotated page, dashed ellipse with opacity, rotated text, embedded page) to SVG with pdf.js in Node.
import assert from 'node:assert/strict'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import { pageToSvg } from '../../../src/tools/convert/_b1/pdfsvg.ts'

const src = await PDFDocument.create()
const sf = await src.embedFont(StandardFonts.Helvetica)
const sp = src.addPage([595, 842]); sp.drawText('Inner page', { x: 60, y: 760, size: 28, font: sf }); sp.drawRectangle({ x: 60, y: 342, width: 300, height: 200, color: rgb(0.3, 0.4, 0.8) })
const d = await PDFDocument.create()
const f = await d.embedFont(StandardFonts.TimesRomanBold)
const p = d.addPage([400, 300]); p.setRotation(degrees(90))
p.drawText('Rotated text', { x: 40, y: 250, size: 20, font: f, rotate: degrees(15), color: rgb(0.1, 0.5, 0.3) })
p.drawEllipse({ x: 200, y: 150, xScale: 80, yScale: 40, borderColor: rgb(1, 0, 0), borderWidth: 3, borderDashArray: [6, 3], color: rgb(0, 0.6, 0.8), opacity: 0.5 })
const [emb] = await d.embedPdf(await src.save(), [0])
p.drawPage(emb, { x: 250, y: 20, xScale: 0.2, yScale: 0.2 })
const bytes = await d.save()
const doc = await pdfjs.getDocument({ data: bytes, fontExtraProperties: true, standardFontDataUrl: new URL('../../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).pathname }).promise
const r = await pageToSvg(doc, 1, { mode: 'vector', embedFonts: true, imageType: 'png', dpi: 150, background: true }, pdfjs.OPS as any)
const s = r.svg
assert.match(s, /^<svg [^>]*width="300pt" height="400pt"/, 'rotated page swaps width and height')
assert.match(s, /@font-face\{font-family:"g_/, 'fonts embedded')
assert.match(s, /fill="#0099cc" fill-opacity="0.5"/, 'ellipse fill with opacity')
assert.match(s, /stroke-dasharray="6 3"/, 'dashes kept')
assert.match(s, /<clipPath id="c1_1"/, 'form bbox clip')
assert.ok(s.includes('>Rotated text</text>') && s.includes('>Inner page</text>'), 'searchable text copies present')
assert.equal((s.match(/<g/g) || []).length, (s.match(/<\/g>/g) || []).length, 'balanced groups')
console.log('ok   pdf page converted to SVG,', s.length, 'chars, warnings:', r.warnings.length)
