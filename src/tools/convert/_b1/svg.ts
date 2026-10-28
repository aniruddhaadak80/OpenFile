/* SVG → vector PDF pages with svg2pdf.js + jsPDF (both MIT). */
export interface SvgInfo { w: number; h: number; text: string }
export function svgSize(text: string): SvgInfo {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const svg = doc.documentElement
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('This file is not a valid SVG.')
  const unit = (v: string | null) => {
    if (!v) return NaN
    const m = /^\s*([\d.]+)\s*(px|pt|mm|cm|in|pc|%)?\s*$/.exec(v); if (!m) return NaN
    const n = parseFloat(m[1]); const u = m[2] ?? 'px'
    return u === 'pt' ? n : u === 'mm' ? (n * 72) / 25.4 : u === 'cm' ? (n * 72) / 2.54 : u === 'in' ? n * 72 : u === 'pc' ? n * 12 : u === '%' ? NaN : n * 0.75
  }
  const vb = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number)
  let w = unit(svg.getAttribute('width')), h = unit(svg.getAttribute('height'))
  if (vb.length === 4 && vb.every(Number.isFinite)) {
    if (!Number.isFinite(w) && !Number.isFinite(h)) { w = vb[2] * 0.75; h = vb[3] * 0.75 }
    else if (!Number.isFinite(w)) w = (h * vb[2]) / vb[3]
    else if (!Number.isFinite(h)) h = (w * vb[3]) / vb[2]
  }
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) { w = 595.28; h = 841.89 }
  return { w, h, text }
}

export type SvgPage = 'match' | 'a4' | 'letter' | 'a3' | 'a5'
const SIZES: Record<string, [number, number]> = { a4: [595.28, 841.89], letter: [612, 792], a3: [841.89, 1190.55], a5: [419.53, 595.28] }

export async function svgsToPdf(items: SvgInfo[], o: { page: SvgPage; margin: number; orientation: 'auto' | 'portrait' | 'landscape'; onProgress?: (p: number) => void }) {
  const { jsPDF } = await import('jspdf')
  const { svg2pdf } = await import('svg2pdf.js')
  let pdf: InstanceType<typeof jsPDF> | null = null
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-99999px;top:0;width:10px;height:10px;overflow:hidden'
  document.body.appendChild(host)
  try {
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      let W: number, H: number
      if (o.page === 'match') { W = it.w + 2 * o.margin; H = it.h + 2 * o.margin }
      else {
        ;[W, H] = SIZES[o.page]
        const land = o.orientation === 'landscape' || (o.orientation === 'auto' && it.w > it.h)
        if (land ? W < H : W > H) [W, H] = [H, W]
      }
      const orient = W > H ? 'l' : 'p'
      if (!pdf) pdf = new jsPDF({ unit: 'pt', format: [W, H], orientation: orient, compress: true })
      else pdf.addPage([W, H], orient)
      const aw = W - 2 * o.margin, ah = H - 2 * o.margin
      const s = Math.min(aw / it.w, ah / it.h)
      const dw = it.w * s, dh = it.h * s
      host.innerHTML = it.text
      const el = host.querySelector('svg') as SVGSVGElement
      if (!el) throw new Error('Could not read SVG ' + (i + 1))
      await svg2pdf(el, pdf, { x: o.margin + (aw - dw) / 2, y: o.margin + (ah - dh) / 2, width: dw, height: dh })
      o.onProgress?.((i + 1) / items.length)
    }
  } finally { host.remove() }
  return pdf!.output('blob') as Blob
}
