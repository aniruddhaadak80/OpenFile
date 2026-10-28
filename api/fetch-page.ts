// GET /api/fetch-page?url=https://example.com: fetches a public web page's HTML so HTML-to-PDF can render it.
// Only the URL is received; user files never touch the server.
export default async function handler(req: any, res: any) {
  const url = String(req.query?.url || '')
  let target: URL
  try { target = new URL(url) } catch { return res.status(400).json({ error: 'Invalid URL' }) }
  if (!/^https?:$/.test(target.protocol)) return res.status(400).json({ error: 'Only http(s) URLs are allowed' })
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(target.hostname) || target.hostname.endsWith('.internal')) return res.status(400).json({ error: 'Private addresses are not allowed' })
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000)
    const r = await fetch(target, { signal: ctrl.signal, headers: { 'User-Agent': 'OpenFile/1.0 (+https://github.com/aniruddhaadak80/OpenFile)' } })
    clearTimeout(t)
    const type = r.headers.get('content-type') || ''
    if (!type.includes('html') && !type.includes('text')) return res.status(415).json({ error: 'URL did not return HTML' })
    let html = await r.text()
    if (html.length > 3_000_000) html = html.slice(0, 3_000_000)
    // make relative links absolute
    html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${target.origin}${target.pathname}">`)
    res.setHeader('Cache-Control', 's-maxage=300')
    res.status(200).json({ url: target.toString(), status: r.status, html })
  } catch (e: any) {
    res.status(502).json({ error: 'Could not fetch page: ' + (e?.message || 'unknown error') })
  }
}
