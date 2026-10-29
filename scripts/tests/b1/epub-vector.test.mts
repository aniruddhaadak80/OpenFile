// Run: npx tsx scripts/tests/b1/epub-vector.test.mts
// EPUB to PDF text mode: converts the sample EPUBs with the real conversion code in Node and checks the PDF with
// pdfinfo / pdftotext (poppler): real selectable text, small size, page count, bookmarks, Unicode fallback, images.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { DOMParser as XDOMParser } from '@xmldom/xmldom'
import JSZip from 'jszip'

// a DOMParser for Node, plus the one Element getter openEpub uses that xmldom lacks
const probe = new XDOMParser().parseFromString('<a/>', 'application/xml').documentElement as any
const ElProto = Object.getPrototypeOf(probe)
if (!('children' in ElProto)) Object.defineProperty(ElProto, 'children', { get() { return Array.from(this.childNodes as ArrayLike<any>).filter((n: any) => n.nodeType === 1) } })
;(globalThis as any).DOMParser = class { parseFromString(s: string, t: string) { return new XDOMParser({ onError: () => {} } as any).parseFromString(s, t) } }

const { openEpub } = await import('../../../src/tools/convert/_conv/epub.ts')
const { buildVectorPdf, chapterBlocks, winAnsiSafe } = await import('../../../src/tools/convert/_conv/epubVector.ts')

const root = path.resolve(import.meta.dirname, '../../..')
const fontDir = path.join(root, 'node_modules/pdfjs-dist/standard_fonts')
const b64 = (f: string) => fs.readFileSync(path.join(fontDir, f)).toString('base64')
const unicodeFonts = { normal: b64('LiberationSans-Regular.ttf'), bold: b64('LiberationSans-Bold.ttf'), italic: b64('LiberationSans-Italic.ttf'), bolditalic: b64('LiberationSans-BoldItalic.ttf') }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'epubvec-'))
const info = (f: string) => Object.fromEntries(execFileSync('pdfinfo', [f], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n').filter(Boolean).map((l) => [l.split(':')[0].trim(), l.slice(l.indexOf(':') + 1).trim()]))
const text = (f: string) => execFileSync('pdftotext', ['-enc', 'UTF-8', f, '-'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString()

// 1. block parser
{
  const d = new (globalThis as any).DOMParser().parseFromString(`<html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title><style>p{}</style></head><body>
    <h2 id="c1"><a id="chap01"/>CHAPTER I.<br/>Down the Rabbit-Hole</h2>
    <p>There was nothing so <i>very</i> remarkable   in that;<script>alert(1)</script> <a href="#c1">back</a></p>
    <ul><li>One</li><li>Two</li></ul><ol start="3"><li>Three</li></ol>
    <blockquote><p>Quoted</p></blockquote><pre>a  b\n c</pre><hr/>
    <div><img src="../images/pic.png" alt="Pic"/></div>
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="cover.jpg"/></svg>
    <table><tr><th>A</th><td>B</td></tr></table></body></html>`, 'application/xhtml+xml')
  const bl = chapterBlocks(d, 'OEBPS/text/ch1.xhtml')
  const h = bl[0] as any
  assert.equal(h.t, 'h'); assert.equal(h.level, 2); assert.deepEqual(h.ids, ['c1', 'chap01']); assert.match(h.runs.map((r: any) => r.text).join(''), /CHAPTER I\.\nDown the Rabbit-Hole/)
  const p = bl[1] as any
  assert.equal(p.runs.map((r: any) => r.text).join(''), 'There was nothing so very remarkable in that; back')
  assert.ok(p.runs.some((r: any) => r.i && r.text === 'very')); assert.ok(p.runs.some((r: any) => r.href === '#c1'))
  assert.ok(!JSON.stringify(bl).includes('alert'), 'scripts are never read')
  const lis = bl.filter((b: any) => b.kind === 'li') as any[]
  assert.deepEqual(lis.map((l) => l.bullet), ['\u2022', '\u2022', '3.'])
  assert.ok(bl.some((b: any) => b.kind === 'quote' && b.indent === 1))
  assert.ok(bl.some((b: any) => b.kind === 'pre' && b.runs[0].text === 'a  b\n c'))
  assert.ok(bl.some((b: any) => b.t === 'hr'))
  assert.deepEqual(bl.filter((b: any) => b.t === 'img').map((b: any) => b.src), ['OEBPS/images/pic.png', 'OEBPS/text/cover.jpg'])
  assert.ok(bl.some((b: any) => b.t === 'p' && b.runs.map((r: any) => r.text).join('') === 'A   B'))
  assert.ok(winAnsiSafe('\u201cCuriouser\u201d \u2014 caf\u00e9 \u2026')); assert.ok(!winAnsiSafe('\u041f\u0440\u0438\u0432\u0435\u0442'))
  console.log('ok   chapter blocks:', bl.length)
}

// 2. Alice in Wonderland
const alicePath = '/workspace/work/samples/alice.epub'
const aliceFile = fs.existsSync(alicePath) ? alicePath : null
if (aliceFile) {
  const book = await openEpub(new Blob([fs.readFileSync(aliceFile)]) as any)
  const t0 = performance.now()
  let yields = 0
  const r = await buildVectorPdf(book, { pageWidth: 419.53, pageHeight: 595.28, margin: 45.35, fontSize: 11, font: 'serif', cover: true, toc: true, pageNumbers: true, unicodeFonts, yieldFn: async () => { yields++ } })
  const ms = Math.round(performance.now() - t0)
  const out = path.join(tmp, 'alice.pdf')
  fs.writeFileSync(out, Buffer.from(r.pdf.output('arraybuffer')))
  const size = fs.statSync(out).size
  const inf = info(out)
  const txt = text(out)
  console.log(`     alice: ${inf.Pages} pages, ${(size / 1024).toFixed(0)} KB, text ${(txt.length / 1024).toFixed(0)} KB, ${ms} ms, ${yields} yields`)
  assert.ok(size < 3 * 1024 * 1024, 'well under 3 MB'); assert.ok(size < 1024 * 1024, 'under 1 MB in practice')
  assert.ok(txt.length > 120_000, 'whole book is selectable text')
  assert.match(txt, /Alice was beginning to get very tired of sitting by her sister on the bank/)
  assert.match(txt, /Down the Rabbit-Hole/); assert.match(txt, /Contents/)
  assert.match(txt, /\u201cand\s+what\s+is\s+the\s+use\s+of\s+a\s+book,\u201d\s+thought\s+Alice/, 'curly quotes survive')
  assert.equal(inf.Title, "Alice's Adventures in Wonderland"); assert.match(inf.Author, /Lewis Carroll/)
  assert.ok(+inf.Pages > 60 && +inf.Pages < 200, 'sensible page count')
  // bookmarks: one per TOC entry
  const raw = Buffer.from(r.pdf.output('arraybuffer')).toString('latin1')
  assert.match(raw, /\/Outlines/); assert.ok(r.tocEntries.length >= 12, 'TOC entries resolved: ' + r.tocEntries.length)
  // at most the cover image is embedded
  assert.ok((raw.match(/\/Subtype \/Image/g) || []).length <= 1, 'only the real cover image is embedded')
  // chapter pages strictly increase
  const pages = r.tocEntries.map((e: any) => e.page); for (let i = 1; i < pages.length; i++) assert.ok(pages[i] >= pages[i - 1])
  if (process.env.OUT) fs.copyFileSync(out, process.env.OUT)
  console.log('ok   alice is real text,', r.tocEntries.length, 'bookmarks')
} else console.log('skip alice (sample not found)')

// 3. synthetic EPUB: Unicode words, an inline PNG, no cover, sans
{
  const z = new JSZip()
  z.file('mimetype', 'application/epub+zip')
  z.file('META-INF/container.xml', '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/c.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
  z.file('OEBPS/c.opf', `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Test \u2116 1</dc:title><dc:creator>Ada</dc:creator><dc:language>ru</dc:language></metadata>
    <manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/><item id="p" href="p.png" media-type="image/png"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>`)
  const para = Array.from({ length: 30 }, (_, i) => `<p>Paragraph ${i} with \u041f\u0440\u0438\u0432\u0435\u0442 \u043c\u0438\u0440 and \u03a9\u03bc\u03ad\u03b3\u03b1 and a supercalifragilisticexpialidocioussupercalifragilisticexpialidocious word.</p>`).join('')
  z.file('OEBPS/a.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>\u0413\u043b\u0430\u0432\u0430 1</h1>${para}<p><img src="p.png" alt="dot"/></p></body></html>`)
  z.file('OEBPS/b.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml"><body><p>No heading here. <a href="a.xhtml">Back to one</a> and <a href="javascript:alert(1)">bad</a> and <a href="https://example.com/">site</a>.</p></body></html>`)
  // 2x2 PNG
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64')
  z.file('OEBPS/p.png', png)
  const book = await openEpub(new Blob([await z.generateAsync({ type: 'uint8array' })]) as any)
  for (const withUni of [true, false]) {
    const r = await buildVectorPdf(book, { pageWidth: 595.28, pageHeight: 841.89, margin: 40, fontSize: 10, font: withUni ? 'sans' : 'serif', cover: true, toc: true, pageNumbers: false, justify: false, unicodeFonts: withUni ? unicodeFonts : null })
    const out = path.join(tmp, `syn-${withUni}.pdf`)
    const bytes = Buffer.from(r.pdf.output('arraybuffer'))
    fs.writeFileSync(out, bytes)
    const txt = text(out)
    if (withUni) {
      assert.match(txt, /\u041f\u0440\u0438\u0432\u0435\u0442 \u043c\u0438\u0440/, 'Cyrillic is real text'); assert.match(txt, /\u0413\u043b\u0430\u0432\u0430 1/); assert.match(txt, /\u03a9\u03bc\u03ad\u03b3\u03b1/)
    } else assert.match(txt, /Paragraph 3 with \?+/, 'without a Unicode font, unsupported letters become ? instead of garbage')
    assert.match(txt, /No heading here/)
    const raw = bytes.toString('latin1')
    assert.equal((raw.match(/\/Subtype \/Image/g) || []).length, 1, 'the one real <img> is embedded')
    assert.ok(!/javascript/i.test(raw), 'script links dropped'); assert.match(raw, /example\.com/)
    assert.ok(/\/Dest|\/D \[/.test(raw) || /\/A <<\/S \/GoTo/.test(raw) || /GoTo/.test(raw), 'internal link written')
    console.log(`ok   synthetic (${withUni ? 'unicode font' : 'standard fonts only'}): ${info(out).Pages} pages, ${(bytes.length / 1024).toFixed(0)} KB`)
  }
}

// 4. cancel
if (aliceFile) {
  const book = await openEpub(new Blob([fs.readFileSync(aliceFile)]) as any)
  const ac = new AbortController()
  await assert.rejects(buildVectorPdf(book, { pageWidth: 419.53, pageHeight: 595.28, margin: 40, fontSize: 11, font: 'serif', signal: ac.signal, onProgress: (_p: number, c: number) => { if (c === 3) ac.abort() } }), /cancelled/)
  console.log('ok   cancel stops the conversion')
}
fs.rmSync(tmp, { recursive: true, force: true })
console.log('all epub-vector tests passed')
