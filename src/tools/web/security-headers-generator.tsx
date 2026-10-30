import { useMemo, useState } from 'react'
import { Card, Input, Label, Segmented, Select, Switch } from '@/components/ui'
import { gradeHeaders, headerList, headersFor, type HeaderOpts } from '@/lib/cf/web'
import { OutBox, Stat } from '@/lib/cf/ui'

const DIRS = ['default-src', 'script-src', 'style-src', 'img-src', 'font-src', 'connect-src', 'frame-src', 'media-src', 'object-src', 'base-uri', 'form-action', 'frame-ancestors']
const PERMS = ['camera', 'microphone', 'geolocation', 'payment', 'usb', 'interest-cohort', 'fullscreen']

export default function SecurityHeadersGenerator() {
  const [csp, setCsp] = useState<Record<string, string>>({ 'default-src': "'self'", 'script-src': "'self'", 'style-src': "'self' 'unsafe-inline'", 'img-src': "'self' data: https:", 'font-src': "'self'", 'connect-src': "'self'", 'object-src': "'none'", 'base-uri': "'self'", 'frame-ancestors': "'none'" })
  const [hsts, setHsts] = useState(true), [sub, setSub] = useState(true), [preload, setPreload] = useState(false), [frame, setFrame] = useState<HeaderOpts['frame']>('DENY'), [ref, setRef] = useState('strict-origin-when-cross-origin')
  const [perm, setPerm] = useState<string[]>(['camera', 'microphone', 'geolocation', 'interest-cohort']), [coop, setCoop] = useState('same-origin'), [corp, setCorp] = useState('same-origin'), [report, setReport] = useState(false)
  const [target, setTarget] = useState<'nginx' | 'apache' | 'netlify' | 'vercel' | 'cloudflare' | 'express' | 'meta'>('nginx')
  const list = useMemo(() => { const h = headerList({ csp: Object.fromEntries(Object.entries(csp).map(([k, v]) => [k, v.split(/\s+/).filter(Boolean)])), hsts: hsts ? 31536000 : 0, hstsSub: sub, preload, frame, referrer: ref, permissions: Object.fromEntries(perm.map((p) => [p, '()'])), nosniff: true, coop, corp }); return report ? h.map(([k, v]) => (k === 'Content-Security-Policy' ? ['Content-Security-Policy-Report-Only', v] as [string, string] : [k, v] as [string, string])) : h }, [csp, hsts, sub, preload, frame, ref, perm, coop, corp, report])
  const g = gradeHeaders(list)
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-3">
        <Card className="space-y-2"><Label>Content Security Policy</Label>
          {DIRS.map((d) => <div key={d} className="grid grid-cols-[8.5rem_1fr] items-center gap-2"><span className="font-mono text-xs">{d}</span><Input className="h-8 font-mono text-xs" value={csp[d] ?? ''} onChange={(e) => setCsp({ ...csp, [d]: e.target.value })} placeholder="not set" /></div>)}
          <Switch checked={report} onChange={setReport} label="Report only (test without blocking anything)" /></Card>
        <Card className="grid gap-3 sm:grid-cols-2">
          <Switch checked={hsts} onChange={setHsts} label="Force HTTPS (HSTS, 1 year)" />{hsts && <><Switch checked={sub} onChange={setSub} label="Include subdomains" /><Switch checked={preload} onChange={setPreload} label="Preload list" /></>}
          <label className="block"><Label>Framing</Label><Select value={frame} onChange={(v) => setFrame(v as HeaderOpts['frame'])} options={[{ value: 'DENY', label: 'Never in frames' }, { value: 'SAMEORIGIN', label: 'Only my site' }, { value: '', label: 'Allow' }]} /></label>
          <label className="block"><Label>Referrer</Label><Select value={ref} onChange={setRef} options={['strict-origin-when-cross-origin', 'no-referrer', 'same-origin', 'origin', 'strict-origin']} /></label>
          <label className="block"><Label>Cross-origin opener</Label><Select value={coop} onChange={setCoop} options={[{ value: 'same-origin', label: 'same-origin' }, { value: 'same-origin-allow-popups', label: 'allow popups' }, { value: '', label: 'not set' }]} /></label>
          <label className="block"><Label>Cross-origin resource</Label><Select value={corp} onChange={setCorp} options={[{ value: 'same-origin', label: 'same-origin' }, { value: 'same-site', label: 'same-site' }, { value: 'cross-origin', label: 'cross-origin' }, { value: '', label: 'not set' }]} /></label>
          <div className="sm:col-span-2"><Label>Turn off browser features</Label><div className="flex flex-wrap gap-1.5">{PERMS.map((p) => <button key={p} aria-pressed={perm.includes(p)} onClick={() => setPerm(perm.includes(p) ? perm.filter((x) => x !== p) : [...perm, p])} className={`rounded-full border px-2.5 py-1 text-xs cursor-pointer ${perm.includes(p) ? 'border-accent text-fg' : 'border-border text-muted'}`}>{p}</button>)}</div></div>
        </Card>
      </div>
      <div className="space-y-3">
        <Stat label="Grade" value={g.grade} sub={g.missing.length ? `Missing: ${g.missing.join(', ')}` : 'All the main headers are set'} tone={g.grade.startsWith('A') ? 'good' : 'warn'} />
        <Segmented value={target} onChange={setTarget} options={[{ value: 'nginx', label: 'Nginx' }, { value: 'apache', label: 'Apache' }, { value: 'netlify', label: 'Netlify' }, { value: 'vercel', label: 'Vercel' }, { value: 'cloudflare', label: 'Cloudflare' }, { value: 'express', label: 'Express' }, { value: 'meta', label: 'HTML meta' }]} />
        <OutBox title="Config" text={headersFor(list, target)} filename={{ nginx: 'security-headers.conf', apache: '.htaccess', netlify: '_headers', vercel: 'vercel.json', cloudflare: '_headers', express: 'security-headers.js', meta: 'meta-tags.html' }[target]} rows={18} />
        <p className="text-xs text-muted">Start with report only, check the browser console for blocked items, then switch it on. HSTS preload is hard to undo, turn it on only when every subdomain works on HTTPS.</p>
      </div>
    </div>
  )
}
