// Run: npx tsx scripts/tests/b1/writers.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'
import * as W from '../../../src/tools/convert/_b1/writers.ts'
import { encodePng } from '../../../src/tools/pdf/_b1/png.ts'

const r = (text, bold = false, italic = false) => ({ text, bold, italic })
const blk = (kind, text, extra = {}) => ({ type: 'block', block: { kind, runs: Array.isArray(text) ? text : [r(text)], text: Array.isArray(text) ? text.map((x) => x.text).join('') : text, size: 11, indent: 0, y: 0, align: 'left', ...extra } })
const png = encodePng(new Uint8Array(2 * 2 * 3).fill(200), 2, 2, 3)
const images = new Map([[3, { page: 3, name: 'page-3.png', data: png, w: 2, h: 2, mime: 'image/png' }]])
const model = [
  [blk('h1', 'Annual Report'), blk('p', [r('This is '), r('bold', true), r(' and '), r('italic', false, true), r(' text & <tags>.')]), blk('li', 'First point'), blk('li', 'Second point')],
  [blk('h2', 'Numbers'), { type: 'table', rows: [['Item', 'Amount'], ['Apples', '1,200'], ['Pears | more', '35']] }, blk('oli', '1. Step one'), blk('oli', '2. Step two')],
  [{ type: 'scan', page: 3 }],
]
const o = { title: 'Report "2026"', author: 'Ada', images, pageBreaks: true }

const md = W.toMarkdown(model, o)
assert.match(md, /^# Annual Report/m); assert.match(md, /\*\*bold\*\*/); assert.match(md, /\| Pears \\\| more \| 35 \|/); assert.match(md, /^2\. Step two/m); assert.match(md, /!\[Page 3\]\(images\/page-3.png\)/)
console.log('ok   markdown')

const html = W.toHtmlDoc(model, o, (im) => 'x/' + im.name)
assert.match(html, /<strong>bold<\/strong>/); assert.match(html, /&lt;tags&gt;/); assert.match(html, /<ol>\s*<li>Step one<\/li>/); assert.match(html, /<th>Item<\/th>/)
console.log('ok   html')

const rtf = W.toRtf(model, o); if (process.env.OUT) fs.writeFileSync(process.env.OUT + ".rtf", rtf)
assert.ok(rtf.startsWith('{\\rtf1')); assert.match(rtf, /\\pngblip/); assert.match(rtf, /\\trowd/); assert.equal((rtf.match(/{/g) || []).length - (rtf.match(/\\{/g) || []).length, (rtf.match(/}/g) || []).length - (rtf.match(/\\}/g) || []).length, 'balanced braces')
console.log('ok   rtf')

const xmlOk = (name, s) => { assert.ok(!/&(?!amp;|lt;|gt;|quot;|#)/.test(s), name + ' has a raw ampersand'); assert.ok(s.trim().startsWith('<'), name) }
const chapters = W.splitChapters(model, o, 'h1')
assert.equal(chapters.length, 1)
const epub = W.buildEpub(chapters, { ...o, uuid: '123e4567-e89b-12d3-a456-426614174000', modified: new Date('2026-10-28T10:00:00Z') })
const ez = unzipSync(epub)
assert.equal(Object.keys(ez)[0], 'mimetype'); assert.equal(strFromU8(ez.mimetype), 'application/epub+zip')
for (const [k, v] of Object.entries(ez)) if (/\.(xhtml|opf|ncx|xml)$/.test(k)) xmlOk(k, strFromU8(v))
assert.ok(ez['OEBPS/images/page-3.png'])
if (process.env.OUT) { fs.writeFileSync(process.env.OUT + '.epub', epub) }
console.log('ok   epub', Object.keys(ez).length, 'files')

const odt = W.toOdt(model, o)
const oz = unzipSync(odt)
assert.equal(Object.keys(oz)[0], 'mimetype'); assert.ok(oz['Pictures/page-3.png'])
for (const k of ['content.xml', 'styles.xml', 'meta.xml', 'META-INF/manifest.xml']) xmlOk(k, strFromU8(oz[k]))
if (process.env.OUT) fs.writeFileSync(process.env.OUT + '.odt', odt)
const ods = W.toOds([{ name: 'Page 1', rows: [['Item', 'Amount'], ['Apples', '1,200']] }])
assert.match(strFromU8(unzipSync(ods)['content.xml']), /office:value="1200"/)
if (process.env.OUT) fs.writeFileSync(process.env.OUT + '.ods', ods)
const odp = W.toOdp([{ page: 1, name: 's1.png', data: png, w: 2, h: 2, mime: 'image/png' }], { w: 800, h: 600 })
assert.ok(unzipSync(odp)['Pictures/s1.png'])
if (process.env.OUT) fs.writeFileSync(process.env.OUT + '.odp', odp)
console.log('ok   odt / ods / odp')
