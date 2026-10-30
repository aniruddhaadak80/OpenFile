import { useMemo, useState } from 'react'
import { FileStack, Download } from 'lucide-react'
import { Button, Dropzone, Field, Segmented, Switch, ToolGrid, ErrorNote, Label, cn } from '@/components/ui'
import { downloadBlob, formatBytes, zipFiles } from '@/lib/files'
import { applyRules, parseRuleList, changedLines, type Rule } from '@/lib/b14/text'
import { RuleEditor, BulkRules, newRule } from '@/lib/b14/rules'
import { OpenButton } from '@/lib/b14/ui'
import { toast } from '@/components/toast'
import { diffLines } from 'diff'

interface Doc { path: string; text: string; size: number }
const looksBinary = (b: Uint8Array) => { const n = Math.min(b.length, 8000); for (let i = 0; i < n; i++) if (b[i] === 0) return true; return false }

export default function MultiFileReplace() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [skipped, setSkipped] = useState(0)
  const [mode, setMode] = useState<'rules' | 'list'>('rules')
  const [rules, setRules] = useState<Rule[]>([newRule()])
  const [list, setList] = useState('')
  const [opts, setOpts] = useState({ regex: false, caseSensitive: false, wholeWord: false })
  const [sel, setSel] = useState(0)
  const [onlyChanged, setOnlyChanged] = useState(true)
  const add = async (files: File[]) => {
    const out: Doc[] = []; let skip = 0
    const dec = new TextDecoder('utf-8')
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) {
        const { unzipSync } = await import('fflate')
        try { const z = unzipSync(new Uint8Array(await f.arrayBuffer())); for (const [p, b] of Object.entries(z)) { if (p.endsWith('/')) continue; if (looksBinary(b)) { skip++; continue } out.push({ path: p, text: dec.decode(b), size: b.length }) } } catch { toast(`Could not open ${f.name}`, 'error') }
        continue
      }
      const b = new Uint8Array(await f.arrayBuffer())
      if (looksBinary(b)) { skip++; continue }
      out.push({ path: (f as any).webkitRelativePath || f.name, text: dec.decode(b), size: b.length })
    }
    setDocs((p) => [...p, ...out]); setSkipped((s) => s + skip)
  }
  const active = mode === 'rules' ? rules : parseRuleList(list, opts)
  const results = useMemo(() => { try { return { list: docs.map((d) => { const r = applyRules(d.text, active); return { ...d, out: r.text, n: r.counts.reduce((a, b) => a + b, 0) } }), error: null as string | null } } catch (e: any) { return { list: [], error: e.message as string } } }, [docs, JSON.stringify(active)])
  const changed = results.list.filter((r) => r.n > 0)
  const cur = results.list[sel]
  const save = async () => {
    const pick = onlyChanged ? changed : results.list
    if (!pick.length) { toast('Nothing to save yet', 'error'); return }
    if (pick.length === 1) { downloadBlob(new Blob([pick[0].out], { type: 'text/plain;charset=utf-8' }), pick[0].path.split('/').pop()!); return }
    downloadBlob(await zipFiles(pick.map((r) => ({ name: r.path, data: r.out }))), 'replaced-files.zip')
  }
  if (!docs.length) return <Dropzone multiple accept=".txt,.md,.csv,.json,.html,.htm,.xml,.js,.ts,.tsx,.jsx,.css,.scss,.yml,.yaml,.ini,.toml,.srt,.vtt,.log,.py,.java,.go,.rs,.php,.rb,.sql,.svg,.zip,text/*" onFiles={add} label="Drop text files or a ZIP" sub="Search and replace across many files at once, with a preview of every change. Binary files are skipped." />
  return (
    <ToolGrid
      main={<>
        <div className="flex flex-wrap items-center gap-2 text-sm"><span className="font-medium">{docs.length} files</span><span className="text-muted">{changed.length} with changes{skipped ? `, ${skipped} binary skipped` : ''}</span><span className="ml-auto" /><OpenButton multiple onFiles={add} label="Add files" /><Button size="sm" variant="ghost" onClick={() => { setDocs([]); setSkipped(0); setSel(0) }}>Start over</Button></div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,16rem)_1fr]">
          <div className="scrollbar-thin max-h-[480px] overflow-auto rounded-xl border border-border bg-surface">
            {results.list.map((r, i) => <button key={i} type="button" onClick={() => setSel(i)} className={cn('flex w-full cursor-pointer items-center gap-2 border-b border-border/60 px-3 py-2 text-left text-xs', i === sel && 'bg-accent/10')}><span className="min-w-0 flex-1 truncate" title={r.path}>{r.path}</span><span className={cn('rounded px-1.5 font-mono', r.n ? 'bg-accent/20 text-fg' : 'text-muted')}>{r.n}</span></button>)}
          </div>
          {cur && <DiffView a={cur.text} b={cur.out} title={`${cur.path} (${formatBytes(cur.size)}, ${changedLines(cur.text, cur.out)} lines changed)`} />}
        </div>
      </>}
      side={<>
        <Field label="Mode"><Segmented value={mode} onChange={setMode} options={[{ value: 'rules', label: 'Rules' }, { value: 'list', label: 'Bulk list' }]} /></Field>
        {mode === 'rules' ? <RuleEditor rules={rules} setRules={setRules} /> : <>
          <BulkRules value={list} onChange={setList} />
          <Switch checked={opts.wholeWord} onChange={(v) => setOpts({ ...opts, wholeWord: v })} label="Whole words only" />
          <Switch checked={opts.caseSensitive} onChange={(v) => setOpts({ ...opts, caseSensitive: v })} label="Match case" />
          <Switch checked={opts.regex} onChange={(v) => setOpts({ ...opts, regex: v })} label="Regular expressions" />
        </>}
        <ErrorNote error={results.error} />
        <Switch checked={onlyChanged} onChange={setOnlyChanged} label="Only download changed files" />
        <Button className="w-full" icon={<Download className="size-4" />} onClick={save} disabled={!changed.length && onlyChanged}>Download {onlyChanged ? changed.length : results.list.length} files</Button>
        <p className="flex gap-1.5 text-xs text-muted"><FileStack className="size-4 shrink-0" />Folders inside a ZIP are kept. Files are read as UTF-8.</p>
      </>}
    />
  )
}

function DiffView({ a, b, title }: { a: string; b: string; title: string }) {
  const parts = useMemo(() => (a === b ? [] : diffLines(a, b)), [a, b])
  let ln = 0
  return (
    <div className="min-w-0 space-y-1">
      <Label>{title}</Label>
      <div className="scrollbar-thin max-h-[450px] overflow-auto rounded-xl border border-border bg-surface font-mono text-xs">
        {!parts.length && <div className="p-4 text-muted">No changes in this file.</div>}
        {parts.map((p, i) => {
          const rows = p.value.replace(/\n$/, '').split('\n')
          if (!p.added && !p.removed) { const start = ln; ln += rows.length; return rows.length > 4 ? <div key={i} className="px-2 py-0.5 text-muted">... {rows.length} unchanged lines from {start + 1}</div> : rows.map((r, k) => <div key={i + '-' + k} className="flex gap-2 px-2 py-0.5"><span className="w-10 shrink-0 text-right text-muted">{start + k + 1}</span><span className="whitespace-pre-wrap break-all">{r}</span></div>) }
          if (p.added) ln += rows.length
          return rows.map((r, k) => <div key={i + '-' + k} className={cn('flex gap-2 px-2 py-0.5', p.added ? 'bg-success/5' : 'bg-danger/5')}><span className={cn('w-10 shrink-0 text-right', p.added ? 'text-success' : 'text-danger')}>{p.added ? '+' : '-'}</span><span className="whitespace-pre-wrap break-all">{r}</span></div>)
        })}
      </div>
    </div>
  )
}
