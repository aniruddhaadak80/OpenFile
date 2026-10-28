/* Render PPTX slides (parsed by src/lib/b4/pptx.ts) to canvases inside an isolated iframe, so the app's
 * own CSS never leaks into the slide, then lay them out into a PDF with jsPDF. */
import type { Deck } from '@/lib/b4/pptx'

export type SlideLayout = 'slides' | 'notes' | 'handout'
export const PX_PER_PT = 96 / 72

export async function withSlideFrame<T>(fn: (render: (html: string, wPt: number, hPt: number, scale: number) => Promise<HTMLCanvasElement>) => Promise<T>): Promise<T> {
  const html2canvas = (await import('html2canvas')).default
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;left:-20000px;top:0;width:10px;height:10px;border:0;visibility:hidden'
  document.body.appendChild(frame)
  try {
    const render = async (html: string, wPt: number, hPt: number, scale: number) => {
      const wPx = Math.ceil(wPt * PX_PER_PT), hPx = Math.ceil(hPt * PX_PER_PT)
      frame.style.width = wPx + 'px'; frame.style.height = hPx + 'px'
      const doc = frame.contentDocument!
      doc.open()
      doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}*{box-sizing:border-box}p{margin:0}</style></head><body>${html}</body></html>`)
      doc.close()
      const imgs = Array.from(doc.images)
      await Promise.all(imgs.map((im) => (im.complete ? Promise.resolve() : new Promise<void>((r) => { im.onload = im.onerror = () => r() }))))
      try { await (doc as any).fonts?.ready } catch { /* */ }
      const el = doc.body.firstElementChild as HTMLElement
      return html2canvas(el, { scale, width: wPx, height: hPx, windowWidth: wPx, windowHeight: hPx, backgroundColor: '#ffffff', logging: false, useCORS: true })
    }
    return await fn(render)
  } finally { frame.remove() }
}

export interface SlidePdfOptions { layout: SlideLayout; scale: number; quality: number; indexes: number[]; onProgress?: (p: number) => void }

/** Wrap long notes text into lines that fit a width, using jsPDF's own splitter. */
export async function slidesToPdf(deck: Deck, o: SlidePdfOptions): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const { slideHtml } = await import('@/lib/b4/pptx')
  const W = deck.width, H = deck.height
  const portraitA4: [number, number] = [595.28, 841.89]
  let pdf: InstanceType<typeof jsPDF> | null = null
  const newPage = (w: number, h: number) => {
    const orient = w > h ? 'landscape' : 'portrait'
    if (!pdf) pdf = new jsPDF({ unit: 'pt', format: [w, h], orientation: orient, compress: true })
    else pdf.addPage([w, h], orient)
    return pdf
  }
  await withSlideFrame(async (render) => {
    for (let k = 0; k < o.indexes.length; k++) {
      const s = deck.slides[o.indexes[k]]
      const canvas = await render(slideHtml(deck, s), W, H, o.scale)
      const img = canvas.toDataURL(o.quality >= 1 ? 'image/png' : 'image/jpeg', Math.min(0.95, o.quality))
      const fmt = o.quality >= 1 ? 'PNG' : 'JPEG'
      if (o.layout === 'slides') {
        const p = newPage(W, H)
        p.addImage(img, fmt, 0, 0, W, H, undefined, 'FAST')
      } else if (o.layout === 'notes') {
        const [pw, ph] = portraitA4, m = 48
        const p = newPage(pw, ph)
        const iw = pw - 2 * m, ih = (iw * H) / W
        p.addImage(img, fmt, m, m, iw, ih, undefined, 'FAST')
        p.setDrawColor(200); p.rect(m, m, iw, ih)
        p.setFont('helvetica', 'bold'); p.setFontSize(10); p.setTextColor(90)
        p.text(`Slide ${s.index}`, m, m + ih + 24)
        p.setFont('helvetica', 'normal'); p.setFontSize(11); p.setTextColor(20)
        const notes = (s.notes || '').trim() || 'No speaker notes for this slide.'
        const lines = p.splitTextToSize(notes, iw) as string[]
        let y = m + ih + 44
        for (const line of lines) {
          if (y > ph - m) { newPage(pw, ph); y = m }
          pdf!.text(line, m, y); y += 15
        }
      } else {
        // handout: 3 slides per A4 page with lines for writing
        const [pw, ph] = portraitA4, m = 40, per = 3, gap = 18
        const slot = (ph - 2 * m - gap * (per - 1)) / per
        const iw = Math.min((pw - 2 * m) * 0.55, (slot * W) / H), ih = (iw * H) / W
        const pos = k % per
        const p = pos === 0 ? newPage(pw, ph) : pdf!
        const y = m + pos * (slot + gap)
        p.addImage(img, fmt, m, y, iw, ih, undefined, 'FAST')
        p.setDrawColor(190); p.rect(m, y, iw, ih)
        p.setDrawColor(215)
        for (let ly = y + 14; ly < y + ih; ly += 20) p.line(m + iw + 18, ly, pw - m, ly)
      }
      canvas.width = canvas.height = 0
      o.onProgress?.((k + 1) / o.indexes.length)
    }
  })
  if (!pdf) throw new Error('No slides to convert.')
  const out = pdf as InstanceType<typeof jsPDF>
  if (deck.title) out.setProperties({ title: deck.title })
  return out.output('blob')
}
