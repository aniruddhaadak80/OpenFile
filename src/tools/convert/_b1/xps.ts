/* XPS / OpenXPS reader: a ZIP of XML fixed pages. Each FixedPage is translated to an SVG
 * (paths, solid / gradient / image brushes, clips, transforms, opacity and Glyphs text with the
 * embedded fonts), which the browser then draws. Pure parsing helpers live in xpsCore.ts. */
import type JSZipType from 'jszip'
import { IDENT, mul, apply, parseMatrix, parseColor, geometryToSvg, parseIndices, unescapeUnicode, readFontMetrics, deobfuscateFont, layoutGlyphs, resolvePart, type Mat, type FontMetrics } from './xpsCore'

export interface XpsPageRef { path: string; width: number; height: number }
export interface XpsDoc { zip: JSZipType; pages: XpsPageRef[]; files: Map<string, string>; fonts: Map<string, { family: string; metrics: FontMetrics | null; rule: string }>; images: Map<string, { url: string; w: number; h: number } | null> }
export interface TextRun { text: string; x: number; y: number; size: number; angle: number; width: number }
export interface XpsPageSvg { svg: string; width: number; height: number; texts: TextRun[]; warnings: string[] }

const parse = (s: string) => {
  const d = new DOMParser().parseFromString(s, 'application/xml')
  if (d.getElementsByTagName('parsererror').length) throw new Error('A page inside this XPS file is not valid XML.')
  return d
}
const r = (n: number) => { const v = Math.round(n * 1000) / 1000; return Object.is(v, -0) ? '0' : String(v) }
const matStr = (m: Mat) => `matrix(${m.map(r).join(' ')})`
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const xmlSafe = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
const kids = (el: Element) => Array.from(el.children)

function b64(bytes: Uint8Array) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)))
  return btoa(s)
}

async function readPart(doc: { zip: JSZipType; files: Map<string, string> }, path: string): Promise<Uint8Array | null> {
  const real = doc.files.get(path.toLowerCase())
  if (real) return doc.zip.file(real)!.async('uint8array')
  // interleaved parts: path/[0].piece, path/[1].piece ... path/[n].last.piece
  const pieces = [...doc.files.entries()].filter(([k]) => k.startsWith(path.toLowerCase() + '/[')).sort((a, b) => parseInt(a[0].split('[')[1]) - parseInt(b[0].split('[')[1]))
  if (!pieces.length) return null
  const parts = await Promise.all(pieces.map(([, v]) => doc.zip.file(v)!.async('uint8array')))
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
const readText = async (doc: { zip: JSZipType; files: Map<string, string> }, path: string) => { const b = await readPart(doc, path); return b ? new TextDecoder().decode(b) : null }

export async function openXps(file: Blob): Promise<XpsDoc> {
  const JSZip = (await import('jszip')).default
  let zip: JSZipType
  try { zip = await JSZip.loadAsync(await file.arrayBuffer()) } catch { throw new Error('This file is not an XPS document (it is not a valid package).') }
  const files = new Map<string, string>()
  zip.forEach((p, f) => { if (!f.dir) files.set(p.replace(/^\//, '').toLowerCase(), p) })
  const ctx = { zip, files }
  // find the FixedDocumentSequence from the package relationships
  let seqPath: string | null = null
  const rels = await readText(ctx, '_rels/.rels')
  if (rels) for (const rel of Array.from(parse(rels).getElementsByTagName('Relationship'))) if (/fixedrepresentation/i.test(rel.getAttribute('Type') || '')) seqPath = resolvePart('', rel.getAttribute('Target') || '')
  if (!seqPath) seqPath = [...files.keys()].find((k) => k.endsWith('.fdseq')) ?? null
  const pages: XpsPageRef[] = []
  const addDoc = async (docPath: string) => {
    const t = await readText(ctx, docPath); if (!t) return
    for (const pc of Array.from(parse(t).getElementsByTagNameNS('*', 'PageContent'))) {
      const src = pc.getAttribute('Source'); if (!src) continue
      pages.push({ path: resolvePart(docPath, src), width: +(pc.getAttribute('Width') || 0), height: +(pc.getAttribute('Height') || 0) })
    }
  }
  if (seqPath) {
    const t = await readText(ctx, seqPath)
    if (t) for (const dr of Array.from(parse(t).getElementsByTagNameNS('*', 'DocumentReference'))) { const s = dr.getAttribute('Source'); if (s) await addDoc(resolvePart(seqPath, s)) }
  }
  if (!pages.length) for (const k of [...files.keys()].filter((k) => k.endsWith('.fdoc'))) await addDoc(k)
  if (!pages.length) for (const k of [...files.keys()].filter((k) => k.endsWith('.fpage')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) pages.push({ path: k, width: 0, height: 0 })
  if (!pages.length) throw new Error('No pages were found in this XPS file.')
  return { zip, pages, files, fonts: new Map(), images: new Map() }
}

async function loadFont(doc: XpsDoc, path: string) {
  if (doc.fonts.has(path)) return doc.fonts.get(path)!
  let data = await readPart(doc, path)
  let entry = { family: 'sans-serif', metrics: null as FontMetrics | null, rule: '' }
  if (data) {
    if (/\.odttf$/i.test(path) || readFontMetrics(data) === null) { const d2 = deobfuscateFont(data, path); if (readFontMetrics(d2)) data = d2 }
    const family = 'xpsf' + doc.fonts.size
    const metrics = readFontMetrics(data)
    entry = { family, metrics, rule: `@font-face{font-family:"${family}";src:url(data:font/${metrics?.isTrueType === false ? 'otf' : 'ttf'};base64,${b64(data)})}` }
  }
  doc.fonts.set(path, entry)
  return entry
}

async function loadImage(doc: XpsDoc, path: string, warn: Set<string>) {
  if (doc.images.has(path)) return doc.images.get(path)!
  const data = await readPart(doc, path)
  let out: { url: string; w: number; h: number } | null = null
  if (data) {
    const lower = path.toLowerCase()
    try {
      if (/\.(tif|tiff)$/.test(lower) || (data[0] === 0x49 && data[1] === 0x49) || (data[0] === 0x4d && data[1] === 0x4d)) {
        const UTIF: any = (await import('utif')).default ?? (await import('utif'))
        const ifds = UTIF.decode(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
        UTIF.decodeImage(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), ifds[0])
        const rgba = UTIF.toRGBA8(ifds[0])
        const c = document.createElement('canvas'); c.width = ifds[0].width; c.height = ifds[0].height
        c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length), c.width, c.height), 0, 0)
        out = { url: c.toDataURL('image/png'), w: c.width, h: c.height }
      } else if (/\.(wdp|jxr|hdp)$/.test(lower)) {
        warn.add('Some pictures use the JPEG XR format, which browsers cannot show. They were left out.')
      } else {
        const mime = data[0] === 0x89 ? 'image/png' : data[0] === 0xff ? 'image/jpeg' : data[0] === 0x47 ? 'image/gif' : 'image/png'
        const url = `data:${mime};base64,${b64(data)}`
        const img = new Image(); img.src = url
        await img.decode()
        out = { url, w: img.naturalWidth, h: img.naturalHeight }
      }
    } catch { warn.add('Some pictures could not be read and were left out.') }
  }
  doc.images.set(path, out)
  return out
}

interface Ctx { m: Mat; opacity: number; res: Map<string, Element>[] }

export async function xpsPageToSvg(doc: XpsDoc, index: number): Promise<XpsPageSvg> {
  const ref = doc.pages[index]
  const xml = await readText(doc, ref.path)
  if (!xml) throw new Error(`Page ${index + 1} is missing from this XPS file.`)
  const page = parse(xml).documentElement
  const W = +(page.getAttribute('Width') || ref.width || 816), H = +(page.getAttribute('Height') || ref.height || 1056)
  const warn = new Set<string>()
  const defs: string[] = [], body: string[] = [], texts: TextRun[] = []
  const usedFonts = new Set<string>()
  let idN = 0
  const nid = (p: string) => `${p}${index}_${++idN}`

  const loadDict = async (el: Element): Promise<Map<string, Element>> => {
    const map = new Map<string, Element>()
    for (const rd of Array.from(el.getElementsByTagNameNS('*', 'ResourceDictionary')).filter((x) => x.parentElement === el || x.parentElement?.parentElement === el)) {
      const src = rd.getAttribute('Source')
      let holder: Element = rd
      if (src) { const t = await readText(doc, resolvePart(ref.path, src)); if (t) holder = parse(t).documentElement }
      for (const c of kids(holder)) { const k = c.getAttribute('x:Key') ?? c.getAttributeNS('http://schemas.microsoft.com/winfx/2006/xaml', 'Key'); if (k) map.set(k, c) }
    }
    return map
  }
  const lookup = (ctx: Ctx, v: string | null): Element | null => {
    const m = v ? /^\{StaticResource\s+([^}]+)\}$/.exec(v.trim()) : null
    if (!m) return null
    for (let i = ctx.res.length - 1; i >= 0; i--) { const e = ctx.res[i].get(m[1].trim()); if (e) return e }
    return null
  }
  /** Value of attribute "Name" or property element "<Tag.Name>". */
  const prop = (el: Element, name: string): { attr: string | null; el: Element | null } => {
    const a = el.getAttribute(name)
    const pe = kids(el).find((c) => c.localName === `${el.localName}.${name}`)
    return { attr: a, el: pe ? kids(pe)[0] ?? null : null }
  }
  const transformOf = (ctx: Ctx, el: Element, name: string): Mat => {
    const p = prop(el, name)
    if (p.attr) { const res = lookup(ctx, p.attr); return res ? parseMatrix(res.getAttribute('Matrix')) : parseMatrix(p.attr) }
    if (p.el) return parseMatrix(p.el.getAttribute('Matrix'))
    return IDENT
  }
  const geometryOf = (ctx: Ctx, el: Element | null, attr: string | null): { d: string; rule: string; m: Mat } | null => {
    let g = el
    if (attr) { const res = lookup(ctx, attr); if (res) g = res; else { const p = geometryToSvg(attr); return p.d ? { ...p, m: IDENT } : null } }
    if (!g) return null
    if (g.localName === 'PathGeometry') {
      const rule = g.getAttribute('FillRule') === 'NonZero' ? 'nonzero' : 'evenodd'
      const m = transformOf(ctx, g, 'Transform')
      let d = g.getAttribute('Figures') ? geometryToSvg(g.getAttribute('Figures')).d : ''
      for (const fig of Array.from(g.getElementsByTagNameNS('*', 'PathFigure'))) {
        d += ` M${fig.getAttribute('StartPoint') || '0,0'}`
        for (const seg of kids(fig)) {
          const pts = (seg.getAttribute('Points') || seg.getAttribute('Point') || '').trim()
          if (seg.localName === 'PolyLineSegment') d += ` L${pts}`
          else if (seg.localName === 'PolyBezierSegment') d += ` C${pts}`
          else if (seg.localName === 'PolyQuadraticBezierSegment') d += ` Q${pts}`
          else if (seg.localName === 'ArcSegment') d += ` A${seg.getAttribute('Size') || '0,0'} ${seg.getAttribute('RotationAngle') || 0} ${seg.getAttribute('IsLargeArc') === 'true' ? 1 : 0} ${seg.getAttribute('SweepDirection') === 'Clockwise' ? 1 : 0} ${pts}`
        }
        if (fig.getAttribute('IsClosed') === 'true') d += ' Z'
      }
      return d.trim() ? { d: d.trim(), rule, m } : null
    }
    return null
  }
  /** Returns an SVG paint value plus an opacity multiplier. `m` is the element's full transform. */
  const brushOf = async (ctx: Ctx, el: Element | null, attr: string | null): Promise<{ paint: string; alpha: number } | null> => {
    let b = el
    if (attr) { const res = lookup(ctx, attr); if (res) b = res; else { const c = parseColor(attr); return c ? { paint: c.css, alpha: c.alpha } : null } }
    if (!b) return null
    const op = +(b.getAttribute('Opacity') ?? 1)
    const bt = transformOf(ctx, b, 'Transform')
    if (b.localName === 'SolidColorBrush') { const c = parseColor(b.getAttribute('Color')); return c ? { paint: c.css, alpha: c.alpha * op } : null }
    if (b.localName === 'LinearGradientBrush' || b.localName === 'RadialGradientBrush') {
      const stops = Array.from(b.getElementsByTagNameNS('*', 'GradientStop')).map((s) => ({ c: parseColor(s.getAttribute('Color')) ?? { css: '#000', alpha: 1 }, o: +(s.getAttribute('Offset') || 0) })).sort((a, z) => a.o - z.o)
      const st = stops.map((s) => `<stop offset="${r(Math.max(0, Math.min(1, s.o)))}" stop-color="${s.c.css}"${s.c.alpha < 1 ? ` stop-opacity="${r(s.c.alpha)}"` : ''}/>`).join('')
      const spread = (b.getAttribute('SpreadMethod') || 'Pad').toLowerCase()
      const id = nid('g')
      if (b.localName === 'LinearGradientBrush') {
        const [x1, y1] = (b.getAttribute('StartPoint') || '0,0').split(/[\s,]+/).map(Number), [x2, y2] = (b.getAttribute('EndPoint') || '1,0').split(/[\s,]+/).map(Number)
        defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" spreadMethod="${spread}" gradientTransform="${matStr(bt)}" x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}">${st}</linearGradient>`)
      } else {
        const [cx, cy] = (b.getAttribute('Center') || '0,0').split(/[\s,]+/).map(Number), [fx, fy] = (b.getAttribute('GradientOrigin') || `${cx},${cy}`).split(/[\s,]+/).map(Number)
        const rx = +(b.getAttribute('RadiusX') || 1) || 1, ry = +(b.getAttribute('RadiusY') || rx) || rx
        const ell: Mat = mul(mul([1, 0, 0, 1, cx, cy], [1, 0, 0, ry / rx, 0, 0]), [1, 0, 0, 1, -cx, -cy])
        const fyE = cy + (fy - cy) * (rx / ry)
        defs.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" spreadMethod="${spread}" gradientTransform="${matStr(mul(bt, ell))}" cx="${r(cx)}" cy="${r(cy)}" r="${r(rx)}" fx="${r(fx)}" fy="${r(fyE)}">${st}</radialGradient>`)
      }
      return { paint: `url(#${id})`, alpha: op }
    }
    if (b.localName === 'ImageBrush') {
      const src = b.getAttribute('ImageSource')
      if (!src) return null
      const img = await loadImage(doc, resolvePart(ref.path, src.replace(/^\{ColorConvertedBitmap\s+(\S+).*\}$/, '$1')), warn)
      if (!img) return null
      const vb = (b.getAttribute('Viewbox') || `0,0,${img.w},${img.h}`).split(/[\s,]+/).map(Number)
      const vp = (b.getAttribute('Viewport') || '0,0,1,1').split(/[\s,]+/).map(Number)
      const tile = b.getAttribute('TileMode') || 'None'
      // image space (96 dpi assumed) -> viewport
      const sx = vp[2] / (vb[2] || 1), sy = vp[3] / (vb[3] || 1)
      const id = nid('p')
      const big = tile === 'None'
      const pw = big ? 1e5 : vp[2], ph = big ? 1e5 : vp[3]
      const flipX = tile === 'FlipX' || tile === 'FlipXY', flipY = tile === 'FlipY' || tile === 'FlipXY'
      const tileW = flipX ? pw * 2 : pw, tileH = flipY ? ph * 2 : ph
      const imgEl = (tx: number, ty: number, fx: number, fy: number) => `<image xlink:href="${img.url}" href="${img.url}" preserveAspectRatio="none" width="${r(img.w)}" height="${r(img.h)}" transform="${matStr(mul([fx, 0, 0, fy, tx, ty], [sx, 0, 0, sy, -vb[0] * sx, -vb[1] * sy]))}"/>`
      let inner = imgEl(0, 0, 1, 1)
      if (!big) {
        if (flipX) inner += imgEl(2 * vp[2], 0, -1, 1)
        if (flipY) inner += imgEl(0, 2 * vp[3], 1, -1)
        if (flipX && flipY) inner += imgEl(2 * vp[2], 2 * vp[3], -1, -1)
      }
      defs.push(`<pattern id="${id}" patternUnits="userSpaceOnUse" x="${r(vp[0])}" y="${r(vp[1])}" width="${r(tileW)}" height="${r(tileH)}" patternTransform="${matStr(bt)}"><g transform="translate(${r(0)} ${r(0)})">${inner}</g></pattern>`)
      return { paint: `url(#${id})`, alpha: op }
    }
    if (b.localName === 'VisualBrush') warn.add('Visual brushes are not supported and were left out.')
    return null
  }
  const clipOf = (ctx: Ctx, el: Element, m: Mat): string | null => {
    const p = prop(el, 'Clip')
    const g = geometryOf(ctx, p.el, p.attr)
    if (!g) return null
    const id = nid('c')
    defs.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path transform="${matStr(mul(m, g.m))}" d="${esc(g.d)}" clip-rule="${g.rule}"/></clipPath>`)
    return id
  }

  const walk = async (el: Element, ctx: Ctx) => {
    for (const c of kids(el)) {
      const name = c.localName
      if (name.includes('.')) continue // property elements are read by their owner
      if (name === 'Canvas') {
        const m = mul(ctx.m, transformOf(ctx, c, 'RenderTransform'))
        const op = ctx.opacity * +(c.getAttribute('Opacity') ?? 1)
        const res = kids(c).some((k) => k.localName === 'Canvas.Resources') ? await loadDict(kids(c).find((k) => k.localName === 'Canvas.Resources')!) : new Map<string, Element>()
        const inner: Ctx = { m, opacity: op, res: [...ctx.res, res] }
        const clip = clipOf(inner, c, m)
        if (prop(c, 'OpacityMask').el || c.getAttribute('OpacityMask')) warn.add('Opacity masks were ignored.')
        body.push(clip ? `<g clip-path="url(#${clip})">` : '<g>')
        await walk(c, inner)
        body.push('</g>')
      } else if (name === 'Path') {
        const m = mul(ctx.m, transformOf(ctx, c, 'RenderTransform'))
        const dp = prop(c, 'Data')
        const g = geometryOf(ctx, dp.el, dp.attr)
        if (!g) continue
        const op = ctx.opacity * +(c.getAttribute('Opacity') ?? 1)
        const fp = prop(c, 'Fill'), sp = prop(c, 'Stroke')
        const fill = await brushOf(ctx, fp.el, fp.attr), stroke = await brushOf(ctx, sp.el, sp.attr)
        if (!fill && !stroke) continue
        const clip = clipOf(ctx, c, m)
        const a = [`transform="${matStr(mul(m, g.m))}"`, `d="${esc(g.d)}"`, `fill="${fill ? fill.paint : 'none'}"`, `fill-rule="${g.rule}"`]
        if (fill && fill.alpha * op < 1) a.push(`fill-opacity="${r(fill.alpha * op)}"`)
        if (stroke) {
          a.push(`stroke="${stroke.paint}"`, `stroke-width="${r(+(c.getAttribute('StrokeThickness') ?? 1))}"`)
          if (stroke.alpha * op < 1) a.push(`stroke-opacity="${r(stroke.alpha * op)}"`)
          const cap = (c.getAttribute('StrokeStartLineCap') || 'Flat').toLowerCase()
          if (cap === 'round' || cap === 'square') a.push(`stroke-linecap="${cap}"`)
          const join = (c.getAttribute('StrokeLineJoin') || 'Miter').toLowerCase()
          if (join !== 'miter') a.push(`stroke-linejoin="${join}"`)
          a.push(`stroke-miterlimit="${r(Math.max(1, +(c.getAttribute('StrokeMiterLimit') ?? 10)))}"`)
          const dash = c.getAttribute('StrokeDashArray')
          if (dash) { const t = +(c.getAttribute('StrokeThickness') ?? 1); a.push(`stroke-dasharray="${dash.trim().split(/[\s,]+/).map((v) => r(Math.max(0.01, +v * t))).join(' ')}"`); const off = +(c.getAttribute('StrokeDashOffset') ?? 0); if (off) a.push(`stroke-dashoffset="${r(off * t)}"`) }
        }
        // the brush transform is in the Path's own space, so draw it in that space
        body.push(clip ? `<g clip-path="url(#${clip})"><path ${a.join(' ')}/></g>` : `<path ${a.join(' ')}/>`)
        if (g.m !== IDENT && fill?.paint.startsWith('url(')) warn.add('Some fills with a geometry transform may be slightly off.')
      } else if (name === 'Glyphs') {
        const m = mul(ctx.m, transformOf(ctx, c, 'RenderTransform'))
        const text = unescapeUnicode(c.getAttribute('UnicodeString'))
        const indices = parseIndices(c.getAttribute('Indices'))
        if (!text && !indices.length) continue
        const size = +(c.getAttribute('FontRenderingEmSize') || 12)
        const fontUri = c.getAttribute('FontUri') || ''
        const font = fontUri ? await loadFont(doc, resolvePart(ref.path, fontUri)) : { family: 'sans-serif', metrics: null, rule: '' }
        if (font.rule) usedFonts.add(fontUri ? resolvePart(ref.path, fontUri) : '')
        const ox = +(c.getAttribute('OriginX') || 0), oy = +(c.getAttribute('OriginY') || 0)
        const sideways = c.getAttribute('IsSideways') === 'true'
        const bidi = +(c.getAttribute('BidiLevel') || 0)
        const lay = layoutGlyphs(text || '\u25a1'.repeat(indices.length), indices, size, font.metrics, sideways)
        const fp = prop(c, 'Fill')
        const fill = await brushOf(ctx, fp.el, fp.attr) ?? { paint: '#000000', alpha: 1 }
        const op = ctx.opacity * +(c.getAttribute('Opacity') ?? 1)
        const sim = c.getAttribute('StyleSimulations') || 'None'
        let gm: Mat = mul(m, [1, 0, 0, 1, ox, oy])
        if (/Italic/.test(sim)) gm = mul(gm, [1, 0, -0.33, 1, 0, 0])
        const clip = clipOf(ctx, c, m)
        const fam = font.rule ? `'${font.family}', sans-serif` : 'sans-serif'
        const a = [`transform="${matStr(gm)}"`, `font-family="${fam}"`, `font-size="${r(size)}"`, `fill="${fill.paint}"`]
        if (fill.alpha * op < 1) a.push(`fill-opacity="${r(fill.alpha * op)}"`)
        if (/Bold/.test(sim)) a.push(`stroke="${fill.paint}"`, `stroke-width="${r(size / 50)}"`)
        if (bidi % 2 === 1) a.push('direction="ltr" unicode-bidi="bidi-override"')
        void sideways
        // right-to-left runs: each glyph sits to the left of its origin
        const xs = bidi % 2 === 1 ? lay.chars.map((_, k) => -(k + 1 < lay.chars.length ? lay.chars[k + 1].x : lay.width)) : lay.chars.map((ch) => ch.x)
        const t = `<text ${a.join(' ')} x="${xs.map(r).join(' ')}" y="${lay.chars.map((ch) => r(ch.y)).join(' ')}">${esc(xmlSafe(lay.chars.map((ch) => ch.ch).join('')))}</text>`
        body.push(clip ? `<g clip-path="url(#${clip})">${t}</g>` : t)
        if (text.trim()) {
          const [px, py] = apply(gm, 0, 0)
          const sc = Math.hypot(gm[0], gm[1])
          const [qx, qy] = bidi % 2 === 1 ? apply(gm, -lay.width, 0) : [px, py]
          texts.push({ text, x: qx, y: qy, size: size * Math.hypot(gm[2], gm[3]), angle: Math.atan2(gm[1], gm[0]), width: lay.width * sc })
        }
      }
    }
  }
  const pageRes = kids(page).find((k) => k.localName === 'FixedPage.Resources')
  await walk(page, { m: IDENT, opacity: 1, res: [pageRes ? await loadDict(pageRes) : new Map()] })
  const rules = [...usedFonts].map((p) => doc.fonts.get(p)?.rule).filter(Boolean).join('\n')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${r(W)}" height="${r(H)}" viewBox="0 0 ${r(W)} ${r(H)}"><defs>${rules ? `<style type="text/css"><![CDATA[\n${rules}\n]]></style>` : ''}${defs.join('')}</defs><rect width="100%" height="100%" fill="#fff"/><g xml:space="preserve">${body.join('')}</g></svg>`
  return { svg, width: W, height: H, texts, warnings: [...warn] }
}

/** Draw an SVG string onto a canvas at the given scale. */
export async function svgToCanvas(svg: string, w: number, h: number, scale: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    await new Promise((res) => setTimeout(res, 30)) // let embedded fonts settle
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale))
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    return c
  } finally { URL.revokeObjectURL(url) }
}

export interface XpsPdfOptions { dpi: number; quality: number; textLayer: boolean; indexes: number[]; onProgress?: (p: number) => void }
export async function xpsToPdf(doc: XpsDoc, o: XpsPdfOptions): Promise<{ blob: Blob; warnings: string[] }> {
  const { PDFDocument, StandardFonts, degrees } = await import('pdf-lib')
  const out = await PDFDocument.create()
  const helv = await out.embedFont(StandardFonts.Helvetica)
  const warnings = new Set<string>()
  for (let k = 0; k < o.indexes.length; k++) {
    const p = await xpsPageToSvg(doc, o.indexes[k])
    p.warnings.forEach((w) => warnings.add(w))
    const c = await svgToCanvas(p.svg, p.width, p.height, o.dpi / 96)
    const png = o.quality >= 1
    const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not draw the page.'))), png ? 'image/png' : 'image/jpeg', o.quality))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    c.width = c.height = 0
    const img = png ? await out.embedPng(bytes) : await out.embedJpg(bytes)
    const pw = p.width * 0.75, ph = p.height * 0.75
    const page = out.addPage([pw, ph])
    page.drawImage(img, { x: 0, y: 0, width: pw, height: ph })
    if (o.textLayer) {
      for (const t of p.texts) {
        let s = t.text
        try { helv.encodeText(s) } catch { s = s.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, ' ') }
        if (!s.trim()) continue
        const size = Math.max(1, t.size * 0.75)
        const natural = helv.widthOfTextAtSize(s, size) || 1
        const fit = t.width > 0 ? Math.max(0.3, Math.min(3, (t.width * 0.75) / natural)) : 1
        page.drawText(s, { x: t.x * 0.75, y: ph - t.y * 0.75, size: size * fit, font: helv, opacity: 0, rotate: degrees((-t.angle * 180) / Math.PI) })
      }
    }
    o.onProgress?.((k + 1) / o.indexes.length)
  }
  out.setProducer('OpenFile XPS to PDF')
  return { blob: new Blob([(await out.save()) as BlobPart], { type: 'application/pdf' }), warnings: [...warnings] }
}
