import { useMemo, useState } from 'react'
import { Merge } from 'lucide-react'
import { Button, Card, Label, Segmented, Select, Switch } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { writeBook } from '@/lib/bcat/sheets'
import { str, type Rows } from '@/lib/cf/sheet'
import { useSheet, SheetDrop, SheetPicker, FileBar, RowsTable, useColOptions, Stat, Stats } from '@/lib/cf/ui'

export default function SheetJoin() {
  const a = useSheet(), b = useSheet()
  const [ka, setKa] = useState('0'), [kb, setKb] = useState('0')
  const [how, setHow] = useState<'left' | 'inner' | 'full' | 'anti'>('left')
  const [bring, setBring] = useState<string[]>([])
  const [caseless, setCaseless] = useState(true), [fmt, setFmt] = useState<'xlsx' | 'csv'>('xlsx')
  const oa = useColOptions(a.rows, true), ob = useColOptions(b.rows, true)
  const cols = bring.length ? bring.map(Number) : ob.map((o) => +o.value).filter((i) => i !== +kb)
  const res = useMemo(() => {
    if (!a.rows.length || !b.rows.length) return null
    const key = (v: unknown) => { let s = str(v as any).trim(); if (caseless) s = s.toLowerCase(); return s }
    const idx = new Map<string, Rows>(); for (const r of b.rows.slice(1)) { const k = key(r[+kb]); if (!idx.has(k)) idx.set(k, []); idx.get(k)!.push(r) }
    const out: Rows = how === 'anti' ? [a.rows[0]] : [[...a.rows[0], ...cols.map((c) => `${str(b.rows[0][c] ?? null)}`)]]
    const used = new Set<string>(); let matched = 0, multi = 0
    for (const r of a.rows.slice(1)) {
      const k = key(r[+ka]), hits = k ? idx.get(k) : undefined
      if (how === 'anti') { if (!hits) out.push(r); continue }
      if (hits) { matched++; used.add(k); if (hits.length > 1) multi++; out.push([...r, ...cols.map((c) => hits[0][c] ?? null)]) }
      else if (how !== 'inner') out.push([...r, ...cols.map(() => null)])
    }
    if (how === 'full') for (const [k, hs] of idx) if (!used.has(k)) for (const h of hs) { const row: Rows[number] = a.rows[0].map(() => null); row[+ka] = h[+kb]; out.push([...row, ...cols.map((c) => h[c] ?? null)]) }
    return { out, matched, unmatched: a.rows.length - 1 - matched, multi }
  }, [a.rows, b.rows, ka, kb, how, cols.join(), caseless])
  if (!a.file) return <SheetDrop s={a} label="Drop your main sheet (the rows you want to keep)" sub="Step 1 of 2. Then add the lookup sheet to bring columns across by a shared key, like VLOOKUP." />
  if (!b.file) return <div className="space-y-3"><FileBar name={a.file.name} size={a.file.size} onReset={a.reset} /><SheetDrop s={b} label="Now drop the lookup sheet" sub="Step 2 of 2. It needs a column that matches one in the main sheet, like an email, ID or SKU." /></div>
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-3">
        <FileBar name={`Main: ${a.file.name}`} onReset={a.reset} /><FileBar name={`Lookup: ${b.file.name}`} onReset={b.reset} />
        {res && <Stats><Stat label="Matched rows" value={res.matched.toLocaleString()} tone="good" /><Stat label="No match" value={res.unmatched.toLocaleString()} tone={res.unmatched ? 'warn' : undefined} /><Stat label="Keys with several matches" value={res.multi} sub="the first match is used" /></Stats>}
        {res && <RowsTable rows={res.out} />}
      </div>
      <Card className="space-y-4 self-start">
        <SheetPicker s={a} /><SheetPicker s={b} />
        <div><Label>Key in main sheet</Label><Select value={ka} onChange={setKa} options={oa} /></div>
        <div><Label>Matching key in lookup sheet</Label><Select value={kb} onChange={setKb} options={ob} /></div>
        <div><Label>Rows to keep</Label><Select value={how} onChange={setHow} options={[{ value: 'left', label: 'All main rows (like VLOOKUP)' }, { value: 'inner', label: 'Only rows found in both' }, { value: 'full', label: 'Everything from both' }, { value: 'anti', label: 'Main rows NOT in lookup' }]} /></div>
        {how !== 'anti' && <div><Label hint={bring.length ? `${bring.length}` : 'all'}>Columns to bring across</Label><div className="flex max-h-40 flex-wrap gap-1.5 overflow-auto">{ob.filter((o) => o.value !== kb).map((o) => <button key={o.value} aria-pressed={bring.includes(o.value)} onClick={() => setBring((x) => x.includes(o.value) ? x.filter((y) => y !== o.value) : [...x, o.value])} className={`rounded-full border px-2.5 py-1 text-xs cursor-pointer ${bring.includes(o.value) ? 'border-accent text-fg' : 'border-border text-muted'}`}>{o.label}</button>)}</div></div>}
        <Switch checked={caseless} onChange={setCaseless} label="Ignore case and outer spaces in keys" />
        <div><Label>Save as</Label><Segmented value={fmt} onChange={setFmt} options={[{ value: 'xlsx', label: 'XLSX' }, { value: 'csv', label: 'CSV' }]} /></div>
        <Button className="w-full" icon={<Merge className="size-4" />} disabled={!res} onClick={async () => downloadBlob(await writeBook([{ name: 'Joined', rows: res!.out }], fmt), `${a.book!.name}-joined.${fmt}`)}>Download joined sheet</Button>
      </Card>
    </div>
  )
}
