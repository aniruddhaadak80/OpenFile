import { useState } from 'react'
import { motion } from 'framer-motion'
import { Search } from 'lucide-react'
import { Button, Input, Select, Badge } from '@/components/ui'
import { Bar, Status, DataTable, useStored } from './_b5/shell'

const TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'CAA', 'SRV', 'PTR', 'DS', 'DNSKEY', 'HTTPS'] as const
const TYPE_NUM: Record<number, string> = { 1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 12: 'PTR', 15: 'MX', 16: 'TXT', 28: 'AAAA', 33: 'SRV', 43: 'DS', 48: 'DNSKEY', 65: 'HTTPS', 257: 'CAA' }
const RESOLVERS = { cloudflare: { label: 'Cloudflare', url: 'https://cloudflare-dns.com/dns-query' }, google: { label: 'Google', url: 'https://dns.google/resolve' } }
const RCODE: Record<number, string> = { 0: 'OK', 1: 'Format error', 2: 'Server failure', 3: 'Name does not exist', 4: 'Not implemented', 5: 'Refused' }

interface Answer { name: string; type: number; TTL: number; data: string }
interface Result { type: string; status: number; answers: Answer[]; ad?: boolean; ms: number; err?: string }

function toPtr(ip: string): string | null {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip.split('.').reverse().join('.') + '.in-addr.arpa'
  if (ip.includes(':')) {
    const [h, t = ''] = ip.split('::'); const hp = h ? h.split(':') : []; const tp = t ? t.split(':') : []
    const full = [...hp, ...Array(8 - hp.length - tp.length).fill('0'), ...tp].map((x) => x.padStart(4, '0')).join('')
    return full.length === 32 ? [...full].reverse().join('.') + '.ip6.arpa' : null
  }
  return null
}

export default function DnsLookup() {
  const [name, setName] = useStored('b10:dns:name', 'example.com')
  const [resolver, setResolver] = useStored<keyof typeof RESOLVERS>('b10:dns:res', 'cloudflare')
  const [types, setTypes] = useStored<string[]>('b10:dns:types', ['A', 'AAAA', 'MX', 'TXT', 'NS'])
  const [results, setResults] = useState<Result[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const query = async (q: string, type: string): Promise<Result> => {
    const t0 = performance.now()
    try {
      const r = await fetch(`${RESOLVERS[resolver].url}?name=${encodeURIComponent(q)}&type=${type}`, { headers: { accept: 'application/dns-json' } })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      return { type, status: j.Status, answers: j.Answer ?? [], ad: j.AD, ms: Math.round(performance.now() - t0) }
    } catch (e) { return { type, status: -1, answers: [], ms: Math.round(performance.now() - t0), err: (e as Error).message } }
  }
  const run = async () => {
    setError('')
    let q = name.trim().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/\.$/, '')
    if (!q) { setError('Type a domain name like example.com'); return }
    const ptr = toPtr(q)
    const list = ptr ? ['PTR'] : types
    if (ptr) q = ptr
    if (!list.length) { setError('Pick at least one record type'); return }
    setBusy(true)
    setResults(await Promise.all(list.map((t) => query(q, t))))
    setBusy(false)
  }
  const toggle = (t: string) => setTypes((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); run() }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="example.com or an IP for reverse lookup" className="h-12 min-w-64 flex-1 font-mono text-base" aria-label="Domain or IP" />
        <Select aria-label="Resolver" value={resolver} onChange={setResolver} options={Object.entries(RESOLVERS).map(([k, v]) => ({ value: k as keyof typeof RESOLVERS, label: v.label }))} className="h-12 w-36" />
        <Button type="submit" loading={busy} className="h-12" icon={<Search className="size-4" />}>Look up</Button>
      </form>
      <Bar>
        {TYPES.map((t) => <button key={t} type="button" onClick={() => toggle(t)} aria-pressed={types.includes(t)} className={`rounded-lg border px-2.5 py-1 font-mono text-xs transition ${types.includes(t) ? 'border-accent bg-accent/15 text-fg' : 'border-border text-muted hover:text-fg'}`}>{t}</button>)}
        <span className="ml-auto text-xs text-muted">Queries go over HTTPS to the {RESOLVERS[resolver].label} public resolver</span>
      </Bar>
      {error && <Status kind="err">{error}</Status>}
      {results.map((r, i) => (
        <motion.div key={r.type + i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="rounded-2xl border border-border bg-surface p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-mono font-semibold">{r.type}</span>
            <Badge>{r.err ? 'Failed' : RCODE[r.status] ?? `Status ${r.status}`}</Badge>
            {r.ad && <Badge>DNSSEC verified</Badge>}
            <span className="ml-auto text-xs text-muted">{r.ms} ms</span>
          </div>
          {r.err ? <p className="text-sm text-danger">Could not reach the resolver: {r.err}. Check your connection or try the other resolver.</p>
            : r.answers.length ? <DataTable className="border-0" columns={['Name', 'Type', 'TTL', 'Value']} rows={r.answers.map((a) => [a.name, TYPE_NUM[a.type] ?? String(a.type), String(a.TTL), a.data])} />
              : <p className="text-sm text-muted">No {r.type} records.</p>}
        </motion.div>
      ))}
    </div>
  )
}
