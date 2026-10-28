/* PDF page -> SVG.
 * "vector" walks the pdf.js operator list and writes real SVG paths, gradients, text and images.
 * "image" embeds a rendered picture of the page plus an invisible, selectable text layer.
 * Pure helpers (matrix math, path data, escaping) are tested in scripts/tests/b1/pdfsvg.test.mjs. */

export type Mat = [number, number, number, number, number, number]
export const IDENT: Mat = [1, 0, 0, 1, 0, 0]
export const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
]
export function inv(m: Mat): Mat {
  const d = m[0] * m[3] - m[1] * m[2]
  if (!d) return IDENT
  return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d]
}
const r = (n: number) => { const v = Math.round(n * 1000) / 1000; return Object.is(v, -0) ? '0' : String(v) }
export const matStr = (m: Mat) => `matrix(${m.map(r).join(' ')})`
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** Strip characters XML 1.0 does not allow. */
export const xmlSafe = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')

/** pdf.js DrawOPS path data (moveTo 0, lineTo 1, curveTo 2, quadraticCurveTo 3, closePath 4) to SVG path d. */
export function drawOpsToD(data: ArrayLike<number> | null | undefined): string {
  if (!data) return ''
  const out: string[] = []
  for (let i = 0; i < data.length;) {
    const op = data[i++]
    if (op === 0) { out.push(`M${r(data[i++])} ${r(data[i++])}`) }
    else if (op === 1) { out.push(`L${r(data[i++])} ${r(data[i++])}`) }
    else if (op === 2) { out.push(`C${r(data[i++])} ${r(data[i++])} ${r(data[i++])} ${r(data[i++])} ${r(data[i++])} ${r(data[i++])}`) }
    else if (op === 3) { out.push(`Q${r(data[i++])} ${r(data[i++])} ${r(data[i++])} ${r(data[i++])}`) }
    else if (op === 4) { out.push('Z') }
    else break
  }
  return out.join('')
}

export function b64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)))
  return btoa(s)
}

/* ------------------------------------------------------------------ */

export interface SvgOptions { mode: 'vector' | 'image'; embedFonts: boolean; imageType: 'png' | 'jpeg'; dpi: number; background: boolean }
export interface SvgResult { svg: string; warnings: string[] }

interface GS {
  ctm: Mat; fill: string; stroke: string; fillAlpha: number; strokeAlpha: number
  fillPat: any; strokePat: any
  lw: number; cap: number; join: number; miter: number; dash: number[]; dashPhase: number
  font: any; fontSize: number; fontDir: number; charSpacing: number; wordSpacing: number; hscale: number; leading: number; rise: number; mode: number
  tm: Mat; x: number; y: number; lineX: number; lineY: number
  groups: number; base: Mat
}

const CAPS = ['butt', 'round', 'square'], JOINS = ['miter', 'round', 'bevel']

function imageToCanvas(img: any): HTMLCanvasElement | null {
  const c = document.createElement('canvas')
  c.width = img.width; c.height = img.height
  const ctx = c.getContext('2d')!
  if (img.bitmap) { ctx.drawImage(img.bitmap, 0, 0); return c }
  if (!img.data) return null
  const id = ctx.createImageData(img.width, img.height)
  const d = id.data, s = img.data as Uint8Array, n = img.width * img.height
  if (img.kind === 3 || s.length === n * 4) d.set(s.subarray(0, n * 4))
  else if (img.kind === 2 || s.length === n * 3) { for (let i = 0, j = 0; i < n; i++, j += 3) { d[i * 4] = s[j]; d[i * 4 + 1] = s[j + 1]; d[i * 4 + 2] = s[j + 2]; d[i * 4 + 3] = 255 } }
  else if (img.kind === 1) {
    const rowBytes = (img.width + 7) >> 3
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      const bit = (s[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1
      const v = bit ? 255 : 0, i = (y * img.width + x) * 4
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255
    }
  } else return null
  ctx.putImageData(id, 0, 0)
  return c
}

function maskToCanvas(img: any, color: string): HTMLCanvasElement | null {
  const c = document.createElement('canvas')
  c.width = img.width; c.height = img.height
  const ctx = c.getContext('2d')!
  if (img.bitmap) ctx.drawImage(img.bitmap, 0, 0)
  else if (img.data) {
    const id = ctx.createImageData(img.width, img.height)
    const rowBytes = (img.width + 7) >> 3, s = img.data as Uint8Array
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      const bit = (s[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1
      // pdf.js convention: a 0 bit paints, a 1 bit is see-through
      if ((bit === 1) === !!img.inverseDecode) id.data[(y * img.width + x) * 4 + 3] = 255
    }
    ctx.putImageData(id, 0, 0)
  } else return null
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = color; ctx.fillRect(0, 0, c.width, c.height)
  return c
}

const getObj = (store: any, id: string) => new Promise<any>((res) => {
  try { if (store.has?.(id)) { res(store.get(id)); return } store.get(id, res) } catch { res(null) }
  setTimeout(() => res(null), 4000)
})

export async function pageToSvg(doc: any, pageNo: number, o: SvgOptions, pdfjsOPS: Record<string, number>): Promise<SvgResult> {
  const page = await doc.getPage(pageNo)
  const vp = page.getViewport({ scale: 1 })
  const W = vp.width, H = vp.height
  const root = vp.transform as Mat
  const warnings = new Set<string>()
  const head = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="${r(W)}pt" height="${r(H)}pt" viewBox="0 0 ${r(W)} ${r(H)}">`

  if (o.mode === 'image') {
    const { renderPage } = await import('@/lib/pdf')
    const scale = o.dpi / 72
    const c = await renderPage(doc, pageNo, scale)
    const url = c.toDataURL(o.imageType === 'png' ? 'image/png' : 'image/jpeg', 0.9)
    c.width = c.height = 0
    const tc = await page.getTextContent()
    const texts: string[] = []
    for (const it of tc.items as any[]) {
      if (!it.str || !it.str.trim()) continue
      const m = mul(root, it.transform as Mat)
      const size = Math.hypot(it.transform[2], it.transform[3]) || 1
      // flip so the glyphs stand upright inside a y-down SVG
      const tm = mul(m, [1 / size, 0, 0, -1 / size, 0, 0])
      const len = it.width ? ` textLength="${r(it.width / (Math.hypot(it.transform[0], it.transform[1]) / size || 1))}" lengthAdjust="spacingAndGlyphs"` : ''
      texts.push(`<text transform="${matStr(tm)}" font-size="${r(size)}"${len}>${esc(xmlSafe(it.str))}</text>`)
    }
    return { svg: `${head}<image width="${r(W)}" height="${r(H)}" preserveAspectRatio="none" xlink:href="${url}" href="${url}"/><g fill="#000" fill-opacity="0" font-family="sans-serif" xml:space="preserve">${texts.join('')}</g></svg>`, warnings: [] }
  }

  const OPS = pdfjsOPS
  const name: Record<number, string> = {}
  for (const [k, v] of Object.entries(OPS)) name[v] = k
  const opList = await page.getOperatorList()
  let ocConfig: any = null
  try { ocConfig = await doc.getOptionalContentConfig() } catch { /* */ }

  const defs: string[] = [], body: string[] = []
  const fonts = new Map<string, { rule: string | null; family: string; weight: string; style: string; embedded: boolean }>()
  let idN = 0
  const nid = (p: string) => `${p}${pageNo}_${++idN}`
  const st: GS[] = []
  let g: GS = { ctm: root, fill: '#000000', stroke: '#000000', fillAlpha: 1, strokeAlpha: 1, fillPat: null, strokePat: null, lw: 1, cap: 0, join: 0, miter: 10, dash: [], dashPhase: 0, font: null, fontSize: 0, fontDir: 1, charSpacing: 0, wordSpacing: 0, hscale: 1, leading: 0, rise: 0, mode: 0, tm: IDENT, x: 0, y: 0, lineX: 0, lineY: 0, groups: 0, base: root }
  let pendingClip: 'nonzero' | 'evenodd' | null = null
  const hidden: boolean[] = []
  const visible = () => !hidden.some(Boolean)
  const imgCache = new Map<string, string>()

  const save = () => { st.push(g); g = { ...g, groups: 0, dash: [...g.dash] } }
  const restore = () => { if (!st.length) return; for (let i = 0; i < g.groups; i++) body.push('</g>'); g = st.pop()! }
  const clipWith = (d: string, rule: string, m: Mat) => {
    const id = nid('c')
    defs.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path transform="${matStr(m)}" d="${d}" clip-rule="${rule}"/></clipPath>`)
    body.push(`<g clip-path="url(#${id})">`); g.groups++
  }
  const gradient = (IR: any, gradToUser: Mat): string | null => {
    if (!IR || IR[0] !== 'RadialAxial') { warnings.add('Some complex shadings or patterns were simplified.'); return null }
    const [, type, , stops, p0, p1, r0, r1] = IR
    const id = nid('g')
    const st = (stops as [number, string][]).map(([off, col]) => `<stop offset="${r(off)}" stop-color="${col}"/>`).join('')
    if (type === 'radial') defs.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" gradientTransform="${matStr(gradToUser)}" fx="${r(p0[0])}" fy="${r(p0[1])}" fr="${r(r0)}" cx="${r(p1[0])}" cy="${r(p1[1])}" r="${r(r1)}">${st}</radialGradient>`)
    else defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" gradientTransform="${matStr(gradToUser)}" x1="${r(p0[0])}" y1="${r(p0[1])}" x2="${r(p1[0])}" y2="${r(p1[1])}">${st}</linearGradient>`)
    return `url(#${id})`
  }
  const paintFor = async (pat: any, solid: string): Promise<string> => {
    if (!pat) return solid
    if (pat[0] === 'TilingPattern') { warnings.add('Tiled pattern fills were replaced by a flat color.'); return Array.isArray(pat[1]) && typeof pat[1][0] === 'number' ? `rgb(${pat[1].map((v: number) => Math.round(v)).join(',')})` : '#999999' }
    const IR = typeof pat[1] === 'string' ? await getObj(pat[1].startsWith('g_') ? page.commonObjs : page.objs, pat[1]) : pat[1]
    const pm: Mat = (pat[2] as Mat) || IDENT
    return gradient(IR, mul(inv(g.ctm), mul(g.base, pm))) ?? solid
  }
  const strokeAttrs = () => {
    const a = [`stroke-width="${g.lw ? r(g.lw) : '0.6'}"`]
    if (!g.lw) a.push('vector-effect="non-scaling-stroke"')
    if (g.cap) a.push(`stroke-linecap="${CAPS[g.cap]}"`)
    if (g.join) a.push(`stroke-linejoin="${JOINS[g.join]}"`)
    if (g.join === 0 && g.miter !== 4) a.push(`stroke-miterlimit="${r(Math.max(1, g.miter))}"`)
    if (g.dash.length && g.dash.some((v) => v > 0)) a.push(`stroke-dasharray="${g.dash.map(r).join(' ')}"`, `stroke-dashoffset="${r(g.dashPhase)}"`)
    if (g.strokeAlpha < 1) a.push(`stroke-opacity="${r(g.strokeAlpha)}"`)
    return a.join(' ')
  }
  const fontInfo = (font: any) => {
    const key = font.loadedName || 'f'
    let f = fonts.get(key)
    if (!f) {
      let rule: string | null = null
      const data: Uint8Array | undefined = (() => { try { return font.data } catch { return undefined } })()
      const embedded = o.embedFonts && !!data && !font.missingFile && !font.isType3Font
      if (embedded) rule = `@font-face{font-family:"${key}";src:url(data:${font.mimetype || 'font/opentype'};base64,${b64(data!)})}`
      const fallback = font.systemFontInfo?.css || `${font.fallbackName || 'sans-serif'}`
      f = { rule, embedded, family: embedded ? `'${key}', ${fallback.replace(/"/g, "'")}` : fallback.replace(/"/g, "'"), weight: font.black ? '900' : font.bold ? 'bold' : 'normal', style: font.italic ? 'italic' : 'normal' }
      fonts.set(key, f)
    }
    return f
  }

  const showText = async (glyphs: any[]) => {
    const font = g.font
    if (!font || !g.fontSize || !visible()) { advanceOnly(glyphs); return }
    if (font.isType3Font) warnings.add('Type 3 fonts were drawn with a standard font.')
    const fi = fontInfo(font)
    const fm = (font.fontMatrix as number[]) || [0.001]
    const widthScale = g.fontSize * fm[0]
    const hs = g.hscale * g.fontDir
    const vertical = !!font.vertical
    let x = 0
    const xs: number[] = [], ys: number[] = [], chars: string[] = []
    const uxs: number[] = [], uys: number[] = [], uchars: string[] = []
    let differs = false
    for (const gl of glyphs) {
      if (typeof gl === 'number') { x += (vertical ? 1 : -1) * gl * g.fontSize / 1000; continue }
      const spacing = (gl.isSpace ? g.wordSpacing : 0) + g.charSpacing
      let width = gl.width, px = x, py = 0
      if (vertical && gl.vmetric) { px = -gl.vmetric[1] * widthScale; py = x + gl.vmetric[2] * widthScale; width = -gl.vmetric[0] }
      const ch: string = (fi.embedded ? gl.fontChar : gl.unicode) || gl.unicode || ''
      const cps = Array.from(ch)
      const adv = width * widthScale
      cps.forEach((c, k) => { chars.push(c); xs.push(px + (cps.length > 1 ? (adv * k) / cps.length : 0)); ys.push(py) })
      if (fi.embedded) {
        const u = Array.from((gl.unicode as string) || '')
        if ((gl.unicode || '') !== ch) differs = true
        u.forEach((c, k) => { uchars.push(c); uxs.push(px + (u.length > 1 ? (adv * k) / u.length : 0)); uys.push(py) })
      }
      x += vertical ? width * widthScale - spacing * g.fontDir : adv + spacing * g.fontDir
    }
    const tm = mul(mul(mul(g.ctm, g.tm), [1, 0, 0, 1, g.x, g.y + g.rise]), [hs, 0, 0, g.fontDir > 0 ? -1 : 1, 0, 0])
    const mode = g.mode & 3
    if (chars.length && chars.some((c) => c.trim())) {
      const fill = mode === 0 || mode === 2 ? await paintFor(g.fillPat, g.fill) : 'none'
      const a = [`transform="${matStr(tm)}"`, `font-family="${esc(fi.family)}"`, `font-size="${r(g.fontSize)}"`]
      if (fi.weight !== 'normal') a.push(`font-weight="${fi.weight}"`)
      if (fi.style !== 'normal') a.push(`font-style="${fi.style}"`)
      if (mode === 3) a.push('fill="#000" fill-opacity="0"')
      else {
        a.push(`fill="${fill}"`)
        if (fill !== 'none' && g.fillAlpha < 1) a.push(`fill-opacity="${r(g.fillAlpha)}"`)
        if (mode === 1 || mode === 2) {
          const sw = g.lw / (Math.hypot(g.tm[0], g.tm[1]) || 1)
          a.push(`stroke="${await paintFor(g.strokePat, g.stroke)}"`, `stroke-width="${r(sw || 0.05)}"`)
        }
      }
      const yAttr = vertical ? ` y="${ys.map(r).join(' ')}"` : ' y="0"'
      if (differs && mode !== 3) {
        // The embedded font uses private glyph codes, so add an invisible copy in real Unicode for search and copy.
        body.push(`<text ${a.join(' ')} aria-hidden="true" style="user-select:none" x="${xs.map(r).join(' ')}"${yAttr}>${esc(xmlSafe(chars.join('')))}</text>`)
        const ua = [`transform="${matStr(tm)}"`, `font-family="${esc(fi.family.replace(/^'[^']*',\s*/, ''))}"`, `font-size="${r(g.fontSize)}"`, 'fill="#000" fill-opacity="0"']
        body.push(`<text ${ua.join(' ')} x="${uxs.map(r).join(' ')}"${vertical ? ` y="${uys.map(r).join(' ')}"` : ' y="0"'}>${esc(xmlSafe(uchars.join('')))}</text>`)
      } else body.push(`<text ${a.join(' ')} x="${xs.map(r).join(' ')}"${yAttr}>${esc(xmlSafe(chars.join('')))}</text>`)
    }
    if (vertical) g.y -= x; else g.x += x * hs
  }
  const advanceOnly = (glyphs: any[]) => {
    const font = g.font; if (!font) return
    const fm = (font.fontMatrix as number[]) || [0.001]
    let x = 0
    for (const gl of glyphs) { if (typeof gl === 'number') { x -= gl * g.fontSize / 1000; continue } x += gl.width * g.fontSize * fm[0] + ((gl.isSpace ? g.wordSpacing : 0) + g.charSpacing) * g.fontDir }
    g.x += x * g.hscale * g.fontDir
  }

  const imageHref = async (key: string | null, img: any, mask?: string): Promise<string | null> => {
    const cacheKey = key ? key + (mask ?? '') : null
    if (cacheKey && imgCache.has(cacheKey)) return imgCache.get(cacheKey)!
    const c = mask ? maskToCanvas(img, mask) : imageToCanvas(img)
    if (!c) { warnings.add('Some images could not be read and were left out.'); return null }
    const usePng = mask || o.imageType === 'png' || img.kind === 3
    const url = c.toDataURL(usePng ? 'image/png' : 'image/jpeg', 0.88)
    c.width = c.height = 0
    if (cacheKey) imgCache.set(cacheKey, url)
    return url
  }
  const placeImage = (url: string, m: Mat, alpha: number) => {
    body.push(`<image transform="${matStr(mul(m, [1, 0, 0, -1, 0, 1]))}" width="1" height="1" preserveAspectRatio="none"${alpha < 1 ? ` opacity="${r(alpha)}"` : ''} xlink:href="${url}" href="${url}"/>`)
  }

  const { fnArray, argsArray } = opList
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i], args = argsArray[i] ?? []
    switch (name[fn]) {
      case 'save': save(); break
      case 'restore': restore(); break
      case 'transform': g.ctm = mul(g.ctm, args as Mat); break
      case 'setLineWidth': g.lw = args[0]; break
      case 'setLineCap': g.cap = args[0]; break
      case 'setLineJoin': g.join = args[0]; break
      case 'setMiterLimit': g.miter = args[0]; break
      case 'setDash': g.dash = Array.from(args[0] ?? []); g.dashPhase = args[1] ?? 0; break
      case 'setGState':
        for (const [k, v] of args[0] as [string, any][]) {
          if (k === 'LW') g.lw = v; else if (k === 'LC') g.cap = v; else if (k === 'LJ') g.join = v; else if (k === 'ML') g.miter = v
          else if (k === 'D') { g.dash = Array.from(v[0] ?? []); g.dashPhase = v[1] ?? 0 }
          else if (k === 'CA') g.strokeAlpha = v; else if (k === 'ca') g.fillAlpha = v
          else if (k === 'Font') { g.font = page.commonObjs.get(v[0]); g.fontSize = Math.abs(v[1]); g.fontDir = v[1] < 0 ? -1 : 1 }
          else if (k === 'SMask' && v) warnings.add('Soft masks were ignored, so some transparency may look different.')
        }
        break
      case 'setFillRGBColor': g.fill = args[0]; g.fillPat = null; break
      case 'setStrokeRGBColor': g.stroke = args[0]; g.strokePat = null; break
      case 'setFillTransparent': g.fill = 'none'; g.fillPat = null; break
      case 'setStrokeTransparent': g.stroke = 'none'; g.strokePat = null; break
      case 'setFillColorN': g.fillPat = args; break
      case 'setStrokeColorN': g.strokePat = args; break
      case 'clip': pendingClip = 'nonzero'; break
      case 'eoClip': pendingClip = 'evenodd'; break
      case 'constructPath': {
        const op = name[args[0]]
        const d = drawOpsToD(args[1]?.[0])
        const clipRule = pendingClip
        pendingClip = null
        if (d && visible() && op !== 'endPath') {
          const fill = /fill|Fill/.test(op) ? await paintFor(g.fillPat, g.fill) : 'none'
          const stroke = /stroke|Stroke/i.test(op) ? await paintFor(g.strokePat, g.stroke) : 'none'
          const closeFirst = /^close/.test(op) && !d.endsWith('Z') ? 'Z' : ''
          const a = [`transform="${matStr(g.ctm)}"`, `d="${d}${closeFirst}"`, `fill="${fill}"`]
          if (fill !== 'none') { if (/eo|EO/.test(op)) a.push('fill-rule="evenodd"'); if (g.fillAlpha < 1) a.push(`fill-opacity="${r(g.fillAlpha)}"`) }
          if (stroke !== 'none') a.push(`stroke="${stroke}"`, strokeAttrs())
          body.push(`<path ${a.join(' ')}/>`)
        }
        if (d && clipRule) clipWith(d, clipRule, g.ctm)
        break
      }
      case 'rawFillPath': break
      case 'beginText': g.tm = IDENT; g.x = g.y = g.lineX = g.lineY = 0; break
      case 'endText': break
      case 'setCharSpacing': g.charSpacing = args[0]; break
      case 'setWordSpacing': g.wordSpacing = args[0]; break
      case 'setHScale': g.hscale = args[0] / 100; break
      case 'setLeading': g.leading = -args[0]; break
      case 'setFont': g.font = page.commonObjs.get(args[0]); g.fontSize = Math.abs(args[1]); g.fontDir = args[1] < 0 ? -1 : 1; break
      case 'setTextRenderingMode': g.mode = args[0]; break
      case 'setTextRise': g.rise = args[0]; break
      case 'moveText': g.x = g.lineX += args[0]; g.y = g.lineY += args[1]; break
      case 'setLeadingMoveText': g.leading = args[1]; g.x = g.lineX += args[0]; g.y = g.lineY += args[1]; break
      case 'setTextMatrix': g.tm = Array.from(args.length >= 6 ? args.slice(0, 6) : args[0]) as Mat; g.x = g.y = g.lineX = g.lineY = 0; break
      case 'nextLine': g.x = g.lineX; g.y = g.lineY += g.leading; break
      case 'showText': await showText(args[0]); break
      case 'showSpacedText': await showText(args[0]); break
      case 'nextLineShowText': g.y = g.lineY += g.leading; g.x = g.lineX; await showText(args[0]); break
      case 'nextLineSetSpacingShowText': g.wordSpacing = args[0]; g.charSpacing = args[1]; g.y = g.lineY += g.leading; g.x = g.lineX; await showText(args[2]); break
      case 'paintFormXObjectBegin': {
        save()
        if (args[0]) g.ctm = mul(g.ctm, args[0] as Mat)
        g.base = g.ctm
        const bb = args[1]
        if (bb && visible()) clipWith(`M${r(bb[0])} ${r(bb[1])}H${r(bb[2])}V${r(bb[3])}H${r(bb[0])}Z`, 'nonzero', g.ctm)
        break
      }
      case 'paintFormXObjectEnd': restore(); break
      case 'beginGroup': {
        save()
        const gr = args[0]
        if (gr?.bbox && visible()) { const bb = gr.bbox; clipWith(`M${r(bb[0])} ${r(bb[1])}H${r(bb[2])}V${r(bb[3])}H${r(bb[0])}Z`, 'nonzero', gr.matrix ? mul(g.ctm, gr.matrix) : g.ctm) }
        break
      }
      case 'endGroup': restore(); break
      case 'beginAnnotation': {
        save()
        const [, rect, tr, mx] = args
        g.ctm = g.base = root
        if (rect && visible()) clipWith(`M${r(rect[0])} ${r(rect[1])}H${r(rect[2])}V${r(rect[3])}H${r(rect[0])}Z`, 'nonzero', root)
        if (tr) g.ctm = mul(g.ctm, tr)
        if (mx) g.ctm = mul(g.ctm, mx)
        g.base = g.ctm
        break
      }
      case 'endAnnotation': restore(); break
      case 'shadingFill': {
        if (!visible()) break
        const IR = await getObj(String(args[0]).startsWith('g_') ? page.commonObjs : page.objs, args[0])
        const paint = gradient(IR, IDENT)
        if (paint) {
          // cover the whole page in the current user space; the clip limits it
          const im = inv(g.ctm)
          const pts = [[0, 0], [W, 0], [W, H], [0, H]].map(([px, py]) => [im[0] * px + im[2] * py + im[4], im[1] * px + im[3] * py + im[5]])
          const d = 'M' + pts.map(([px, py]) => `${r(px)} ${r(py)}`).join('L') + 'Z'
          body.push(`<path transform="${matStr(g.ctm)}" d="${d}" fill="${paint}"${g.fillAlpha < 1 ? ` fill-opacity="${r(g.fillAlpha)}"` : ''}/>`)
        }
        break
      }
      case 'paintImageXObject': case 'paintInlineImageXObject': {
        if (!visible()) break
        const key = typeof args[0] === 'string' ? args[0] : null
        const img = key ? await getObj(key.startsWith('g_') ? page.commonObjs : page.objs, key) : args[0]
        if (!img) { warnings.add('Some images could not be read and were left out.'); break }
        const url = await imageHref(key, img)
        if (url) placeImage(url, g.ctm, g.fillAlpha)
        break
      }
      case 'paintImageXObjectRepeat': {
        if (!visible()) break
        const [key, sx, sy, pos] = args
        const img = await getObj(String(key).startsWith('g_') ? page.commonObjs : page.objs, key)
        const url = img && await imageHref(key, img)
        if (url) for (let k = 0; k < pos.length; k += 2) placeImage(url, mul(g.ctm, [sx, 0, 0, sy, pos[k], pos[k + 1]]), g.fillAlpha)
        break
      }
      case 'paintImageMaskXObject': {
        if (!visible()) break
        let img = args[0]
        if (img && typeof img.data === 'string') img = (await getObj(img.data.startsWith('g_') ? page.commonObjs : page.objs, img.data)) ?? img
        const color = g.fillPat ? '#000000' : g.fill
        const url = img && await imageHref(null, img, color)
        if (url) placeImage(url, g.ctm, g.fillAlpha)
        break
      }
      case 'paintImageMaskXObjectRepeat': {
        if (!visible()) break
        const [img0, sx, skx, sky, sy, pos] = args
        let img = img0
        if (img && typeof img.data === 'string') img = (await getObj(img.data.startsWith('g_') ? page.commonObjs : page.objs, img.data)) ?? img
        const url = img && await imageHref(null, img, g.fill)
        if (url) for (let k = 0; k < pos.length; k += 2) placeImage(url, mul(g.ctm, [sx, skx, sky, sy, pos[k], pos[k + 1]]), g.fillAlpha)
        break
      }
      case 'paintImageMaskXObjectGroup': {
        if (!visible()) break
        for (const im of args[0] ?? []) {
          const url = await imageHref(null, im, g.fill)
          if (url) placeImage(url, mul(g.ctm, im.transform as Mat), g.fillAlpha)
        }
        break
      }
      case 'paintInlineImageXObjectGroup': warnings.add('Some grouped inline images were left out.'); break
      case 'paintSolidColorImageMask':
        if (visible()) body.push(`<path transform="${matStr(g.ctm)}" d="M0 0H1V1H0Z" fill="${g.fill}"${g.fillAlpha < 1 ? ` fill-opacity="${r(g.fillAlpha)}"` : ''}/>`)
        break
      case 'beginMarkedContentProps':
        if (args[0] === 'OC' && ocConfig && args[1]) { let vis = true; try { vis = ocConfig.isVisible(args[1]) } catch { /* */ } hidden.push(!vis) } else hidden.push(false)
        break
      case 'beginMarkedContent': hidden.push(false); break
      case 'endMarkedContent': hidden.pop(); break
      default: break
    }
  }
  while (st.length) restore()
  for (let i = 0; i < g.groups; i++) body.push('</g>')
  const rules = [...fonts.values()].map((f) => f.rule).filter(Boolean).join('\n')
  const style = rules ? `<style type="text/css"><![CDATA[\n${rules}\n]]></style>` : ''
  const svg = `${head}${defs.length || style ? `<defs>${style}${defs.join('')}</defs>` : ''}${o.background ? '<rect width="100%" height="100%" fill="#fff"/>' : ''}<g xml:space="preserve">${body.join('')}</g></svg>`
  return { svg, warnings: [...warnings] }
}
