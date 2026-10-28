import { useMemo, useState } from 'react'
import { ArrowLeftRight, FileCode2 } from 'lucide-react'
import { Button, Switch, Segmented, CopyButton, Badge, cn } from '@/components/ui'
import { Bar, Status, Pane, CodeArea, OpenFileButton, DownloadButton, useStored, useDebounced } from '../dev/_b5/shell'
import { validateJson, JsonError } from '../dev/_dev/jsonParse'
import { diffJson, dotPath, toPatch, pointer, type Change } from '@/lib/b5/jsondiff'

const A0 = `{
  "name": "openfile",
  "version": "2.3.0",
  "private": true,
  "scripts": { "dev": "vite", "build": "vite build" },
  "keywords": ["pdf", "image", "video"],
  "authors": [{ "name": "Asha", "email": "asha@example.com" }]
}`
const B0 = `{
  "name": "openfile",
  "version": "3.0.0",
  "scripts": { "dev": "vite", "build": "vite build && node post.mjs", "test": "node --test" },
  "keywords": ["pdf", "image", "audio", "video"],
  "authors": [{ "name": "Asha", "email": "asha@openfile.dev" }],
  "license": "MIT"
}`

const short = (v: unknown) => { const s = JSON.stringify(v); return s === undefined ? 'undefined' : s.length > 140 ? s.slice(0, 140) + '…' : s }
const KIND: Record<Change['kind'], { label: string; cls: string; color: string }> = {
  added: { label: 'Added', cls: 'border-l-success', color: '#10B981' },
  removed: { label: 'Removed', cls: 'border-l-danger', color: '#EF4444' },
  changed: { label: 'Changed', cls: 'border-l-warn', color: '#F5A524' },
  type: { label: 'Type changed', cls: 'border-l-sky', color: '#38BDF8' },
}

function parse(src: string) {
  if (!src.trim()) return { v: undefined as unknown, err: null as string | null, line: null as number | null }
  try { validateJson(src); return { v: JSON.parse(src), err: null, line: null } } catch (e: any) { return { v: undefined, err: e.message, line: e instanceof JsonError ? e.line : null } }
}

export default function JsonDiff() {
  const [a, setA] = useStored('b5:jsondiff:a', A0)
  const [b, setB] = useStored('b5:jsondiff:b', B0)
  const [ignoreOrder, setIgnoreOrder] = useState(false)
  const [ignoreCase, setIgnoreCase] = useState(false)
  const [view, setView] = useState<'list' | 'patch'>('list')
  const [filter, setFilter] = useState<'all' | Change['kind']>('all')
  const da = useDebounced(a, 200), db = useDebounced(b, 200)
  const pa = useMemo(() => parse(da), [da]), pb = useMemo(() => parse(db), [db])
  const changes = useMemo(() => (pa.v !== undefined && pb.v !== undefined && !pa.err && !pb.err ? diffJson(pa.v, pb.v, { ignoreOrder, ignoreCase }) : null), [pa, pb, ignoreOrder, ignoreCase])
  const counts = useMemo(() => { const c = { added: 0, removed: 0, changed: 0, type: 0 }; changes?.forEach((x) => c[x.kind]++); return c }, [changes])
  const shown = changes?.filter((c) => filter === 'all' || c.kind === filter) ?? []
  const patch = useMemo(() => (changes ? JSON.stringify(toPatch(changes), null, 2) : ''), [changes])

  return (
    <div className="space-y-4">
      <Bar>
        <Switch checked={ignoreOrder} onChange={setIgnoreOrder} label="Ignore array order" />
        <Switch checked={ignoreCase} onChange={setIgnoreCase} label="Ignore string case" />
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" icon={<ArrowLeftRight className="size-4" />} onClick={() => { setA(b); setB(a) }}>Swap</Button>
          <Button size="sm" variant="ghost" icon={<FileCode2 className="size-4" />} onClick={() => { setA(A0); setB(B0) }}>Sample</Button>
        </div>
      </Bar>
      <div className="grid gap-4 lg:grid-cols-2">
        <Pane title="Original (A)" className="h-[360px]" actions={<><OpenFileButton accept=".json,application/json,text/*" onText={(t) => setA(t)} /><Button size="sm" variant="ghost" onClick={() => setA('')}>Clear</Button></>}>
          <CodeArea value={a} onChange={setA} errorLine={pa.line} placeholder="Paste the first JSON document" />
        </Pane>
        <Pane title="Changed (B)" className="h-[360px]" actions={<><OpenFileButton accept=".json,application/json,text/*" onText={(t) => setB(t)} /><Button size="sm" variant="ghost" onClick={() => setB('')}>Clear</Button></>}>
          <CodeArea value={b} onChange={setB} errorLine={pb.line} placeholder="Paste the second JSON document" />
        </Pane>
      </div>
      {pa.err && <Status kind="err">A is not valid JSON: {pa.err}</Status>}
      {pb.err && <Status kind="err">B is not valid JSON: {pb.err}</Status>}
      {changes && (changes.length === 0 ? <Status kind="ok">No differences. The two documents are the same.</Status> : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={view} onChange={setView} options={[{ value: 'list', label: 'Differences' }, { value: 'patch', label: 'JSON Patch' }]} />
            {view === 'list' && <div className="flex flex-wrap gap-1">
              {(['all', 'added', 'removed', 'changed', 'type'] as const).map((k) => (k === 'all' || counts[k]) ? <button key={k} onClick={() => setFilter(k)} className={cn('rounded-lg border px-2.5 py-1 text-xs', filter === k ? 'border-accent bg-accent/10 text-fg' : 'border-border text-muted hover:text-fg')}>{k === 'all' ? `All ${changes.length}` : `${KIND[k].label} ${counts[k]}`}</button> : null)}
            </div>}
            <div className="ml-auto flex gap-1">{view === 'patch' && <><CopyButton text={patch} variant="ghost" /><DownloadButton text={patch} filename="changes.patch.json" mime="application/json-patch+json" /></>}</div>
          </div>
          {view === 'list' ? (
            <div className="space-y-1.5">
              {shown.slice(0, 1000).map((c, i) => (
                <div key={i} className={cn('rounded-lg border border-border border-l-4 bg-surface px-3 py-2', KIND[c.kind].cls)}>
                  <div className="flex flex-wrap items-center gap-2"><Badge color={KIND[c.kind].color}>{KIND[c.kind].label.toUpperCase()}</Badge><code className="font-mono text-[13px] font-medium">{dotPath(c.path)}</code><span className="ml-auto font-mono text-[10px] text-muted">{pointer(c.path)}</span></div>
                  <div className="mt-1 space-y-0.5 font-mono text-[12px]">
                    {c.kind !== 'added' && <div className="text-danger"><span className="select-none opacity-60">- </span>{short(c.a)}</div>}
                    {c.kind !== 'removed' && <div className="text-success"><span className="select-none opacity-60">+ </span>{short(c.b)}</div>}
                  </div>
                </div>
              ))}
              {shown.length > 1000 && <p className="text-xs text-muted">Showing the first 1000 differences. Use the JSON Patch view to get all of them.</p>}
            </div>
          ) : <pre className="scrollbar-thin max-h-[520px] overflow-auto rounded-2xl border border-border bg-surface p-4 font-mono text-[12px] leading-5">{patch}</pre>}
        </div>
      ))}
    </div>
  )
}
