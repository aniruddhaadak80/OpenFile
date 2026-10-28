/* Build a DOCX from analysed PDF content (pure model → docx). */
import type { Block } from './pdfText'

export type DocNode =
  | { type: 'block'; block: Block }
  | { type: 'table'; rows: string[][] }
  | { type: 'image'; data: Uint8Array; w: number; h: number }
  | { type: 'pagebreak' }

export interface DocxOpts { pageW: number; pageH: number; body: number; title?: string; keepSizes?: boolean; font?: string }

export async function buildDocx(nodes: DocNode[], o: DocxOpts) {
  const d = await import('docx')
  const { Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ImageRun, AlignmentType, PageBreak, BorderStyle } = d
  const marginPt = 54 // 0.75in
  const contentPx = ((o.pageW - marginPt * 2) * 96) / 72
  const children: any[] = []
  const half = (pt: number) => Math.round(pt * 2)
  for (const n of nodes) {
    if (n.type === 'pagebreak') { children.push(new Paragraph({ children: [new PageBreak()] })); continue }
    if (n.type === 'image') {
      const w = Math.min(contentPx, n.w), h = (n.h * w) / n.w
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: n.data, transformation: { width: Math.round(w), height: Math.round(h) } })] }))
      continue
    }
    if (n.type === 'table') {
      const cols = Math.max(...n.rows.map((r) => r.length))
      const border = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' }
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
        rows: n.rows.map((r, ri) => new TableRow({
          tableHeader: ri === 0,
          children: Array.from({ length: cols }, (_, ci) => new TableCell({
            width: { size: Math.floor(100 / cols), type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: r[ci] ?? '', bold: ri === 0, size: half(Math.min(o.body, 11)) })] })],
          })),
        })),
      }))
      children.push(new Paragraph({ text: '' }))
      continue
    }
    const b = n.block
    const heading = b.kind === 'h1' ? HeadingLevel.HEADING_1 : b.kind === 'h2' ? HeadingLevel.HEADING_2 : b.kind === 'h3' ? HeadingLevel.HEADING_3 : undefined
    const size = heading ? undefined : o.keepSizes && Math.abs(b.size - o.body) > 1 ? half(b.size) : undefined
    const runs = b.runs.map((r) => new TextRun({ text: r.text, bold: heading ? undefined : r.bold || undefined, italics: r.italic || undefined, size }))
    children.push(new Paragraph({
      heading,
      children: runs,
      bullet: b.kind === 'li' ? { level: 0 } : undefined,
      alignment: b.align === 'center' ? AlignmentType.CENTER : undefined,
      indent: b.kind === 'p' && b.indent > 12 ? { left: Math.round(Math.min(b.indent, 144) * 20) } : undefined,
      spacing: { after: 120 },
    }))
  }
  const doc = new Document({
    creator: 'OpenFile', title: o.title ?? 'Converted document',
    styles: { default: { document: { run: { font: o.font ?? 'Calibri', size: half(Math.max(9, Math.min(14, o.body))) } } } },
    sections: [{ properties: { page: { size: { width: Math.round(o.pageW * 20), height: Math.round(o.pageH * 20) }, margin: { top: marginPt * 20, bottom: marginPt * 20, left: marginPt * 20, right: marginPt * 20 } } }, children }],
  })
  return { doc, Packer: d.Packer }
}
