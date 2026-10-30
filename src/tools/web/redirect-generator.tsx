import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Card, Label, Segmented, Textarea } from '@/components/ui'
import { buildRedirects, parseRedirectList, redirectChains, type RedirectTarget } from '@/lib/cf/web'
import { OutBox } from '@/lib/cf/ui'
import { OpenButton } from '@/lib/b14/ui'
import { toast } from '@/components/toast'

const FILE: Record<RedirectTarget, string> = { apache: '.htaccess', nginx: 'redirects.conf', netlify: '_redirects', vercel: 'vercel.json', cloudflare: '_redirects', iis: 'web.config', caddy: 'Caddyfile' }

const ACCEPT = '.csv,.tsv,.txt,text/plain,text/csv,text/tab-separated-values'
async function readList(f: File): Promise<string | null> {
  if (f.size > 20 * 1024 * 1024) { toast('This file is too big for a redirect list. Pick a CSV or TXT file under 20 MB.', 'error'); return null }
  const t = (await f.text()).replace(/^\ufeff/, '')
  if (/\u0000/.test(t.slice(0, 4096))) { toast('This does not look like a CSV or text file. Pick a CSV, TSV or TXT list of old and new URLs.', 'error'); return null }
  if (!parseRedirectList(t).length) { toast('No redirects found in this file. Put the old URL and the new URL on each line.', 'error'); return null }
  return t
}

export default function RedirectGenerator() {
  const [text, setText] = useState('old,new,code\n/old-page,/new-page,301\n/blog/2019/hello,/blog/hello\n/new-page,/final-page\nhttps://example.com/shop?id=12 https://example.com/products/12 302')
  const [target, setTarget] = useState<RedirectTarget>('apache')
  const list = useMemo(() => parseRedirectList(text), [text])
  const ch = useMemo(() => redirectChains(list), [list])
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div onDragOver={(e) => e.preventDefault()} onDrop={async (e) => { const f = e.dataTransfer.files?.[0]; if (!f) return; e.preventDefault(); const t = await readList(f); if (t != null) { setText(t); toast(`Opened ${f.name}`) } }}>
          <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2"><Label className="mb-0" hint={`${list.length} redirects`}>Old URL, new URL, optional code (CSV, tab or spaces)</Label><OpenButton accept={ACCEPT} label="Open CSV or TXT" onFiles={async ([f]) => { const t = await readList(f); if (t != null) { setText(t); toast(`Opened ${f.name}, ${parseRedirectList(t).length} redirects`) } }} /></div>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-64" aria-label="Redirect list: old URL, new URL, optional code" /></div>
        {(ch.chains.length > 0 || ch.loops.length > 0) && <Card className="space-y-2 border-warn/40">
          {ch.loops.map((l, i) => <p key={'l' + i} className="flex gap-2 text-sm text-danger"><AlertTriangle className="mt-0.5 size-4 shrink-0" />Loop: {l.join(' → ')}</p>)}
          {ch.chains.map((c, i) => <p key={i} className="flex gap-2 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />Chain: {c.join(' → ')}. Point the first one straight at the last.</p>)}
        </Card>}
      </div>
      <div className="space-y-3">
        <Segmented value={target} onChange={setTarget} options={[{ value: 'apache', label: 'Apache' }, { value: 'nginx', label: 'Nginx' }, { value: 'netlify', label: 'Netlify' }, { value: 'vercel', label: 'Vercel' }, { value: 'cloudflare', label: 'Cloudflare Pages' }, { value: 'iis', label: 'IIS' }, { value: 'caddy', label: 'Caddy' }]} />
        <OutBox title={FILE[target]} text={buildRedirects(list, target)} filename={FILE[target]} rows={20} />
        <p className="text-xs text-muted">Use 301 for pages that moved for good (search engines pass ranking across) and 302 for temporary moves.</p>
      </div>
    </div>
  )
}
