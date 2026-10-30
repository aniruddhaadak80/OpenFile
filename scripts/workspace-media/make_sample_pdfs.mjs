// Sample PDFs for the Workspace recipes (made here with pdf-lib, no third-party content).
//   node scripts/workspace-media/make_sample_pdfs.mjs
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fs from 'node:fs'
const out = new URL('../../public/media/workspace/samples/', import.meta.url)
const gold = rgb(0.96, 0.65, 0.14), teal = rgb(0.08, 0.72, 0.65), ink = rgb(0.1, 0.1, 0.12), mute = rgb(0.42, 0.42, 0.45)
async function report() {
  const d = await PDFDocument.create(); d.setTitle('Quarterly report'); d.setAuthor('Sample Author'); d.setSubject('Workspace sample'); d.setKeywords(['sample', 'openfile'])
  const f = await d.embedFont(StandardFonts.Helvetica), b = await d.embedFont(StandardFonts.HelveticaBold)
  const titles = ['Quarterly report', 'Numbers at a glance', 'Next steps']
  for (let i = 0; i < 3; i++) {
    const p = d.addPage([595.28, 841.89])
    p.drawRectangle({ x: 0, y: 781, width: 595.28, height: 60, color: ink })
    p.drawText('OpenFile sample', { x: 40, y: 805, size: 14, font: b, color: gold })
    p.drawText(titles[i], { x: 40, y: 720, size: 28, font: b, color: ink })
    for (let l = 0; l < 14; l++) p.drawText('This is a sample page made for trying Workspace recipes. Merge it, number it, watermark it.', { x: 40, y: 670 - l * 22, size: 11, font: f, color: mute })
    for (let k = 0; k < 6; k++) { const h = 40 + ((k * 37 + i * 23) % 120); p.drawRectangle({ x: 60 + k * 80, y: 120, width: 50, height: h, color: k % 2 ? teal : gold }) }
  }
  fs.writeFileSync(new URL('report.pdf', out), await d.save())
}
async function invoice() {
  const d = await PDFDocument.create(); d.setTitle('Invoice 2026-104'); d.setAuthor('Sample Shop')
  const f = await d.embedFont(StandardFonts.Helvetica), b = await d.embedFont(StandardFonts.HelveticaBold)
  const p = d.addPage([595.28, 841.89])
  p.drawText('INVOICE', { x: 40, y: 770, size: 30, font: b, color: gold })
  p.drawText('No. 2026-104', { x: 40, y: 740, size: 12, font: f, color: mute })
  const rows = [['Notebook', '2', '241.00'], ['Pen', '10', '150.00'], ['Canvas bag', '1', '899.00']]
  rows.forEach((r, i) => { const y = 660 - i * 28; p.drawText(r[0], { x: 40, y, size: 12, font: f, color: ink }); p.drawText(r[1], { x: 360, y, size: 12, font: f, color: ink }); p.drawText(r[2], { x: 480, y, size: 12, font: f, color: ink }) })
  p.drawLine({ start: { x: 40, y: 560 }, end: { x: 555, y: 560 }, thickness: 1, color: teal })
  p.drawText('Total  1290.00', { x: 420, y: 535, size: 14, font: b, color: ink })
  fs.writeFileSync(new URL('invoice.pdf', out), await d.save())
}
await report(); await invoice(); console.log('pdfs ok')
