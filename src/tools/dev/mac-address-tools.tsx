import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Download } from 'lucide-react'
import { Button, Input, Segmented, Switch, Label, Slider, Textarea, Spinner, Badge, CopyButton } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { Bar, Status, KV, DataTable } from './_b5/shell'
import { normMac, fmtMac, macInfo, randomMac, eui64, lookupOui } from '@/lib/b5/mac'

let dbP: Promise<Record<string, string>> | null = null
const loadDb = () => (dbP ??= import('oui-data?url').then((m) => fetch(m.default)).then((r) => r.json()))

export default function MacAddressTools() {
  const [mode, setMode] = useState<'lookup' | 'bulk' | 'gen'>('lookup')
  const [db, setDb] = useState<Record<string, string> | null>(null)
  const [mac, setMac] = useState('3C:5A:B4:12:34:56')
  const [bulk, setBulk] = useState('00:00:0C:12:34:56\nF0-D5-BF-AA-BB-CC\n001a.1122.3344')
  const [count, setCount] = useState(10)
  const [prefix, setPrefix] = useState('')
  const [local, setLocal] = useState(true)
  const [style, setStyle] = useState<'colon' | 'dash' | 'dot' | 'bare'>('colon')
  const [gen, setGen] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { loadDb().then(setDb).catch(() => setErr('Could not load the vendor database. Formatting still works.')) }, [])

  const h = normMac(mac)
  const info = h ? macInfo(h) : null
  const vendor = h && db ? lookupOui(db, h) : null
  const bulkRows = useMemo(() => bulk.split(/\r?\n/).filter((l) => l.trim()).map((l) => { const n = normMac(l); const v = n && db ? lookupOui(db, n) : null; return [l.trim(), n ? fmtMac(n, 'colon') : 'invalid', v?.vendor ?? (n && macInfo(n).local ? 'Locally administered' : n ? 'Unknown' : '')] }), [bulk, db])
  const make = () => setGen(Array.from({ length: count }, () => randomMac({ prefix, local })))
  useEffect(make, [count, prefix, local])

  return (
    <div className="space-y-4">
      <Bar><Segmented value={mode} onChange={setMode} options={[{ value: 'lookup', label: 'Lookup and format' }, { value: 'bulk', label: 'Bulk lookup' }, { value: 'gen', label: 'Generate' }]} />{!db && !err && <Spinner label="Loading vendor list (about 5 MB, once)…" />}{db && <Badge color="#14B8A6">{Object.keys(db).length.toLocaleString()} vendors offline</Badge>}</Bar>
      {err && <Status kind="err">{err}</Status>}
      {mode === 'lookup' && <>
        <Input value={mac} onChange={(e) => setMac(e.target.value)} className="h-12 font-mono text-lg" placeholder="AA:BB:CC:DD:EE:FF" aria-label="MAC address" spellCheck={false} />
        {!h ? <Status kind="err">A MAC address has 12 hex digits, written like AA:BB:CC:DD:EE:FF, AA-BB-CC-DD-EE-FF or aabb.ccdd.eeff.</Status> : <>
          <div className="rounded-2xl border border-border bg-surface p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Vendor</div>
            <div className="mt-1 text-2xl font-semibold">{vendor ? vendor.vendor : info?.local ? 'Locally administered (random or virtual)' : db ? 'Not in the registry' : '…'}</div>
            {vendor && <div className="text-sm text-muted">{vendor.address} · prefix {vendor.prefix} (/{vendor.bits})</div>}
            <div className="mt-2 flex flex-wrap gap-1.5">{info?.multicast ? <Badge color="#38BDF8">MULTICAST</Badge> : <Badge color="#10B981">UNICAST</Badge>}{info?.local ? <Badge color="#F5A524">LOCAL</Badge> : <Badge color="#14B8A6">GLOBAL (OUI)</Badge>}{info?.broadcast && <Badge color="#EF4444">BROADCAST</Badge>}</div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <KV label="Colon" value={fmtMac(h, 'colon')} /><KV label="Lower case" value={fmtMac(h, 'colon-lower')} /><KV label="Dash (Windows)" value={fmtMac(h, 'dash')} /><KV label="Dot (Cisco)" value={fmtMac(h, 'dot')} /><KV label="Bare" value={h} /><KV label="Integer" value={BigInt('0x' + h).toString()} />
            <KV label="EUI-64" value={eui64(h).eui64} /><KV label="IPv6 link-local (SLAAC)" value={eui64(h).linkLocal} />
          </div>
        </>}
      </>}
      {mode === 'bulk' && <div className="grid gap-4 lg:grid-cols-2"><Textarea value={bulk} onChange={(e) => setBulk(e.target.value)} className="min-h-80" placeholder="One MAC address per line" aria-label="MAC addresses" /><div className="space-y-2"><DataTable columns={['Input', 'Normalised', 'Vendor']} rows={bulkRows} className="max-h-80" /><Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob(['input,mac,vendor\n' + bulkRows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' }), 'mac-vendors.csv')}>CSV</Button></div></div>}
      {mode === 'gen' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="space-y-2">
            <div className="flex items-center gap-2"><Button size="sm" icon={<RefreshCw className="size-4" />} onClick={make}>Generate again</Button><CopyButton text={gen.map((g) => fmtMac(g, style)).join('\n')} label="Copy all" /></div>
            <pre className="scrollbar-thin max-h-[440px] overflow-auto rounded-2xl border border-border bg-surface p-4 font-mono text-[14px] leading-7">{gen.map((g) => fmtMac(g, style)).join('\n')}</pre>
          </div>
          <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
            <Slider label="How many" value={count} onChange={setCount} min={1} max={500} />
            <div><Label>Format</Label><Segmented value={style} onChange={setStyle} options={[{ value: 'colon', label: 'AA:BB' }, { value: 'dash', label: 'AA-BB' }, { value: 'dot', label: 'aabb.cc' }, { value: 'bare', label: 'AABB' }]} /></div>
            <div><Label>Vendor prefix (optional)</Label><Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="e.g. 00:1A:11" className="font-mono" /></div>
            {!prefix && <Switch checked={local} onChange={setLocal} label="Locally administered (safe for VMs)" />}
            <p className="text-xs text-muted">Random addresses use the secure random generator. Locally administered addresses never clash with real hardware vendors.</p>
          </div>
        </div>
      )}
    </div>
  )
}
