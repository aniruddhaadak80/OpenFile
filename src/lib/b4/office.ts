/* Document conversion through semantic HTML.
 * Readers: DOCX (mammoth), ODT, RTF (rtf.js), Markdown (marked), HTML, TXT, EPUB/MOBI/FB2 (book model).
 * Writers: DOCX (docx), Markdown (turndown + table rule), HTML, TXT, RTF, EPUB, PDF (html2canvas + jsPDF). */

export type DocIn = 'docx' | 'odt' | 'rtf' | 'md' | 'html' | 'txt' | 'epub'
export type DocOut = 'docx' | 'md' | 'html' | 'txt' | 'rtf' | 'pdf' | 'epub'
export const DOC_IN_ACCEPT = '.docx,.odt,.rtf,.md,.markdown,.html,.htm,.xhtml,.txt,.epub,.mobi,.azw3,.fb2'
export const DOC_OUT: { id: DocOut; label: string; ext: string; mime: string }[] = [
  { id: 'docx', label: 'Word (DOCX)', ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { id: 'pdf', label: 'PDF', ext: 'pdf', mime: 'application/pdf' },
  { id: 'md', label: 'Markdown', ext: 'md', mime: 'text/markdown' },
  { id: 'html', label: 'HTML', ext: 'html', mime: 'text/html' },
  { id: 'txt', label: 'Plain text', ext: 'txt', mime: 'text/plain' },
  { id: 'rtf', label: 'Rich Text (RTF)', ext: 'rtf', mime: 'application/rtf' },
  { id: 'epub', label: 'EPUB', ext: 'epub', mime: 'application/epub+zip' },
]

export function detectIn(name: string): DocIn | null {
  const e = name.toLowerCase().split('.').pop() || ''
  if (e === 'docx') return 'docx'
  if (e === 'odt') return 'odt'
  if (e === 'rtf') return 'rtf'
  if (e === 'md' || e === 'markdown') return 'md'
  if (e === 'html' || e === 'htm' || e === 'xhtml') return 'html'
  if (e === 'txt') return 'txt'
  if (e === 'epub' || e === 'mobi' || e === 'azw3' || e === 'fb2') return 'epub'
  return null
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const textToHtml = (t: string) => t.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, '<br/>')}</p>`).join('\n')

export async function markdownToHtml(md: string): Promise<string> {
  const { marked } = await import('marked')
  return marked.parse(md, { gfm: true, breaks: false }) as Promise<string>
}

/** Read any supported document into an HTML body fragment. */
export async function toHtml(file: File, onStatus?: (s: string) => void): Promise<{ html: string; title: string; warnings: string[] }> {
  const kind = detectIn(file.name)
  const title = file.name.replace(/\.[^.]+$/, '')
  const warnings: string[] = []
  switch (kind) {
    case 'docx': {
      const mammoth = await import('mammoth')
      const r = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, { styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh", "p[style-name='Quote'] => blockquote:fresh", "p[style-name='Code'] => pre:fresh"] })
      r.messages.filter((m: any) => m.type === 'warning').slice(0, 3).forEach((m: any) => warnings.push(m.message))
      return { html: r.value, title, warnings }
    }
    case 'odt': { const { odtToHtml } = await import('./odt'); return { html: await odtToHtml(file), title, warnings } }
    case 'rtf': { const { rtfToHtml } = await import('./rtf'); return { html: await rtfToHtml(await file.arrayBuffer()), title, warnings } }
    case 'md': return { html: await markdownToHtml(await file.text()), title, warnings }
    case 'html': {
      const { readTextFile } = await import('./text')
      const doc = new DOMParser().parseFromString((await readTextFile(file)).text, 'text/html')
      doc.querySelectorAll('script,style,link,iframe,object,embed,noscript').forEach((n) => n.remove())
      return { html: doc.body.innerHTML, title: doc.title || title, warnings }
    }
    case 'txt': { const { readTextFile } = await import('./text'); return { html: textToHtml((await readTextFile(file)).text), title, warnings } }
    case 'epub': {
      onStatus?.('Reading book')
      const { loadBook } = await import('./book')
      const b = await loadBook(file)
      const urls = new Map<string, string>()
      for (const [n, blob] of b.images) urls.set('images/' + n, await new Promise<string>((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result)); fr.readAsDataURL(blob) }))
      return { html: b.chapters.map((c) => c.html.replace(/src="(images\/[^"]+)"/g, (m, p) => (urls.has(p) ? `src="${urls.get(p)}"` : m))).join('\n<hr/>\n'), title: b.title, warnings }
    }
  }
  throw new Error('This file type is not supported. Use DOCX, ODT, RTF, Markdown, HTML, TXT or EPUB.')
}

export async function htmlToMarkdown(html: string): Promise<string> {
  const Turndown = (await import('turndown')).default
  const td = new Turndown({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' })
  const cell = (c: Element) => (c.textContent ?? '').replace(/\s+/g, ' ').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').trim()
  td.addRule('table', {
    filter: 'table',
    replacement: (_c: string, node: any) => {
      const rows = Array.from((node as HTMLTableElement).querySelectorAll('tr')).map((r) => Array.from(r.children).map(cell))
      if (!rows.length) return ''
      const w = Math.max(...rows.map((r) => r.length))
      const pad = (r: string[]) => [...r, ...Array(w - r.length).fill('')]
      const [head, ...body] = rows
      return '\n\n' + [pad(head), Array(w).fill('---'), ...body.map(pad)].map((r) => `| ${r.join(' | ')} |`).join('\n') + '\n\n'
    },
  })
  td.addRule('strike', { filter: ['del', 's', 'strike'] as any, replacement: (c: string) => `~~${c}~~` })
  td.remove(['script', 'style'] as any)
  return td.turndown(html).replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/** HTML -> RTF (headings, paragraphs, bold/italic/underline, lists, line breaks, simple tables). Pure DOM walk. */
export function htmlToRtf(html: string, title = ''): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const enc = (s: string) => Array.from(s).map((ch) => { const c = ch.codePointAt(0)!; if (ch === '\\' || ch === '{' || ch === '}') return '\\' + ch; if (c < 128) return ch; if (c > 0xffff) { const hi = Math.floor((c - 0x10000) / 0x400) + 0xd800, lo = ((c - 0x10000) % 0x400) + 0xdc00; return `\\u${hi - 65536}?\\u${lo - 65536}?` } return `\\u${c > 32767 ? c - 65536 : c}?` }).join('')
  const inline = (n: Node): string => Array.from(n.childNodes).map((c) => {
    if (c.nodeType === 3) return enc((c.textContent ?? '').replace(/\s+/g, ' '))
    if (c.nodeType !== 1) return ''
    const t = (c as Element).tagName.toLowerCase()
    const inner = inline(c)
    if (t === 'b' || t === 'strong') return `{\\b ${inner}}`
    if (t === 'i' || t === 'em') return `{\\i ${inner}}`
    if (t === 'u') return `{\\ul ${inner}}`
    if (t === 's' || t === 'del') return `{\\strike ${inner}}`
    if (t === 'code') return `{\\f1 ${inner}}`
    if (t === 'br') return '\\line '
    if (t === 'a') { const h = (c as Element).getAttribute('href'); return h && /^https?:/.test(h) ? `{\\field{\\*\\fldinst HYPERLINK "${h}"}{\\fldrslt {\\ul\\cf1 ${inner}}}}` : inner }
    return inner
  }).join('')
  const SIZES: Record<string, number> = { h1: 40, h2: 32, h3: 28, h4: 24, h5: 22, h6: 22 }
  const block = (el: Element, depth = 0): string => Array.from(el.childNodes).map((c) => {
    if (c.nodeType === 3) { const t = (c.textContent ?? '').trim(); return t ? `\\pard ${enc(t)}\\par\n` : '' }
    if (c.nodeType !== 1) return ''
    const e = c as Element, t = e.tagName.toLowerCase()
    if (SIZES[t]) return `\\pard\\sb240\\sa120\\b\\fs${SIZES[t]} ${inline(e)}\\b0\\fs22\\par\n`
    if (t === 'p') return `\\pard\\sa160 ${inline(e)}\\par\n`
    if (t === 'pre') return `\\pard\\f1\\fs20 ${enc(e.textContent ?? '').replace(/\n/g, '\\line ')}\\f0\\fs22\\par\n`
    if (t === 'blockquote') return `\\pard\\li720\\i ${inline(e)}\\i0\\par\n`
    if (t === 'hr') return '\\pard\\brdrb\\brdrs\\brdrw10\\brsp20 \\par\n'
    if (t === 'ul' || t === 'ol') return Array.from(e.children).filter((x) => x.tagName.toLowerCase() === 'li').map((li, i) => {
      const nested = Array.from(li.children).filter((x) => /^(ul|ol)$/i.test(x.tagName))
      const clone = li.cloneNode(true) as Element; clone.querySelectorAll('ul,ol').forEach((x) => x.remove())
      return `\\pard\\li${360 * (depth + 1) + 360}\\fi-360 ${t === 'ol' ? `${i + 1}.` : '\\bullet'}\\tab ${inline(clone)}\\par\n` + nested.map((n) => block(Object.assign(doc.createElement('div'), { innerHTML: n.outerHTML }), depth + 1)).join('')
    }).join('')
    if (t === 'table') return Array.from(e.querySelectorAll('tr')).map((tr) => {
      const cells = Array.from(tr.children); const w = Math.floor(9000 / Math.max(1, cells.length))
      return `\\trowd\\trgaph108${cells.map((_, i) => `\\clbrdrt\\brdrs\\clbrdrl\\brdrs\\clbrdrb\\brdrs\\clbrdrr\\brdrs\\cellx${w * (i + 1)}`).join('')}\n${cells.map((cc) => `\\pard\\intbl ${cc.tagName.toLowerCase() === 'th' ? '\\b ' : ''}${inline(cc)}${cc.tagName.toLowerCase() === 'th' ? '\\b0' : ''}\\cell`).join('')}\\row\n`
    }).join('') + '\\pard\\par\n'
    if (t === 'img' || t === 'script' || t === 'style') return ''
    if (/^(div|section|article|header|footer|main|body|figure|nav|aside|li|dl|dd|dt|center|span|a|b|i|strong|em)$/.test(t)) return e.querySelector('p,div,h1,h2,h3,h4,ul,ol,table,pre,blockquote') ? block(e, depth) : `\\pard\\sa160 ${inline(e)}\\par\n`
    return block(e, depth)
  }).join('')
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1{\\fonttbl{\\f0\\fswiss Calibri;}{\\f1\\fmodern Consolas;}}{\\colortbl;\\red5\\green99\\blue193;}{\\info{\\title ${enc(title)}}{\\doccomm OpenFile}}\\viewkind4\\f0\\fs22\n${block(doc.body)}}`
}

export const DOC_CSS = `body{font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:11pt;line-height:1.5;color:#111;background:#fff}h1{font-size:22pt}h2{font-size:17pt}h3{font-size:13pt}table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eee}pre{background:#f5f5f5;padding:8px;border-radius:4px;white-space:pre-wrap;font-family:Consolas,monospace;font-size:9.5pt}code{font-family:Consolas,monospace;background:#f2f2f2;padding:0 2px}blockquote{border-left:3px solid #ccc;margin:8px 0;padding:2px 12px;color:#444}img{max-width:100%;height:auto}`
export const fullHtml = (body: string, title: string, css = DOC_CSS) => `<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${css}</style></head><body>\n${body}\n</body></html>\n`

export async function fromHtml(html: string, out: DocOut, title: string, o: { onProgress?: (p: number) => void; pageWidth?: number; pageHeight?: number; margin?: number } = {}): Promise<Blob> {
  const mime = DOC_OUT.find((x) => x.id === out)!.mime
  switch (out) {
    case 'docx': { const { htmlToDocx } = await import('./htmlDocx'); return htmlToDocx(html, { title }) }
    case 'md': return new Blob([await htmlToMarkdown(html)], { type: mime })
    case 'html': return new Blob([fullHtml(html, title)], { type: mime })
    case 'txt': { const { htmlToPlain } = await import('./book'); return new Blob([htmlToPlain(html) + '\n'], { type: mime }) }
    case 'rtf': return new Blob([htmlToRtf(html, title)], { type: mime })
    case 'epub': { const { htmlToBook, writeEpub } = await import('./book'); return writeEpub(await htmlToBook(html, title)) }
    case 'pdf': {
      const { renderHtmlToPdf, addPageNumbers, pdfToBlob } = await import('@/tools/convert/_conv/htmlPdf')
      const r = await renderHtmlToPdf(fullHtml(html, title), { pageWidth: o.pageWidth ?? 595.28, pageHeight: o.pageHeight ?? 841.89, margin: o.margin ?? 56, scale: 2, quality: 0.92, onProgress: o.onProgress })
      if (r.pages > 1) addPageNumbers(r.pdf)
      return pdfToBlob(r.pdf)
    }
  }
}
