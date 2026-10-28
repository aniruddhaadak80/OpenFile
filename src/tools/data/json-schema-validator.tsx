import { useEffect, useState } from 'react'
import { FileCode2, Wand2 } from 'lucide-react'
import { Button, Segmented, Switch, Badge } from '@/components/ui'
import { Bar, Status, Pane, CodeArea, OpenFileButton, useStored, useDebounced } from '../dev/_b5/shell'
import { validateJson, JsonError } from '../dev/_dev/jsonParse'
import { inferSchema, withMeta } from '@/lib/b5/schema'

const SCHEMA = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["id", "email", "plan"],
  "properties": {
    "id": { "type": "integer", "minimum": 1 },
    "email": { "type": "string", "format": "email" },
    "plan": { "enum": ["free", "pro", "team"] },
    "tags": { "type": "array", "items": { "type": "string" }, "uniqueItems": true },
    "signup": { "type": "string", "format": "date" }
  },
  "additionalProperties": false
}`
const DATA = `{
  "id": 0,
  "email": "asha@example",
  "plan": "enterprise",
  "tags": ["a", "a"],
  "signup": "2026-10-28",
  "extra": true
}`

type Err = { path: string; msg: string; keyword: string }

function parse(s: string) { try { validateJson(s); return { v: JSON.parse(s) as unknown } } catch (e: any) { return { err: e.message as string, line: e instanceof JsonError ? e.line : null } } }

export default function JsonSchemaValidator() {
  const [schema, setSchema] = useStored('b5:jsv:schema', SCHEMA)
  const [data, setData] = useStored('b5:jsv:data', DATA)
  const [draft, setDraft] = useState<'07' | '2020'>('07')
  const [allErrors, setAllErrors] = useState(true)
  const [strict, setStrict] = useState(false)
  const [res, setRes] = useState<{ ok?: boolean; errors?: Err[]; fatal?: string } | null>(null)
  const ds = useDebounced(schema, 250), dd = useDebounced(data, 250)
  const ps = parse(ds), pd = parse(dd)

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!ds.trim() || !dd.trim() || 'err' in ps || 'err' in pd) { setRes(null); return }
      try {
        const sv = ps.v as any
        const use2020 = draft === '2020' || /2020-12|2019-09/.test(String(sv?.$schema ?? ''))
        const [{ default: Ajv }, { default: addFormats }] = await Promise.all([use2020 ? import('ajv/dist/2020') : import('ajv'), import('ajv-formats')])
        const ajv = new (Ajv as any)({ allErrors, strict, verbose: true })
        ;(addFormats as any)(ajv)
        const validate = ajv.compile(sv)
        const ok = validate(pd.v)
        const errors: Err[] = (validate.errors ?? []).map((e: any) => ({ path: e.instancePath || '/', keyword: e.keyword, msg: e.message + (e.params?.allowedValues ? `: ${e.params.allowedValues.join(', ')}` : e.params?.additionalProperty ? ` (“${e.params.additionalProperty}”)` : '') }))
        if (alive) setRes({ ok, errors })
      } catch (e: any) { if (alive) setRes({ fatal: e?.message || String(e) }) }
    })()
    return () => { alive = false }
  }, [ds, dd, draft, allErrors, strict])

  const infer = () => { if ('v' in pd) setSchema(JSON.stringify(withMeta(inferSchema(pd.v), draft), null, 2)) }

  return (
    <div className="space-y-4">
      <Bar>
        <Segmented value={draft} onChange={setDraft} options={[{ value: '07', label: 'Draft-07' }, { value: '2020', label: 'Draft 2020-12' }]} />
        <Switch checked={allErrors} onChange={setAllErrors} label="Show all errors" />
        <Switch checked={strict} onChange={setStrict} label="Strict schema" />
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="outline" icon={<Wand2 className="size-4" />} onClick={infer} disabled={!('v' in pd)}>Make schema from data</Button>
          <Button size="sm" variant="ghost" icon={<FileCode2 className="size-4" />} onClick={() => { setSchema(SCHEMA); setData(DATA) }}>Sample</Button>
        </div>
      </Bar>
      {'err' in ps && ds.trim() && <Status kind="err">Schema is not valid JSON: {ps.err}</Status>}
      {'err' in pd && dd.trim() && <Status kind="err">Data is not valid JSON: {pd.err}</Status>}
      {res?.fatal && <Status kind="err">The schema itself has a problem: {res.fatal}</Status>}
      {res && !res.fatal && (res.ok ? <Status kind="ok">Valid. The data matches the schema.</Status> : <Status kind="err">{res.errors!.length} problem{res.errors!.length === 1 ? '' : 's'} found.</Status>)}
      {res?.errors && res.errors.length > 0 && (
        <div className="space-y-1.5">
          {res.errors.map((e, i) => <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-border border-l-4 border-l-danger bg-surface px-3 py-2 text-sm"><code className="font-mono text-[13px] font-medium">{e.path}</code><Badge color="#EF4444">{e.keyword}</Badge><span className="text-muted">{e.msg}</span></div>)}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Pane title="JSON Schema" className="h-[480px]" actions={<><OpenFileButton accept=".json,application/json" onText={(t) => setSchema(t)} /><Button size="sm" variant="ghost" onClick={() => setSchema('')}>Clear</Button></>}>
          <CodeArea value={schema} onChange={setSchema} errorLine={'line' in ps ? ps.line : null} />
        </Pane>
        <Pane title="JSON data" className="h-[480px]" actions={<><OpenFileButton accept=".json,application/json" onText={(t) => setData(t)} /><Button size="sm" variant="ghost" onClick={() => setData('')}>Clear</Button></>}>
          <CodeArea value={data} onChange={setData} errorLine={'line' in pd ? pd.line : null} />
        </Pane>
      </div>
    </div>
  )
}
