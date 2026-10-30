/* Guide: the onboarding tour, the keyboard shortcut sheet and the "how it works" section with its explainer film. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowRight, ArrowLeft, Keyboard, Upload, Workflow, Play, Download } from 'lucide-react'
import { Button } from '@/components/ui'
import { useMotion } from './kit'

const media = (f: string) => `${(import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')}media/workspace/${f}`

export const TOUR: { target: string; title: string; body: string }[] = [
  { target: 'inputs', title: 'Add your files', body: 'Drop files or whole folders, paste an image, add a public link, or press Samples to try it with ours. ZIPs are unpacked for you.' },
  { target: 'palette', title: 'Pick steps', body: 'Search the step library or click a category. Click a step to add it after the selected one, or drag it onto the canvas.' },
  { target: 'canvas', title: 'Shape the pipeline', body: 'Drag steps around, link a step to two others to branch, link two into one to merge. Switch to List for a simple line you can reorder.' },
  { target: 'drawer', title: 'Tune each step', body: 'Select a step to open its settings. The live preview runs the pipeline up to that step on one of your files.' },
  { target: 'run', title: 'Run it', body: 'Many files run at once in Web Workers. Pause, resume or cancel any time, and retry only the files that failed.' },
  { target: 'recipes', title: 'Keep and share recipes', body: 'Save a pipeline, export it as JSON, or copy a link that rebuilds it. Saved recipes show up in every open tab.' },
  { target: 'motion', title: 'Your motion, your call', body: 'Turn animation off, keep it subtle, or go full. It starts from your system setting.' },
]

export function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const m = useMotion()
  const card = useRef<HTMLDivElement>(null)
  const step = TOUR[i]
  useEffect(() => { if (open) setI(0) }, [open])
  useLayoutEffect(() => {
    if (!open) return
    const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null
    if (!el) { setRect(null); return }
    el.scrollIntoView({ block: 'center', behavior: m === 'off' ? 'auto' : 'smooth' })
    const upd = () => setRect(el.getBoundingClientRect())
    const t = setTimeout(upd, m === 'off' ? 0 : 380); upd()
    window.addEventListener('resize', upd); window.addEventListener('scroll', upd, true)
    return () => { clearTimeout(t); window.removeEventListener('resize', upd); window.removeEventListener('scroll', upd, true) }
  }, [open, i, step?.target, m])
  useEffect(() => {
    if (!open) return
    card.current?.focus()
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') setI((x) => Math.min(TOUR.length - 1, x + 1)); if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1)) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open) return null
  const pad = 8
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200, vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const cw = Math.min(340, vw - 24)
  let top = rect ? rect.bottom + 14 : vh / 2 - 100, left = rect ? rect.left : (vw - cw) / 2
  if (rect && top + 200 > vh) top = Math.max(12, rect.top - 214)
  left = Math.max(12, Math.min(vw - cw - 12, left))
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Workspace tour">
      <div className="absolute inset-0" onClick={onClose} />
      {rect && <motion.div className="pointer-events-none absolute rounded-2xl ring-2 ring-accent" initial={false}
        animate={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} transition={{ duration: m === 'off' ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}
        style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,.62), 0 0 40px 6px color-mix(in oklab, var(--accent) 45%, transparent)' }} />}
      {!rect && <div className="absolute inset-0 bg-black/60" />}
      <motion.div ref={card} tabIndex={-1} key={i} initial={m === 'off' ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="absolute rounded-2xl border border-border bg-surface p-4 shadow-2xl outline-none" style={{ top, left, width: cw }}>
        <div className="flex items-center gap-2"><span className="font-mono text-[11px] text-accent">{i + 1} / {TOUR.length}</span><button onClick={onClose} aria-label="Close tour" className="ml-auto rounded p-1 text-muted hover:text-fg cursor-pointer"><X className="size-4" /></button></div>
        <h3 className="mt-1 font-semibold">{step.title}</h3>
        <p className="mt-1 text-sm text-muted">{step.body}</p>
        <div className="mt-3 flex items-center gap-1">{TOUR.map((_, k) => <span key={k} className={`h-1 rounded-full transition-all ${k === i ? 'w-5 bg-accent' : 'w-1.5 bg-border'}`} />)}</div>
        <div className="mt-3 flex justify-between gap-2">
          <Button size="sm" variant="ghost" disabled={i === 0} icon={<ArrowLeft className="size-3.5" />} onClick={() => setI(i - 1)}>Back</Button>
          {i < TOUR.length - 1 ? <Button size="sm" onClick={() => setI(i + 1)}>Next <ArrowRight className="ml-1 size-3.5" /></Button> : <Button size="sm" onClick={onClose}>Done</Button>}
        </div>
      </motion.div>
    </div>
  )
}

export const SHORTCUTS: [string, string][] = [
  ['Ctrl + Enter', 'Run the pipeline'], ['P', 'Pause or resume a run'], ['Esc', 'Cancel a run, close panels'],
  ['Ctrl + Z', 'Undo'], ['Ctrl + Shift + Z or Ctrl + Y', 'Redo'], ['Ctrl + S', 'Save the recipe'],
  ['A', 'Search the step library'], ['D', 'Duplicate the selected step'], ['E', 'Turn the selected step on or off'],
  ['Delete', 'Remove the selected step or link'], ['Arrows', 'Move the selected step on the canvas'], ['Alt + Up / Down', 'Reorder in list mode'],
  ['V', 'Switch canvas and list'], ['F', 'Fit the canvas'], ['?', 'Show these shortcuts'], ['Ctrl + V', 'Paste images or text as files'],
]

export function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
          <motion.div initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96 }} onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-3xl border border-border bg-surface p-5">
            <div className="flex items-center gap-2"><Keyboard className="size-5 text-accent" /><h2 className="font-display text-lg font-bold">Keyboard shortcuts</h2><button autoFocus onClick={onClose} aria-label="Close" className="ml-auto rounded p-1 text-muted hover:text-fg cursor-pointer"><X className="size-5" /></button></div>
            <dl className="mt-4 grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {SHORTCUTS.map(([k, v]) => <div key={k} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm"><dt className="text-muted">{v}</dt><dd><kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">{k}</kbd></dd></div>)}
            </dl>
            <p className="mt-3 text-xs text-muted">On a Mac, use Cmd in place of Ctrl.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function HowItWorks() {
  const m = useMotion()
  const steps = [
    { icon: Upload, title: 'Files stay here', body: 'Everything you add is read by this tab. No upload, no server, no account.', color: '#F5A524' },
    { icon: Workflow, title: 'A graph of steps', body: 'Each step takes the files it understands and passes the rest along. Branches copy files, merges join them.', color: '#14B8A6' },
    { icon: Play, title: 'A worker pool runs it', body: 'Image steps run in parallel Web Workers. Video uses the self-hosted ffmpeg engine, one file at a time. A memory guard slows down before the tab runs out.', color: '#38BDF8' },
    { icon: Download, title: 'Never bigger', body: 'If a result comes out bigger than the file you gave it, you get your original back. Then grab everything as one ZIP.', color: '#10B981' },
  ]
  return (
    <div className="grid items-center gap-6 lg:grid-cols-[1.15fr_1fr]">
      <div className="overflow-hidden rounded-3xl border border-border bg-black shadow-2xl">
        <video controls playsInline preload="none" poster={media('how-it-works.jpg')} className="aspect-video w-full" aria-label="How the Workspace works, explainer video">
          <source src={media('how-it-works.mp4')} type="video/mp4" />
          <track kind="captions" src={media('how-it-works.vtt')} srcLang="en" label="English" default />
        </video>
      </div>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <motion.li key={s.title} initial={m === 'off' ? false : { opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: m === 'full' ? i * 0.09 : 0 }} className="flex gap-3 rounded-2xl border border-border bg-surface p-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: s.color + '22', color: s.color }}><s.icon className="size-5" /></span>
            <div><div className="font-semibold">{s.title}</div><div className="text-sm text-muted">{s.body}</div></div>
          </motion.li>
        ))}
      </ol>
    </div>
  )
}
