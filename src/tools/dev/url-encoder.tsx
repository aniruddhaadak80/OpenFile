import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowDownUp, Plus, Trash2, Link2, Wand2, AlertTriangle, ExternalLink } from 'lucide-react'
import { Button, Card, Input, Segmented, Switch, Tabs, CopyButton, cn } from '@/components/ui'
import { CodeArea, Pane } from './_dev/kit'

export default function UrlEncoder() {
  const [tab, setTab] = useState<'codec' | 'parse'>('codec')
  return (
    <div className="space-y-5">
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'codec', label: <span className="flex items-center gap-2"><Wand2 className="size-4" />Encode / Decode</span> }, { value: 'parse', label: <span className="flex items-center gap-2"><Link2 className="size-4" />Parse & build URL</span> }]} />
      {tab === 'codec' ? <Codec /> : <Parser />}
    </div>
  )
}

function Codec() {
  const [input, setInput] = useState('https://example.com/search?q=privacy first tools&lang=हिन्दी&tags=a+b')
  const [dir, setDir] = useState<'encode' | 'decode'>('encode')
  const [scope, setScope] = useState<'component' | 'uri' | 'form'>('component')
  const [perLine, setPerLine] = useState(false)

  const res = useMemo(() => {
    const one = (s: string) => {
      if (dir === 'encode') return scope === 'component' ? encodeURIComponent(s) : scope === 'uri' ? encodeURI(s) : new URLSearchParams({ x: s }).toString().slice(2)
      return scope === 'form' ? decodeURIComponent(s.replace(/\+/g, ' ')) : scope === 'component' ? decodeURIComponent(s) : decodeURI(s)
    }
    try { return { out: perLine ? input.split('\n').map(one).join('\n') : one(input), err: null } }
    catch { return { out: '', err: 'Malformed percent-encoding — a % must be followed by two hex digits forming valid UTF-8 (e.g. %20, %E2%9C%93).' } }
  }, [input, dir, scope, perLine])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={dir} onChange={setDir} options={[{ value: 'encode', label: 'Encode' }, { value: 'decode', label: 'Decode' }]} />
        <Segmented value={scope} onChange={setScope} options={[{ value: 'component', label: 'Component' }, { value: 'uri', label: 'Full URI' }, { value: 'form', label: 'Form (+ for space)' }]} />
        <Switch checked={perLine} onChange={setPerLine} label="Each line separately" />
      </div>
      <p className="text-xs text-muted">
        {scope === 'component' ? 'encodeURIComponent — escapes everything except A–Z a–z 0–9 - _ . ! ~ * \' ( ). Use for query values and path segments.'
          : scope === 'uri' ? 'encodeURI — keeps URL structure characters (: / ? # & = @ +) intact. Use for whole URLs.'
          : 'application/x-www-form-urlencoded — like component, but spaces become +. Used by HTML forms.'}
      </p>
      <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
        <Pane title="Input" className="h-[320px]" actions={<Button size="sm" variant="ghost" onClick={() => setInput('')}>Clear</Button>}><CodeArea value={input} onChange={setInput} lineNumbers={false} /></Pane>
        <div className="flex items-center justify-center"><Button variant="outline" size="sm" icon={<ArrowDownUp className="size-4 lg:-rotate-90" />} onClick={() => { if (res.out) { setInput(res.out); setDir(dir === 'encode' ? 'decode' : 'encode') } }}>Swap</Button></div>
        <Pane title="Output" className="h-[320px]" actions={res.out ? <CopyButton text={res.out} variant="ghost" /> : null}>
          {res.err ? <div className="flex gap-2 p-4 text-sm text-danger"><AlertTriangle className="size-4 shrink-0" />{res.err}</div> : <CodeArea value={res.out} readOnly lineNumbers={false} />}
        </Pane>
      </div>
    </div>
  )
}

type Row = { id: number; k: string; v: string; on: boolean }
let rid = 0

function Parser() {
  const [raw, setRaw] = useState('https://user:pass@shop.example.com:8443/products/shoes?color=red&size=42&q=running%20shoes&utm_source=newsletter#reviews')
  const [parts, setParts] = useState({ protocol: '', username: '', password: '', hostname: '', port: '', pathname: '', hash: '' })
  const [rows, setRows] = useState<Row[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [editingRaw, setEditingRaw] = useState(true)

  useEffect(() => {
    if (!editingRaw) return
    try {
      const u = new URL(raw.trim())
      setParts({ protocol: u.protocol.replace(/:$/, ''), username: decodeURIComponent(u.username), password: decodeURIComponent(u.password), hostname: u.hostname, port: u.port, pathname: decodeURIComponent(u.pathname), hash: decodeURIComponent(u.hash.replace(/^#/, '')) })
      setRows([...u.searchParams].map(([k, v]) => ({ id: ++rid, k, v, on: true })))
      setErr(null)
    } catch { setErr(raw.trim() ? 'Not a valid absolute URL — include the scheme, e.g. https://' : null) }
  }, [raw, editingRaw])

  const built = useMemo(() => {
    try {
      const u = new URL(`${parts.protocol || 'https'}://placeholder`)
      u.hostname = parts.hostname || 'example.com'; u.port = parts.port
      u.username = parts.username; u.password = parts.password
      u.pathname = parts.pathname.split('/').map((s) => encodeURIComponent(s)).join('/')
      const sp = new URLSearchParams(); rows.filter((r) => r.on && r.k).forEach((r) => sp.append(r.k, r.v))
      u.search = sp.toString(); u.hash = parts.hash ? encodeURIComponent(parts.hash).replace(/%2F/g, '/') : ''
      return u.toString()
    } catch { return '' }
  }, [parts, rows])

  const edit = (p: Partial<typeof parts>) => { setEditingRaw(false); setParts((s) => ({ ...s, ...p })) }
  const editRows = (fn: (r: Row[]) => Row[]) => { setEditingRaw(false); setRows(fn) }
  useEffect(() => { if (!editingRaw && built) setRaw(built) }, [built, editingRaw])

  const P = (k: keyof typeof parts, label: string, ph = '') => (
    <label className="block"><div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div><Input value={parts[k]} onChange={(e) => edit({ [k]: e.target.value } as any)} placeholder={ph} className="h-9 font-mono text-xs" /></label>
  )

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <div className="flex gap-2">
          <Input value={raw} onChange={(e) => { setEditingRaw(true); setRaw(e.target.value) }} className={cn('h-12 font-mono text-sm', err && 'border-danger/60')} placeholder="https://example.com/path?x=1" />
          <CopyButton text={raw} size="md" />
          {built && <Button variant="ghost" icon={<ExternalLink className="size-4" />} onClick={() => window.open(built, '_blank', 'noopener')} aria-label="Open" />}
        </div>
        {err && <div className="text-xs text-danger">{err}</div>}
        {!err && raw && (
          <div className="break-all rounded-lg bg-surface-2/60 px-3 py-2 font-mono text-xs leading-relaxed">
            <span className="text-[#f472b6]">{parts.protocol}://</span>
            {parts.username && <span className="text-warn">{parts.username}{parts.password && ':' + '•'.repeat(parts.password.length)}@</span>}
            <span className="text-accent">{parts.hostname}</span>{parts.port && <span className="text-[#f59e0b]">:{parts.port}</span>}
            <span className="text-[#22d3ee]">{parts.pathname}</span>
            {rows.filter((r) => r.on).length > 0 && <span className="text-success">?{rows.filter((r) => r.on).map((r) => `${r.k}=${r.v}`).join('&')}</span>}
            {parts.hash && <span className="text-muted">#{parts.hash}</span>}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Card className="grid h-fit grid-cols-2 gap-3">
          <div className="col-span-1">{P('protocol', 'Scheme', 'https')}</div>
          <div className="col-span-1">{P('port', 'Port', 'default')}</div>
          <div className="col-span-2">{P('hostname', 'Host', 'example.com')}</div>
          <div className="col-span-2">{P('pathname', 'Path (decoded)', '/')}</div>
          <div className="col-span-1">{P('username', 'User')}</div>
          <div className="col-span-1">{P('password', 'Password')}</div>
          <div className="col-span-2">{P('hash', 'Fragment (#)', '')}</div>
        </Card>
        <Pane title={`Query parameters (${rows.length})`} actions={<>
          <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => editRows((r) => [...r, { id: ++rid, k: '', v: '', on: true }])}>Add</Button>
          {rows.some((r) => /^utm_|^fbclid$|^gclid$|^mc_|^ref$/.test(r.k)) && <Button size="sm" variant="ghost" onClick={() => editRows((r) => r.filter((x) => !/^utm_|^fbclid$|^gclid$|^mc_|^ref$/.test(x.k)))}>Strip trackers</Button>}
          <Button size="sm" variant="ghost" onClick={() => editRows((r) => [...r].sort((a, b) => a.k.localeCompare(b.k)))}>Sort</Button>
        </>}>
          <div className="divide-y divide-border">
            {rows.length === 0 && <div className="p-6 text-center text-sm text-muted">No query parameters. Add one to build the URL.</div>}
            <AnimatePresence initial={false}>
              {rows.map((r) => (
                <motion.div key={r.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-2 px-3 py-2">
                  <input type="checkbox" checked={r.on} onChange={(e) => editRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, on: e.target.checked } : x)))} className="accent-[var(--accent)]" />
                  <Input value={r.k} onChange={(e) => editRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, k: e.target.value } : x)))} placeholder="key" className={cn('h-9 w-1/3 font-mono text-xs', /^utm_/.test(r.k) && 'text-warn')} />
                  <span className="text-muted">=</span>
                  <Input value={r.v} onChange={(e) => editRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, v: e.target.value } : x)))} placeholder="value (decoded)" className="h-9 flex-1 font-mono text-xs" />
                  <button onClick={() => editRows((rs) => rs.filter((x) => x.id !== r.id))} className="rounded p-1.5 text-muted hover:bg-danger/10 hover:text-danger" aria-label="Remove"><Trash2 className="size-4" /></button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          {built && <div className="border-t border-border bg-surface-2/40 px-3 py-2"><div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Rebuilt URL</div><div className="flex items-start gap-2"><code className="min-w-0 flex-1 break-all text-xs">{built}</code><CopyButton text={built} variant="ghost" /></div></div>}
        </Pane>
      </div>
    </div>
  )
}
