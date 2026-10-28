/* DXF model for the CAD tools: parse with the MIT "dxf" package into layered polylines and text,
   then draw to Canvas 2D or write SVG. No DOM needed except for drawing. */

export type CadLine = { layer: string; rgb: [number, number, number]; pts: [number, number][] }
export type CadText = { layer: string; rgb: [number, number, number]; x: number; y: number; h: number; rot: number; text: string }
export type CadLayer = { name: string; rgb: [number, number, number]; count: number }
export type CadDoc = { lines: CadLine[]; texts: CadText[]; layers: CadLayer[]; bbox: { minX: number; minY: number; maxX: number; maxY: number }; units: string; entityCount: number }

const UNITS: Record<number, string> = { 0: 'unitless', 1: 'in', 2: 'ft', 3: 'mi', 4: 'mm', 5: 'cm', 6: 'm', 7: 'km', 8: 'µin', 9: 'mil', 10: 'yd', 14: 'dm' }

function cleanMText(s: string) {
  return s.replace(/\\P/g, '\n').replace(/\\[ACcFfHhLlOoQqTtWw][^;]*;/g, '').replace(/\\[LlOoKk]/g, '').replace(/[{}]/g, '').replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±')
}

export async function parseDxf(text: string): Promise<CadDoc> {
  if (!/SECTION/.test(text.slice(0, 5000)) && !/ENTITIES/.test(text)) throw new Error('This does not look like a text DXF file. Binary DXF and DWG are not supported, save as ASCII DXF first.')
  const dxf: any = await import('dxf')
  const lib = dxf.Helper ? dxf : dxf.default?.Helper ? dxf.default : dxf.default?.default
  const atm: any = await import('dxf/lib/applyTransforms.js')
  const applyTransforms: (pts: number[][], t: any[]) => number[][] = typeof atm.default === 'function' ? atm.default : typeof atm.default?.default === 'function' ? atm.default.default : atm
  const colors: number[][] = lib.colors
  const helper = new lib.Helper(text)
  const parsed = helper.parsed
  const { polylines } = helper.toPolylines()
  const ents: any[] = helper.denormalised
  const layerTable: Record<string, any> = parsed.tables?.layers ?? {}
  const lines: CadLine[] = []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const grow = (x: number, y: number) => { if (!Number.isFinite(x) || !Number.isFinite(y)) return; if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y }
  polylines.forEach((p: any, i: number) => {
    const pts = (p.vertices as number[][]).filter((v) => Number.isFinite(v[0]) && Number.isFinite(v[1])).map((v) => [v[0], v[1]] as [number, number])
    if (pts.length < 1) return
    pts.forEach(([x, y]) => grow(x, y))
    lines.push({ layer: ents[i]?.layer ?? p.layer?.name ?? '0', rgb: (p.rgb ?? [255, 255, 255]) as [number, number, number], pts })
  })
  const texts: CadText[] = []
  for (const e of ents) {
    if (e.type !== 'TEXT' && e.type !== 'MTEXT' && e.type !== 'ATTRIB') continue
    const raw = e.type === 'MTEXT' ? cleanMText(e.string ?? '') : String(e.string ?? '').replace(/%%[dD]/g, '°').replace(/%%[cC]/g, 'Ø').replace(/%%[pP]/g, '±')
    if (!raw.trim()) continue
    const useAlign = e.type === 'TEXT' && (e.hAlign || e.vAlign) && Number.isFinite(e.x2)
    let [[x, y]] = applyTransforms([[useAlign ? e.x2 : e.x, useAlign ? e.y2 : e.y]], e.transforms ?? [])
    const scale = (e.transforms ?? []).reduce((a: number, t: any) => a * Math.abs(t.scaleX ?? 1), 1)
    const h = (e.textHeight ?? e.nominalTextHeight ?? 2.5) * scale
    const rot = e.type === 'MTEXT' && Number.isFinite(e.xAxisX) ? Math.atan2(e.xAxisY ?? 0, e.xAxisX) * 180 / Math.PI : (e.rotation ?? 0)
    const col = 'colorNumber' in e ? colors[e.colorNumber] : colors[layerTable[e.layer]?.colorNumber ?? 7]
    texts.push({ layer: e.layer ?? '0', rgb: (col ?? [255, 255, 255]) as [number, number, number], x, y, h, rot, text: raw })
    grow(x, y); grow(x + h * raw.length * 0.6, y + h)
  }
  const layerMap = new Map<string, CadLayer>()
  for (const [name, t] of Object.entries(layerTable)) layerMap.set(name, { name, rgb: (colors[(t as any).colorNumber] ?? [255, 255, 255]) as [number, number, number], count: 0 })
  for (const l of [...lines, ...texts]) { const m = layerMap.get(l.layer) ?? { name: l.layer, rgb: l.rgb, count: 0 }; m.count++; layerMap.set(l.layer, m) }
  if (!Number.isFinite(minX)) throw new Error('The drawing has no entities that can be shown.')
  const unitCode = parsed.header?.insUnits ?? parsed.header?.$INSUNITS
  return { lines, texts, layers: [...layerMap.values()].filter((l) => l.count > 0).sort((a, b) => a.name.localeCompare(b.name)), bbox: { minX, minY, maxX, maxY }, units: UNITS[unitCode] ?? 'unitless', entityCount: ents.length }
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
