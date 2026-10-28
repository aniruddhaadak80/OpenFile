// "How it works", steps, tips, FAQ and related tools, rendered under every tool from registry data (see tools/guides.ts).
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Cpu, ListOrdered, Lightbulb, HelpCircle, ChevronDown, Download, ShieldCheck, BookOpen, ArrowRight, Workflow } from 'lucide-react'
import { CATEGORIES, type ToolMeta } from '@/tools/registry'
import type { ToolGuide as Guide } from '@/tools/guides'
import { slugify } from '@/lib/slug'
import { ToolCard } from './ToolCard'
import { cn } from './ui'

const fade = { initial: { opacity: 0, y: 14 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-60px' }, transition: { duration: 0.35 } }

export function ToolGuideSection({ tool, guide }: { tool: ToolMeta; guide: Guide }) {
  const cat = CATEGORIES.find((c) => c.id === tool.category)!
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className="mt-20 space-y-14">
      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <motion.section {...fade} className="relative overflow-hidden rounded-3xl border border-border bg-surface p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full blur-3xl" style={{ background: cat.color + '22' }} />
          <div className="relative">
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: cat.color }}>Under the hood</div>
            <h2 className="mt-1.5 flex items-center gap-2 font-display text-2xl font-bold"><Cpu className="size-5 text-accent" /> How {tool.name} works</h2>
            <p className="mt-3 leading-relaxed text-muted">{guide.how}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {guide.engines.map((e) => (
                <span key={e.name} title={e.what} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2/60 px-3 py-1 text-xs"><span className="size-1.5 rounded-full bg-accent" />{e.name}</span>
              ))}
            </div>
            {(guide.inputs?.length || guide.outputs?.length) ? (
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
                {guide.inputs?.length ? <span><span className="font-semibold text-fg">Input:</span> {guide.inputs.join(' · ')}</span> : null}
                {guide.outputs?.length ? <span><span className="font-semibold text-fg">Output:</span> {guide.outputs.join(' · ')}</span> : null}
              </div>
            ) : null}
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <div className="flex items-start gap-2 rounded-xl border border-success/25 bg-success/5 p-3 text-xs"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" /><span><span className="font-semibold">Zero uploads.</span> Your files are processed in this tab and never sent to a server.</span></div>
              {guide.firstUse
                ? <div className="flex items-start gap-2 rounded-xl border border-warn/25 bg-warn/5 p-3 text-xs"><Download className="mt-0.5 size-4 shrink-0 text-warn" /><span><span className="font-semibold">First use downloads an engine:</span> {guide.firstUse}. It is cached afterwards.</span></div>
                : <div className="flex items-start gap-2 rounded-xl border border-border bg-surface-2/40 p-3 text-xs"><Download className="mt-0.5 size-4 shrink-0 text-accent" /><span><span className="font-semibold">Instant start.</span> No engine download needed, and it works offline once loaded.</span></div>}
            </div>
            {tool.pipeline && <Link to="/workspace" className="mt-4 inline-flex items-center gap-1.5 text-sm text-accent hover:underline"><Workflow className="size-4" /> Also available as a Workspace step for batch {tool.pipeline === 'image' ? 'images' : 'PDFs'}</Link>}
          </div>
        </motion.section>

        <motion.section {...fade} transition={{ duration: 0.35, delay: 0.05 }} className="rounded-3xl border border-border bg-surface p-6 sm:p-8">
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold"><Lightbulb className="size-5 text-warn" /> Tips</h2>
          <ul className="mt-4 space-y-3">
            {guide.tips.map((t, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed"><span className="mt-2 size-1.5 shrink-0 rounded-full" style={{ background: cat.color }} /><span className="text-muted">{t}</span></li>
            ))}
          </ul>
          <Link to={`/docs/tools/${tool.category}#${slugify(tool.name)}`} className="mt-6 inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-muted transition hover:border-accent hover:text-fg"><BookOpen className="size-4" /> Read the full guide</Link>
        </motion.section>
      </div>

      <section>
        <motion.h2 {...fade} className="mb-5 flex items-center gap-2 font-display text-xl font-semibold"><ListOrdered className="size-5 text-accent" /> How to use {tool.name}</motion.h2>
        <ol className={cn('grid gap-4', guide.steps.length >= 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3')}>
          {guide.steps.map((s, i) => (
            <motion.li key={i} {...fade} transition={{ duration: 0.35, delay: i * 0.06 }} className="group relative rounded-2xl border border-border bg-surface p-5 transition hover:-translate-y-0.5 hover:border-accent/40">
              <div className="grid size-9 place-items-center rounded-xl bg-gradient-brand font-display text-sm font-bold text-on-accent shadow-lg shadow-accent/25 transition group-hover:scale-110">{i + 1}</div>
              <p className="mt-3 text-sm leading-relaxed">{s}</p>
              {i < guide.steps.length - 1 && <ArrowRight className="absolute -right-3 top-1/2 hidden size-4 -translate-y-1/2 text-border lg:block" />}
            </motion.li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-3xl">
        <motion.h2 {...fade} className="mb-5 flex items-center justify-center gap-2 font-display text-xl font-semibold"><HelpCircle className="size-5 text-accent" /> {tool.name} FAQ</motion.h2>
        <div className="divide-y divide-border rounded-2xl border border-border bg-surface">
          {guide.faq.map((f, i) => (
            <div key={f.q}>
              <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-medium cursor-pointer">{f.q}<ChevronDown className={cn('size-4 shrink-0 transition', open === i && 'rotate-180')} /></button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    <p className="px-5 pb-5 text-sm leading-relaxed text-muted">{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </section>

      {guide.related.length > 0 && (
        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <h2 className="font-display text-xl font-semibold">Related tools</h2>
            <Link to={`/category/${cat.id}`} className="text-sm text-accent hover:underline">All {cat.name.toLowerCase()} →</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{guide.related.map((t) => <ToolCard key={t.slug} tool={t} />)}</div>
        </section>
      )}
    </div>
  )
}
