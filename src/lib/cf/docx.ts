/* Merge DOCX files at the XML level: the first file gives styles, page setup, headers and footers; the body of
 * every other file is appended (after an optional page break) with its images, links and charts carried over. */
import JSZip from 'jszip'

const relRe = /<Relationship\b[^>]*\/>/g
const at = (tag: string, n: string) => tag.match(new RegExp(`\\b${n}="([^"]*)"`))?.[1] ?? ''
const CT: Record<string, string> = { png: 'image/png', jpeg: 'image/jpeg', jpg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', tiff: 'image/tiff', tif: 'image/tiff', emf: 'image/x-emf', wmf: 'image/x-wmf', svg: 'image/svg+xml', webp: 'image/webp' }
const COPY_TYPES = /\/(image|hyperlink|chart|oleObject|package|diagramData|diagramLayout|diagramColors|diagramQuickStyle|diagramDrawing)$/

export interface MergeOpts { pageBreak: boolean; sectionBreaks: boolean; titles: boolean }
export async function mergeDocx(files: { name: string; data: ArrayBuffer }[], o: MergeOpts, onProgress?: (p: number) => void): Promise<Blob> {
  if (files.length < 2) throw new Error('Add at least two Word files.')
  const base = await JSZip.loadAsync(files[0].data)
  let doc = await base.file('word/document.xml')?.async('string')
  if (!doc) throw new Error(`${files[0].name} is not a Word document (.docx).`)
  let rels = (await base.file('word/_rels/document.xml.rels')?.async('string')) ?? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
  let types = (await base.file('[Content_Types].xml')!.async('string'))
  const bodyEnd = doc.lastIndexOf('<w:sectPr')
  const closeBody = doc.lastIndexOf('</w:body>')
  const insertAt = bodyEnd > 0 && bodyEnd < closeBody ? bodyEnd : closeBody
  let extra = ''
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  for (let i = 1; i < files.length; i++) {
    const z = await JSZip.loadAsync(files[i].data)
    const d = await z.file('word/document.xml')?.async('string')
    if (!d) throw new Error(`${files[i].name} is not a Word document (.docx).`)
    const r = (await z.file('word/_rels/document.xml.rels')?.async('string')) ?? ''
    let body = d.slice(d.indexOf('>', d.indexOf('<w:body')) + 1, d.lastIndexOf('</w:body>'))
    // keep the section settings of each part only when asked; otherwise drop the final sectPr
    const last = body.lastIndexOf('<w:sectPr')
    const sect = last >= 0 ? body.slice(last, body.indexOf('</w:sectPr>', last) + 11) : ''
    if (last >= 0) body = body.slice(0, last) + body.slice(last + sect.length)
    const map = new Map<string, string>()
    for (const tag of r.match(relRe) ?? []) {
      const id = at(tag, 'Id'), type = at(tag, 'Type'), target = at(tag, 'Target'), mode = at(tag, 'TargetMode')
      if (!COPY_TYPES.test(type)) continue
      const nid = `rIdM${i}x${id.replace(/\W/g, '')}`
      let ntarget = target
      if (mode !== 'External') {
        const src = 'word/' + target.replace(/^\.?\//, '')
        const f = z.file(src); if (!f) continue
        const ext = target.split('.').pop()!.toLowerCase()
        ntarget = target.replace(/([^/]+)$/, `m${i}_$1`)
        base.file('word/' + ntarget.replace(/^\.?\//, ''), await f.async('uint8array'))
        if (CT[ext] && !new RegExp(`Extension="${ext}"`, 'i').test(types)) types = types.replace('</Types>', `<Default Extension="${ext}" ContentType="${CT[ext]}"/></Types>`)
        if (/\/chart$/.test(type)) { types = types.replace('</Types>', `<Override PartName="/word/${ntarget.replace(/^\.?\//, '')}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`); const cr = z.file(src.replace(/([^/]+)$/, '_rels/$1.rels')); if (cr) base.file(('word/' + ntarget.replace(/^\.?\//, '')).replace(/([^/]+)$/, '_rels/$1.rels'), await cr.async('uint8array')) }
      }
      map.set(id, nid)
      rels = rels.replace('</Relationships>', `<Relationship Id="${nid}" Type="${type}" Target="${ntarget}"${mode ? ` TargetMode="${mode}"` : ''}/></Relationships>`)
    }
    body = body.replace(/\b(r:embed|r:id|r:link|r:dm|r:lo|r:qs|r:cs)="([^"]+)"/g, (m, k, id) => (map.has(id) ? `${k}="${map.get(id)}"` : m))
    // drop references we could not carry (comments, footnotes) so Word does not report the file as damaged
    body = body.replace(/<w:commentRangeStart\b[^>]*\/>|<w:commentRangeEnd\b[^>]*\/>|<w:r>(?:(?!<\/w:r>).)*?<w:commentReference\b[^>]*\/>(?:(?!<\/w:r>).)*?<\/w:r>/gs, '')
    body = body.replace(/<w:footnoteReference\b[^>]*\/>|<w:endnoteReference\b[^>]*\/>/g, '')
    if (o.sectionBreaks && sect) extra += `<w:p><w:pPr>${sect}</w:pPr></w:p>`
    else if (o.pageBreak) extra += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
    if (o.titles) extra += `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t xml:space="preserve">${esc(files[i].name.replace(/\.docx$/i, ''))}</w:t></w:r></w:p>`
    extra += body
    onProgress?.(i / (files.length - 1))
  }
  if (o.titles) doc = doc.replace(/(<w:body>)/, `$1<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t xml:space="preserve">${esc(files[0].name.replace(/\.docx$/i, ''))}</w:t></w:r></w:p>`)
  const at2 = o.titles ? doc.lastIndexOf('<w:sectPr') > 0 && doc.lastIndexOf('<w:sectPr') < doc.lastIndexOf('</w:body>') ? doc.lastIndexOf('<w:sectPr') : doc.lastIndexOf('</w:body>') : insertAt
  doc = doc.slice(0, at2) + extra + doc.slice(at2)
  base.file('word/document.xml', doc)
  base.file('word/_rels/document.xml.rels', rels)
  base.file('[Content_Types].xml', types)
  return base.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' })
}
