// Run: npx tsx scripts/tests/b1/core.test.mjs
import assert from 'node:assert/strict'
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import * as C from '../../../src/tools/pdf/_b1/core.ts'

let passed = 0
const t = async (name, fn) => { try { await fn(); passed++; console.log('ok  ', name) } catch (e) { console.error('FAIL', name, e); process.exitCode = 1 } }

async function sample(n = 3, opts = {}) {
  const d = await PDFDocument.create()
  const font = await d.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < n; i++) {
    const p = d.addPage(opts.landscape ? [842, 595] : [595, 842])
    p.drawText(`Page ${i + 1} hello world`, { x: 50, y: 700, size: 24, font, color: rgb(0, 0, 0) })
    if (opts.rotate && i === 1) p.setRotation(degrees(90))
  }
  d.setTitle('Sample'); d.setAuthor('Tester')
  return d.save()
}

await t('resize to A4 letter keeps page count and size', async () => {
  const out = await C.resizePages(await sample(3, { rotate: true }), { size: C.SHEETS.letter, orientation: 'auto', fit: 'fit', margin: 20 })
  const d = await PDFDocument.load(out)
  assert.equal(d.getPageCount(), 3)
  const { width, height } = d.getPage(0).getSize()
  assert.equal(Math.round(width), 612); assert.equal(Math.round(height), 792)
  // rotated page 2 is visually landscape -> output landscape
  assert.ok(d.getPage(1).getSize().width > d.getPage(1).getSize().height)
})

await t('halves geometry for each rotation', async () => {
  const b = { x0: 0, y0: 0, x1: 100, y1: 50 }
  const [a0, b0] = C.halves(b, 0, 'vertical'); assert.deepEqual([a0.x1, b0.x0], [50, 50])
  const [a9] = C.halves(b, 90, 'vertical'); assert.equal(a9.y1, 25)
  const [h0] = C.halves(b, 0, 'horizontal'); assert.equal(h0.y0, 25)
})

await t('split halves doubles pages and respects skipFirst', async () => {
  const out = await C.splitHalves(await sample(3, { landscape: true }), { dir: 'vertical', skipFirst: true })
  const d = await PDFDocument.load(out)
  assert.equal(d.getPageCount(), 5)
  assert.equal(Math.round(d.getPage(1).getCropBox().width), 421)
})

await t('flip wraps content', async () => {
  const out = await C.flipPages(await sample(2), { horizontal: true, vertical: false })
  const d = await PDFDocument.load(out)
  assert.equal(d.getPageCount(), 2)
})

await t('overlay under/over and cycle', async () => {
  const out = await C.overlayPdf(await sample(4), await sample(2, { landscape: true }), { mode: 'under', repeat: 'cycle', fit: 'fit', opacity: 0.5 })
  const d = await PDFDocument.load(out)
  assert.equal(d.getPageCount(), 4)
})

await t('poster tiles', async () => {
  const out = await C.makePoster(await sample(1), { page: 0, cols: 2, rows: 3, sheet: C.SHEETS.a4, landscape: false, margin: 20, overlap: 10, marks: true, labels: true })
  const d = await PDFDocument.load(out)
  assert.equal(d.getPageCount(), 6)
})

await t('alternate mix with reverse', async () => {
  const { bytes, plan } = await C.alternateMix([{ bytes: await sample(3) }, { bytes: await sample(3), reverse: true }], { chunk: [1, 1], loopRest: true })
  assert.deepEqual(plan, [[0, 0], [1, 2], [0, 1], [1, 1], [0, 2], [1, 0]])
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 6)
})

await t('links write/read roundtrip', async () => {
  const out = await C.writeLinks(await sample(3), [
    { page: 0, rect: [10, 10, 100, 40], kind: 'url', url: 'example.org' },
    { page: 1, rect: [10, 10, 100, 40], kind: 'page', target: 2 },
  ])
  const links = C.readLinks(await C.open(out))
  assert.equal(links.length, 2)
  assert.equal(links[0].url, 'https://example.org')
  assert.equal(links[1].target, 2)
})

await t('remove annotations by group', async () => {
  const withLinks = await C.writeLinks(await sample(2), [{ page: 0, rect: [0, 0, 10, 10], kind: 'url', url: 'https://a.b' }])
  const { bytes, removed } = await C.removeAnnotations(withLinks, new Set(['links']))
  assert.equal(removed, 1)
  assert.equal(C.listAnnotations(await C.open(bytes)).length, 0)
})

await t('attachments add, list, remove', async () => {
  const a1 = await C.editAttachments(await sample(1), new Set(), [{ name: 'notes.txt', data: new TextEncoder().encode('hi there'), mime: 'text/plain', description: 'Some notes' }, { name: 'data.xml', data: new TextEncoder().encode('<x/>'), relationship: 'Data' }])
  let list = C.listAttachments(await C.open(a1))
  assert.equal(list.length, 2)
  const notes = list.find((x) => x.name === 'notes.txt')
  assert.equal(new TextDecoder().decode(notes.data), 'hi there')
  const idx = list.findIndex((x) => x.name === 'data.xml')
  const a2 = await C.editAttachments(a1, new Set([idx]), [])
  list = C.listAttachments(await C.open(a2))
  assert.deepEqual(list.map((x) => x.name), ['data.xml'])
  assert.equal(list[0].relationship, 'Data')
})

await t('outline write/read nested', async () => {
  const d = await C.open(await sample(5))
  C.writeOutline(d, [{ title: 'Intro', page: 0, level: 0, open: true }, { title: 'Part A', page: 1, level: 1 }, { title: 'Part B', page: 2, level: 1 }, { title: 'End', page: 4, level: 0 }])
  const back = C.readOutline(await C.open(await d.save()))
  assert.deepEqual(back.map((b) => [b.title, b.page, b.level]), [['Intro', 0, 0], ['Part A', 1, 1], ['Part B', 2, 1], ['End', 4, 0]])
})

await t('viewer prefs roundtrip', async () => {
  const v = C.readViewerPrefs(await C.open(await sample(3)))
  const out = await C.writeViewerPrefs(await sample(3), { ...v, pageLayout: 'TwoPageRight', pageMode: 'UseThumbs', openPage: 2, zoom: 'XYZ', zoomPercent: 150, hideToolbar: true, displayDocTitle: true, direction: 'R2L' })
  const back = C.readViewerPrefs(await C.open(out))
  assert.equal(back.pageLayout, 'TwoPageRight'); assert.equal(back.openPage, 2); assert.equal(back.zoomPercent, 150); assert.equal(back.hideToolbar, true); assert.equal(back.direction, 'R2L')
})

await t('sanitize removes JS, files, metadata', async () => {
  const d = await C.open(await C.editAttachments(await sample(1), new Set(), [{ name: 'a.txt', data: new Uint8Array([1, 2]) }]))
  d.addJavaScript('hello', 'app.alert(1)')
  const raw = await d.save()
  const { bytes, report } = await C.sanitize(raw, { javascript: true, embeddedFiles: true, links: true, annotations: true, metadata: true, forms: false, layers: true, actions: true, thumbnails: true })
  const s = C.inspectStructure(await C.open(bytes), bytes)
  assert.equal(s.javascript, false)
  assert.equal(s.attachments, 0)
  assert.equal(Object.keys(s.info).length, 0)
  assert.ok(report['Document scripts'] >= 1)
})

await t('strip OC blocks', async () => {
  const src = 'q /OC /L1 BDC 1 0 0 RG /X BMC EMC EMC BT (keep) Tj ET /OC /L2 BDC (also) Tj EMC'
  assert.equal(C.stripOcBlocks(src, new Set(['L1'])).replace(/\s+/g, ' ').trim(), 'q BT (keep) Tj ET /OC /L2 BDC (also) Tj EMC')
})

await t('inspector basics', async () => {
  const raw = await sample(2)
  const s = C.inspectStructure(await C.open(raw), raw)
  assert.equal(s.pages, 2); assert.equal(s.pageSizes[0].label, 'A4'); assert.equal(s.fonts[0].name, 'Helvetica'); assert.equal(s.fonts[0].embedded, false)
  assert.equal(s.info.Title, 'Sample')
})


const F = await import('../../../src/tools/pdf/_b1/forms.ts')
await t('create form fields', async () => {
  const out = await F.createFields(await sample(1), [
    { kind: 'text', name: 'Name', page: 0, rect: [50, 600, 250, 620], value: 'Ada', required: true, tooltip: 'Your name' },
    { kind: 'multiline', name: 'Notes', page: 0, rect: [50, 500, 250, 580] },
    { kind: 'checkbox', name: 'Agree', page: 0, rect: [50, 470, 62, 482], checked: true },
    { kind: 'radio', name: 'Size', page: 0, rect: [50, 440, 62, 452], radioValue: 'S' },
    { kind: 'radio', name: 'Size', page: 0, rect: [80, 440, 92, 452], radioValue: 'M', checked: true },
    { kind: 'dropdown', name: 'Country', page: 0, rect: [50, 400, 200, 418], options: ['India', 'Germany'], value: 'Germany' },
    { kind: 'signature', name: 'Sign here', page: 0, rect: [50, 300, 250, 350] },
    { kind: 'text', name: 'Name', page: 0, rect: [300, 600, 450, 620] },
  ])
  const d = await PDFDocument.load(out)
  const names = d.getForm().getFields().map((f) => f.getName())
  assert.deepEqual(names.sort(), ['Agree', 'Country', 'Name', 'Name_2', 'Notes', 'Sign here', 'Size'].sort())
  assert.equal(d.getForm().getTextField('Name').getText(), 'Ada')
  assert.equal(d.getForm().getRadioGroup('Size').getSelected(), 'M')
  assert.equal(d.getForm().getDropdown('Country').getSelected()[0], 'Germany')
})
console.log(`\n${passed} passed`)
