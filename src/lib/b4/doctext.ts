/* Extract plain text (with page numbers where they exist) from PDF, DOCX, EPUB, TXT, Markdown and HTML. */
export interface DocPage { page: number; text: string }
export const DOCTEXT_ACCEPT = '.pdf,.docx,.txt,.md,.markdown,.html,.htm,.epub,.rtf,.odt'

export async function docPages(file: File, onProgress?: (p: number, label?: string) => void): Promise<DocPage[]> {
  const ext = file.name.toLowerCase().split('.').pop() || ''
  if (ext === 'pdf') {
    const { openPdfJs, pageText } = await import('@/lib/pdf')
    const pdf = await openPdfJs(file)
    const out: DocPage[] = []
    for (let i = 1; i <= pdf.numPages; i++) { onProgress?.(i / pdf.numPages, `Reading page ${i} of ${pdf.numPages}`); out.push({ page: i, text: (await pageText(pdf, i)).trim() }) }
    if (!out.some((p) => p.text.length > 20)) throw new Error('This PDF has no selectable text (it is probably a scan). Run OCR PDF on it first.')
    return out
  }
  if (ext === 'docx') { const mammoth = await import('mammoth'); const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() }); return splitPages(r.value) }
  if (ext === 'epub' || ext === 'rtf' || ext === 'odt' || ext === 'html' || ext === 'htm') {
    const { toHtml } = await import('./office'); const { htmlToPlain } = await import('./book')
    const r = await toHtml(file); return splitPages(htmlToPlain(r.html))
  }
  const { readTextFile } = await import('./text')
  return splitPages((await readTextFile(file)).text)
}

/** Text without page numbers gets virtual pages of about 3000 characters so citations still help. */
export function splitPages(text: string, size = 3000): DocPage[] {
  const paras = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/)
  const out: DocPage[] = []; let cur = ''
  for (const p of paras) { if ((cur + p).length > size && cur) { out.push({ page: out.length + 1, text: cur.trim() }); cur = '' } cur += p + '\n\n' }
  if (cur.trim()) out.push({ page: out.length + 1, text: cur.trim() })
  if (!out.length) throw new Error('No text was found in this file.')
  return out
}
