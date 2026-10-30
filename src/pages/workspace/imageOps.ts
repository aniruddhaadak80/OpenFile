/* Image operations on a canvas, shared by the Web Worker pool (OffscreenCanvas) and the main-thread fallback.
 * Input is an ImageBitmap-like source; output is a Blob. No DOM-only APIs, so it runs in a worker. */
export type AnyCanvas = OffscreenCanvas | HTMLCanvasElement
export type Src = ImageBitmap | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas
export type Op = { step: string; params: Record<string, any>; type: string }

const make = (w: number, h: number): AnyCanvas => {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h))
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c
}
const ctx2d = (c: AnyCanvas) => c.getContext('2d') as CanvasRenderingContext2D
const dims = (s: Src) => [(s as HTMLImageElement).naturalWidth || (s as any).width, (s as HTMLImageElement).naturalHeight || (s as any).height] as [number, number]

export async function toBlob(c: AnyCanvas, type: string, quality?: number): Promise<Blob> {
  if ('convertToBlob' in c) return c.convertToBlob({ type, quality })
  return new Promise((res, rej) => (c as HTMLCanvasElement).toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the image'))), type, quality))
}

const keepType = (t: string) => (t.startsWith('image/') && t !== 'image/gif' && t !== 'image/svg+xml' && t !== 'image/bmp' ? t : 'image/png')

/** Apply one image step. Returns the encoded result. */
export async function imageOp(src: Src, op: Op): Promise<Blob> {
  const p = op.params
  const [w, h] = dims(src)
  let c: AnyCanvas, type = keepType(op.type), quality: number | undefined = 0.92
  const plain = (cw = w, ch = h) => { const cv = make(cw, ch); const x = ctx2d(cv); x.imageSmoothingQuality = 'high'; x.drawImage(src as CanvasImageSource, 0, 0, cv.width, cv.height); return cv }
  switch (op.step) {
    case 'img-resize': { let s = Math.min(p.maxW / w, p.maxH / h); if (!p.upscale) s = Math.min(1, s); c = plain(w * s, h * s); break }
    case 'img-convert': {
      c = plain(); type = 'image/' + p.format; quality = p.quality / 100
      if (p.format === 'jpeg') { const x = ctx2d(c); x.globalCompositeOperation = 'destination-over'; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height) }
      break
    }
    case 'img-compress': { c = plain(); type = op.type === 'image/png' || op.type === 'image/webp' ? 'image/webp' : 'image/jpeg'; quality = p.quality / 100
      if (type === 'image/jpeg') { const x = ctx2d(c); x.globalCompositeOperation = 'destination-over'; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height) }
      break }
    case 'img-strip': { c = plain(); quality = p.quality / 100; break }
    case 'img-crop': {
      const inset = Math.max(0, Math.min(45, Number(p.inset) || 0)) / 100
      let cw = w * (1 - inset * 2), ch = h * (1 - inset * 2)
      if (p.ratio !== 'free') { const [a, b] = String(p.ratio).split(':').map(Number); const r = a / b; if (cw / ch > r) cw = ch * r; else ch = cw / r }
      c = make(cw, ch); const x = ctx2d(c); x.imageSmoothingQuality = 'high'
      x.drawImage(src as CanvasImageSource, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, c.width, c.height); break
    }
    case 'img-rotate': {
      const a = Number(p.angle); const sw = a % 180 ? h : w, sh = a % 180 ? w : h
      c = make(sw, sh); const x = ctx2d(c); x.translate(sw / 2, sh / 2); x.rotate((a * Math.PI) / 180); if (p.flipH) x.scale(-1, 1); x.drawImage(src as CanvasImageSource, -w / 2, -h / 2); break
    }
    case 'img-grayscale': {
      c = make(w, h); const x = ctx2d(c)
      if ('filter' in x && typeof x.filter === 'string') { x.filter = p.filter; x.drawImage(src as CanvasImageSource, 0, 0) }
      else { x.drawImage(src as CanvasImageSource, 0, 0); pixelFilter(x, w, h, p.filter) }
      break
    }
    case 'img-watermark': {
      c = plain(); const x = ctx2d(c); const s = Math.max(14, c.width / 28)
      x.globalAlpha = p.opacity / 100; x.fillStyle = p.color; x.font = `600 ${s}px Inter, system-ui, sans-serif`; x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = s / 4
      const m = s, tw = x.measureText(p.text).width
      if (p.pos === 'tiled') { x.save(); x.rotate(-Math.PI / 6); for (let y = -c.height; y < c.height * 2; y += s * 5) for (let xx = -c.width; xx < c.width * 2; xx += tw + s * 3) x.fillText(p.text, xx, y); x.restore() }
      else { const px = p.pos.includes('right') ? c.width - tw - m : p.pos === 'center' ? (c.width - tw) / 2 : m; const py = p.pos.includes('bottom') ? c.height - m : p.pos === 'center' ? c.height / 2 : m + s; x.fillText(p.text, px, py) }
      break
    }
    case 'img-round': {
      c = make(w, h); const x = ctx2d(c); const r = (Math.min(w, h) * p.radius) / 100
      x.beginPath(); if (x.roundRect) x.roundRect(0, 0, w, h, r); else x.rect(0, 0, w, h); x.clip(); x.drawImage(src as CanvasImageSource, 0, 0); type = 'image/png'; break
    }
    default: throw new Error('Unknown image step ' + op.step)
  }
  let blob = await toBlob(c, type, quality)
  // a browser that cannot encode the format (AVIF in some browsers) hands back PNG: keep that honest
  if (!blob.type) blob = new Blob([blob], { type: 'image/png' })
  if ('width' in c) { c.width = 0; c.height = 0 }
  return blob
}

/** Fallback for browsers without ctx.filter (Safari): the same five filters done on pixels. */
function pixelFilter(x: CanvasRenderingContext2D, w: number, h: number, f: string) {
  const d = x.getImageData(0, 0, w, h); const a = d.data
  for (let i = 0; i < a.length; i += 4) {
    let r = a[i], g = a[i + 1], b = a[i + 2]
    if (f.startsWith('grayscale')) { r = g = b = r * 0.299 + g * 0.587 + b * 0.114 }
    else if (f.startsWith('sepia')) { const nr = r * 0.393 + g * 0.769 + b * 0.189, ng = r * 0.349 + g * 0.686 + b * 0.168, nb = r * 0.272 + g * 0.534 + b * 0.131; r = nr; g = ng; b = nb }
    else if (f.startsWith('invert')) { r = 255 - r; g = 255 - g; b = 255 - b }
    else if (f.startsWith('brightness')) { r *= 1.15; g *= 1.15; b *= 1.15 }
    else { const m = (r + g + b) / 3; r = (r - 128) * 1.2 + 128; g = (g - 128) * 1.2 + 128; b = (b - 128) * 1.2 + 128; r = m + (r - m) * 1.3; g = m + (g - m) * 1.3; b = m + (b - m) * 1.3 }
    a[i] = r; a[i + 1] = g; a[i + 2] = b
  }
  x.putImageData(d, 0, 0)
}
