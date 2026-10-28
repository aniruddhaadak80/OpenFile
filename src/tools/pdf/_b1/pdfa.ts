/* PDF/A helpers: a tiny sRGB ICC profile, XMP writer, conversion (best effort) and a heuristic validator. */
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFHexString, PDFString, PDFStream, PDFNumber, PDFRef } from 'pdf-lib'
import { open, assertNotEncrypted, allObjects, dictOf, arrOf, nameOf, numOf, textOf, lookup, inspectStructure, sanitize, listAnnotations, streamBytes, type Bytes } from './core'

export type PdfaLevel = '1b' | '2b' | '3b'
export interface Finding { level: 'pass' | 'warn' | 'fail' | 'info'; title: string; detail?: string; fix?: string }

/* ---------------------------------------------------------------- ICC profile (ICC v2, display class, sRGB primaries, gamma 2.2 curves) */
export function buildSrgbIcc(): Uint8Array {
  const enc = new TextEncoder()
  const s15 = (v: number) => Math.round(v * 65536) | 0
  const xyz = (x: number, y: number, z: number) => { const b = new Uint8Array(20); const d = new DataView(b.buffer); b.set(enc.encode('XYZ '), 0); d.setInt32(8, s15(x)); d.setInt32(12, s15(y)); d.setInt32(16, s15(z)); return b }
  const curv = (gamma: number) => { const b = new Uint8Array(14); const d = new DataView(b.buffer); b.set(enc.encode('curv'), 0); d.setUint32(8, 1); d.setUint16(12, Math.round(gamma * 256)); return b }
  const desc = (text: string) => {
    const ascii = enc.encode(text + '\0')
    const b = new Uint8Array(12 + ascii.length + 4 + 4 + 2 + 1 + 67)
    const d = new DataView(b.buffer); b.set(enc.encode('desc'), 0); d.setUint32(8, ascii.length); b.set(ascii, 12)
    return b
  }
  const text = (t: string) => { const a = enc.encode(t + '\0'); const b = new Uint8Array(8 + a.length); b.set(enc.encode('text'), 0); b.set(a, 8); return b }
  const tags: [string, Uint8Array][] = [
    ['desc', desc('sRGB IEC61966-2.1')], ['cprt', text('No copyright, use freely')], ['wtpt', xyz(0.9642, 1.0, 0.8249)],
    ['rXYZ', xyz(0.4361, 0.2225, 0.0139)], ['gXYZ', xyz(0.3851, 0.7169, 0.0971)], ['bXYZ', xyz(0.1431, 0.0606, 0.7141)],
    ['rTRC', curv(2.2)], ['gTRC', curv(2.2)], ['bTRC', curv(2.2)],
  ]
  const pad4 = (n: number) => (n + 3) & ~3
  let offset = 128 + 4 + tags.length * 12
  const table: [string, number, number][] = []
  const data: Uint8Array[] = []
  for (const [sig, b] of tags) { table.push([sig, offset, b.length]); data.push(b); offset = pad4(offset + b.length) }
  const size = offset
  const out = new Uint8Array(size); const dv = new DataView(out.buffer)
  dv.setUint32(0, size); out.set(enc.encode('none'), 4); dv.setUint32(8, 0x02100000)
  out.set(enc.encode('mntr'), 12); out.set(enc.encode('RGB '), 16); out.set(enc.encode('XYZ '), 20)
  dv.setUint16(24, 2026); dv.setUint16(26, 1); dv.setUint16(28, 1)
  out.set(enc.encode('acsp'), 36); out.set(enc.encode('APPL'), 40)
  dv.setInt32(68, s15(0.9642)); dv.setInt32(72, s15(1.0)); dv.setInt32(76, s15(0.8249))
  out.set(enc.encode('OPFL'), 80)
  dv.setUint32(128, tags.length)
  table.forEach(([sig, off, len], i) => { out.set(enc.encode(sig), 132 + i * 12); dv.setUint32(136 + i * 12, off); dv.setUint32(140 + i * 12, len) })
  table.forEach(([, off], i) => out.set(data[i], off))
  return out
}

/* ---------------------------------------------------------------- XMP */
const x = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export function isoDate(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  const tz = -d.getTimezoneOffset(); const sign = tz >= 0 ? '+' : '-'; const az = Math.abs(tz)
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sign}${p(Math.floor(az / 60))}:${p(az % 60)}`
}
export interface XmpOpts { part: number; conformance: string; title?: string; author?: string; subject?: string; keywords?: string; producer: string; creatorTool?: string; created: Date; modified: Date; extraSchemas?: string; extraDescriptions?: string }
export function buildXmp(o: XmpOpts) {
  const li = (v?: string) => (v ? `<rdf:Alt><rdf:li xml:lang="x-default">${x(v)}</rdf:li></rdf:Alt>` : '')
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
<pdfaid:part>${o.part}</pdfaid:part>
<pdfaid:conformance>${o.conformance.toUpperCase()}</pdfaid:conformance>
</rdf:Description>
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:format>application/pdf</dc:format>
${o.title ? `<dc:title>${li(o.title)}</dc:title>` : ''}
${o.author ? `<dc:creator><rdf:Seq><rdf:li>${x(o.author)}</rdf:li></rdf:Seq></dc:creator>` : ''}
${o.subject ? `<dc:description>${li(o.subject)}</dc:description>` : ''}
</rdf:Description>
<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
<xmp:CreateDate>${isoDate(o.created)}</xmp:CreateDate>
<xmp:ModifyDate>${isoDate(o.modified)}</xmp:ModifyDate>
<xmp:MetadataDate>${isoDate(o.modified)}</xmp:MetadataDate>
${o.creatorTool ? `<xmp:CreatorTool>${x(o.creatorTool)}</xmp:CreatorTool>` : ''}
</rdf:Description>
<rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
<pdf:Producer>${x(o.producer)}</pdf:Producer>
${o.keywords ? `<pdf:Keywords>${x(o.keywords)}</pdf:Keywords>` : ''}
</rdf:Description>
${o.extraSchemas ?? ''}${o.extraDescriptions ?? ''}
</rdf:RDF>
</x:xmpmeta>
${' '.repeat(1500)}
<?xpacket end="w"?>`
}

/** Attach an sRGB output intent (GTS_PDFA1) if the document has none. */
export function ensureOutputIntent(doc: PDFDocument) {
  const cat = doc.catalog
  const existing = arrOf(doc, cat.get(PDFName.of('OutputIntents')))
  if (existing && existing.size()) return false
  const ctx = doc.context
  const icc = ctx.register(ctx.flateStream(buildSrgbIcc(), { N: 3 }))
  const oi = ctx.obj({ Type: 'OutputIntent', S: 'GTS_PDFA1', OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'), Info: PDFString.of('sRGB IEC61966-2.1'), RegistryName: PDFString.of('http://www.color.org'), DestOutputProfile: icc })
  cat.set(PDFName.of('OutputIntents'), ctx.obj([ctx.register(oi)]))
  return true
}

function setMetadata(doc: PDFDocument, xmp: string) {
  const ctx = doc.context
  const bytes = new TextEncoder().encode(xmp)
  const s = ctx.stream(bytes, { Type: 'Metadata', Subtype: 'XML', Length: bytes.length })
  doc.catalog.set(PDFName.of('Metadata'), ctx.register(s))
}
function randomId() { const b = new Uint8Array(16); globalThis.crypto.getRandomValues(b); return [...b].map((v) => v.toString(16).padStart(2, '0')).join('') }
export function ensureFileId(doc: PDFDocument) {
  const id = PDFHexString.of(randomId())
  doc.context.trailerInfo.ID = doc.context.obj([id, id]) as any
}

export interface ConvertReport { fixed: string[]; remaining: Finding[] }
export async function convertToPdfa(bytes: Bytes, level: PdfaLevel, meta: { title?: string; author?: string; subject?: string; keywords?: string } = {}, extra?: { xmpSchemas?: string; xmpDescriptions?: string; keepAttachments?: boolean }): Promise<{ bytes: Uint8Array; report: ConvertReport }> {
  const fixed: string[] = []
  // 1. drop scripts, risky actions and (except PDF/A-3) embedded files
  const keepFiles = level === '3b' || !!extra?.keepAttachments
  const s = await sanitize(bytes, { javascript: true, actions: true, embeddedFiles: !keepFiles, links: false, annotations: false, metadata: false, forms: false, layers: false, thumbnails: false })
  const removed = Object.entries(s.report)
  if (removed.length) fixed.push('Removed ' + removed.map(([k, n]) => `${k.toLowerCase()} (${n})`).join(', '))
  const doc = await open(s.bytes); assertNotEncrypted(doc)
  const cat = doc.catalog
  const part = Number(level[0])
  // 2. forms: no XFA, no NeedAppearances
  const af = dictOf(doc, cat.get(PDFName.of('AcroForm')))
  if (af) {
    if (af.get(PDFName.of('XFA'))) { af.delete(PDFName.of('XFA')); fixed.push('Removed XFA form data') }
    if (af.get(PDFName.of('NeedAppearances'))) { af.delete(PDFName.of('NeedAppearances')); try { doc.getForm().updateFieldAppearances() } catch { /* */ } fixed.push('Built form field appearances') }
  }
  // 3. layers are not allowed in PDF/A-1
  if (part === 1 && cat.get(PDFName.of('OCProperties'))) { cat.delete(PDFName.of('OCProperties')); fixed.push('Removed layer settings (not allowed in PDF/A-1)') }
  // 4. annotations must print and must not be hidden
  let annFixed = 0
  for (const p of doc.getPages()) {
    const annots = arrOf(doc, p.node.get(PDFName.of('Annots'))); if (!annots) continue
    for (let i = 0; i < annots.size(); i++) {
      const d = dictOf(doc, annots.get(i)); if (!d) continue
      const st = nameOf(doc, d.get(PDFName.of('Subtype')))
      if (st === 'Popup') continue
      const f = numOf(doc, d.get(PDFName.of('F'))) ?? 0
      const nf = (f | 4) & ~(1 | 2 | 32)
      if (nf !== f) { d.set(PDFName.of('F'), PDFNumber.of(nf)); annFixed++ }
      if (d.get(PDFName.of('CA'))) { const ca = numOf(doc, d.get(PDFName.of('CA'))); if (part === 1 && ca !== undefined && ca < 1) { d.set(PDFName.of('CA'), PDFNumber.of(1)); annFixed++ } }
    }
  }
  if (annFixed) fixed.push(`Set ${annFixed} annotation${annFixed > 1 ? 's' : ''} to printable`)
  // 5. trailer ID, output intent, XMP mirroring the info dictionary
  ensureFileId(doc)
  if (ensureOutputIntent(doc)) fixed.push('Added an sRGB output intent (color profile)')
  const now = new Date()
  const title = meta.title ?? doc.getTitle() ?? '', author = meta.author ?? doc.getAuthor() ?? '', subject = meta.subject ?? doc.getSubject() ?? '', keywords = meta.keywords ?? doc.getKeywords() ?? ''
  const created = doc.getCreationDate() ?? now
  const creatorTool = doc.getCreator() ?? 'OpenFile'
  doc.setTitle(title || 'Untitled', { showInWindowTitleBar: !!title }); if (author) doc.setAuthor(author); if (subject) doc.setSubject(subject); if (keywords) doc.setKeywords([keywords])
  doc.setProducer('OpenFile'); doc.setCreator(creatorTool); doc.setCreationDate(created); doc.setModificationDate(now)
  // drop Info keys that XMP would need to mirror but we do not write (Trapped is allowed only as True/False)
  const infoRef = doc.context.trailerInfo.Info
  const info = infoRef ? dictOf(doc, infoRef as any) : undefined
  if (info) { const tr = nameOf(doc, info.get(PDFName.of('Trapped'))); if (tr && tr !== 'True' && tr !== 'False') info.delete(PDFName.of('Trapped')) }
  setMetadata(doc, buildXmp({ part, conformance: 'B', title: title || 'Untitled', author, subject, keywords, producer: 'OpenFile', creatorTool, created, modified: now, extraSchemas: extra?.xmpSchemas, extraDescriptions: extra?.xmpDescriptions }))
  fixed.push(`Wrote XMP metadata with the PDF/A-${part}B identification`)
  // PDF/A-1 does not allow compressed object streams
  const out = await doc.save({ useObjectStreams: part !== 1 })
  const remaining = await validatePdfa(out, level)
  return { bytes: out, report: { fixed, remaining: remaining.filter((r) => r.level === 'fail' || r.level === 'warn') } }
}

/* ---------------------------------------------------------------- heuristic validator */
export async function validatePdfa(bytes: Bytes, level?: PdfaLevel): Promise<Finding[]> {
  const doc = await open(bytes)
  const s = inspectStructure(doc, bytes)
  const out: Finding[] = []
  const claimPart = s.pdfaClaim ? Number(s.pdfaClaim[6]) : undefined
  const part = level ? Number(level[0]) : claimPart ?? 2
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 64))
  out.push(s.pdfaClaim ? { level: 'pass', title: `Declares ${s.pdfaClaim}`, detail: 'The XMP metadata carries a PDF/A identification.' } : { level: 'fail', title: 'No PDF/A identification', detail: 'The XMP metadata does not say this is a PDF/A file.', fix: 'Convert it with PDF to PDF/A.' })
  out.push(s.encrypted ? { level: 'fail', title: 'File is encrypted', fix: 'Remove the password with Unlock PDF first.' } : { level: 'pass', title: 'Not encrypted' })
  out.push(/%[\x80-\xff]{4}/.test(head) ? { level: 'pass', title: 'Binary header comment present' } : { level: 'warn', title: 'No binary comment after the header', detail: 'Some validators require four high-byte characters on the second line.' })
  out.push(doc.context.trailerInfo.ID ? { level: 'pass', title: 'File identifier present' } : { level: 'fail', title: 'No file identifier (ID) in the trailer', fix: 'Re-save with PDF to PDF/A.' })
  out.push(s.outputIntents.some((o) => o.startsWith('GTS_PDFA1')) ? { level: 'pass', title: 'Output intent present', detail: s.outputIntents.join('; ') } : { level: 'fail', title: 'No PDF/A output intent', detail: 'Device colors need a color profile in the file.', fix: 'PDF to PDF/A adds an sRGB profile.' })
  const notEmb = s.fonts.filter((f) => !f.embedded)
  out.push(notEmb.length ? { level: 'fail', title: `${notEmb.length} font${notEmb.length > 1 ? 's are' : ' is'} not embedded`, detail: notEmb.map((f) => f.name).slice(0, 12).join(', '), fix: 'Re-export from the original app with fonts embedded, or use strict mode (pages become images).' } : { level: 'pass', title: s.fonts.length ? 'All fonts are embedded' : 'No fonts used' })
  out.push(s.javascript ? { level: 'fail', title: 'Contains JavaScript', fix: 'Remove it with Sanitize PDF or PDF to PDF/A.' } : { level: 'pass', title: 'No JavaScript' })
  const bad = s.actions.filter((a) => ['Launch', 'SubmitForm', 'ImportData', 'JavaScript', 'GoToE', 'Rendition'].includes(a))
  out.push(bad.length ? { level: 'fail', title: `Forbidden actions: ${bad.join(', ')}` } : { level: 'pass', title: 'No forbidden actions' })
  if (part < 3) out.push(s.attachments ? { level: part === 1 ? 'fail' : 'warn', title: `${s.attachments} embedded file${s.attachments > 1 ? 's' : ''}`, detail: part === 1 ? 'PDF/A-1 does not allow embedded files.' : 'PDF/A-2 only allows embedded files that are PDF/A themselves.', fix: 'Remove them, or target PDF/A-3.' } : { level: 'pass', title: 'No embedded files' })
  else out.push({ level: s.attachments ? 'info' : 'pass', title: s.attachments ? `${s.attachments} embedded file${s.attachments > 1 ? 's' : ''} (allowed in PDF/A-3)` : 'No embedded files' })
  if (part === 1) out.push(s.transparency ? { level: 'fail', title: 'Uses transparency', detail: 'PDF/A-1 does not allow transparency (soft masks, opacity, blend modes).', fix: 'Target PDF/A-2b, or use strict mode.' } : { level: 'pass', title: 'No transparency' })
  if (part === 1 && s.layers) out.push({ level: 'fail', title: 'Uses layers (optional content)', fix: 'Target PDF/A-2b or remove the layers.' })
  out.push(s.xfa ? { level: 'fail', title: 'Contains an XFA form' } : { level: 'pass', title: 'No XFA forms' })
  // metadata consistency
  const xmp = s.xmp ?? ''
  if (s.xmp) {
    const infoTitle = s.info.Title, xmpTitle = xmp.match(/<dc:title>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/)?.[1]
    if (infoTitle && xmpTitle !== undefined && unesc(xmpTitle) !== infoTitle) out.push({ level: 'fail', title: 'Title differs between Info and XMP', fix: 'Re-save with PDF to PDF/A to sync metadata.' })
    if (s.info.Producer && !xmp.includes('pdf:Producer')) out.push({ level: 'fail', title: 'Producer is missing from XMP' })
    else out.push({ level: 'pass', title: 'Document info and XMP metadata line up' })
  }
  const ms = lookup(doc, doc.catalog.get(PDFName.of('Metadata')))
  if (ms instanceof PDFStream && (ms as any).dict.get(PDFName.of('Filter'))) out.push({ level: part === 1 ? 'warn' : 'info', title: 'Metadata stream is compressed', detail: 'Some PDF/A-1 checkers expect plain XMP.' })
  // annotations
  const anns = listAnnotations(doc)
  let hidden = 0
  for (const p of doc.getPages()) {
    const a = arrOf(doc, p.node.get(PDFName.of('Annots'))); if (!a) continue
    for (let i = 0; i < a.size(); i++) { const d = dictOf(doc, a.get(i)); if (!d || nameOf(doc, d.get(PDFName.of('Subtype'))) === 'Popup') continue; const f = numOf(doc, d.get(PDFName.of('F'))) ?? 0; if (!(f & 4) || f & 3 || f & 32) hidden++ }
  }
  if (anns.length) out.push(hidden ? { level: 'fail', title: `${hidden} annotation${hidden > 1 ? 's are' : ' is'} hidden or not printable`, fix: 'PDF to PDF/A sets the print flag.' } : { level: 'pass', title: 'Annotations are printable' })
  if (s.incrementalUpdates) out.push({ level: 'info', title: `${s.incrementalUpdates} incremental update${s.incrementalUpdates > 1 ? 's' : ''}`, detail: 'Allowed, but the file must stay valid after each one.' })
  if (part === 1 && /%PDF-(1\.[5-7]|2\.)/.test(head) && hasXrefStreams(bytes)) out.push({ level: 'fail', title: 'Uses compressed cross-reference streams', detail: 'PDF/A-1 is based on PDF 1.4 and does not allow them.', fix: 'Convert with PDF to PDF/A using level 1b.' })
  out.push({ level: 'info', title: 'This is a quick check, not a certified validation', detail: 'For legal archiving, confirm with a full validator. Color spaces inside images and font glyph widths are not checked here.' })
  return out
}
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
function hasXrefStreams(b: Uint8Array) { const t = new TextDecoder('latin1').decode(b.length > 8e6 ? b.subarray(b.length - 4e6) : b); return /\/Type\s*\/XRef/.test(t) || /\/Type\s*\/ObjStm/.test(t) }

/* ---------------------------------------------------------------- accessibility (PDF/UA style heuristics) */
export interface A11yInput { textPages: number; pages: number; imagesOnTextlessPages?: number }
export async function accessibilityCheck(bytes: Bytes, t: A11yInput): Promise<Finding[]> {
  const doc = await open(bytes)
  const s = inspectStructure(doc, bytes)
  const cat = doc.catalog
  const out: Finding[] = []
  out.push(t.textPages === t.pages ? { level: 'pass', title: 'All pages have real text', detail: 'Screen readers can read the content.' } : t.textPages === 0 ? { level: 'fail', title: 'No real text, only images', detail: 'This looks like a scan. Screen readers will find nothing to read.', fix: 'Run OCR PDF to add a text layer.' } : { level: 'warn', title: `${t.pages - t.textPages} of ${t.pages} pages have no text`, fix: 'Run OCR PDF on the scanned pages.' })
  out.push(s.tagged ? { level: 'pass', title: 'Document is tagged', detail: 'It has a structure tree that describes headings, paragraphs and figures.' } : { level: 'fail', title: 'Document is not tagged', detail: 'Without tags, reading order and headings are guesswork for assistive tech.', fix: 'Export again from Word, InDesign or similar with "tagged PDF" or "accessibility" turned on.' })
  out.push(s.lang ? { level: 'pass', title: `Language is set (${s.lang})` } : { level: 'fail', title: 'Document language is not set', detail: 'Screen readers need it to pick the right voice.', fix: 'Set the language in the source app before exporting.' })
  const vp = dictOf(doc, cat.get(PDFName.of('ViewerPreferences')))
  const showTitle = vp ? String(vp.get(PDFName.of('DisplayDocTitle'))) === 'true' : false
  out.push(s.info.Title ? (showTitle ? { level: 'pass', title: `Title: "${s.info.Title}"`, detail: 'And it is shown in the window bar.' } : { level: 'warn', title: `Title is set but not shown`, detail: 'The window shows the file name instead of the title.', fix: 'Turn on "Show document title" in PDF Viewer Preferences.' }) : { level: 'fail', title: 'No document title', fix: 'Add one with PDF Metadata.' })
  out.push(s.pdfuaClaim ? { level: 'pass', title: 'Declares PDF/UA conformance' } : { level: 'info', title: 'Does not declare PDF/UA', detail: 'PDF/UA is the accessibility standard. Declaring it is optional.' })
  // structure tree walk: figures with alt text, headings, tables
  const root = dictOf(doc, cat.get(PDFName.of('StructTreeRoot')))
  if (root) {
    const roleMap = dictOf(doc, root.get(PDFName.of('RoleMap')))
    const role = (n: string) => (roleMap ? nameOf(doc, roleMap.get(PDFName.of(n))) ?? n : n)
    let figures = 0, figAlt = 0, headings = 0, tables = 0, th = 0, links = 0, nodes = 0
    const hLevels: number[] = []
    const walk = (o: any, depth: number) => {
      if (depth > 60 || nodes > 50000) return
      const v = lookup(doc, o)
      if (v instanceof PDFArray) { for (let i = 0; i < v.size(); i++) walk(v.get(i), depth + 1); return }
      if (!(v instanceof PDFDict)) return
      nodes++
      const sName = nameOf(doc, v.get(PDFName.of('S')))
      if (sName) {
        const r = role(sName)
        if (r === 'Figure') { figures++; if (textOf(doc, v.get(PDFName.of('Alt'))) || textOf(doc, v.get(PDFName.of('ActualText')))) figAlt++ }
        if (/^H[1-6]?$/.test(r)) { headings++; hLevels.push(r === 'H' ? 1 : Number(r[1])) }
        if (r === 'Table') tables++
        if (r === 'TH') th++
        if (r === 'Link') links++
      }
      walk(v.get(PDFName.of('K')), depth + 1)
    }
    walk(root.get(PDFName.of('K')), 0)
    out.push(figures === 0 ? { level: 'info', title: 'No tagged figures' } : figAlt === figures ? { level: 'pass', title: `All ${figures} figures have alternative text` } : { level: 'fail', title: `${figures - figAlt} of ${figures} figures have no alternative text`, fix: 'Add alt text to images in the source document.' })
    out.push(headings ? { level: 'pass', title: `${headings} headings tagged` } : { level: 'warn', title: 'No headings tagged', detail: 'Headings let people jump through the document.', fix: 'Use real heading styles in the source document.' })
    const skips = hLevels.filter((l, i) => i > 0 && l - hLevels[i - 1] > 1).length
    if (skips) out.push({ level: 'warn', title: `Heading levels skip ${skips} time${skips > 1 ? 's' : ''}`, detail: 'For example a level 1 heading followed by a level 3.' })
    if (tables) out.push(th ? { level: 'pass', title: `${tables} table${tables > 1 ? 's' : ''} with header cells` } : { level: 'warn', title: `${tables} table${tables > 1 ? 's' : ''} without header cells`, fix: 'Mark the header row as a header in the source app.' })
    const linkAnn = s.annotations.Link ?? 0
    if (linkAnn) out.push(links >= linkAnn ? { level: 'pass', title: 'Links are tagged' } : { level: 'warn', title: `${linkAnn - links} link${linkAnn - links > 1 ? 's are' : ' is'} not tagged` })
  }
  // tab order and form field tooltips
  const pages = doc.getPages()
  const withAnn = pages.filter((p) => arrOf(doc, p.node.get(PDFName.of('Annots')))?.size())
  const tabsOk = withAnn.filter((p) => nameOf(doc, p.node.get(PDFName.of('Tabs'))) === 'S').length
  if (withAnn.length) out.push(tabsOk === withAnn.length ? { level: 'pass', title: 'Tab order follows the structure' } : { level: 'warn', title: `Tab order not set on ${withAnn.length - tabsOk} page${withAnn.length - tabsOk > 1 ? 's' : ''}`, detail: 'Keyboard users may jump between links and fields in an odd order.' })
  if (s.formFields) {
    let noTip = 0
    try { for (const f of doc.getForm().getFields()) if (!f.acroField.dict.get(PDFName.of('TU'))) noTip++ } catch { /* */ }
    out.push(noTip ? { level: 'warn', title: `${noTip} form field${noTip > 1 ? 's have' : ' has'} no tooltip`, detail: 'Screen readers read the tooltip as the field label.' } : { level: 'pass', title: 'Form fields have tooltips' })
  }
  const noUni = s.fonts.filter((f) => !f.toUnicode && f.type !== 'Type1' && f.type !== 'TrueType')
  out.push(noUni.length ? { level: 'warn', title: `${noUni.length} font${noUni.length > 1 ? 's' : ''} without a Unicode map`, detail: 'Copied or read-aloud text from these fonts may come out as gibberish.' } : { level: 'pass', title: 'Fonts map to Unicode text' })
  if (s.pages > 20) out.push(s.outlineItems ? { level: 'pass', title: `${s.outlineItems} bookmarks for navigation` } : { level: 'warn', title: 'Long document without bookmarks', fix: 'Add them with Edit Bookmarks.' })
  out.push(s.encrypted ? { level: 'warn', title: 'Encrypted', detail: 'Some settings block assistive tech from reading the text.' } : { level: 'pass', title: 'Not encrypted' })
  out.push({ level: 'info', title: 'Automatic checks find about a third of issues', detail: 'Reading order, alt text quality, color contrast and meaningful link text still need a human check.' })
  void PDFRef
  return out
}
