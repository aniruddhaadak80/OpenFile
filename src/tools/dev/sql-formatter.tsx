import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Wand2, Minimize2, AlertTriangle, FileCode2, Database } from 'lucide-react'
import { Button, Card, Field, Select, Segmented, Slider, Switch, CopyButton, cn } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { CodeArea, CodeView, Pane, OpenFileButton, DownloadButton, useLib, useStored, useDebounced, useTextDrop } from './_dev/kit'

const DIALECTS: { value: string; label: string }[] = [
  { value: 'sql', label: 'Standard SQL' }, { value: 'postgresql', label: 'PostgreSQL' }, { value: 'mysql', label: 'MySQL' }, { value: 'mariadb', label: 'MariaDB' },
  { value: 'sqlite', label: 'SQLite' }, { value: 'transactsql', label: 'SQL Server (T-SQL)' }, { value: 'plsql', label: 'Oracle PL/SQL' }, { value: 'bigquery', label: 'BigQuery' },
  { value: 'snowflake', label: 'Snowflake' }, { value: 'redshift', label: 'Amazon Redshift' }, { value: 'duckdb', label: 'DuckDB' }, { value: 'clickhouse', label: 'ClickHouse' },
  { value: 'spark', label: 'Spark SQL' }, { value: 'hive', label: 'Hive' }, { value: 'trino', label: 'Trino / Presto' }, { value: 'db2', label: 'IBM Db2' }, { value: 'db2i', label: 'Db2 for i' },
  { value: 'singlestoredb', label: 'SingleStore' }, { value: 'tidb', label: 'TiDB' }, { value: 'n1ql', label: 'Couchbase N1QL' },
]

const SAMPLE = `with active_users as (select u.id, u.name, u.email, count(o.id) as orders, sum(o.total) as revenue from users u left join orders o on o.user_id = u.id and o.status = 'paid' where u.created_at >= '2026-01-01' and (u.country = 'IN' or u.country = 'US') group by u.id, u.name, u.email having count(o.id) > 2) select name, email, orders, round(revenue, 2) as revenue, case when revenue > 1000 then 'gold' when revenue > 250 then 'silver' else 'bronze' end as tier from active_users order by revenue desc limit 50;
-- second statement
update products set price = price * 1.1, updated_at = now() where category_id in (select id from categories where slug = 'books');`

/** Strip comments (outside strings) and collapse whitespace; string literals are never touched. */
function minify(sql: string) {
  const seg: { s: boolean; t: string }[] = []
  let buf = '', i = 0
  const flush = () => { if (buf) seg.push({ s: false, t: buf }); buf = '' }
  while (i < sql.length) {
    const c = sql[i], n = sql[i + 1]
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1
      while (j < sql.length) { if (sql[j] === '\\') { j += 2; continue } if (sql[j] === c) { if (sql[j + 1] === c) { j += 2; continue } break } j++ }
      flush(); seg.push({ s: true, t: sql.slice(i, j + 1) }); i = j + 1; continue
    }
    if (c === '-' && n === '-') { while (i < sql.length && sql[i] !== '\n') i++; buf += ' '; continue }
    if (c === '/' && n === '*') { const e = sql.indexOf('*/', i + 2); i = e < 0 ? sql.length : e + 2; buf += ' '; continue }
    buf += c; i++
  }
  flush()
  return seg.map((x) => (x.s ? x.t : x.t.replace(/\s+/g, ' ').replace(/\s*([(),;=<>])\s*/g, '$1').replace(/;/g, ';\n'))).join('').replace(/\n+$/, '').trim()
}

type Case = 'preserve' | 'upper' | 'lower'

export default function SqlFormatter() {
  const lib = useLib('sql-formatter', () => import('sql-formatter'))
  const [input, setInput] = useStored('sql-formatter:input', SAMPLE)
  const [dialect, setDialect] = useStored('sql-formatter:dialect', 'postgresql')
  const [mode, setMode] = useState<'format' | 'minify'>('format')
  const [kw, setKw] = useState<Case>('upper')
  const [dt, setDt] = useState<Case>('upper')
  const [fn, setFn] = useState<Case>('preserve')
  const [indent, setIndent] = useState<'2' | '4' | 'tab'>('2')
  const [style, setStyle] = useState<'standard' | 'tabularLeft' | 'tabularRight'>('standard')
  const [logical, setLogical] = useState<'before' | 'after'>('before')
  const [width, setWidth] = useState(50)
  const [lines, setLines] = useState(1)
  const [dense, setDense] = useState(false)
  const [semi, setSemi] = useState(false)
  const dIn = useDebounced(input, 150)
  const drop = useTextDrop((t) => setInput(t))

  const res = useMemo(() => {
    if (!dIn.trim()) return null
    if (mode === 'minify') return { out: minify(dIn) }
    if (!lib) return null
    try {
      return { out: lib.format(dIn, { language: dialect as any, keywordCase: kw, dataTypeCase: dt, functionCase: fn, tabWidth: indent === '4' ? 4 : 2, useTabs: indent === 'tab', indentStyle: style, logicalOperatorNewline: logical, expressionWidth: width, linesBetweenQueries: lines, denseOperators: dense, newlineBeforeSemicolon: semi }) }
    } catch (e: any) { return { err: String(e?.message ?? e).split('\n').slice(0, 6).join('\n') } }
  }, [lib, dIn, mode, dialect, kw, dt, fn, indent, style, logical, width, lines, dense, semi])

  const stmts = useMemo(() => (res && 'out' in res ? res.out!.split(/;\s*(?:\n|$)/).filter((s) => s.trim()).length : 0), [res])

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4" {...drop.props}>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={mode} onChange={setMode} options={[{ value: 'format', label: <span className="flex items-center gap-1.5"><Wand2 className="size-3.5" />Beautify</span> }, { value: 'minify', label: <span className="flex items-center gap-1.5"><Minimize2 className="size-3.5" />Minify</span> }]} />
          <div className="ml-auto flex gap-1"><Button size="sm" variant="ghost" icon={<FileCode2 className="size-4" />} onClick={() => setInput(SAMPLE)}>Sample</Button><OpenFileButton accept=".sql,text/*" onText={(t) => setInput(t)} /><Button size="sm" variant="ghost" onClick={() => setInput('')}>Clear</Button></div>
        </div>
        <Pane title="Input SQL" className={cn('h-[300px]', drop.over && 'ring-2 ring-accent')}><CodeArea value={input} onChange={setInput} placeholder="SELECT * FROM …" /></Pane>
        <Pane title={<span className="flex items-center gap-2">{mode === 'format' ? 'Formatted' : 'Minified'}{res && 'out' in res && <span className="font-normal normal-case text-muted">· {stmts} statement{stmts === 1 ? '' : 's'} · {formatBytes(new Blob([res.out!]).size)} (from {formatBytes(new Blob([input]).size)})</span>}</span>}
          className="min-h-[300px]" actions={res && 'out' in res ? <><CopyButton text={res.out!} /><DownloadButton text={res.out!} filename={mode === 'format' ? 'formatted.sql' : 'minified.sql'} /></> : null}>
          {res && 'err' in res ? <div className="flex gap-2 p-4 text-sm text-danger"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><pre className="whitespace-pre-wrap font-mono text-xs">{res.err}{'\n\n'}Tip: try another dialect — syntax like backticks or $1 parameters is dialect-specific.</pre></div>
            : res && 'out' in res ? <motion.div key={mode + dialect} initial={{ opacity: 0 }} animate={{ opacity: 1 }}><CodeView code={res.out!} lang="sql" className="max-h-[600px]" /></motion.div>
            : <div className="grid h-60 place-items-center text-sm text-muted">{lib ? 'Paste SQL above' : 'Loading formatter…'}</div>}
        </Pane>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card className="space-y-4">
          <Field label={<span className="flex items-center gap-1"><Database className="size-3.5" />Dialect</span>}><Select value={dialect} onChange={setDialect} options={DIALECTS} /></Field>
          {mode === 'format' ? <>
            <Field label="Keywords"><Segmented value={kw} onChange={setKw} options={[{ value: 'upper', label: 'UPPER' }, { value: 'lower', label: 'lower' }, { value: 'preserve', label: 'Keep' }]} /></Field>
            <Field label="Data types"><Segmented value={dt} onChange={setDt} options={[{ value: 'upper', label: 'UPPER' }, { value: 'lower', label: 'lower' }, { value: 'preserve', label: 'Keep' }]} /></Field>
            <Field label="Functions"><Segmented value={fn} onChange={setFn} options={[{ value: 'upper', label: 'UPPER' }, { value: 'lower', label: 'lower' }, { value: 'preserve', label: 'Keep' }]} /></Field>
            <Field label="Indent"><Segmented value={indent} onChange={setIndent} options={[{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }, { value: 'tab', label: 'Tab' }]} /></Field>
            <Field label="Indent style"><Select value={style} onChange={setStyle} options={[{ value: 'standard', label: 'Standard' }, { value: 'tabularLeft', label: 'Tabular, left-aligned' }, { value: 'tabularRight', label: 'Tabular, right-aligned' }]} /></Field>
            <Field label="AND / OR placement"><Segmented value={logical} onChange={setLogical} options={[{ value: 'before', label: 'Line start' }, { value: 'after', label: 'Line end' }]} /></Field>
            <Slider label="Inline expression width" value={width} onChange={setWidth} min={20} max={120} suffix=" ch" />
            <Slider label="Blank lines between queries" value={lines} onChange={setLines} min={0} max={4} />
            <Switch checked={dense} onChange={setDense} label="Dense operators (a+b)" />
            <Switch checked={semi} onChange={setSemi} label="Semicolon on its own line" />
          </> : <p className="text-sm text-muted">Removes comments and collapses whitespace while keeping strings intact. One statement per line.</p>}
        </Card>
      </aside>
    </div>
  )
}
