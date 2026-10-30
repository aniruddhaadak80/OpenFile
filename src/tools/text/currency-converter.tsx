import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, RefreshCw, WifiOff, X } from 'lucide-react'
import { Button, Input, Select, Segmented, Spinner, CopyButton, Badge } from '@/components/ui'
import { Status, useStored } from '../dev/_b5/shell'

const API = 'https://api.frankfurter.dev/v1'
type Rates = { base: string; date: string; rates: Record<string, number> }
const cacheKey = (b: string) => `of:b5:fx:${b}`
const guess = () => { try { const r = new Intl.Locale(navigator.language).maximize().region; const m: Record<string, string> = { US: 'USD', IN: 'INR', GB: 'GBP', JP: 'JPY', CN: 'CNY', CA: 'CAD', AU: 'AUD', CH: 'CHF', BR: 'BRL', MX: 'MXN', KR: 'KRW', SE: 'SEK', NO: 'NOK', PL: 'PLN', TR: 'TRY', ZA: 'ZAR', SG: 'SGD', HK: 'HKD', NZ: 'NZD' }; return m[r ?? ''] ?? 'EUR' } catch { return 'USD' } }

export default function CurrencyConverter() {
  const [names, setNames] = useState<Record<string, string>>({})
  const [amount, setAmount] = useStored('b5:fx:amount', '100')
  const [from, setFrom] = useStored('b5:fx:from', 'USD')
  const [to, setTo] = useStored('b5:fx:to', guess() === 'USD' ? 'EUR' : guess())
  const [watch, setWatch] = useStored<string[]>('b5:fx:watch', ['EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD'])
  const [rates, setRates] = useState<Rates | null>(null)
  const [offline, setOffline] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [range, setRange] = useState<'30' | '90' | '365'>('90')
  const [hist, setHist] = useState<[string, number][]>([])

  useEffect(() => { fetch(`${API}/currencies`).then((r) => r.json()).then(setNames).catch(() => setNames({ USD: 'US Dollar', EUR: 'Euro', GBP: 'British Pound', INR: 'Indian Rupee', JPY: 'Japanese Yen' })) }, [])
  const load = async (base: string) => {
    setLoading(true); setErr(null)
    try {
      const r = await fetch(`${API}/latest?base=${base}`); if (!r.ok) throw new Error(`Rate service answered ${r.status}`)
      const j = (await r.json()) as Rates; j.rates[base] = 1; setRates(j); setOffline(false); localStorage.setItem(cacheKey(base), JSON.stringify(j))
    } catch (e: any) {
      const c = localStorage.getItem(cacheKey(base))
      if (c) { setRates(JSON.parse(c)); setOffline(true) } else { setErr('Could not reach the exchange rate service. Check your connection and try again.'); setRates(null) }
    } finally { setLoading(false) }
  }
  useEffect(() => { load(from) }, [from])
  useEffect(() => {
    if (from === to) return setHist([])
    const start = new Date(Date.now() - Number(range) * 86400000).toISOString().slice(0, 10)
    fetch(`${API}/${start}..?base=${from}&symbols=${to}`).then((r) => r.json()).then((j) => setHist(Object.entries(j.rates as Record<string, Record<string, number>>).map(([d, v]) => [d, v[to]]))).catch(() => setHist([]))
  }, [from, to, range])

  const amt = parseFloat(amount.replace(/,/g, '')) || 0
  const rate = rates?.rates[to]
  const fmt = (v: number, cur: string) => { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: v < 1 ? 6 : 2 }).format(v) } catch { return `${v.toFixed(2)} ${cur}` } }
  const opts = useMemo(() => Object.entries(names).map(([c, n]) => ({ value: c, label: `${c} · ${n}` })), [names])
  const chart = useMemo(() => {
    if (hist.length < 2) return null
    const vals = hist.map((h) => h[1]); const lo = Math.min(...vals), hi = Math.max(...vals); const span = hi - lo || 1
    const pts = hist.map(([, v], i) => `${(i / (hist.length - 1)) * 100},${40 - ((v - lo) / span) * 36 - 2}`).join(' ')
    const ch = (vals[vals.length - 1] - vals[0]) / vals[0] * 100
    return { pts, lo, hi, ch }
  }, [hist])

  return (
    <div className="space-y-4">
      {offline && <Status kind="info"><span className="inline-flex items-center gap-2"><WifiOff className="size-4" />Offline: showing saved rates from {rates?.date}.</span></Status>}
      {err && <Status kind="err">{err}</Status>}
      <div className="grid items-end gap-3 rounded-2xl border border-border bg-surface p-5 md:grid-cols-[1fr_1fr_auto_1fr]">
        <div><div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Amount</div><Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="h-12 text-xl tabular-nums" aria-label="Amount" /></div>
        <div><div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">From</div><Select aria-label="From currency" value={from} onChange={setFrom} options={opts.length ? opts : [{ value: from, label: from }]} className="h-12" /></div>
        <Button variant="outline" className="h-12" icon={<ArrowLeftRight className="size-4" />} onClick={() => { setFrom(to); setTo(from) }} aria-label="Swap currencies" />
        <div><div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">To</div><Select aria-label="To currency" value={to} onChange={setTo} options={opts.length ? opts : [{ value: to, label: to }]} className="h-12" /></div>
      </div>
      {loading && !rates ? <Spinner label="Fetching today's rates…" /> : rate !== undefined && (
        <div className="rounded-2xl border border-border bg-surface p-6">
          <div className="text-sm text-muted">{fmt(amt, from)} =</div>
          <div className="flex flex-wrap items-center gap-3"><span className="font-display text-4xl font-semibold text-accent tabular-nums">{fmt(amt * rate, to)}</span><CopyButton text={(amt * rate).toFixed(4)} label="" /></div>
          <div className="mt-1 text-sm text-muted">1 {from} = {rate.toFixed(6)} {to} · 1 {to} = {(1 / rate).toFixed(6)} {from}</div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted">European Central Bank reference rate for {rates?.date}<Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} onClick={() => load(from)}>Refresh</Button></div>
          {chart && (
            <div className="mt-4 space-y-1">
              <div className="flex items-center gap-2 text-xs"><Segmented value={range} onChange={setRange} options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: '1 year' }]} /><Badge color={chart.ch >= 0 ? '#10B981' : '#EF4444'}>{chart.ch >= 0 ? '+' : ''}{chart.ch.toFixed(2)}%</Badge><span className="text-muted">low {chart.lo.toFixed(4)} · high {chart.hi.toFixed(4)}</span></div>
              <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-28 w-full" role="img" aria-label={`${from} to ${to} rate history`}><polyline points={chart.pts} fill="none" stroke="var(--accent)" strokeWidth="0.6" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 2 }} /></svg>
            </div>
          )}
        </div>
      )}
      {rates && (
        <div className="space-y-2">
          <div className="flex items-center gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-muted">{fmt(amt, from)} in other currencies</span>
            <Select aria-label="Add a currency" value="" onChange={(v) => v && !watch.includes(v) && setWatch([...watch, v])} options={[{ value: '', label: 'Add a currency' }, ...opts.filter((o) => !watch.includes(o.value))]} className="ml-auto h-8 w-48 text-xs" /></div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {watch.filter((c) => c !== from && rates.rates[c]).map((c) => <div key={c} className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"><div className="min-w-0 flex-1"><div className="text-xs text-muted">{names[c] ?? c}</div><div className="font-mono text-lg tabular-nums">{fmt(amt * rates.rates[c], c)}</div></div><button onClick={() => setWatch(watch.filter((x) => x !== c))} className="text-muted opacity-0 hover:text-danger group-hover:opacity-100" aria-label={`Remove ${c}`}><X className="size-4" /></button></div>)}
          </div>
        </div>
      )}
      <p className="text-xs text-muted">Rates come from the free Frankfurter service (European Central Bank data, updated on working days around 16:00 CET). This is the only tool here that needs the internet; only the currency codes are sent.</p>
    </div>
  )
}
