/* Light EPUB checker: container, mimetype, OPF metadata, manifest, spine, navigation, XHTML well-formedness and broken links.
 * Uses fflate for the ZIP and the browser DOMParser for XML. */
export type Level = 'error' | 'warning' | 'info'
export interface Finding { level: Level; where: string; message: string }
export interface EpubReport { findings: Finding[]; version: string; title: string; files: number; chapters: number; images: number; bytes: number }

const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '')
function resolve(base: string, href: string) {
  let h = href.split('#')[0].split('?')[0]
  try { h = decodeURIComponent(h) } catch { /* keep raw */ }
  const out: string[] = []
  for (const s of (dirOf(base) + h).split('/')) { if (s === '..') out.pop(); else if (s !== '.' && s !== '') out.push(s) }
  return out.join('/')
}

export async function checkEpub(buf: Uint8Array): Promise<EpubReport> {
  const f: Finding[] = []
  const add = (level: Level, where: string, message: string) => f.push({ level, where, message })
  const { unzipSync } = await import('fflate')
  let z: Record<string, Uint8Array>
  try { z = unzipSync(buf) } catch { throw new Error('This file is not a valid ZIP, so it cannot be an EPUB. Try Repair ZIP first.') }
  const names = Object.keys(z).filter((n) => !n.endsWith('/'))
  const dec = new TextDecoder()
  const txt = (p: string) => (z[p] ? dec.decode(z[p]) : null)
  // mimetype must be the first entry and stored without compression
  const first = buf[0] === 0x50 && buf[1] === 0x4b ? { name: dec.decode(buf.subarray(30, 30 + (buf[26] | (buf[27] << 8)))), method: buf[8] | (buf[9] << 8), extra: buf[28] | (buf[29] << 8) } : null
  if (!z['mimetype']) add('error', 'mimetype', 'The mimetype file is missing.')
  else {
    if (txt('mimetype')!.trim() !== 'application/epub+zip') add('error', 'mimetype', `The mimetype file should say application/epub+zip, it says "${txt('mimetype')!.trim().slice(0, 40)}".`)
    if (!first || first.name !== 'mimetype') add('error', 'mimetype', 'mimetype must be the very first file in the ZIP.')
    else if (first.method !== 0) add('error', 'mimetype', 'mimetype must be stored without compression.')
    else if (first.extra) add('warning', 'mimetype', 'mimetype has an extra field in its ZIP header, some readers reject this.')
  }
  const parse = (s: string, type: DOMParserSupportedType = 'application/xml') => { const d = new DOMParser().parseFromString(s, type); const err = d.getElementsByTagName('parsererror')[0]; return { d, err: err ? (err.textContent || 'XML error').replace(/\s+/g, ' ').slice(0, 160) : null } }
  const container = txt('META-INF/container.xml')
  let opfPath = ''
  if (!container) add('error', 'META-INF/container.xml', 'container.xml is missing, readers cannot find the book.')
  else { const { d, err } = parse(container); if (err) add('error', 'META-INF/container.xml', 'Not well-formed XML: ' + err); opfPath = d.getElementsByTagName('rootfile')[0]?.getAttribute('full-path') ?? ''; if (!opfPath) add('error', 'META-INF/container.xml', 'No rootfile full-path is set.') }
  if (!opfPath) opfPath = names.find((n) => n.endsWith('.opf')) ?? ''
  const opfText = opfPath ? txt(opfPath) : null
  if (!opfText) { add('error', opfPath || 'OPF', 'The package (OPF) file was not found.'); return { findings: f, version: '?', title: '', files: names.length, chapters: 0, images: 0, bytes: buf.length } }
  const { d: opf, err: opfErr } = parse(opfText)
  if (opfErr) add('error', opfPath, 'Not well-formed XML: ' + opfErr)
  const pkg = opf.documentElement
  const version = pkg.getAttribute('version') ?? '?'
  if (!/^[23]\./.test(version)) add('warning', opfPath, `Unusual package version "${version}".`)
  const meta = (tag: string) => Array.from(opf.getElementsByTagNameNS('*', tag)).map((e) => e.textContent?.trim() ?? '').filter(Boolean)
  const title = meta('title')[0] ?? ''
  if (!title) add('error', opfPath, 'dc:title is missing.')
  if (!meta('language').length) add('error', opfPath, 'dc:language is missing.')
  const ids = Array.from(opf.getElementsByTagNameNS('*', 'identifier'))
  if (!ids.length) add('error', opfPath, 'dc:identifier is missing.')
  const uid = pkg.getAttribute('unique-identifier')
  if (uid && !ids.some((e) => e.getAttribute('id') === uid)) add('error', opfPath, `unique-identifier points to "${uid}" but no identifier has that id.`)
  if (!meta('creator').length) add('warning', opfPath, 'No author (dc:creator) is set.')
  const metas = Array.from(opf.getElementsByTagNameNS('*', 'meta'))
  if (version.startsWith('3') && !metas.some((m) => m.getAttribute('property') === 'dcterms:modified')) add('error', opfPath, 'EPUB 3 needs a dcterms:modified date in the metadata.')
  const items = Array.from(opf.getElementsByTagNameNS('*', 'item')).map((e) => ({ id: e.getAttribute('id') ?? '', href: e.getAttribute('href') ?? '', type: e.getAttribute('media-type') ?? '', props: e.getAttribute('properties') ?? '' }))
  const byId = new Map(items.map((i) => [i.id, i]))
  const inManifest = new Set<string>()
  const seenIds = new Set<string>()
  for (const it of items) {
    if (seenIds.has(it.id)) add('error', opfPath, `Duplicate manifest id "${it.id}".`)
    seenIds.add(it.id)
    const p = resolve(opfPath, it.href); inManifest.add(p)
    if (!/^https?:/.test(it.href) && !z[p]) add('error', opfPath, `Manifest lists ${it.href} but the file is not in the book.`)
    if (!it.type) add('error', opfPath, `${it.href} has no media-type.`)
  }
  for (const n of names) if (n !== 'mimetype' && !n.startsWith('META-INF/') && n !== opfPath && !inManifest.has(n)) add('warning', n, 'File is in the ZIP but not listed in the manifest.')
  const spine = Array.from(opf.getElementsByTagNameNS('*', 'itemref')).map((e) => e.getAttribute('idref') ?? '')
  if (!spine.length) add('error', opfPath, 'The spine is empty, readers have no reading order.')
  for (const r of spine) if (!byId.has(r)) add('error', opfPath, `Spine refers to "${r}", which is not in the manifest.`)
  if (version.startsWith('3')) { if (!items.some((i) => i.props.split(/\s+/).includes('nav'))) add('error', opfPath, 'EPUB 3 needs a navigation document (an item with properties="nav").') }
  else if (!items.some((i) => i.type === 'application/x-dtbncx+xml')) add('error', opfPath, 'EPUB 2 needs an NCX table of contents.')
  if (!items.some((i) => i.props.includes('cover-image')) && !metas.some((m) => m.getAttribute('name') === 'cover')) add('info', opfPath, 'No cover image is declared, stores and readers will show a blank cover.')
  let chapters = 0, images = 0
  for (const it of items) {
    const p = resolve(opfPath, it.href)
    const data = z[p]
    if (!data) continue
    if (/image\//.test(it.type)) { images++; if (data.length > 5 * 1024 * 1024) add('warning', p, `Large image (${(data.length / 1048576).toFixed(1)} MB), some readers struggle above 5 MB.`) }
    if (it.type === 'application/xhtml+xml') {
      chapters++
      const { d, err } = parse(dec.decode(data), 'application/xhtml+xml')
      if (err) { add('error', p, 'Not well-formed XHTML: ' + err); continue }
      for (const el of Array.from(d.querySelectorAll('[src],[href]'))) {
        const ref = el.getAttribute('src') ?? el.getAttribute('href') ?? ''
        if (!ref || /^(https?:|mailto:|tel:|data:|#)/i.test(ref)) continue
        const t = resolve(p, ref)
        if (!z[t]) add('error', p, `Broken link to ${ref}.`)
        else if (!inManifest.has(t)) add('warning', p, `Links to ${ref}, which is not in the manifest.`)
      }
    }
  }
  if (!f.some((x) => x.level !== 'info')) add('info', 'book', 'No problems found by these checks.')
  return { findings: f, version, title, files: names.length, chapters, images, bytes: buf.length }
}
