import { useMemo, useState } from 'react'
import { GitPullRequest, Columns2, Rows3 } from 'lucide-react'
import { Button, Segmented, Tabs, Textarea, Label, ErrorNote, cn } from '@/components/ui'
import { OpenButton, Tile } from '@/lib/b14/ui'
import { DlButton } from '@/lib/bcat/kit'
import { parsePatch, applyPatch, type StructuredPatch } from 'diff'

const SAMPLE = `diff --git a/greet.js b/greet.js
--- a/greet.js
+++ b/greet.js
@@ -1,5 +1,6 @@
 function greet(name) {
-  return 'Hello ' + name
+  const who = name || 'friend'
+  return \`Hello, \${who}\`
 }
 
 module.exports = greet
`

type Row = { kind: 'ctx' | 'add' | 'del' | 'hunk'; old?: number; neu?: number; text: string }
function rows(p: StructuredPatch): Row[] {
  const out: Row[] = []
  for (const h of p.hunks) {
    out.push({ kind: 'hunk', text: `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@` })
    let o = h.oldStart, n = h.newStart
    for (const l of h.lines) {
      const c = l[0], t = l.slice(1)
      if (c === '+') out.push({ kind: 'add', neu: n++, text: t })
      else if (c === '-') out.push({ kind: 'del', old: o++, text: t })
      else if (c === ' ') out.push({ kind: 'ctx', old: o++, neu: n++, text: t })
    }
  }
  return out
}
const fname = (p: StructuredPatch) => (p.newFileName && p.newFileName !== '/dev/null' ? p.newFileName : p.oldFileName || 'file').replace(/^[ab]\//, '')

export default function PatchViewer() {
  const [tab, setTab] = useState<'view' | 'apply'>('view')
  const [patch, setPatch] = useState(SAMPLE)
  const [mode, setMode] = useState<'split' | 'unified'>('split')
  const [source, setSource] = useState("function greet(name) {\n  return 'Hello ' + name\n}\n\nmodule.exports = greet\n")
  const parsed = useMemo(() => { try { return { list: parsePatch(patch).filter((p) => p.hunks.length), error: null as string | null } } catch (e: any) { return { list: [], error: e?.message as string } } }, [patch])
  const stats = parsed.list.map((p) => { let a = 0, d = 0; p.hunks.forEach((h) => h.lines.forEach((l) => { if (l[0] === '+') a++; else if (l[0] === '-') d++ })); return { a, d } })
  const applied = useMemo(() => { if (tab !== 'apply' || !parsed.list[0]) return null; const r = applyPatch(source, parsed.list[0], { fuzzFactor: 2 }); return r === false ? null : r }, [tab, source, parsed.list])
  return (
    <div className="space-y-4">
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'view', label: 'View' }, { value: 'apply', label: 'Apply to text' }]} />
      <div className="flex flex-wrap items-center gap-2"><Label>Unified diff or .patch</Label><span className="ml-auto" /><OpenButton accept=".diff,.patch,.txt" onFiles={async (f) => setPatch(await f[0].text())} /></div>
      <Textarea value={patch} onChange={(e) => setPatch(e.target.value)} className="min-h-36 font-mono text-xs" aria-label="Patch" />
      <ErrorNote error={parsed.error} />
      {tab === 'view' ? <>
        <div className="flex flex-wrap items-center gap-3">
          <Tile label="Files" value={parsed.list.length} /><Tile label="Added" value={`+${stats.reduce((s, x) => s + x.a, 0)}`} /><Tile label="Removed" value={`-${stats.reduce((s, x) => s + x.d, 0)}`} />
          <Segmented className="ml-auto" value={mode} onChange={setMode} options={[{ value: 'split', label: <span className="inline-flex items-center gap-1.5"><Columns2 className="size-4" />Side by side</span> }, { value: 'unified', label: <span className="inline-flex items-center gap-1.5"><Rows3 className="size-4" />Unified</span> }]} />
        </div>
        {parsed.list.map((p, i) => <FileDiff key={i} p={p} mode={mode} stat={stats[i]} />)}
        {!parsed.list.length && !parsed.error && <p className="text-sm text-muted">No hunks found. Paste output from git diff or a .patch file.</p>}
      </> : <>
        <div className="grid gap-4 lg:grid-cols-2">
          <div><div className="flex items-center"><Label>Original file</Label><span className="ml-auto" /><OpenButton onFiles={async (f) => setSource(await f[0].text())} /></div><Textarea value={source} onChange={(e) => setSource(e.target.value)} className="min-h-64 font-mono text-xs" aria-label="Original file" /></div>
          <div><div className="flex items-center"><Label>Patched result</Label><span className="ml-auto" />{applied != null && <DlButton name={parsed.list[0] ? fname(parsed.list[0]).split('/').pop()! : 'patched.txt'} data={() => applied}>Download</DlButton>}</div>
            {applied != null ? <pre className="scrollbar-thin min-h-64 overflow-auto rounded-xl border border-success/30 bg-surface p-3 font-mono text-xs">{applied}</pre> : <p className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-warn">The patch does not fit this text. Check that it is the same file and version the patch was made from.</p>}</div>
        </div>
        {parsed.list.length > 1 && <p className="text-xs text-muted">This patch touches {parsed.list.length} files. Only the first ({fname(parsed.list[0])}) is applied here.</p>}
      </>}
      <p className="flex gap-1.5 text-xs text-muted"><GitPullRequest className="size-4 shrink-0" />Read on your device. Nothing is sent to any server.</p>
    </div>
  )
}

function FileDiff({ p, mode, stat }: { p: StructuredPatch; mode: 'split' | 'unified'; stat: { a: number; d: number } }) {
  const rs = rows(p)
  const cls = (k: Row['kind']) => (k === 'add' ? 'bg-success/10' : k === 'del' ? 'bg-danger/10' : k === 'hunk' ? 'bg-surface-2 text-muted' : '')
  const pairs = useMemo(() => {
    if (mode !== 'split') return []
    const out: { l?: Row; r?: Row; hunk?: string }[] = []
    let dels: Row[] = [], adds: Row[] = []
    const flush = () => { for (let i = 0; i < Math.max(dels.length, adds.length); i++) out.push({ l: dels[i], r: adds[i] }); dels = []; adds = [] }
    for (const r of rs) { if (r.kind === 'del') dels.push(r); else if (r.kind === 'add') adds.push(r); else { flush(); if (r.kind === 'hunk') out.push({ hunk: r.text }); else out.push({ l: r, r }) } }
    flush(); return out
  }, [rs, mode])
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-2 text-sm"><span className="font-mono">{fname(p)}</span><span className="ml-auto font-mono text-xs"><span className="text-success">+{stat.a}</span> <span className="text-danger">-{stat.d}</span></span></div>
      <div className="scrollbar-thin max-h-[520px] overflow-auto bg-surface font-mono text-xs">
        {mode === 'unified' ? rs.map((r, i) => <div key={i} className={cn('flex gap-2 px-2 py-0.5', cls(r.kind))}><span className="w-8 shrink-0 text-right text-muted">{r.old ?? ''}</span><span className="w-8 shrink-0 text-right text-muted">{r.neu ?? ''}</span><span className="w-3 shrink-0">{r.kind === 'add' ? '+' : r.kind === 'del' ? '-' : ''}</span><span className="whitespace-pre-wrap break-all">{r.text}</span></div>)
          : pairs.map((pr, i) => pr.hunk ? <div key={i} className="bg-surface-2 px-2 py-0.5 text-muted">{pr.hunk}</div> : (
            <div key={i} className="grid grid-cols-2">
              <div className={cn('flex gap-2 border-r border-border px-2 py-0.5', pr.l ? cls(pr.l.kind === 'ctx' ? 'ctx' : 'del') : 'bg-surface-2/40')}><span className="w-8 shrink-0 text-right text-muted">{pr.l?.old ?? ''}</span><span className="whitespace-pre-wrap break-all">{pr.l?.text ?? ''}</span></div>
              <div className={cn('flex gap-2 px-2 py-0.5', pr.r ? cls(pr.r.kind === 'ctx' ? 'ctx' : 'add') : 'bg-surface-2/40')}><span className="w-8 shrink-0 text-right text-muted">{pr.r?.neu ?? ''}</span><span className="whitespace-pre-wrap break-all">{pr.r?.text ?? ''}</span></div>
            </div>))}
      </div>
    </div>
  )
}
