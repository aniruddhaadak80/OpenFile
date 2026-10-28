import { useMemo, useState } from 'react'
import { Calculator, Timer } from 'lucide-react'
import { Segmented, Input, Label, Spinner, CopyButton, Slider, cn } from '@/components/ui'
import { Bar, KV, Chip, useLib, useStored, useDebounced } from '../dev/_b5/shell'
import { prep } from '@/lib/b5/mathprep'

const SAMPLE = `// A notebook: each line is calculated, and you can reuse names
price = 1299
tax = 18% of price
total = price + tax
total / 3
20% of 250
150 + 15%
45 as % of 180
5 km in miles
3 hours + 45 minutes in minutes
100 kg to lb
sqrt(2) * pi
sin(30 deg)
det([1, 2; 3, 4])
12! / (3! * 9!)
0x1F + 0b1010
2 ^ 64`

const EXAMPLES = ['15% of 80', '2 inch to cm', '1 GB to MB', 'log(1000, 10)', 'round(pi, 4)', '25 degC to degF', 'mean(2, 4, 9)', '7 days to hours', 'gcd(48, 180)', '[1,2,3] * 2']

export default function MathEvaluator() {
  const lib = useLib('mathjs', () => import('mathjs'))
  const [tab, setTab] = useState<'calc' | 'eta'>('calc')
  const [src, setSrc] = useStored('b5:math:src', SAMPLE)
  const [prec, setPrec] = useStored('b5:math:prec', 10)
  const ds = useDebounced(src, 120)
  const math = useMemo(() => (lib ? lib.create(lib.all, { number: 'number', precision: 64 }) : null), [lib])
  const rows = useMemo(() => {
    if (!math) return []
    const scope = new Map<string, unknown>()
    let last: unknown
    return ds.split('\n').map((line) => {
      const p = prep(line)
      if (!p) return { line, out: '', err: false }
      try {
        scope.set('ans', last)
        const v = math.evaluate(p, scope)
        if (typeof v === 'function') return { line, out: 'function defined', err: false }
        last = v
        return { line, out: v === undefined ? '' : math.format(v, { precision: prec, lowerExp: -9, upperExp: 18 }), err: false }
      } catch (e: any) { return { line, out: e.message.replace(/\(char \d+\)/, '').trim(), err: true } }
    })
  }, [math, ds, prec])
  const lastVal = [...rows].reverse().find((r) => r.out && !r.err)?.out ?? ''

  // ETA
  const [total, setTotal] = useState(1000); const [done, setDone] = useState(250); const [mins, setMins] = useState(15)
  const rate = mins > 0 ? done / mins : 0
  const leftMin = rate > 0 ? (total - done) / rate : Infinity
  const fmtDur = (m: number) => { if (!isFinite(m)) return 'never at this pace'; const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = Math.round(m % 60); return [d && `${d} d`, h && `${h} h`, `${mm} min`].filter(Boolean).join(' ') }
  const finish = isFinite(leftMin) ? new Date(Date.now() + leftMin * 60000) : null

  return (
    <div className="space-y-4">
      <Bar><Segmented value={tab} onChange={setTab} options={[{ value: 'calc', label: <span className="inline-flex items-center gap-1.5"><Calculator className="size-3.5" />Calculator notebook</span> }, { value: 'eta', label: <span className="inline-flex items-center gap-1.5"><Timer className="size-3.5" />Time left (ETA)</span> }]} />{tab === 'calc' && <Slider label="Significant digits" value={prec} onChange={setPrec} min={3} max={20} className="w-48" />}</Bar>
      {tab === 'calc' && (!math ? <Spinner label="Loading math engine…" /> : <>
        <div className="flex flex-wrap gap-1.5">{EXAMPLES.map((e) => <Chip key={e} onClick={() => setSrc((s) => (s.endsWith('\n') || !s ? s : s + '\n') + e)}>{e}</Chip>)}</div>
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="grid grid-cols-[1fr_minmax(140px,40%)]">
            <textarea value={src} onChange={(e) => setSrc(e.target.value)} spellCheck={false} aria-label="Expressions, one per line" className="scrollbar-thin min-h-[460px] resize-y border-r border-border bg-transparent p-4 font-mono text-[14px] leading-7 outline-none" style={{ height: Math.max(460, rows.length * 28 + 32) }} />
            <div className="bg-surface-2/40 p-4 font-mono text-[14px] leading-7">
              {rows.map((r, i) => <div key={i} className={cn('flex h-7 items-center justify-end gap-1 truncate', r.err ? 'text-danger/80 text-[12px]' : 'text-accent')} title={r.out}>{r.out && !r.err ? <><span className="truncate">{r.out}</span></> : r.err ? <span className="truncate">{r.out}</span> : null}</div>)}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-muted"><span>Use ans for the previous result. Units, matrices, complex numbers, hex (0x) and binary (0b) all work.</span>{lastVal && <CopyButton text={lastVal} label="Copy last result" />}</div>
      </>)}
      {tab === 'eta' && (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="space-y-3 rounded-2xl border border-border bg-surface p-5">
            <div><Label>Total amount of work</Label><Input type="number" value={total} onChange={(e) => setTotal(Number(e.target.value) || 0)} /></div>
            <div><Label>Done so far</Label><Input type="number" value={done} onChange={(e) => setDone(Number(e.target.value) || 0)} /></div>
            <div><Label>Minutes it took</Label><Input type="number" value={mins} onChange={(e) => setMins(Number(e.target.value) || 0)} /></div>
            <p className="text-xs text-muted">Works for downloads (MB), pages read, files processed, laps run, anything with a steady pace.</p>
          </div>
          <div className="grid content-start gap-2 sm:grid-cols-2">
            <KV label="Progress" value={total ? `${((done / total) * 100).toFixed(1)}%` : '0%'} /><KV label="Pace" value={`${rate.toFixed(2)} per minute (${(rate * 60).toFixed(1)} per hour)`} />
            <KV label="Time left" value={fmtDur(leftMin)} mono={false} /><KV label="Finishes around" value={finish ? finish.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : 'n/a'} mono={false} />
            <KV label="Total time" value={fmtDur(mins + leftMin)} mono={false} /><KV label="Left to do" value={String(Math.max(0, total - done))} />
          </div>
        </div>
      )}
    </div>
  )
}
