/* Minimal EPUB 2/3 reader: container → OPF (metadata, manifest, spine) → TOC (nav / NCX) → self-contained chapter HTML. */
import type JSZipType from 'jszip'

export interface TocEntry { title: string; href: string; level: number }
export interface Chapter { id: string; href: string; title?: string; chars: number }
export interface Book { title: string; author: string; language?: string; chapters: Chapter[]; toc: TocEntry[]; coverHref?: string; zip: JSZipType; opfDir: string }

const MIME_BY_EXT: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2', css: 'text/css' }

export function resolvePath(base: string, rel: string) {
  if (/^[a-z]+:/i.test(rel) || rel.startsWith('#')) return rel
  const clean = decodeURIComponent(rel.split('#')[0].split('?')[0])
  const parts = (clean.startsWith('/') ? [] : base.split('/').slice(0, -1)).concat(clean.replace(/^\//, '').split('/'))
  const out: string[] = []
  for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.' && p !== '') out.push(p) }
  return out.join('/')
}

const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml')
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const byLocal = (root: Document | Element, name: string) => Array.from(root.getElementsByTagNameNS('*', name))

export async function openEpub(file: Blob): Promise<Book> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(file).catch(() => { throw new Error('This file is not a valid EPUB (could not unzip it).') })
  const container = await zip.file('META-INF/container.xml')?.async('string')
  if (!container) throw new Error('Not an EPUB: META-INF/container.xml is missing.')
  const opfPath = byLocal(xml(container), 'rootfile')[0]?.getAttribute('full-path')
  if (!opfPath) throw new Error('EPUB container has no rootfile.')
  const opfStr = await zip.file(opfPath)?.async('string')
  if (!opfStr) throw new Error('EPUB package file (OPF) is missing.')
  const opf = xml(opfStr)
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''
  const title = text(byLocal(opf, 'title')[0]) || 'Untitled book'
  const author = byLocal(opf, 'creator').map(text).filter(Boolean).join(', ')
  const language = text(byLocal(opf, 'language')[0]) || undefined
  const manifest = new Map<string, { href: string; type: string; props: string }>()
  for (const it of byLocal(opf, 'item')) manifest.set(it.getAttribute('id') || '', { href: resolvePath(opfPath, it.getAttribute('href') || ''), type: it.getAttribute('media-type') || '', props: it.getAttribute('properties') || '' })
  const spineEl = byLocal(opf, 'spine')[0]
  const chapters: Chapter[] = []
  for (const ref of byLocal(opf, 'itemref')) {
    if (ref.getAttribute('linear') === 'no') continue
    const m = manifest.get(ref.getAttribute('idref') || '')
    if (m && /x?html/.test(m.type)) chapters.push({ id: ref.getAttribute('idref')!, href: m.href, chars: 0 })
  }
  if (!chapters.length) throw new Error('This EPUB has no readable chapters.')
  // cover image
  let coverHref: string | undefined
  for (const [, m] of manifest) if (m.props.split(/\s+/).includes('cover-image')) coverHref = m.href
  if (!coverHref) { const id = byLocal(opf, 'meta').find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content'); if (id && manifest.get(id)?.type.startsWith('image/')) coverHref = manifest.get(id)!.href }
  // TOC: EPUB3 nav, else NCX
  const toc: TocEntry[] = []
  const nav = [...manifest.values()].find((m) => m.props.split(/\s+/).includes('nav'))
  if (nav) {
    const s = await zip.file(nav.href)?.async('string')
    if (s) {
      const d = new DOMParser().parseFromString(s, 'application/xhtml+xml')
      const navEl = byLocal(d, 'nav').find((n) => (n.getAttribute('epub:type') || n.getAttributeNS('http://www.idpf.org/2007/ops', 'type') || '').includes('toc')) ?? byLocal(d, 'nav')[0]
      const walk = (ol: Element, level: number) => {
        for (const li of Array.from(ol.children).filter((c) => c.localName === 'li')) {
          const a = Array.from(li.children).find((c) => c.localName === 'a' || c.localName === 'span')
          if (a && a.getAttribute('href')) toc.push({ title: text(a), href: resolvePath(nav.href, a.getAttribute('href')!) + (a.getAttribute('href')!.includes('#') ? '#' + a.getAttribute('href')!.split('#')[1] : ''), level })
          const sub = Array.from(li.children).find((c) => c.localName === 'ol')
          if (sub) walk(sub, level + 1)
        }
      }
      const ol = navEl && byLocal(navEl, 'ol')[0]
      if (ol) walk(ol, 0)
    }
  }
  if (!toc.length) {
    const ncxId = spineEl?.getAttribute('toc')
    const ncx = (ncxId && manifest.get(ncxId)) || [...manifest.values()].find((m) => m.type === 'application/x-dtbncx+xml')
    const s = ncx && (await zip.file(ncx.href)?.async('string'))
    if (s && ncx) {
      const d = xml(s)
      const walk = (parent: Element, level: number) => {
        for (const np of Array.from(parent.children).filter((c) => c.localName === 'navPoint')) {
          const label = text(byLocal(np, 'text')[0])
          const src = byLocal(np, 'content')[0]?.getAttribute('src')
          if (src) toc.push({ title: label, href: resolvePath(ncx.href, src) + (src.includes('#') ? '#' + src.split('#')[1] : ''), level })
          walk(np, level + 1)
        }
      }
      const map = byLocal(d, 'navMap')[0]
      if (map) walk(map, 0)
    }
  }
  for (const c of chapters) c.title = toc.find((t) => t.href.split('#')[0] === c.href)?.title
  return { title, author, language, chapters, toc, coverHref, zip, opfDir }
}

export async function dataUrl(zip: JSZipType, path: string): Promise<string | null> {
  const f = zip.file(path)
  if (!f) return null
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const b64 = await f.async('base64')
  return `data:${MIME_BY_EXT[ext] ?? 'application/octet-stream'};base64,${b64}`
}

async function inlineCssUrls(zip: JSZipType, css: string, cssPath: string, cache: Map<string, string | null>) {
  const urls = [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)]
  let out = css
  for (const m of urls) {
    const u = m[2]
    if (/^(data:|https?:|#)/i.test(u)) continue
    const p = resolvePath(cssPath, u)
    if (!cache.has(p)) cache.set(p, await dataUrl(zip, p))
    const d = cache.get(p)
    out = out.split(m[0]).join(d ? `url("${d}")` : 'none')
  }
  // @import of other sheets is rare in EPUBs — drop it
  return out.replace(/@import[^;]+;/g, '')
}

/** Build a self-contained HTML document for one chapter (images & CSS inlined, scripts dropped). */
export async function chapterHtml(book: Book, ch: Chapter, opts: { bookStyles: boolean; css: string }, cache: Map<string, string | null>) {
  const raw = await book.zip.file(ch.href)?.async('string')
  if (!raw) return { html: '', chars: 0, isCoverOnly: false, firstImg: '' }
  let doc = new DOMParser().parseFromString(raw, 'application/xhtml+xml')
  if (doc.getElementsByTagName('parsererror').length) doc = new DOMParser().parseFromString(raw, 'text/html')
  const body = doc.getElementsByTagName('body')[0] ?? doc.documentElement
  for (const el of Array.from(doc.querySelectorAll('script, iframe, object, embed, form'))) el.remove()
  let styles = ''
  if (opts.bookStyles) {
    for (const link of Array.from(doc.querySelectorAll('link'))) {
      if (!/stylesheet/i.test(link.getAttribute('rel') || '')) continue
      const p = resolvePath(ch.href, link.getAttribute('href') || '')
      const css = await book.zip.file(p)?.async('string')
      if (css) styles += await inlineCssUrls(book.zip, css, p, cache)
    }
    for (const st of Array.from(doc.querySelectorAll('style'))) styles += await inlineCssUrls(book.zip, st.textContent || '', ch.href, cache)
  }
  // images (<img src>, SVG <image href / xlink:href>)
  let firstImg = ''
  for (const img of Array.from(body.querySelectorAll('img'))) {
    const src = img.getAttribute('src'); if (!src || /^(data:|https?:)/.test(src)) continue
    const p = resolvePath(ch.href, src)
    if (!cache.has(p)) cache.set(p, await dataUrl(book.zip, p))
    const d = cache.get(p)
    if (d) { img.setAttribute('src', d); firstImg ||= p } else img.remove()
  }
  for (const im of byLocal(body, 'image')) {
    const href = im.getAttribute('href') || im.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
    if (!href || href.startsWith('data:')) continue
    const p = resolvePath(ch.href, href)
    if (!cache.has(p)) cache.set(p, await dataUrl(book.zip, p))
    const d = cache.get(p)
    if (d) { im.setAttribute('href', d); im.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', d); firstImg ||= p }
  }
  const chars = (body.textContent ?? '').replace(/\s+/g, '').length
  const imgCount = body.querySelectorAll('img').length + byLocal(body, 'image').length
  const isCoverOnly = chars < 40 && imgCount === 1
  const serializer = new XMLSerializer()
  const inner = Array.from(body.childNodes).map((n) => (n.nodeType === 1 ? serializer.serializeToString(n) : n.nodeType === 3 ? (n.textContent ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;') : '')).join('')
  const bodyClass = body.getAttribute('class') ? ` class="${body.getAttribute('class')}"` : ''
  const lang = book.language ? ` lang="${book.language}"` : ''
  const html = `<!doctype html><html${lang}><head><meta charset="utf-8"><style>${styles}</style><style>${opts.css}</style></head><body${bodyClass}>${inner}</body></html>`
  return { html, chars, isCoverOnly, firstImg }
}

export const CLEAN_CSS = (size: number, font: string) => `html,body{margin:0;padding:0;background:#fff!important;}
body{font-family:${font};font-size:${size}pt;line-height:1.55;color:#1a1a1a;text-align:justify;hyphens:auto;}
h1,h2,h3,h4{font-family:inherit;line-height:1.25;text-align:left;color:#111;break-after:avoid;}h1{font-size:1.8em;margin:.4em 0 .8em;}h2{font-size:1.4em;margin:1.2em 0 .6em;}h3{font-size:1.15em;margin:1em 0 .5em;}
p{margin:0 0 .55em;orphans:2;widows:2;}img,svg{max-width:100%;height:auto;display:block;margin:.8em auto;}a{color:inherit;text-decoration:none;}
blockquote{margin:.8em 1.5em;font-style:italic;}table{border-collapse:collapse;margin:1em auto;}td,th{border:1px solid #ccc;padding:3px 6px;}pre,code{font-family:'Courier New',monospace;font-size:.9em;white-space:pre-wrap;}`

/** Overrides applied on top of the book's own CSS so it fits the page and renders reliably. */
export const BOOK_FIX_CSS = `html,body{margin:0!important;padding:0!important;background:#fff!important;max-width:none!important;}img,svg{max-width:100%!important;height:auto;}svg{max-height:100%;}*{max-width:100%;}`
