// Compare mode for /tools: pick up to three tools and see them side by side (formats, engines, offline, batch).
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { GitCompare, X, Check, Minus, ArrowUpRight } from 'lucide-react'
import { CATEGORIES, toolBySlug, type ToolMeta } from '@/tools/registry'
import { toolGuide } from '@/tools/guides'
import { toolFormats, INPUT_KINDS } from '@/lib/formats'
import { getIcon } from './icons'
import { EmptyState } from './EmptyState'
import { Button, cn } from './ui'

const KEY = 'of:compare'
export function useCompare() {
  const [picked, setPicked] = useState<string[]>(() => { try { return JSON.parse(sessionStorage.getItem(KEY) || '[]').filter((s: string) => toolBySlug(s)).slice(0, 3) } catch { return [] } })
  const [mode, setMode] = useState(() => picked.length > 0)
  const [open, setOpen] = useState(false)
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(picked)) } catch { /* ignore */ } }, [picked])
  return {
    picked, mode, open, setOpen,
    setMode: (v: boolean) => { setMode(v); if (!v) setOpen(false) },
    has: (s: string) => picked.includes(s),
    toggle: (s: string) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : p.length >= 3 ? p : [...p, s])),
    clear: () => setPicked([]),
  }
}
export type CompareState = ReturnType<typeof useCompare>

function rows(t: ToolMeta) {
  const g = toolGuide(t), f = toolFormats(t)
  return {
    Category: CATEGORIES.find((c) => c.id === t.category)?.name ?? t.category,
    'What it does': t.desc,
    Accepts: f.inputs.length ? f.inputs.join(', ') : INPUT_KINDS.find((k) => k.id === f.kind)?.label ?? '-',
    Produces: f.outputs.length ? f.outputs.join(', ') : '-',
    Engines: g.engines.map((e) => e.name).join(', ') || 'Browser built-ins',
    'First use download': g.firstUse ? g.firstUse : false,
    'Works offline': !g.firstUse || 'after first use',
    'Batch in Workspace': !!t.pipeline,
    'On-device AI': t.badge === 'AI',
    'Steps to finish': String(g.steps.length),
  } as Record<string, string | boolean>
}

export function CompareTray({ compare: c }: { compare: CompareState }) {
  const tools = c.picked.map(toolBySlug).filter((t): t is ToolMeta => !!t)
  const data = useMemo(() => tools.map(rows), [c.picked.join()])
  const keys = data[0] ? Object.keys(data[0]) : []
  useEffect(() => {
    if (!c.open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') c.setOpen(false) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [c.open])
  return (
    <>
      <AnimatePresence>
        {c.mode && (
          <motion.div initial={{ y: 90 }} animate={{ y: 0 }} exit={{ y: 90 }} transition={{ type: 'spring', stiffness: 360, damping: 32 }} className="glass fixed inset-x-0 bottom-0 z-[62] border-t border-border px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
              <GitCompare className="size-4 text-accent" />
              <span className="text-sm font-medium">Compare</span>
              <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                {tools.map((t) => <span key={t.slug} className="flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-xs">{t.name}<button onClick={() => c.toggle(t.slug)} className="grid size-6 place-items-center rounded text-muted hover:text-danger cursor-pointer" aria-label={`Remove ${t.name}`}><X className="size-3.5" /></button></span>)}
                {Array.from({ length: 3 - tools.length }, (_, i) => <span key={i} className="hidden min-h-9 w-24 items-center justify-center rounded-lg border border-dashed border-border text-[11px] text-muted sm:flex">Pick a tool</span>)}
              </div>
              <Button size="sm" variant="ghost" onClick={() => c.setMode(false)}>Done</Button>
              <Button size="sm" disabled={tools.length < 2} onClick={() => c.setOpen(true)}>Compare {tools.length || ''}</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {c.open && (
          <motion.div className="fixed inset-0 z-[96] flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => c.setOpen(false)}>
            <motion.div role="dialog" aria-modal="true" aria-labelledby="cmp-title" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-t-3xl border border-border bg-surface shadow-2xl sm:rounded-3xl">
              <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                <GitCompare className="size-5 text-accent" /><h2 id="cmp-title" className="flex-1 font-display text-lg font-bold">Compare tools</h2>
                <button onClick={() => { c.clear(); c.setOpen(false) }} className="min-h-10 px-2 text-xs text-muted hover:text-fg cursor-pointer">Clear</button>
                <button onClick={() => c.setOpen(false)} className="grid size-11 place-items-center rounded-xl text-muted hover:bg-surface-2 cursor-pointer" aria-label="Close"><X className="size-5" /></button>
              </div>
              {tools.length < 2 ? <EmptyState kind="compare" title="Pick at least two tools" className="m-5" /> : (
                <div className="max-h-[calc(90vh-4.5rem)] overflow-auto scrollbar-thin">
                  <table className="w-full min-w-[640px] border-collapse text-sm">
                    <thead className="sticky top-0 z-10 bg-surface">
                      <tr><th className="w-40 p-4 text-left text-xs font-semibold uppercase tracking-wider text-muted" scope="col">Feature</th>
                        {tools.map((t) => { const I = getIcon(t.icon); const col = CATEGORIES.find((x) => x.id === t.category)?.color; return (
                          <th key={t.slug} scope="col" className="p-4 text-left align-top"><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg" style={{ background: col + '1f', color: col }}><I className="size-4" /></span><span className="font-semibold">{t.name}</span></div></th>) })}
                      </tr>
                    </thead>
                    <tbody>
                      {keys.map((k) => (
                        <tr key={k} className="border-t border-border">
                          <th scope="row" className="p-4 text-left text-xs font-medium text-muted">{k}</th>
                          {data.map((d, i) => { const v = d[k]; return <td key={i} className={cn('p-4 align-top', k === 'What it does' && 'text-muted')}>{v === true ? <Check className="size-4 text-success" aria-label="Yes" /> : v === false ? <Minus className="size-4 text-muted" aria-label="No" /> : v}</td> })}
                        </tr>
                      ))}
                      <tr className="border-t border-border"><td />{tools.map((t) => <td key={t.slug} className="p-4"><Link to={`/${t.slug}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-gradient-brand px-4 text-sm font-semibold">Open <ArrowUpRight className="size-4" /></Link></td>)}</tr>
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
