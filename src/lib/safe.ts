/* Shared output-safety helpers. Use these wherever text or a URL that came from a file, a pasted value,
 * a URL parameter, fetched data or storage is written into HTML, an attribute, an href/src, or generated markup.
 * escapeHtml/escapeAttr/safeUrl are pure (unit tested in scripts/tests/safe.test.mjs); stripActive and
 * sanitizeMarkup need a DOM (browser only). */

/** Escape text for an HTML text node or a quoted attribute value. */
export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Escape a value for an attribute (quoted with " or '). Also covers backticks for old IE-style parsers. */
export function escapeAttr(s: unknown): string {
  return escapeHtml(s).replace(/`/g, '&#96;')
}

const SAFE_DATA = /^data:(?:image\/[a-z0-9.+-]+|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|application\/pdf)(?:[;,])/i
const SAFE_SCHEMES = new Set(['http', 'https', 'blob', 'mailto', 'tel'])

/**
 * Returns the URL when it is safe to put in an href/src: relative paths, #fragments and ?queries,
 * http(s), blob:, mailto:, tel:, and data: images, audio, video or PDF. Anything else (javascript:,
 * vbscript:, data:text/html, file:, unknown schemes) returns `fallback`.
 * Browsers ignore tabs, newlines and control characters inside a scheme ("java\tscript:"), so those are
 * removed before the scheme is checked. When the result goes into an HTML string, also pass it through escapeAttr.
 */
export function safeUrl(u: unknown, fallback = ''): string {
  if (typeof u !== 'string') return fallback
  const s = u.trim()
  if (!s) return fallback
  // eslint-disable-next-line no-control-regex
  const probe = s.replace(/[\u0000-\u0020\u007f-\u009f]/g, '')
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(probe)
  if (!m) return s // relative URL, path, ?query or #fragment
  const scheme = m[1].toLowerCase()
  if (SAFE_SCHEMES.has(scheme)) return s
  if (scheme === 'data' && SAFE_DATA.test(probe)) return s
  return fallback
}

const ACTIVE_TAGS = 'script,iframe,frame,frameset,object,embed,applet,meta[http-equiv],set'
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'poster', 'data', 'background', 'lowsrc', 'dynsrc', 'xlink:href', 'srcdoc'])

/**
 * Removes anything that can run script from a parsed (inert) document or element tree: script-like elements,
 * on* event handler attributes, srcdoc, javascript:/vbscript:/data:text URLs, and SVG animations that rewrite links.
 * Everything else (text, layout, styles, images, safe links) is left exactly as it was.
 */
export function stripActive(root: ParentNode): void {
  root.querySelectorAll(ACTIVE_TAGS).forEach((n) => n.remove())
  root.querySelectorAll('animate,animateTransform,animateMotion').forEach((n) => { if (/href/i.test(n.getAttribute('attributeName') || '')) n.remove() })
  const all = (root as ParentNode).querySelectorAll('*')
  const one = (el: Element) => {
    for (const a of Array.from(el.attributes)) {
      const name = a.name.toLowerCase()
      if (name.startsWith('on') || name === 'srcdoc') { el.removeAttribute(a.name); continue }
      if (URL_ATTRS.has(name) || name.endsWith(':href')) { if (a.value.trim() && !safeUrl(a.value)) el.removeAttribute(a.name) }
    }
  }
  if ((root as Element).attributes) one(root as Element)
  all.forEach(one)
}

/**
 * Parses markup in an inert DOMParser document, strips active content with stripActive, and serializes it back.
 * For text/html it returns the whole document when the input had <html>/<body>, otherwise the body's inner HTML.
 */
export function sanitizeMarkup(markup: string, type: DOMParserSupportedType = 'text/html'): string {
  const doc = new DOMParser().parseFromString(markup, type)
  if (type !== 'text/html' && doc.getElementsByTagName('parsererror').length) {
    // not well-formed XML: fall back to the forgiving HTML parser so nothing active slips through unparsed
    const h = new DOMParser().parseFromString(markup, 'text/html')
    stripActive(h)
    return new XMLSerializer().serializeToString(h)
  }
  stripActive(doc)
  if (type === 'text/html') return /<(html|body)[\s>]/i.test(markup) ? '<!DOCTYPE html>\n' + doc.documentElement.outerHTML : doc.body.innerHTML
  return new XMLSerializer().serializeToString(doc)
}
