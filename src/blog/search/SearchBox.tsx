// Hero search for /blog: a combobox with an instant results panel.
// Keyboard: / focuses it, arrow keys move, Enter opens (or shows every result), Esc closes, Esc again clears.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Search, X, Clock, Film, Headphones, CornerDownLeft, ArrowUp, ArrowDown, History, Hash, Loader2, Sparkles, ListChecks, Timer, ArrowRight, Trash2 } from 'lucide-react'
import { Cover } from '../Cover'
import type { PostMeta } from '../meta'
import { cn } from '@/components/ui'
import type { Hit, ParsedQuery } from './engine'
import { Hl, type IndexStatus } from './support'

type Opt =
  | { kind: 'post'; id: string; hit: Hit; meta: PostMeta }
  | { kind: 'all'; id: string }
  | { kind: 'recent'; id: string; q: string }
  | { kind: 'fix'; id: string; q: string }

export interface SearchBoxProps {
  value: string
  onChange: (v: string) => void
  onFocusBox: () => void
  /** Enter with nothing selected, or "Show all results" */
  onShowAll: () => void
  onOpenPost: (slug: string, sectionId?: string) => void
  hits: Hit[]
  parsed: ParsedQuery
  closest: Hit[]
  /** true when closest came from a loose search, false when it is just the newest posts */
  closestRelated: boolean
  suggestion: string | null
  metaBySlug: Record<string, PostMeta>
  status: IndexStatus
  recent: string[]
  onRemoveRecent: (q: string) => void
  onClearRecent: () => void
  tags: string[]
}

const HINTS: { q: string; label: string; icon: ReactNode; tone: string }[] = [
  { q: 'has:video', label: 'With a video', icon: <Film className="size-3.5" />, tone: 'text-sky-400' },
  { q: 'has:listen', label: 'Can be read aloud', icon: <Headphones className="size-3.5" />, tone: 'text-emerald-400' },
  { q: 'time:<6', label: 'Under 6 minutes', icon: <Timer className="size-3.5" />, tone: 'text-cyan-400' },
  { q: 'has:quiz', label: 'Ends with a quiz', icon: <ListChecks className="size-3.5" />, tone: 'text-teal-400' },
  { q: '"page range"', label: 'Exact phrase', icon: <span className="font-mono text-[13px] leading-none">"</span>, tone: 'text-accent' },
]
const PANEL_POSTS = 6

export function SearchBox(p: SearchBoxProps) {
  const reduce = useReducedMotion()
  const uid = useId().replace(/:/g, '')
  const listId = `bs-list-${uid}`
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(-1)
  const text = p.value.trim()
  const hasQuery = p.parsed.active

  // "/" focuses the box from anywhere on the page, unless you are typing somewhere else
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'))) return
      e.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    // capture phase, so this runs before the site wide "/" shortcut that opens the tools palette
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  // close when clicking outside
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const opts: Opt[] = useMemo(() => {
    const o: Opt[] = []
    if (!hasQuery) { p.recent.forEach((q, i) => o.push({ kind: 'recent', id: `${listId}-r${i}`, q })); return o }
    if (p.hits.length) {
      p.hits.slice(0, PANEL_POSTS).forEach((hit) => { const meta = p.metaBySlug[hit.doc.slug]; if (meta) o.push({ kind: 'post', id: `${listId}-p-${hit.doc.slug}`, hit, meta }) })
      o.push({ kind: 'all', id: `${listId}-all` })
    } else {
      if (p.suggestion) o.push({ kind: 'fix', id: `${listId}-fix`, q: p.suggestion })
      p.closest.slice(0, 3).forEach((hit) => { const meta = p.metaBySlug[hit.doc.slug]; if (meta) o.push({ kind: 'post', id: `${listId}-c-${hit.doc.slug}`, hit, meta }) })
    }
    return o
  }, [hasQuery, p.hits, p.closest, p.suggestion, p.recent, p.metaBySlug, listId])
  useEffect(() => { setActive(-1) }, [p.value])
  const activeOpt = active >= 0 ? opts[active] : undefined

  const choose = (o: Opt) => {
    if (o.kind === 'post') { setOpen(false); p.onOpenPost(o.meta.slug, o.hit.snippet?.id || undefined) }
    else if (o.kind === 'all') { setOpen(false); p.onShowAll() }
    else { p.onChange(o.q); inputRef.current?.focus() }
  }
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => (opts.length ? (a + 1) % opts.length : -1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); setActive((a) => (opts.length ? (a <= 0 ? opts.length - 1 : a - 1) : -1)) }
    else if (e.key === 'Home' && open && active >= 0) { e.preventDefault(); setActive(0) }
    else if (e.key === 'End' && open && active >= 0) { e.preventDefault(); setActive(opts.length - 1) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeOpt && open) choose(activeOpt)
      else { setOpen(false); p.onShowAll() }
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); setOpen(false); setActive(-1) }
      else if (p.value) { e.preventDefault(); p.onChange('') }
    } else if (e.key === 'Tab') setOpen(false)
  }
  // keep the active row in view
  useEffect(() => { if (activeOpt) document.getElementById(activeOpt.id)?.scrollIntoView({ block: 'nearest' }) }, [activeOpt])

  const count = p.hits.length
  const live = !hasQuery ? '' : p.status === 'loading' && p.parsed.textual ? `${count} ${count === 1 ? 'post' : 'posts'} match so far, searching full text` : `${count} ${count === 1 ? 'post matches' : 'posts match'}`
  const showPanel = open && focused

  return (
    <div ref={wrapRef} className="relative" onPointerEnter={p.onFocusBox}>
      {/* soft glow behind the box */}
      <div aria-hidden className={cn('pointer-events-none absolute -inset-3 rounded-[28px] opacity-0 blur-2xl transition-opacity duration-500', focused && 'opacity-100')}
        style={{ background: 'radial-gradient(60% 80% at 30% 50%, color-mix(in oklab, var(--accent) 22%, transparent), transparent 70%), radial-gradient(50% 80% at 80% 50%, color-mix(in oklab, #22D3EE 14%, transparent), transparent 70%)' }} />
      {/* animated gradient border */}
      <div className={cn('relative overflow-hidden rounded-2xl p-[1.5px] transition-shadow duration-300', focused ? 'shadow-[0_18px_60px_-24px_color-mix(in_oklab,var(--accent)_70%,transparent)]' : 'shadow-[0_10px_40px_-28px_rgba(0,0,0,0.8)]')}>
        <motion.div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[160%] -translate-x-1/2 -translate-y-1/2"
          style={{ background: 'conic-gradient(from 0deg, var(--accent), #22D3EE, #10B981, var(--border) 40%, var(--border) 60%, #38BDF8, var(--accent))', opacity: focused ? 1 : 0.45 }}
          animate={reduce ? undefined : { rotate: 360 }} transition={reduce ? undefined : { duration: focused ? 6 : 14, ease: 'linear', repeat: Infinity }} />
        <div className="relative flex h-14 items-center gap-2 rounded-[14.5px] bg-surface pl-4 pr-2 sm:h-16 sm:gap-3 sm:pl-5">
          {p.status === 'loading' && focused ? <Loader2 aria-hidden className="size-5 shrink-0 animate-spin text-accent" /> : <Search aria-hidden className={cn('size-5 shrink-0 transition-colors', focused ? 'text-accent' : 'text-muted')} />}
          <input
            ref={inputRef}
            data-bare-input
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={showPanel}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showPanel && activeOpt ? activeOpt.id : undefined}
            aria-label="Search the blog"
            aria-describedby={`${listId}-help`}
            value={p.value}
            onChange={(e) => { p.onChange(e.target.value); setOpen(true) }}
            onFocus={() => { setFocused(true); setOpen(true); p.onFocusBox() }}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
            placeholder="Search titles, tags and text"
            className="h-full min-w-0 flex-1 appearance-none bg-transparent text-base text-fg outline-none placeholder:text-muted/80 [&::-webkit-search-cancel-button]:hidden sm:text-lg"
          />
          <span id={`${listId}-help`} className="sr-only">Type to search post titles, tags and full text. Filters: tag:name, has:video, has:listen, has:quiz, time:&lt;5. Use arrow keys to move through results.</span>
          {p.value ? (
            <button type="button" onClick={() => { p.onChange(''); inputRef.current?.focus() }} aria-label="Clear search"
              className="grid size-11 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-fg cursor-pointer"><X className="size-5" /></button>
          ) : (
            <kbd aria-hidden className="mr-2 hidden h-7 min-w-7 place-items-center rounded-lg border border-border bg-surface-2 px-2 font-mono text-xs text-muted sm:grid">/</kbd>
          )}
        </div>
      </div>
      <div aria-live="polite" role="status" className="sr-only">{live}</div>

      <AnimatePresence>
        {showPanel && (
          <motion.div
            key="panel"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.99 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-border bg-surface/95 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.75)] backdrop-blur-xl"
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="max-h-[min(70vh,560px)] overflow-y-auto overscroll-contain scrollbar-thin">
              {hasQuery ? (
                <>
                  <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-xs text-muted">
                    <span>{count ? <><span className="font-semibold text-fg">{count}</span> {count === 1 ? 'post matches' : 'posts match'}</> : 'No posts match'}
                      {p.parsed.textual && text && <> for <span className="text-fg">"{text.length > 40 ? text.slice(0, 40) + '...' : text}"</span></>}</span>
                    {p.status === 'loading' && p.parsed.textual && <span className="flex items-center gap-1.5 text-accent"><Loader2 className="size-3 animate-spin" /> Full text</span>}
                    {p.status === 'error' && <span className="text-muted">Titles and tags only</span>}
                  </div>
                  {!count && (
                    <div className="px-4 pb-1 pt-4">
                      <p className="text-sm text-muted">Nothing has those words. Check the spelling, use fewer words, or remove a filter.</p>
                    </div>
                  )}
                  <ul id={listId} role="listbox" aria-label="Search results" className="p-1.5">
                    {opts.map((o, i) => (
                      <Row key={o.id} o={o} i={i} active={i === active} setActive={setActive} choose={choose} parsed={p.parsed} count={count} first={i === opts.findIndex((x) => x.kind === 'post')} empty={!count} related={p.closestRelated} />
                    ))}
                  </ul>
                </>
              ) : (
                <div className="p-1.5">
                  {p.recent.length > 0 && (
                    <>
                      <div className="flex items-center justify-between px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                        <span>Recent searches</span>
                        <button type="button" onClick={p.onClearRecent} className="flex min-h-11 items-center gap-1 rounded-lg px-2 normal-case sm:min-h-9 tracking-normal text-muted hover:text-fg cursor-pointer"><Trash2 className="size-3.5" /> Clear</button>
                      </div>
                    </>
                  )}
                  <ul id={listId} role="listbox" aria-label="Recent searches" className={cn(!p.recent.length && 'hidden')}>
                    {opts.map((o, i) => o.kind === 'recent' && (
                      <li key={o.id} id={o.id} role="option" aria-selected={i === active} onPointerMove={() => setActive(i)} onClick={() => choose(o)}
                        className={cn('group flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm transition-colors', i === active ? 'bg-surface-2 text-fg' : 'text-fg/90 hover:bg-surface-2')}>
                        <History className="size-4 shrink-0 text-muted" />
                        <span className="min-w-0 flex-1 truncate">{o.q}</span>
                        <button type="button" aria-label={`Remove ${o.q} from recent searches`} onClick={(e) => { e.stopPropagation(); p.onRemoveRecent(o.q) }}
                          className="grid size-11 place-items-center rounded-lg text-muted opacity-70 sm:size-9 hover:bg-bg hover:text-fg group-hover:opacity-100 cursor-pointer"><X className="size-4" /></button>
                      </li>
                    ))}
                  </ul>
                  <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Popular topics</div>
                  <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                    {p.tags.slice(0, 14).map((t) => (
                      <button key={t} type="button" onClick={() => { p.onChange(`tag:${t} `); inputRef.current?.focus() }}
                        className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-bg/40 sm:min-h-9 px-3 text-xs text-muted transition hover:border-accent hover:text-fg cursor-pointer"><Hash className="size-3 text-accent" />{t}</button>
                    ))}
                  </div>
                  <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Search tricks</div>
                  <div className="grid gap-1 px-1.5 pb-2 sm:grid-cols-2">
                    {HINTS.map((h) => (
                      <button key={h.q} type="button" onClick={() => { p.onChange(h.q + ' '); inputRef.current?.focus() }}
                        className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-left text-sm transition hover:bg-surface-2 cursor-pointer">
                        <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2', h.tone)}>{h.icon}</span>
                        <span className="min-w-0 flex-1"><span className="font-mono text-xs text-fg">{h.q}</span><span className="block truncate text-xs text-muted">{h.label}</span></span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="hidden items-center gap-4 border-t border-border bg-bg/40 px-4 py-2 text-[11px] text-muted sm:flex">
              <span className="flex items-center gap-1"><Key><ArrowUp className="size-3" /></Key><Key><ArrowDown className="size-3" /></Key> to move</span>
              <span className="flex items-center gap-1"><Key><CornerDownLeft className="size-3" /></Key> to open</span>
              <span className="flex items-center gap-1"><Key>Esc</Key> to close</span>
              <span className="ml-auto flex items-center gap-1"><Sparkles className="size-3 text-accent" /> Searches every word in every post</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const Key = ({ children }: { children: ReactNode }) => <kbd className="inline-grid h-5 min-w-5 place-items-center rounded border border-border bg-surface px-1 font-mono text-[10px] text-fg/80">{children}</kbd>

function Row({ o, i, active, setActive, choose, parsed, count, first, empty, related }: { o: Opt; i: number; active: boolean; setActive: (i: number) => void; choose: (o: Opt) => void; parsed: ParsedQuery; count: number; first: boolean; empty: boolean; related: boolean }) {
  const common = { id: o.id, role: 'option' as const, 'aria-selected': active, onPointerMove: () => setActive(i), onClick: () => choose(o) }
  if (o.kind === 'fix') return (
    <li {...common} className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm', active ? 'bg-surface-2' : 'hover:bg-surface-2')}>
      <Sparkles className="size-4 shrink-0 text-accent" /><span className="text-muted">Did you mean</span><span className="font-medium text-accent">{o.q}</span>
    </li>
  )
  if (o.kind === 'all') return (
    <li {...common} className={cn('mt-1 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 text-sm font-medium transition-colors', active ? 'border-accent bg-accent/10 text-fg' : 'text-muted hover:text-fg')}>
      Show all {count} {count === 1 ? 'result' : 'results'} below <ArrowRight className="size-4 text-accent" />
    </li>
  )
  if (o.kind === 'recent') return null
  const { hit, meta } = o
  const words = hit.words
  const v = hit.doc.video, l = hit.doc.listen
  return (
    <>
      {empty && first && <li role="presentation" className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{related ? 'Closest posts' : 'Newest posts'}</li>}
      <li {...common} className={cn('group relative flex cursor-pointer gap-3 rounded-xl p-2.5 transition-colors sm:gap-4 sm:p-3', active ? 'bg-surface-2' : 'hover:bg-surface-2/70')}>
        {active && <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-full bg-accent" />}
        <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-border sm:h-[68px] sm:w-[104px]">
          <Cover kind={meta.cover} title={meta.title} className="h-full w-full" />
          {v && <span className="absolute bottom-1 left-1 grid size-5 place-items-center rounded-full bg-black/70 text-sky-300"><Film className="size-3" /></span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-semibold leading-snug text-fg sm:text-[15px]"><Hl text={meta.title} words={words} phrases={hit.phrases} /></div>
          {hit.snippet ? (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
              {hit.snippet.h && <span className="mr-1.5 inline-flex items-center rounded-md bg-accent-2/15 px-1.5 py-px text-[10px] font-medium text-accent-2">{hit.snippet.h}</span>}
              <Hl text={hit.snippet.text} words={words} phrases={hit.phrases} />
            </p>
          ) : (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted"><Hl text={meta.description} words={words} phrases={hit.phrases} /></p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted">
            <span className="flex items-center gap-1"><Clock className="size-3" />{meta.minutes} min</span>
            {l && <span className="hidden items-center gap-1 text-emerald-400/90 sm:flex"><Headphones className="size-3" />Listen</span>}
            {meta.tags.slice(0, 3).map((t) => <span key={t} className={cn('rounded-full px-1.5 py-px', parsed.tags.includes(t) ? 'bg-accent/15 text-accent' : 'bg-bg/60')}>#{t}</span>)}
          </div>
        </div>
        <CornerDownLeft aria-hidden className={cn('mt-1 hidden size-4 shrink-0 text-accent transition-opacity sm:block', active ? 'opacity-100' : 'opacity-0')} />
      </li>
    </>
  )
}
