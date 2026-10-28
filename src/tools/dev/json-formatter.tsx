import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronRight, CheckCircle2, AlertTriangle, Wand2, Minimize2, ArrowDownAZ, FileCode2, Trash2, ListTree, Code2, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { Button, Segmented, Switch, CopyButton, cn } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { toast } from '@/components/toast'
import { CodeArea, Pane, Stat, OpenFileButton, DownloadButton, useTextDrop, CodeView, useStored } from './_dev/kit'
import { validateJson, JsonError, sortDeep, jsonStats, pathPart } from './_dev/jsonParse'

const SAMPLE = `{
  "project": "OpenFile",
  "version": "1.0.0",
  "private": true,
  "stars": 4821,
  "rating": 4.9,
  "license": null,
  "maintainers": [
    { "name": "Ada Lovelace", "email": "ada@example.com", "roles": ["owner", "core"] },
    { "name": "Alan Turing", "email": "alan@example.com", "roles": ["core"] }
  ],
  "features": { "pdf": 42, "image": 21, "dev": 20, "offline": true },
  "tags": ["privacy", "wasm", "browser"]
}`

type Indent = '2' | '4' | 'tab'
type View = 'text' | 'tree'

export default function JsonFormatter() {
  const [input, setInput] = useStored('json-formatter:input', '')
  const [indent, setIndent] = useState<Indent>('2')
  const [sortKeys, setSortKeys] = useState(false)
  const [view, setView] = useState<View>('text')
  const [output, setOutput] = useState('')
  const [path, setPath] = useState('$')
  const [treeKey, setTreeKey] = useState(0)
  const [expandAll, setExpandAll] = useState<boolean | null>(null)
  const drop = useTextDrop((t) => { setInput(t); toast('File loaded', 'info') })

  const parsed = useMemo(() => {
    if (!input.trim()) return { ok: false as const, empty: true as const }
    try { validateJson(input); return { ok: true as const, value: JSON.parse(input) } }
    catch (e: any) { return { ok: false as const, error: e as JsonError } }
  }, [input])

  const stats = useMemo(() => (parsed.ok ? jsonStats(parsed.value) : null), [parsed])
  const ind = indent === 'tab' ? '\t' : Number(indent)

  const fmt = (min = false) => {
    if (!parsed.ok) { toast('Fix the JSON error first', 'error'); return }
    const v = sortKeys ? sortDeep(parsed.value) : parsed.value
    const out = min ? JSON.stringify(v) : JSON.stringify(v, null, ind)
    setOutput(out)
    return out
  }

  const err = !parsed.ok && 'error' in parsed ? parsed.error : null
  const errLines = err ? input.split('\n') : []

  return (
    <div className="space-y-4" {...drop.props}>
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-3">
        <Button icon={<Wand2 className="size-4" />} onClick={() => fmt(false)}>Format</Button>
        <Button variant="secondary" icon={<Minimize2 className="size-4" />} onClick={() => fmt(true)}>Minify</Button>
        <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <Segmented value={indent} onChange={setIndent} options={[{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }, { value: 'tab', label: 'Tab' }]} />
        <Switch checked={sortKeys} onChange={setSortKeys} label={<span className="flex items-center gap-1 text-muted"><ArrowDownAZ className="size-4" />Sort keys</span>} />
        <div className="ml-auto flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" icon={<FileCode2 className="size-4" />} onClick={() => { setInput(SAMPLE); setOutput('') }}>Sample</Button>
          <OpenFileButton accept=".json,application/json,text/plain" onText={(t) => { setInput(t); setOutput('') }} />
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => { setInput(''); setOutput('') }}>Clear</Button>
        </div>
      </div>

      {/* status */}
      <motion.div layout className={cn('flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5 text-sm',
        parsed.ok ? 'border-success/30 bg-success/5 text-success' : err ? 'border-danger/30 bg-danger/10 text-danger' : 'border-border bg-surface text-muted', drop.over && 'ring-2 ring-accent')}>
        {parsed.ok ? <><CheckCircle2 className="size-4" /> Valid JSON <span className="text-muted">· {formatBytes(new Blob([input]).size)}</span></>
          : err ? <><AlertTriangle className="size-4 shrink-0" /><span className="font-medium">{err.message}</span></>
          : <>Paste JSON, drop a .json file, or load the sample. Validation is live.</>}
      </motion.div>

      {err && err.line !== undefined && (
        <pre className="scrollbar-thin overflow-x-auto rounded-xl border border-danger/30 bg-surface p-3 font-mono text-xs leading-5">
          {errLines.slice(Math.max(0, err.line - 3), err.line + 1).map((l, k) => {
            const n = Math.max(0, err.line - 3) + k + 1
            return (
              <div key={n} className={cn(n === err.line && 'bg-danger/10')}>
                <span className="inline-block w-10 select-none pr-2 text-right text-muted">{n}</span>{l || ' '}
                {n === err.line && <div><span className="inline-block w-10" />{' '.repeat(Math.max(0, err.col - 1))}<span className="font-bold text-danger">^ here</span></div>}
              </div>
            )
          })}
        </pre>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Pane title="Input" className="h-[520px]" actions={<span className="text-[11px] text-muted">{input.split('\n').length} lines</span>}>
          <CodeArea value={input} onChange={(v) => setInput(v)} errorLine={err?.line ?? null} placeholder='{"paste": "your JSON here"}' />
        </Pane>
        <Pane title={<span className="flex items-center gap-2">Output</span>} className="h-[520px]"
          actions={<>
            <Segmented value={view} onChange={setView} options={[{ value: 'text', label: <span className="flex items-center gap-1"><Code2 className="size-3.5" />Text</span> }, { value: 'tree', label: <span className="flex items-center gap-1"><ListTree className="size-3.5" />Tree</span> }]} />
            {view === 'tree' && <>
              <Button size="sm" variant="ghost" title="Expand all" icon={<ChevronsUpDown className="size-4" />} onClick={() => { setExpandAll(true); setTreeKey((k) => k + 1) }} />
              <Button size="sm" variant="ghost" title="Collapse all" icon={<ChevronsDownUp className="size-4" />} onClick={() => { setExpandAll(false); setTreeKey((k) => k + 1) }} />
            </>}
            {view === 'text' && output && <><CopyButton text={output} /><DownloadButton text={output} filename="formatted.json" mime="application/json" /></>}
          </>}>
          {view === 'text' ? (
            output ? <CodeView code={output} lang="json" className="h-full" />
              : <div className="grid h-full place-items-center p-8 text-center text-sm text-muted">Click <b className="mx-1 text-fg">Format</b> or <b className="mx-1 text-fg">Minify</b> to see the result here.</div>
          ) : parsed.ok ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 font-mono text-xs">
                <span className="text-muted">Path:</span><span className="min-w-0 flex-1 truncate text-accent">{path}</span>
                <CopyButton text={path} label="Copy path" variant="ghost" />
              </div>
              <div key={treeKey} className="scrollbar-thin flex-1 overflow-auto p-3 font-mono text-[13px] leading-6">
                <TreeNode k={null} value={sortKeys ? sortDeep(parsed.value) : parsed.value} path="$" depth={0} onPick={setPath} picked={path} expandAll={expandAll} />
              </div>
            </div>
          ) : <div className="grid h-full place-items-center p-8 text-sm text-muted">The tree appears once the input is valid JSON.</div>}
        </Pane>
      </div>

      {stats && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          <Stat label="Size" value={formatBytes(new Blob([input]).size)} />
          <Stat label="Minified" value={formatBytes(new Blob([JSON.stringify(parsed.ok ? parsed.value : null)]).size)} />
          <Stat label="Depth" value={stats.depth} />
          <Stat label="Keys" value={stats.keys.toLocaleString()} />
          <Stat label="Objects" value={stats.objects.toLocaleString()} />
          <Stat label="Arrays" value={stats.arrays.toLocaleString()} />
          <Stat label="Strings" value={stats.strings.toLocaleString()} />
          <Stat label="Numbers" value={stats.numbers.toLocaleString()} sub={`${stats.booleans} bool · ${stats.nulls} null`} />
        </motion.div>
      )}
    </div>
  )
}

function Prim({ v }: { v: any }) {
  if (v === null) return <span className="text-[#fdba74]">null</span>
  if (typeof v === 'string') return <span className="break-all text-success">"{v}"</span>
  if (typeof v === 'number') return <span className="text-warn">{String(v)}</span>
  return <span className="text-[#fdba74]">{String(v)}</span>
}

function TreeNode({ k, value, path, depth, onPick, picked, expandAll }: { k: string | number | null; value: any; path: string; depth: number; onPick: (p: string) => void; picked: string; expandAll: boolean | null }) {
  const isObj = value !== null && typeof value === 'object'
  const [open, setOpen] = useState(expandAll ?? depth < 2)
  const entries: [string | number, any][] = isObj ? (Array.isArray(value) ? value.map((v, i) => [i, v]) : Object.entries(value)) : []
  const label = k === null ? null : typeof k === 'number' ? <span className="text-muted">{k}</span> : <span className="text-accent">"{k}"</span>
  const sel = picked === path
  const LIMIT = 500
  const [shown, setShown] = useState(LIMIT)
  return (
    <div>
      <div onClick={() => { onPick(path); if (isObj) setOpen(!open) }}
        className={cn('-mx-1 flex cursor-pointer items-start rounded px-1 hover:bg-surface-2', sel && 'bg-accent/10 ring-1 ring-accent/30')}>
        <span className="inline-flex w-4 shrink-0 justify-center pt-1">{isObj && <ChevronRight className={cn('size-3.5 text-muted transition-transform', open && 'rotate-90')} />}</span>
        <span className="min-w-0">
          {label}{label && <span className="text-muted">: </span>}
          {isObj ? (
            <span className="text-muted">{Array.isArray(value) ? '[' : '{'}{!open && <> … {Array.isArray(value) ? ']' : '}'} <span className="text-[11px] opacity-70">{entries.length} {Array.isArray(value) ? 'items' : 'keys'}</span></>}</span>
          ) : <Prim v={value} />}
        </span>
      </div>
      {isObj && open && (
        <div className="ml-[7px] border-l border-border/70 pl-3">
          {entries.slice(0, shown).map(([ck, cv]) => <TreeNode key={String(ck)} k={ck} value={cv} path={path + pathPart(ck)} depth={depth + 1} onPick={onPick} picked={picked} expandAll={expandAll} />)}
          {entries.length > shown && <button className="text-xs text-accent hover:underline" onClick={() => setShown(shown + LIMIT)}>Show {Math.min(LIMIT, entries.length - shown)} more…</button>}
          {entries.length === 0 && <div className="text-xs italic text-muted">empty</div>}
        </div>
      )}
      {isObj && open && <div className="pl-4 text-muted">{Array.isArray(value) ? ']' : '}'}</div>}
    </div>
  )
}
