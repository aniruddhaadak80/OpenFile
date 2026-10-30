import { useMemo, useState } from 'react'
import Papa from 'papaparse'
import { Input, Segmented, Select, Switch, Slider } from '@/components/ui'
import { Bar, Status, TwoPane, useStored, useDebounced, DataTable } from '../dev/_b5/shell'
import { buildSql, inferColumns, jsonToRows, type SqlDialect } from '@/lib/b10/dev'

const SAMPLE = `id,name,email,signup_date,plan,monthly_spend,active
1,Ana Silva,ana@example.com,2024-03-14,pro,29.99,true
2,Ravi Kumar,ravi@example.com,2024-05-02,free,0,true
3,Mei O'Hara,mei@example.com,2023-11-20,team,149.5,false`

export default function SqlDdlGenerator() {
  const [input, setInput] = useStored('b10:ddl:in', SAMPLE)
  const [dialect, setDialect] = useStored<SqlDialect>('b10:ddl:dialect', 'postgres')
  const [table, setTable] = useStored('b10:ddl:table', 'customers')
  const [inserts, setInserts] = useState(true)
  const [snakeCase, setSnake] = useState(true)
  const [drop, setDrop] = useState(false)
  const [batch, setBatch] = useState(100)
  const [pk, setPk] = useState('auto')
  const src = useDebounced(input, 200)
  const parsed = useMemo((): { header: string[]; rows: unknown[][] } | { err: string } | null => {
    const t = src.trim()
    if (!t) return null
    try {
      if (t.startsWith('[') || t.startsWith('{')) return jsonToRows(JSON.parse(t))
      const r = Papa.parse<string[]>(t, { skipEmptyLines: true })
      const [header = [], ...rows] = r.data
      if (!header.length) return { err: 'No header row found' }
      return { header: header.map((h, i) => h.trim() || `column_${i + 1}`), rows }
    } catch (e) { return { err: (e as Error).message } }
  }, [src])
  const data = parsed && !('err' in parsed) ? parsed : null
  const cols = useMemo(() => (data ? inferColumns(data.header, data.rows) : []), [data])
  const pkName = pk === 'auto' ? cols.find((c) => c.unique && !c.nullable && /^(id|.*_id|uuid|key)$/i.test(c.name))?.name : pk === 'none' ? undefined : pk
  const sql = useMemo(() => (data ? buildSql(table || 'my_table', data.header, data.rows, dialect, { snakeCase, primaryKey: pkName, inserts, batch, dropFirst: drop }) : ''), [data, table, dialect, snakeCase, pkName, inserts, batch, drop])

  return (
    <div className="space-y-4">
      <Bar>
        <Segmented value={dialect} onChange={setDialect} options={[{ value: 'postgres', label: 'PostgreSQL' }, { value: 'mysql', label: 'MySQL' }, { value: 'sqlite', label: 'SQLite' }, { value: 'sqlserver', label: 'SQL Server' }]} />
        <Input value={table} onChange={(e) => setTable(e.target.value)} className="h-9 w-40 font-mono" aria-label="Table name" placeholder="table name" />
        <Select aria-label="Primary key" value={pk} onChange={setPk} options={[{ value: 'auto', label: 'Primary key: auto' }, { value: 'none', label: 'No primary key' }, ...cols.map((c) => ({ value: c.name, label: `Primary key: ${c.name}` }))]} className="w-52" />
      </Bar>
      <Bar>
        <Switch checked={snakeCase} onChange={setSnake} label="snake_case names" />
        <Switch checked={inserts} onChange={setInserts} label="INSERT rows" />
        <Switch checked={drop} onChange={setDrop} label="DROP TABLE first" />
        {inserts && <Slider label="Rows per INSERT" value={batch} onChange={setBatch} min={1} max={1000} step={1} className="w-52" />}
      </Bar>
      {parsed && 'err' in parsed && <Status kind="err">Could not read the data: {parsed.err}</Status>}
      <TwoPane input={input} setInput={setInput} inputTitle="CSV, TSV or JSON array" accept=".csv,.tsv,.json,.txt" output={sql} outputLang="sql" outputTitle={`${dialect} SQL`} outName={`${table || 'table'}.sql`} outMime="application/sql" height="h-[440px]" />
      {cols.length > 0 && <DataTable columns={['Column', 'Detected type', 'Nulls', 'Longest', 'Unique']} rows={cols.map((c) => [c.name, c.type, c.nullable ? 'yes' : 'no', String(c.maxLen), c.unique ? 'yes' : 'no'])} />}
    </div>
  )
}
