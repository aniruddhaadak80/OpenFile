import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, ChevronRight, ChevronLeft, Menu, X, BookOpen, Rocket, Cpu, Workflow, PencilRuler, Keyboard, Server, Code2, Globe, HelpCircle, GitPullRequest, History as HistoryIcon, FileText, Pencil, ListTree, Database, CornerDownLeft } from 'lucide-react'
import { DOC_NAV, DOC_SECTIONS, docByPath, type DocNavItem } from '@/docs/nav'
import { docMarkdown, searchDocs, type SearchHit } from '@/docs/content'
import { Markdown, type Heading } from '@/components/Markdown'
import { CATEGORIES, TOOLS } from '@/tools/registry'
import { REPO_URL } from '@/components/Layout'
import { setPageMeta } from '@/lib/seo'
import { cn } from '@/components/ui'

const ICONS: Record<string, typeof BookOpen> = {
  'getting-started': Rocket, 'how-it-works': Cpu, 'keyboard-shortcuts': Keyboard, workspace: Workflow, 'sketch-board': PencilRuler, 'local-data': Database,
  'self-hosting': Server, api: Code2, 'browser-support': Globe, faq: HelpCircle, contributing: GitPullRequest, changelog: HistoryIcon,
}
const catColor = (id: string) => CATEGORIES.find((c) => `tools-${c.id}` === id)?.color

export default function Docs() {
  const loc = useLocation()
  const item = docByPath(loc.pathname)
  const [headings, setHeadings] = useState<Heading[]>([])
  const [drawer, setDrawer] = useState(false)
  const md = useMemo(() => (item ? docMarkdown(item) : ''), [item?.id])

  useEffect(() => { setDrawer(false) }, [loc.pathname])
  useEffect(() => {
    if (!item) { setPageMeta('Page not found | OpenFile Docs'); return }
    setPageMeta(item.id === 'changelog' ? 'Changelog | OpenFile' : `${item.title} | OpenFile Docs`, item.description)
  }, [item?.id])

  // scroll to #hash after content renders (Layout scrolls to top on path change first)
  const scrollToHash = () => {
    const id = decodeURIComponent(location.hash.slice(1))
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' })
  }
  useEffect(() => { const a = setTimeout(scrollToHash, 80); const b = setTimeout(scrollToHash, 450); return () => { clearTimeout(a); clearTimeout(b) } }, [md, loc.hash])

  const idx = item ? DOC_NAV.indexOf(item) : -1
  const prev = idx > 0 ? DOC_NAV[idx - 1] : null
  const next = idx >= 0 && idx < DOC_NAV.length - 1 ? DOC_NAV[idx + 1] : null
  const editPath = item ? (item.id.startsWith('tools-') ? 'src/tools/guides.ts' : `src/docs/pages/${item.id}.md`) : ''
  const color = item ? catColor(item.id) : undefined

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 opacity-60" style={{ background: `radial-gradient(700px 240px at 30% 0%, ${color ? color + '22' : 'color-mix(in oklab, var(--accent) 14%, transparent)'}, transparent)` }} />
      <div className="relative mx-auto grid max-w-[1400px] gap-10 px-4 pt-8 sm:px-6 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_210px]">
        {/* sidebar */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-10 pr-2 scrollbar-thin">
            <Sidebar current={item?.id} />
          </div>
        </aside>

        {/* main */}
        <main className="min-w-0">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <button onClick={() => setDrawer(true)} className="flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm cursor-pointer" aria-label="Open docs menu"><Menu className="size-4" /> Docs menu</button>
            <div className="min-w-0 flex-1"><DocsSearch compact /></div>
          </div>
          <nav className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <Link to="/" className="hover:text-fg">Home</Link><ChevronRight className="size-3" />
            <Link to="/docs" className="hover:text-fg">Docs</Link>
            {item && item.id !== 'getting-started' && <><ChevronRight className="size-3" /><span className="text-muted">{item.section}</span><ChevronRight className="size-3" /><span className="text-fg">{item.title}</span></>}
          </nav>

          {!item ? (
            <div className="py-24 text-center">
              <div className="font-display text-6xl font-bold text-gradient">404</div>
              <p className="mt-3 text-muted">This docs page does not exist. Try searching, or start from the beginning.</p>
              <Link to="/docs" className="mt-6 inline-flex rounded-xl bg-gradient-brand px-5 py-2.5 text-sm font-medium text-on-accent">Getting started</Link>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.article key={item.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} className="mt-4">
                {item.id.startsWith('tools-') && <CategoryHeader id={item.id} />}
                <Markdown md={md} onHeadings={setHeadings} onRendered={scrollToHash} />
                {item.id === 'getting-started' && <DocsCards />}
                <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-sm text-muted">
                  <a href={`${REPO_URL}/blob/main/${editPath}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-fg"><Pencil className="size-3.5" /> Edit this page on GitHub</a>
                  <Link to="/changelog" className="hover:text-fg">What’s new →</Link>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {prev ? <PagerLink item={prev} dir="prev" /> : <span className="hidden sm:block" />}
                  {next && <PagerLink item={next} dir="next" />}
                </div>
              </motion.article>
            </AnimatePresence>
          )}
        </main>

        {/* table of contents */}
        <aside className="hidden xl:block">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-10 scrollbar-thin">
            <Toc headings={headings} key={item?.id} />
          </div>
        </aside>
      </div>

      {/* mobile drawer */}
      <AnimatePresence>
        {drawer && (
          <motion.div className="fixed inset-0 z-[80] lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDrawer(false)} />
            <motion.div initial={{ x: -320 }} animate={{ x: 0 }} exit={{ x: -320 }} transition={{ type: 'spring', damping: 28, stiffness: 280 }} className="absolute inset-y-0 left-0 w-[300px] overflow-y-auto border-r border-border bg-surface p-5 scrollbar-thin">
              <div className="mb-4 flex items-center justify-between"><span className="font-display font-semibold">Documentation</span><button onClick={() => setDrawer(false)} className="rounded-lg p-1 text-muted hover:text-fg cursor-pointer" aria-label="Close"><X className="size-5" /></button></div>
              <Sidebar current={item?.id} hideSearch />
              {headings.length > 0 && <div className="mt-6 border-t border-border pt-4"><Toc headings={headings} /></div>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Sidebar({ current, hideSearch }: { current?: string; hideSearch?: boolean }) {
  return (
    <div>
      {!hideSearch && <DocsSearch />}
      <div className="mt-6 space-y-6">
        {DOC_SECTIONS.map((sec) => (
          <div key={sec}>
            <div className="mb-2 px-2 text-[11px] font-bold uppercase tracking-widest text-muted">{sec}</div>
            <ul className="space-y-0.5">
              {DOC_NAV.filter((d) => d.section === sec).map((d) => {
                const I = ICONS[d.id] ?? FileText
                const c = catColor(d.id)
                const active = d.id === current
                return (
                  <li key={d.id}>
                    <NavLink to={d.path} end className={cn('group relative flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition', active ? 'bg-accent/10 font-medium text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
                      {active && <motion.span layoutId="docs-active" className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent" />}
                      {c ? <span className="ml-1 mr-0.5 size-2 shrink-0 rounded-full" style={{ background: c }} /> : <I className={cn('size-4 shrink-0', active ? 'text-accent' : '')} />}
                      <span className="truncate">{d.title}</span>
                      {d.id.startsWith('tools-') && <span className="ml-auto text-[11px] text-muted/70">{TOOLS.filter((t) => `tools-${t.category}` === d.id).length}</span>}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

function DocsSearch({ compact }: { compact?: boolean }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [i, setI] = useState(0)
  const nav = useNavigate()
  const ref = useRef<HTMLInputElement>(null)
  const hits = useMemo(() => searchDocs(q, 10), [q])
  useEffect(() => setI(0), [q])
  useEffect(() => {
    if (compact) return
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && !el.isContentEditable) { e.preventDefault(); ref.current?.focus() }
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [compact])
  const go = (h: SearchHit) => { nav(h.path + (h.anchor ? `#${h.anchor}` : '')); setOpen(false); setQ(''); ref.current?.blur() }
  return (
    <div className="relative">
      <div className="flex h-10 items-center gap-2 of-field-wrap rounded-xl border border-border bg-surface px-3">
        <Search className="size-4 shrink-0 text-muted" />
        <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(hits.length - 1, x + 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)) }
            if (e.key === 'Enter' && hits[i]) go(hits[i])
            if (e.key === 'Escape') { setQ(''); (e.target as HTMLInputElement).blur() }
          }}
          placeholder="Search docs" aria-label="Search docs" data-bare-input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted" />
        {!compact && !q && <kbd className="rounded border border-border px-1.5 font-mono text-[10px] text-muted">/</kbd>}
        {q && <button onMouseDown={(e) => e.preventDefault()} onClick={() => setQ('')} className="text-muted hover:text-fg cursor-pointer" aria-label="Clear"><X className="size-3.5" /></button>}
      </div>
      <AnimatePresence>
        {open && q.trim() && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
            className="absolute left-0 top-full z-40 mt-2 w-[min(30rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
            <div className="max-h-[60vh] overflow-y-auto p-2 scrollbar-thin">
              {hits.length === 0 && <div className="p-5 text-center text-sm text-muted">No results for “{q}”.</div>}
              {hits.map((h, k) => (
                <button key={h.docId + h.anchor + k} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setI(k)} onClick={() => go(h)}
                  className={cn('flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left cursor-pointer', k === i ? 'bg-surface-2' : '')}>
                  <ListTree className="mt-0.5 size-4 shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium"><Mark text={h.heading} q={q} /></div>
                    <div className="truncate text-[11px] uppercase tracking-wide text-muted">{h.docTitle}</div>
                    {h.snippet && <div className="mt-0.5 line-clamp-2 text-xs text-muted"><Mark text={h.snippet} q={q} /></div>}
                  </div>
                  {k === i && <CornerDownLeft className="mt-1 size-3.5 shrink-0 text-muted" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Mark({ text, q }: { text: string; q: string }) {
  const terms = q.trim().split(/\s+/).filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!terms.length) return <>{text}</>
  const parts = text.split(new RegExp(`(${terms.join('|')})`, 'gi'))
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i} className="rounded bg-accent/20 px-0.5 text-fg">{p}</mark> : p))}</>
}

function Toc({ headings }: { headings: Heading[] }) {
  const [active, setActive] = useState<string | null>(null)
  useEffect(() => {
    if (!headings.length) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        let cur: string | null = headings[0]?.id ?? null
        for (const h of headings) { const el = document.getElementById(h.id); if (el && el.getBoundingClientRect().top < 130) cur = h.id }
        if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) cur = headings[headings.length - 1].id
        setActive(cur)
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [headings])
  if (!headings.length) return null
  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: document.documentElement.classList.contains('reduce-motion') ? 'auto' : 'smooth', block: 'start' })
    history.replaceState(history.state, '', `#${id}`)
  }
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted"><ListTree className="size-3.5" /> On this page</div>
      <ul className="space-y-0.5 border-l border-border">
        {headings.map((h) => (
          <li key={h.id}>
            <button onClick={() => jump(h.id)} className={cn('-ml-px block w-full border-l-2 py-1 text-left text-[13px] leading-snug transition cursor-pointer', h.depth === 3 ? 'pl-6' : 'pl-3', active === h.id ? 'border-accent font-medium text-fg' : 'border-transparent text-muted hover:text-fg')}>{h.text}</button>
          </li>
        ))}
      </ul>
      <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="mt-4 text-xs text-muted hover:text-fg cursor-pointer">↑ Back to top</button>
    </div>
  )
}

function PagerLink({ item, dir }: { item: DocNavItem; dir: 'prev' | 'next' }) {
  return (
    <Link to={item.path} className={cn('group flex flex-col rounded-2xl border border-border bg-surface p-4 transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-xl', dir === 'next' && 'sm:col-start-2 sm:items-end sm:text-right')}>
      <span className="flex items-center gap-1 text-xs text-muted">{dir === 'prev' ? <><ChevronLeft className="size-3.5" /> Previous</> : <>Next <ChevronRight className="size-3.5" /></>}</span>
      <span className="mt-1 font-medium group-hover:text-accent">{item.title}</span>
    </Link>
  )
}

function CategoryHeader({ id }: { id: string }) {
  const c = CATEGORIES.find((x) => `tools-${x.id}` === id)!
  const list = TOOLS.filter((t) => t.category === c.id)
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs"><span className="size-2 rounded-full" style={{ background: c.color }} />{list.length} tools · generated from the registry</span>
      <Link to={`/category/${c.id}`} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted hover:text-fg">Browse {c.name} <ChevronRight className="size-3" /></Link>
    </div>
  )
}

function DocsCards() {
  const cards: [string, string, string, typeof BookOpen][] = [
    ['/docs/tools/pdf', 'Tool guides', `Every one of the ${TOOLS.length} tools, with steps and tips.`, BookOpen],
    ['/docs/how-it-works', 'How it works', 'Zero-upload architecture and the engines.', Cpu],
    ['/docs/workspace', 'Workspace pipelines', 'Batch-process hundreds of files.', Workflow],
    ['/docs/sketch-board', 'Sketch board', 'Whiteboard tools, sharing and shortcuts.', PencilRuler],
    ['/docs/self-hosting', 'Self-hosting', 'Vercel, GitHub Pages, Docker, any host.', Server],
    ['/docs/contributing', 'Add a tool', 'Contribute to OpenFile in minutes.', GitPullRequest],
  ]
  return (
    <div className="mt-10 grid gap-3 sm:grid-cols-2">
      {cards.map(([to, t, d, I], k) => (
        <motion.div key={to} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * k }}>
          <Link to={to} className="group flex h-full items-start gap-3 rounded-2xl border border-border bg-surface p-4 transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-xl">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-brand text-on-accent shadow-lg shadow-accent/20 transition group-hover:scale-110"><I className="size-5" /></div>
            <div><div className="font-semibold group-hover:text-accent">{t}</div><div className="text-sm text-muted">{d}</div></div>
          </Link>
        </motion.div>
      ))}
    </div>
  )
}
