/* DXF model for the CAD tools: parse with the MIT "dxf" package into layered polylines and text,
   then draw to Canvas 2D or write SVG. No DOM needed except for drawing. */

export type CadLine = { layer: string; rgb: [number, number, number]; pts: [number, number][] }
export type CadText = { layer: string; rgb: [number, number, number]; x: number; y: number; h: number; rot: number; text: string }
export type CadLayer = { name: string; rgb: [number, number, number]; count: number }
export type CadDoc = { lines: CadLine[]; texts: CadText[]; layers: CadLayer[]; bbox: { minX: number; minY: number; maxX: number; maxY: number }; units: string; entityCount: number; /** what is shown: 'Model', a paper layout, or 'Block library' when the file has only block definitions */ space: string }

const UNITS: Record<number, string> = { 0: 'unitless', 1: 'in', 2: 'ft', 3: 'mi', 4: 'mm', 5: 'cm', 6: 'm', 7: 'km', 8: 'µin', 9: 'mil', 10: 'yd', 14: 'dm' }

function cleanMText(s: string) {
  return s.replace(/\\P/g, '\n').replace(/\\S([^;#^/]*)[#^/]([^;]*);/g, '$1/$2').replace(/\\[ACcFfHhLlOoQqTtWw][^;]*;/g, '').replace(/\\[LlOoKk]/g, '').replace(/[{}]/g, '').replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±')
}

/** 2D affine matrix [a, b, c, d, e, f]: x' = a*x + c*y + e, y' = b*x + d*y + f. */
export type Mat = [number, number, number, number, number, number]
export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0]
export const mul = (m: Mat, n: Mat): Mat => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]
const apply = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
const MIRROR_X: Mat = [-1, 0, 0, 1, 0, 0]

/** Transforms for one INSERT: one matrix per row/column array cell. Order per the DXF spec:
 *  move block base point to origin, scale, rotate, place at insertion point (+ array offset), then apply the OCS flip
 *  for a (0,0,-1) extrusion. Array spacing follows the insert rotation but not its scale. */
export function insertMatrices(ins: { x?: number; y?: number; scaleX?: number; scaleY?: number; rotation?: number; rowCount?: number; columnCount?: number; rowSpacing?: number; columnSpacing?: number; extrusionZ?: number }, base: { x?: number; y?: number } = {}): Mat[] {
  const sx = Number.isFinite(ins.scaleX) && ins.scaleX !== 0 ? ins.scaleX! : 1
  const sy = Number.isFinite(ins.scaleY) && ins.scaleY !== 0 ? ins.scaleY! : 1
  const r = ((ins.rotation ?? 0) * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r)
  const rows = Math.max(1, Math.min(1000, Math.floor(ins.rowCount ?? 1))), cols = Math.max(1, Math.min(1000, Math.floor(ins.columnCount ?? 1)))
  const rs = ins.rowSpacing ?? 0, cs = ins.columnSpacing ?? 0
  const bx = base.x ?? 0, by = base.y ?? 0
  // linear part R * S, translation so that the base point lands on the insertion point
  const a = cos * sx, b = sin * sx, c = -sin * sy, d = cos * sy
  const out: Mat[] = []
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const px = (ins.x ?? 0) + cos * cs * j - sin * rs * i
    const py = (ins.y ?? 0) + sin * cs * j + cos * rs * i
    let m: Mat = [a, b, c, d, px - (a * bx + c * by), py - (b * bx + d * by)]
    if ((ins.extrusionZ ?? 1) < 0) m = mul(MIRROR_X, m)
    out.push(m)
  }
  return out
}

type Lib = { colors: number[][]; entityToPolyline: (e: any) => number[][] }
type Ctx = { blocks: Map<string, any>; layerColor: (layer: string) => number; lines: CadLine[]; texts: CadText[]; count: number }
const MAX_DEPTH = 16, MAX_PRIMS = 2_000_000

function textOf(e: any): { raw: string; x: number; y: number; h: number; rot: number } | null {
  if (e.type === 'ATTRIB' && ((e.attributeFlags ?? 0) & 1)) return null // invisible attribute
  // the dxf parser keeps ATTRIB geometry under .text (single line) or .mtext (multiline attribute)
  const isM = e.type === 'MTEXT' || (e.type === 'ATTRIB' && !!e.mtext?.string)
  const src = e.type === 'ATTRIB' ? (isM ? e.mtext : (e.text?.string !== undefined ? e.text : e)) : e
  const str = String(src.string ?? '')
  const raw = isM ? cleanMText(str) : str.replace(/%%[dD]/g, '°').replace(/%%[cC]/g, 'Ø').replace(/%%[pP]/g, '±').replace(/%%[uUoO]/g, '')
  if (!raw.trim()) return null
  const useAlign = !isM && (src.hAlign || src.vAlign) && Number.isFinite(src.x2)
  const x = useAlign ? src.x2 : src.x, y = useAlign ? src.y2 : src.y
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const h = src.textHeight ?? src.nominalTextHeight ?? 2.5
  const rot = isM && Number.isFinite(src.xAxisX) ? (Math.atan2(src.xAxisY ?? 0, src.xAxisX) * 180) / Math.PI : (src.rotation ?? 0)
  return { raw, x, y, h, rot }
}

function solidPts(e: any): number[][] {
  const c = (e.corners ?? []).filter((p: any) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
  if (c.length < 3) return c.map((p: any) => [p.x, p.y])
  // SOLID / 3DFACE corner order is 1, 2, 4, 3 around the outline
  const ord = c.length === 4 ? [c[0], c[1], c[3], c[2], c[0]] : [...c, c[0]]
  return ord.map((p: any) => [p.x, p.y])
}

/** Expand one entity list under matrix m. Layer "0" and BYBLOCK colour inherit from the insert. */
function walk(lib: Lib, ctx: Ctx, ents: any[], m: Mat, inh: { layer: string; color: number } | null, depth: number, stack: Set<string>) {
  for (const e of ents) {
    if (ctx.count > MAX_PRIMS) return
    if (e.type === 'VIEWPORT' || e.type === 'ATTDEF') continue
    const layer = inh && (e.layer === '0' || e.layer === undefined) ? inh.layer : (e.layer ?? '0')
    let color = 'colorNumber' in e ? e.colorNumber : 256
    if (color === 0) color = inh ? inh.color : 7
    if (color === 256 || color === undefined) color = ctx.layerColor(layer)
    const rgb = (lib.colors[Math.abs(color)] ?? lib.colors[7] ?? [255, 255, 255]) as [number, number, number]
    if (e.type === 'INSERT' || e.type === 'DIMENSION') {
      const block = ctx.blocks.get(e.block)
      if (!block || depth >= MAX_DEPTH || stack.has(e.block)) continue
      const next = new Set(stack).add(e.block)
      const mats = e.type === 'DIMENSION' ? [IDENTITY] : insertMatrices(e, block)
      for (const im of mats) walk(lib, ctx, block.entities ?? [], mul(m, im), { layer, color: Math.abs(color) }, depth + 1, next)
      continue
    }
    if (e.type === 'TEXT' || e.type === 'MTEXT' || e.type === 'ATTRIB') {
      const t = textOf(e); if (!t) continue
      const [x, y] = apply(m, t.x, t.y)
      const r = (t.rot * Math.PI) / 180
      const dx = m[0] * Math.cos(r) + m[2] * Math.sin(r), dy = m[1] * Math.cos(r) + m[3] * Math.sin(r)
      const k = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1
      ctx.texts.push({ layer, rgb, x, y, h: t.h * k, rot: (Math.atan2(dy, dx) * 180) / Math.PI, text: t.raw }); ctx.count++
      continue
    }
    if (e.type === 'POINT') {
      if (/^defpoints$/i.test(layer) || !Number.isFinite(e.x) || !Number.isFinite(e.y)) continue
      ctx.lines.push({ layer, rgb, pts: [apply(m, e.x, e.y)] }); ctx.count++
      continue
    }
    let pts: number[][] = []
    try {
      if (e.type === 'SOLID' || e.type === '3DFACE' || e.type === 'TRACE') pts = solidPts(e)
      // entityToPolyline appends the first vertex to closed polylines in place, so hand it a copy
      else pts = lib.entityToPolyline(e.vertices ? { ...e, vertices: [...e.vertices] } : e) ?? []
    } catch { pts = [] }
    // OCS (0,0,-1) for polylines and splines; arcs, circles and ellipses are flipped by entityToPolyline
    const flip = (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE' || e.type === 'SOLID') && (e.extrusionZ ?? 1) < 0
    const out = pts.filter((v) => Number.isFinite(v[0]) && Number.isFinite(v[1])).map((v) => apply(m, flip ? -v[0] : v[0], v[1]))
    if (out.length) { ctx.lines.push({ layer, rgb, pts: out }); ctx.count++ }
  }
}

export async function parseDxf(text: string): Promise<CadDoc> {
  if (!/SECTION/.test(text.slice(0, 5000)) && !/ENTITIES/.test(text)) throw new Error('This does not look like a text DXF file. Binary DXF and DWG are not supported, save as ASCII DXF first.')
  const dxf: any = await import('dxf')
  const lib0 = dxf.Helper ? dxf : dxf.default?.Helper ? dxf.default : dxf.default?.default
  const etp: any = await import('dxf/lib/entityToPolyline.js')
  const entityToPolyline = typeof etp.default === 'function' ? etp.default : typeof etp.default?.default === 'function' ? etp.default.default : etp
  const lib: Lib = { colors: lib0.colors, entityToPolyline }
  const parsed = new lib0.Helper(text).parsed
  const layerTable: Record<string, any> = parsed.tables?.layers ?? {}
  const blocks = new Map<string, any>((parsed.blocks ?? []).map((b: any) => [b.name, b]))
  const layerColor = (l: string) => { const c = layerTable[l]?.colorNumber; return Number.isFinite(c) ? Math.abs(c) : 7 }

  const render = (ents: any[]) => { const ctx: Ctx = { blocks, layerColor, lines: [], texts: [], count: 0 }; walk(lib, ctx, ents, IDENTITY, null, 0, new Set()); return ctx }
  const top: any[] = parsed.entities ?? []
  const modelBlock = [...blocks.values()].find((b) => /^\*model_space$/i.test(b.name))
  const model = top.filter((e) => !e.paperSpace)
  // 1. model space, 2. paper space layouts (the title block and sheet are usually INSERTs), 3. a sheet of every named block
  let space = 'Model'
  let ctx = render(model.length ? model : modelBlock?.entities ?? [])
  if (!ctx.count) {
    const layouts: [string, any[]][] = []
    const paperTop = top.filter((e) => e.paperSpace)
    if (paperTop.length) layouts.push(['Layout', paperTop])
    for (const b of blocks.values()) if (/^\*paper_space/i.test(b.name) && b.entities?.length) layouts.push([`Layout ${b.name.replace(/^\*paper_space/i, '') || '1'}`, b.entities])
    for (const [name, ents] of layouts) { const c = render(ents); if (c.count) { ctx = c; space = name; break } }
  }
  if (!ctx.count) {
    const lib2 = [...blocks.values()].filter((b) => !b.name.startsWith('*') && b.entities?.length)
    const cells = lib2.map((b) => { const c = render([{ type: 'INSERT', block: b.name, x: 0, y: 0, layer: '0' }]); return { name: b.name, c, box: boxOf(c.lines, c.texts) } }).filter((x) => x.c.count && x.box)
    if (cells.length) {
      const size = Math.max(...cells.map((x) => Math.max(x.box!.maxX - x.box!.minX, x.box!.maxY - x.box!.minY))) || 1
      const per = Math.ceil(Math.sqrt(cells.length)), gap = size * 1.4
      const merged: Ctx = { blocks, layerColor, lines: [], texts: [], count: 0 }
      cells.forEach((cell, i) => {
        const bw = cell.box!.maxX - cell.box!.minX, bh = cell.box!.maxY - cell.box!.minY
        const k = Math.max(bw, bh) > 0 ? size / Math.max(bw, bh) : 1
        const ox = (i % per) * gap, oy = -Math.floor(i / per) * gap
        const m: Mat = [k, 0, 0, k, ox - cell.box!.minX * k + (size - bw * k) / 2, oy - cell.box!.minY * k + (size - bh * k) / 2]
        for (const l of cell.c.lines) merged.lines.push({ ...l, pts: l.pts.map(([x, y]) => apply(m, x, y)) })
        for (const t of cell.c.texts) { const [x, y] = apply(m, t.x, t.y); merged.texts.push({ ...t, x, y, h: t.h * k }) }
        merged.texts.push({ layer: '0', rgb: [255, 255, 255], x: ox, y: oy - size * 0.15, h: size * 0.07, rot: 0, text: cell.name })
        merged.count += cell.c.count
      })
      ctx = merged; space = 'Block library'
    }
  }
  const box = boxOf(ctx.lines, ctx.texts)
  if (!box) throw new Error('The drawing has no entities that can be shown.')
  const layerMap = new Map<string, CadLayer>()
  for (const [name, t] of Object.entries(layerTable)) layerMap.set(name, { name, rgb: (lib.colors[Math.abs((t as any).colorNumber ?? 7)] ?? [255, 255, 255]) as [number, number, number], count: 0 })
  for (const l of [...ctx.lines, ...ctx.texts]) { const m = layerMap.get(l.layer) ?? { name: l.layer, rgb: l.rgb, count: 0 }; m.count++; layerMap.set(l.layer, m) }
  const unitCode = parsed.header?.insUnits ?? parsed.header?.$INSUNITS
  return { lines: ctx.lines, texts: ctx.texts, layers: [...layerMap.values()].filter((l) => l.count > 0).sort((a, b) => a.name.localeCompare(b.name)), bbox: box, units: UNITS[unitCode] ?? 'unitless', entityCount: ctx.count, space }
}

/** Bounds of lines and text (text extent estimated from height and length, rotation aware). */
export function boxOf(lines: CadLine[], texts: CadText[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const grow = (x: number, y: number) => { if (!Number.isFinite(x) || !Number.isFinite(y)) return; if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y }
  for (const l of lines) for (const [x, y] of l.pts) grow(x, y)
  for (const t of texts) {
    const r = (t.rot * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r)
    const w = t.h * Math.max(...t.text.split('\n').map((s) => s.length)) * 0.6, hh = t.h * t.text.split('\n').length
    grow(t.x, t.y); grow(t.x + w * cos, t.y + w * sin); grow(t.x - hh * sin, t.y + hh * cos); grow(t.x + w * cos - hh * sin, t.y + w * sin + hh * cos)
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null
}

export type DrawOpts = { hidden: Set<string>; mono?: string | null; bg?: string; lineWidth?: number }

/** Map ACI white (7) to the theme: white on dark, black on light. */
function colorFor(rgb: [number, number, number], bg: string, mono?: string | null) {
  if (mono) return mono
  const isWhite = rgb[0] > 240 && rgb[1] > 240 && rgb[2] > 240
  const light = bgIsLight(bg)
  if (isWhite) return light ? '#111' : '#f5f5f5'
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
}
const bgIsLight = (bg: string) => { if (bg === 'transparent') return true; const h = bg.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16); return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) > 150 }

/** Draw into ctx with a view transform: screen = (world - origin) * scale, Y flipped. */
export function drawCad(ctx: CanvasRenderingContext2D, doc: CadDoc, view: { scale: number; ox: number; oy: number }, o: DrawOpts) {
  const { width, height } = ctx.canvas
  const bg = o.bg ?? '#111111'
  ctx.save()
  if (bg === 'transparent') ctx.clearRect(0, 0, width, height); else { ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height) }
  ctx.lineWidth = o.lineWidth ?? 1
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  const sx = (x: number) => (x - view.ox) * view.scale, sy = (y: number) => height - (y - view.oy) * view.scale
  let cur = ''
  for (const l of doc.lines) {
    if (o.hidden.has(l.layer)) continue
    const c = colorFor(l.rgb, bg, o.mono)
    if (c !== cur) { ctx.strokeStyle = c; ctx.fillStyle = c; cur = c }
    ctx.beginPath()
    if (l.pts.length === 1) { ctx.arc(sx(l.pts[0][0]), sy(l.pts[0][1]), 1.5, 0, Math.PI * 2); ctx.fill(); continue }
    ctx.moveTo(sx(l.pts[0][0]), sy(l.pts[0][1]))
    for (let i = 1; i < l.pts.length; i++) ctx.lineTo(sx(l.pts[i][0]), sy(l.pts[i][1]))
    ctx.stroke()
  }
  for (const t of doc.texts) {
    if (o.hidden.has(t.layer)) continue
    const px = t.h * view.scale
    if (px < 2) continue
    ctx.fillStyle = colorFor(t.rgb, bg, o.mono)
    ctx.font = `${px}px sans-serif`
    ctx.save(); ctx.translate(sx(t.x), sy(t.y)); ctx.rotate((-t.rot * Math.PI) / 180)
    t.text.split('\n').forEach((line, i) => ctx.fillText(line, 0, i * px * 1.25))
    ctx.restore()
  }
  ctx.restore()
}

export function fitView(doc: CadDoc, w: number, h: number, pad = 0.05) {
  const bw = Math.max(1e-9, doc.bbox.maxX - doc.bbox.minX), bh = Math.max(1e-9, doc.bbox.maxY - doc.bbox.minY)
  const scale = Math.min((w * (1 - pad * 2)) / bw, (h * (1 - pad * 2)) / bh)
  return { scale, ox: doc.bbox.minX - (w / scale - bw) / 2, oy: doc.bbox.minY - (h / scale - bh) / 2 }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** Write an SVG in drawing units (Y flipped), grouped by layer. */
export function cadToSvg(doc: CadDoc, o: DrawOpts & { strokeWidth?: number; widthPx?: number }): string {
  const { minX, minY, maxX, maxY } = doc.bbox
  const w = maxX - minX || 1, h = maxY - minY || 1
  const pad = Math.max(w, h) * 0.02
  const bg = o.bg ?? 'transparent'
  const sw = o.strokeWidth ?? Math.max(w, h) / 1000
  const fy = (y: number) => (maxY - y + pad).toFixed(4), fx = (x: number) => (x - minX + pad).toFixed(4)
  const groups = new Map<string, string[]>()
  for (const l of doc.lines) {
    if (o.hidden.has(l.layer)) continue
    const c = colorFor(l.rgb, bg === 'transparent' ? '#ffffff' : bg, o.mono)
    const d = l.pts.length === 1 ? `<circle cx="${fx(l.pts[0][0])}" cy="${fy(l.pts[0][1])}" r="${sw}" fill="${c}"/>` : `<polyline fill="none" stroke="${c}" points="${l.pts.map(([x, y]) => `${fx(x)},${fy(y)}`).join(' ')}"/>`
    ;(groups.get(l.layer) ?? groups.set(l.layer, []).get(l.layer)!).push(d)
  }
  for (const t of doc.texts) {
    if (o.hidden.has(t.layer)) continue
    const c = colorFor(t.rgb, bg === 'transparent' ? '#ffffff' : bg, o.mono)
    const lines = t.text.split('\n').map((s, i) => `<tspan x="${fx(t.x)}" dy="${i ? t.h * 1.25 : 0}">${esc(s)}</tspan>`).join('')
    ;(groups.get(t.layer) ?? groups.set(t.layer, []).get(t.layer)!).push(`<text x="${fx(t.x)}" y="${fy(t.y)}" font-size="${t.h}" font-family="sans-serif" fill="${c}" transform="rotate(${-t.rot} ${fx(t.x)} ${fy(t.y)})">${lines}</text>`)
  }
  const W = w + pad * 2, H = h + pad * 2
  const px = o.widthPx ? ` width="${o.widthPx}" height="${(o.widthPx * H / W).toFixed(0)}"` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(4)} ${H.toFixed(4)}"${px}>\n${bg !== 'transparent' ? `<rect width="100%" height="100%" fill="${bg}"/>\n` : ''}<g stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">\n${[...groups].map(([name, items]) => `<g id="${esc(name).replace(/\s+/g, '_')}">\n${items.join('\n')}\n</g>`).join('\n')}\n</g>\n</svg>`
}
