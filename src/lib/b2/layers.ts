/* Document model for the Layer Editor (Batch 2).
   The geometry and project (de)serialisation helpers are pure and Node-testable. Drawing helpers take a
   CanvasRenderingContext2D and are only called in the browser. */

export type Blend = 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity'
export const BLENDS: { value: Blend; label: string }[] = [
  { value: 'source-over', label: 'Normal' }, { value: 'multiply', label: 'Multiply' }, { value: 'screen', label: 'Screen' }, { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' }, { value: 'lighten', label: 'Lighten' }, { value: 'color-dodge', label: 'Color dodge' }, { value: 'color-burn', label: 'Color burn' },
  { value: 'hard-light', label: 'Hard light' }, { value: 'soft-light', label: 'Soft light' }, { value: 'difference', label: 'Difference' }, { value: 'exclusion', label: 'Exclusion' },
  { value: 'hue', label: 'Hue' }, { value: 'saturation', label: 'Saturation' }, { value: 'color', label: 'Color' }, { value: 'luminosity', label: 'Luminosity' },
]
/** Canvas composite operation <-> ag-psd blend mode names. */
export const PSD_BLEND: Record<Blend, string> = {
  'source-over': 'normal', multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten', 'color-dodge': 'color dodge', 'color-burn': 'color burn',
  'hard-light': 'hard light', 'soft-light': 'soft light', difference: 'difference', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity',
}
export const blendFromPsd = (m?: string): Blend => (Object.entries(PSD_BLEND).find(([, v]) => v === m)?.[0] as Blend) ?? 'source-over'

export type ShapeKind = 'rect' | 'ellipse' | 'triangle' | 'line'
type Base = {
  id: string; name: string
  /** centre of the layer in document pixels */
  x: number; y: number
  /** unscaled size in layer pixels */
  w: number; h: number
  rot: number // degrees
  sx: number; sy: number // scale (negative flips)
  opacity: number // 0..1
  blend: Blend
  visible: boolean
  locked: boolean
}
export type RasterLayer<B = unknown> = Base & { kind: 'raster'; bmp: B }
export type TextLayer = Base & { kind: 'text'; text: string; font: string; size: number; weight: number; italic: boolean; color: string; align: 'left' | 'center' | 'right'; lineHeight: number; stroke: number; strokeColor: string }
export type ShapeLayer = Base & { kind: 'shape'; shape: ShapeKind; fill: string; noFill: boolean; stroke: string; strokeWidth: number; radius: number }
export type Layer<B = unknown> = RasterLayer<B> | TextLayer | ShapeLayer
export type Doc<B = unknown> = { w: number; h: number; bg: string /* css colour or 'transparent' */; layers: Layer<B>[] /* bottom to top */ }

export const uid = () => Math.random().toString(36).slice(2, 10)
export const baseLayer = (name: string, x: number, y: number, w: number, h: number): Base => ({ id: uid(), name, x, y, w, h, rot: 0, sx: 1, sy: 1, opacity: 1, blend: 'source-over', visible: true, locked: false })

/* ---------------- geometry ---------------- */
const RAD = Math.PI / 180
/** Document point -> layer-local point (0..w, 0..h inside the layer). */
export function toLocal(l: Pick<Base, 'x' | 'y' | 'w' | 'h' | 'rot' | 'sx' | 'sy'>, px: number, py: number): [number, number] {
  const dx = px - l.x, dy = py - l.y, c = Math.cos(-l.rot * RAD), s = Math.sin(-l.rot * RAD)
  const rx = dx * c - dy * s, ry = dx * s + dy * c
  return [rx / (l.sx || 1e-6) + l.w / 2, ry / (l.sy || 1e-6) + l.h / 2]
}
/** Layer-local point -> document point. */
export function toDoc(l: Pick<Base, 'x' | 'y' | 'w' | 'h' | 'rot' | 'sx' | 'sy'>, lx: number, ly: number): [number, number] {
  const ux = (lx - l.w / 2) * l.sx, uy = (ly - l.h / 2) * l.sy, c = Math.cos(l.rot * RAD), s = Math.sin(l.rot * RAD)
  return [l.x + ux * c - uy * s, l.y + ux * s + uy * c]
}
export function corners(l: Pick<Base, 'x' | 'y' | 'w' | 'h' | 'rot' | 'sx' | 'sy'>): [number, number][] {
  return [toDoc(l, 0, 0), toDoc(l, l.w, 0), toDoc(l, l.w, l.h), toDoc(l, 0, l.h)]
}
export function bounds(l: Pick<Base, 'x' | 'y' | 'w' | 'h' | 'rot' | 'sx' | 'sy'>) {
  const c = corners(l), xs = c.map((p) => p[0]), ys = c.map((p) => p[1])
  const x0 = Math.floor(Math.min(...xs)), y0 = Math.floor(Math.min(...ys))
  return { x: x0, y: y0, w: Math.ceil(Math.max(...xs)) - x0, h: Math.ceil(Math.max(...ys)) - y0 }
}
export function contains(l: Pick<Base, 'x' | 'y' | 'w' | 'h' | 'rot' | 'sx' | 'sy'>, px: number, py: number, pad = 0) {
  const [lx, ly] = toLocal(l, px, py)
  const padX = pad / Math.abs(l.sx || 1), padY = pad / Math.abs(l.sy || 1)
  return lx >= -padX && ly >= -padY && lx <= l.w + padX && ly <= l.h + padY
}
/** Topmost visible, unlocked layer under a document point. */
export function hitTest<B>(doc: Doc<B>, px: number, py: number, pad = 0): Layer<B> | undefined {
  for (let i = doc.layers.length - 1; i >= 0; i--) { const l = doc.layers[i]; if (l.visible && !l.locked && contains(l, px, py, pad)) return l }
  return undefined
}
/** Move every layer so a crop rectangle becomes the new document. */
export function cropDoc<B>(doc: Doc<B>, r: { x: number; y: number; w: number; h: number }): Doc<B> {
  const w = Math.max(1, Math.round(r.w)), h = Math.max(1, Math.round(r.h))
  return { ...doc, w, h, layers: doc.layers.map((l) => ({ ...l, x: l.x - Math.round(r.x), y: l.y - Math.round(r.y) })) }
}
/** Normalise a drag rectangle and clamp it to the document. */
export function normRect(x0: number, y0: number, x1: number, y1: number, W: number, H: number) {
  const ax = Math.max(0, Math.min(W, Math.min(x0, x1))), ay = Math.max(0, Math.min(H, Math.min(y0, y1)))
  const bx = Math.max(0, Math.min(W, Math.max(x0, x1))), by = Math.max(0, Math.min(H, Math.max(y0, y1)))
  return { x: ax, y: ay, w: bx - ax, h: by - ay }
}
export function moveLayer<B>(doc: Doc<B>, id: string, dir: 1 | -1 | 'top' | 'bottom'): Doc<B> {
  const i = doc.layers.findIndex((l) => l.id === id); if (i < 0) return doc
  const arr = doc.layers.slice(); const [l] = arr.splice(i, 1)
  const j = dir === 'top' ? arr.length : dir === 'bottom' ? 0 : Math.max(0, Math.min(arr.length, i + dir))
  arr.splice(j, 0, l)
  return { ...doc, layers: arr }
}

/* ---------------- project files ---------------- */
export const PROJECT_APP = 'openfile-layer-editor'
export type ProjectLayer = Omit<Layer, 'bmp'> & { src?: string }
export type Project = { app: typeof PROJECT_APP; version: 1; w: number; h: number; bg: string; layers: ProjectLayer[] }

/** Serialise; `encode` turns a raster bitmap into a data URL. */
export function toProject<B>(doc: Doc<B>, encode: (b: B) => string): Project {
  return {
    app: PROJECT_APP, version: 1, w: doc.w, h: doc.h, bg: doc.bg,
    layers: doc.layers.map((l) => { if (l.kind === 'raster') { const { bmp, ...rest } = l; return { ...rest, src: encode(bmp) } } return { ...l } }) as ProjectLayer[],
  }
}
/** Validate a parsed project. Throws a readable error. Raster layers keep `src` for the caller to decode. */
export function parseProject(j: any): Project {
  if (!j || j.app !== PROJECT_APP) throw new Error('This is not a Layer Editor project file.')
  if (j.version !== 1) throw new Error('This project was saved by a newer version of the editor.')
  const num = (v: any, d: number) => (typeof v === 'number' && isFinite(v) ? v : d)
  const W = Math.round(num(j.w, 0)), H = Math.round(num(j.h, 0))
  if (W < 1 || H < 1 || W > 16384 || H > 16384) throw new Error('The project has an invalid canvas size.')
  if (!Array.isArray(j.layers)) throw new Error('The project has no layers list.')
  const layers = j.layers.map((l: any, i: number) => {
    if (!l || !['raster', 'text', 'shape'].includes(l.kind)) throw new Error(`Layer ${i + 1} has an unknown type.`)
    if (l.kind === 'raster' && typeof l.src !== 'string') throw new Error(`Layer ${i + 1} is missing its image.`)
    return {
      ...l, id: typeof l.id === 'string' ? l.id : uid(), name: String(l.name ?? `Layer ${i + 1}`),
      x: num(l.x, W / 2), y: num(l.y, H / 2), w: Math.max(1, num(l.w, 1)), h: Math.max(1, num(l.h, 1)), rot: num(l.rot, 0), sx: num(l.sx, 1), sy: num(l.sy, 1),
      opacity: Math.max(0, Math.min(1, num(l.opacity, 1))), blend: BLENDS.some((b) => b.value === l.blend) ? l.blend : 'source-over', visible: l.visible !== false, locked: !!l.locked,
    }
  })
  return { app: PROJECT_APP, version: 1, w: W, h: H, bg: typeof j.bg === 'string' ? j.bg : 'transparent', layers }
}

/* ---------------- drawing (browser) ---------------- */
export const fontString = (t: Pick<TextLayer, 'italic' | 'weight' | 'size' | 'font'>) => `${t.italic ? 'italic ' : ''}${t.weight} ${t.size}px "${t.font}", sans-serif`
/** Size of a text block, for setting w/h after an edit. */
export function measureText(ctx: CanvasRenderingContext2D, t: Pick<TextLayer, 'italic' | 'weight' | 'size' | 'font' | 'text' | 'lineHeight' | 'stroke'>) {
  ctx.font = fontString(t)
  const lines = t.text.split('\n'), pad = Math.ceil(t.stroke + t.size * 0.12)
  const w = Math.max(1, ...lines.map((s) => ctx.measureText(s || ' ').width))
  return { w: Math.ceil(w + pad * 2), h: Math.ceil(lines.length * t.size * t.lineHeight + pad * 2) }
}

function shapePath(ctx: CanvasRenderingContext2D, l: ShapeLayer, inset: number) {
  const w = l.w, h = l.h
  ctx.beginPath()
  if (l.shape === 'rect') {
    const r = Math.max(0, Math.min(l.radius, w / 2 - inset, h / 2 - inset))
    ctx.roundRect(inset, inset, Math.max(0, w - inset * 2), Math.max(0, h - inset * 2), r)
  } else if (l.shape === 'ellipse') ctx.ellipse(w / 2, h / 2, Math.max(0, w / 2 - inset), Math.max(0, h / 2 - inset), 0, 0, Math.PI * 2)
  else if (l.shape === 'triangle') { ctx.moveTo(w / 2, inset); ctx.lineTo(w - inset, h - inset); ctx.lineTo(inset, h - inset); ctx.closePath() }
  else { ctx.moveTo(inset, h / 2); ctx.lineTo(w - inset, h / 2) }
}

/** Draw a layer's content in its local box (0..w, 0..h). */
export function drawContent(ctx: CanvasRenderingContext2D, l: Layer<CanvasImageSource>) {
  if (l.kind === 'raster') { ctx.drawImage(l.bmp, 0, 0, l.w, l.h); return }
  if (l.kind === 'shape') {
    const sw = l.strokeWidth, inset = l.shape === 'line' ? sw / 2 : sw / 2
    shapePath(ctx, l, l.shape === 'line' ? 0 : inset)
    if (l.shape !== 'line' && !l.noFill) { ctx.fillStyle = l.fill; ctx.fill() }
    if (sw > 0) { ctx.lineWidth = sw; ctx.strokeStyle = l.stroke; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke() }
    return
  }
  ctx.font = fontString(l); ctx.textBaseline = 'top'; ctx.textAlign = l.align
  const pad = Math.ceil(l.stroke + l.size * 0.12), lh = l.size * l.lineHeight
  const x = l.align === 'left' ? pad : l.align === 'right' ? l.w - pad : l.w / 2
  l.text.split('\n').forEach((s, i) => {
    const y = pad + i * lh + (lh - l.size) / 2
    if (l.stroke > 0) { ctx.lineWidth = l.stroke * 2; ctx.strokeStyle = l.strokeColor; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y) }
    ctx.fillStyle = l.color; ctx.fillText(s, x, y)
  })
}

export function applyTransform(ctx: CanvasRenderingContext2D, l: Base, k = 1) {
  ctx.translate(l.x * k, l.y * k); ctx.rotate(l.rot * RAD); ctx.scale(l.sx * k, l.sy * k); ctx.translate(-l.w / 2, -l.h / 2)
}

/** Composite the whole document. `k` scales output (for thumbnails). `override` swaps one layer's bitmap (live filter preview). */
export function renderDoc(ctx: CanvasRenderingContext2D, doc: Doc<CanvasImageSource>, opts: { k?: number; bg?: boolean; override?: { id: string; bmp: CanvasImageSource } } = {}) {
  const k = opts.k ?? 1
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  if (opts.bg !== false && doc.bg !== 'transparent') { ctx.fillStyle = doc.bg; ctx.fillRect(0, 0, doc.w * k, doc.h * k) }
  ctx.imageSmoothingQuality = 'high'
  for (const l0 of doc.layers) {
    if (!l0.visible || l0.opacity <= 0) continue
    const l = opts.override && l0.id === opts.override.id && l0.kind === 'raster' ? { ...l0, bmp: opts.override.bmp } : l0
    ctx.save(); ctx.globalAlpha = l.opacity; ctx.globalCompositeOperation = l.blend
    applyTransform(ctx, l, k); drawContent(ctx, l)
    ctx.restore()
  }
  ctx.restore()
}

/** Rasterise any layer into a raster layer covering its on-canvas bounds (no rotation or scale left). */
export function rasterize(l: Layer<CanvasImageSource>): RasterLayer<HTMLCanvasElement> {
  const b = bounds(l), c = document.createElement('canvas'); c.width = Math.max(1, b.w); c.height = Math.max(1, b.h)
  const ctx = c.getContext('2d')!; ctx.translate(-b.x, -b.y); applyTransform(ctx, l); drawContent(ctx, l)
  return { ...baseLayer(l.name, b.x + b.w / 2, b.y + b.h / 2, c.width, c.height), id: l.id, opacity: l.opacity, blend: l.blend, visible: l.visible, locked: l.locked, kind: 'raster', bmp: c }
}

/* ---------------- pixel filters (browser, on a canvas copy) ---------------- */
export type Filters = { brightness: number; contrast: number; saturation: number; hue: number; blur: number; grayscale: number; sepia: number; invert: number; sharpen: number }
export const NO_FILTERS: Filters = { brightness: 0, contrast: 0, saturation: 0, hue: 0, blur: 0, grayscale: 0, sepia: 0, invert: 0, sharpen: 0 }
export const isNoFilter = (f: Filters) => (Object.keys(NO_FILTERS) as (keyof Filters)[]).every((k) => f[k] === NO_FILTERS[k])

/** Per-pixel colour filters on an RGBA buffer (pure). brightness/contrast/saturation -100..100, hue -180..180, others 0..100. */
export function colorFilter(d: Uint8ClampedArray, f: Filters) {
  const br = f.brightness * 2.55, ct = (100 + f.contrast) / 100, ctk = ct * ct, sat = 1 + f.saturation / 100
  const gs = f.grayscale / 100, sp = f.sepia / 100, inv = f.invert / 100
  const h = (f.hue * Math.PI) / 180, cosH = Math.cos(h), sinH = Math.sin(h)
  // hue rotation matrix (luminance preserving)
  const m = [
    0.213 + cosH * 0.787 - sinH * 0.213, 0.715 - cosH * 0.715 - sinH * 0.715, 0.072 - cosH * 0.072 + sinH * 0.928,
    0.213 - cosH * 0.213 + sinH * 0.143, 0.715 + cosH * 0.285 + sinH * 0.14, 0.072 - cosH * 0.072 - sinH * 0.283,
    0.213 - cosH * 0.213 - sinH * 0.787, 0.715 - cosH * 0.715 + sinH * 0.715, 0.072 + cosH * 0.928 + sinH * 0.072,
  ]
  const doHue = f.hue !== 0
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2]
    if (br) { r += br; g += br; b += br }
    if (ct !== 1) { r = (r - 128) * ctk + 128; g = (g - 128) * ctk + 128; b = (b - 128) * ctk + 128 }
    if (doHue) { const R = r, G = g, B = b; r = m[0] * R + m[1] * G + m[2] * B; g = m[3] * R + m[4] * G + m[5] * B; b = m[6] * R + m[7] * G + m[8] * B }
    if (sat !== 1) { const y = 0.2126 * r + 0.7152 * g + 0.0722 * b; r = y + (r - y) * sat; g = y + (g - y) * sat; b = y + (b - y) * sat }
    if (gs) { const y = 0.2126 * r + 0.7152 * g + 0.0722 * b; r += (y - r) * gs; g += (y - g) * gs; b += (y - b) * gs }
    if (sp) { const R = r, G = g, B = b; r += (Math.min(255, 0.393 * R + 0.769 * G + 0.189 * B) - R) * sp; g += (Math.min(255, 0.349 * R + 0.686 * G + 0.168 * B) - G) * sp; b += (Math.min(255, 0.272 * R + 0.534 * G + 0.131 * B) - B) * sp }
    if (inv) { r += (255 - 2 * r) * inv; g += (255 - 2 * g) * inv; b += (255 - 2 * b) * inv }
    d[i] = r; d[i + 1] = g; d[i + 2] = b
  }
}
