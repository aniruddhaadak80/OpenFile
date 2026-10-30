import { useMemo, useState } from 'react'
import { Input, Label, Segmented, Select, ToolGrid } from '@/components/ui'
import { growth, cagr } from '@/lib/r13/finance'
import { Lines } from '@/lib/r13/ui'
import { toCsv, DlButton } from '@/lib/bcat/kit'
import { Stat } from '@/tools/dev/_b5/shell'

const f0 = (v: number) => (isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-')

export default function CompoundInterest() {
  const [start, setStart] = useState('100000')
  const [monthly, setMonthly] = useState('5000')
  const [rate, setRate] = useState('12')
  const [years, setYears] = useState('15')
  const [per, setPer] = useState('12')
  const [step, setStep] = useState('0')
  const [infl, setInfl] = useState('5')
  const [timing, setTiming] = useState<'start' | 'end'>('start')
  const rows = useMemo(() => growth({ start: +start || 0, monthly: +monthly || 0, ratePct: +rate || 0, years: Math.min(80, Math.max(1, Math.round(+years || 1))), perYear: +per, stepUpPct: +step || 0, timing }), [start, monthly, rate, years, per, step, timing])
  const last = rows.at(-1)!
  const real = last.value / (1 + (+infl || 0) / 100) ** rows.length
  return (
    <ToolGrid
      main={<>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Final value" value={f0(last.value)} /><Stat label="You put in" value={f0(last.invested)} /><Stat label="Growth earned" value={f0(last.interest)} /><Stat label="In today's money" value={f0(real)} sub={`at ${infl || 0}% inflation`} /></div>
        <Lines label="Value and amount invested by year" xLabels={rows.map((r) => `Y${r.year}`)} series={[{ name: 'Value', color: '#F5A524', values: rows.map((r) => r.value) }, { name: 'Invested', color: '#14B8A6', values: rows.map((r) => r.invested) }]} />
        <div className="max-h-80 overflow-auto rounded-2xl border border-border scrollbar-thin"><table className="w-full text-sm"><thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted"><tr><th className="px-3 py-2">Year</th><th className="px-3 py-2 text-right">Invested</th><th className="px-3 py-2 text-right">Growth</th><th className="px-3 py-2 text-right">Value</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.year} className="border-t border-border font-mono text-xs tabular-nums"><td className="px-3 py-1.5">{r.year}</td><td className="px-3 py-1.5 text-right">{f0(r.invested)}</td><td className="px-3 py-1.5 text-right">{f0(r.interest)}</td><td className="px-3 py-1.5 text-right">{f0(r.value)}</td></tr>)}</tbody></table></div>
        <p className="text-xs text-muted">Overall growth rate on the money you put in: {isFinite(cagr(last.invested, last.value, rows.length)) ? cagr(last.invested, last.value, rows.length).toFixed(2) : '-'}% a year (simple CAGR from total invested to final value).</p>
      </>}
      side={<>
        <label className="block text-xs text-muted">Starting amount<Input inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="block text-xs text-muted">Added every month (SIP or savings)<Input inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} /></label>
        <div><Label hint={timing === 'start' ? 'Like most SIP calculators' : 'Like a recurring deposit paid at month end'}>Monthly amount goes in at the</Label><Segmented value={timing} onChange={setTiming} options={[{ value: 'start', label: 'Start of month' }, { value: 'end', label: 'End of month' }]} /></div>
        <label className="block text-xs text-muted">Yearly return or interest (%)<Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></label>
        <label className="block text-xs text-muted">Years<Input inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value)} /></label>
        <label className="block text-xs text-muted">Compounding<Select value={per} onChange={setPer} options={[{ value: '1', label: 'Yearly' }, { value: '2', label: 'Half yearly' }, { value: '4', label: 'Quarterly (most bank deposits)' }, { value: '12', label: 'Monthly' }, { value: '365', label: 'Daily' }]} /></label>
        <Label>Extras</Label>
        <label className="block text-xs text-muted">Raise the monthly amount each year by (%)<Input inputMode="decimal" value={step} onChange={(e) => setStep(e.target.value)} /></label>
        <label className="block text-xs text-muted">Inflation for today's money (%)<Input inputMode="decimal" value={infl} onChange={(e) => setInfl(e.target.value)} /></label>
        <DlButton className="w-full" name="growth.csv" mime="text/csv" data={() => toCsv([['year', 'invested', 'growth', 'value'], ...rows.map((r) => [r.year, r.invested.toFixed(2), r.interest.toFixed(2), r.value.toFixed(2)])])}>Download CSV</DlButton>
        <p className="text-xs text-muted">Returns are not guaranteed. Market funds go up and down, so treat this as a what-if, not a promise.</p>
      </>}
    />
  )
}
