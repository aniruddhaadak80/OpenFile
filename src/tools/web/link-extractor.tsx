import { useMemo, useState } from 'react'
import { Card, Dropzone, Input, Label, Segmented, Textarea } from '@/components/ui'
import { toCsvText } from '@/lib/cf/sheet'
import { OutBox, Stat, Stats } from '@/lib/cf/ui'

interface L { href: string; abs: string; text: string; rel: string; kind: 'internal' | 'external' | 'mail' | 'other'; target: string }
const attr = (t: string, n: string) => t.match(new RegExp(`\\b${n}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find((x) => x != null) ?? ''
const strip = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

export function extractAnchors(html: string, base: string): L[] {
  let host = ''; try { host = new URL(base).host } catch { /* no base */ }
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((m) => {
    const href = attr(m[1], 'href'), rel = attr(m[1], 'rel'), target = attr(m[1], 'target')
    let abs = href, kind: L['kind'] = 'other'
    if (/^mailto:|^tel:/i.test(href)) kind = 'mail'
    else if (!/^(javascript|data):/i.test(href) && href && !href.startsWith('#')) { try { const u = new URL(href, base || 'https://example.invalid/'); abs = u.toString(); kind = !host || u.host === host || u.host === 'example.invalid' ? 'internal' : 'external' } catch { kind = 'other' } }
    const img = /<img\b/i.test(m[2]) ? `[image${attr(m[2], 'alt') ? ': ' + attr(m[2], 'alt') : ''}]` : ''
    return { href, abs, text: strip(m[2]) || img, rel, kind, target }
  })
}

export default function LinkExtractor() {
  const [html, setHtml] = useState('<a href="/about">About us</a> <a href="https://github.com/x" rel="nofollow noopener" target="_blank">Code</a> <a href="mailto:hi@example.com">Mail</a> <a href="/about">About</a> <a href="#top">Top</a> <a href="https://example.com/blog"><img src="b.png" alt="Blog"></a>')
  const [base, setBase] = useState('https://example.com/'), [show, setShow] = useState<'all' | 'internal' | 'external' | 'mail'>('all'), [unique, setUnique] = useState<'all' | 'unique'>('unique')
  const links = useMemo(() => extractAnchors(html, base), [html, base])
  const list = useMemo(() => { let l = links.filter((x) => show === 'all' || x.kind === show); if (unique === 'unique') { const s = new Set<string>(); l = l.filter((x) => !s.has(x.abs) && (s.add(x.abs), true)) } return l }, [links, show, unique])
  const n = (k: L['kind']) => links.filter((x) => x.kind === k).length
  const noText = links.filter((x) => !x.text).length, blankNoOpener = links.filter((x) => x.target === '_blank' && !/noopener|noreferrer/.test(x.rel)).length
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <Dropzone compact multiple accept=".html,.htm,.xml,.md,.txt" onFiles={async (fs) => setHtml((await Promise.all(fs.map((f) => f.text()))).join('\n'))} label="Drop HTML files" sub="Or paste page source below" />
        <Textarea value={html} onChange={(e) => setHtml(e.target.value)} className="min-h-64" aria-label="HTML" />
        <div><Label>Page address (to tell internal from external)</Label><Input value={base} onChange={(e) => setBase(e.target.value)} /></div>
      </div>
      <div className="space-y-3">
        <Stats cols={4}><Stat label="Links" value={links.length} /><Stat label="Internal" value={n('internal')} /><Stat label="External" value={n('external')} /><Stat label="Nofollow" value={links.filter((x) => /nofollow|ugc|sponsored/.test(x.rel)).length} /></Stats>
        {(noText > 0 || blankNoOpener > 0) && <Card className="space-y-1 text-sm text-warn">{noText > 0 && <p>{noText} links have no text, which hurts accessibility and SEO.</p>}{blankNoOpener > 0 && <p>{blankNoOpener} links open a new tab without rel="noopener".</p>}</Card>}
        <div className="flex flex-wrap gap-2"><Segmented value={show} onChange={setShow} options={[{ value: 'all', label: 'All' }, { value: 'internal', label: 'Internal' }, { value: 'external', label: 'External' }, { value: 'mail', label: 'Email and phone' }]} /><Segmented value={unique} onChange={setUnique} options={[{ value: 'unique', label: 'Unique' }, { value: 'all', label: 'Every one' }]} /></div>
        <OutBox title={`${list.length} links`} text={list.map((x) => x.abs).join('\n')} filename="links.txt" rows={10} extra={<button className="text-xs text-accent cursor-pointer" onClick={() => { const b = new Blob(['\ufeff' + toCsvText([['url', 'text', 'type', 'rel', 'target'], ...list.map((x) => [x.abs, x.text, x.kind, x.rel, x.target])])], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'links.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000) }}>CSV with anchor text</button>} />
      </div>
    </div>
  )
}
