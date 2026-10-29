/* Shared UI for the Money & Finance and Health & Fitness tools: statement loader with CSV column mapping,
 * a transaction table, small SVG charts and an activity file loader. */
import { useMemo, useState } from 'react'
import { Dropzone, Label, Select, ErrorNote, cn } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { detectFormat, parseOfx, parseQif, parseCamt, parseMt940, guessCsvMap, csvToTxns, type Statement, type Txn, type CsvMap } from './finance'
import { readActivity, type Activity } from './health'

export const STATEMENT_ACCEPT = '.ofx,.qfx,.qbo,.qif,.xml,.sta,.mt940,.940,.csv,.tsv,.txt'

export function fmtMoney(v: number, currency?: string) {
  if (!isFinite(v)) return '-'
  try { return new Intl.NumberFormat(undefined, currency && /^[A-Z]{3}$/.test(currency) ? { style: 'currency', currency, maximumFractionDigits: 2 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) } catch { return v.toFixed(2) }
}

interface CsvState { head: string[]; rows: string[][]; map: CsvMap }

/** Load a bank file of any supported format. CSV files get a column map the user can change. */
export function useStatement() {
  const [file, setFile] = useState<File | null>(null)
  const [base, setBase] = useState<Statement | null>(null)
  const [csv, setCsv] = useState<CsvState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = async (f: File) => {
    setError(null); setCsv(null); setBase(null); setFile(f)
    try {
      const text = await f.text()
      const kind = detectFormat(f.name, text)
      if (kind === 'ofx') setBase(parseOfx(text))
      else if (kind === 'qif') setBase(parseQif(text))
      else if (kind === 'camt') setBase(parseCamt(text))
      else if (kind === 'mt940') setBase(parseMt940(text))
      else {
        const Papa = (await import('papaparse')).default
        const r = Papa.parse<string[]>(text, { skipEmptyLines: true })
        // skip title lines some banks put above the header: the header is the first row with 3+ non empty cells
        let hi = r.data.findIndex((row) => row.filter((c) => String(c).trim()).length >= 3)
        if (hi < 0) hi = 0
        const head = r.data[hi].map((c) => String(c).trim()), rows = r.data.slice(hi + 1)
        if (!rows.length) throw new Error('This file has no rows under its header.')
        setCsv({ head, rows, map: guessCsvMap(head, rows) })
      }
    } catch (e: any) { setError(e?.message || String(e)) }
  }
  const stmt: Statement | null = useMemo(() => {
    if (base) return base
    if (!csv) return null
    const txns = csvToTxns(csv.rows, csv.map)
    return { format: 'CSV', txns, warnings: txns.length ? (txns.length < csv.rows.length ? [`${csv.rows.length - txns.length} rows were skipped because they had no date or amount.`] : []) : ['No rows could be read. Check the column choices.'] }
  }, [base, csv])
  const reset = () => { setFile(null); setBase(null); setCsv(null); setError(null) }
  return { file, stmt, csv, setCsv, error, load, reset }
}
export type StatementState = ReturnType<typeof useStatement>

export function StatementDrop({ st, label = 'Drop a bank statement file', sub = 'OFX, QFX, QIF, CAMT.053 XML, MT940 or CSV. It is read in your browser and never uploaded.' }: { st: StatementState; label?: string; sub?: string }) {
  return (
    <div className="space-y-3">
      {!st.file ? <Dropzone accept={STATEMENT_ACCEPT} onFiles={(f) => f[0] && st.load(f[0])} label={label} sub={sub} />
        : <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium">{st.file.name}</span>
            <span className="text-xs text-muted">{formatBytes(st.file.size)}{st.stmt ? ` · ${st.stmt.format} · ${st.stmt.txns.length} transactions` : ''}</span>
            <button type="button" className="rounded-lg border border-border px-2 py-1 text-xs hover:border-accent cursor-pointer" onClick={st.reset}>Change file</button>
          </div>}
      <ErrorNote error={st.error} />
      {st.stmt?.warnings.map((w) => <p key={w} className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">{w}</p>)}
    </div>
  )
}

/** Column pickers for CSV statements (shown in the side panel). */
export function CsvColumns({ st }: { st: StatementState }) {
  if (!st.csv) return null
  const { head, map } = st.csv
  const opts = [{ value: '-1', label: 'None' }, ...head.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` }))]
  const set = (k: keyof CsvMap, v: string) => st.setCsv((c) => (c ? { ...c, map: { ...c.map, [k]: v === '-1' ? undefined : +v } } : c))
  const split = map.debit != null && map.credit != null
  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface-2/40 p-3">
      <Label className="mb-0">CSV columns</Label>
      <label className="block text-xs text-muted">Date<Select value={String(map.date)} onChange={(v) => set('date', v)} options={opts.slice(1)} /></label>
      <label className="block text-xs text-muted">Description<Select value={String(map.description)} onChange={(v) => set('description', v)} options={opts.slice(1)} /></label>
      {split ? <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-muted">Money out<Select value={String(map.debit)} onChange={(v) => set('debit', v)} options={opts} /></label>
        <label className="block text-xs text-muted">Money in<Select value={String(map.credit)} onChange={(v) => set('credit', v)} options={opts} /></label>
      </div> : <label className="block text-xs text-muted">Amount<Select value={String(map.amount ?? -1)} onChange={(v) => set('amount', v)} options={opts} /></label>}
      <label className="block text-xs text-muted">Dates are<Select value={map.dayFirst ? 'd' : 'm'} onChange={(v) => st.setCsv((c) => (c ? { ...c, map: { ...c.map, dayFirst: v === 'd' } } : c))} options={[{ value: 'd', label: 'Day first (31/12/2026)' }, { value: 'm', label: 'Month first (12/31/2026)' }]} /></label>
      <button type="button" className="text-xs text-accent hover:underline cursor-pointer" onClick={() => st.setCsv((c) => (c ? { ...c, map: split ? { ...c.map, debit: undefined, credit: undefined, amount: c.map.debit } : { ...c.map, amount: undefined, debit: c.map.amount ?? 0, credit: (c.map.amount ?? 0) + 1 } } : c))}>{split ? 'Use one amount column' : 'Use separate in and out columns'}</button>
    </div>
  )
}

export function TxnTable({ txns, currency, extra, max = 300 }: { txns: Txn[]; currency?: string; extra?: { head: string; cell: (t: Txn, i: number) => React.ReactNode }; max?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <div className="max-h-[28rem] overflow-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Description</th>{extra && <th className="px-3 py-2">{extra.head}</th>}<th className="px-3 py-2 text-right">Amount</th></tr></thead>
          <tbody>{txns.slice(0, max).map((t, i) => (
            <tr key={i} className="border-t border-border">
              <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">{t.date}</td>
              <td className="max-w-[18rem] truncate px-3 py-1.5" title={t.description}>{t.description || <span className="text-muted">(no description)</span>}</td>
              {extra && <td className="px-3 py-1.5">{extra.cell(t, i)}</td>}
              <td className={cn('whitespace-nowrap px-3 py-1.5 text-right font-mono tabular-nums', t.amount < 0 ? 'text-fg' : 'text-success')}>{fmtMoney(t.amount, currency)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {txns.length > max && <p className="border-t border-border bg-surface-2/40 px-3 py-1.5 text-xs text-muted">Showing {max} of {txns.length}. Downloads include every row.</p>}
    </div>
  )
}

/** Simple grouped bar chart (two series) as SVG. */
export function BarPair({ data, a, b, labelA, labelB, height = 160 }: { data: { label: string; a: number; b: number }[]; a: string; b: string; labelA: string; labelB: string; height?: number }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]))
  const W = Math.max(280, data.length * 46)
  return (
    <figure className="overflow-x-auto rounded-2xl border border-border bg-surface p-3">
      <svg viewBox={`0 0 ${W} ${height + 24}`} className="h-auto w-full min-w-[280px]" role="img" aria-label={`${labelA} and ${labelB} by month`}>
        {data.map((d, i) => {
          const x = i * 46 + 8, ha = (d.a / max) * height, hb = (d.b / max) * height
          return <g key={d.label}><rect x={x} y={height - ha} width="16" height={ha} rx="3" fill={a}><title>{`${d.label} ${labelA}: ${d.a.toFixed(2)}`}</title></rect><rect x={x + 18} y={height - hb} width="16" height={hb} rx="3" fill={b}><title>{`${d.label} ${labelB}: ${d.b.toFixed(2)}`}</title></rect><text x={x + 17} y={height + 16} textAnchor="middle" fontSize="10" fill="currentColor" opacity=".6">{d.label}</text></g>
        })}
      </svg>
      <figcaption className="mt-1 flex gap-4 text-xs text-muted"><span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: a }} />{labelA}</span><span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: b }} />{labelB}</span></figcaption>
    </figure>
  )
}

/** Line chart for one or more series over a shared x axis. */
export function Lines({ series, height = 180, xLabels, label }: { series: { name: string; color: string; values: number[] }[]; height?: number; xLabels?: string[]; label: string }) {
  const n = Math.max(...series.map((s) => s.values.length), 2)
  const all = series.flatMap((s) => s.values).filter(isFinite)
  const min = Math.min(0, ...all), max = Math.max(1, ...all)
  const W = 600, H = height
  const x = (i: number) => 30 + (i / (n - 1)) * (W - 40), y = (v: number) => 8 + (1 - (v - min) / (max - min || 1)) * (H - 28)
  return (
    <figure className="rounded-2xl border border-border bg-surface p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
        {[0, 0.5, 1].map((f) => <line key={f} x1="30" x2={W - 10} y1={8 + f * (H - 28)} y2={8 + f * (H - 28)} stroke="currentColor" strokeOpacity=".1" />)}
        {series.map((s) => <polyline key={s.name} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" points={s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} />)}
        {xLabels && xLabels.map((l, i) => (i % Math.ceil(xLabels.length / 8) === 0 || i === xLabels.length - 1) && <text key={i} x={x(i)} y={H - 4} fontSize="10" textAnchor="middle" fill="currentColor" opacity=".6">{l}</text>)}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-4 text-xs text-muted">{series.map((s) => <span key={s.name} className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: s.color }} />{s.name}</span>)}</figcaption>
    </figure>
  )
}

export const ACTIVITY_ACCEPT = '.fit,.tcx,.gpx'

export function useActivity() {
  const [file, setFile] = useState<File | null>(null)
  const [act, setAct] = useState<Activity | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = async (f: File) => {
    setError(null); setAct(null); setFile(f)
    try { setAct(readActivity(f.name, new Uint8Array(await f.arrayBuffer()))) } catch (e: any) { setError(e?.message || String(e)) }
  }
  return { file, act, error, load, reset: () => { setFile(null); setAct(null); setError(null) } }
}
