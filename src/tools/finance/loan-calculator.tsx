import { useMemo, useState } from 'react'
import { Input, Label, Segmented, ToolGrid } from '@/components/ui'
import { amortize } from '@/lib/r13/finance'
import { Lines } from '@/lib/r13/ui'
import { toCsv, DlButton } from '@/lib/bcat/kit'
import { Stat } from '@/tools/dev/_b5/shell'

const f2 = (v: number) => (isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-')

export default function LoanCalculator() {
  const [amount, setAmount] = useState('2500000')
  const [rate, setRate] = useState('8.5')
  const [term, setTerm] = useState('20')
  const [unit, setUnit] = useState<'years' | 'months'>('years')
  const [extra, setExtra] = useState('0')
  const [lumpMonth, setLumpMonth] = useState('')
  const [lumpAmt, setLumpAmt] = useState('')
  const [view, setView] = useState<'year' | 'month'>('year')
  const P = +amount || 0, r = +rate || 0, n = Math.round((+term || 0) * (unit === 'years' ? 12 : 1))
  const base = useMemo(() => amortize(P, r, n), [P, r, n])
  const plan = useMemo(() => amortize(P, r, n, +extra || 0, +lumpMonth && +lumpAmt ? [{ month: +lumpMonth, amount: +lumpAmt }] : []), [P, r, n, extra, lumpMonth, lumpAmt])
  const years = useMemo(() => { const out: { y: number; principal: number; interest: number; extra: number; balance: number }[] = []; plan.rows.forEach((row) => { const y = Math.ceil(row.n / 12); const o = out[y - 1] ?? (out[y - 1] = { y, principal: 0, interest: 0, extra: 0, balance: 0 }); o.principal += row.principal; o.interest += row.interest; o.extra += row.extra; o.balance = row.balance }); return out }, [plan])
  const saved = base.totalInterest - plan.totalInterest
  const bad = n > 0 && P > 0 && plan.rows.length && plan.rows.at(-1)!.balance > 0.01
  return (
    <ToolGrid
      main={<>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Monthly payment (EMI)" value={f2(plan.payment)} /><Stat label="Total interest" value={f2(plan.totalInterest)} /><Stat label="Total paid" value={f2(P + plan.totalInterest)} /><Stat label="Paid off in" value={`${Math.floor(plan.months / 12)} y ${plan.months % 12} m`} sub={saved > 1 ? `saves ${f2(saved)} interest` : undefined} /></div>
        {bad ? <p className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">The payment does not cover the interest, so this loan would never be paid off.</p> : null}
        {plan.rows.length > 1 && <Lines label="Loan balance over time" series={[{ name: 'Balance with your plan', color: '#F5A524', values: plan.rows.filter((_, i) => i % 3 === 0).map((x) => x.balance) }, ...(saved > 1 ? [{ name: 'Balance without extra payments', color: '#38BDF8', values: base.rows.filter((_, i) => i % 3 === 0).map((x) => x.balance) }] : [])]} />}
        <div className="flex items-center justify-between"><Label className="mb-0">Schedule</Label><Segmented value={view} onChange={setView} options={[{ value: 'year', label: 'By year' }, { value: 'month', label: 'By month' }]} /></div>
        <div className="max-h-96 overflow-auto rounded-2xl border border-border scrollbar-thin">
          <table className="w-full text-sm"><thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted"><tr><th className="px-3 py-2">{view === 'year' ? 'Year' : 'Month'}</th><th className="px-3 py-2 text-right">Principal</th><th className="px-3 py-2 text-right">Interest</th><th className="px-3 py-2 text-right">Extra</th><th className="px-3 py-2 text-right">Balance</th></tr></thead>
            <tbody>{(view === 'year' ? years.map((y) => ({ k: y.y, ...y })) : plan.rows.map((m) => ({ k: m.n, ...m }))).map((row) => <tr key={row.k} className="border-t border-border font-mono text-xs tabular-nums"><td className="px-3 py-1.5">{row.k}</td><td className="px-3 py-1.5 text-right">{f2(row.principal)}</td><td className="px-3 py-1.5 text-right">{f2(row.interest)}</td><td className="px-3 py-1.5 text-right">{row.extra ? f2(row.extra) : ''}</td><td className="px-3 py-1.5 text-right">{f2(row.balance)}</td></tr>)}</tbody></table>
        </div>
      </>}
      side={<>
        <label className="block text-xs text-muted">Loan amount<Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="block text-xs text-muted">Interest rate (% a year)<Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></label>
        <div className="grid grid-cols-[1fr_auto] items-end gap-2"><label className="block text-xs text-muted">Term<Input inputMode="numeric" value={term} onChange={(e) => setTerm(e.target.value)} /></label><Segmented value={unit} onChange={setUnit} options={[{ value: 'years', label: 'Years' }, { value: 'months', label: 'Months' }]} /></div>
        <Label>Pay it off faster (optional)</Label>
        <label className="block text-xs text-muted">Extra every month<Input inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} /></label>
        <div className="grid grid-cols-2 gap-2"><label className="block text-xs text-muted">One-off in month<Input inputMode="numeric" value={lumpMonth} onChange={(e) => setLumpMonth(e.target.value)} placeholder="24" /></label><label className="block text-xs text-muted">Amount<Input inputMode="decimal" value={lumpAmt} onChange={(e) => setLumpAmt(e.target.value)} placeholder="100000" /></label></div>
        <div className="grid grid-cols-2 gap-2">
          <DlButton name="loan-schedule.csv" mime="text/csv" data={() => toCsv([['month', 'payment', 'principal', 'interest', 'extra', 'balance'], ...plan.rows.map((x) => [x.n, x.payment.toFixed(2), x.principal.toFixed(2), x.interest.toFixed(2), x.extra.toFixed(2), x.balance.toFixed(2)])])}>CSV</DlButton>
          <DlButton name="loan-schedule.xlsx" data={async () => { const XLSX = await import('xlsx'); const ws = XLSX.utils.aoa_to_sheet([['Month', 'Payment', 'Principal', 'Interest', 'Extra', 'Balance'], ...plan.rows.map((x) => [x.n, +x.payment.toFixed(2), +x.principal.toFixed(2), +x.interest.toFixed(2), +x.extra.toFixed(2), +x.balance.toFixed(2)])]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Schedule'); return new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })]) }}>Excel</DlButton>
        </div>
        <p className="text-xs text-muted">Uses the standard reducing balance formula that banks use for home, car and personal loans (EMI). Extra payments go straight to the principal.</p>
      </>}
    />
  )
}
