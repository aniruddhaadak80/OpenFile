/* Web and SEO helpers: robots.txt, sitemaps, redirects, hreflang, headers, UTM, SERP width, schema, llms.txt, HTML audit.
 * Pure string functions, no DOM except where noted, so they can be tested in Node. */

export const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/* ---------------- robots.txt ---------------- */
export interface RobotsGroup { agents: string[]; allow: string[]; disallow: string[]; crawlDelay?: number }
export const AI_CRAWLERS = ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'anthropic-ai', 'Google-Extended', 'PerplexityBot', 'CCBot', 'Bytespider', 'Applebot-Extended', 'meta-externalagent', 'Amazonbot', 'cohere-ai']
export function buildRobots(groups: RobotsGroup[], sitemaps: string[] = [], host = ''): string {
  const out: string[] = []
  for (const g of groups) {
    if (!g.agents.length) continue
    for (const a of g.agents) out.push(`User-agent: ${a.trim()}`)
    for (const p of g.allow) if (p.trim()) out.push(`Allow: ${p.trim()}`)
    for (const p of g.disallow) out.push(`Disallow: ${p.trim()}`)
    if (!g.allow.length && !g.disallow.length) out.push('Disallow:')
    if (g.crawlDelay) out.push(`Crawl-delay: ${g.crawlDelay}`)
    out.push('')
  }
  for (const s of sitemaps) if (s.trim()) out.push(`Sitemap: ${s.trim()}`)
  if (host.trim()) out.push(`Host: ${host.trim()}`)
  return out.join('\n').trim() + '\n'
}
/** Parse a robots.txt and test whether a path is allowed for a user agent (longest match wins, Allow wins ties). */
export function parseRobots(txt: string) {
  const groups: RobotsGroup[] = []
  let cur: RobotsGroup | null = null, lastWasAgent = false
  const sitemaps: string[] = []
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(); if (!line) continue
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if (!m) continue
    const k = m[1].toLowerCase(), v = m[2].trim()
    if (k === 'user-agent') { if (!cur || !lastWasAgent) { cur = { agents: [], allow: [], disallow: [] }; groups.push(cur) } cur.agents.push(v); lastWasAgent = true; continue }
    lastWasAgent = false
    if (k === 'sitemap') { sitemaps.push(v); continue }
    if (!cur) continue
    if (k === 'allow') cur.allow.push(v)
    else if (k === 'disallow') cur.disallow.push(v)
    else if (k === 'crawl-delay') cur.crawlDelay = Number(v)
  }
  return { groups, sitemaps }
}
const ruleRe = (p: string) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$').replace(/\$$/, '$'))
export function robotsAllowed(txt: string, agent: string, path: string): { allowed: boolean; rule?: string } {
  const { groups } = parseRobots(txt)
  const a = agent.toLowerCase()
  let g = groups.find((x) => x.agents.some((y) => y.toLowerCase() !== '*' && a.includes(y.toLowerCase())))
  if (!g) g = groups.find((x) => x.agents.includes('*'))
  if (!g) return { allowed: true }
  let best: { len: number; allow: boolean; rule: string } | null = null
  for (const [list, allow] of [[g.allow, true], [g.disallow, false]] as const) for (const p of list) {
    if (!p) continue
    if (ruleRe(p).test(path)) { const len = p.length; if (!best || len > best.len || (len === best.len && allow)) best = { len, allow, rule: `${allow ? 'Allow' : 'Disallow'}: ${p}` } }
  }
  return best ? { allowed: best.allow, rule: best.rule } : { allowed: true }
}

/* ---------------- sitemaps ---------------- */
export interface SitemapUrl { loc: string; lastmod?: string; changefreq?: string; priority?: number; images?: string[] }
export function buildSitemap(urls: SitemapUrl[]): string {
  const img = urls.some((u) => u.images?.length)
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${img ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' : ''}>`]
  for (const u of urls) {
    lines.push('  <url>', `    <loc>${xmlEsc(u.loc)}</loc>`)
    if (u.lastmod) lines.push(`    <lastmod>${xmlEsc(u.lastmod)}</lastmod>`)
    if (u.changefreq) lines.push(`    <changefreq>${u.changefreq}</changefreq>`)
    if (u.priority != null) lines.push(`    <priority>${u.priority.toFixed(1)}</priority>`)
    for (const i of u.images ?? []) lines.push(`    <image:image><image:loc>${xmlEsc(i)}</image:loc></image:image>`)
    lines.push('  </url>')
  }
  lines.push('</urlset>')
  return lines.join('\n') + '\n'
}
export function buildSitemapIndex(files: string[], lastmod?: string) {
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...files.map((f) => `  <sitemap><loc>${xmlEsc(f)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</sitemap>`), '</sitemapindex>'].join('\n') + '\n'
}
/** Read <url> or <sitemap> entries with a regex parser (works for big files and in Node). */
export function parseSitemap(xml: string): { kind: 'urlset' | 'index' | 'unknown'; urls: SitemapUrl[]; problems: string[] } {
  const kind = /<sitemapindex\b/i.test(xml) ? 'index' : /<urlset\b/i.test(xml) ? 'urlset' : 'unknown'
  const tag = kind === 'index' ? 'sitemap' : 'url'
  const urls: SitemapUrl[] = [], problems: string[] = []
  const un = (s?: string) => s?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim()
  const get = (b: string, t: string) => un(b.match(new RegExp(`<(?:\\w+:)?${t}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${t}>`, 'i'))?.[1])
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi')
  let m: RegExpExecArray | null
  const seen = new Set<string>()
  while ((m = re.exec(xml))) {
    const b = m[1], loc = get(b, 'loc') ?? ''
    const images = [...b.matchAll(/<image:loc>([\s\S]*?)<\/image:loc>/gi)].map((x) => un(x[1])!)
    const pr = get(b, 'priority')
    const u: SitemapUrl = { loc, lastmod: get(b, 'lastmod'), changefreq: get(b, 'changefreq'), priority: pr ? Number(pr) : undefined, images }
    if (!/^https?:\/\//i.test(loc)) problems.push(`Not an absolute URL: ${loc || '(empty loc)'}`)
    if (seen.has(loc)) problems.push(`Listed twice: ${loc}`)
    seen.add(loc)
    if (u.lastmod && !/^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(u.lastmod)) problems.push(`Odd lastmod "${u.lastmod}" on ${loc}`)
    if (u.priority != null && !(u.priority >= 0 && u.priority <= 1)) problems.push(`Priority out of 0 to 1 on ${loc}`)
    urls.push(u)
  }
  if (kind === 'unknown') problems.unshift('No <urlset> or <sitemapindex> found. This may not be a sitemap.')
  if (urls.length > 50000) problems.unshift(`${urls.length} URLs. One sitemap may hold at most 50,000, so split it.`)
  return { kind, urls, problems: [...new Set(problems)] }
}
/** Pull links out of HTML text (href attributes), resolved against a base URL. */
export function extractLinks(html: string, base: string): string[] {
  const out = new Set<string>()
  for (const m of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const h = (m[1] ?? m[2] ?? m[3] ?? '').trim()
    if (!h || /^(#|mailto:|tel:|javascript:|data:)/i.test(h)) continue
    try { const u = new URL(h, base); u.hash = ''; out.add(u.toString()) } catch { /* skip */ }
  }
  return [...out]
}

/* ---------------- redirects ---------------- */
export type RedirectTarget = 'apache' | 'nginx' | 'netlify' | 'vercel' | 'cloudflare' | 'iis' | 'caddy'
export interface Redirect { from: string; to: string; code: number }
export function parseRedirectList(text: string): Redirect[] {
  const out: Redirect[] = []
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const parts = t.split(/\s*[,\t;]\s*|\s+(?:->|=>)\s+|\s+/).filter(Boolean)
    if (parts.length < 2) continue
    if (/^(from|old|source)$/i.test(parts[0])) continue
    const code = parts[2] && /^(301|302|303|307|308|410)$/.test(parts[2]) ? Number(parts[2]) : 301
    out.push({ from: parts[0], to: parts[1], code })
  }
  return out
}
const pathOf = (u: string) => { try { const x = new URL(u); return x.pathname + x.search } catch { return u.startsWith('/') ? u : '/' + u } }
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export function buildRedirects(list: Redirect[], target: RedirectTarget): string {
  switch (target) {
    case 'apache': return ['# .htaccess', 'RewriteEngine On', ...list.map((r) => { const p = pathOf(r.from); const [path, q] = p.split('?'); return (q ? `RewriteCond %{QUERY_STRING} ^${reEsc(q)}$\n` : '') + `RewriteRule ^${reEsc(path.replace(/^\//, ''))}$ ${r.to}${q ? '?' : ''} [R=${r.code},L]` })].join('\n') + '\n'
    case 'nginx': return ['# inside your server { } block', ...list.map((r) => `location = ${pathOf(r.from).split('?')[0]} { return ${r.code} ${r.to}; }`)].join('\n') + '\n'
    case 'netlify': return list.map((r) => `${pathOf(r.from)}  ${r.to}  ${r.code}`).join('\n') + '\n'
    case 'vercel': return JSON.stringify({ redirects: list.map((r) => ({ source: pathOf(r.from).split('?')[0], destination: r.to, statusCode: r.code })) }, null, 2) + '\n'
    case 'cloudflare': return list.map((r) => `${pathOf(r.from)} ${r.to} ${r.code}`).join('\n') + '\n'
    case 'caddy': return list.map((r) => `redir ${pathOf(r.from).split('?')[0]} ${r.to} ${r.code}`).join('\n') + '\n'
    case 'iis': return ['<rewrite>', '  <rules>', ...list.map((r, i) => `    <rule name="r${i + 1}" stopProcessing="true"><match url="^${xmlEsc(reEsc(pathOf(r.from).split('?')[0].replace(/^\//, '')))}$" /><action type="Redirect" url="${xmlEsc(r.to)}" redirectType="${r.code === 302 || r.code === 307 ? 'Found' : 'Permanent'}" /></rule>`), '  </rules>', '</rewrite>'].join('\n') + '\n'
  }
}
/** Find chains (A to B to C) and loops in a redirect list. */
export function redirectChains(list: Redirect[]) {
  const map = new Map(list.map((r) => [pathOf(r.from), pathOf(r.to)]))
  const chains: string[][] = [], loops: string[][] = []
  for (const start of map.keys()) {
    const path = [start]; let cur = map.get(start)!
    while (map.has(cur) && path.length < 20) { if (path.includes(cur)) { loops.push([...path, cur]); break } path.push(cur); cur = map.get(cur)! }
    if (path.length > 1 && !loops.some((l) => l[0] === start)) chains.push([...path, cur])
  }
  return { chains, loops }
}

/* ---------------- hreflang ---------------- */
export interface HrefAlt { lang: string; url: string }
export const validLang = (l: string) => l === 'x-default' || /^[a-z]{2,3}(-([A-Z]{2}|[A-Z][a-z]{3}|\d{3}))?$/.test(l)
export function hreflangTags(alts: HrefAlt[]) { return alts.map((a) => `<link rel="alternate" hreflang="${xmlEsc(a.lang)}" href="${xmlEsc(a.url)}" />`).join('\n') }
export function hreflangSitemap(alts: HrefAlt[]) {
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...alts.filter((a) => a.lang !== 'x-default').map((a) => ['  <url>', `    <loc>${xmlEsc(a.url)}</loc>`, ...alts.map((b) => `    <xhtml:link rel="alternate" hreflang="${xmlEsc(b.lang)}" href="${xmlEsc(b.url)}" />`), '  </url>'].join('\n')), '</urlset>'].join('\n') + '\n'
}
export function hreflangHeader(alts: HrefAlt[]) { return 'Link: ' + alts.map((a) => `<${a.url}>; rel="alternate"; hreflang="${a.lang}"`).join(', ') }

/* ---------------- security headers ---------------- */
export interface HeaderOpts { csp: Record<string, string[]>; hsts: number; hstsSub: boolean; preload: boolean; frame: 'DENY' | 'SAMEORIGIN' | ''; referrer: string; permissions: Record<string, string>; nosniff: boolean; coop: string; corp: string }
export function cspString(csp: Record<string, string[]>) { return Object.entries(csp).filter(([, v]) => v.length).map(([k, v]) => `${k} ${v.join(' ')}`).join('; ') + (Object.keys(csp).length ? ';' : '') }
export function headerList(o: HeaderOpts): [string, string][] {
  const h: [string, string][] = []
  const c = cspString(o.csp); if (c) h.push(['Content-Security-Policy', c])
  if (o.hsts) h.push(['Strict-Transport-Security', `max-age=${o.hsts}${o.hstsSub ? '; includeSubDomains' : ''}${o.preload ? '; preload' : ''}`])
  if (o.frame) h.push(['X-Frame-Options', o.frame])
  if (o.nosniff) h.push(['X-Content-Type-Options', 'nosniff'])
  if (o.referrer) h.push(['Referrer-Policy', o.referrer])
  const pp = Object.entries(o.permissions).map(([k, v]) => `${k}=${v}`).join(', '); if (pp) h.push(['Permissions-Policy', pp])
  if (o.coop) h.push(['Cross-Origin-Opener-Policy', o.coop])
  if (o.corp) h.push(['Cross-Origin-Resource-Policy', o.corp])
  return h
}
export function headersFor(h: [string, string][], target: 'apache' | 'nginx' | 'netlify' | 'vercel' | 'cloudflare' | 'meta' | 'express'): string {
  const q = (s: string) => s.replace(/"/g, '\\"')
  switch (target) {
    case 'apache': return '<IfModule mod_headers.c>\n' + h.map(([k, v]) => `  Header always set ${k} "${q(v)}"`).join('\n') + '\n</IfModule>\n'
    case 'nginx': return h.map(([k, v]) => `add_header ${k} "${q(v)}" always;`).join('\n') + '\n'
    case 'netlify': case 'cloudflare': return '/*\n' + h.map(([k, v]) => `  ${k}: ${v}`).join('\n') + '\n'
    case 'vercel': return JSON.stringify({ headers: [{ source: '/(.*)', headers: h.map(([key, value]) => ({ key, value })) }] }, null, 2) + '\n'
    case 'express': return "app.use((req, res, next) => {\n" + h.map(([k, v]) => `  res.setHeader('${k}', '${v.replace(/'/g, "\\'")}')`).join('\n') + '\n  next()\n})\n'
    case 'meta': return h.filter(([k]) => k === 'Content-Security-Policy' || k === 'Referrer-Policy').map(([k, v]) => k === 'Referrer-Policy' ? `<meta name="referrer" content="${xmlEsc(v)}">` : `<meta http-equiv="${k}" content="${xmlEsc(v)}">`).join('\n') + '\n'
  }
}
/** Grade a set of headers the way scanners do (A to F). */
export function gradeHeaders(h: [string, string][]) {
  const names = new Set(h.map(([k]) => k.toLowerCase()))
  const need = ['content-security-policy', 'strict-transport-security', 'x-content-type-options', 'referrer-policy', 'permissions-policy', 'x-frame-options']
  let score = need.filter((n) => names.has(n)).length
  const csp = h.find(([k]) => k.toLowerCase() === 'content-security-policy')?.[1] ?? ''
  if (csp.includes("'unsafe-inline'") && /script-src[^;]*'unsafe-inline'/.test(csp)) score -= 0.5
  if (/frame-ancestors/.test(csp) && !names.has('x-frame-options')) score += 1
  const grade = score >= 6 ? 'A' : score >= 5 ? 'B' : score >= 4 ? 'C' : score >= 3 ? 'D' : 'F'
  return { grade, missing: need.filter((n) => !names.has(n) && !(n === 'x-frame-options' && /frame-ancestors/.test(csp))) }
}

/* ---------------- UTM ---------------- */
export interface Utm { source: string; medium: string; campaign: string; term?: string; content?: string; id?: string }
export function utmUrl(base: string, u: Utm, lower = true): string {
  const url = new URL(/^https?:\/\//i.test(base) ? base : 'https://' + base)
  const set = (k: string, v?: string) => { if (v && v.trim()) url.searchParams.set(k, lower ? v.trim().toLowerCase().replace(/\s+/g, '_') : v.trim()) }
  set('utm_source', u.source); set('utm_medium', u.medium); set('utm_campaign', u.campaign); set('utm_term', u.term); set('utm_content', u.content); set('utm_id', u.id)
  return url.toString()
}
export function readUtm(link: string): Record<string, string> {
  try { const u = new URL(link); const o: Record<string, string> = {}; u.searchParams.forEach((v, k) => { if (k.startsWith('utm_')) o[k] = v }); return o } catch { return {} }
}

/* ---------------- SERP preview: pixel width with an Arial approximation ---------------- */
// Average advance widths (px at 16px Arial) for printable ASCII 32..126, used when no canvas is around (Node tests).
const W16 = [4.4, 4.4, 5.7, 8.9, 8.9, 14.2, 10.7, 3.1, 5.3, 5.3, 6.2, 9.3, 4.4, 5.3, 4.4, 4.4, 8.9, 8.9, 8.9, 8.9, 8.9, 8.9, 8.9, 8.9, 8.9, 8.9, 4.4, 4.4, 9.3, 9.3, 9.3, 8.9, 16.2, 10.7, 10.7, 11.6, 11.6, 10.7, 9.8, 12.4, 11.6, 4.4, 8, 10.7, 8.9, 13.3, 11.6, 12.4, 10.7, 12.4, 11.6, 10.7, 9.8, 11.6, 10.7, 15.1, 10.7, 10.7, 9.8, 4.4, 4.4, 4.4, 7.5, 8.9, 5.3, 8.9, 8.9, 8, 8.9, 8.9, 4.4, 8.9, 8.9, 3.6, 3.6, 8, 3.6, 13.3, 8.9, 8.9, 8.9, 8.9, 5.3, 8, 4.4, 8.9, 8, 11.6, 8, 8, 8, 5.3, 4.2, 5.3, 9.3]
export function textWidth(s: string, px: number, measure?: (s: string) => number) {
  if (measure) return measure(s)
  let w = 0
  for (const ch of s) { const c = ch.codePointAt(0)!; w += c >= 32 && c <= 126 ? W16[c - 32] : c > 0x2e80 ? 16 : 9 }
  return (w * px) / 16
}
/** Cut text to a pixel budget, adding an ellipsis like search results do. */
export function truncatePx(s: string, maxPx: number, px: number, measure?: (s: string) => number) {
  if (textWidth(s, px, measure) <= maxPx) return { text: s, cut: false }
  const words = s.split(' ')
  let out = ''
  for (const w of words) { const next = out ? out + ' ' + w : w; if (textWidth(next + ' ...', px, measure) > maxPx) break; out = next }
  return { text: (out || s.slice(0, 10)) + ' ...', cut: true }
}

/* ---------------- schema.org JSON-LD ---------------- */
export type SchemaType = 'Article' | 'FAQPage' | 'Product' | 'LocalBusiness' | 'Event' | 'BreadcrumbList' | 'Organization' | 'Person' | 'Recipe' | 'HowTo' | 'WebSite' | 'SoftwareApplication'
const clean = (o: any): any => {
  if (Array.isArray(o)) { const a = o.map(clean).filter((x) => x !== undefined && !(typeof x === 'object' && x && !Array.isArray(x) && !Object.keys(x).some((k) => k !== '@type'))); return a.length ? a : undefined }
  if (o && typeof o === 'object') { const r: any = {}; for (const [k, v] of Object.entries(o)) { const c = clean(v); if (c !== undefined && c !== '') r[k] = c } return Object.keys(r).length ? r : undefined }
  return o === '' || o == null ? undefined : o
}
const lines = (s = '') => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
export function buildSchema(type: SchemaType, f: Record<string, string>): any {
  const base: any = { '@context': 'https://schema.org', '@type': type }
  const num = (v?: string) => (v && isFinite(Number(v)) ? Number(v) : v)
  switch (type) {
    case 'Article': Object.assign(base, { headline: f.headline, description: f.description, image: lines(f.images), datePublished: f.datePublished, dateModified: f.dateModified || f.datePublished, author: { '@type': 'Person', name: f.author, url: f.authorUrl }, publisher: { '@type': 'Organization', name: f.publisher, logo: { '@type': 'ImageObject', url: f.logo } }, mainEntityOfPage: f.url }); break
    case 'FAQPage': { const qa: any[] = []; const ls = lines(f.faq); for (let i = 0; i < ls.length; i++) { const m = ls[i].match(/^Q:\s*(.+)$/i); if (m) { const a = ls[i + 1]?.match(/^A:\s*(.+)$/i); qa.push({ '@type': 'Question', name: m[1], acceptedAnswer: { '@type': 'Answer', text: a ? a[1] : '' } }) } } base.mainEntity = qa; break }
    case 'Product': Object.assign(base, { name: f.name, description: f.description, image: lines(f.images), sku: f.sku, gtin: f.gtin, brand: { '@type': 'Brand', name: f.brand }, offers: { '@type': 'Offer', price: num(f.price), priceCurrency: f.currency, availability: f.availability ? `https://schema.org/${f.availability}` : undefined, url: f.url }, aggregateRating: f.rating ? { '@type': 'AggregateRating', ratingValue: num(f.rating), reviewCount: num(f.reviews) } : undefined }); break
    case 'LocalBusiness': Object.assign(base, { '@type': f.subtype || 'LocalBusiness', name: f.name, image: f.image, telephone: f.phone, url: f.url, priceRange: f.priceRange, address: { '@type': 'PostalAddress', streetAddress: f.street, addressLocality: f.city, addressRegion: f.region, postalCode: f.postal, addressCountry: f.country }, geo: f.lat ? { '@type': 'GeoCoordinates', latitude: num(f.lat), longitude: num(f.lng) } : undefined, openingHours: lines(f.hours) }); break
    case 'Event': Object.assign(base, { name: f.name, description: f.description, startDate: f.start, endDate: f.end, eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: `https://schema.org/${f.mode || 'OfflineEventAttendanceMode'}`, image: lines(f.images), location: f.mode === 'OnlineEventAttendanceMode' ? { '@type': 'VirtualLocation', url: f.url } : { '@type': 'Place', name: f.venue, address: f.address }, organizer: { '@type': 'Organization', name: f.organizer }, offers: f.price ? { '@type': 'Offer', price: num(f.price), priceCurrency: f.currency, url: f.url, availability: 'https://schema.org/InStock' } : undefined }); break
    case 'BreadcrumbList': base.itemListElement = lines(f.crumbs).map((l, i) => { const [name, item] = l.split('|').map((x) => x.trim()); return { '@type': 'ListItem', position: i + 1, name, item } }); break
    case 'Organization': Object.assign(base, { name: f.name, url: f.url, logo: f.logo, sameAs: lines(f.sameAs), contactPoint: f.phone ? { '@type': 'ContactPoint', telephone: f.phone, contactType: 'customer service' } : undefined }); break
    case 'Person': Object.assign(base, { name: f.name, jobTitle: f.jobTitle, url: f.url, image: f.image, worksFor: f.worksFor ? { '@type': 'Organization', name: f.worksFor } : undefined, sameAs: lines(f.sameAs) }); break
    case 'Recipe': Object.assign(base, { name: f.name, description: f.description, image: lines(f.images), author: { '@type': 'Person', name: f.author }, prepTime: f.prepTime, cookTime: f.cookTime, recipeYield: f.yield, recipeIngredient: lines(f.ingredients), recipeInstructions: lines(f.steps).map((s) => ({ '@type': 'HowToStep', text: s })) }); break
    case 'HowTo': Object.assign(base, { name: f.name, description: f.description, totalTime: f.totalTime, step: lines(f.steps).map((s, i) => ({ '@type': 'HowToStep', position: i + 1, text: s })) }); break
    case 'WebSite': Object.assign(base, { name: f.name, url: f.url, potentialAction: f.search ? { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: f.search }, 'query-input': 'required name=search_term_string' } : undefined }); break
    case 'SoftwareApplication': Object.assign(base, { name: f.name, operatingSystem: f.os, applicationCategory: f.category, offers: { '@type': 'Offer', price: num(f.price || '0'), priceCurrency: f.currency || 'USD' }, aggregateRating: f.rating ? { '@type': 'AggregateRating', ratingValue: num(f.rating), ratingCount: num(f.reviews) } : undefined }); break
  }
  return clean(base)
}
export const schemaScript = (obj: any) => `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2).replace(/</g, '\\u003c')}\n</script>`
/** Required fields Google lists for each rich result type. */
export const SCHEMA_REQUIRED: Partial<Record<SchemaType, string[]>> = { Article: ['headline', 'image', 'datePublished', 'author'], Product: ['name', 'image', 'price', 'currency'], LocalBusiness: ['name', 'street', 'city'], Event: ['name', 'start', 'venue'], Recipe: ['name', 'images'], FAQPage: ['faq'], BreadcrumbList: ['crumbs'] }

/* ---------------- llms.txt ---------------- */
export interface LlmsSection { title: string; links: { title: string; url: string; note?: string }[]; optional?: boolean }
export function buildLlms(o: { name: string; summary: string; details?: string; sections: LlmsSection[] }) {
  const out = [`# ${o.name.trim()}`, '']
  if (o.summary.trim()) out.push(`> ${o.summary.trim().replace(/\n+/g, ' ')}`, '')
  if (o.details?.trim()) out.push(o.details.trim(), '')
  for (const s of o.sections) {
    if (!s.links.length) continue
    out.push(`## ${s.optional ? 'Optional' : s.title.trim()}`, '')
    for (const l of s.links) out.push(`- [${l.title.trim()}](${l.url.trim()})${l.note?.trim() ? `: ${l.note.trim()}` : ''}`)
    out.push('')
  }
  return out.join('\n').trim() + '\n'
}
/** Turn a list of "Title | URL | note" lines, or bare URLs, into links. */
export function linksFromLines(text: string) {
  return lines(text).map((l) => {
    const p = l.split('|').map((x) => x.trim())
    if (p.length >= 2) return { title: p[0], url: p[1], note: p[2] }
    const m = l.match(/^\[(.+?)\]\((.+?)\)(?::\s*(.*))?$/); if (m) return { title: m[1], url: m[2], note: m[3] }
    let title = l; try { const u = new URL(l); title = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? u.hostname).replace(/[-_]/g, ' ').replace(/\.\w+$/, '') || u.hostname } catch { /* keep */ }
    return { title: title.charAt(0).toUpperCase() + title.slice(1), url: l }
  })
}

/* ---------------- on-page HTML audit (regex based so it also runs in Node) ---------------- */
export interface AuditItem { id: string; level: 'pass' | 'warn' | 'fail'; text: string }
export interface Audit { title: string; description: string; h1: string[]; words: number; items: AuditItem[]; score: number; links: { internal: number; external: number }; images: number; missingAlt: number }
const attr = (tag: string, n: string) => tag.match(new RegExp(`\\b${n}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find((x) => x != null) ?? null
const strip = (h: string) => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
export function auditHtml(html: string, keyword = ''): Audit {
  const items: AuditItem[] = []
  const add = (id: string, level: AuditItem['level'], text: string) => items.push({ id, level, text })
  const title = strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0])
  const meta = (k: string) => { const t = metas.find((m) => (attr(m, 'name') ?? attr(m, 'property') ?? '').toLowerCase() === k); return t ? attr(t, 'content') ?? '' : null }
  const description = meta('description') ?? ''
  const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => strip(m[1]))
  const body = strip(html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html)
  const words = body ? body.split(/\s+/).length : 0
  if (!title) add('title', 'fail', 'No <title>. Every page needs a unique title.')
  else if (title.length < 20 || title.length > 65) add('title', 'warn', `Title is ${title.length} characters. Aim for 30 to 60.`)
  else add('title', 'pass', `Title length is good (${title.length} characters).`)
  if (!description) add('desc', 'fail', 'No meta description.')
  else if (description.length < 70 || description.length > 160) add('desc', 'warn', `Meta description is ${description.length} characters. Aim for 120 to 155.`)
  else add('desc', 'pass', `Meta description length is good (${description.length}).`)
  if (!h1.length) add('h1', 'fail', 'No <h1> heading.')
  else if (h1.length > 1) add('h1', 'warn', `${h1.length} <h1> headings. One is clearer.`)
  else add('h1', 'pass', 'One <h1> heading.')
  const levels = [...html.matchAll(/<h([1-6])\b/gi)].map((m) => +m[1])
  const skip = levels.some((l, i) => i > 0 && l > levels[i - 1] + 1)
  add('order', skip ? 'warn' : 'pass', skip ? 'Heading levels skip (for example h2 straight to h4).' : 'Heading levels are in order.')
  const lang = attr(html.match(/<html\b[^>]*>/i)?.[0] ?? '', 'lang')
  add('lang', lang ? 'pass' : 'warn', lang ? `Page language is set (${lang}).` : 'No lang attribute on <html>.')
  const canon = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).find((l) => (attr(l, 'rel') ?? '').toLowerCase() === 'canonical')
  add('canonical', canon ? 'pass' : 'warn', canon ? `Canonical URL: ${attr(canon, 'href')}` : 'No canonical link.')
  add('viewport', meta('viewport') != null ? 'pass' : 'fail', meta('viewport') != null ? 'Mobile viewport is set.' : 'No viewport meta tag, so phones will zoom out.')
  const robots = meta('robots') ?? ''
  if (/noindex/i.test(robots)) add('robots', 'warn', 'This page asks search engines not to index it (noindex).')
  const og = ['og:title', 'og:description', 'og:image'].filter((k) => meta(k) == null)
  add('og', og.length ? 'warn' : 'pass', og.length ? `Missing Open Graph tags: ${og.join(', ')}.` : 'Open Graph title, description and image are set.')
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0])
  const missingAlt = imgs.filter((i) => attr(i, 'alt') == null).length
  add('alt', missingAlt ? 'warn' : 'pass', missingAlt ? `${missingAlt} of ${imgs.length} images have no alt text.` : `All ${imgs.length} images have alt text.`)
  const as = [...html.matchAll(/<a\b[^>]*>/gi)].map((m) => attr(m[0], 'href') ?? '')
  const external = as.filter((h) => /^https?:\/\//i.test(h)).length, internal = as.length - external
  if (words < 300) add('words', 'warn', `Only ${words} words of text. Thin pages rank poorly.`)
  else add('words', 'pass', `${words} words of text.`)
  add('jsonld', /application\/ld\+json/i.test(html) ? 'pass' : 'warn', /application\/ld\+json/i.test(html) ? 'Structured data (JSON-LD) found.' : 'No structured data (JSON-LD).')
  if (keyword.trim()) {
    const k = keyword.trim().toLowerCase()
    const inT = title.toLowerCase().includes(k), inD = description.toLowerCase().includes(k), inH = h1.some((h) => h.toLowerCase().includes(k))
    const count = body.toLowerCase().split(k).length - 1
    add('kw', inT && inH ? 'pass' : 'warn', `Keyword "${keyword}": title ${inT ? 'yes' : 'no'}, description ${inD ? 'yes' : 'no'}, h1 ${inH ? 'yes' : 'no'}, ${count} times in the text.`)
  }
  const pts = items.reduce((s, i) => s + (i.level === 'pass' ? 2 : i.level === 'warn' ? 1 : 0), 0)
  return { title, description, h1, words, items, score: Math.round((pts / (items.length * 2)) * 100), links: { internal, external }, images: imgs.length, missingAlt }
}

/** Split text into candidate sentences for meta descriptions. */
export function sentences(text: string): string[] {
  return text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/).map((s) => s.trim()).filter((s) => s.length >= 25 && s.split(' ').length >= 5)
}
/** Fit one or two sentences into a meta description of at most max characters. */
export function fitDescription(parts: string[], max = 155) {
  let out = ''
  for (const p of parts) { const next = out ? out + ' ' + p : p; if (next.length > max) break; out = next }
  if (!out && parts[0]) { const cut = parts[0].slice(0, max - 3); out = cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '') + '...' }
  return out
}
