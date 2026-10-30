/* Step library (search, categories, drag onto the canvas) and the per-step settings drawer with a live preview. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Plus, Copy, Trash2, X, Eye, Info, ArrowRight } from 'lucide-react'
import { Input, Select, Switch, cn } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { CATS, CATALOG, metaOf, kindOf, accepts, type Cat } from '@/pages/workspace/catalog'
import { IN, type Graph, type GNode } from '@/pages/workspace/recipe'
import { STEP_BY_ID, type Item } from '@/pages/workspace/steps'
import type { InFile } from '@/pages/workspace/inputs'
import { CompareSlider, Skeleton, StepIcon, catColor, useMotion } from './kit'

export function StepPalette({ onAdd, searchRef }: { onAdd: (step: string) => void; searchRef?: React.RefObject<HTMLInputElement | null> }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<Cat | 'all'>('all')
  const list = CATALOG.filter((s) => (cat === 'all' || s.cat === cat) && (!q || (s.name + ' ' + s.desc).toLowerCase().includes(q.toLowerCase())))
  const m = useMotion()
  return (
    <div className="rounded-2xl border border-border bg-surface p-3" data-tour="palette">
      <div className="flex items-center gap-2">
        <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><Input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${CATALOG.length} steps (A)`} className="pl-9" aria-label="Search steps" /></div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1" role="tablist" aria-label="Step categories">
        {[{ id: 'all' as const, name: 'All', color: 'var(--accent)' }, ...CATS].map((c) => (
          <button key={c.id} role="tab" aria-selected={cat === c.id} onClick={() => setCat(c.id)} className={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition cursor-pointer', cat === c.id ? 'border-transparent text-on-accent' : 'border-border text-muted hover:text-fg')} style={cat === c.id ? { background: c.color } : undefined}>{c.name}</button>
        ))}
      </div>
      <div className="mt-2 grid max-h-64 grid-cols-1 gap-1.5 overflow-auto pr-1 scrollbar-thin min-[420px]:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {list.map((s, i) => (
          <button key={s.id} style={m === 'full' ? { animationDelay: `${Math.min(i, 12) * 15}ms` } : undefined}
            draggable onDragStart={(e) => { e.dataTransfer.setData('application/x-of-step', s.id); e.dataTransfer.effectAllowed = 'copy' }}
            onClick={() => onAdd(s.id)} title={s.desc}
            className="ws-in group flex items-center gap-2 rounded-xl border border-border bg-surface-2/40 px-2 py-1.5 text-left text-xs transition hover:border-accent/60 hover:bg-accent/5 cursor-pointer">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg" style={{ background: catColor(s.id) + '22', color: catColor(s.id) }}><StepIcon step={s.id} className="size-3.5" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{s.name}</span><span className="block truncate text-[10px] text-muted">{s.desc}</span></span>
            <Plus className="size-3.5 shrink-0 text-muted transition group-hover:text-accent" />
          </button>
        ))}
        {!list.length && <div className="col-span-full p-3 text-center text-xs text-muted">No step matches that.</div>}
      </div>
    </div>
  )
}

/** The steps from the input to `id`, following the first incoming link at each step. */
function pathTo(g: Graph, id: string): GNode[] {
  const by = new Map(g.nodes.map((n) => [n.id, n]))
  const out: GNode[] = []
  let cur = id
  for (let guard = 0; guard < 80 && cur !== IN; guard++) {
    const n = by.get(cur); if (!n) break
    out.unshift(n)
    const e = g.edges.find(([, b]) => b === cur); if (!e) return []
    cur = e[0]
  }
  return cur === IN ? out : []
}

type Preview = { before: Item; after: Item[]; ms: number } | { note: string } | null

function LivePreview({ graph, node, sample }: { graph: Graph; node: GNode; sample?: InFile }) {
  const [pv, setPv] = useState<Preview>(null)
  const [busy, setBusy] = useState(false)
  const tok = useRef(0)
  const path = useMemo(() => pathTo(graph, node.id), [graph, node.id])
  useEffect(() => {
    if (!sample) { setPv({ note: 'Add a file to see a live preview here.' }); return }
    const meta = metaOf(node.step)!
    if (!accepts(meta, sample.kind) && !path.some((n) => metaOf(n.step)?.accepts !== 'any' && accepts(metaOf(n.step)!, sample.kind))) { setPv({ note: `${meta.name} does not change ${sample.kind} files, they pass straight through.` }); return }
    const heavy = path.find((n) => n.enabled && metaOf(n.step)?.heavy)
    if (heavy) { setPv({ note: `${metaOf(heavy.step)!.name} is a slower step, so the preview runs when you press Run.` }); return }
    const my = ++tok.current
    const t = setTimeout(async () => {
      setBusy(true)
      try {
        const t0 = performance.now()
        let items: Item[] = [{ name: sample.name, blob: sample.blob, path: sample.path }]
        let before = items[0]
        for (const n of path) {
          if (n.id === node.id) before = items[0]
          if (!n.enabled) continue
          items = await STEP_BY_ID[n.step].run(items.slice(0, 1), n.params, () => {})
          if (!items.length) break
        }
        if (my === tok.current) setPv({ before, after: items, ms: performance.now() - t0 })
      } catch (e: any) { if (my === tok.current) setPv({ note: 'Preview failed: ' + (e?.message || e) }) }
      finally { if (my === tok.current) setBusy(false) }
    }, 380)
    return () => clearTimeout(t)
  }, [sample, path, node])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted"><span className="flex items-center gap-1.5"><Eye className="size-3.5" /> Live preview</span>{sample && <span className="max-w-[60%] truncate normal-case tracking-normal">{sample.name}</span>}</div>
      {busy && <Skeleton className="aspect-video w-full" />}
      {!busy && pv && 'note' in pv && <div className="flex items-start gap-2 rounded-xl border border-border bg-surface-2/40 p-3 text-xs text-muted"><Info className="mt-0.5 size-3.5 shrink-0" />{pv.note}</div>}
      {!busy && pv && 'after' in pv && (() => {
        const a = pv.after[0]
        if (!a) return <div className="text-xs text-muted">No file came out of this step.</div>
        const isImg = (b: Blob, n: string) => kindOf(n, b.type) === 'image'
        const d = a.blob.size - pv.before.blob.size
        return (
          <>
            {isImg(pv.before.blob, pv.before.name) && isImg(a.blob, a.name) ? <CompareSlider before={pv.before.blob} after={a.blob} />
              : kindOf(a.name, a.blob.type) === 'text' || kindOf(a.name, a.blob.type) === 'data' ? <TextPeek blob={a.blob} name={a.name} />
              : <div className="rounded-xl border border-border bg-surface-2/40 p-3 text-xs">{pv.before.name} <ArrowRight className="inline size-3" /> {a.name}</div>}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
              <span>{formatBytes(pv.before.blob.size)} → <b className="text-fg">{formatBytes(a.blob.size)}</b></span>
              <span className={d < 0 ? 'text-success' : d > 0 ? 'text-warn' : ''}>{d === 0 ? 'same size' : `${d < 0 ? '−' : '+'}${Math.abs((d / Math.max(1, pv.before.blob.size)) * 100).toFixed(1)}%`}</span>
              {pv.after.length > 1 && <span>{pv.after.length} files</span>}
              {a.kept && <span className="text-accent">original kept</span>}
              <span className="ml-auto font-mono">{Math.round(pv.ms)} ms</span>
            </div>
          </>
        )
      })()}
    </div>
  )
}

const nodeName = (n: GNode) => (n.id === IN ? 'Input' : n.id === '@out' ? 'Output' : metaOf(n.step)?.name ?? n.step)
/** Keyboard friendly way to branch and merge: list the outgoing links and add one to any step that would not loop. */
function Links({ graph, node, onLink, onUnlink, canLink }: { graph: Graph; node: GNode; onLink: (to: string) => void; onUnlink: (to: string) => void; canLink: (to: string) => boolean }) {
  const by = new Map(graph.nodes.map((n) => [n.id, n]))
  const outs = graph.edges.filter(([a]) => a === node.id).map(([, b]) => by.get(b)).filter((n): n is GNode => !!n)
  const ins = graph.edges.filter(([, b]) => b === node.id).map(([a]) => by.get(a)).filter((n): n is GNode => !!n)
  const cands = graph.nodes.filter((n) => n.id !== node.id && n.id !== IN && !outs.includes(n) && canLink(n.id))
  return (
    <div className="mt-4 space-y-2 border-t border-border pt-3 text-xs">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Links</div>
      <div className="text-muted">From: {ins.length ? ins.map(nodeName).join(', ') : 'nothing yet, link a step into this one'}</div>
      <div className="flex flex-wrap gap-1.5">
        {outs.map((n) => <span key={n.id} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">To {nodeName(n)}<button onClick={() => onUnlink(n.id)} aria-label={`Remove link to ${nodeName(n)}`} className="text-muted hover:text-danger cursor-pointer"><X className="size-3" /></button></span>)}
      </div>
      {cands.length > 0 && (
        <label className="flex items-center gap-2"><span className="shrink-0 text-muted">Also send to</span>
          <select value="" onChange={(e) => { if (e.target.value) onLink(e.target.value) }} className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs" aria-label="Add a link to another step">
            <option value="">Pick a step to branch or merge</option>
            {cands.map((n) => <option key={n.id} value={n.id}>{nodeName(n)}</option>)}
          </select></label>
      )}
    </div>
  )
}

export function TextPeek({ blob, name }: { blob: Blob; name: string }) {
  const [t, setT] = useState('')
  useEffect(() => { let on = true; blob.slice(0, 1200).text().then((s) => on && setT(s)); return () => { on = false } }, [blob])
  return <pre className="max-h-48 overflow-auto rounded-xl border border-border bg-surface-2/50 p-3 font-mono text-[11px] leading-relaxed text-muted scrollbar-thin" aria-label={`Start of ${name}`}>{t || ' '}</pre>
}

export function StepDrawer({ graph, node, sample, onParam, onToggle, onDuplicate, onDelete, onClose, onLink, onUnlink, canLink }: {
  graph: Graph; node: GNode; sample?: InFile
  onParam: (k: string, v: any) => void; onToggle: (v: boolean) => void; onDuplicate: () => void; onDelete: () => void; onClose: () => void
  onLink: (to: string) => void; onUnlink: (to: string) => void; canLink: (to: string) => boolean
}) {
  const m = metaOf(node.step)
  const mo = useMotion()
  if (!m) return null
  const col = catColor(node.step)
  return (
    <AnimatePresence mode="wait">
      <motion.aside key={node.id} initial={mo === 'off' ? false : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.22 }}
        className="rounded-2xl border border-border bg-surface p-4" aria-label={`${m.name} settings`} data-tour="drawer">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl" style={{ background: col + '22', color: col }}><StepIcon step={node.step} className="size-5" /></span>
          <div className="min-w-0 flex-1"><div className="font-semibold">{m.name}</div><div className="text-xs text-muted">{m.desc}</div></div>
          <button onClick={onClose} aria-label="Close settings" className="rounded-lg p-1 text-muted hover:text-fg cursor-pointer"><X className="size-4" /></button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <Switch checked={node.enabled} onChange={onToggle} label={node.enabled ? 'On' : 'Off'} />
          <button onClick={onDuplicate} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 hover:border-accent hover:text-accent cursor-pointer"><Copy className="size-3.5" /> Duplicate</button>
          <button onClick={onDelete} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 hover:border-danger hover:text-danger cursor-pointer"><Trash2 className="size-3.5" /> Remove</button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-muted">
          <span className="rounded-full border border-border px-2 py-0.5">Takes: {m.accepts === 'any' ? 'any file' : m.accepts.join(', ')}</span>
          {m.batch && <span className="rounded-full border border-border px-2 py-0.5">Runs once on all files</span>}
          {m.exclusive && <span className="rounded-full border border-border px-2 py-0.5">One file at a time</span>}
          {m.worker && <span className="rounded-full border border-border px-2 py-0.5">Web Worker</span>}
        </div>
        {m.params.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {m.params.map((p) => {
              const id = `ws-${node.id}-${p.key}`
              return (
                <div key={p.key}>
                  <label htmlFor={id} className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">{p.label}</label>
                  {p.type === 'select' ? <Select id={id} value={String(node.params[p.key])} onChange={(v) => onParam(p.key, v)} options={p.options!} />
                    : p.type === 'bool' ? <Switch checked={!!node.params[p.key]} onChange={(v) => onParam(p.key, v)} />
                    : p.type === 'color' ? <input id={id} type="color" value={node.params[p.key]} onChange={(e) => onParam(p.key, e.target.value)} className="h-10 w-full cursor-pointer rounded-xl border border-border bg-transparent p-1" />
                    : p.type === 'number' && p.max != null && p.min != null && p.max - p.min <= 100 ? (
                      <div className="flex items-center gap-2"><input id={id} type="range" min={p.min} max={p.max} step={p.step ?? 1} value={node.params[p.key]} onChange={(e) => onParam(p.key, Number(e.target.value))} className="ws-range flex-1" /><span className="w-9 text-right font-mono text-xs">{node.params[p.key]}</span></div>
                    ) : <Input id={id} type={p.type} min={p.min} max={p.max} step={p.step} value={node.params[p.key]} onChange={(e) => onParam(p.key, p.type === 'number' ? Number(e.target.value) : e.target.value)} />}
                  {p.hint && <div className="mt-1 text-[10px] text-muted">{p.hint}</div>}
                </div>
              )
            })}
          </div>
        )}
        <Links graph={graph} node={node} onLink={onLink} onUnlink={onUnlink} canLink={canLink} />
        <div className="mt-4 border-t border-border pt-3"><LivePreview graph={graph} node={node} sample={sample} /></div>
      </motion.aside>
    </AnimatePresence>
  )
}
