import { useMemo, useState } from 'react'
import { Input, Label, Segmented, ToolGrid, Textarea, CopyButton } from '@/components/ui'
import { tax, parseMoney } from '@/lib/r13/finance'
import { toCsv, DlButton } from '@/lib/bcat/kit'
import { Stat } from '@/tools/dev/_b5/shell'

const PRESETS: { label: string; rates: number[] }[] = [
  { label: 'India GST', rates: [0, 5, 12, 18, 28] }, { label: 'UK VAT', rates: [0, 5, 20] }, { label: 'EU VAT', rates: [7, 10, 19, 20, 21] },
  { label: 'Australia GST', rates: [10] }, { label: 'Canada GST/HST', rates: [5, 13, 15] }, { label: 'UAE VAT', rates: [5] }, { label: 'Singapore GST', rates: [9] },
]
const f2 = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function GstVatCalculator() {
  const [amount, setAmount] = useState('1000')
  const [rate, setRate] = useState('18')
  const [mode, setMode] = useState<'add' | 'remove'>('add')
  const [split, setSplit] = useState(true)
  const [preset, setPreset] = useState(0)
  const [bulk, setBulk] = useState('')
  const r = +rate || 0
  const res = tax(parseMoney(amount) || 0, r, mode)
  const lines = useMemo(() => bulk.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const v = parseMoney(l); return { input: l, ...tax(isFinite(v) ? v : 0, r, mode), ok: isFinite(v) } }), [bulk, r, mode])
  const isIndia = PRESETS[preset].label === 'India GST'
  const summary = `${mode === 'add' ? 'Net' : 'Price incl. tax'} ${f2(mode === 'add' ? res.net : res.gross)}, tax ${r}% = ${f2(res.tax)}, ${mode === 'add' ? 'total' : 'net'} ${f2(mode === 'add' ? res.gross : res.net)}`
  return (
    <ToolGrid
      main={<>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3"><Stat label="Net (before tax)" value={f2(res.net)} /><Stat label={`Tax at ${r}%`} value={f2(res.tax)} /><Stat label="Gross (with tax)" value={f2(res.gross)} /></div>
        {isIndia && split && <div className="grid grid-cols-1 gap-2 sm:grid-cols-3"><Stat label={`CGST ${r / 2}%`} value={f2(res.tax / 2)} sub="Within one state" /><Stat label={`SGST ${r / 2}%`} value={f2(res.tax / 2)} sub="Within one state" /><Stat label={`IGST ${r}%`} value={f2(res.tax)} sub="Between states" /></div>}
        <CopyButton text={summary} label="Copy result" />
        <div className="rounded-2xl border border-border bg-surface p-4">
          <Label hint={lines.length ? `${lines.length} amounts` : ''}>Many amounts at once (one per line)</Label>
          <Textarea value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'250\n1,499.00\n89.90'} className="min-h-28 font-mono text-sm" aria-label="Amounts, one per line" />
          {lines.length > 0 && <div className="mt-3 max-h-64 overflow-auto scrollbar-thin"><table className="w-full text-sm"><thead className="text-left text-xs text-muted"><tr><th className="py-1">Input</th><th className="py-1 text-right">Net</th><th className="py-1 text-right">Tax</th><th className="py-1 text-right">Gross</th></tr></thead>
            <tbody>{lines.map((l, i) => <tr key={i} className="border-t border-border font-mono text-xs tabular-nums"><td className="py-1">{l.ok ? l.input : <span className="text-danger">{l.input}</span>}</td><td className="py-1 text-right">{f2(l.net)}</td><td className="py-1 text-right">{f2(l.tax)}</td><td className="py-1 text-right">{f2(l.gross)}</td></tr>)}
              <tr className="border-t border-border font-mono text-xs font-semibold"><td className="py-1">Total</td><td className="py-1 text-right">{f2(lines.reduce((a, l) => a + l.net, 0))}</td><td className="py-1 text-right">{f2(lines.reduce((a, l) => a + l.tax, 0))}</td><td className="py-1 text-right">{f2(lines.reduce((a, l) => a + l.gross, 0))}</td></tr></tbody></table></div>}
          {lines.length > 0 && <DlButton className="mt-2" name="tax.csv" mime="text/csv" data={() => toCsv([['input', 'net', 'tax', 'gross'], ...lines.map((l) => [l.input, l.net.toFixed(2), l.tax.toFixed(2), l.gross.toFixed(2)])])}>Download CSV</DlButton>}
        </div>
      </>}
      side={<>
        <div><Label>I have</Label><Segmented value={mode} onChange={setMode} options={[{ value: 'add', label: 'Price before tax' }, { value: 'remove', label: 'Price with tax' }]} /></div>
        <label className="block text-xs text-muted">Amount<Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12 text-lg" /></label>
        <label className="block text-xs text-muted">Rate (%)<Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></label>
        <div className="flex flex-wrap gap-1.5">{PRESETS.map((p, i) => <button key={p.label} type="button" onClick={() => setPreset(i)} className={`rounded-full border px-2.5 py-1 text-xs cursor-pointer ${preset === i ? 'border-accent bg-accent/10' : 'border-border text-muted'}`}>{p.label}</button>)}</div>
        <div className="flex flex-wrap gap-1.5">{PRESETS[preset].rates.map((x) => <button key={x} type="button" onClick={() => setRate(String(x))} className={`rounded-lg border px-2.5 py-1 font-mono text-xs cursor-pointer ${r === x ? 'border-accent text-accent' : 'border-border'}`}>{x}%</button>)}</div>
        {isIndia && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} className="accent-[var(--accent)]" />Show CGST, SGST and IGST</label>}
        <p className="text-xs text-muted">Rates change, so check the current rate for your product. Rounding follows normal 2 decimal rules.</p>
      </>}
    />
  )
}
