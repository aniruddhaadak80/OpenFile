import { useMemo, useState } from 'react'
import { Dropzone, Label, Select, ToolGrid, ErrorNote } from '@/components/ui'
import { TopBar } from '@/lib/b4/ui'
import { readBook, writeBook, SHEET_ACCEPT, type Book } from '@/lib/bcat/sheets'
import { pivot, type Agg } from '@/lib/bcat/office'
import { DlButton, toCsv, Bars } from '@/lib/bcat/kit'

const fmt = (v: unknown) => (v == null ? '' : typeof v === 'number' ? (Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 })) : String(v))

export default function PivotTable() {
  const [file, setFile] = useState<File | null>(null)
  const [book, setBook] = useState<Book | null>(null)
  const [sheet, setSheet] = useState('0')
  const [rowF, setRowF] = useState('')
  const [colF, setColF] = useState('')
  const [valF, setValF] = useState('')
  const [agg, setAgg] = useState<Agg>('sum')
  const [err, setErr] = useState<string | null>(null)

  const open = async (f: File) => {
    setFile(f); setErr(null)
    try { const b = await readBook(f); setBook(b); const h = (b.sheets[0].rows[0] ?? []).map(String); setRowF(h[0] ?? ''); setColF(''); const num = h.findIndex((_, i) => b.sheets[0].rows.slice(1, 50).some((r) => typeof r[i] === 'number')); setValF(num >= 0 ? h[num] : ''); setAgg(num >= 0 ? 'sum' : 'count') } catch (e: any) { setErr(e?.message) }
  }
  const rows = book?.sheets[+sheet]?.rows ?? []
  const head = (rows[0] ?? []).map((h, i) => String(h ?? `Column ${i + 1}`))
  const records = useMemo(() => rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]]))), [rows])
  const p = useMemo(() => (rowF ? pivot(records, rowF, colF || null, valF || null, agg) : null), [records, rowF, colF, valF, agg])
  const grid = () => p ? [[`${rowF} / ${colF || ''}`.trim(), ...p.colKeys, 'Total'], ...p.rowKeys.map((k, i) => [k, ...p.table[i], p.rowTotals[i]]), ['Total', ...p.colTotals, p.grand]] as (string | number | null)[][] : []
  const fieldOpts = head.map((h) => ({ value: h, label: h }))

  if (!file) return <Dropzone accept={SHEET_ACCEPT} onFiles={(f) => open(f[0])} label="Drop a spreadsheet to summarise" sub="Group rows by any column and sum, count or average the values, like a pivot table in Excel." />
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <TopBar file={file} onReset={() => { setFile(null); setBook(null) }} extra={<span className="text-xs text-muted">{records.length.toLocaleString()} rows</span>} />
          <ErrorNote error={err} />
          {p && (
            <div className="max-h-[540px] overflow-auto rounded-2xl border border-border">
              <table className="text-sm">
                <thead className="sticky top-0 bg-surface-2 text-xs"><tr><th className="px-3 py-2 text-left">{rowF}{colF ? ` / ${colF}` : ''}</th>{p.colKeys.map((c) => <th key={c} className="px-3 py-2 text-right">{c}</th>)}{colF && <th className="px-3 py-2 text-right">Total</th>}</tr></thead>
                <tbody>
                  {p.rowKeys.slice(0, 1000).map((k, i) => <tr key={k} className="border-t border-border"><td className="px-3 py-1.5 font-medium">{k}</td>{p.table[i].map((v, j) => <td key={j} className="px-3 py-1.5 text-right font-mono tabular-nums">{fmt(v)}</td>)}{colF && <td className="px-3 py-1.5 text-right font-mono font-semibold">{fmt(p.rowTotals[i])}</td>}</tr>)}
                  <tr className="border-t-2 border-border bg-surface-2/60 font-semibold"><td className="px-3 py-1.5">Total</td>{p.colTotals.map((v, j) => <td key={j} className="px-3 py-1.5 text-right font-mono">{fmt(v)}</td>)}{colF && <td className="px-3 py-1.5 text-right font-mono">{fmt(p.grand)}</td>}</tr>
                </tbody>
              </table>
            </div>
          )}
          {p && !colF && p.rowKeys.length <= 40 && <div className="rounded-2xl border border-border bg-surface p-4"><Bars items={p.rowKeys.map((k, i) => ({ label: k, value: Number(p.rowTotals[i] ?? 0) }))} /></div>}
        </div>
      }
      side={
        <>
          {book && book.sheets.length > 1 && <div><Label>Sheet</Label><Select value={sheet} onChange={setSheet} options={book.sheets.map((s, i) => ({ value: String(i), label: s.name }))} /></div>}
          <div><Label>Rows (group by)</Label><Select value={rowF} onChange={setRowF} options={fieldOpts} /></div>
          <div><Label>Columns (optional)</Label><Select value={colF} onChange={setColF} options={[{ value: '', label: 'None' }, ...fieldOpts]} /></div>
          <div><Label>Values</Label><Select value={valF} onChange={setValF} options={[{ value: '', label: 'Count rows' }, ...fieldOpts]} /></div>
          <div><Label>Summarise by</Label><Select value={agg} onChange={setAgg} options={[{ value: 'sum', label: 'Sum' }, { value: 'count', label: 'Count' }, { value: 'avg', label: 'Average' }, { value: 'min', label: 'Minimum' }, { value: 'max', label: 'Maximum' }, { value: 'distinct', label: 'Count distinct' }]} /></div>
          {p && (
            <div className="flex flex-wrap gap-2">
              <DlButton variant="primary" name={`${book!.name}-pivot.xlsx`} data={() => writeBook([{ name: 'Pivot', rows: grid() }], 'xlsx')}>XLSX</DlButton>
              <DlButton name={`${book!.name}-pivot.csv`} mime="text/csv" data={() => toCsv(grid())}>CSV</DlButton>
            </div>
          )}
          <p className="text-xs text-muted">Numbers written with commas, currency signs or percent signs are read as numbers.</p>
        </>
      }
    />
  )
}
