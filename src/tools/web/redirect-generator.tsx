import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Card, Label, Segmented, Textarea } from '@/components/ui'
import { buildRedirects, parseRedirectList, redirectChains, type RedirectTarget } from '@/lib/cf/web'
import { OutBox } from '@/lib/cf/ui'

const FILE: Record<RedirectTarget, string> = { apache: '.htaccess', nginx: 'redirects.conf', netlify: '_redirects', vercel: 'vercel.json', cloudflare: '_redirects', iis: 'web.config', caddy: 'Caddyfile' }

export default function RedirectGenerator() {
  const [text, setText] = useState('old,new,code\n/old-page,/new-page,301\n/blog/2019/hello,/blog/hello\n/new-page,/final-page\nhttps://example.com/shop?id=12 https://example.com/products/12 302')
  const [target, setTarget] = useState<RedirectTarget>('apache')
  const list = useMemo(() => parseRedirectList(text), [text])
  const ch = useMemo(() => redirectChains(list), [list])
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div><Label hint={`${list.length} redirects`}>Old URL, new URL, optional code (CSV, tab or spaces)</Label><Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-64" /></div>
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
