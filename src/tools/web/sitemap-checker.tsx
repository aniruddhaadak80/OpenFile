import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Card, Dropzone, Label, Textarea } from '@/components/ui'
import { parseSitemap } from '@/lib/cf/web'
import { OutBox, Stat, Stats } from '@/lib/cf/ui'

export default function SitemapChecker() {
  const [xml, setXml] = useState('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://example.com/</loc><lastmod>2026-10-01</lastmod></url>\n  <url><loc>https://example.com/about</loc><lastmod>2026-13-40</lastmod></url>\n  <url><loc>https://example.com/about</loc></url>\n  <url><loc>http://other-site.com/page</loc><priority>1.5</priority></url>\n</urlset>')
  const [compare, setCompare] = useState('')
  const r = useMemo(() => parseSitemap(xml), [xml])
  const hosts = useMemo(() => { const m = new Map<string, number>(); for (const u of r.urls) { try { const h = new URL(u.loc).host; m.set(h, (m.get(h) ?? 0) + 1) } catch { /* bad */ } } return [...m].sort((a, b) => b[1] - a[1]) }, [r])
  const diff = useMemo(() => { if (!compare.trim()) return null; const want = new Set(compare.split(/\s+/).filter((x) => /^https?:/.test(x))); const have = new Set(r.urls.map((u) => u.loc)); return { missing: [...want].filter((x) => !have.has(x)), extra: [...have].filter((x) => !want.has(x)) } }, [compare, r])
  const sizeKb = new Blob([xml]).size / 1024
  const problems = [...r.problems, ...(r.urls.length > 50000 ? ['More than 50,000 URLs. Split it and use a sitemap index.'] : []), ...(sizeKb > 50 * 1024 ? ['Larger than 50 MB uncompressed.'] : []), ...(hosts.length > 1 ? [`URLs from ${hosts.length} different hosts. A sitemap should list one site.`] : [])]
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <Dropzone compact accept=".xml,.txt,.gz" onFiles={async (f) => { const file = f[0]; if (file.name.endsWith('.gz')) { const { gunzipSync, strFromU8 } = await import('fflate'); setXml(strFromU8(gunzipSync(new Uint8Array(await file.arrayBuffer())))) } else setXml(await file.text()) }} label="Drop a sitemap.xml or .xml.gz" />
        <div><Label>Or paste it</Label><Textarea value={xml} onChange={(e) => setXml(e.target.value)} className="min-h-64" /></div>
        <div><Label>Optional: URLs that should be in it (to find missing pages)</Label><Textarea value={compare} onChange={(e) => setCompare(e.target.value)} className="min-h-20" /></div>
      </div>
      <div className="space-y-3">
        <Stats><Stat label="Type" value={<span className="text-base">{r.kind === 'index' ? 'Sitemap index' : r.kind === 'urlset' ? 'URL list' : 'Unknown'}</span>} /><Stat label={r.kind === 'index' ? 'Sitemaps' : 'URLs'} value={r.urls.length.toLocaleString()} /><Stat label="Size" value={`${sizeKb.toFixed(1)} KB`} /></Stats>
        <Card className="space-y-2">{problems.length ? problems.map((p, i) => <p key={i} className="flex gap-2 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />{p}</p>) : <p className="flex gap-2 text-sm text-success"><CheckCircle2 className="size-4" />No problems found.</p>}</Card>
        {hosts.length > 0 && <Card className="text-sm">{hosts.map(([h, n]) => <div key={h} className="flex justify-between"><span className="font-mono">{h}</span><span className="text-muted">{n}</span></div>)}</Card>}
        {diff && <><OutBox title={`Missing from the sitemap (${diff.missing.length})`} text={diff.missing.join('\n')} filename="missing-urls.txt" rows={6} /><OutBox title={`In the sitemap but not in your list (${diff.extra.length})`} text={diff.extra.join('\n')} filename="extra-urls.txt" rows={6} /></>}
        <OutBox title="All URLs" text={r.urls.map((u) => u.loc).join('\n')} filename="sitemap-urls.txt" rows={8} />
      </div>
    </div>
  )
}
