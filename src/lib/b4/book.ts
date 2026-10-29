/* E-book model shared by ebook-converter, epub-editor and the reader.
 * Reading: EPUB, MOBI, AZW3, KF8, FB2, FBZ, CBZ (foliate-js, MIT), plus TXT, HTML, Markdown, DOCX, PDF, RTF and CHM.
 * Writing: EPUB 3, HTML, TXT, Markdown, FB2, DOCX and PDF. */
import { stripActive } from '../safe'

export interface BookChapter { title: string; html: string }
export interface BookModel {
  title: string; author: string; language: string; description?: string; publisher?: string
  cover?: Blob
  chapters: BookChapter[]
  /** images referenced from chapter html as src="images/<name>" */
  images: Map<string, Blob>
}

export const EBOOK_ACCEPT = '.epub,.mobi,.azw,.azw3,.kf8,.prc,.fb2,.fbz,.cbz,.txt,.html,.htm,.xhtml,.md,.markdown,.docx,.pdf,.rtf,.chm,.odt'
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function metaText(v: any): string {
  if (!v) return ''
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.map(metaText).filter(Boolean).join(', ')
  if (typeof v === 'object') return metaText(v.name ?? v.value ?? v.en ?? Object.values(v)[0])
  return String(v)
}

const IMG_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp' }

/** Turn a parsed chapter document into clean body html with images collected into the map. */
async function harvest(doc: Document, images: Map<string, Blob>, seen: Map<string, string>): Promise<string> {
  doc.querySelectorAll('script,style,link,meta').forEach((n) => n.remove())
  const body = doc.body ?? doc.documentElement
  stripActive(body) // event handlers, frames and script URLs from the source never reach the new book
  const grab = async (src: string): Promise<string | null> => {
    if (!src) return null
    if (seen.has(src)) return seen.get(src)!
    try {
      const r = await fetch(src); if (!r.ok) return null
      const b = await r.blob()
      const name = `img${images.size + 1}.${IMG_EXT[b.type] || (src.match(/\.(\w{3,4})(?:$|\?)/)?.[1] ?? 'png')}`
      images.set(name, b); seen.set(src, 'images/' + name)
      return 'images/' + name
    } catch { return null }
  }
  for (const img of Array.from(body.querySelectorAll('img'))) { const n = await grab(img.getAttribute('src') || ''); if (n) img.setAttribute('src', n); else img.remove() }
  for (const im of Array.from(body.querySelectorAll('image'))) {
    const href = im.getAttribute('href') || im.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || ''
    const n = await grab(href)
    const svg = im.closest('svg')
    if (n && svg) { const img = doc.createElement('img'); img.setAttribute('src', n); img.setAttribute('alt', ''); svg.replaceWith(img) }
  }
  body.querySelectorAll('a[href]').forEach((a) => { const h = a.getAttribute('href') || ''; if (!/^(https?:|mailto:)/.test(h)) a.removeAttribute('href') })
  body.querySelectorAll('[style]').forEach((e) => { const st = e.getAttribute('style') || ''; const keep = st.split(';').filter((x) => /^\s*(font-weight|font-style|text-align|text-decoration)\s*:/.test(x)).join(';'); keep ? e.setAttribute('style', keep) : e.removeAttribute('style') })
  body.querySelectorAll('[class],[id]').forEach((e) => { e.removeAttribute('class') })
  const ser = new XMLSerializer()
  return Array.from(body.childNodes).map((n) => (n.nodeType === 1 ? ser.serializeToString(n).replace(/ xmlns="[^"]*"/g, '') : esc(n.textContent ?? ''))).join('')
}

const firstHeading = (html: string) => (html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1] ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

async function viaFoliate(file: File, onProgress?: (p: number) => void): Promise<BookModel> {
  const { makeBook } = await import('foliate-js/view.js')
  const book = await makeBook(file).catch((e: any) => { throw new Error(/not supported/i.test(e?.message) ? 'This e-book format is not supported, or the file has DRM.' : 'Could not open this e-book. It may be damaged or protected with DRM.') })
  const images = new Map<string, Blob>(); const seen = new Map<string, string>()
  const tocTitles = new Map<number, string>()
  const flat = (items?: any[] | null): any[] => (items ?? []).flatMap((i) => [i, ...flat(i.subitems)])
  for (const t of flat(book.toc)) { try { const r = book.resolveHref?.(t.href); if (r && !tocTitles.has(r.index)) tocTitles.set(r.index, String(t.label ?? '').trim()) } catch { /* ignore */ } }
  const chapters: BookChapter[] = []
  const secs: any[] = book.sections ?? []
  for (let i = 0; i < secs.length; i++) {
    onProgress?.(i / secs.length)
    const s = secs[i]
    if (s.linear === 'no') continue
    let doc: Document | null = null
    try {
      const url = await s.load()
      const txt = await (await fetch(url)).text()
      doc = new DOMParser().parseFromString(txt, /<\?xml|xmlns=/.test(txt.slice(0, 300)) ? 'application/xhtml+xml' : 'text/html')
      if (doc.querySelector('parsererror')) doc = new DOMParser().parseFromString(txt, 'text/html')
    } catch { doc = null }
    if (!doc) continue
    const html = await harvest(doc, images, seen)
    if (!html.replace(/<[^>]+>/g, '').trim() && !/<img/.test(html)) continue
    chapters.push({ title: tocTitles.get(i) || firstHeading(html) || `Chapter ${chapters.length + 1}`, html })
  }
  let cover: Blob | undefined
  try { cover = (await book.getCover?.()) ?? undefined } catch { cover = undefined }
  const m = book.metadata ?? {}
  return { title: metaText(m.title) || file.name.replace(/\.[^.]+$/, ''), author: metaText(m.author ?? m.creator), language: metaText(m.language) || 'en', description: metaText(m.description).replace(/<[^>]+>/g, ''), publisher: metaText(m.publisher), cover, chapters, images }
}

/** Split long plain text into chapters at lines that look like chapter headings. */
export function textToChapters(text: string): BookChapter[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const isHead = (l: string) => /^\s*(chapter|part|book|section|prologue|epilogue|kapitel|chapitre|cap[ií]tulo|глава)\b[^\n]{0,60}$/i.test(l) || /^\s*[IVXLC]+\.?\s*$/.test(l)
  const chapters: { title: string; lines: string[] }[] = []
  let cur: { title: string; lines: string[] } = { title: '', lines: [] }
  for (const l of lines) {
    if (isHead(l) && cur.lines.join('').trim().length > 200) { chapters.push(cur); cur = { title: l.trim(), lines: [] } }
    else if (isHead(l) && !cur.title) cur.title = l.trim()
    else cur.lines.push(l)
  }
  chapters.push(cur)
  return chapters.filter((c) => c.lines.join('').trim() || c.title).map((c, i) => ({
    title: c.title || (chapters.length > 1 ? `Part ${i + 1}` : 'Text'),
    html: (c.title ? `<h2>${esc(c.title)}</h2>` : '') + c.lines.join('\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, '<br/>')}</p>`).join('\n'),
  }))
}

/** Split one big html body into chapters at h1/h2. */
export async function htmlToBook(html: string, title: string, images = new Map<string, Blob>()): Promise<BookModel> {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const seen = new Map<string, string>()
  const body = await harvest(doc, images, seen)
  const parts = body.split(/(?=<h[12][\s>])/i).filter((p) => p.replace(/<[^>]+>/g, '').trim() || /<img/.test(p))
  const chapters = (parts.length ? parts : [body]).map((h, i) => ({ title: firstHeading(h) || `Part ${i + 1}`, html: h }))
  const t = doc.querySelector('title')?.textContent?.trim()
  return { title: t || title, author: doc.querySelector('meta[name=author]')?.getAttribute('content') || '', language: doc.documentElement.lang || 'en', chapters, images }
}

export async function loadBook(file: File, onProgress?: (p: number, label?: string) => void): Promise<BookModel> {
  const name = file.name.toLowerCase()
  const ext = name.split('.').pop() || ''
  const stem = file.name.replace(/\.[^.]+$/, '')
  if (/^(epub|mobi|azw|azw3|kf8|prc|fb2|fbz|cbz)$/.test(ext) || name.endsWith('.fb2.zip')) return viaFoliate(file, onProgress)
  if (ext === 'txt') { const { readTextFile } = await import('./text'); const { text } = await readTextFile(file); return { title: stem, author: '', language: 'en', chapters: textToChapters(text), images: new Map() } }
  if (/^(html?|xhtml)$/.test(ext)) { const { readTextFile } = await import('./text'); return htmlToBook((await readTextFile(file)).text, stem) }
  if (/^(md|markdown)$/.test(ext)) { const { marked } = await import('marked'); return htmlToBook(await marked.parse(await file.text()), stem) }
  if (ext === 'docx') {
    const mammoth = await import('mammoth')
    const r = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })
    return htmlToBook(r.value, stem)
  }
  if (ext === 'rtf') { const { rtfToHtml } = await import('./rtf'); return htmlToBook(await rtfToHtml(await file.arrayBuffer()), stem) }
  if (ext === 'odt') { const { odtToHtml } = await import('./odt'); return htmlToBook(await odtToHtml(file), stem) }
  if (ext === 'pdf') {
    const { openPdfJs, pageText } = await import('@/lib/pdf')
    const pdf = await openPdfJs(file)
    let html = ''
    for (let i = 1; i <= pdf.numPages; i++) {
      onProgress?.(i / pdf.numPages, `Reading page ${i} of ${pdf.numPages}`)
      const t = await pageText(pdf, i)
      html += t.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('\n')
    }
    let meta: any = {}; try { meta = (await pdf.getMetadata()).info } catch { /* none */ }
    const m = await htmlToBook(html, meta?.Title || stem)
    const chunk = 12000
    if (m.chapters.length === 1 && html.length > chunk * 2) {
      const paras = html.split('\n'); const ch: BookChapter[] = []; let buf = ''
      for (const p of paras) { buf += p + '\n'; if (buf.length > chunk) { ch.push({ title: `Part ${ch.length + 1}`, html: buf }); buf = '' } }
      if (buf) ch.push({ title: `Part ${ch.length + 1}`, html: buf })
      m.chapters = ch
    }
    m.author = meta?.Author || ''
    return m
  }
  if (ext === 'chm') return chmToBook(file, onProgress)
  throw new Error('This file type is not supported. Try EPUB, MOBI, AZW3, FB2, CBZ, TXT, HTML, Markdown, DOCX, RTF, ODT, PDF or CHM.')
}

async function chmToBook(file: File, onProgress?: (p: number, l?: string) => void): Promise<BookModel> {
  const { extractArchive } = await import('./archive')
  onProgress?.(0.05, 'Unpacking CHM')
  const { files } = await extractArchive(file, file.name, { unwrapTar: false })
  const byPath = new Map(files.map((f) => [f.path.toLowerCase().replace(/^\/+/, ''), f]))
  const dec = new TextDecoder('windows-1252')
  const utf = new TextDecoder()
  const txt = (d: Uint8Array) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(d) } catch { return dec.decode(d) } }
  const hhc = files.find((f) => /\.hhc$/i.test(f.path))
  let order: { title: string; path: string }[] = []
  if (hhc) {
    for (const m of txt(hhc.data).matchAll(/<object[^>]*>([\s\S]*?)<\/object>/gi)) {
      const nm = m[1].match(/name="Name"\s+value="([^"]*)"/i)?.[1]; const loc = m[1].match(/name="Local"\s+value="([^"]*)"/i)?.[1]
      if (loc) order.push({ title: nm || loc, path: decodeURIComponent(loc.split('#')[0]).replace(/\\/g, '/').toLowerCase() })
    }
  }
  if (!order.length) order = files.filter((f) => /\.html?$/i.test(f.path)).map((f) => ({ title: f.path, path: f.path.toLowerCase() }))
  const seenPath = new Set<string>(); const images = new Map<string, Blob>(); const chapters: BookChapter[] = []
  const imgUrls: string[] = []
  for (let i = 0; i < order.length; i++) {
    const o = order[i]; if (seenPath.has(o.path)) continue; seenPath.add(o.path)
    const f = byPath.get(o.path.replace(/^\/+/, '')); if (!f) continue
    onProgress?.(0.1 + 0.9 * (i / order.length), `Reading ${o.title}`)
    const doc = new DOMParser().parseFromString(txt(f.data), 'text/html')
    const dir = o.path.includes('/') ? o.path.slice(0, o.path.lastIndexOf('/') + 1) : ''
    doc.querySelectorAll('img').forEach((img) => {
      const src = (img.getAttribute('src') || '').replace(/\\/g, '/')
      const parts = (dir + src).split('/'); const outp: string[] = []; for (const p of parts) { if (p === '..') outp.pop(); else if (p && p !== '.') outp.push(p) }
      const hit = byPath.get(outp.join('/').toLowerCase())
      if (hit) { const u = URL.createObjectURL(new Blob([hit.data as BlobPart])); imgUrls.push(u); img.setAttribute('src', u) } else img.remove()
    })
    const html = await harvest(doc, images, new Map())
    if (html.replace(/<[^>]+>/g, '').trim()) chapters.push({ title: o.title, html })
  }
  imgUrls.forEach((u) => URL.revokeObjectURL(u))
  void utf
  if (!chapters.length) throw new Error('No readable pages were found in this CHM file.')
  return { title: file.name.replace(/\.[^.]+$/, ''), author: '', language: 'en', chapters, images }
}

/* ---------------- writers ---------------- */
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2))
const xhtmlBody = (html: string) => {
  // make the fragment well formed XHTML
  const doc = new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html')
  const ser = new XMLSerializer()
  return Array.from(doc.body.childNodes).map((n) => ser.serializeToString(n)).join('').replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '')
}
const BOOK_CSS = 'body{font-family:serif;line-height:1.5;margin:0 4%;}h1,h2,h3{line-height:1.2;}img{max-width:100%;height:auto;}p{margin:0 0 .8em;text-indent:0;}pre{white-space:pre-wrap;}'

export async function writeEpub(b: BookModel, o: { css?: string; coverJpeg?: Blob } = {}): Promise<Blob> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file('META-INF/container.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
  const id = 'urn:uuid:' + uuid()
  const manifest: string[] = []; const spine: string[] = []; const navItems: string[] = []
  zip.file('OEBPS/style.css', o.css ?? BOOK_CSS); manifest.push('<item id="css" href="style.css" media-type="text/css"/>')
  const cover = o.coverJpeg ?? b.cover
  if (cover) {
    const ext = IMG_EXT[cover.type] || 'jpg'
    zip.file(`OEBPS/images/cover.${ext}`, cover)
    manifest.push(`<item id="cover-image" href="images/cover.${ext}" media-type="${cover.type || 'image/jpeg'}" properties="cover-image"/>`)
    zip.file('OEBPS/cover.xhtml', `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Cover</title><style>body{margin:0;text-align:center}img{max-width:100%;max-height:100vh}</style></head><body epub:type="cover"><img src="images/cover.${ext}" alt="Cover"/></body></html>`)
    manifest.push('<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>'); spine.push('<itemref idref="cover" linear="yes"/>')
  }
  let i = 0
  for (const [name, blob] of b.images) { zip.file(`OEBPS/images/${name}`, blob); manifest.push(`<item id="im${++i}" href="images/${name}" media-type="${blob.type || 'image/' + (name.split('.').pop() === 'jpg' ? 'jpeg' : name.split('.').pop())}"/>`) }
  b.chapters.forEach((c, n) => {
    const fn = `ch${String(n + 1).padStart(3, '0')}.xhtml`
    zip.file(`OEBPS/${fn}`, `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${esc(b.language || 'en')}"><head><title>${esc(c.title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${xhtmlBody(c.html)}</body></html>`)
    manifest.push(`<item id="c${n + 1}" href="${fn}" media-type="application/xhtml+xml"/>`); spine.push(`<itemref idref="c${n + 1}"/>`)
    navItems.push(`<li><a href="${fn}">${esc(c.title)}</a></li>`)
  })
  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${navItems.join('')}</ol></nav></body></html>`)
  manifest.push('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>')
  zip.file('OEBPS/toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${id}"/></head><docTitle><text>${esc(b.title)}</text></docTitle><navMap>${b.chapters.map((c, n) => `<navPoint id="n${n + 1}" playOrder="${n + 1}"><navLabel><text>${esc(c.title)}</text></navLabel><content src="ch${String(n + 1).padStart(3, '0')}.xhtml"/></navPoint>`).join('')}</navMap></ncx>`)
  manifest.push('<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>')
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${esc(b.language || 'en')}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${id}</dc:identifier><dc:title>${esc(b.title || 'Untitled')}</dc:title>${b.author ? `<dc:creator>${esc(b.author)}</dc:creator>` : ''}<dc:language>${esc(b.language || 'en')}</dc:language>${b.publisher ? `<dc:publisher>${esc(b.publisher)}</dc:publisher>` : ''}${b.description ? `<dc:description>${esc(b.description)}</dc:description>` : ''}<meta property="dcterms:modified">${now}</meta>${cover ? '<meta name="cover" content="cover-image"/>' : ''}</metadata><manifest>${manifest.join('')}</manifest><spine toc="ncx">${spine.join('')}</spine></package>`)
  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE' })
}

const blobToDataUrl = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(b) })

/** Single self-contained HTML (images inlined). */
export async function writeHtml(b: BookModel, css = BOOK_CSS): Promise<string> {
  const data = new Map<string, string>()
  for (const [n, blob] of b.images) data.set('images/' + n, await blobToDataUrl(blob))
  const fix = (h: string) => h.replace(/src="(images\/[^"]+)"/g, (m, p) => (data.has(p) ? `src="${data.get(p)}"` : m))
  const cover = b.cover ? `<div style="text-align:center;page-break-after:always"><img src="${await blobToDataUrl(b.cover)}" alt="Cover" style="max-height:90vh"/></div>` : ''
  const toc = b.chapters.length > 1 ? `<nav><h2>Contents</h2><ol>${b.chapters.map((c, i) => `<li><a href="#ch${i + 1}">${esc(c.title)}</a></li>`).join('')}</ol></nav>` : ''
  return `<!doctype html><html lang="${esc(b.language || 'en')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(b.title)}</title>${b.author ? `<meta name="author" content="${esc(b.author)}">` : ''}<style>${css}body{max-width:42em;margin:2em auto;padding:0 1em}</style></head><body>${cover}<h1>${esc(b.title)}</h1>${b.author ? `<p><em>${esc(b.author)}</em></p>` : ''}${toc}${b.chapters.map((c, i) => `<section id="ch${i + 1}">${fix(c.html)}</section>`).join('\n')}</body></html>`
}

export function htmlToPlain(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  doc.querySelectorAll('br').forEach((b) => b.replaceWith('\n'))
  doc.querySelectorAll('p,div,h1,h2,h3,h4,h5,h6,li,tr,blockquote,pre,section').forEach((e) => e.append('\n\n'))
  doc.querySelectorAll('li').forEach((e) => e.prepend('- '))
  return (doc.body.textContent ?? '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}
export const writeTxt = (b: BookModel) => `${b.title}${b.author ? '\n' + b.author : ''}\n\n` + b.chapters.map((c) => htmlToPlain(c.html)).join('\n\n\n') + '\n'

export async function writeMarkdown(b: BookModel): Promise<string> {
  const Turndown = (await import('turndown')).default
  const td = new Turndown({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })
  return `# ${b.title}\n\n${b.author ? `*${b.author}*\n\n` : ''}` + b.chapters.map((c) => td.turndown(c.html)).join('\n\n---\n\n') + '\n'
}

export async function writeFb2(b: BookModel): Promise<string> {
  const bin: string[] = []
  const ids = new Map<string, string>()
  for (const [n, blob] of b.images) { const id = n.replace(/[^\w.]/g, '_'); ids.set('images/' + n, id); bin.push(`<binary id="${id}" content-type="${blob.type || 'image/jpeg'}">${(await blobToDataUrl(blob)).split(',')[1]}</binary>`) }
  let coverXml = ''
  if (b.cover) { bin.push(`<binary id="cover.jpg" content-type="${b.cover.type || 'image/jpeg'}">${(await blobToDataUrl(b.cover)).split(',')[1]}</binary>`); coverXml = '<coverpage><image l:href="#cover.jpg"/></coverpage>' }
  const sec = (html: string) => {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
    const out: string[] = []
    const inline = (el: Node): string => Array.from(el.childNodes).map((n) => {
      if (n.nodeType === 3) return esc(n.textContent ?? '')
      if (n.nodeType !== 1) return ''
      const t = (n as Element).tagName.toLowerCase()
      if (t === 'b' || t === 'strong') return `<strong>${inline(n)}</strong>`
      if (t === 'i' || t === 'em') return `<emphasis>${inline(n)}</emphasis>`
      if (t === 'br') return '</p><p>'
      return inline(n)
    }).join('')
    const walk = (el: Element) => {
      for (const n of Array.from(el.children)) {
        const t = n.tagName.toLowerCase()
        if (/^h[1-6]$/.test(t)) out.push(`<subtitle>${inline(n)}</subtitle>`)
        else if (t === 'img') { const id = ids.get(n.getAttribute('src') || ''); if (id) out.push(`<image l:href="#${id}"/>`) }
        else if (n.querySelector('p,div,h1,h2,h3,li,img') && !/^(p|li)$/.test(t)) walk(n)
        else { const im = n.querySelector('img'); if (im) { const id = ids.get(im.getAttribute('src') || ''); if (id) out.push(`<image l:href="#${id}"/>`) } const s = inline(n).trim(); if (s) out.push(`<p>${s}</p>`) }
      }
    }
    walk(doc.body)
    return out.join('\n').replace(/<p><\/p>/g, '')
  }
  const [first, ...rest] = (b.author || 'Unknown').split(' ')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink"><description><title-info><author><first-name>${esc(first)}</first-name><last-name>${esc(rest.join(' '))}</last-name></author><book-title>${esc(b.title)}</book-title><lang>${esc((b.language || 'en').slice(0, 2))}</lang>${coverXml}</title-info><document-info><program-used>OpenFile</program-used><date>${new Date().toISOString().slice(0, 10)}</date><id>${uuid()}</id><version>1.0</version></document-info></description><body><title><p>${esc(b.title)}</p></title>${b.chapters.map((c) => `<section><title><p>${esc(c.title)}</p></title>${sec(c.html)}</section>`).join('\n')}</body>${bin.join('\n')}</FictionBook>\n`
}

export async function writeDocx(b: BookModel): Promise<Blob> {
  const { htmlToDocx } = await import('./htmlDocx')
  const html = `<h1>${esc(b.title)}</h1>${b.author ? `<p><i>${esc(b.author)}</i></p>` : ''}` + b.chapters.map((c, i) => `<div style="${i ? 'page-break-before:always' : ''}">${c.html}</div>`).join('')
  return htmlToDocx(html, { title: b.title, author: b.author, resolveImage: async (src) => b.images.get(src.replace(/^images\//, '')) ?? null })
}

export async function writePdf(b: BookModel, o: { pageWidth?: number; pageHeight?: number; margin?: number; fontSize?: number; onProgress?: (p: number) => void } = {}): Promise<Blob> {
  const { renderHtmlToPdf, createPdf, addPageNumbers, pdfToBlob } = await import('@/tools/convert/_conv/htmlPdf')
  const w = o.pageWidth ?? 419.53, h = o.pageHeight ?? 595.28, m = o.margin ?? 42
  const urls = new Map<string, string>()
  for (const [n, blob] of b.images) urls.set('images/' + n, await blobToDataUrl(blob))
  const css = `html,body{background:#fff;color:#111;margin:0;font-family:Georgia,'Times New Roman',serif;font-size:${o.fontSize ?? 12}pt;line-height:1.5}img{max-width:100%;height:auto}h1,h2,h3{line-height:1.25}p{margin:0 0 .7em}`
  const pdf = await createPdf(w, h)
  let used = false
  const parts: string[] = []
  if (b.cover) parts.push(`<div style="text-align:center"><img src="${await blobToDataUrl(b.cover)}" style="max-height:${Math.round((h - 2 * m) * 1.3)}px"/></div>`)
  parts.push(`<div style="text-align:center;padding-top:30%"><h1 style="font-size:24pt">${esc(b.title)}</h1>${b.author ? `<p style="font-size:14pt">${esc(b.author)}</p>` : ''}</div>`)
  b.chapters.forEach((c) => parts.push(c.html.replace(/src="(images\/[^"]+)"/g, (mm, p) => (urls.has(p) ? `src="${urls.get(p)}"` : mm))))
  for (let i = 0; i < parts.length; i++) {
    await renderHtmlToPdf(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${parts[i]}</body></html>`, { pageWidth: w, pageHeight: h, margin: m, pdf, newPage: used, scale: 1.6, quality: 0.85, onProgress: (p) => o.onProgress?.((i + p) / parts.length) })
    used = true
  }
  addPageNumbers(pdf, { from: 2 })
  return pdfToBlob(pdf)
}

export type BookOut = 'epub' | 'pdf' | 'docx' | 'html' | 'txt' | 'md' | 'fb2'
export const BOOK_OUT: { id: BookOut; label: string; mime: string }[] = [
  { id: 'epub', label: 'EPUB', mime: 'application/epub+zip' }, { id: 'pdf', label: 'PDF', mime: 'application/pdf' }, { id: 'docx', label: 'Word (DOCX)', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { id: 'html', label: 'HTML', mime: 'text/html' }, { id: 'txt', label: 'Plain text', mime: 'text/plain' }, { id: 'md', label: 'Markdown', mime: 'text/markdown' }, { id: 'fb2', label: 'FB2', mime: 'application/x-fictionbook+xml' },
]
export async function writeBook(b: BookModel, out: BookOut, onProgress?: (p: number) => void): Promise<Blob> {
  const mime = BOOK_OUT.find((x) => x.id === out)!.mime
  switch (out) {
    case 'epub': return writeEpub(b)
    case 'pdf': return writePdf(b, { onProgress })
    case 'docx': return writeDocx(b)
    case 'html': return new Blob([await writeHtml(b)], { type: mime })
    case 'txt': return new Blob([writeTxt(b)], { type: mime })
    case 'md': return new Blob([await writeMarkdown(b)], { type: mime })
    case 'fb2': return new Blob([await writeFb2(b)], { type: mime })
  }
}
