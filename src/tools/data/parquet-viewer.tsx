import { useMemo, useState } from 'react'
import { Download, Search } from 'lucide-react'
import { Button, Dropzone, Input, Select, Badge, Spinner, Segmented } from '@/components/ui'
import { downloadBlob, baseName, formatBytes } from '@/lib/files'
import { Bar, Status, DataTable, KV, cellText } from '../dev/_b5/shell'
import { loadColumnar, type Loaded } from '@/lib/b5/columnar'

type Fmt = 'csv' | 'json' | 'ndjson' | 'xlsx'

export default function ParquetViewer() {
  const [file, setFile] = useState<File | null>(null)
  const [data, setData] = useState<Loaded | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState(''); const [col, setCol] = useState('all')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<'data' | 'schema'>('data')
  const [fmt, setFmt] = useState<Fmt>('csv')

  const open = async (fs: File[]) => {
    setErr(null); setBusy(true); setFile(fs[0]); setHidden(new Set()); setQ('')
    try { setData(await loadColumnar(new Uint8Array(await fs[0].arrayBuffer()), fs[0].name)) } catch (e: any) { setErr(e?.message || String(e)); setData(null) } finally { setBusy(false) }
  }

  const visibleCols = useMemo(() => data?.columns.filter((c) => !hidden.has(c)) ?? [], [data, hidden])
  const filtered = useMemo(() => {
    if (!data) return []
    if (!q) return data.rows
    const ql = q.toLowerCase()
    return data.rows.filter((r) => (col === 'all' ? data.columns : [col]).some((c) => cellText(r[c]).toLowerCase().includes(ql)))
  }, [data, q, col])

  const exportData = async () => {
    if (!data || !file) return
    const rows = filtered.map((r) => Object.fromEntries(visibleCols.map((c) => [c, r[c]])))
    const name = baseName(file.name)
    const jsonSafe = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x instanceof Uint8Array ? Array.from(x) : x))
    if (fmt === 'json') return downloadBlob(new Blob(['[\n' + rows.map(jsonSafe).join(',\n') + '\n]'], { type: 'application/json' }), `${name}.json`)
    if (fmt === 'ndjson') return downloadBlob(new Blob([rows.map(jsonSafe).join('\n') + '\n'], { type: 'application/x-ndjson' }), `${name}.ndjson`)
    if (fmt === 'csv') { const Papa = (await import('papaparse')).default; return downloadBlob(new Blob([Papa.unparse({ fields: visibleCols, data: rows.map((r) => visibleCols.map((c) => cellText(r[c]))) })], { type: 'text/csv' }), `${name}.csv`) }
    if (rows.length > 1_048_575) throw new Error('Excel sheets hold at most 1,048,576 rows. Filter first or export CSV.')
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet([visibleCols, ...rows.map((r) => visibleCols.map((c) => { const v = r[c]; return v === null || v === undefined ? '' : typeof v === 'object' && !(v instanceof Date) ? cellText(v) : v }))])
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'data')
    downloadBlob(new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })]), `${name}.xlsx`)
  }

  if (!data) return (
    <div className="space-y-3">
      <Dropzone onFiles={open} accept=".parquet,.pq,.arrow,.feather,.ipc,.avro" label="Drop a Parquet, Arrow, Feather or Avro file" sub="Reads Snappy, Gzip, Zstd, Brotli and LZ4 compressed files right in your browser." />
      {busy && <Spinner label="Reading columns…" />}
      {err && <Status kind="err">{err}</Status>}
    </div>
  )

  return (
    <div className="space-y-4">
      <Bar>
        <span className="truncate font-medium">{file?.name}</span><Badge>{data.kind}</Badge>
        <span className="text-xs text-muted">{file && formatBytes(file.size)} · {data.total.toLocaleString()} rows · {data.columns.length} columns{data.rows.length < data.total ? ` · first ${data.rows.length.toLocaleString()} loaded` : ''}</span>
        <Segmented className="ml-auto" value={tab} onChange={setTab} options={[{ value: 'data', label: 'Data' }, { value: 'schema', label: 'Schema' }]} />
        <Button size="sm" variant="ghost" onClick={() => { setData(null); setFile(null) }}>Open another</Button>
      </Bar>
      {tab === 'data' ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter rows" className="w-60 pl-8" aria-label="Filter rows" /></div>
              <Select aria-label="Search in column" value={col} onChange={setCol} options={[{ value: 'all', label: 'All columns' }, ...data.columns.map((c) => ({ value: c, label: c }))]} className="w-48" />
              {q && <span className="text-xs text-muted">{filtered.length.toLocaleString()} matching rows</span>}
            </div>
            <DataTable columns={visibleCols} rows={filtered.map((r) => visibleCols.map((c) => r[c]))} max={1000} className="max-h-[600px]" />
          </div>
          <aside className="space-y-4">
            <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">Export {q ? 'filtered rows' : 'all rows'}</div>
              <Select aria-label="Export format" value={fmt} onChange={setFmt} options={[{ value: 'csv', label: 'CSV' }, { value: 'json', label: 'JSON' }, { value: 'ndjson', label: 'NDJSON' }, { value: 'xlsx', label: 'Excel (XLSX)' }]} />
              <Button className="w-full" icon={<Download className="size-4" />} onClick={() => exportData().catch((e) => setErr(e.message))}>Download</Button>
              {err && <Status kind="err">{err}</Status>}
            </div>
            <div className="space-y-2 rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted">Columns<button className="normal-case text-accent hover:underline" onClick={() => setHidden(new Set())}>Show all</button></div>
              <div className="scrollbar-thin max-h-72 space-y-1 overflow-auto">
                {data.columns.map((c) => <label key={c} className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="accent-[var(--accent)]" checked={!hidden.has(c)} onChange={(e) => { const n = new Set(hidden); e.target.checked ? n.delete(c) : n.add(c); setHidden(n) }} /><span className="truncate">{c}</span></label>)}
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <DataTable columns={['Column', 'Type']} rows={data.schema.map((s) => [s.name, s.type])} />
          <div className="space-y-2">{Object.entries(data.meta).map(([k, v]) => <KV key={k} label={k} value={v} />)}<KV label="Rows" value={data.total.toLocaleString()} /></div>
        </div>
      )}
    </div>
  )
}
