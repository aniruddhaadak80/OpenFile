import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Segmented, Select, Slider, CopyButton } from '@/components/ui'
import { Bar, Pane, CodeArea, OpenFileButton, useStored, useDebounced, KV, Status } from '../dev/_b5/shell'
import { parseNumbers, describe, histogram, regression, parseTable } from '@/lib/b10/text'

const f = (x: number | null | undefined, d = 6) => (x == null || Number.isNaN(x) ? '' : Number.isFinite(x) ? String(Math.round(x * 10 ** d) / 10 ** d) : String(x))

export default function StatisticsCalculator() {
  const [mode, setMode] = useState<'list' | 'table'>('list')
  const [text, setText] = useStored('b10:stats:text', '12, 15, 15, 18, 21, 22, 22, 22, 25, 30, 31, 45, 90')
  const [table, setTable] = useStored('b10:stats:table', 'hours,score\n1,52\n2,55\n3,61\n4,64\n5,70\n6,74\n7,79\n8,85')
  const [col, setCol] = useState('0')
  const [ycol, setYcol] = useState('1')
  const [bins, setBins] = useState(0)
  const T = useDebounced(table, 200), X = useDebounced(text, 150)
  const parsed = useMemo(() => (mode === 'table' ? parseTable(T) : []), [mode, T])
  const header = parsed[0] ?? []
  const colNums = (i: number) => parsed.slice(1).map((r) => Number(String(r[i] ?? '').replace(/,/g, ''))).filter((n) => Number.isFinite(n) && String(n) !== '')
  const xs = useMemo(() => (mode === 'list' ? parseNumbers(X) : colNums(Number(col))), [mode, X, parsed, col]) // eslint-disable-line react-hooks/exhaustive-deps
  const s = useMemo(() => (xs.length ? describe(xs) : null), [xs])
  const hist = useMemo(() => histogram(xs, bins || undefined), [xs, bins])
  const reg = useMemo(() => {
    if (mode !== 'table' || col === ycol) return null
    const rows = parsed.slice(1).map((r) => [Number(r[Number(col)]), Number(r[Number(ycol)])]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
    return regression(rows.map((r) => r[0]), rows.map((r) => r[1]))
  }, [mode, parsed, col, ycol])
  const hmax = Math.max(1, ...hist.map((h) => h.count))
  const opts = header.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` }))
  const report = s ? Object.entries({ count: s.n, sum: s.sum, mean: s.mean, median: s.median, mode: s.modes.join(' '), min: s.min, max: s.max, range: s.range, q1: s.q1, q3: s.q3, iqr: s.iqr, variance_sample: s.varSample, variance_population: s.varPop, sd_sample: s.sdSample, sd_population: s.sdPop, std_error: s.sem, ci95_low: s.ci95[0], ci95_high: s.ci95[1], geometric_mean: s.geoMean ?? '', harmonic_mean: s.harmMean ?? '', skewness: s.skewness, excess_kurtosis: s.kurtosis, coeff_variation: s.cv, outliers: s.outliers.join(' ') }).map(([k, v]) => `${k}\t${typeof v === 'number' ? f(v, 10) : v}`).join('\n') : ''

  return (
    <div className="space-y-4">
      <Bar>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'list', label: 'List of numbers' }, { value: 'table', label: 'CSV / table column' }]} />
        {mode === 'table' && opts.length > 0 && <><span className="text-sm text-muted">Column</span><Select value={col} onChange={setCol} options={opts} className="w-40" /><span className="text-sm text-muted">Regress against</span><Select value={ycol} onChange={setYcol} options={opts} className="w-40" /></>}
        <Slider label="Bins (0 = auto)" value={bins} onChange={setBins} min={0} max={40} className="w-48" />
        {report && <CopyButton text={report} label="Copy report" />}
      </Bar>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Pane title={mode === 'list' ? 'Numbers (any separator)' : 'CSV or pasted table'} className="h-[520px]" actions={<OpenFileButton accept=".csv,.tsv,.txt,text/*" onText={(x) => (mode === 'list' ? setText(x) : setTable(x))} />}>
          <CodeArea value={mode === 'list' ? text : table} onChange={mode === 'list' ? setText : setTable} />
        </Pane>
        <div className="space-y-4">
          {!s ? <Status kind="info">Paste some numbers to see the statistics.</Status> : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <KV label="Count" value={String(s.n)} /><KV label="Mean" value={f(s.mean)} /><KV label="Median" value={f(s.median)} />
                <KV label="Mode" value={s.modes.length ? s.modes.map((m) => f(m)).join(', ') : 'none'} /><KV label="Sum" value={f(s.sum)} /><KV label="Range" value={`${f(s.min)} to ${f(s.max)}`} />
                <KV label="SD (sample)" value={f(s.sdSample)} /><KV label="SD (population)" value={f(s.sdPop)} /><KV label="Variance (sample)" value={f(s.varSample)} />
                <KV label="Q1 / Q3" value={`${f(s.q1)} / ${f(s.q3)}`} /><KV label="IQR" value={f(s.iqr)} /><KV label="Std error" value={f(s.sem)} />
                <KV label="95% CI of mean" value={`${f(s.ci95[0], 4)} to ${f(s.ci95[1], 4)}`} /><KV label="Geometric mean" value={s.geoMean == null ? 'needs all > 0' : f(s.geoMean)} /><KV label="Harmonic mean" value={s.harmMean == null ? 'needs all > 0' : f(s.harmMean)} />
                <KV label="Skewness" value={f(s.skewness, 4)} /><KV label="Excess kurtosis" value={f(s.kurtosis, 4)} /><KV label="Outliers (1.5 IQR)" value={s.outliers.length ? s.outliers.join(', ') : 'none'} />
              </div>
              <div className="rounded-2xl border border-border bg-surface p-4">
                <div className="mb-3 text-sm font-semibold">Histogram</div>
                <div className="flex h-40 items-end gap-1" role="img" aria-label="Histogram of the values">
                  {hist.map((h, i) => (
                    <div key={i} className="group relative flex-1">
                      <motion.div className="rounded-t bg-gradient-brand" initial={{ height: 0 }} animate={{ height: `${(h.count / hmax) * 150}px` }} transition={{ delay: i * 0.02, type: 'spring', stiffness: 120, damping: 18 }} />
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-surface-2 px-2 py-1 text-xs shadow group-hover:block">{f(h.from, 3)} to {f(h.to, 3)}: {h.count}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-1 flex justify-between text-xs text-muted"><span>{f(s.min, 3)}</span><span>{f(s.max, 3)}</span></div>
                <BoxPlot s={s} />
              </div>
              {reg && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><KV label="Slope" value={f(reg.slope)} /><KV label="Intercept" value={f(reg.intercept)} /><KV label="Pearson r" value={f(reg.r, 4)} /><KV label="R squared" value={f(reg.r2, 4)} /></div>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function BoxPlot({ s }: { s: NonNullable<ReturnType<typeof describe>> }) {
  const span = s.max - s.min || 1
  const x = (v: number) => `${((v - s.min) / span) * 100}%`
  const lo = Math.max(s.min, s.q1 - 1.5 * s.iqr), hi = Math.min(s.max, s.q3 + 1.5 * s.iqr)
  return (
    <div className="relative mt-5 h-8" aria-label="Box plot">
      <div className="absolute top-1/2 h-px bg-muted/60" style={{ left: x(lo), width: `calc(${x(hi)} - ${x(lo)})` }} />
      <div className="absolute top-1 h-6 rounded border-2 border-accent bg-accent/15" style={{ left: x(s.q1), width: `calc(${x(s.q3)} - ${x(s.q1)})` }} />
      <div className="absolute top-0 h-8 w-0.5 bg-accent" style={{ left: x(s.median) }} />
      {s.outliers.map((o, i) => <div key={i} className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-warn" style={{ left: x(o) }} />)}
    </div>
  )
}
