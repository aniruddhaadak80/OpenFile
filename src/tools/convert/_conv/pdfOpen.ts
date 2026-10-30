/* Open PDFs with pdf.js keeping font metadata (bold/italic flags) and extract positioned text items. */
import { pdfjs, type PdfJsDoc } from '@/lib/pdf'
import { toItem, fontResolver, type TItem } from './pdfText'

export async function openPdfRich(file: Blob, password?: string): Promise<PdfJsDoc> {
  const data = new Uint8Array(await file.arrayBuffer())
  return pdfjs.getDocument({ data, password, fontExtraProperties: true } as any).promise
}

export interface PageLayout { items: TItem[]; width: number; height: number; chars: number }

/** Positioned text items of a page (1-based). Loads fonts first when `withFonts` so bold/italic are known. */
export async function pageLayout(doc: PdfJsDoc, n: number, withFonts = true): Promise<PageLayout> {
  const page = await doc.getPage(n)
  const vp = page.getViewport({ scale: 1 })
  if (withFonts) { try { await page.getOperatorList() } catch { /* fonts optional */ } }
  const tc = await page.getTextContent()
  const resolve = withFonts ? fontResolver(page) : undefined
  // account for page rotation / offset by mapping through the viewport transform
  const upright: TItem[] = [], turned: TItem[] = []
  for (const raw of tc.items as any[]) {
    if (!('str' in raw)) continue
    const t = pdfjs.Util.transform(vp.transform, raw.transform)
    const mapped = { ...raw, transform: [raw.transform[0], raw.transform[1], raw.transform[2], raw.transform[3], t[4], vp.height - t[5]] }
    const it = toItem(mapped, vp.height, resolve, tc.styles as any)
    if (!it) continue
    // text running sideways on the page (an arXiv stamp in the margin, a vertical label) would be merged into body lines
    if (t[0] <= 0 || Math.abs(t[1]) > Math.abs(t[0]) * 0.2) turned.push(it); else upright.push(it)
  }
  const len = (l: TItem[]) => l.reduce((s, i) => s + i.str.trim().length, 0)
  // keep sideways text only when it is a real part of the page, not a margin note
  const items = len(turned) > len(upright) * 0.25 ? [...upright, ...turned] : upright
  return { items, width: vp.width, height: vp.height, chars: items.reduce((s, i) => s + i.str.trim().length, 0) }
}
