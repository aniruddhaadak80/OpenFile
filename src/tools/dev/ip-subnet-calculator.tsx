import type React from 'react'
import { useMemo, useState } from 'react'
import { RefreshCw, Download } from 'lucide-react'
import { Button, Input, Segmented, Slider, Label, CopyButton } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { Bar, Status, KV, DataTable, Chip } from './_b5/shell'
import * as ip from '@/lib/b5/ip'

export default function IpSubnetCalculator() {
  const [mode, setMode] = useState<'cidr' | 'range' | 'ula'>('cidr')
  const [cidr, setCidr] = useState('192.168.1.130/26')
  const [split, setSplit] = useState(28)
  const [from, setFrom] = useState('10.0.0.5'); const [to, setTo] = useState('10.0.1.20')
  const [ula, setUla] = useState(() => ip.randomUla())

  const parsed = useMemo(() => ip.parseCidr(cidr), [cidr])
  const info = useMemo(() => (parsed ? ip.subnetInfo(parsed.addr, parsed.prefix) : null), [parsed])
  const v = parsed?.addr.v ?? 4
  const f = (n: bigint) => ip.fmt({ v, n })
  const subs = useMemo(() => (parsed && split > parsed.prefix ? ip.splitSubnets(parsed.addr, parsed.prefix, split, 512) : null), [parsed, split])
  const range = useMemo(() => {
    const a = ip.parseAddr(from), b = ip.parseAddr(to)
    if (!a || !b) return { err: 'Enter two valid addresses.' }
    if (a.v !== b.v) return { err: 'Both addresses must be the same IP version.' }
    const [s, e] = a.n <= b.n ? [a.n, b.n] : [b.n, a.n]
    return { list: ip.rangeToCidrs(a.v, s, e), count: e - s + 1n, v: a.v, s, e }
  }, [from, to])

  return (
    <div className="space-y-4">
      <Bar>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'cidr', label: 'Subnet calculator' }, { value: 'range', label: 'Range to CIDR' }, { value: 'ula', label: 'IPv6 ULA generator' }]} />
      </Bar>

      {mode === 'cidr' && <>
        <div className="space-y-2">
          <Input value={cidr} onChange={(e) => setCidr(e.target.value)} className="h-12 font-mono text-lg" placeholder="192.168.0.1/24 or 2001:db8::/48" aria-label="IP address with prefix" spellCheck={false} />
          <div className="flex flex-wrap gap-1.5">{['10.0.0.0/8', '172.16.5.4/20', '192.168.1.130/26', '192.168.0.1/255.255.255.0', '2001:db8:abcd::/48', 'fe80::1ff:fe23:4567:890a/64'].map((x) => <Chip key={x} active={cidr === x} onClick={() => setCidr(x)}>{x}</Chip>)}</div>
        </div>
        {!parsed ? <Status kind="err">Enter an IPv4 or IPv6 address, optionally with a prefix like /24 or a mask like /255.255.255.0.</Status> : info && <>
          <div className="flex items-center gap-3"><Slider value={parsed.prefix} onChange={(p) => setCidr(`${ip.fmt(parsed.addr)}/${p}`)} min={0} max={ip.bits(v)} className="flex-1" label={`Prefix length (/${parsed.prefix})`} /></div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <KV label="Network address" value={`${f(info.network)}/${parsed.prefix}`} />
            {v === 4 ? <KV label="Broadcast address" value={f(info.last)} /> : <KV label="Last address" value={f(info.last)} />}
            <KV label="Usable host range" value={`${f(info.first)} to ${f(info.lastHost)}`} />
            <KV label={v === 4 ? 'Usable hosts' : 'Addresses'} value={(v === 4 ? info.usable : info.total).toLocaleString()} />
            <KV label="Total addresses" value={info.total.toLocaleString()} />
            {v === 4 && <KV label="Subnet mask" value={f(info.mask)} />}
            {v === 4 && <KV label="Wildcard mask" value={f(info.wild)} />}
            <KV label="Address type" value={ip.addrType(parsed.addr)} mono={false} />
            {v === 4 && <KV label="Class" value={ip.v4Class(parsed.addr.n)} mono={false} />}
            <KV label="Integer" value={parsed.addr.n.toString()} />
            <KV label="Hex" value={'0x' + parsed.addr.n.toString(16).padStart(v === 4 ? 8 : 32, '0')} />
            {v === 6 && <KV label="Expanded" value={ip.fmtV6Full(parsed.addr.n)} />}
            {v === 6 && <KV label="Compressed" value={ip.fmtV6(parsed.addr.n)} />}
            {v === 4 && <KV label="IPv4-mapped IPv6" value={ip.v4ToMapped(parsed.addr.n)} />}
            <KV label="Reverse DNS" value={ip.reverseDns(parsed.addr)} />
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <Label hint={<CopyButton text={ip.toBinary(parsed.addr)} label="" variant="ghost" />}>Binary (network bits highlighted)</Label>
            <div className="break-all font-mono text-[13px] leading-6">
              {ip.toBinary(parsed.addr).split('').reduce<{ els: React.ReactElement[]; i: number }>((acc, ch, k) => { const isBit = ch === '0' || ch === '1'; acc.els.push(<span key={k} className={isBit ? (acc.i < parsed.prefix ? 'text-accent' : 'text-muted') : 'text-muted/50'}>{ch}</span>); if (isBit) acc.i++; return acc }, { els: [], i: 0 }).els}
            </div>
          </div>
          {parsed.prefix < ip.bits(v) && (
            <div className="space-y-2 rounded-2xl border border-border bg-surface p-4">
              <Slider label={`Split into /${split} subnets`} value={Math.max(split, parsed.prefix + 1)} onChange={setSplit} min={parsed.prefix + 1} max={ip.bits(v)} />
              {subs && <>
                <div className="flex items-center gap-2 text-xs text-muted">{subs.total.toLocaleString()} subnets of {(1n << BigInt(ip.bits(v) - split)).toLocaleString()} addresses{subs.total > 512n && ' (showing the first 512)'}
                  <Button size="sm" variant="ghost" className="ml-auto" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([subs.out.map((s) => `${f(s.network)}/${split},${f(s.network)},${f(s.last)}`).join('\n')], { type: 'text/csv' }), 'subnets.csv')}>CSV</Button></div>
                <DataTable columns={['#', 'Subnet', 'First', 'Last']} rows={subs.out.map((s, i) => [i + 1, `${f(s.network)}/${split}`, f(s.network), f(s.last)])} className="max-h-80" />
              </>}
            </div>
          )}
        </>}
      </>}

      {mode === 'range' && <>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Start address</Label><Input value={from} onChange={(e) => setFrom(e.target.value)} className="font-mono" /></div>
          <div><Label>End address</Label><Input value={to} onChange={(e) => setTo(e.target.value)} className="font-mono" /></div>
        </div>
        {'err' in range ? <Status kind="err">{range.err}</Status> : <>
          <Status kind="ok">{range.count.toLocaleString()} addresses fit in {range.list!.length} CIDR block{range.list!.length === 1 ? '' : 's'}.</Status>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <Label hint={<CopyButton text={range.list!.join('\n')} variant="ghost" />}>CIDR blocks</Label>
            <pre className="scrollbar-thin max-h-96 overflow-auto font-mono text-[13px] leading-6">{range.list!.join('\n')}</pre>
          </div>
        </>}
      </>}

      {mode === 'ula' && (
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-5">
          <p className="text-sm text-muted">A Unique Local Address prefix (fd00::/8 with a random 40-bit Global ID, RFC 4193) for private IPv6 networks. Each click makes a new random /48.</p>
          <div className="flex flex-wrap items-center gap-3"><code className="font-mono text-2xl font-semibold text-accent">{ula}</code><CopyButton text={ula} /><Button variant="outline" size="sm" icon={<RefreshCw className="size-4" />} onClick={() => setUla(ip.randomUla())}>New prefix</Button></div>
          <div className="grid gap-2 sm:grid-cols-2">
            <KV label="First /64 subnet" value={ula.replace('::/48', ':0000::/64').replace(/:0000::/, ':0::')} />
            <KV label="Subnets available" value="65,536 networks of /64" mono={false} />
          </div>
        </div>
      )}
    </div>
  )
}
