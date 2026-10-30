import { useRef, useState } from 'react'
import { Database, Play, Download, X } from 'lucide-react'
import { Button, Dropzone, ToolGrid, ErrorNote, Spinner, Label, Badge } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { loadTables, TABLE_ACCEPT } from '@/lib/b14/tables'
import { tableName, columnTypes, sqlIdent } from '@/lib/b14/data'
import { CodeArea, DataTable, cellText } from '../dev/_b5/shell'
import { OpenButton } from '@/lib/b14/ui'
import { toCsv } from '@/lib/bcat/kit'

type SqlJs = { Database: new (data?: Uint8Array) => any }
let sqlP: Promise<SqlJs> | null = null
const loadSql = () => (sqlP ??= (async () => { const [{ default: init }, { default: wasmUrl }] = await Promise.all([import('sql.js'), import('sql.js/dist/sql-wasm-browser.wasm?url')]); return init({ locateFile: () => wasmUrl }) as Promise<SqlJs> })())

interface T { name: string; file: string; cols: { name: string; type: string }[]; rows: number }

export default function SqlOnFiles() {
  const db = useRef<any>(null)
  const taken = useRef(new Set<string>())
  const [tables, setTables] = useState<T[]>([])
  const [sql, setSql] = useState('')
  const [res, setRes] = useState<{ columns: string[]; values: unknown[][]; ms: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const add = async (files: File[]) => {
    setBusy(true); setErr(null)
    try {
      const S = await loadSql()
      db.current ??= new S.Database()
      const added: T[] = []
      for (const f of files) {
        for (const t of await loadTables(f)) {
          const name = tableName(t.name, taken.current)
          const types = columnTypes(t.header, t.rows)
          db.current.run(`CREATE TABLE ${sqlIdent(name)} (${t.header.map((h, i) => `${sqlIdent(h)} ${types[i]}`).join(', ')})`)
          db.current.run('BEGIN')
          const st = db.current.prepare(`INSERT INTO ${sqlIdent(name)} VALUES (${t.header.map(() => '?').join(',')})`)
          for (const r of t.rows) st.run(t.header.map((_, i) => { const v = r[i]; if (v == null || v === '') return null; if (types[i] === 'INTEGER' || types[i] === 'REAL') { const n = Number(String(v).trim()); return Number.isFinite(n) ? n : String(v) } return typeof v === 'boolean' ? String(v) : String(v) }))
          st.free(); db.current.run('COMMIT')
          added.push({ name, file: f.name, cols: t.header.map((h, i) => ({ name: h, type: types[i] })), rows: t.rows.length })
        }
      }
      setTables((p) => { const all = [...p, ...added]; if (!sql && all[0]) setSql(`SELECT *\nFROM ${sqlIdent(all[0].name)}\nLIMIT 100;`); return all })
    } catch (e: any) { setErr(e?.message || 'Could not load the file.'); try { db.current?.run('ROLLBACK') } catch { /* no open transaction */ } } finally { setBusy(false) }
  }
  const run = () => {
    if (!db.current) return
    setErr(null)
    const t0 = performance.now()
    try { const r = db.current.exec(sql); const last = r[r.length - 1]; setRes(last ? { columns: last.columns, values: last.values, ms: performance.now() - t0 } : { columns: ['result'], values: [['Done, no rows returned.']], ms: performance.now() - t0 }) } catch (e: any) { setErr(e?.message || String(e)); setRes(null) }
  }
  const reset = () => { db.current?.close?.(); db.current = null; taken.current.clear(); setTables([]); setRes(null); setSql('') }
  if (!tables.length) return <>{busy ? <Spinner label="Loading the SQL engine and your data" /> : <Dropzone multiple accept={TABLE_ACCEPT} onFiles={add} label="Drop CSV, Excel or JSON files" sub="Each file (and each sheet) becomes a table. Join, filter, group and sum them with SQL, then export the result. Runs on SQLite in your browser." />}<ErrorNote error={err} /></>
  const examples = tables.length > 1 ? [`SELECT a.*, b.*\nFROM ${sqlIdent(tables[0].name)} a\nJOIN ${sqlIdent(tables[1].name)} b ON a.${sqlIdent(tables[0].cols[0].name)} = b.${sqlIdent(tables[1].cols[0].name)}\nLIMIT 100;`] : []
  const t0 = tables[0]
  if (t0.cols.length > 1) examples.push(`SELECT ${sqlIdent(t0.cols[0].name)}, COUNT(*) AS n\nFROM ${sqlIdent(t0.name)}\nGROUP BY 1\nORDER BY n DESC\nLIMIT 20;`)
  return (
    <ToolGrid
      main={<>
        <div className="rounded-2xl border border-border bg-surface">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm font-medium"><Database className="size-4 text-accent" />SQL<span className="ml-auto text-xs text-muted">Ctrl + Enter runs</span></div>
          <div className="h-48"><CodeArea value={sql} onChange={setSql} onKeyDown={(e: React.KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run() } }} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-2"><Button icon={<Play className="size-4" />} onClick={run}>Run</Button>{examples.map((x, i) => <Button key={i} size="sm" variant="ghost" onClick={() => setSql(x)}>{i === 0 && tables.length > 1 ? 'Example: join' : 'Example: group by'}</Button>)}{res && <span className="ml-auto text-xs text-muted">{res.values.length.toLocaleString()} rows in {res.ms.toFixed(0)} ms</span>}</div>
        <ErrorNote error={err} />
        {res && <DataTable columns={res.columns} rows={res.values} className="max-h-[480px]" />}
      </>}
      side={<>
        <Label hint={`${tables.length}`}>Tables</Label>
        <div className="space-y-2">{tables.map((t) => <div key={t.name} className="rounded-xl border border-border bg-surface-2/40 p-2"><button type="button" className="cursor-pointer font-mono text-sm font-semibold text-accent" onClick={() => setSql(`SELECT *\nFROM ${sqlIdent(t.name)}\nLIMIT 100;`)}>{t.name}</button><div className="text-[11px] text-muted">{t.file}, {t.rows.toLocaleString()} rows</div><div className="mt-1 flex flex-wrap gap-1">{t.cols.slice(0, 30).map((c) => <button key={c.name} type="button" onClick={() => setSql((s) => s + (s.endsWith(' ') || !s ? '' : ' ') + sqlIdent(c.name))} className="cursor-pointer rounded bg-surface px-1.5 py-0.5 font-mono text-[10px]" title={`Insert ${c.name}`}>{c.name} <Badge className="ml-0.5">{c.type[0]}</Badge></button>)}</div></div>)}</div>
        <OpenButton multiple accept={TABLE_ACCEPT} onFiles={add} label="Add files" />
        {busy && <Spinner label="Loading" />}
        {res && <div className="grid grid-cols-2 gap-2"><Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob(['\ufeff' + toCsv([res.columns, ...res.values.map((r) => r.map(cellText))])], { type: 'text/csv' }), 'query-result.csv')}>CSV</Button><Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([JSON.stringify(res.values.map((r) => Object.fromEntries(res.columns.map((c, i) => [c, r[i]]))), null, 2)], { type: 'application/json' }), 'query-result.json')}>JSON</Button></div>}
        <Button size="sm" variant="outline" className="w-full" icon={<Download className="size-4" />} onClick={() => db.current && downloadBlob(new Blob([db.current.export()], { type: 'application/vnd.sqlite3' }), 'tables.sqlite')}>Save all as SQLite</Button>
        <Button size="sm" variant="ghost" className="w-full" icon={<X className="size-4" />} onClick={reset}>Start over</Button>
        <p className="text-xs text-muted">Types are guessed per column (INTEGER, REAL, TEXT). Table names come from file names, so sales-2026.csv becomes sales_2026.</p>
      </>}
    />
  )
}
