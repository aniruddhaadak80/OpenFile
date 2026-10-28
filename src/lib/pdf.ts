import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
export { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
export { pdfjs }

export type PdfJsDoc = pdfjs.PDFDocumentProxy

export async function openPdfJs(data: ArrayBuffer | Uint8Array | Blob, password?: string): Promise<PdfJsDoc> {
  const buf = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data instanceof Uint8Array ? data.slice() : new Uint8Array(data.slice(0))
  return pdfjs.getDocument({ data: buf, password }).promise
}

/** Render page (1-based) to a canvas at a given scale */
export async function renderPage(doc: PdfJsDoc, pageNumber: number, scale = 1.5, canvas?: HTMLCanvasElement) {
  const page = await doc.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const c = canvas ?? document.createElement('canvas')
  c.width = Math.ceil(viewport.width); c.height = Math.ceil(viewport.height)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
  await page.render({ canvasContext: ctx, viewport, canvas: c } as any).promise
  return c
}

export async function pageText(doc: PdfJsDoc, pageNumber: number) {
  const page = await doc.getPage(pageNumber)
  const tc = await page.getTextContent()
  let last: number | null = null
  let out = ''
  for (const it of tc.items as any[]) {
    if (!('str' in it)) continue
    const y = it.transform?.[5]
    if (last !== null && Math.abs(y - last) > 2) out += '\n'
    else if (out && !out.endsWith(' ') && !out.endsWith('\n')) out += ' '
    out += it.str
    last = y
  }
  return out.replace(/[ \t]+\n/g, '\n').trim()
}

export async function allText(doc: PdfJsDoc, onProgress?: (p: number) => void) {
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) { pages.push(await pageText(doc, i)); onProgress?.(i / doc.numPages) }
  return pages
}

/** Load with pdf-lib, ignoring encryption flags so we can still edit unprotected-but-flagged files */
export async function loadPdfLib(data: ArrayBuffer | Uint8Array | Blob) {
  const { PDFDocument } = await import('pdf-lib')
  const buf = data instanceof Blob ? await data.arrayBuffer() : data
  return PDFDocument.load(buf, { ignoreEncryption: true })
}

export const pdfBlob = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type: 'application/pdf' })

/** Render every page to images and build a new image-only PDF (used by grayscale, redact, compress, flatten) */
export async function rasterizePdf(
  data: ArrayBuffer | Uint8Array | Blob,
  opts: { scale?: number; quality?: number; type?: 'image/jpeg' | 'image/png'; transform?: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, pageIndex: number) => void | Promise<void>; onProgress?: (p: number) => void } = {},
) {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await openPdfJs(data)
  const out = await PDFDocument.create()
  const scale = opts.scale ?? 1.5
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const vp1 = page.getViewport({ scale: 1 })
    const c = await renderPage(doc, i, scale)
    if (opts.transform) await opts.transform(c.getContext('2d')!, c, i - 1)
    const type = opts.type ?? 'image/jpeg'
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), type, opts.quality ?? 0.82))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const img = type === 'image/png' ? await out.embedPng(bytes) : await out.embedJpg(bytes)
    const p = out.addPage([vp1.width, vp1.height])
    p.drawImage(img, { x: 0, y: 0, width: vp1.width, height: vp1.height })
    opts.onProgress?.(i / doc.numPages)
  }
  return out.save()
}
