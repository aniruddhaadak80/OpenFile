import { useMemo, useState } from 'react'
import { Card, Dropzone, Input, Label, Select, Switch, Textarea } from '@/components/ui'
import { buildSitemap, buildSitemapIndex, extractLinks, type SitemapUrl } from '@/lib/cf/web'
import { OutBox, today } from '@/lib/cf/ui'

export default function SitemapGenerator() {
  const [text, setText] = useState('https://example.com/\nhttps://example.com/about\nhttps://example.com/blog/\nhttps://example.com/blog/first-post\nhttps://example.com/contact')
  const [base, setBase] = useState('https://example.com/')
  const [lastmod, setLastmod] = useState(true), [date, setDate] = useState(today()), [freq, setFreq] = useState(''), [prio, setPrio] = useState(true), [sameHost, setSameHost] = useState(true)
  const urls = useMemo(() => { let host = ''; try { host = new URL(base).host } catch { /* none */ } const seen = new Set<string>(); return text.split(/\s+/).map((u) => u.trim()).filter((u) => /^https?:\/\//.test(u)).map((u) => u.replace(/#.*$/, '')).filter((u) => (!sameHost || !host || new URL(u).host === host) && !seen.has(u) && (seen.add(u), true)) }, [text, base, sameHost])
  const items: SitemapUrl[] = urls.map((u) => { const depth = new URL(u).pathname.split('/').filter(Boolean).length; return { loc: u, lastmod: lastmod ? date : undefined, changefreq: freq || undefined, priority: prio ? Math.max(0.3, +(1 - depth * 0.2).toFixed(1)) : undefined } })
  const parts = []; for (let i = 0; i < items.length; i += 50000) parts.push(items.slice(i, i + 50000))
  const fromHtml = async (fs: File[]) => { const links: string[] = []; for (const f of fs) { const rel = f.webkitRelativePath || f.name; links.push(...extractLinks(await f.text(), base)); if (/\.html?$/i.test(rel)) { try { links.push(new URL(rel.replace(/^[^/]+\//, '').replace(/index\.html?$/i, ''), base).toString()) } catch { /* skip */ } } } setText((t) => [...new Set([...t.split(/\s+/), ...links])].filter(Boolean).join('\n')) }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div><Label>Site address</Label><Input aria-label="Site address" value={base} onChange={(e) => setBase(e.target.value)} /></div>
        <div><Label hint={`${urls.length} pages`}>Page URLs, one per line</Label><Textarea aria-label="Page URLs, one per line" value={text} onChange={(e) => setText(e.target.value)} className="min-h-56" /></div>
        <Dropzone compact multiple accept=".html,.htm,.txt,.csv" onFiles={fromHtml} label="Or drop your HTML files" sub="Links inside them and their own paths are added" />
        <Card className="grid gap-3 sm:grid-cols-2">
          <Switch checked={lastmod} onChange={setLastmod} label="Last modified date" />{lastmod && <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Last modified" />}
          <label className="block"><Label>Change frequency (Google ignores it)</Label><Select value={freq} onChange={setFreq} options={[{ value: '', label: 'Leave out' }, 'daily', 'weekly', 'monthly', 'yearly']} /></label>
          <Switch checked={prio} onChange={setPrio} label="Priority by depth" /><Switch checked={sameHost} onChange={setSameHost} label="Only this site's pages" />
        </Card>
      </div>
      <div className="space-y-3">
        {parts.length <= 1 ? <OutBox title="sitemap.xml" text={buildSitemap(items)} filename="sitemap.xml" mime="application/xml" rows={22} />
          : <>{parts.map((p, i) => <OutBox key={i} title={`sitemap-${i + 1}.xml`} text={buildSitemap(p)} filename={`sitemap-${i + 1}.xml`} mime="application/xml" rows={6} />)}<OutBox title="sitemap-index.xml" text={buildSitemapIndex(parts.map((_, i) => new URL(`sitemap-${i + 1}.xml`, base).toString()), date)} filename="sitemap-index.xml" /></>}
        <p className="text-xs text-muted">Put the file at your site root and add it to robots.txt and Search Console. Over 50,000 URLs are split into several files with an index.</p>
      </div>
    </div>
  )
}
