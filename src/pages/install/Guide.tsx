// Interactive installation guide: platform tabs, Install / Update / Uninstall, an animated step timeline
// that follows your scroll or clicks, expandable steps with a drawn screen showing where to click,
// copy buttons for commands and a per-platform progress bar (saved in this browser).
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, ChevronDown, ExternalLink, RotateCcw, Download, RefreshCw, Trash2 } from 'lucide-react'
import { CopyButton, cn } from '@/components/ui'
import { useReducedMotion as usePrefReduced } from '@/lib/store'
import { GUIDES, type GuideId, type Step } from './data'
import { Mock } from './Mock'

type Phase = 'install' | 'update' | 'uninstall'
const PHASES: { id: Phase; label: string; icon: typeof Download }[] = [{ id: 'install', label: 'Install', icon: Download }, { id: 'update', label: 'Update', icon: RefreshCw }, { id: 'uninstall', label: 'Uninstall', icon: Trash2 }]
const KEY = 'of:install-progress'
const load = (): Record<string, number[]> => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } }

export function InstallGuide({ initial }: { initial: GuideId }) {
  const [gid, setGid] = useState<GuideId>(initial)
  const [phase, setPhase] = useState<Phase>('install')
  const [open, setOpen] = useState(0)
  const [done, setDone] = useState<Record<string, number[]>>(load)
  const reduce = useReducedMotion() || usePrefReduced()
  useEffect(() => { setGid(initial) }, [initial])
  useEffect(() => { setOpen(0) }, [gid, phase])
  useEffect(() => {
    const h = () => { const m = location.hash.match(/^#guide-(\w+)/); if (m && GUIDES.some((g) => g.id === m[1])) setGid(m[1] as GuideId) }
    h(); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h)
  }, [])
  const g = GUIDES.find((x) => x.id === gid) ?? GUIDES[0]
  const steps: Step[] = g[phase]
  const pkey = `${gid}:${phase}`
  const doneHere = done[pkey] ?? []
  const pct = Math.round((doneHere.length / steps.length) * 100)
  const toggleDone = (i: number) => setDone((d) => {
    const cur = new Set(d[pkey] ?? []); if (cur.has(i)) cur.delete(i); else cur.add(i)
    const next = { ...d, [pkey]: [...cur].sort((a, b) => a - b) }
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignore */ }
    return next
  })
  const finish = (i: number) => { if (!doneHere.includes(i)) toggleDone(i); if (i + 1 < steps.length) setOpen(i + 1) }
  const reset = () => setDone((d) => { const next = { ...d, [pkey]: [] }; try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignore */ } return next })
  const mockStep = steps[open]?.mock ? open : steps.findIndex((s) => s.mock)

  return (
    <div id="guide" className="scroll-mt-24">
      {/* platform switcher */}
      <div role="tablist" aria-label="Platform" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 scrollbar-thin sm:mx-0 sm:flex-wrap sm:px-0">
        {GUIDES.map((x) => (
          <button key={x.id} role="tab" aria-selected={x.id === gid} onClick={() => { setGid(x.id); history.replaceState(null, '', `#guide-${x.id}`) }}
            className={cn('relative flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-medium transition-colors cursor-pointer', x.id === gid ? 'text-fg' : 'text-muted hover:text-fg')}>
            {x.id === gid && <motion.span layoutId="guide-tab" className="absolute inset-0 rounded-xl border border-accent/60 bg-accent/10" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
            <span className="relative size-2 rounded-full" style={{ background: x.color }} /><span className="relative">{x.short}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-border bg-surface p-1" role="tablist" aria-label="What to do">
          {PHASES.map((p) => (
            <button key={p.id} role="tab" aria-selected={phase === p.id} onClick={() => setPhase(p.id)} className={cn('relative flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm cursor-pointer', phase === p.id ? 'text-on-accent' : 'text-muted hover:text-fg')}>
              {phase === p.id && <motion.span layoutId="guide-phase" className="absolute inset-0 rounded-lg bg-accent" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
              <p.icon className="relative size-3.5" /><span className="relative">{p.label}</span>
            </button>
          ))}
        </div>
        <div className="flex min-w-[220px] flex-1 items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Steps done">
            <motion.div className="h-full rounded-full bg-gradient-to-r from-accent via-accent to-teal" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: reduce ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }} />
          </div>
          <span className="shrink-0 font-mono text-xs text-muted">{doneHere.length} of {steps.length} done</span>
          {doneHere.length > 0 && <button onClick={reset} className="grid size-9 place-items-center rounded-lg text-muted hover:text-fg cursor-pointer" aria-label="Reset progress" title="Reset progress"><RotateCcw className="size-3.5" /></button>}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={pkey} initial={reduce ? false : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={reduce ? undefined : { opacity: 0, x: -24 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] lg:gap-10">
          <div>
            <h3 className="font-display text-xl font-bold">{g.label}</h3>
            <ol className="relative mt-5">
              {/* the timeline rail fills up to the open step */}
              <span aria-hidden="true" className="absolute left-[19px] top-3 bottom-3 w-0.5 rounded bg-border" />
              <motion.span aria-hidden="true" className="absolute left-[19px] top-3 w-0.5 origin-top rounded bg-gradient-to-b from-accent to-teal" initial={false}
                animate={{ height: steps.length > 1 ? `calc(${(Math.max(open, 0) / (steps.length - 1)) * 100}% - ${open === steps.length - 1 ? 24 : 0}px)` : 0 }} transition={{ duration: reduce ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }} />
              {steps.map((s, i) => (
                <StepRow key={pkey + i} s={s} i={i} open={open === i} done={doneHere.includes(i)} reduce={!!reduce}
                  onOpen={() => setOpen(open === i ? -1 : i)} onSeen={() => setOpen((o) => (o < i ? i : o))} onDone={() => toggleDone(i)} onNext={() => finish(i)} last={i === steps.length - 1} />
              ))}
            </ol>
          </div>
          <div className="hidden lg:block">
            <div className="sticky top-24">
              <div className="relative rounded-3xl border border-border bg-gradient-to-b from-surface to-bg p-6">
                <div className="pointer-events-none absolute inset-0 rounded-3xl" style={{ background: `radial-gradient(360px 220px at 50% 0%, color-mix(in oklab, ${g.color} 16%, transparent), transparent 70%)` }} />
                <div className="relative mb-3 flex items-center justify-between text-xs text-muted"><span>Step {Math.max(mockStep, 0) + 1}: where to click</span><span className="rounded-full border border-border px-2 py-0.5">{g.short}</span></div>
                <AnimatePresence mode="wait">
                  {mockStep >= 0 && steps[mockStep]?.mock && (
                    <motion.div key={pkey + mockStep} initial={reduce ? false : { opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduce ? undefined : { opacity: 0, y: -10, scale: 0.98 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="relative">
                      <Mock kind={steps[mockStep].mock!} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function StepRow({ s, i, open, done, reduce, onOpen, onSeen, onDone, onNext, last }: { s: Step; i: number; open: boolean; done: boolean; reduce: boolean; onOpen: () => void; onSeen: () => void; onDone: () => void; onNext: () => void; last: boolean }) {
  const ref = useRef<HTMLLIElement>(null)
  // scrolling a step into the middle of the screen opens it, so the timeline follows the reader
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) onSeen() }, { rootMargin: '-45% 0px -45% 0px' })
    io.observe(el); return () => io.disconnect()
  }, [])
  const id = useMemo(() => `step-${Math.random().toString(36).slice(2, 8)}`, [])
  return (
    <motion.li ref={ref} initial={reduce ? false : { opacity: 0, x: -12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.4, delay: Math.min(i * 0.06, 0.3) }} className={cn('relative pl-14', !last && 'pb-4')}>
      <button onClick={onDone} aria-label={done ? `Mark step ${i + 1} as not done` : `Mark step ${i + 1} as done`} aria-pressed={done}
        className={cn('absolute left-0 top-0 z-[1] grid size-10 place-items-center rounded-full border-2 font-display text-sm font-bold transition-colors cursor-pointer', done ? 'border-success bg-success text-black' : open ? 'border-accent bg-bg text-accent' : 'border-border bg-bg text-muted')}>
        <AnimatePresence mode="wait" initial={false}>
          {done ? <motion.span key="d" initial={{ scale: 0.4, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0.4 }}><Check className="size-4" /></motion.span> : <motion.span key="n" initial={{ scale: 0.6 }} animate={{ scale: 1 }}>{i + 1}</motion.span>}
        </AnimatePresence>
        {open && !done && !reduce && <motion.span aria-hidden="true" className="absolute inset-0 rounded-full border-2 border-accent" animate={{ scale: [1, 1.35], opacity: [0.7, 0] }} transition={{ duration: 1.6, repeat: Infinity }} />}
      </button>
      <div className={cn('rounded-2xl border transition-colors', open ? 'border-accent/50 bg-surface' : 'border-border bg-surface/60 hover:border-accent/30')}>
        <button onClick={onOpen} aria-expanded={open} aria-controls={id} className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left cursor-pointer">
          <span className={cn('flex-1 font-semibold', done && 'text-muted line-through decoration-success/60')}>{s.title}</span>
          <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} />
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div id={id} initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={reduce ? undefined : { height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
              <div className="px-4 pb-4">
                <p className="text-sm leading-relaxed text-muted">{s.body}</p>
                {s.cmd?.map((c) => (
                  <div key={c} className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-black p-2 pl-3">
                    <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[12.5px] text-[#e5e7eb] scrollbar-thin"><span className="select-none text-emerald">$ </span>{c}</code>
                    <CopyButton text={c} />
                  </div>
                ))}
                {s.mock && <div className="mt-4 lg:hidden"><Mock kind={s.mock} /></div>}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {s.link && <a href={s.link.href} target={s.link.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent hover:brightness-110">{s.link.label}<ExternalLink className="size-3.5" /></a>}
                  <button onClick={onNext} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border px-4 text-sm hover:border-accent cursor-pointer"><Check className="size-3.5 text-success" />{last ? 'Done' : 'Done, next step'}</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.li>
  )
}
