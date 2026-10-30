import { useMemo, useState } from 'react'
import { ListTree } from 'lucide-react'
import { Field, Input, Segmented, Select, Tabs } from '@/components/ui'
import { flatten, unflatten, recordsToTable, typed } from '@/lib/b14/data'
import { TwoPane, Status } from '../dev/_b5/shell'
import { toCsv } from '@/lib/bcat/kit'

const SAMPLE = JSON.stringify([{ id: 1, name: 'Asha', address: { city: 'Pune', zip: '411001' }, tags: ['vip', 'beta'], orders: [{ sku: 'A1', qty: 2 }] }, { id: 2, name: 'Leo', address: { city: 'Busan', zip: '48058' }, tags: [], orders: [] }], null, 2)

export default function JsonFlattener() {
  const [tab, setTab] = useState<'flat' | 'nest'>('flat')
  const [input, setInput] = useState(SAMPLE)
  const [back, setBack] = useState('id,name,address.city,address.zip,tags.0\n1,Asha,Pune,411001,vip\n2,Leo,Busan,48058,')
  const [sep, setSep] = useState('.')
  const [arrays, setArrays] = useState<'index' | 'join' | 'json'>('index')
  const [out, setOut] = useState<'json' | 'csv'>('csv')
  const res = useMemo(() => {
    try {
      const v = JSON.parse(input)
      const o = { sep: sep || '.', arrays }
      if (out === 'json') return { text: JSON.stringify(Array.isArray(v) ? v.map((x) => flatten(x, o)) : flatten(v, o), null, 2), info: 'Flattened', error: null as string | null }
      const t = recordsToTable(Array.isArray(v) ? v : [v], o)
      return { text: toCsv([t.header, ...t.rows.map((r) => r.map((x) => (x == null ? '' : x)))]), info: `${t.rows.length} rows, ${t.header.length} columns`, error: null }
    } catch (e: any) { return { text: '', info: '', error: 'Input is not valid JSON: ' + (e?.message ?? '') } }
  }, [input, sep, arrays, out])
  const nested = useMemo(() => {
    try {
      const s = back.trim()
      if (s.startsWith('{') || s.startsWith('[')) { const v = JSON.parse(s); return { text: JSON.stringify(Array.isArray(v) ? v.map((x) => unflatten(x, sep || '.')) : unflatten(v, sep || '.'), null, 2), error: null as string | null } }
      const lines = s.split(/\r?\n/).filter(Boolean)
      const split = (l: string) => { const out: string[] = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (q) { if (c === '"') { if (l[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c } else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = '' } else cur += c } out.push(cur); return out }
      const head = split(lines[0] ?? '')
      const recs = lines.slice(1).map((l) => { const c = split(l); return unflatten(Object.fromEntries(head.map((h, i) => [h, typed(c[i] ?? '')]).filter(([, v]) => v !== '')), sep || '.') })
      return { text: JSON.stringify(recs, null, 2), error: null }
    } catch (e: any) { return { text: '', error: e?.message || 'Could not read the input.' } }
  }, [back, sep])
  return (
    <div className="space-y-4">
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'flat', label: 'Flatten JSON' }, { value: 'nest', label: 'Unflatten to nested JSON' }]} />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Key separator"><Input value={sep} onChange={(e) => setSep(e.target.value.slice(0, 3))} className="w-20 font-mono" /></Field>
        {tab === 'flat' && <><Field label="Arrays"><Select value={arrays} onChange={setArrays} options={[{ value: 'index', label: 'One column per item (tags.0)' }, { value: 'join', label: 'Join simple lists (a; b)' }, { value: 'json', label: 'Keep as JSON text' }]} /></Field><Field label="Output"><Segmented value={out} onChange={setOut} options={[{ value: 'csv', label: 'CSV' }, { value: 'json', label: 'Flat JSON' }]} /></Field></>}
      </div>
      {tab === 'flat' ? <>
        <TwoPane inputTitle="Nested JSON" input={input} setInput={setInput} accept=".json,.txt" output={res.text} outputLang={out === 'json' ? 'json' : 'generic'} outputTitle={out === 'csv' ? 'CSV' : 'Flat JSON'} outName={out === 'csv' ? 'flat.csv' : 'flat.json'} outMime={out === 'csv' ? 'text/csv' : 'application/json'} />
        {res.error ? <Status kind="err">{res.error}</Status> : <Status kind="ok">{res.info}. Every nested key becomes a column like address{sep}city, ready for Excel or a database.</Status>}
      </> : <>
        <TwoPane inputTitle="CSV with dotted headers, or flat JSON" input={back} setInput={setBack} accept=".csv,.json,.txt" output={nested.text} outputLang="json" outputTitle="Nested JSON" outName="nested.json" outMime="application/json" />
        {nested.error ? <Status kind="err">{nested.error}</Status> : <Status kind="ok">Numbers, true, false and null are restored. Keys like tags{sep}0 become arrays.</Status>}
      </>}
      <p className="flex gap-1.5 text-xs text-muted"><ListTree className="size-4 shrink-0" />Runs in your browser, nothing is uploaded.</p>
    </div>
  )
}
