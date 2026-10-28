import { Fragment, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeftRight, ArrowRight, ArrowLeft, Columns2, Rows3, FileDiff, Trash2, ChevronsUpDown } from 'lucide-react'
import { Button, Segmented, Switch, CopyButton, cn } from '@/components/ui'
import { Pane, Stat, OpenFileButton, useLib, useTextDrop, downloadText, useDebounced } from '@/tools/dev/_dev/kit'

type Row = { t: 'eq' | 'del' | 'add' | 'mod'; a?: number; b?: number; at?: string; bt?: string; hunk?: number }
type Hunk = { aS: number; aE: number; bS: number; bE: number }
type Gran = 'line' | 'word' | 'char'

const A0 = `function greet(name) {
  const message = "Hello, " + name;
  console.log(message);
  return message;
}

const users = ["Ada", "Alan", "Grace"];
users.forEach(greet);
// TODO: add tests`
const B0 = `function greet(name, punctuation = "!") {
  const message = \`Hello, \${name}\${punctuation}\`;
  console.log(message);
  return message;
}

const users = ["Ada", "Alan", "Grace", "Linus"];
users.forEach((u) => greet(u));
export default greet;`

export default function DiffChecker() {
  const D = useLib('diff', () => import('diff'))
  const [a, setA] = useState(A0)
  const [b, setB] = useState(B0)
  const [view, setView] = useState<'split' | 'unified'>('split')
  const [gran, setGran] = useState<Gran>('word')
  const [ignWs, setIgnWs] = useState(false)
  const [ignCase, setIgnCase] = useState(false)
  const [collapse, setCollapse] = useState(true)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const da = useDebounced(a, 150), db = useDebounced(b, 150)
  const dropA = useTextDrop((t) => setA(t)), dropB = useTextDrop((t) => setB(t))

  const res = useMemo(() => {
    if (!D) return null
    const al = da.split('\n'), bl = db.split('\n')
    const norm = (s: string) => { let x = s; if (ignWs) x = x.replace(/\s+/g, ' ').trim(); if (ignCase) x = x.toLowerCase(); return x }
    const ch = D.diffArrays(al, bl, { comparator: (x: string, y: string) => norm(x) === norm(y) })
    const rows: Row[] = []; const hunks: Hunk[] = []
    let ai = 0, bi = 0, adds = 0, dels = 0, mods = 0, same = 0
    for (let k = 0; k < ch.length; k++) {
      const c = ch[k]; const n = c.count ?? c.value.length
      if (!c.added && !c.removed) { for (let j = 0; j < n; j++) rows.push({ t: 'eq', a: ai + j, b: bi + j, at: al[ai + j], bt: bl[bi + j] }); ai += n; bi += n; same += n; continue }
      // gather a removed block followed by an added block (or vice versa) into one hunk
      let rem = 0, add = 0
      if (c.removed) { rem = n; if (ch[k + 1]?.added) { add = ch[k + 1].count ?? ch[k + 1].value.length; k++ } }
      else { add = n; if (ch[k + 1]?.removed) { rem = ch[k + 1].count ?? ch[k + 1].value.length; k++ } }
      const h = hunks.length; hunks.push({ aS: ai, aE: ai + rem, bS: bi, bE: bi + add })
      const pairs = Math.min(rem, add)
      for (let j = 0; j < Math.max(rem, add); j++) {
        if (j < pairs) { rows.push({ t: 'mod', a: ai + j, b: bi + j, at: al[ai + j], bt: bl[bi + j], hunk: h }); mods++ }
        else if (j < rem) { rows.push({ t: 'del', a: ai + j, at: al[ai + j], hunk: h }); dels++ }
        else { rows.push({ t: 'add', b: bi + j, bt: bl[bi + j], hunk: h }); adds++ }
      }
      ai += rem; bi += add
    }
    const total = Math.max(al.length, bl.length) || 1
    return { rows, hunks, adds, dels, mods, same, sim: Math.round((same / total) * 100) }
  }, [D, da, db, ignWs, ignCase])

  const inline = (x: string, y: string, side: 'a' | 'b') => {
    if (!D || gran === 'line') return side === 'a' ? x : y
    const parts = gran === 'char' ? D.diffChars(x, y, { ignoreCase: ignCase }) : D.diffWordsWithSpace(x, y, { ignoreCase: ignCase } as any)
    return (parts ?? []).map((p: any, i: number) => p.added ? (side === 'b' ? <mark key={i} className="rounded-sm bg-success/35 text-inherit">{p.value}</mark> : null)
      : p.removed ? (side === 'a' ? <mark key={i} className="rounded-sm bg-danger/35 text-inherit">{p.value}</mark> : null)
      : <span key={i}>{p.value}</span>)
  }

  const applyHunk = (h: Hunk, dir: 'toB' | 'toA') => {
    const al = a.split('\n'), bl = b.split('\n')
    if (dir === 'toB') setB([...bl.slice(0, h.bS), ...al.slice(h.aS, h.aE), ...bl.slice(h.bE)].join('\n'))
    else setA([...al.slice(0, h.aS), ...bl.slice(h.bS, h.bE), ...al.slice(h.aE)].join('\n'))
  }

  // collapse long unchanged stretches (keep 3 lines of context)
  const visible = useMemo(() => {
    if (!res) return [] as (Row | { gap: number; from: number; count: number })[]
    if (!collapse) return res.rows
    const out: (Row | { gap: number; from: number; count: number })[] = []
    const rows = res.rows; let i = 0, g = 0
    while (i < rows.length) {
      if (rows[i].t !== 'eq') { out.push(rows[i]); i++; continue }
      let j = i; while (j < rows.length && rows[j].t === 'eq') j++
      const len = j - i, startCtx = i === 0 ? 0 : 3, endCtx = j === rows.length ? 0 : 3
      if (len > startCtx + endCtx + 2 && !expanded.has(i)) {
        for (let k = i; k < i + startCtx; k++) out.push(rows[k])
        out.push({ gap: g++, from: i, count: len - startCtx - endCtx })
        for (let k = j - endCtx; k < j; k++) out.push(rows[k])
      } else for (let k = i; k < j; k++) out.push(rows[k])
      i = j
    }
    return out
  }, [res, collapse, expanded])

  const patch = () => D ? D.createTwoFilesPatch('original', 'modified', a, b, '', '', { context: 3 }) : ''
  const firstOfHunk = new Set<number>()
  if (res) { const seen = new Set<number>(); res.rows.forEach((r, i) => { if (r.hunk !== undefined && !seen.has(r.hunk)) { seen.add(r.hunk); firstOfHunk.add(i) } }) }
  const rowIndex = new Map<Row, number>(); res?.rows.forEach((r, i) => rowIndex.set(r, i))

  const numCls = 'w-10 shrink-0 select-none pr-2 text-right text-[11px] text-muted/70'
  const bg = (t: Row['t'], side: 'a' | 'b') => t === 'eq' ? '' : t === 'mod' ? (side === 'a' ? 'bg-danger/10' : 'bg-success/10') : t === 'del' ? (side === 'a' ? 'bg-danger/15' : 'bg-surface-2/40') : (side === 'b' ? 'bg-success/15' : 'bg-surface-2/40')

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
        <Pane title="Original" className={cn(dropA.over && 'ring-2 ring-accent')} actions={<><OpenFileButton onText={(t) => setA(t)} /><Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setA('')} aria-label="Clear" /></>}>
          <textarea {...dropA.props} value={a} onChange={(e) => setA(e.target.value)} spellCheck={false} placeholder="Paste or drop the original text…" className="scrollbar-thin h-56 w-full resize-y bg-transparent p-3 font-mono text-[13px] leading-5 outline-none" />
        </Pane>
        <div className="flex items-center justify-center"><Button variant="outline" size="sm" icon={<ArrowLeftRight className="size-4" />} onClick={() => { setA(b); setB(a) }}>Swap</Button></div>
        <Pane title="Modified" className={cn(dropB.over && 'ring-2 ring-accent')} actions={<><OpenFileButton onText={(t) => setB(t)} /><Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setB('')} aria-label="Clear" /></>}>
          <textarea {...dropB.props} value={b} onChange={(e) => setB(e.target.value)} spellCheck={false} placeholder="Paste or drop the changed text…" className="scrollbar-thin h-56 w-full resize-y bg-transparent p-3 font-mono text-[13px] leading-5 outline-none" />
        </Pane>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-3">
        <Segmented value={view} onChange={setView} options={[{ value: 'split', label: <span className="flex items-center gap-1.5"><Columns2 className="size-3.5" />Side by side</span> }, { value: 'unified', label: <span className="flex items-center gap-1.5"><Rows3 className="size-3.5" />Unified</span> }]} />
        <Segmented value={gran} onChange={setGran} options={[{ value: 'line', label: 'Lines' }, { value: 'word', label: 'Words' }, { value: 'char', label: 'Chars' }]} />
        <Switch checked={ignWs} onChange={setIgnWs} label="Ignore whitespace" />
        <Switch checked={ignCase} onChange={setIgnCase} label="Ignore case" />
        <Switch checked={collapse} onChange={(v) => { setCollapse(v); setExpanded(new Set()) }} label="Collapse unchanged" />
        <div className="ml-auto flex gap-1"><CopyButton text={patch} label="Copy patch" variant="ghost" /><Button size="sm" variant="ghost" icon={<FileDiff className="size-4" />} onClick={() => downloadText(patch(), 'changes.diff')}>.diff</Button></div>
      </div>

      {res && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label="Additions" value={<span className="text-success">+{res.adds + res.mods}</span>} />
          <Stat label="Deletions" value={<span className="text-danger">−{res.dels + res.mods}</span>} />
          <Stat label="Changed blocks" value={res.hunks.length} />
          <Stat label="Unchanged lines" value={res.same} />
          <Stat label="Similarity" value={`${res.sim}%`} sub={<span className="block h-1 overflow-hidden rounded bg-surface-2"><span className="block h-full bg-gradient-brand" style={{ width: res.sim + '%' }} /></span>} />
        </div>
      )}

      {res && res.hunks.length === 0 && (a || b) && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-success/30 bg-success/5 p-6 text-center text-sm text-success">The two texts are identical{ignWs || ignCase ? ' (with the current ignore options)' : ''}.</motion.div>}

      {res && res.hunks.length > 0 && (
        <div className="scrollbar-thin overflow-x-auto rounded-2xl border border-border bg-surface font-mono text-[13px] leading-6">
          {visible.map((r, vi) => {
            if ('gap' in r) return (
              <button key={'g' + r.gap} onClick={() => setExpanded((s) => new Set(s).add(r.from))} className="flex w-full items-center justify-center gap-2 border-y border-border bg-surface-2/50 py-1 text-xs text-muted hover:text-accent">
                <ChevronsUpDown className="size-3.5" />Show {r.count} unchanged lines
              </button>
            )
            const idx = rowIndex.get(r)!; const h = r.hunk !== undefined ? res.hunks[r.hunk] : null; const first = firstOfHunk.has(idx)
            if (view === 'unified') {
              const lines: { s: '-' | '+' | ' '; n: [number | undefined, number | undefined]; text: React.ReactNode; cls: string }[] = []
              if (r.t === 'eq') lines.push({ s: ' ', n: [r.a, r.b], text: r.at, cls: '' })
              if (r.t === 'del' || r.t === 'mod') lines.push({ s: '-', n: [r.a, undefined], text: r.t === 'mod' ? inline(r.at!, r.bt!, 'a') : r.at, cls: 'bg-danger/10' })
              if (r.t === 'add' || r.t === 'mod') lines.push({ s: '+', n: [undefined, r.b], text: r.t === 'mod' ? inline(r.at!, r.bt!, 'b') : r.bt, cls: 'bg-success/10' })
              return <Fragment key={vi}>{lines.map((l, k) => (
                <div key={k} className={cn('flex min-w-max', l.cls)}>
                  <span className={numCls}>{l.n[0] !== undefined ? l.n[0] + 1 : ''}</span><span className={numCls}>{l.n[1] !== undefined ? l.n[1] + 1 : ''}</span>
                  <span className={cn('w-5 shrink-0 select-none text-center', l.s === '-' ? 'text-danger' : l.s === '+' ? 'text-success' : 'text-muted')}>{l.s}</span>
                  <span className="whitespace-pre pr-4">{l.text || ' '}</span>
                </div>
              ))}</Fragment>
            }
            return (
              <div key={vi} className="grid min-w-[720px] grid-cols-[1fr_28px_1fr]">
                <div className={cn('flex min-w-0', bg(r.t, 'a'))}><span className={numCls}>{r.a !== undefined ? r.a + 1 : ''}</span><span className="min-w-0 flex-1 whitespace-pre-wrap break-all pr-2">{r.t === 'mod' ? inline(r.at!, r.bt!, 'a') : r.at ?? ''}</span></div>
                <div className="flex items-start justify-center border-x border-border bg-surface-2/30">
                  {first && h && <div className="flex flex-col"><button title="Copy this change to the right" onClick={() => applyHunk(h, 'toB')} className="rounded p-0.5 text-muted hover:bg-accent/15 hover:text-accent"><ArrowRight className="size-3.5" /></button>
                    <button title="Copy this change to the left" onClick={() => applyHunk(h, 'toA')} className="rounded p-0.5 text-muted hover:bg-accent/15 hover:text-accent"><ArrowLeft className="size-3.5" /></button></div>}
                </div>
                <div className={cn('flex min-w-0', bg(r.t, 'b'))}><span className={numCls}>{r.b !== undefined ? r.b + 1 : ''}</span><span className="min-w-0 flex-1 whitespace-pre-wrap break-all pr-2">{r.t === 'mod' ? inline(r.at!, r.bt!, 'b') : r.bt ?? ''}</span></div>
              </div>
            )
          })}
        </div>
      )}
      {!D && <div className="text-sm text-muted">Loading diff engine…</div>}
    </div>
  )
}
