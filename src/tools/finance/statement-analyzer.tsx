import { useMemo } from 'react'
import { Label, ToolGrid, Empty } from '@/components/ui'
import { summarizeTxns, ruleCategory } from '@/lib/r13/finance'
import { useStatement, StatementDrop, CsvColumns, BarPair, fmtMoney } from '@/lib/r13/ui'
import { Bars, toCsv, DlButton } from '@/lib/bcat/kit'
import { Stat } from '@/tools/dev/_b5/shell'

export default function StatementAnalyzer() {
  const st = useStatement()
  const s = st.stmt
  const cur = s?.currency
  const sum = useMemo(() => (s?.txns.length ? summarizeTxns(s.txns) : null), [s])
  const cats = useMemo(() => {
    if (!s) return []
    const m = new Map<string, number>()
    for (const t of s.txns) if (t.amount < 0) { const c = ruleCategory(t.description, t.amount); m.set(c, (m.get(c) ?? 0) - t.amount) }
    return [...m.entries()].map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value)
  }, [s])
  return (
    <ToolGrid
      main={<>
        <StatementDrop st={st} label="Drop a bank or card statement" sub="OFX, QFX, QIF, CAMT.053, MT940 or CSV. See where the money went, without uploading anything." />
        {sum ? <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Money in" value={fmtMoney(sum.in, cur)} /><Stat label="Money out" value={fmtMoney(sum.out, cur)} /><Stat label="Net" value={fmtMoney(sum.net, cur)} /><Stat label="Period" value={<span className="text-sm">{sum.first} to {sum.last}</span>} sub={`${sum.count} transactions`} /></div>
          {sum.months.length > 0 && <BarPair data={sum.months.map((m) => ({ label: m.month.slice(2), a: m.in, b: m.out }))} a="#14B8A6" b="#F5A524" labelA="In" labelB="Out" />}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-surface p-4"><Label>Spending by category</Label><Bars items={cats.slice(0, 10)} /></div>
            <div className="rounded-2xl border border-border bg-surface p-4"><Label>Top places you paid</Label><Bars items={sum.payees.slice(0, 10).map((p) => ({ label: p.name, value: Math.round(p.total * 100) / 100 }))} color="#22D3EE" /></div>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <Label>Repeating payments</Label>
            {sum.recurring.length ? <ul className="divide-y divide-border text-sm">{sum.recurring.map((r) => <li key={r.name} className="flex items-center gap-2 py-1.5"><span className="min-w-0 flex-1 truncate">{r.name}</span><span className="text-xs text-muted">{r.every} · {r.count} times</span><span className="font-mono">{fmtMoney(r.amount, cur)}</span></li>)}</ul>
              : <p className="text-sm text-muted">No subscriptions or bills that repeat at the same amount were found. Longer statements (3 months or more) find more.</p>}
          </div>
        </> : st.file && !st.error && <Empty>No transactions yet. Check the column choices on the right.</Empty>}
      </>}
      side={<>
        <CsvColumns st={st} />
        {sum && <DlButton className="w-full" name="monthly-summary.csv" mime="text/csv" data={() => toCsv([['month', 'in', 'out', 'net'], ...sum.months.map((m) => [m.month, m.in.toFixed(2), m.out.toFixed(2), (m.in - m.out).toFixed(2)])])}>Monthly summary CSV</DlButton>}
        {sum && <DlButton className="w-full" name="categories.csv" mime="text/csv" data={() => toCsv([['category', 'spent'], ...cats.map((c) => [c.label, c.value.toFixed(2)])])}>Category totals CSV</DlButton>}
        <p className="text-xs text-muted">Categories here come from simple keyword rules. For smarter labels, use the Transaction Categorizer, which can run a small AI model on your device.</p>
      </>}
    />
  )
}
