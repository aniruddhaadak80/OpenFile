// Docs search: a keyboard-first dialog over every docs section, tool guide and tool. Fuzzy enough to forgive a typo.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, CornerDownLeft, FileText, Wrench, BookOpen, Hash } from 'lucide-react'
import { cn } from '@/components/ui'
import { searchDocs, type SearchHit } from './data'

export function SearchButton({ onOpen, compact }: { onOpen: () => void; compact?: boolean }) {
  return (
    <button onClick={onOpen} className={cn('group flex h-10 w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 text-left text-sm text-muted transition hover:border-accent/50 hover:text-fg cursor-pointer', compact && 'h-11')} aria-label="Search docs" aria-keyshortcuts="/">
      <Search className="size-4 shrink-0" />
      <span className="flex-1 truncate">Search docs and tools</span>
      <kbd className="rounded border border-border px-1.5 font-mono text-[10px]">/</kbd>
    </button>
  )
}

const KIND_ICON = { Docs: FileText, Tool: Wrench, Category: BookOpen }
const SUGGEST = ['install', 'offline', 'webgpu', 'page ranges', 'shortcuts', 'heic', 'merge pdf', 'privacy']

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const nav = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const hits = useMemo(() => searchDocs(q, 30), [q])
  useEffect(() => setI(0), [q])
  useEffect(() => { if (open) { setTimeout(() => input.current?.focus(), 20) } else setQ('') }, [open])
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' }) }, [i])
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])
  const go = (h: SearchHit) => { onClose(); nav(h.path + (h.anchor ? `#${h.anchor}` : '')) }
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[90] flex items-start justify-center p-3 pt-[8vh] sm:p-6 sm:pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" aria-label="Search the docs" initial={{ opacity: 0, y: -10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}
            className="relative flex max-h-[78vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-5 shrink-0 text-accent" />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search docs, guides and tools" aria-label="Search docs" data-bare-input
                role="combobox" aria-expanded={hits.length > 0} aria-controls="docs-search-list" aria-activedescendant={hits[i] ? `docs-hit-${i}` : undefined}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(hits.length - 1, x + 1)) }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)) }
                  if (e.key === 'Enter' && hits[i]) go(hits[i])
                  if (e.key === 'Escape') { e.preventDefault(); onClose() }
                }}
                className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted" />
              <button onClick={onClose} className="rounded-lg border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted hover:text-fg cursor-pointer" aria-label="Close search">Esc</button>
            </div>
            <div ref={list} id="docs-search-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-thin">
              {!q.trim() && (
                <div className="p-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Try</div>
                  <div className="flex flex-wrap gap-1.5">{SUGGEST.map((s) => <button key={s} onClick={() => setQ(s)} className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:border-accent/60 hover:text-fg cursor-pointer">{s}</button>)}</div>
                </div>
              )}
              {q.trim() && hits.length === 0 && <div className="p-8 text-center text-sm text-muted">Nothing for “{q}”. Try a shorter word, or a format like PDF.</div>}
              {hits.map((h, k) => {
                const I = h.anchor ? Hash : KIND_ICON[h.kind]
                return (
                  <button key={h.path + h.anchor + k} id={`docs-hit-${k}`} data-i={k} role="option" aria-selected={k === i} onMouseMove={() => setI(k)} onClick={() => go(h)}
                    className={cn('flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left cursor-pointer', k === i ? 'bg-accent/10' : '')}>
                    <I className={cn('mt-0.5 size-4 shrink-0', k === i ? 'text-accent' : 'text-muted')} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium"><Mark text={h.title} q={q} /></div>
                      <div className="truncate text-[11px] uppercase tracking-wide text-muted">{h.kind === 'Tool' ? `Tool · ${h.context}` : h.anchor ? h.context : h.kind === 'Category' ? 'Tool guide' : 'Docs page'}</div>
                      {h.snippet && <div className="mt-0.5 line-clamp-2 text-xs text-muted"><Mark text={h.snippet} q={q} /></div>}
                    </div>
                    {k === i && <CornerDownLeft className="mt-1 size-3.5 shrink-0 text-muted" />}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-muted">
              <span><kbd className="font-mono">Up</kbd> <kbd className="font-mono">Down</kbd> to move</span><span><kbd className="font-mono">Enter</kbd> to open</span><span className="ml-auto">{q.trim() ? `${hits.length} results` : 'Search runs on your device'}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Mark({ text, q }: { text: string; q: string }) {
  const terms = q.trim().split(/\s+/).filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!terms.length) return <>{text}</>
  const parts = text.split(new RegExp(`(${terms.join('|')})`, 'gi'))
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i} className="rounded bg-accent/25 px-0.5 text-fg">{p}</mark> : p))}</>
}

