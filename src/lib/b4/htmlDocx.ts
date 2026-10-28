/* HTML -> DOCX (docx 9, MIT). Handles headings, paragraphs, bold/italic/underline/strike, code, links,
 * bullet and numbered lists, tables, block quotes, preformatted code, images and page breaks.
 * Used by markdown-to-docx, document-converter and ebook-converter. */

type Docx = typeof import('docx')

export interface HtmlDocxOpts { title?: string; author?: string; font?: string; size?: number; resolveImage?: (src: string) => Promise<Blob | null> }

const HEAD = ['HEADING_1', 'HEADING_2', 'HEADING_3', 'HEADING_4', 'HEADING_5', 'HEADING_6'] as const

async function imgData(src: string, resolve?: (s: string) => Promise<Blob | null>): Promise<{ data: Uint8Array; type: 'png' | 'jpg' | 'gif' | 'bmp'; w: number; h: number } | null> {
  try {
    let blob = resolve ? await resolve(src) : null
    if (!blob) { const r = await fetch(src); if (!r.ok) return null; blob = await r.blob() }
    let type: 'png' | 'jpg' | 'gif' | 'bmp' = /jpe?g/.test(blob.type) ? 'jpg' : /gif/.test(blob.type) ? 'gif' : /bmp/.test(blob.type) ? 'bmp' : 'png'
    const bmp = await createImageBitmap(blob).catch(() => null)
    if (!bmp) return null
    let w = bmp.width, h = bmp.height
    // re-encode formats Word does not like (webp, svg, avif) to PNG
    if (!/png|jpe?g|gif|bmp/.test(blob.type)) {
      const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.drawImage(bmp, 0, 0)
      blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png')); type = 'png'
    }
    const max = 600; if (w > max) { h = Math.round((h * max) / w); w = max }
    return { data: new Uint8Array(await blob.arrayBuffer()), type, w, h }
  } catch { return null }
}

interface Fmt { bold?: boolean; italics?: boolean; underline?: boolean; strike?: boolean; code?: boolean; sup?: boolean; sub?: boolean; link?: string; color?: string }

export async function htmlToDocx(html: string, o: HtmlDocxOpts = {}): Promise<Blob> {
  const d: Docx = await import('docx')
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const font = o.font ?? 'Calibri', size = (o.size ?? 11) * 2

  const runsOf = async (node: Node, f: Fmt): Promise<any[]> => {
    const out: any[] = []
    for (const n of Array.from(node.childNodes)) {
      if (n.nodeType === 3) {
        const t = (n.textContent ?? '').replace(/\s+/g, ' ')
        if (!t) continue
        const run = new d.TextRun({ text: t, bold: f.bold, italics: f.italics, underline: f.underline || f.link ? {} : undefined, strike: f.strike, font: f.code ? 'Consolas' : undefined, superScript: f.sup, subScript: f.sub, color: f.link ? '0563C1' : f.color, shading: f.code ? { type: d.ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' } : undefined })
        out.push(run)
        continue
      }
      if (n.nodeType !== 1) continue
      const el = n as HTMLElement, tag = el.tagName.toLowerCase()
      if (tag === 'br') { out.push(new d.TextRun({ text: '', break: 1 })); continue }
      if (tag === 'img') { const im = await imgData(el.getAttribute('src') || '', o.resolveImage); if (im) out.push(new d.ImageRun({ type: im.type, data: im.data, transformation: { width: im.w, height: im.h } } as any)); continue }
      if (tag === 'a' && el.getAttribute('href') && /^(https?:|mailto:)/.test(el.getAttribute('href')!)) {
        const kids = await runsOf(el, { ...f, link: el.getAttribute('href')! })
        out.push(new d.ExternalHyperlink({ link: el.getAttribute('href')!, children: kids }))
        continue
      }
      const nf: Fmt = { ...f }
      if (tag === 'b' || tag === 'strong') nf.bold = true
      if (tag === 'i' || tag === 'em' || tag === 'cite') nf.italics = true
      if (tag === 'u' || tag === 'ins') nf.underline = true
      if (tag === 's' || tag === 'del' || tag === 'strike') nf.strike = true
      if (tag === 'code' || tag === 'kbd' || tag === 'tt') nf.code = true
      if (tag === 'sup') nf.sup = true
      if (tag === 'sub') nf.sub = true
      const st = el.getAttribute('style') || ''
      if (/font-weight:\s*(bold|[6-9]00)/.test(st)) nf.bold = true
      if (/font-style:\s*italic/.test(st)) nf.italics = true
      out.push(...(await runsOf(el, nf)))
    }
    return out
  }

  const BLOCK = /^(p|div|h[1-6]|ul|ol|li|table|blockquote|pre|hr|section|article|header|footer|main|aside|figure|figcaption|nav|dl|dt|dd|body|center)$/
  const hasBlockKids = (el: Element) => Array.from(el.children).some((c) => BLOCK.test(c.tagName.toLowerCase()))

  const blocks = async (root: Element, ctx: { list?: { ordered: boolean; level: number; ref: string }; quote?: boolean }): Promise<any[]> => {
    const out: any[] = []
    let inline: Node[] = []
    const flush = async () => {
      if (!inline.length) return
      const wrap = doc.createElement('span'); inline.forEach((n) => wrap.appendChild(n.cloneNode(true))); inline = []
      if (!(wrap.textContent ?? '').trim() && !wrap.querySelector('img')) return
      out.push(new d.Paragraph({ children: await runsOf(wrap, {}), indent: ctx.quote ? { left: 720 } : undefined }))
    }
    for (const n of Array.from(root.childNodes)) {
      const el = n as HTMLElement
      const tag = n.nodeType === 1 ? el.tagName.toLowerCase() : ''
      if (!tag || !BLOCK.test(tag)) { if (n.nodeType === 1 && /^(script|style|head|title|meta|link)$/.test(tag)) continue; inline.push(n); continue }
      await flush()
      if (/^h[1-6]$/.test(tag)) { out.push(new d.Paragraph({ heading: d.HeadingLevel[HEAD[+tag[1] - 1]], children: await runsOf(el, {}) })); continue }
      if (tag === 'hr') { out.push(new d.Paragraph({ border: { bottom: { color: 'BFBFBF', space: 1, style: d.BorderStyle.SINGLE, size: 6 } }, children: [] })); continue }
      if (tag === 'pre') {
        const lines = (el.textContent ?? '').replace(/\n$/, '').split('\n')
        out.push(new d.Paragraph({ shading: { type: d.ShadingType.CLEAR, fill: 'F5F5F5', color: 'auto' }, children: lines.flatMap((l, i) => [new d.TextRun({ text: l, font: 'Consolas', size: size - 2, break: i ? 1 : undefined })]) }))
        continue
      }
      if (tag === 'ul' || tag === 'ol') {
        const level = ctx.list ? Math.min(8, ctx.list.level + 1) : 0
        const ref = tag === 'ol' ? (ctx.list?.ordered && ctx.list.level >= 0 ? ctx.list.ref : 'ol-' + Math.random().toString(36).slice(2, 7)) : 'ul'
        if (tag === 'ol') usedOl.add(ref)
        for (const li of Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'li')) {
          const inl = doc.createElement('span'); const nested: Element[] = []
          Array.from(li.childNodes).forEach((c) => { const t = c.nodeType === 1 ? (c as Element).tagName.toLowerCase() : ''; if (t === 'ul' || t === 'ol') nested.push(c as Element); else if (t === 'p') { Array.from(c.childNodes).forEach((x) => inl.appendChild(x.cloneNode(true))); inl.appendChild(doc.createTextNode(' ')) } else inl.appendChild(c.cloneNode(true)) })
          out.push(new d.Paragraph({ children: await runsOf(inl, {}), numbering: { reference: tag === 'ol' ? ref : 'ul', level } }))
          for (const ne of nested) { const box = doc.createElement('div'); box.appendChild(ne.cloneNode(true)); out.push(...(await blocks(box, { ...ctx, list: { ordered: ne.tagName.toLowerCase() === 'ol', level, ref } }))) }
        }
        continue
      }
      if (tag === 'table') {
        const rows = Array.from(el.querySelectorAll('tr'))
        if (!rows.length) continue
        const cols = Math.max(...rows.map((r) => r.children.length))
        const trs = await Promise.all(rows.map(async (r, ri) => new d.TableRow({
          tableHeader: ri === 0 && !!r.querySelector('th'),
          children: await Promise.all(Array.from({ length: cols }, async (_, ci) => {
            const c = r.children[ci] as HTMLElement | undefined
            const isTh = c?.tagName.toLowerCase() === 'th'
            return new d.TableCell({ children: [new d.Paragraph({ children: c ? await runsOf(c, { bold: isTh }) : [] })], shading: isTh ? { type: d.ShadingType.CLEAR, fill: 'EDEDED', color: 'auto' } : undefined })
          })),
        })))
        out.push(new d.Table({ rows: trs, width: { size: 100, type: d.WidthType.PERCENTAGE } }), new d.Paragraph({ children: [] }))
        continue
      }
      if (tag === 'blockquote') { out.push(...(await blocks(el, { ...ctx, quote: true }))); continue }
      if (hasBlockKids(el) || /^(div|section|article|header|footer|main|aside|figure|nav|body|dl|center)$/.test(tag)) {
        const before = /page-break-before:\s*always|break-before:\s*page/.test(el.getAttribute('style') || '')
        if (before) out.push(new d.Paragraph({ children: [new d.PageBreak()] }))
        out.push(...(await blocks(el, ctx))); continue
      }
      const align = /text-align:\s*center/.test(el.getAttribute('style') || '') || tag === 'figcaption' ? d.AlignmentType.CENTER : undefined
      out.push(new d.Paragraph({ children: await runsOf(el, tag === 'dt' ? { bold: true } : {}), indent: ctx.quote || tag === 'dd' ? { left: 720 } : undefined, alignment: align }))
    }
    await flush()
    return out
  }

  const usedOl = new Set<string>()
  const children = await blocks(doc.body, {})
  const levels = (fmt: any, texts: (i: number) => string) => Array.from({ length: 9 }, (_, i) => ({ level: i, format: fmt, text: texts(i), alignment: d.AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 * (i + 1), hanging: 360 } } } }))
  const document = new d.Document({
    title: o.title, creator: o.author || 'OpenFile',
    styles: { default: { document: { run: { font, size } } } },
    numbering: { config: [
      { reference: 'ul', levels: levels(d.LevelFormat.BULLET, (i) => ['\u2022', '\u25E6', '\u25AA'][i % 3]) },
      ...[...usedOl].map((ref) => ({ reference: ref, levels: levels(d.LevelFormat.DECIMAL, (i) => `%${i + 1}.`) })),
    ] },
    sections: [{ children: children.length ? children : [new d.Paragraph({ children: [] })] }],
  })
  return d.Packer.toBlob(document)
}
