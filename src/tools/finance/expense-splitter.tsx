import { useMemo, useState } from 'react'
import { Plus, Trash2, Upload } from 'lucide-react'
import { Button, Input, Label, Select, ToolGrid, CopyButton } from '@/components/ui'
import { balances, settle, parseMoney, type Expense } from '@/lib/r13/finance'
import { toCsv, DlButton, pal } from '@/lib/bcat/kit'

const SAMPLE: Expense[] = [{ payer: 'Asha', amount: 3600, for: [], note: 'Hotel' }, { payer: 'Ravi', amount: 1200, for: [], note: 'Dinner' }, { payer: 'Meera', amount: 450, for: ['Meera', 'Ravi'], note: 'Cab' }]

export default function ExpenseSplitter() {
  const [people, setPeople] = useState(['Asha', 'Ravi', 'Meera'])
  const [exps, setExps] = useState<Expense[]>(SAMPLE)
  const [name, setName] = useState('')
  const bal = useMemo(() => balances(people, exps.filter((e) => people.includes(e.payer))), [people, exps])
  const plan = useMemo(() => settle(bal), [bal])
  const total = exps.reduce((s, e) => s + (e.amount || 0), 0)
  const upd = (i: number, p: Partial<Expense>) => setExps((x) => x.map((e, j) => (j === i ? { ...e, ...p } : e)))
  const importCsv = async (f: File) => {
    const Papa = (await import('papaparse')).default
    const r = Papa.parse<Record<string, string>>(await f.text(), { header: true, skipEmptyLines: true })
    const rows = r.data.map((d) => { const k = (re: RegExp) => Object.keys(d).find((x) => re.test(x.toLowerCase())); const payer = (d[k(/paid|payer|who|name/) ?? ''] ?? '').trim(); return { payer, amount: parseMoney(d[k(/amount|cost|price|total/) ?? ''] ?? ''), for: (d[k(/for|split|between/) ?? ''] ?? '').split(/[;|]/).map((s) => s.trim()).filter(Boolean), note: d[k(/note|what|desc|item/) ?? ''] ?? '' } }).filter((e) => e.payer && isFinite(e.amount))
    const ppl = [...new Set([...people, ...rows.map((e) => e.payer), ...rows.flatMap((e) => e.for)])]
    setPeople(ppl); setExps((x) => [...x, ...rows])
  }
  const text = plan.length ? plan.map((p) => `${p.from} pays ${p.to} ${p.amount.toFixed(2)}`).join('\n') : 'Everyone is settled.'
  return (
    <ToolGrid
      main={<>
        <div className="space-y-2">
          {exps.map((e, i) => (
            <div key={i} className="grid grid-cols-[1fr_7rem] gap-2 rounded-2xl border border-border bg-surface p-3 sm:grid-cols-[1.4fr_1fr_7rem_1.6fr_auto]">
              <Input aria-label="What was it" placeholder="What" value={e.note ?? ''} onChange={(ev) => upd(i, { note: ev.target.value })} />
              <Select aria-label="Paid by" value={e.payer} onChange={(v) => upd(i, { payer: v })} options={people} />
              <Input aria-label="Amount" inputMode="decimal" value={isFinite(e.amount) ? String(e.amount) : ''} onChange={(ev) => upd(i, { amount: parseMoney(ev.target.value) })} />
              <div className="col-span-2 flex flex-wrap gap-1 sm:col-span-1">{people.map((p) => { const on = !e.for.length || e.for.includes(p); return <button key={p} type="button" aria-pressed={on} onClick={() => { const cur = e.for.length ? e.for : people; const next = on ? cur.filter((x) => x !== p) : [...cur, p]; upd(i, { for: next.length === people.length ? [] : next }) }} className={`rounded-full border px-2 py-0.5 text-[11px] cursor-pointer ${on ? 'border-accent bg-accent/10' : 'border-border text-muted line-through'}`}>{p}</button> })}</div>
              <button type="button" aria-label="Remove expense" className="justify-self-end rounded p-1 text-muted hover:text-danger cursor-pointer" onClick={() => setExps((x) => x.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
            </div>
          ))}
          <Button variant="outline" size="sm" icon={<Plus className="size-4" />} onClick={() => setExps((x) => [...x, { payer: people[0] ?? '', amount: 0, for: [], note: '' }])} disabled={!people.length}>Add expense</Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface p-4"><Label hint={`total ${total.toFixed(2)}`}>Balances</Label>
            <ul className="space-y-1 text-sm">{[...bal.entries()].map(([p, v], i) => <li key={p} className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: pal(i) }} /><span className="flex-1">{p}</span><span className={`font-mono ${v < -0.005 ? 'text-warn' : v > 0.005 ? 'text-success' : 'text-muted'}`}>{v > 0.005 ? 'gets back ' : v < -0.005 ? 'owes ' : ''}{Math.abs(v).toFixed(2)}</span></li>)}</ul></div>
          <div className="rounded-2xl border border-accent/40 bg-accent/5 p-4"><Label hint={`${plan.length} transfers`}>Settle up</Label>
            <ul className="space-y-1 text-sm">{plan.length ? plan.map((p, i) => <li key={i}><b>{p.from}</b> pays <b>{p.to}</b> <span className="font-mono">{p.amount.toFixed(2)}</span></li>) : <li className="text-muted">Everyone is settled.</li>}</ul>
            <div className="mt-2"><CopyButton text={text} label="Copy" /></div></div>
        </div>
      </>}
      side={<>
        <Label>People</Label>
        <div className="flex flex-wrap gap-1.5">{people.map((p) => <span key={p} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">{p}<button type="button" aria-label={`Remove ${p}`} className="text-muted hover:text-danger cursor-pointer" onClick={() => { setPeople((x) => x.filter((y) => y !== p)); setExps((x) => x.filter((e) => e.payer !== p).map((e) => ({ ...e, for: e.for.filter((y) => y !== p) }))) }}>×</button></span>)}</div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const n = name.trim(); if (n && !people.includes(n)) setPeople((x) => [...x, n]); setName('') }}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a person" aria-label="Add a person" /><Button type="submit" variant="outline" icon={<Plus className="size-4" />} aria-label="Add person" /></form>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-sm text-muted hover:border-accent"><Upload className="size-4" />Import CSV (payer, amount, for, note)<input type="file" accept=".csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCsv(f); e.target.value = '' }} /></label>
        <DlButton className="w-full" name="expenses.csv" mime="text/csv" data={() => toCsv([['note', 'payer', 'amount', 'for'], ...exps.map((e) => [e.note ?? '', e.payer, e.amount, e.for.join(';') || 'everyone']), [], ['from', 'to', 'amount'], ...plan.map((p) => [p.from, p.to, p.amount.toFixed(2)])])}>Download CSV</DlButton>
        <Button variant="ghost" className="w-full" onClick={() => { setExps([]); setPeople([]) }}>Clear all</Button>
        <p className="text-xs text-muted">Tap names on an expense to choose who shared it. The settle up list uses the fewest payments, matching the biggest debts first.</p>
      </>}
    />
  )
}
