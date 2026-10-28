/* HTML to plain text without a DOM, so it is safe (nothing runs) and testable in Node. */
export interface StripOpts {
  blocks: boolean // line breaks for block elements
  lists: boolean // "- " before list items
  links: 'drop' | 'inline' // keep link URLs as "text (url)"
  images: boolean // keep image alt text as [alt]
  collapse: boolean // collapse runs of spaces and blank lines
  decode: boolean // decode entities
}
export const DEFAULT_STRIP: StripOpts = { blocks: true, lists: true, links: 'inline', images: true, collapse: true, decode: true }

const BASIC: Record<string, number> = { amp: 38, lt: 60, gt: 62, quot: 34, apos: 39, nbsp: 160 }
export function decodeEntities(s: string, named?: Map<string, number>): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]{1,31});/gi, (m, e: string) => {
    if (e[0] === '#') {
      const c = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : m
    }
    const c = named?.get(e) ?? BASIC[e]
    return c != null ? String.fromCodePoint(c) : m
  })
}

const BLOCK = 'address|article|aside|blockquote|dd|details|dialog|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|main|nav|ol|p|pre|section|summary|table|tbody|thead|tfoot|tr|ul|li|caption'
const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : ''
}

export function htmlToText(html: string, o: StripOpts = DEFAULT_STRIP, named?: Map<string, number>): string {
  let s = html.replace(/\r\n?/g, '\n')
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  s = s.replace(/<(script|style|head|template|noscript|svg|iframe|object)\b[\s\S]*?<\/\1\s*>/gi, '')
  s = s.replace(/<!DOCTYPE[^>]*>/gi, '')
  // Keep <pre> whitespace by protecting it.
  const pres: string[] = []
  s = s.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre\s*>/gi, (_, inner: string) => { pres.push(inner.replace(/<[^>]+>/g, '')); return `\n\u0000P${pres.length - 1}\u0000\n` })
  if (!o.collapse) { /* keep source whitespace */ } else s = s.replace(/[ \t\n]+/g, ' ')
  if (o.images) s = s.replace(/<img\b[^>]*>/gi, (t) => { const a = attr(t, 'alt'); return a ? `[${a}]` : '' })
  if (o.links === 'inline') s = s.replace(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi, (_, at: string, inner: string) => {
    const href = attr(' ' + at, 'href'); const text = inner.replace(/<[^>]+>/g, '').trim()
    if (!href || href.startsWith('#') || /^javascript:/i.test(href) || href === text) return inner
    return `${inner} (${href})`
  })
  if (o.blocks) {
    s = s.replace(/<br\s*\/?>/gi, '\n')
    s = s.replace(/<\/(td|th)\s*>/gi, '\t')
    if (o.lists) s = s.replace(/<li\b[^>]*>/gi, '\n- ').replace(/<\/li\s*>/gi, '')
    s = s.replace(new RegExp(`</?(${BLOCK})\\b[^>]*>`, 'gi'), (t) => /^<\/?(p|h[1-6]|blockquote|table|ul|ol|pre|hr|figure|section|article)\b/i.test(t) ? '\n\n' : '\n')
  } else {
    s = s.replace(/<br\s*\/?>/gi, ' ')
    if (o.lists) s = s.replace(/<li\b[^>]*>/gi, ' - ')
  }
  s = s.replace(/<\/?[a-z][^>]*>/gi, '')
  if (o.decode) s = decodeEntities(s, named)
  if (o.collapse) {
    s = s.replace(/\u00a0/g, ' ').split('\n').map((l) => l.replace(/ {2,}/g, ' ').replace(/^ +| +$/g, '').replace(/\t+$/, '')).join('\n')
    s = s.replace(/\n{3,}/g, '\n\n')
  }
  s = s.replace(/\u0000P(\d+)\u0000/g, (_, i) => (o.decode ? decodeEntities(pres[+i], named) : pres[+i]).replace(/^\n|\n$/g, ''))
  return s.trim()
}
