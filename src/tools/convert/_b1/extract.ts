/* Shared PDF → structured text model used by the batch 1 PDF converters (Markdown, HTML, EPUB, RTF, ODF) and auto-bookmarks. */
import type { PdfJsDoc } from '@/lib/pdf'
import { openPdfRich, pageLayout } from '../_conv/pdfOpen'
import { groupLines, bodySize, headingSizesOf, buildBlocks, splitTables, type Line, type Block, type Run, type TItem } from '../_conv/pdfText'

export interface PageInfo { lines: Line[]; items: TItem[]; width: number; height: number; chars: number }
export type PNode = { type: 'block'; block: Block } | { type: 'table'; rows: string[][] } | { type: 'scan'; page: number }
export interface ModelOpts { headings: boolean; tables: boolean; scanImages: boolean; minChars: number; dropRepeating?: boolean }
export type { Block, Run, Line }

export function pdfErr(e: any) {
  if (e?.name === 'PasswordException') return 'This PDF is password-protected. Unlock it first with Unlock PDF.'
  if (e?.name === 'InvalidPDFException') return 'This file does not look like a valid PDF.'
  return e?.message || 'Could not read the PDF.'
}

export async function loadLayout(file: Blob, onP?: (p: number) => void): Promise<{ doc: PdfJsDoc; pages: PageInfo[] }> {
  let doc: PdfJsDoc
  try { doc = await openPdfRich(file) } catch (e) { throw new Error(pdfErr(e)) }
  const pages: PageInfo[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const lay = await pageLayout(doc, i, true)
    pages.push({ lines: groupLines(lay.items), items: lay.items, width: lay.width, height: lay.height, chars: lay.chars })
    onP?.(i / doc.numPages)
  }
  return { doc, pages }
}

/** Lines that repeat at the same height on most pages (running headers, footers, page numbers). */
export function repeatingLines(pages: PageInfo[]) {
  const kill = new Set<string>()
  if (pages.length < 3) return kill
  const seen = new Map<string, number>()
  for (const p of pages) {
    const keys = new Set<string>()
    for (const l of p.lines) {
      if (l.y > p.height * 0.12 && l.y < p.height * 0.9) continue
      keys.add(Math.round(l.y / 4) + '|' + l.text.replace(/\d+/g, '#').trim())
    }
    for (const k of keys) seen.set(k, (seen.get(k) ?? 0) + 1)
  }
  for (const [k, n] of seen) if (n >= Math.max(3, pages.length * 0.6)) kill.add(k)
  return kill
}

export function buildModel(pages: PageInfo[], o: ModelOpts) {
  const all = pages.flatMap((p) => p.lines)
  const body = bodySize(all)
  const hs = o.headings ? headingSizesOf(all, body) : []
  const rep = o.dropRepeating ? repeatingLines(pages) : new Set<string>()
  return pages.map((p, i): PNode[] => {
    if (o.scanImages && p.chars < o.minChars) return [{ type: 'scan', page: i + 1 }]
    const lines = rep.size ? p.lines.filter((l) => !rep.has(Math.round(l.y / 4) + '|' + l.text.replace(/\d+/g, '#').trim())) : p.lines
    const segs = o.tables ? splitTables(lines, p.width) : [{ type: 'text' as const, lines }]
    const out: PNode[] = []
    for (const s of segs) {
      if (s.type === 'table') out.push({ type: 'table', rows: s.rows })
      else for (const b of buildBlocks(s.lines, body, hs, p.width)) out.push({ type: 'block', block: o.headings ? b : { ...b, kind: b.kind.startsWith('h') ? 'p' : b.kind } })
    }
    return out
  })
}

/** Heading candidates for bookmarks: [title, pageIndex, level] */
export function headingOutline(pages: PageInfo[], maxLevels = 3) {
  const model = buildModel(pages, { headings: true, tables: false, scanImages: false, minChars: 0, dropRepeating: true })
  const out: { title: string; page: number; level: number }[] = []
  model.forEach((nodes, pi) => nodes.forEach((n) => {
    if (n.type !== 'block' || !n.block.kind.startsWith('h')) return
    const level = Number(n.block.kind[1]) - 1
    if (level >= maxLevels) return
    const title = n.block.text.replace(/\s+/g, ' ').trim()
    if (title.length < 2 || title.length > 140 || /^\d+$/.test(title)) return
    out.push({ title, page: pi, level })
  }))
  return out
}

export { escHtml, runsHtml, runsMd } from './text'
