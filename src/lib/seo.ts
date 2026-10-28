// Keeps <title>, meta description, canonical and Open Graph tags in sync during client-side navigation.
// scripts/postbuild.mjs writes the same tags into each pre-rendered route's index.html for crawlers.
function meta(attr: 'name' | 'property', key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el) }
  el.setAttribute('content', value)
}

export function setPageMeta(title: string, description?: string) {
  document.title = title
  meta('property', 'og:title', title)
  if (description) { meta('name', 'description', description); meta('property', 'og:description', description) }
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link) }
  link.href = location.origin + location.pathname
}

/** Inject (or replace) a JSON-LD block identified by `id`. Pass null to remove it. */
export function setJsonLd(id: string, data: object | null) {
  const sel = `script[type="application/ld+json"][data-id="${id}"]`
  document.head.querySelector(sel)?.remove()
  if (!data) return
  const s = document.createElement('script')
  s.type = 'application/ld+json'; s.dataset.id = id; s.textContent = JSON.stringify(data)
  document.head.appendChild(s)
}
