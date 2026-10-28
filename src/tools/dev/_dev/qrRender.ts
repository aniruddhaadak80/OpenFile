/** Custom QR renderer: builds SVG path strings from a qrcode BitMatrix, usable for both SVG export and canvas (Path2D). */
export type ModuleStyle = 'square' | 'rounded' | 'dots' | 'classy'
export type EyeStyle = 'square' | 'rounded' | 'circle'

export interface Matrix { size: number; get(r: number, c: number): number | boolean }

const f = (n: number) => +n.toFixed(3)

/** rounded rect path, radii [tl, tr, br, bl]; reverse=true draws counter-clockwise (for holes) */
export function rrect(x: number, y: number, w: number, h: number, r: number[] | number, reverse = false) {
  const [tl, tr, br, bl] = (Array.isArray(r) ? r : [r, r, r, r]).map((v) => Math.min(v, w / 2, h / 2))
  if (!reverse) {
    return `M${f(x + tl)} ${f(y)}H${f(x + w - tr)}${tr ? `A${f(tr)} ${f(tr)} 0 0 1 ${f(x + w)} ${f(y + tr)}` : ''}V${f(y + h - br)}${br ? `A${f(br)} ${f(br)} 0 0 1 ${f(x + w - br)} ${f(y + h)}` : ''}H${f(x + bl)}${bl ? `A${f(bl)} ${f(bl)} 0 0 1 ${f(x)} ${f(y + h - bl)}` : ''}V${f(y + tl)}${tl ? `A${f(tl)} ${f(tl)} 0 0 1 ${f(x + tl)} ${f(y)}` : ''}Z`
  }
  return `M${f(x + tl)} ${f(y)}${tl ? `A${f(tl)} ${f(tl)} 0 0 0 ${f(x)} ${f(y + tl)}` : ''}V${f(y + h - bl)}${bl ? `A${f(bl)} ${f(bl)} 0 0 0 ${f(x + bl)} ${f(y + h)}` : ''}H${f(x + w - br)}${br ? `A${f(br)} ${f(br)} 0 0 0 ${f(x + w)} ${f(y + h - br)}` : ''}V${f(y + tr)}${tr ? `A${f(tr)} ${f(tr)} 0 0 0 ${f(x + w - tr)} ${f(y)}` : ''}Z`
}
const circle = (cx: number, cy: number, r: number) => `M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)}Z`

export function isFinder(r: number, c: number, n: number) {
  return (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7)
}

/** Returns path data in module units (origin = top-left of the symbol, excluding margin). */
export function buildPaths(m: Matrix, style: ModuleStyle, eye: EyeStyle, hole?: { x: number; y: number; w: number; h: number }) {
  const n = m.size
  const on = (r: number, c: number) => r >= 0 && c >= 0 && r < n && c < n && !!m.get(r, c) && !isFinder(r, c, n) && !inHole(r, c)
  const inHole = (r: number, c: number) => !!hole && c + 0.5 > hole.x && c + 0.5 < hole.x + hole.w && r + 0.5 > hole.y && r + 0.5 < hole.y + hole.h
  let data = ''
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!on(r, c)) continue
    if (style === 'square') data += `M${c} ${r}h1v1h-1Z`
    else if (style === 'dots') data += circle(c + 0.5, r + 0.5, 0.46)
    else {
      const t = on(r - 1, c), b = on(r + 1, c), l = on(r, c - 1), rt = on(r, c + 1)
      const R = 0.5
      if (style === 'rounded') data += rrect(c, r, 1, 1, [!t && !l ? R : 0, !t && !rt ? R : 0, !b && !rt ? R : 0, !b && !l ? R : 0])
      else data += rrect(c, r, 1, 1, [!t && !l ? R : 0, 0, !b && !rt ? R : 0, 0]) // classy: leaf corners
    }
  }
  let eyes = ''
  for (const [er, ec] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    if (eye === 'circle') {
      eyes += circle(ec + 3.5, er + 3.5, 3.5) + circle(ec + 3.5, er + 3.5, 2.5).replace(/A([\d.]+) ([\d.]+) 0 1 0/g, 'A$1 $2 0 1 1') + circle(ec + 3.5, er + 3.5, 1.5)
    } else {
      const ro = eye === 'rounded' ? 2 : 0, ri = eye === 'rounded' ? 1.4 : 0, rc = eye === 'rounded' ? 0.9 : 0
      eyes += rrect(ec, er, 7, 7, ro) + rrect(ec + 1, er + 1, 5, 5, ri, true) + rrect(ec + 2, er + 2, 3, 3, rc)
    }
  }
  return { data, eyes }
}

export interface RenderOpts {
  size: number; margin: number; fg: string; bg: string; eyeColor: string; transparent: boolean
  style: ModuleStyle; eye: EyeStyle; logo?: HTMLImageElement | null; logoDataUrl?: string | null; logoScale: number
}

function geometry(m: Matrix, o: RenderOpts) {
  const n = m.size, total = n + o.margin * 2, unit = o.size / total
  let hole: { x: number; y: number; w: number; h: number } | undefined
  let logoBox: { x: number; y: number; w: number; h: number } | undefined
  if (o.logo) {
    const ar = o.logo.naturalWidth / o.logo.naturalHeight || 1
    let lw = n * o.logoScale, lh = lw / ar
    if (lh > n * o.logoScale) { lh = n * o.logoScale; lw = lh * ar }
    const pad = 0.8
    hole = { x: (n - lw) / 2 - pad, y: (n - lh) / 2 - pad, w: lw + pad * 2, h: lh + pad * 2 }
    logoBox = { x: (n - lw) / 2, y: (n - lh) / 2, w: lw, h: lh }
  }
  return { n, total, unit, hole, logoBox }
}

export function drawQr(canvas: HTMLCanvasElement, m: Matrix, o: RenderOpts) {
  const g = geometry(m, o)
  canvas.width = canvas.height = o.size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, o.size, o.size)
  if (!o.transparent) { ctx.fillStyle = o.bg; ctx.fillRect(0, 0, o.size, o.size) }
  const { data, eyes } = buildPaths(m, o.style, o.eye, g.hole)
  ctx.save()
  ctx.scale(g.unit, g.unit); ctx.translate(o.margin, o.margin)
  ctx.fillStyle = o.fg; ctx.fill(new Path2D(data), 'evenodd')
  ctx.fillStyle = o.eyeColor; ctx.fill(new Path2D(eyes), 'evenodd')
  if (o.logo && g.logoBox && g.hole) {
    if (!o.transparent) { ctx.fillStyle = o.bg; ctx.fill(new Path2D(rrect(g.hole.x + 0.3, g.hole.y + 0.3, g.hole.w - 0.6, g.hole.h - 0.6, 1))) }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(o.logo, g.logoBox.x, g.logoBox.y, g.logoBox.w, g.logoBox.h)
  }
  ctx.restore()
}

export function qrSvg(m: Matrix, o: RenderOpts) {
  const g = geometry(m, o)
  const { data, eyes } = buildPaths(m, o.style, o.eye, g.hole)
  const T = `translate(${o.margin} ${o.margin})`
  let logo = ''
  if (o.logo && o.logoDataUrl && g.logoBox && g.hole) {
    logo = (o.transparent ? '' : `<path transform="${T}" fill="${o.bg}" d="${rrect(g.hole.x + 0.3, g.hole.y + 0.3, g.hole.w - 0.6, g.hole.h - 0.6, 1)}"/>`) +
      `<image transform="${T}" x="${f(g.logoBox.x)}" y="${f(g.logoBox.y)}" width="${f(g.logoBox.w)}" height="${f(g.logoBox.h)}" href="${o.logoDataUrl}" preserveAspectRatio="xMidYMid meet"/>`
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${g.total} ${g.total}" width="${o.size}" height="${o.size}" shape-rendering="${o.style === 'square' ? 'crispEdges' : 'geometricPrecision'}">
${o.transparent ? '' : `<rect width="100%" height="100%" fill="${o.bg}"/>`}
<path transform="${T}" fill="${o.fg}" fill-rule="evenodd" d="${data}"/>
<path transform="${T}" fill="${o.eyeColor}" fill-rule="evenodd" d="${eyes}"/>
${logo}
</svg>`
}
