/* Document writers for the PDF converters: Markdown, HTML, RTF, EPUB 3, ODT, ODS, ODP. Pure (no DOM), unit-testable. */
import { zipSync, strToU8 } from 'fflate'
import type { PNode } from './extract'
import type { Run } from '../_conv/pdfText'
import { escHtml, runsHtml, runsMd } from './text'

export interface PageImage { page: number; name: string; data: Uint8Array; w: number; h: number; mime: string }
export interface WriteOpts { title: string; author?: string; lang?: string; pageBreaks?: boolean; images: Map<number, PageImage> }

/* ---------------------------------------------------------------- Markdown */
export function toMarkdown(model: PNode[][], o: WriteOpts) {
  const out: string[] = []
  let olN = 0
  model.forEach((nodes, pi) => {
    if (pi > 0 && o.pageBreaks) out.push('---', '')
    for (const n of nodes) {
      if (n.type === 'scan') { const im = o.images.get(n.page); out.push(im ? `![Page ${n.page}](images/${im.name})` : `*Page ${n.page} is a scanned image.*`, ''); continue }
      if (n.type === 'table') { out.push(...mdTable(n.rows), ''); continue }
      const b = n.block
      const text = runsMd(b.runs).replace(/\s+/g, ' ').trim()
      if (!text) continue
      if (b.kind !== 'oli') olN = 0
      if (b.kind === 'h1') out.push(`# ${plain(b.runs)}`, '')
      else if (b.kind === 'h2') out.push(`## ${plain(b.runs)}`, '')
      else if (b.kind === 'h3') out.push(`### ${plain(b.runs)}`, '')
      else if (b.kind === 'li') out.push(`${b.indent > 20 ? '  ' : ''}- ${text}`)
      else if (b.kind === 'oli') { olN++; out.push(`${olN}. ${text.replace(/^\(?\w{1,4}[.)]\s*/, '')}`) }
      else out.push(text, '')
    }
    if (out[out.length - 1] !== '') out.push('')
  })
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}
const plain = (runs: Run[]) => runs.map((r) => r.text).join('').replace(/\s+/g, ' ').trim()
function mdTable(rows: string[][]) {
  const cols = Math.max(...rows.map((r) => r.length))
  const cell = (s: string) => (s ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
  const line = (r: string[]) => '| ' + Array.from({ length: cols }, (_, i) => cell(r[i])).join(' | ') + ' |'
  return [line(rows[0]), '|' + ' --- |'.repeat(cols), ...rows.slice(1).map(line)]
}

/* ---------------------------------------------------------------- HTML (reflow) */
export const READER_CSS = `body{font:17px/1.65 Georgia,'Times New Roman',serif;max-width:46rem;margin:2.5rem auto;padding:0 1.25rem;color:#1d1d1f;background:#fff}
h1,h2,h3{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.25;margin:1.6em 0 .5em}h1{font-size:1.9em}h2{font-size:1.45em}h3{font-size:1.2em}
p{margin:0 0 1em}table{border-collapse:collapse;width:100%;margin:1.2em 0;font:14px/1.4 system-ui,sans-serif}td,th{border:1px solid #ccd;padding:.35em .5em;text-align:left;vertical-align:top}th{background:#f2f3f5}
img{max-width:100%;height:auto;display:block;margin:1em auto;box-shadow:0 1px 6px rgba(0,0,0,.15)}hr.page{border:0;border-top:1px dashed #bbb;margin:2.5em 0}.center{text-align:center}
@media (prefers-color-scheme:dark){body{background:#111;color:#e6e6e6}th{background:#222}td,th{border-color:#333}}`
export function bodyHtml(model: PNode[][], o: WriteOpts, imgSrc: (im: PageImage) => string, xhtml = false) {
  const out: string[] = []
  const br = xhtml ? '<hr class="page"/>' : '<hr class="page">'
  model.forEach((nodes, pi) => {
    if (pi > 0 && o.pageBreaks) out.push(br)
    let list: 'ul' | 'ol' | null = null
    const close = () => { if (list) { out.push(`</${list}>`); list = null } }
    for (const n of nodes) {
      if (n.type === 'block' && (n.block.kind === 'li' || n.block.kind === 'oli')) {
        const want = n.block.kind === 'li' ? 'ul' : 'ol'
        if (list !== want) { close(); out.push(`<${want}>`); list = want }
        const runs = n.block.kind === 'oli' ? stripNum(n.block.runs) : n.block.runs
        out.push(`<li>${runsHtml(runs).trim()}</li>`); continue
      }
      close()
      if (n.type === 'scan') { const im = o.images.get(n.page); out.push(im ? `<img src="${imgSrc(im)}" alt="Page ${n.page}"${xhtml ? '/' : ''}>` : `<p><em>Page ${n.page} is a scanned image.</em></p>`); continue }
      if (n.type === 'table') { out.push(htmlTable(n.rows)); continue }
      const b = n.block; const inner = runsHtml(b.runs).replace(/\s+/g, ' ').trim()
      if (!inner) continue
      const cls = b.align === 'center' ? ' class="center"' : ''
      if (b.kind.startsWith('h')) out.push(`<${b.kind}${cls}>${escHtml(plain(b.runs))}</${b.kind}>`)
      else out.push(`<p${cls}>${inner}</p>`)
    }
    close()
  })
  return out.join('\n')
}
const stripNum = (runs: Run[]) => runs.map((r, i) => (i === 0 ? { ...r, text: r.text.replace(/^\s*\(?\w{1,4}[.)]\s*/, '') } : r))
function htmlTable(rows: string[][]) {
  const cols = Math.max(...rows.map((r) => r.length))
  const tr = (r: string[], tag: 'td' | 'th') => '<tr>' + Array.from({ length: cols }, (_, i) => `<${tag}>${escHtml(r[i] ?? '')}</${tag}>`).join('') + '</tr>'
  return `<table><thead>${tr(rows[0], 'th')}</thead><tbody>${rows.slice(1).map((r) => tr(r, 'td')).join('')}</tbody></table>`
}
export function toHtmlDoc(model: PNode[][], o: WriteOpts, imgSrc: (im: PageImage) => string) {
  return `<!DOCTYPE html>\n<html lang="${o.lang ?? 'en'}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${escHtml(o.title)}</title>\n${o.author ? `<meta name="author" content="${escHtml(o.author)}">\n` : ''}<meta name="generator" content="OpenFile">\n<style>${READER_CSS}</style>\n</head>\n<body>\n${bodyHtml(model, o, imgSrc)}\n</body>\n</html>\n`
}

/* ---------------------------------------------------------------- RTF */
const rtfEsc = (s: string) => {
  let o = ''
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    if (ch === '\\' || ch === '{' || ch === '}') o += '\\' + ch
    else if (ch === '\n') o += '\\line '
    else if (c < 128) o += ch
    else if (c < 0x10000) o += `\\u${c > 32767 ? c - 65536 : c}?`
    else { const hi = 0xd800 + ((c - 0x10000) >> 10), lo = 0xdc00 + ((c - 0x10000) & 1023); o += `\\u${hi - 65536}?\\u${lo - 65536}?` }
  }
  return o
}
const rtfRuns = (runs: Run[]) => runs.map((r) => { const t = rtfEsc(r.text); return r.bold || r.italic ? `{${r.bold ? '\\b' : ''}${r.italic ? '\\i' : ''} ${t}}` : t }).join('')
export function toRtf(model: PNode[][], o: WriteOpts & { font?: string; size?: number }) {
  const fs = Math.round((o.size ?? 11) * 2)
  const parts: string[] = [`{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1{\\fonttbl{\\f0\\fswiss ${o.font ?? 'Calibri'};}{\\f1\\froman Cambria;}}`, `{\\colortbl;\\red0\\green0\\blue0;\\red200\\green200\\blue205;}`, `{\\info{\\title ${rtfEsc(o.title)}}${o.author ? `{\\author ${rtfEsc(o.author)}}` : ''}}`, `\\paperw11906\\paperh16838\\margl1440\\margr1440\\margt1440\\margb1440\\f0\\fs${fs}\\sa160\\sl276\\slmult1`]
  let olN = 0
  model.forEach((nodes, pi) => {
    if (pi > 0 && o.pageBreaks) parts.push('\\page')
    for (const n of nodes) {
      if (n.type === 'scan') {
        const im = o.images.get(n.page)
        if (im && im.mime === 'image/png') { const maxW = 9026; const wTw = Math.min(maxW, im.w * 15), hTw = Math.round(wTw * im.h / im.w); parts.push(`{\\pard\\qc{\\pict\\pngblip\\picw${im.w}\\pich${im.h}\\picwgoal${wTw}\\pichgoal${hTw} ${hexWrap(im.data)}}\\par}`) }
        continue
      }
      if (n.type === 'table') { parts.push(rtfTable(n.rows)); continue }
      const b = n.block
      if (b.kind !== 'oli') olN = 0
      if (b.kind === 'h1') parts.push(`{\\pard\\keepn\\sb240\\sa120\\f1\\fs${Math.round(fs * 1.8)}\\b ${rtfEsc(plain(b.runs))}\\par}`)
      else if (b.kind === 'h2') parts.push(`{\\pard\\keepn\\sb200\\sa100\\f1\\fs${Math.round(fs * 1.45)}\\b ${rtfEsc(plain(b.runs))}\\par}`)
      else if (b.kind === 'h3') parts.push(`{\\pard\\keepn\\sb160\\sa80\\fs${Math.round(fs * 1.2)}\\b ${rtfEsc(plain(b.runs))}\\par}`)
      else if (b.kind === 'li') parts.push(`{\\pard\\fi-280\\li560 \\bullet\\tab ${rtfRuns(b.runs).trim()}\\par}`)
      else if (b.kind === 'oli') { olN++; parts.push(`{\\pard\\fi-360\\li640 ${olN}.\\tab ${rtfRuns(stripNum(b.runs)).trim()}\\par}`) }
      else parts.push(`{\\pard${b.align === 'center' ? '\\qc' : ''} ${rtfRuns(b.runs).replace(/\s+/g, ' ').trim()}\\par}`)
    }
  })
  parts.push('}')
  return parts.join('\n')
}
function rtfTable(rows: string[][]) {
  const cols = Math.max(...rows.map((r) => r.length)); const w = Math.floor(9026 / cols)
  const def = Array.from({ length: cols }, (_, i) => `\\clbrdrt\\brdrs\\brdrw10\\clbrdrl\\brdrs\\brdrw10\\clbrdrb\\brdrs\\brdrw10\\clbrdrr\\brdrs\\brdrw10\\cellx${w * (i + 1)}`).join('')
  return rows.map((r, ri) => `\\trowd\\trgaph80${def}${Array.from({ length: cols }, (_, i) => `\\pard\\intbl${ri === 0 ? '\\b' : ''} ${rtfEsc(r[i] ?? '')}${ri === 0 ? '\\b0' : ''}\\cell`).join('')}\\row`).join('\n') + '\n\\pard'
}
const hexWrap = (d: Uint8Array) => { let s = ''; for (let i = 0; i < d.length; i++) { s += d[i].toString(16).padStart(2, '0'); if (i % 64 === 63) s += '\n' } return s }

/* ---------------------------------------------------------------- EPUB 3 */
export interface Chapter { title: string; html: string }
export function splitChapters(model: PNode[][], o: WriteOpts, mode: 'h1' | 'h2' | 'pages', pagesPer = 10): { title: string; model: PNode[][] }[] {
  const chapters: { title: string; model: PNode[][] }[] = []
  let cur: { title: string; model: PNode[][] } | null = null
  const start = (title: string) => { cur = { title, model: [[]] }; chapters.push(cur) }
  model.forEach((nodes, pi) => {
    if (mode === 'pages') { if (pi % pagesPer === 0) start(`Pages ${pi + 1} to ${Math.min(model.length, pi + pagesPer)}`); else cur!.model.push([]) }
    else if (cur) cur.model.push([])
    for (const n of nodes) {
      const isBreak = n.type === 'block' && (n.block.kind === 'h1' || (mode === 'h2' && n.block.kind === 'h2'))
      if (mode !== 'pages' && (isBreak || !cur)) start(isBreak && n.type === 'block' ? plain(n.block.runs).slice(0, 120) : o.title)
      cur!.model[cur!.model.length - 1].push(n)
    }
  })
  return chapters.filter((c) => c.model.some((p) => p.length))
}
export function buildEpub(chapters: { title: string; model: PNode[][] }[], o: WriteOpts & { cover?: PageImage; uuid: string; modified: Date }) {
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {}
  files['mimetype'] = [strToU8('application/epub+zip'), { level: 0 }]
  files['META-INF/container.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`)
  const css = READER_CSS.replace(/@media[\s\S]*$/, '').replace(/max-width:46rem;margin:2.5rem auto;padding:0 1.25rem;/, 'margin:0;padding:0 .5em;')
  files['OEBPS/style.css'] = strToU8(css)
  const manifest: string[] = ['<item id="css" href="style.css" media-type="text/css"/>', '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>', '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>']
  const spine: string[] = []
  const used = new Set<number>()
  const xh = (title: string, body: string) => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${o.lang ?? 'en'}" lang="${o.lang ?? 'en'}"><head><meta charset="utf-8"/><title>${escHtml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${body}</body></html>`
  if (o.cover) {
    files[`OEBPS/images/${o.cover.name}`] = o.cover.data
    manifest.push(`<item id="cover-img" href="images/${o.cover.name}" media-type="${o.cover.mime}" properties="cover-image"/>`)
    files['OEBPS/cover.xhtml'] = strToU8(xh('Cover', `<div style="text-align:center"><img src="images/${o.cover.name}" alt="Cover" style="max-height:95vh"/></div>`))
    manifest.push('<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>'); spine.push('<itemref idref="cover"/>')
  }
  chapters.forEach((c, i) => {
    const body = bodyHtml(c.model, o, (im) => { used.add(im.page); return `images/${im.name}` }, true)
    const id = `ch${String(i + 1).padStart(3, '0')}`
    files[`OEBPS/${id}.xhtml`] = strToU8(xh(c.title, `<section epub:type="chapter">${body.replace(/<br>/g, '<br/>')}</section>`))
    manifest.push(`<item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`); spine.push(`<itemref idref="${id}"/>`)
  })
  for (const p of used) { const im = o.images.get(p)!; if (o.cover && im.name === o.cover.name) continue; files[`OEBPS/images/${im.name}`] = im.data; manifest.push(`<item id="img${p}" href="images/${im.name}" media-type="${im.mime}"/>`) }
  const navList = chapters.map((c, i) => `<li><a href="ch${String(i + 1).padStart(3, '0')}.xhtml">${escHtml(c.title)}</a></li>`).join('')
  files['OEBPS/nav.xhtml'] = strToU8(xh('Contents', `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${navList}</ol></nav>`))
  files['OEBPS/toc.ncx'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="urn:uuid:${o.uuid}"/></head><docTitle><text>${escHtml(o.title)}</text></docTitle><navMap>${chapters.map((c, i) => `<navPoint id="n${i + 1}" playOrder="${i + 1}"><navLabel><text>${escHtml(c.title)}</text></navLabel><content src="ch${String(i + 1).padStart(3, '0')}.xhtml"/></navPoint>`).join('')}</navMap></ncx>`)
  const mod = o.modified.toISOString().replace(/\.\d+Z$/, 'Z')
  files['OEBPS/content.opf'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${o.lang ?? 'en'}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:uuid:${o.uuid}</dc:identifier><dc:title>${escHtml(o.title)}</dc:title><dc:language>${o.lang ?? 'en'}</dc:language>${o.author ? `<dc:creator>${escHtml(o.author)}</dc:creator>` : ''}<meta property="dcterms:modified">${mod}</meta>${o.cover ? '<meta name="cover" content="cover-img"/>' : ''}</metadata><manifest>${manifest.join('')}</manifest><spine toc="ncx">${spine.join('')}</spine></package>`)
  return zipSync(files as any, { level: 6 })
}

/* ---------------------------------------------------------------- OpenDocument */
const x = (s: string) => escHtml(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
function odfZip(mime: string, content: string, styles: string, extra: Record<string, Uint8Array> = {}, title = '') {
  const manifestEntries = Object.keys(extra).map((p) => `<manifest:file-entry manifest:full-path="${p}" manifest:media-type="${p.endsWith('.png') ? 'image/png' : 'image/jpeg'}"/>`).join('')
  const files: Record<string, any> = {
    mimetype: [strToU8(mime), { level: 0 }],
    'META-INF/manifest.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>\n<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="${mime}"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>${manifestEntries}</manifest:manifest>`),
    'content.xml': strToU8(content), 'styles.xml': strToU8(styles),
    'meta.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>\n<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.3"><office:meta><meta:generator>OpenFile</meta:generator><dc:title>${x(title)}</dc:title></office:meta></office:document-meta>`),
    ...extra,
  }
  return zipSync(files, { level: 6 })
}
const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0"'
const ODT_STYLES = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-styles ${NS} office:version="1.3"><office:font-face-decls/><office:styles>
<style:default-style style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.2cm" fo:line-height="130%"/><style:text-properties style:font-name="Liberation Serif" fo:font-family="'Liberation Serif', Georgia, serif" fo:font-size="11pt"/></style:default-style>
<style:style style:name="Standard" style:family="paragraph" style:class="text"/>
<style:style style:name="Heading_20_1" style:display-name="Heading 1" style:family="paragraph" style:default-outline-level="1" style:class="text"><style:paragraph-properties fo:margin-top="0.5cm" fo:margin-bottom="0.25cm" fo:keep-with-next="always"/><style:text-properties fo:font-family="'Liberation Sans', Arial, sans-serif" fo:font-size="20pt" fo:font-weight="bold"/></style:style>
<style:style style:name="Heading_20_2" style:display-name="Heading 2" style:family="paragraph" style:default-outline-level="2" style:class="text"><style:paragraph-properties fo:margin-top="0.4cm" fo:margin-bottom="0.2cm" fo:keep-with-next="always"/><style:text-properties fo:font-family="'Liberation Sans', Arial, sans-serif" fo:font-size="16pt" fo:font-weight="bold"/></style:style>
<style:style style:name="Heading_20_3" style:display-name="Heading 3" style:family="paragraph" style:default-outline-level="3" style:class="text"><style:paragraph-properties fo:margin-top="0.3cm" fo:margin-bottom="0.15cm" fo:keep-with-next="always"/><style:text-properties fo:font-size="13pt" fo:font-weight="bold"/></style:style>
</office:styles><office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" fo:margin-top="2cm" fo:margin-bottom="2cm" fo:margin-left="2.2cm" fo:margin-right="2.2cm"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"/></office:master-styles></office:document-styles>`
const odtRuns = (runs: Run[]) => runs.map((r) => { const t = x(r.text).replace(/ {2,}/g, (m) => ` <text:s text:c="${m.length - 1}"/>`); return r.bold && r.italic ? `<text:span text:style-name="TBI">${t}</text:span>` : r.bold ? `<text:span text:style-name="TB">${t}</text:span>` : r.italic ? `<text:span text:style-name="TI">${t}</text:span>` : t }).join('')
export function toOdt(model: PNode[][], o: WriteOpts) {
  const body: string[] = []
  const pics: Record<string, Uint8Array> = {}
  let list: 'L1' | 'L2' | null = null
  const close = () => { if (list) { body.push('</text:list>'); list = null } }
  model.forEach((nodes, pi) => {
    let first = pi > 0 && o.pageBreaks
    const ps = () => { const s = first ? 'PB' : 'Standard'; first = false; return s }
    for (const n of nodes) {
      if (n.type === 'block' && (n.block.kind === 'li' || n.block.kind === 'oli')) {
        const want = n.block.kind === 'li' ? 'L1' : 'L2'
        if (list !== want) { close(); body.push(`<text:list text:style-name="${want}">`); list = want }
        body.push(`<text:list-item><text:p text:style-name="${ps()}">${odtRuns(n.block.kind === 'oli' ? stripNum(n.block.runs) : n.block.runs).trim()}</text:p></text:list-item>`); continue
      }
      close()
      if (n.type === 'scan') {
        const im = o.images.get(n.page); if (!im) continue
        const path = `Pictures/${im.name}`; pics[path] = im.data
        const w = 16.6, h = (w * im.h) / im.w
        body.push(`<text:p text:style-name="${ps()}"><draw:frame draw:name="p${n.page}" text:anchor-type="as-char" svg:width="${w}cm" svg:height="${h.toFixed(2)}cm"><draw:image xlink:href="${path}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame></text:p>`); continue
      }
      if (n.type === 'table') {
        const cols = Math.max(...n.rows.map((r) => r.length))
        body.push(`<table:table table:style-name="Tbl"><table:table-column table:number-columns-repeated="${cols}"/>${n.rows.map((r, ri) => `<table:table-row>${Array.from({ length: cols }, (_, i) => `<table:table-cell table:style-name="Cell" office:value-type="string"><text:p${ri === 0 ? ' text:style-name="TH"' : ''}>${x(r[i] ?? '')}</text:p></table:table-cell>`).join('')}</table:table-row>`).join('')}</table:table>`)
        continue
      }
      const b = n.block
      if (b.kind.startsWith('h')) { const lvl = b.kind[1]; body.push(`<text:h text:style-name="Heading_20_${lvl}" text:outline-level="${lvl}">${x(plain(b.runs))}</text:h>`); first = false }
      else body.push(`<text:p text:style-name="${b.align === 'center' ? 'Center' : ps()}">${odtRuns(b.runs).replace(/\s+/g, ' ').trim()}</text:p>`)
    }
    close()
  })
  const content = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-content ${NS} office:version="1.3"><office:automatic-styles>
<style:style style:name="TB" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style><style:style style:name="TI" style:family="text"><style:text-properties fo:font-style="italic"/></style:style><style:style style:name="TBI" style:family="text"><style:text-properties fo:font-weight="bold" fo:font-style="italic"/></style:style>
<style:style style:name="PB" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:break-before="page"/></style:style><style:style style:name="Center" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="center"/></style:style>
<style:style style:name="TH" style:family="paragraph"><style:text-properties fo:font-weight="bold"/></style:style>
<style:style style:name="Tbl" style:family="table"><style:table-properties style:width="16.6cm" table:align="margins"/></style:style><style:style style:name="Cell" style:family="table-cell"><style:table-cell-properties fo:padding="0.08cm" fo:border="0.5pt solid #999999"/></style:style>
<text:list-style style:name="L1"><text:list-level-style-bullet text:level="1" text:bullet-char="•"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" fo:text-indent="-0.5cm" fo:margin-left="1cm"/></style:list-level-properties></text:list-level-style-bullet></text:list-style>
<text:list-style style:name="L2"><text:list-level-style-number text:level="1" style:num-suffix="." style:num-format="1"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" fo:text-indent="-0.6cm" fo:margin-left="1.1cm"/></style:list-level-properties></text:list-level-style-number></text:list-style>
</office:automatic-styles><office:body><office:text>${body.join('\n')}</office:text></office:body></office:document-content>`
  return odfZip('application/vnd.oasis.opendocument.text', content, ODT_STYLES, pics, o.title)
}

export function toOds(sheets: { name: string; rows: string[][] }[], title = '') {
  const num = (s: string) => { const t = s.replace(/[\s,]/g, '').replace(/^\((.*)\)$/, '-$1'); return /^[-+]?\d+(\.\d+)?$/.test(t) && t.length < 16 ? Number(t) : null }
  const tables = sheets.map((sh, si) => {
    const cols = Math.max(1, ...sh.rows.map((r) => r.length))
    const name = (sh.name || `Sheet${si + 1}`).replace(/[[\]*?:/\\']/g, ' ').slice(0, 31)
    return `<table:table table:name="${x(name)}"><table:table-column table:number-columns-repeated="${cols}"/>${sh.rows.map((r) => `<table:table-row>${Array.from({ length: cols }, (_, i) => { const v = r[i] ?? ''; const n = num(v); return n !== null ? `<table:table-cell office:value-type="float" office:value="${n}"><text:p>${x(v)}</text:p></table:table-cell>` : v ? `<table:table-cell office:value-type="string"><text:p>${x(v)}</text:p></table:table-cell>` : '<table:table-cell/>' }).join('')}</table:table-row>`).join('')}</table:table>`
  })
  const content = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-content ${NS} office:version="1.3"><office:body><office:spreadsheet>${tables.join('')}</office:spreadsheet></office:body></office:document-content>`
  const styles = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-styles ${NS} office:version="1.3"><office:styles/></office:document-styles>`
  return odfZip('application/vnd.oasis.opendocument.spreadsheet', content, styles, {}, title)
}

export function toOdp(slides: PageImage[], size: { w: number; h: number }, title = '') {
  const pics: Record<string, Uint8Array> = {}
  const wcm = 28, hcm = (wcm * size.h) / size.w
  const pages = slides.map((im, i) => { const p = `Pictures/${im.name}`; pics[p] = im.data; return `<draw:page draw:name="Slide ${i + 1}" draw:master-page-name="Default"><draw:frame draw:layer="layout" svg:x="0cm" svg:y="0cm" svg:width="${wcm}cm" svg:height="${hcm.toFixed(2)}cm"><draw:image xlink:href="${p}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame></draw:page>` })
  const content = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-content ${NS} office:version="1.3"><office:body><office:presentation>${pages.join('')}</office:presentation></office:body></office:document-content>`
  const styles = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-styles ${NS} office:version="1.3"><office:styles/><office:automatic-styles><style:page-layout style:name="PM1"><style:page-layout-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:margin-left="0cm" fo:margin-right="0cm" fo:page-width="${wcm}cm" fo:page-height="${hcm.toFixed(2)}cm" style:print-orientation="${size.w >= size.h ? 'landscape' : 'portrait'}"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Default" style:page-layout-name="PM1"/></office:master-styles></office:document-styles>`
  return odfZip('application/vnd.oasis.opendocument.presentation', content, styles, pics, title)
}
