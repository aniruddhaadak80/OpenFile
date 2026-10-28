// GET /api/meta?url=...: returns title/description/og:image for link previews (used by QR & tools)
export default async function handler(req: any, res: any) {
  try {
    const u = new URL(String(req.query?.url || ''))
    if (!/^https?:$/.test(u.protocol)) throw new Error('bad protocol')
    const html = await (await fetch(u, { headers: { 'User-Agent': 'OpenFile/1.0' } })).text()
    const pick = (re: RegExp) => html.match(re)?.[1]?.trim() ?? null
    res.setHeader('Cache-Control', 's-maxage=3600')
    res.json({
      url: u.toString(),
      title: pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) ?? pick(/<title[^>]*>([^<]+)/i),
      description: pick(/<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]+content=["']([^"']+)/i),
      image: pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i),
    })
  } catch (e: any) { res.status(400).json({ error: e?.message || 'Invalid URL' }) }
}
