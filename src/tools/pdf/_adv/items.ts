/* Annotation model + PDF burner used by Sign PDF and Edit PDF. All coordinates are in displayed-page points (top-left origin). */
import { toPdf, hexToRgb01, dataUrlBytes, type PageInfo } from './pages'
import { plainBytes } from './decrypt'

export type ItemType = 'image' | 'text' | 'rect' | 'ellipse' | 'highlight' | 'whiteout' | 'line' | 'arrow' | 'pen'
export type FontKey = 'Helvetica' | 'Times' | 'Courier'

export interface Item {
  id: string
  type: ItemType
  x: number; y: number; w: number; h: number
  /** line / arrow end point */
  x2?: number; y2?: number
  /** pen points (absolute) */
  points?: [number, number][]
  src?: string
  text?: string
  font?: FontKey
  size?: number
  bold?: boolean
  italic?: boolean
  color?: string
  fill?: string | null
  strokeWidth?: number
  opacity?: number
  /** keep aspect ratio when resizing (images) */
  lockAspect?: boolean
  label?: string
}

export type PageItems = Record<number, Item[]>

export const FONT_CSS: Record<FontKey, string> = {
  Helvetica: 'Helvetica, Arial, "Liberation Sans", sans-serif',
  Times: '"Times New Roman", Times, "Liberation Serif", serif',
  Courier: '"Courier New", Courier, "Liberation Mono", monospace',
}
/** distance from line-box top to baseline as a fraction of font size (line-height 1.2) */
export const BASELINE: Record<FontKey, number> = { Helvetica: 0.947, Times: 0.937, Courier: 0.866 }
export const LINE_H = 1.2

/** Bounding box of any item (for lines: normalised) */
export function bbox(it: Item) {
  if (it.type === 'line' || it.type === 'arrow') {
    const x2 = it.x2 ?? it.x, y2 = it.y2 ?? it.y
    return { x: Math.min(it.x, x2), y: Math.min(it.y, y2), w: Math.abs(x2 - it.x), h: Math.abs(y2 - it.y) }
  }
  return { x: it.x, y: it.y, w: it.w, h: it.h }
}

export function moveItem(it: Item, dx: number, dy: number): Item {
  const n: Item = { ...it, x: it.x + dx, y: it.y + dy }
  if (it.x2 !== undefined) n.x2 = it.x2 + dx
  if (it.y2 !== undefined) n.y2 = it.y2 + dy
  if (it.points) n.points = it.points.map(([a, b]) => [a + dx, b + dy])
  return n
}

/** Map an item from old bbox to new bbox (pen points & text size scale too) */
export function resizeItem(it: Item, nb: { x: number; y: number; w: number; h: number }): Item {
  const ob = bbox(it)
  const sx = ob.w ? nb.w / ob.w : 1, sy = ob.h ? nb.h / ob.h : 1
  if (it.type === 'pen' && it.points) {
    return { ...it, ...nb, points: it.points.map(([a, b]) => [nb.x + (a - ob.x) * sx, nb.y + (b - ob.y) * sy]) }
  }
  if (it.type === 'text') {
    return { ...it, x: nb.x, y: nb.y, w: nb.w, h: nb.h, size: Math.max(4, Math.min(300, (it.size ?? 16) * sx)) }
  }
  return { ...it, ...nb }
}

export function arrowHead(x1: number, y1: number, x2: number, y2: number, sw: number): [number, number][] {
  const ang = Math.atan2(y2 - y1, x2 - x1)
  const len = Math.max(8, sw * 4.5)
  const spread = Math.PI / 7
  return [[x2, y2], [x2 - len * Math.cos(ang - spread), y2 - len * Math.sin(ang - spread)], [x2 - len * Math.cos(ang + spread), y2 - len * Math.sin(ang + spread)]]
}
/** shorten the shaft so the round cap does not poke through the arrow tip */
export function arrowShaftEnd(x1: number, y1: number, x2: number, y2: number, sw: number): [number, number] {
  const ang = Math.atan2(y2 - y1, x2 - x1)
  const back = Math.max(8, sw * 4.5) * 0.7
  const d = Math.hypot(x2 - x1, y2 - y1)
  if (d < back) return [x1, y1]
  return [x2 - back * Math.cos(ang), y2 - back * Math.sin(ang)]
}

/** smooth polyline path (quadratic through midpoints) in any coordinate space */
export function smoothPath(pts: [number, number][], fmt: (p: [number, number]) => string = (p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`): string {
  if (!pts.length) return ''
  if (pts.length < 3) return `M ${fmt(pts[0])} ` + pts.slice(1).map((p) => `L ${fmt(p)}`).join(' ') + (pts.length === 1 ? ` L ${fmt([pts[0][0] + 0.01, pts[0][1] + 0.01])}` : '')
  let d = `M ${fmt(pts[0])}`
  for (let i = 1; i < pts.length - 1; i++) {
    const mid: [number, number] = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2]
    d += ` Q ${fmt(pts[i])} ${fmt(mid)}`
  }
  d += ` L ${fmt(pts[pts.length - 1])}`
  return d
}

/** Word-wrap using a width measurer (shared by preview-independent export) */
export function wrapText(text: string, maxW: number, measure: (s: string) => number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    if (!para) { out.push(''); continue }
    const words = para.split(/(\s+)/)
    let line = ''
    for (const tok of words) {
      const cand = line + tok
      if (!line || measure(cand.trimEnd()) <= maxW + 0.5) { line = cand; continue }
      out.push(line.trimEnd())
      line = tok.trimStart()
      // break very long words
      while (line && measure(line) > maxW && line.length > 1) {
        let i = line.length - 1
        while (i > 1 && measure(line.slice(0, i)) > maxW) i--
        out.push(line.slice(0, i)); line = line.slice(i)
      }
    }
    out.push(line.trimEnd())
  }
  return out
}

function textToPng(lines: string[], it: Item): { url: string; w: number; h: number } {
  const size = it.size ?? 16, font = it.font ?? 'Helvetica'
  const scale = 4
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(it.w * scale)); c.height = Math.max(1, Math.ceil(lines.length * size * LINE_H * scale))
  const ctx = c.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.fillStyle = it.color ?? '#000'
  ctx.font = `${it.italic ? 'italic ' : ''}${it.bold ? 'bold ' : ''}${size}px ${FONT_CSS[font]}`
  ctx.textBaseline = 'alphabetic'
  lines.forEach((l, i) => ctx.fillText(l, 0, i * size * LINE_H + BASELINE[font] * size))
  return { url: c.toDataURL('image/png'), w: it.w, h: lines.length * size * LINE_H }
}

/** Burn items into the PDF. `pages` gives each page's viewport transform. Returns saved bytes. */
export async function burnItems(src: Blob, items: PageItems, pages: PageInfo[], onProgress?: (p: number) => void): Promise<Uint8Array> {
  const lib = await import('pdf-lib')
  const { PDFDocument, StandardFonts, rgb, degrees, BlendMode, LineCapStyle } = lib
  const doc = await PDFDocument.load(await plainBytes(src), { ignoreEncryption: true })
  const fontCache = new Map<string, any>()
  const getFont = async (it: Item) => {
    const f = it.font ?? 'Helvetica', b = !!it.bold, i = !!it.italic
    const name = f === 'Helvetica' ? (b && i ? StandardFonts.HelveticaBoldOblique : b ? StandardFonts.HelveticaBold : i ? StandardFonts.HelveticaOblique : StandardFonts.Helvetica)
      : f === 'Times' ? (b && i ? StandardFonts.TimesRomanBoldItalic : b ? StandardFonts.TimesRomanBold : i ? StandardFonts.TimesRomanItalic : StandardFonts.TimesRoman)
        : (b && i ? StandardFonts.CourierBoldOblique : b ? StandardFonts.CourierBold : i ? StandardFonts.CourierOblique : StandardFonts.Courier)
    if (!fontCache.has(name)) fontCache.set(name, await doc.embedFont(name))
    return fontCache.get(name)
  }
  const imgCache = new Map<string, any>()
  const getImg = async (url: string) => {
    if (!imgCache.has(url)) {
      const bytes = dataUrlBytes(url)
      imgCache.set(url, url.startsWith('data:image/jpeg') || url.startsWith('data:image/jpg') ? await doc.embedJpg(bytes) : await doc.embedPng(bytes))
    }
    return imgCache.get(url)
  }
  const col = (hex?: string | null) => { const [r, g, b] = hexToRgb01(hex || '#000000'); return rgb(r, g, b) }
  const pdfPages = doc.getPages()
  const keys = Object.keys(items).map(Number).filter((k) => items[k]?.length)
  let done = 0
  for (const pi of keys) {
    const page = pdfPages[pi], info = pages[pi]
    if (!page || !info) continue
    const t = info.t, rot = degrees(info.rotate)
    const P = (x: number, y: number) => toPdf(t, x, y)
    for (const it of items[pi]) {
      const op = it.opacity ?? 1
      if (it.type === 'image' && it.src) {
        const img = await getImg(it.src)
        const [x, y] = P(it.x, it.y + it.h)
        page.drawImage(img, { x, y, width: it.w, height: it.h, rotate: rot, opacity: op })
      } else if (it.type === 'text' && it.text) {
        const font = await getFont(it)
        const size = it.size ?? 16, fk = it.font ?? 'Helvetica'
        let encodable = true
        try { font.encodeText(it.text.replace(/\n/g, ' ')) } catch { encodable = false }
        if (encodable) {
          const lines = wrapText(it.text, it.w, (s) => font.widthOfTextAtSize(s, size))
          lines.forEach((line, i) => {
            if (!line) return
            const [x, y] = P(it.x, it.y + i * size * LINE_H + BASELINE[fk] * size)
            page.drawText(line, { x, y, size, font, color: col(it.color), rotate: rot, opacity: op })
          })
        } else {
          // Non-Latin text: standard PDF fonts cannot encode it, so embed a crisp rendering instead
          const c = document.createElement('canvas').getContext('2d')!
          c.font = `${it.italic ? 'italic ' : ''}${it.bold ? 'bold ' : ''}${size}px ${FONT_CSS[fk]}`
          const lines = wrapText(it.text, it.w, (s) => c.measureText(s).width)
          const r = textToPng(lines, it)
          const img = await getImg(r.url)
          const [x, y] = P(it.x, it.y + r.h)
          page.drawImage(img, { x, y, width: r.w, height: r.h, rotate: rot, opacity: op })
        }
      } else if (it.type === 'rect' || it.type === 'whiteout' || it.type === 'highlight') {
        const sw = it.type === 'rect' ? (it.strokeWidth ?? 2) : 0
        const [x, y] = P(it.x + sw / 2, it.y + it.h - sw / 2)
        const fill = it.type === 'whiteout' ? '#ffffff' : it.type === 'highlight' ? (it.color ?? '#facc15') : it.fill
        page.drawRectangle({
          x, y, width: Math.max(0.1, it.w - sw), height: Math.max(0.1, it.h - sw), rotate: rot,
          color: fill ? col(fill) : undefined,
          opacity: it.type === 'highlight' ? (it.opacity ?? 0.4) : it.type === 'whiteout' ? 1 : op,
          borderColor: sw ? col(it.color) : undefined, borderWidth: sw || undefined, borderOpacity: op,
          blendMode: it.type === 'highlight' ? BlendMode.Multiply : undefined,
        })
      } else if (it.type === 'ellipse') {
        const sw = it.strokeWidth ?? 2
        const [x, y] = P(it.x + it.w / 2, it.y + it.h / 2)
        const xs = Math.max(0.1, (it.w - sw) / 2), ys = Math.max(0.1, (it.h - sw) / 2)
        const swap = info.rotate === 90 || info.rotate === 270
        page.drawEllipse({ x, y, xScale: swap ? ys : xs, yScale: swap ? xs : ys, color: it.fill ? col(it.fill) : undefined, opacity: op, borderColor: sw ? col(it.color) : undefined, borderWidth: sw || undefined, borderOpacity: op })
      } else if (it.type === 'line' || it.type === 'arrow') {
        const sw = it.strokeWidth ?? 2
        const x2 = it.x2 ?? it.x, y2 = it.y2 ?? it.y
        const end = it.type === 'arrow' ? arrowShaftEnd(it.x, it.y, x2, y2, sw) : [x2, y2]
        const [ax, ay] = P(it.x, it.y), [bx, by] = P(end[0], end[1])
        page.drawLine({ start: { x: ax, y: ay }, end: { x: bx, y: by }, thickness: sw, color: col(it.color), opacity: op, lineCap: LineCapStyle.Round })
        if (it.type === 'arrow') {
          const head = arrowHead(it.x, it.y, x2, y2, sw).map(([hx, hy]) => P(hx, hy))
          const d = `M ${head[0][0]} ${-head[0][1]} L ${head[1][0]} ${-head[1][1]} L ${head[2][0]} ${-head[2][1]} Z`
          page.drawSvgPath(d, { x: 0, y: 0, color: col(it.color), opacity: op })
        }
      } else if (it.type === 'pen' && it.points?.length) {
        const pts = it.points.map(([a, b]) => P(a, b))
        const d = smoothPath(pts, (p) => `${p[0].toFixed(2)} ${(-p[1]).toFixed(2)}`)
        page.drawSvgPath(d, { x: 0, y: 0, borderColor: col(it.color), borderWidth: it.strokeWidth ?? 2, borderOpacity: op, borderLineCap: LineCapStyle.Round })
      }
    }
    done++; onProgress?.(done / Math.max(1, keys.length))
  }
  return doc.save()
}
