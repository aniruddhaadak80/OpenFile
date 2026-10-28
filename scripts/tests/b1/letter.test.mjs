// Run: npx tsx scripts/tests/b1/letter.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { PDFDocument } from 'pdf-lib'
import { renderLetter, bundleApplication, TEMPLATES } from '../../../src/tools/pdf/_b1/letter.ts'
import { readOutline, open } from '../../../src/tools/pdf/_b1/core.ts'
const require = createRequire(import.meta.url)
const fonts = { regular: new Uint8Array(fs.readFileSync(require.resolve('pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf'))), bold: new Uint8Array(fs.readFileSync(require.resolve('pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf'))), fontkit: require('@pdf-lib/fontkit') }
const letter = { name: 'Aniruddha Adak', title: 'Software Developer', email: 'me@example.org', phone: '+91 00000 00000', address: 'Kolkata', links: 'github.com/me, me.dev', recipient: 'Ms Šárka Nováková', company: 'Acme', companyAddress: '1 Road\nCity', date: '28 October 2026', subject: 'Application for Engineer', greeting: 'Dear Ms Nováková,', body: TEMPLATES[0].body.replace(/\{role\}/g, 'Engineer').replace(/\{company\}/g, 'Acme').repeat(3), closing: 'Kind regards,' }
for (const style of ['modern', 'classic', 'minimal']) {
  const b = await renderLetter(letter, fonts, { style, accent: [0.1, 0.6, 0.6], size: 'a4', fontSize: 10.5 })
  assert.ok((await PDFDocument.load(b)).getPageCount() >= 1)
  if (process.env.OUT) fs.writeFileSync(`${process.env.OUT}/letter-${style}.pdf`, b)
}
const extra = await PDFDocument.create(); extra.addPage(); extra.addPage()
const bundle = await bundleApplication(await renderLetter(letter, fonts, { style: 'minimal', accent: [0, 0, 0], size: 'letter', fontSize: 11 }), [{ name: 'Resume.pdf', bytes: await extra.save(), kind: 'pdf' }], { title: 'App', author: 'A', bookmarks: true })
const outline = readOutline(await open(bundle))
assert.deepEqual(outline.map((o) => o.title), ['Cover letter', 'Resume'])
console.log('ok   cover letter styles and application bundle')
