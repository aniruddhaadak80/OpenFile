import { useMemo, useState } from 'react'
import { ScanSearch } from 'lucide-react'
import { Dropzone, Select, ToolGrid, ErrorNote, Spinner, Label, cn } from '@/components/ui'
import { TopBar } from '@/lib/b4/ui'
import { loadTables, TABLE_ACCEPT, type Table } from '@/lib/b14/tables'
import { profile, correlations, type ColProfile } from '@/lib/b14/data'
import { escapeHtml } from '@/lib/safe'
import { Tile } from '@/lib/b14/ui'
import { DlButton } from '@/lib/bcat/kit'

const fmt = (v: number | string | undefined) => (v == null ? '' : typeof v === 'number' ? (Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 3 })) : v)
const TYPE_COLOR: Record<string, string> = { integer: '#38BDF8', number: '#22D3EE', text: '#F5A524', date: '#10B981', boolean: '#84CC16', empty: '#A3A3A3' }

function Hist({ h }: { h: number[] }) { const m = Math.max(1, ...h); return <div className="flex h-10 items-end gap-0.5" aria-hidden>{h.map((v, i) => <span key={i} className="flex-1 rounded-t bg-accent/70" style={{ height: `${Math.max(3, (v / m) * 100)}%` }} />)}</div> }

export default function DataProfiler() {
  const [file, setFile] = useState<File | null>(null)
  const [tables, setTables] = useState<Table[] | null>(null)
  const [sel, setSel] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const open = async (f: File) => { setFile(f); setErr(null); setBusy(true); try { const t = await loadTables(f); if (!t.length) throw new Error('No data found in this file.'); setTables(t); setSel(0) } catch (e: any) { setErr(e?.message || 'Could not read this file.') } finally { setBusy(false) } }
  const t = tables?.[sel]
  const prof = useMemo(() => (t ? profile(t.header, t.rows) : []), [t])
  const corr = useMemo(() => (t ? correlations(prof, t.header, t.rows, 0.6).slice(0, 10) : []), [t, prof])
  const issues = useMemo(() => { const out: string[] = []; for (const c of prof) { if (c.type === 'empty') out.push(`${c.name} is empty.`); else if (c.nulls / Math.max(1, c.count) > 0.3) out.push(`${c.name} is ${Math.round((c.nulls / c.count) * 100)}% empty.`); if (c.distinct === 1 && c.count > 1) out.push(`${c.name} has the same value in every row.`); if (c.outliers) out.push(`${c.name} has ${c.outliers} outliers outside 1.5 x IQR.`) } if (t) { const seen = new Set<string>(); let d = 0; for (const r of t.rows) { const k = JSON.stringify(r); if (seen.has(k)) d++; else seen.add(k) } if (d) out.push(`${d} rows are exact duplicates.`) } return out }, [prof, t])
  const html = () => `<!doctype html><meta charset="utf-8"><title>Profile of ${escapeHtml(file?.name ?? '')}</title><style>body{font-family:system-ui;margin:24px;color:#1a1c20}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px 8px;text-align:left;font-size:13px}th{background:#f5f3ee}</style><h1>Data profile: ${escapeHtml(file?.name ?? '')}</h1><p>${t?.rows.length ?? 0} rows, ${prof.length} columns</p>${issues.length ? `<h2>Things to check</h2><ul>${issues.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : ''}<table><tr><th>Column</th><th>Type</th><th>Empty</th><th>Distinct</th><th>Min</th><th>Max</th><th>Mean</th><th>Median</th><th>Top values</th></tr>${prof.map((c) => `<tr><td>${escapeHtml(c.name)}</td><td>${c.type}</td><td>${c.nulls}</td><td>${c.distinct}</td><td>${escapeHtml(fmt(c.min))}</td><td>${escapeHtml(fmt(c.max))}</td><td>${escapeHtml(fmt(c.mean))}</td><td>${escapeHtml(fmt(c.median))}</td><td>${c.top.slice(0, 3).map((x) => escapeHtml(`${x.value} (${x.count})`)).join(', ')}</td></tr>`).join('')}</table>`
  if (!file) return <Dropzone accept={TABLE_ACCEPT} onFiles={(f) => open(f[0])} label="Drop a CSV, Excel or JSON file" sub="Get a quick health check of every column: types, empty cells, distinct values, ranges, outliers, duplicates and correlations." />
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => { setFile(null); setTables(null) }} />
        {busy && <Spinner label="Reading the file" />}
        <ErrorNote error={err} />
        {t && <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Tile label="Rows" value={t.rows.length.toLocaleString()} /><Tile label="Columns" value={prof.length} /><Tile label="Empty cells" value={prof.reduce((a, c) => a + c.nulls, 0).toLocaleString()} /><Tile label="Numeric columns" value={prof.filter((c) => c.type === 'integer' || c.type === 'number').length} /></div>
          {issues.length > 0 && <div className="rounded-xl border border-warn/40 bg-warn/5 p-3 text-sm"><div className="mb-1 font-medium">Things to check</div><ul className="list-disc space-y-0.5 pl-5 text-muted">{issues.slice(0, 12).map((i) => <li key={i}>{i}</li>)}</ul></div>}
          <div className="grid gap-3 md:grid-cols-2">{prof.map((c) => <ColCard key={c.name} c={c} />)}</div>
          {corr.length > 0 && <><Label>Strong correlations</Label><div className="space-y-1">{corr.map((x) => <div key={x.a + x.b} className="flex justify-between rounded-lg bg-surface px-3 py-1.5 text-sm"><span>{x.a} and {x.b}</span><span className={cn('font-mono', x.r > 0 ? 'text-success' : 'text-warn')}>{x.r.toFixed(2)}</span></div>)}</div></>}
        </>}
      </>}
      side={<>
        {tables && tables.length > 1 && <Select aria-label="Table" value={String(sel)} onChange={(v) => setSel(+v)} options={tables.map((x, i) => ({ value: String(i), label: x.name }))} />}
        {t && <><DlButton className="w-full" name={`${t.name}-profile.html`} mime="text/html" data={html}>Download HTML report</DlButton><DlButton className="w-full" name={`${t.name}-profile.json`} mime="application/json" data={() => JSON.stringify({ rows: t.rows.length, columns: prof, correlations: corr, issues }, null, 2)}>Download JSON</DlButton></>}
        <p className="flex gap-1.5 text-xs text-muted"><ScanSearch className="size-4 shrink-0" />Types are guessed from the values: 95% numbers makes a number column. Empty, NA, null and dash count as empty.</p>
      </>}
    />
  )
}

function ColCard({ c }: { c: ColProfile }) {
  const filled = c.count ? (c.count - c.nulls) / c.count : 0
  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate font-medium" title={c.name}>{c.name}</span><span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-black" style={{ background: TYPE_COLOR[c.type] }}>{c.type}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-success" style={{ width: `${filled * 100}%` }} /></div>
      <div className="grid grid-cols-3 gap-1 text-xs"><span className="text-muted">Filled <b className="text-fg">{Math.round(filled * 100)}%</b></span><span className="text-muted">Distinct <b className="text-fg">{c.distinct.toLocaleString()}</b></span><span className="text-muted">{c.unique ? <b className="text-success">Unique</b> : `Length ${c.minLen} to ${c.maxLen}`}</span></div>
      {c.hist && <Hist h={c.hist} />}
      {(c.type === 'integer' || c.type === 'number') && <div className="grid grid-cols-3 gap-1 font-mono text-[11px] text-muted"><span>min {fmt(c.min)}</span><span>median {fmt(c.median)}</span><span>max {fmt(c.max)}</span><span>mean {fmt(c.mean)}</span><span>sd {fmt(c.std)}</span><span>{c.outliers ? `${c.outliers} outliers` : ''}</span></div>}
      {c.type === 'date' && <div className="font-mono text-[11px] text-muted">{c.min} to {c.max}</div>}
      {(c.type === 'text' || c.type === 'boolean') && <div className="flex flex-wrap gap-1">{c.top.slice(0, 5).map((x) => <span key={x.value} className="max-w-40 truncate rounded bg-surface-2 px-1.5 py-0.5 text-[11px]" title={x.value}>{x.value} <span className="text-muted">{x.count}</span></span>)}</div>}
    </div>
  )
}
