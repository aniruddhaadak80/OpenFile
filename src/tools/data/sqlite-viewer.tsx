import { useEffect, useRef, useState } from 'react'
import { Database, Download, Play, Table2, Eye, FilePlus, Upload, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, Dropzone, Segmented, Badge, Spinner, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { downloadBlob, baseName, formatBytes } from '@/lib/files'
import { Bar, Status, Pane, CodeArea, DataTable, cellText } from '../dev/_b5/shell'
import { readTextFile } from '@/tools/dev/_dev/kit'

type SqlJs = { Database: new (data?: Uint8Array) => any }
let sqlP: Promise<SqlJs> | null = null
function loadSql(): Promise<SqlJs> {
  sqlP ??= (async () => {
    const [{ default: init }, { default: wasmUrl }] = await Promise.all([import('sql.js'), import('sql.js/dist/sql-wasm-browser.wasm?url')])
    return init({ locateFile: () => wasmUrl }) as Promise<SqlJs>
  })()
  return sqlP
}

type Obj = { name: string; type: 'table' | 'view'; sql: string; rows: number | null }
type Result = { columns: string[]; values: unknown[][]; ms: number; changes?: number }
const PAGE = 200
const qi = (s: string) => '"' + s.replace(/"/g, '""') + '"'

export default function SqliteViewer() {
  const [db, setDb] = useState<any>(null)
  const [name, setName] = useState('database')
  const [size, setSize] = useState(0)
  const [objs, setObjs] = useState<Obj[]>([])
  const [cur, setCur] = useState<string | null>(null)
  const [view, setView] = useState<'data' | 'schema' | 'sql'>('data')
  const [page, setPage] = useState(0)
  const [data, setData] = useState<Result | null>(null)
  const [sql, setSql] = useState('SELECT name, type FROM sqlite_master ORDER BY type, name;')
  const [res, setRes] = useState<Result[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const csvRef = useRef<HTMLInputElement>(null)

  const refresh = (d = db) => {
    if (!d) return
    const r = d.exec("SELECT name, type, sql FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name")
    const list: Obj[] = (r[0]?.values ?? []).map(([n, t, s]: any[]) => {
      let rows: number | null = null
      try { rows = Number(d.exec(`SELECT COUNT(*) FROM ${qi(n)}`)[0].values[0][0]) } catch { /* view may fail */ }
      return { name: n, type: t, sql: s ?? '', rows }
    })
    setObjs(list)
    return list
  }

  const open = async (files: File[] | null) => {
    setErr(null); setLoading(true)
    try {
      const SQL = await loadSql()
      let d: any
      if (files) {
        const bytes = new Uint8Array(await files[0].arrayBuffer())
        const head = new TextDecoder().decode(bytes.slice(0, 15))
        if (head !== 'SQLite format 3') throw new Error('This file is not a SQLite 3 database (the header is missing).')
        d = new SQL.Database(bytes); setName(baseName(files[0].name)); setSize(bytes.length)
      } else { d = new SQL.Database(); setName('new-database'); setSize(0) }
      db?.close?.()
      setDb(d)
      const list = refresh(d) ?? []
      setCur(list[0]?.name ?? null); setPage(0); setView(list.length ? 'data' : 'sql'); setRes(null)
    } catch (e: any) { setErr(e.message) } finally { setLoading(false) }
  }

  useEffect(() => {
    if (!db || !cur || view !== 'data') return
    try {
      const t0 = performance.now()
      const r = db.exec(`SELECT * FROM ${qi(cur)} LIMIT ${PAGE} OFFSET ${page * PAGE}`)
      const cols = r[0]?.columns ?? (db.exec(`PRAGMA table_info(${qi(cur)})`)[0]?.values ?? []).map((v: any[]) => v[1])
      setData({ columns: cols, values: r[0]?.values ?? [], ms: performance.now() - t0 })
    } catch (e: any) { setData(null); toast(e.message, 'error') }
  }, [db, cur, page, view])

  const run = () => {
    if (!db) return
    setErr(null)
    try {
      const t0 = performance.now()
      const before = db.getRowsModified?.() ?? 0
      const r = db.exec(sql) as { columns: string[]; values: unknown[][] }[]
      const ms = performance.now() - t0
      setRes(r.length ? r.map((x) => ({ ...x, ms })) : [{ columns: [], values: [], ms, changes: db.getRowsModified?.() ?? before }])
      if (/\b(create|drop|alter|insert|update|delete)\b/i.test(sql)) refresh()
    } catch (e: any) { setErr(e.message); setRes(null) }
  }

  const exportRes = async (r: Result, fmt: 'csv' | 'json') => {
    if (fmt === 'json') return downloadBlob(new Blob([JSON.stringify(r.values.map((v) => Object.fromEntries(r.columns.map((c, i) => [c, v[i] instanceof Uint8Array ? cellText(v[i]) : v[i]]))), null, 2)], { type: 'application/json' }), `${name}-result.json`)
    const Papa = (await import('papaparse')).default
    downloadBlob(new Blob([Papa.unparse({ fields: r.columns, data: r.values.map((v) => v.map(cellText)) })], { type: 'text/csv' }), `${name}-result.csv`)
  }
  const exportTable = async (t: string, fmt: 'csv' | 'json') => {
    const r = db.exec(`SELECT * FROM ${qi(t)}`)[0]
    await exportRes({ columns: r?.columns ?? [], values: r?.values ?? [], ms: 0 }, fmt)
  }
  const importCsv = async (f: File) => {
    const Papa = (await import('papaparse')).default
    const txt = await readTextFile(f); if (txt == null) return
    const p = Papa.parse<string[]>(txt, { skipEmptyLines: true })
    if (p.data.length < 1) return toast('That CSV is empty', 'error')
    const [hdr, ...rows] = p.data
    let t = baseName(f.name).replace(/\W+/g, '_') || 'imported'
    while (objs.some((o) => o.name === t)) t += '_1'
    db.run(`CREATE TABLE ${qi(t)} (${hdr.map((h, i) => qi(h || `col${i + 1}`) + ' TEXT').join(', ')})`)
    const st = db.prepare(`INSERT INTO ${qi(t)} VALUES (${hdr.map(() => '?').join(',')})`)
    db.run('BEGIN'); for (const r of rows) st.run(hdr.map((_, i) => r[i] ?? null)); db.run('COMMIT'); st.free()
    refresh(); setCur(t); setView('data'); setPage(0); toast(`Imported ${rows.length} rows into ${t}`)
  }

  if (!db) return (
    <div className="space-y-4">
      <Dropzone accept=".db,.sqlite,.sqlite3,.db3,.s3db,.sl3" onFiles={open} label="Drop a SQLite database" sub="Opens .db, .sqlite and .sqlite3 files with a real SQLite engine running in your browser." />
      <div className="flex items-center gap-3"><Button variant="outline" size="sm" icon={<FilePlus className="size-4" />} onClick={() => open(null)}>Create an empty database</Button>{loading && <Spinner label="Loading SQLite engine…" />}</div>
      {err && <Status kind="err">{err}</Status>}
    </div>
  )

  const curObj = objs.find((o) => o.name === cur)
  const pages = curObj?.rows != null ? Math.max(1, Math.ceil(curObj.rows / PAGE)) : 1

  return (
    <div className="space-y-4">
      <Bar>
        <Database className="size-4 text-accent" /><span className="font-medium">{name}</span>{size > 0 && <span className="text-xs text-muted">{formatBytes(size)}</span>}
        <Badge>{objs.filter((o) => o.type === 'table').length} tables</Badge>
        <div className="ml-auto flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" icon={<Upload className="size-4" />} onClick={() => csvRef.current?.click()}>Import CSV</Button>
          <input ref={csvRef} type="file" hidden accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importCsv(f).catch((er) => toast(er.message, 'error')) }} />
          <Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([db.export()], { type: 'application/vnd.sqlite3' }), `${name}.sqlite`)}>Save database</Button>
          <Button size="sm" variant="ghost" onClick={() => { db.close(); setDb(null) }}>Close</Button>
        </div>
      </Bar>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <nav className="space-y-1 rounded-2xl border border-border bg-surface p-2" aria-label="Tables">
          {objs.length === 0 && <div className="p-3 text-xs text-muted">No tables yet. Use the SQL tab to create one, or import a CSV.</div>}
          {objs.map((o) => (
            <button key={o.name} onClick={() => { setCur(o.name); setPage(0); if (view === 'sql') setView('data') }} className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition', cur === o.name && view !== 'sql' ? 'bg-accent/15 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
              {o.type === 'view' ? <Eye className="size-4 shrink-0" /> : <Table2 className="size-4 shrink-0" />}
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              {o.rows != null && <span className="font-mono text-[11px]">{o.rows.toLocaleString()}</span>}
            </button>
          ))}
        </nav>

        <div className="min-w-0 space-y-3">
          <Segmented value={view} onChange={setView} options={[{ value: 'data', label: 'Browse data' }, { value: 'schema', label: 'Schema' }, { value: 'sql', label: 'Run SQL' }]} />
          {view === 'data' && curObj && data && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{curObj.name}</span>
                <span className="text-xs text-muted">rows {(page * PAGE + 1).toLocaleString()} to {(page * PAGE + data.values.length).toLocaleString()}{curObj.rows != null ? ` of ${curObj.rows.toLocaleString()}` : ''}</span>
                <div className="ml-auto flex items-center gap-1">
                  <Button size="sm" variant="ghost" icon={<ChevronLeft className="size-4" />} onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous page" />
                  <span className="font-mono text-xs">{page + 1}/{pages}</span>
                  <Button size="sm" variant="ghost" icon={<ChevronRight className="size-4" />} onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} aria-label="Next page" />
                  <Button size="sm" variant="outline" onClick={() => exportTable(curObj.name, 'csv')}>CSV</Button>
                  <Button size="sm" variant="outline" onClick={() => exportTable(curObj.name, 'json')}>JSON</Button>
                </div>
              </div>
              <DataTable columns={data.columns} rows={data.values} className="max-h-[560px]" />
            </>
          )}
          {view === 'schema' && (
            <div className="space-y-3">
              {objs.map((o) => (
                <Pane key={o.name} title={`${o.type} ${o.name}`}>
                  <pre className="scrollbar-thin overflow-auto p-3 font-mono text-[12px] leading-5">{o.sql}</pre>
                </Pane>
              ))}
            </div>
          )}
          {view === 'sql' && (
            <div className="space-y-3">
              <Pane title="SQL" className="h-48" actions={<Button size="sm" icon={<Play className="size-4" />} onClick={run}>Run (Ctrl+Enter)</Button>}>
                <CodeArea value={sql} onChange={setSql} minRows={6} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run() } }} />
              </Pane>
              <div className="flex flex-wrap gap-1.5">
                {objs.slice(0, 6).map((o) => <button key={o.name} onClick={() => setSql(`SELECT * FROM ${qi(o.name)} LIMIT 100;`)} className="rounded-lg border border-border px-2 py-1 font-mono text-[11px] text-muted hover:border-accent hover:text-fg">SELECT * FROM {o.name}</button>)}
              </div>
              {err && <Status kind="err">{err}</Status>}
              {res?.map((r, i) => r.columns.length ? (
                <div key={i} className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted"><span>{r.values.length.toLocaleString()} rows · {r.ms.toFixed(1)} ms</span><div className="ml-auto flex gap-1"><Button size="sm" variant="outline" onClick={() => exportRes(r, 'csv')}>CSV</Button><Button size="sm" variant="outline" onClick={() => exportRes(r, 'json')}>JSON</Button></div></div>
                  <DataTable columns={r.columns} rows={r.values} className="max-h-[480px]" />
                </div>
              ) : <Status key={i} kind="ok">Done in {r.ms.toFixed(1)} ms{r.changes ? `, ${r.changes} rows changed` : ''}. Save the database to keep changes.</Status>)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
