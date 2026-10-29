// Pipeline step definitions for the OpenFile Workspace (batch automation).
import { loadImage, createCanvas, canvasToBlob, baseName } from '@/lib/files'
import { notSmaller } from '@/lib/compress-guard'

export type Mode = 'image' | 'pdf'
export type ParamDef = { key: string; label: string; type: 'number' | 'text' | 'select' | 'color' | 'bool'; options?: string[]; min?: number; max?: number; step?: number; default: any }
export type Item = { name: string; blob: Blob }
export type StepDef = { id: string; mode: Mode; name: string; desc: string; params: ParamDef[]; run: (items: Item[], p: Record<string, any>, onP: (r: number) => void) => Promise<Item[]> }

const ext = (t: string) => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' } as Record<string, string>)[t] || 'png'

async function mapImages(items: Item[], onP: (r: number) => void, fn: (img: HTMLImageElement | HTMLCanvasElement, it: Item) => Promise<{ canvas: HTMLCanvasElement; type?: string; quality?: number; name?: string }>) {
  const out: Item[] = []
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const img = await loadImage(it.blob)
    const r = await fn(img, it)
    const type = r.type || (it.blob.type.startsWith('image/') && it.blob.type !== 'image/gif' && it.blob.type !== 'image/svg+xml' ? it.blob.type : 'image/png')
    const blob = await canvasToBlob(r.canvas, type, r.quality ?? 0.92)
    out.push({ name: r.name ?? `${baseName(it.name)}.${ext(blob.type)}`, blob })
    onP((i + 1) / items.length)
  }
  return out
}
const draw = (img: HTMLImageElement | HTMLCanvasElement, w = (img as any).naturalWidth || img.width, h = (img as any).naturalHeight || img.height) => { const { canvas, ctx } = createCanvas(w, h); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, canvas.width, canvas.height); return { canvas, ctx } }
const dims = (img: any) => [img.naturalWidth || img.width, img.naturalHeight || img.height] as const

export const STEPS: StepDef[] = [
  { id: 'img-resize', mode: 'image', name: 'Resize', desc: 'Fit inside a max width/height', params: [{ key: 'maxW', label: 'Max width', type: 'number', default: 1600, min: 16, max: 10000 }, { key: 'maxH', label: 'Max height', type: 'number', default: 1600, min: 16, max: 10000 }, { key: 'upscale', label: 'Allow upscaling', type: 'bool', default: false }],
    run: (items, p, onP) => mapImages(items, onP, async (img) => { const [w, h] = dims(img); let s = Math.min(p.maxW / w, p.maxH / h); if (!p.upscale) s = Math.min(1, s); return draw(img, w * s, h * s) }) },
  { id: 'img-convert', mode: 'image', name: 'Convert format', desc: 'JPG, PNG, WEBP or AVIF', params: [{ key: 'format', label: 'Format', type: 'select', options: ['webp', 'jpeg', 'png', 'avif'], default: 'webp' }, { key: 'quality', label: 'Quality', type: 'number', min: 1, max: 100, default: 82 }],
    run: (items, p, onP) => mapImages(items, onP, async (img) => { const { canvas, ctx } = draw(img); if (p.format === 'jpeg') { ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height) } return { canvas, type: 'image/' + p.format, quality: p.quality / 100 } }) },
  { id: 'img-compress', mode: 'image', name: 'Compress', desc: 'Re-encode with a quality level (keeps format, PNG→WEBP)', params: [{ key: 'quality', label: 'Quality', type: 'number', min: 1, max: 100, default: 75 }],
    // never hand back a bigger file: an image that did not shrink passes through unchanged
    run: async (items, p, onP) => (await mapImages(items, onP, async (img, it) => ({ ...draw(img), type: it.blob.type === 'image/png' ? 'image/webp' : it.blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg', quality: p.quality / 100 }))).map((o, i) => (notSmaller(items[i].blob.size, o.blob.size) ? items[i] : o)) },
  { id: 'img-rotate', mode: 'image', name: 'Rotate / flip', desc: 'Rotate 90° steps and mirror', params: [{ key: 'angle', label: 'Angle', type: 'select', options: ['0', '90', '180', '270'], default: '90' }, { key: 'flipH', label: 'Flip horizontal', type: 'bool', default: false }],
    run: (items, p, onP) => mapImages(items, onP, async (img) => { const [w, h] = dims(img); const a = Number(p.angle); const sw = a % 180 ? h : w, sh = a % 180 ? w : h; const { canvas, ctx } = createCanvas(sw, sh); ctx.translate(sw / 2, sh / 2); ctx.rotate((a * Math.PI) / 180); if (p.flipH) ctx.scale(-1, 1); ctx.drawImage(img, -w / 2, -h / 2); return { canvas } }) },
  { id: 'img-grayscale', mode: 'image', name: 'Filter', desc: 'Grayscale, sepia or boost', params: [{ key: 'filter', label: 'Filter', type: 'select', options: ['grayscale(1)', 'sepia(1)', 'contrast(1.2) saturate(1.3)', 'brightness(1.15)', 'invert(1)'], default: 'grayscale(1)' }],
    run: (items, p, onP) => mapImages(items, onP, async (img) => { const [w, h] = dims(img); const { canvas, ctx } = createCanvas(w, h); ctx.filter = p.filter; ctx.drawImage(img, 0, 0); return { canvas } }) },
  { id: 'img-watermark', mode: 'image', name: 'Watermark', desc: 'Text watermark in a corner or tiled', params: [{ key: 'text', label: 'Text', type: 'text', default: '© OpenFile' }, { key: 'pos', label: 'Position', type: 'select', options: ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'center', 'tiled'], default: 'bottom-right' }, { key: 'opacity', label: 'Opacity %', type: 'number', min: 5, max: 100, default: 60 }, { key: 'color', label: 'Color', type: 'color', default: '#ffffff' }],
    run: (items, p, onP) => mapImages(items, onP, async (img) => {
      const { canvas, ctx } = draw(img); const s = Math.max(14, canvas.width / 28)
      ctx.globalAlpha = p.opacity / 100; ctx.fillStyle = p.color; ctx.font = `600 ${s}px Inter, sans-serif`; ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = s / 4
      const m = s, tw = ctx.measureText(p.text).width
      if (p.pos === 'tiled') { ctx.save(); ctx.rotate(-Math.PI / 6); for (let y = -canvas.height; y < canvas.height * 2; y += s * 5) for (let x = -canvas.width; x < canvas.width * 2; x += tw + s * 3) ctx.fillText(p.text, x, y); ctx.restore() }
      else { const x = p.pos.includes('right') ? canvas.width - tw - m : p.pos === 'center' ? (canvas.width - tw) / 2 : m; const y = p.pos.includes('bottom') ? canvas.height - m : p.pos === 'center' ? canvas.height / 2 : m + s; ctx.fillText(p.text, x, y) }
      return { canvas }
    }) },
  { id: 'img-round', mode: 'image', name: 'Rounded corners', desc: 'Transparent rounded corners (PNG)', params: [{ key: 'radius', label: 'Radius %', type: 'number', min: 0, max: 50, default: 8 }],
    run: (items, p, onP) => mapImages(items, onP, async (img) => { const [w, h] = dims(img); const { canvas, ctx } = createCanvas(w, h); const r = (Math.min(w, h) * p.radius) / 100; ctx.beginPath(); ctx.roundRect(0, 0, w, h, r); ctx.clip(); ctx.drawImage(img, 0, 0); return { canvas, type: 'image/png' } }) },
  { id: 'img-rename', mode: 'image', name: 'Rename', desc: 'Pattern with {name} {n} {date}', params: [{ key: 'pattern', label: 'Pattern', type: 'text', default: '{name}-{n}' }, { key: 'start', label: 'Start number', type: 'number', default: 1 }],
    run: async (items, p, onP) => { onP(1); const d = new Date().toISOString().slice(0, 10); return items.map((it, i) => { const e = it.name.split('.').pop(); return { blob: it.blob, name: `${String(p.pattern).replace(/\{name\}/g, baseName(it.name)).replace(/\{n\}/g, String(Number(p.start) + i).padStart(3, '0')).replace(/\{date\}/g, d)}.${e}` } }) } },

  // ---- PDF steps ----
  { id: 'pdf-merge', mode: 'pdf', name: 'Merge all', desc: 'Combine every PDF into one', params: [{ key: 'name', label: 'Output name', type: 'text', default: 'merged' }],
    run: async (items, p, onP) => { const { PDFDocument } = await import('pdf-lib'); const out = await PDFDocument.create(); for (let i = 0; i < items.length; i++) { const d = await PDFDocument.load(await items[i].blob.arrayBuffer(), { ignoreEncryption: true }); (await out.copyPages(d, d.getPageIndices())).forEach((pg) => out.addPage(pg)); onP((i + 1) / items.length) } return [{ name: `${p.name || 'merged'}.pdf`, blob: new Blob([(await out.save()) as BlobPart], { type: 'application/pdf' }) }] } },
  { id: 'pdf-rotate', mode: 'pdf', name: 'Rotate pages', desc: 'Rotate every page', params: [{ key: 'angle', label: 'Angle', type: 'select', options: ['90', '180', '270'], default: '90' }],
    run: (items, p, onP) => eachPdf(items, onP, async (doc) => { const { degrees } = await import('pdf-lib'); doc.getPages().forEach((pg: any) => pg.setRotation(degrees((pg.getRotation().angle + Number(p.angle)) % 360))) }) },
  { id: 'pdf-numbers', mode: 'pdf', name: 'Page numbers', desc: 'Stamp “n / total” at the bottom', params: [{ key: 'format', label: 'Format', type: 'select', options: ['{n}', '{n} / {total}', 'Page {n} of {total}'], default: '{n} / {total}' }, { key: 'size', label: 'Font size', type: 'number', default: 10, min: 6, max: 36 }],
    run: (items, p, onP) => eachPdf(items, onP, async (doc) => { const { StandardFonts, rgb } = await import('pdf-lib'); const f = await doc.embedFont(StandardFonts.Helvetica); const pages = doc.getPages(); pages.forEach((pg: any, i: number) => { const t = String(p.format).replace('{n}', String(i + 1)).replace('{total}', String(pages.length)); const w = f.widthOfTextAtSize(t, p.size); pg.drawText(t, { x: (pg.getWidth() - w) / 2, y: 20, size: p.size, font: f, color: rgb(0.3, 0.3, 0.35) }) }) }) },
  { id: 'pdf-watermark', mode: 'pdf', name: 'Watermark', desc: 'Diagonal text watermark', params: [{ key: 'text', label: 'Text', type: 'text', default: 'CONFIDENTIAL' }, { key: 'opacity', label: 'Opacity %', type: 'number', default: 15, min: 3, max: 100 }],
    run: (items, p, onP) => eachPdf(items, onP, async (doc) => { const { StandardFonts, rgb, degrees } = await import('pdf-lib'); const f = await doc.embedFont(StandardFonts.HelveticaBold); doc.getPages().forEach((pg: any) => { const s = Math.min(pg.getWidth(), pg.getHeight()) / 8; const w = f.widthOfTextAtSize(p.text, s); pg.drawText(p.text, { x: pg.getWidth() / 2 - (w / 2) * 0.7, y: pg.getHeight() / 2 - (w / 2) * 0.7, size: s, font: f, color: rgb(0.85, 0.1, 0.1), opacity: p.opacity / 100, rotate: degrees(45) }) }) }) },
  { id: 'pdf-meta', mode: 'pdf', name: 'Clean metadata', desc: 'Strip author/title/producer', params: [],
    run: (items, _p, onP) => eachPdf(items, onP, async (doc) => { doc.setTitle(''); doc.setAuthor(''); doc.setSubject(''); doc.setKeywords([]); doc.setProducer('OpenFile'); doc.setCreator('OpenFile') }) },
  { id: 'pdf-compress', mode: 'pdf', name: 'Compress (rasterize)', desc: 'Re-render pages as JPEG', params: [{ key: 'dpi', label: 'DPI', type: 'select', options: ['72', '96', '120', '150'], default: '96' }, { key: 'quality', label: 'JPEG quality', type: 'number', default: 70, min: 10, max: 95 }],
    run: async (items, p, onP) => { const { rasterizePdf } = await import('@/lib/pdf'); const out: Item[] = []; for (let i = 0; i < items.length; i++) { const bytes = await rasterizePdf(items[i].blob, { scale: Number(p.dpi) / 72, quality: p.quality / 100, onProgress: (r) => onP((i + r) / items.length) }); const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' }); out.push({ name: items[i].name, blob: blob.size < items[i].blob.size ? blob : items[i].blob }) } return out } },
  { id: 'pdf-gray', mode: 'pdf', name: 'Grayscale', desc: 'Convert pages to grayscale', params: [],
    run: async (items, _p, onP) => { const { rasterizePdf } = await import('@/lib/pdf'); const out: Item[] = []; for (let i = 0; i < items.length; i++) { const bytes = await rasterizePdf(items[i].blob, { scale: 1.6, quality: 0.85, transform: (ctx, c) => { const d = ctx.getImageData(0, 0, c.width, c.height); const a = d.data; for (let k = 0; k < a.length; k += 4) { const g = a[k] * 0.299 + a[k + 1] * 0.587 + a[k + 2] * 0.114; a[k] = a[k + 1] = a[k + 2] = g } ctx.putImageData(d, 0, 0) }, onProgress: (r) => onP((i + r) / items.length) }); out.push({ name: items[i].name, blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }) }) } return out } },
]

async function eachPdf(items: Item[], onP: (r: number) => void, fn: (doc: any) => Promise<void>) {
  const { PDFDocument } = await import('pdf-lib')
  const out: Item[] = []
  for (let i = 0; i < items.length; i++) {
    const doc = await PDFDocument.load(await items[i].blob.arrayBuffer(), { ignoreEncryption: true })
    await fn(doc)
    out.push({ name: items[i].name, blob: new Blob([(await doc.save()) as BlobPart], { type: 'application/pdf' }) })
    onP((i + 1) / items.length)
  }
  return out
}

export const PRESETS: { name: string; mode: Mode; steps: { id: string; params?: Record<string, any> }[] }[] = [
  { name: 'Web-ready photos', mode: 'image', steps: [{ id: 'img-resize', params: { maxW: 1920, maxH: 1920 } }, { id: 'img-convert', params: { format: 'webp', quality: 80 } }] },
  { name: 'Product catalog', mode: 'image', steps: [{ id: 'img-resize', params: { maxW: 1200, maxH: 1200 } }, { id: 'img-watermark' }, { id: 'img-convert', params: { format: 'jpeg', quality: 85 } }, { id: 'img-rename', params: { pattern: 'product-{n}' } }] },
  { name: 'Social avatars', mode: 'image', steps: [{ id: 'img-resize', params: { maxW: 512, maxH: 512 } }, { id: 'img-round', params: { radius: 50 } }] },
  { name: 'Share-safe PDF pack', mode: 'pdf', steps: [{ id: 'pdf-merge' }, { id: 'pdf-numbers' }, { id: 'pdf-meta' }] },
  { name: 'Confidential drafts', mode: 'pdf', steps: [{ id: 'pdf-watermark' }, { id: 'pdf-meta' }] },
  { name: 'Shrink scans', mode: 'pdf', steps: [{ id: 'pdf-gray' }, { id: 'pdf-compress' }] },
]
