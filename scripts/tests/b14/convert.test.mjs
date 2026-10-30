import assert from 'node:assert/strict'
import * as C from '../../../src/lib/b14/convert.ts'
assert.equal(C.tableToMd([['a', 'b'], [1, 'x|y'], ['', '']]), '| a | b |\n| --- | --- |\n| 1 | x\\|y |')
assert.equal(C.fence('x ``` y', 'js'), '````js\nx ``` y\n````')
assert.deepEqual(C.slideParagraphs('<p:sp><a:p><a:r><a:t>Hello &amp; </a:t></a:r><a:r><a:t>world</a:t></a:r></a:p><a:p><a:r><a:t> </a:t></a:r></a:p><a:p><a:t>Two</a:t></a:p></p:sp>'), ['Hello & world', 'Two'])
assert.match(C.slidesToMd([{ paras: ['Title', 'Point'] }], 'Deck'), /# Deck\n\n## 1\. Title\n\n- Point/)
assert.match(C.jsonToMd([{ a: 1, b: 2 }, { a: 3, b: 4 }]), /\| a \| b \|/)
const nbJson = JSON.stringify({ nbformat: 4, metadata: { language_info: { name: 'python' } }, cells: [
  { cell_type: 'markdown', source: ['# My notebook\n', 'Intro'] },
  { cell_type: 'code', execution_count: 1, source: ['print(1)'], outputs: [{ output_type: 'stream', text: ['1\n'] }, { output_type: 'display_data', data: { 'image/png': 'iVBORw0KGgo=\n', 'text/plain': ['<Figure>'] } }] },
  { cell_type: 'code', source: '1/0', outputs: [{ output_type: 'error', ename: 'ZeroDivisionError', evalue: 'division by zero', traceback: ['\u001b[31mTraceback'] }] },
] })
const nb = C.parseNotebook(nbJson)
assert.equal(nb.title, 'My notebook'); assert.equal(nb.cells.length, 3); assert.equal(nb.cells[1].outputs[1].kind, 'image'); assert.equal(nb.cells[2].outputs[0].text, 'ZeroDivisionError: division by zero\nTraceback')
const imgs = []
const md = C.notebookToMd(nb, { images: imgs })
assert.match(md, /```python\nprint\(1\)\n```/); assert.match(md, /!\[Output 1\]\(images\/output-1\.png\)/); assert.equal(imgs.length, 1)
const py = C.notebookToScript(nb)
assert.match(py, /# %% \[markdown\]\n# # My notebook\n# Intro\n\n# %%\nprint\(1\)/)
const back = JSON.parse(C.scriptToNotebook(py))
assert.equal(back.cells.length, 3); assert.equal(back.cells[0].cell_type, 'markdown'); assert.equal(back.cells[0].source.join(''), '# My notebook\nIntro'); assert.equal(back.cells[1].source.join(''), 'print(1)')
assert.equal(JSON.parse(C.scriptToNotebook('x = 1\ny = 2\n')).cells.length, 1)
assert.throws(() => C.parseNotebook('nope'))
// MHTML
const mht = 'From: <Saved by Blink>\r\nSnapshot-Content-Location: https://ex.com/a/page.html\r\nSubject: =?utf-8?Q?Caf=C3=A9_page?=\r\nMIME-Version: 1.0\r\nContent-Type: multipart/related;\r\n\ttype="text/html";\r\n\tboundary="----B"\r\n\r\n------B\r\nContent-Type: text/html\r\nContent-ID: <frame-1@mhtml.blink>\r\nContent-Transfer-Encoding: quoted-printable\r\nContent-Location: https://ex.com/a/page.html\r\n\r\n<html><body><img src=3D"https://ex.com/a/pic.png"><link href=3D"cid:css-1@mhtml.blink"> caf=C3=A9 long=\r\nline</body></html>\r\n------B\r\nContent-Type: image/png\r\nContent-Transfer-Encoding: base64\r\nContent-Location: https://ex.com/a/pic.png\r\n\r\niVBORw0KGgo=\r\n------B\r\nContent-Type: text/css\r\nContent-ID: <css-1@mhtml.blink>\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nbody{color:red}\r\n------B--\r\n'
const m = C.parseMhtml(mht)
assert.equal(m.subject, 'Café page'); assert.equal(m.parts.length, 3); assert.equal(m.rootIndex, 0); assert.equal(m.parts[1].type, 'image/png'); assert.deepEqual([...m.parts[1].body.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47])
const html = C.partText(m.parts[0])
assert.match(html, /café longline/)
const rw = C.rewriteRefs(html, m.parts, (i) => `blob:${i}`, 'https://ex.com/a/page.html')
assert.match(rw, /src="blob:1"/); assert.match(rw, /href="blob:2"/)
assert.equal(C.decodeWords('=?UTF-8?B?SGVsbG8=?='), 'Hello')
// metafile headers
const emf = new ArrayBuffer(108); const v = new DataView(emf)
v.setUint32(0, 1, true); v.setUint32(4, 108, true); v.setInt32(8, 0, true); v.setInt32(12, 0, true); v.setInt32(16, 99, true); v.setInt32(20, 49, true); v.setInt32(32, 2000, true); v.setInt32(36, 1000, true); v.setUint32(40, 0x464d4520, true)
assert.deepEqual([C.metafileInfo(emf).kind, C.metafileInfo(emf).width, C.metafileInfo(emf).height, C.metafileInfo(emf).mmWidth], ['emf', 100, 50, 20])
const wmf = new ArrayBuffer(40); const w = new DataView(wmf); w.setUint32(0, 0x9ac6cdd7, true); w.setInt16(10, 1440, true); w.setInt16(12, 720, true); w.setUint16(14, 1440, true)
assert.equal(C.metafileInfo(wmf).mmWidth, 25.4)
assert.throws(() => C.metafileInfo(new ArrayBuffer(40)))
console.log('b14 convert ok')
