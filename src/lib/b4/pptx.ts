/* Lightweight PPTX slide renderer: positions text boxes, pictures, tables and filled shapes from the slide XML
 * (with placeholder positions inherited from the layout and master). Not a full PowerPoint engine:
 * charts, SmartArt, gradients and animations are skipped. */
import type JSZipType from 'jszip'

export interface SlideEl { kind: 'text' | 'pic' | 'shape' | 'table'; x: number; y: number; w: number; h: number; html?: string; src?: string; fill?: string; rot?: number }
export interface Slide { index: number; bg?: string; bgImage?: string; els: SlideEl[]; notes?: string }
export interface Deck { width: number; height: number; slides: Slide[]; title?: string }

const EMU = 12700 // EMU per point
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const parse = (s: string) => new DOMParser().parseFromString(s, 'application/xml')
const kids = (el: Element | null | undefined, name: string) => (el ? Array.from(el.children).filter((c) => c.localName === name) : [])
const kid = (el: Element | null | undefined, name: string) => kids(el, name)[0]
const deep = (el: Element | Document | null | undefined, name: string) => (el ? Array.from(el.getElementsByTagNameNS('*', name)) : [])
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const dir = (p: string) => p.slice(0, p.lastIndexOf('/') + 1)
const join = (base: string, rel: string) => { const out: string[] = []; for (const part of (dir(base) + rel).split('/')) { if (part === '..') out.pop(); else if (part && part !== '.') out.push(part) } return out.join('/') }

async function rels(zip: JSZipType, path: string): Promise<Map<string, string>> {
  const rp = dir(path) + '_rels/' + path.split('/').pop() + '.rels'
  const s = await zip.file(rp)?.async('string')
  const m = new Map<string, string>()
  if (s) for (const r of deep(parse(s), 'Relationship')) m.set(r.getAttribute('Id')!, r.getAttribute('TargetMode') === 'External' ? r.getAttribute('Target')! : join(path, r.getAttribute('Target')!))
  return m
}

function color(el: Element | undefined, theme: Map<string, string>): string | undefined {
  if (!el) return undefined
  const s = kid(el, 'srgbClr')?.getAttribute('val'); if (s) return '#' + s
  const sc = kid(el, 'schemeClr')?.getAttribute('val'); if (sc) return theme.get(sc === 'tx1' ? 'dk1' : sc === 'bg1' ? 'lt1' : sc === 'tx2' ? 'dk2' : sc === 'bg2' ? 'lt2' : sc)
  const sys = kid(el, 'sysClr')?.getAttribute('lastClr'); if (sys) return '#' + sys
  return undefined
}

function xfrm(sp: Element) {
  const x = deep(sp, 'xfrm')[0]
  if (!x) return null
  const off = kid(x, 'off'), ext = kid(x, 'ext')
  if (!off || !ext) return null
  return { x: +off.getAttribute('x')! / EMU, y: +off.getAttribute('y')! / EMU, w: +ext.getAttribute('cx')! / EMU, h: +ext.getAttribute('cy')! / EMU, rot: +(x.getAttribute('rot') || 0) / 60000 }
}

function textHtml(tx: Element | undefined, theme: Map<string, string>, defSize: number): string {
  if (!tx) return ''
  const anchor = kid(tx, 'bodyPr')?.getAttribute('anchor')
  const ps = kids(tx, 'p').map((p) => {
    const pPr = kid(p, 'pPr')
    const algn = pPr?.getAttribute('algn')
    const bullet = !!kid(pPr, 'buChar') || !!kid(pPr, 'buAutoNum')
    const lvl = +(pPr?.getAttribute('lvl') || 0)
    const runs = Array.from(p.children).map((r) => {
      if (r.localName === 'br') return '<br/>'
      if (r.localName !== 'r' && r.localName !== 'fld') return ''
      const t = kid(r, 't')?.textContent ?? ''
      const pr = kid(r, 'rPr')
      const st: string[] = []
      const sz = pr?.getAttribute('sz'); st.push(`font-size:${sz ? +sz / 100 : defSize}pt`)
      if (pr?.getAttribute('b') === '1') st.push('font-weight:700')
      if (pr?.getAttribute('i') === '1') st.push('font-style:italic')
      if (pr?.getAttribute('u') && pr.getAttribute('u') !== 'none') st.push('text-decoration:underline')
      const c = color(kid(pr, 'solidFill'), theme); if (c) st.push(`color:${c}`)
      const font = kid(pr, 'latin')?.getAttribute('typeface'); if (font && !font.startsWith('+')) st.push(`font-family:'${font}',sans-serif`)
      return `<span style="${st.join(';')}">${esc(t)}</span>`
    }).join('')
    const endSz = kid(p, 'endParaRPr')?.getAttribute('sz')
    return `<p style="margin:0;text-align:${algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : algn === 'just' ? 'justify' : 'left'};padding-left:${lvl * 18 + (bullet ? 14 : 0)}pt;${bullet ? 'text-indent:-12pt;' : ''}min-height:${(endSz ? +endSz / 100 : defSize) * 1.2}pt">${bullet && runs ? '&bull;&nbsp;' : ''}${runs}</p>`
  }).join('')
  return `<div style="display:flex;flex-direction:column;justify-content:${anchor === 'ctr' ? 'center' : anchor === 'b' ? 'flex-end' : 'flex-start'};height:100%;padding:3.6pt 7.2pt;box-sizing:border-box;line-height:1.15;overflow:hidden">${ps}</div>`
}

interface PhMap { byType: Map<string, ReturnType<typeof xfrm>>; byIdx: Map<string, ReturnType<typeof xfrm>> }
function phMap(doc: Document | null): PhMap {
  const m: PhMap = { byType: new Map(), byIdx: new Map() }
  if (!doc) return m
  for (const sp of deep(doc, 'sp')) {
    const ph = deep(sp, 'ph')[0]; if (!ph) continue
    const x = xfrm(sp); if (!x) continue
    const t = ph.getAttribute('type') || 'body'; const i = ph.getAttribute('idx')
    if (!m.byType.has(t)) m.byType.set(t, x)
    if (i && !m.byIdx.has(i)) m.byIdx.set(i, x)
  }
  return m
}

export async function readPptx(file: Blob, onProgress?: (p: number) => void): Promise<Deck> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(file).catch(() => { throw new Error('This is not a valid PowerPoint (PPTX) file.') })
  const presPath = 'ppt/presentation.xml'
  const pres = parse((await zip.file(presPath)?.async('string')) ?? '')
  const sz = deep(pres, 'sldSz')[0]
  const width = sz ? +sz.getAttribute('cx')! / EMU : 720, height = sz ? +sz.getAttribute('cy')! / EMU : 405
  const prel = await rels(zip, presPath)
  const ids = deep(pres, 'sldId').map((s) => prel.get(s.getAttributeNS(R, 'id') || s.getAttribute('r:id') || '')).filter(Boolean) as string[]
  // theme colors
  const theme = new Map<string, string>()
  const themePath = Object.keys(zip.files).find((p) => /^ppt\/theme\/theme\d*\.xml$/.test(p))
  if (themePath) { const t = parse(await zip.file(themePath)!.async('string')); const cs = deep(t, 'clrScheme')[0]; if (cs) for (const c of Array.from(cs.children)) { const v = color(c, new Map()); if (v) theme.set(c.localName, v) } }
  const media = new Map<string, string>()
  const mediaUrl = async (p: string) => {
    if (media.has(p)) return media.get(p)!
    const f = zip.file(p); if (!f) return ''
    const ext = p.split('.').pop()!.toLowerCase()
    const type = ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', bmp: 'image/bmp', webp: 'image/webp' } as Record<string, string>)[ext]
    if (!type) return ''
    const u = URL.createObjectURL(new Blob([await f.async('uint8array') as BlobPart], { type })); media.set(p, u); return u
  }
  const slides: Slide[] = []
  for (let si = 0; si < ids.length; si++) {
    onProgress?.(si / ids.length)
    const path = ids[si]
    const xml = await zip.file(path)?.async('string'); if (!xml) continue
    const doc = parse(xml)
    const r = await rels(zip, path)
    const layoutPath = [...r.values()].find((v) => /slideLayout/.test(v))
    const layoutDoc = layoutPath ? parse((await zip.file(layoutPath)?.async('string')) ?? '<x/>') : null
    const masterPath = layoutPath ? [...(await rels(zip, layoutPath)).values()].find((v) => /slideMaster/.test(v)) : undefined
    const masterDoc = masterPath ? parse((await zip.file(masterPath)?.async('string')) ?? '<x/>') : null
    const lph = phMap(layoutDoc), mph = phMap(masterDoc)
    const slide: Slide = { index: si + 1, els: [] }
    for (const d of [masterDoc, layoutDoc, doc]) { const bg = d ? deep(d, 'bg')[0] : undefined; const c = color(bg ? deep(bg, 'solidFill')[0] : undefined, theme); if (c) slide.bg = c }
    const walk = async (tree: Element, off = { dx: 0, dy: 0, sx: 1, sy: 1 }) => {
      for (const el of Array.from(tree.children)) {
        const ln = el.localName
        if (ln === 'grpSp') {
          const g = deep(el, 'xfrm')[0]
          const o = kid(g, 'off'), e = kid(g, 'ext'), co = kid(g, 'chOff'), ce = kid(g, 'chExt')
          if (o && e && co && ce) {
            const sx = +e.getAttribute('cx')! / (+ce.getAttribute('cx')! || 1), sy = +e.getAttribute('cy')! / (+ce.getAttribute('cy')! || 1)
            await walk(el, { dx: off.dx + (+o.getAttribute('x')! / EMU - (+co.getAttribute('x')! / EMU) * sx) * off.sx, dy: off.dy + (+o.getAttribute('y')! / EMU - (+co.getAttribute('y')! / EMU) * sy) * off.sy, sx: off.sx * sx, sy: off.sy * sy })
          } else await walk(el, off)
          continue
        }
        if (ln !== 'sp' && ln !== 'pic' && ln !== 'graphicFrame' && ln !== 'cxnSp') continue
        let x = xfrm(el)
        const ph = deep(el, 'ph')[0]
        if (!x && ph) { const t = ph.getAttribute('type') || 'body', i = ph.getAttribute('idx') || ''; x = (i && lph.byIdx.get(i)) || lph.byType.get(t) || (i && mph.byIdx.get(i)) || mph.byType.get(t) || null }
        if (!x) continue
        const box = { x: off.dx + x.x * off.sx, y: off.dy + x.y * off.sy, w: x.w * off.sx, h: x.h * off.sy, rot: x.rot }
        if (ln === 'pic') {
          const id = deep(el, 'blip')[0]?.getAttributeNS(R, 'embed') || ''
          const p = r.get(id); const src = p ? await mediaUrl(p) : ''
          if (src) slide.els.push({ kind: 'pic', ...box, src })
          continue
        }
        if (ln === 'graphicFrame') {
          const tbl = deep(el, 'tbl')[0]
          if (tbl) {
            const rows = deep(tbl, 'tr').map((tr) => `<tr>${kids(tr, 'tc').map((tc) => { const fill = color(deep(kid(tc, 'tcPr'), 'solidFill')[0], theme); return `<td style="border:1px solid #9994;padding:2pt 4pt;vertical-align:top;${fill ? `background:${fill}` : ''}">${textHtml(kid(tc, 'txBody'), theme, 12).replace('padding:3.6pt 7.2pt', 'padding:0')}</td>` }).join('')}</tr>`).join('')
            slide.els.push({ kind: 'table', ...box, html: `<table style="width:100%;border-collapse:collapse;font-size:12pt">${rows}</table>` })
          }
          continue
        }
        const spPr = kid(el, 'spPr')
        const fill = color(kid(spPr, 'solidFill'), theme)
        const line = kid(spPr, 'ln'); const stroke = line ? color(kid(line, 'solidFill'), theme) : undefined
        const isTitle = ph && /title|ctrTitle/.test(ph.getAttribute('type') || '')
        const html = textHtml(kid(el, 'txBody'), theme, isTitle ? 32 : 18)
        const hasText = /<span/.test(html)
        if (fill || stroke) slide.els.push({ kind: 'shape', ...box, fill: fill || 'transparent', html: stroke ? `<div style="position:absolute;inset:0;border:1.5px solid ${stroke}"></div>` : '' })
        if (hasText) slide.els.push({ kind: 'text', ...box, html })
      }
    }
    const tree = deep(doc, 'spTree')[0]
    if (tree) await walk(tree)
    // speaker notes
    const notesPath = [...r.values()].find((v) => /notesSlide/.test(v))
    if (notesPath) { const n = await zip.file(notesPath)?.async('string'); if (n) slide.notes = deep(parse(n), 't').map((t) => t.textContent).join(' ').trim() }
    slides.push(slide)
  }
  void A
  return { width, height, slides, title: deep(parse((await zip.file('docProps/core.xml')?.async('string')) ?? '<x/>'), 'title')[0]?.textContent ?? undefined }
}

/** Render one slide into a container element at the given pixel width. */
export function slideHtml(deck: Deck, s: Slide): string {
  const els = s.els.map((e) => {
    const pos = `position:absolute;left:${e.x}pt;top:${e.y}pt;width:${e.w}pt;height:${e.h}pt;${e.rot ? `transform:rotate(${e.rot}deg);` : ''}`
    if (e.kind === 'pic') return `<img src="${e.src}" style="${pos}object-fit:fill" alt=""/>`
    if (e.kind === 'shape') return `<div style="${pos}background:${e.fill}">${e.html ?? ''}</div>`
    return `<div style="${pos}color:#000">${e.html}</div>`
  }).join('')
  return `<div style="position:relative;width:${deck.width}pt;height:${deck.height}pt;background:${s.bg || '#fff'};overflow:hidden;font-family:Calibri,Arial,sans-serif">${els}</div>`
}
