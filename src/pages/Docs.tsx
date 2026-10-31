// OpenFile documentation site at /docs. Navigation lives in src/pages/docs/nav.ts, page sources in
// src/pages/docs/content/*.md (plus the original pages in src/docs/pages), and every count or list is generated.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import { ChevronRight, ChevronLeft, ChevronDown, Menu, X, Pencil, ListTree, CalendarClock, Clock, ArrowUp, FileText, Rocket, Download, Cpu, MousePointerClick, Workflow, Keyboard, Palette, PencilRuler, Database, WifiOff, Share2, Sparkles, ShieldCheck, Globe, FileType, LayoutGrid, Code2, Server, LifeBuoy, HelpCircle, Terminal, GitPullRequest, History, Map as MapIcon } from 'lucide-react'
import type { Heading } from '@/components/Markdown'
import { CATEGORIES } from '@/tools/registry'
import { REPO_URL } from '@/components/Layout'
import { setPageMeta } from '@/lib/seo'
import { cn } from '@/components/ui'
import { DOC_GROUPS, DOC_PAGES, ALL_PAGES, CATEGORY_PAGES, pageByPath, docAlias, toolCountFor, type DocPage } from './docs/nav'
import { pageMarkdown, GEN } from './docs/data'
import { DocContent } from './docs/DocContent'
import { SearchButton, SearchDialog } from './docs/Search'
import './docs/docs.css'

const reduced = () => document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches
const ICONS: Record<string, typeof FileText> = { Rocket, Download, Cpu, MousePointerClick, Workflow, Keyboard, Palette, PencilRuler, Database, WifiOff, Share2, Sparkles, ShieldCheck, Globe, FileType, LayoutGrid, Code2, Server, LifeBuoy, HelpCircle, Terminal, GitPullRequest, History, Map: MapIcon }
const iconFor = (p: DocPage) => (p.icon && ICONS[p.icon]) || FileText
const catColor = (p: DocPage) => (p.source === 'category' ? CATEGORIES.find((c) => `tools-${c.id}` === p.id)?.color : undefined)
const fmtDate = (d: string) => { try { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) } catch { return d } }

/** Which heading is in view: the last one whose top has passed the header. */
function useActiveHeading(headings: Heading[]) {
  const [active, setActive] = useState<string | null>(null)
  useEffect(() => {
    if (!headings.length) { setActive(null); return }
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        // the last heading above the line; near the bottom of the page the line moves down, so short final
        // sections (and a jump to one of them) still get highlighted
        const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8
        const line = atEnd ? window.innerHeight * 0.6 : 140
        let cur: string | null = headings[0]?.id ?? null
        for (const h of headings) { const el = document.getElementById(h.id); if (el && el.getBoundingClientRect().top < line) cur = h.id }
        const hash = decodeURIComponent(location.hash.slice(1))
        if (atEnd && hash && headings.some((h) => h.id === hash)) { const el = document.getElementById(hash); const top = el?.getBoundingClientRect().top ?? -1; if (top >= 0 && top < window.innerHeight * 0.6) cur = hash }
        setActive(cur)
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf) }
  }, [headings])
  return active
}

function jumpTo(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' })
  history.replaceState(history.state, '', `#${id}`)
}

export default function Docs() {
  const loc = useLocation()
  const page = pageByPath(loc.pathname)
  const [headings, setHeadings] = useState<Heading[]>([])
  const [drawer, setDrawer] = useState(false)
  const [search, setSearch] = useState(false)
  const md = useMemo(() => (page ? pageMarkdown(page) : ''), [page?.id])
  const active = useActiveHeading(headings)

  useEffect(() => { setDrawer(false); setSearch(false) }, [loc.pathname])
  useEffect(() => {
    if (!page) { setPageMeta('Page not found | OpenFile Docs'); return }
    setPageMeta(page.id === 'changelog' ? 'Changelog | OpenFile' : `${page.title} | OpenFile Docs`, page.description)
  }, [page?.id])

  // "/" opens search anywhere in the docs (the global shortcut handler leaves "/" alone on docs pages)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && !t.isContentEditable) { e.preventDefault(); setSearch(true) }
      if (e.key === 'Escape') setDrawer(false)
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [])

  // deep links: scroll to #hash once the content is in the page (and again after mermaid and late layout)
  const scrollToHash = useCallback(() => {
    const id = decodeURIComponent(location.hash.slice(1))
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' })
  }, [])
  useEffect(() => { const a = setTimeout(scrollToHash, 90); const b = setTimeout(scrollToHash, 500); return () => { clearTimeout(a); clearTimeout(b) } }, [md, loc.hash])

  const idx = page ? ALL_PAGES.indexOf(page) : -1
  const prev = idx > 0 ? ALL_PAGES[idx - 1] : null
  const next = idx >= 0 && idx < ALL_PAGES.length - 1 ? ALL_PAGES[idx + 1] : null
  const parent = page?.parent ? ALL_PAGES.find((p) => p.id === page.parent) : null
  const updated = page ? GEN.lastUpdated[page.id] || (page.source === 'category' ? GEN.lastUpdated.tools : '') : ''
  const minutes = Math.max(1, Math.round(md.replace(/```[\s\S]*?```/g, '').split(/\s+/).length / 220))
  const color = page ? catColor(page) : undefined

  return (
    <MotionConfig reducedMotion="user">
      <ReadingProgress />
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-80 opacity-60" style={{ background: `radial-gradient(700px 240px at 30% 0%, ${color ? color + '22' : 'color-mix(in oklab, var(--accent) 14%, transparent)'}, transparent)` }} />
        <div className="relative mx-auto grid max-w-[1440px] gap-8 px-4 pt-6 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:pt-8 xl:grid-cols-[260px_minmax(0,1fr)_220px] xl:gap-10">
          <aside className="hidden lg:block" aria-label="Docs navigation">
            <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-10 pr-2 pt-1 scrollbar-thin">
              <SearchButton onOpen={() => setSearch(true)} />
              <Sidebar current={page} headings={headings} active={active} />
            </div>
          </aside>

          <div className="min-w-0 pb-16" id="docs-main">
            <div className="sticky top-16 z-30 -mx-4 mb-4 flex items-center gap-2 border-b border-border bg-bg/85 px-4 py-2 backdrop-blur lg:hidden">
              <button onClick={() => setDrawer(true)} className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm cursor-pointer" aria-label="Open docs menu" aria-expanded={drawer} aria-controls="docs-drawer"><Menu className="size-4" /> Menu</button>
              <div className="min-w-0 flex-1"><SearchButton compact onOpen={() => setSearch(true)} /></div>
            </div>

            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <Link to="/" className="hover:text-fg">Home</Link><ChevronRight className="size-3" aria-hidden />
              <Link to="/docs" className="hover:text-fg">Docs</Link>
              {page && page.id !== 'getting-started' && <>
                <ChevronRight className="size-3" aria-hidden /><span>{page.group}</span>
                {parent && <><ChevronRight className="size-3" aria-hidden /><Link to={parent.path} className="hover:text-fg">{parent.title}</Link></>}
                <ChevronRight className="size-3" aria-hidden /><span className="text-fg" aria-current="page">{page.title}</span>
              </>}
            </nav>

            {!page && docAlias(loc.pathname) ? <Navigate to={`${docAlias(loc.pathname)}${loc.hash}`} replace /> : !page ? (
              <div className="py-24 text-center">
                <div className="font-display text-6xl font-bold text-gradient">404</div>
                <p className="mt-3 text-muted">This docs page does not exist. Search for it, or start from the beginning.</p>
                <div className="mt-6 flex justify-center gap-2">
                  <Link to="/docs" className="inline-flex rounded-xl bg-gradient-brand px-5 py-2.5 text-sm font-medium text-on-accent">Getting started</Link>
                  <button onClick={() => setSearch(true)} className="rounded-xl border border-border px-5 py-2.5 text-sm cursor-pointer">Search the docs</button>
                </div>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.article key={page.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="mt-4">
                  <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                    <span className="font-semibold uppercase tracking-widest" style={{ color: color ?? 'var(--accent)' }}>{page.parent ? 'Tool guide' : page.group}</span>
                    <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden />{minutes} min read</span>
                    {updated && <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" aria-hidden />Updated <time dateTime={updated}>{fmtDate(updated)}</time></span>}
                  </div>
                  {page.source === 'category' && <CategoryBadge page={page} />}
                  <DocContent md={md} onHeadings={setHeadings} onRendered={scrollToHash} />
                  <footer className="mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-sm text-muted">
                    <a href={`${REPO_URL}/blob/main/${page.edit.split(',')[0]}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-fg"><Pencil className="size-3.5" /> Edit this page on GitHub</a>
                    {updated && <span>Last updated {fmtDate(updated)}</span>}
                  </footer>
                  <nav aria-label="Previous and next page" className="mt-6 grid gap-3 sm:grid-cols-2">
                    {prev ? <Pager page={prev} dir="prev" /> : <span className="hidden sm:block" />}
                    {next && <Pager page={next} dir="next" />}
                  </nav>
                </motion.article>
              </AnimatePresence>
            )}
          </div>

          <aside className="hidden xl:block" aria-label="On this page">
            <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-10 scrollbar-thin">
              <Toc headings={headings} active={active} />
            </div>
          </aside>
        </div>

        <Drawer open={drawer} onClose={() => setDrawer(false)}>
          <SearchButton onOpen={() => { setDrawer(false); setSearch(true) }} />
          <Sidebar current={page} headings={headings} active={active} onPick={() => setDrawer(false)} />
        </Drawer>
        <SearchDialog open={search} onClose={() => setSearch(false)} />
      </div>
    </MotionConfig>
  )
}

function ReadingProgress() {
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const h = document.documentElement.scrollHeight - innerHeight; if (bar.current) bar.current.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})` }) }
    on(); addEventListener('scroll', on, { passive: true }); addEventListener('resize', on)
    return () => { removeEventListener('scroll', on); removeEventListener('resize', on); cancelAnimationFrame(raf) }
  }, [])
  return <div className="pointer-events-none fixed inset-x-0 top-0 z-[75] h-0.5" aria-hidden><div ref={bar} className="docs-progress h-full origin-left bg-gradient-brand" style={{ transform: 'scaleX(0)' }} /></div>
}

function Sidebar({ current, headings, active, onPick }: { current?: DocPage; headings: Heading[]; active: string | null; onPick?: () => void }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const [guidesOpen, setGuidesOpen] = useState(() => !!current?.parent || current?.id === 'tools')
  useEffect(() => { if (current?.parent || current?.id === 'tools') setGuidesOpen(true) }, [current?.id])
  const sub = headings.filter((h) => h.depth === 2)
  const item = (p: DocPage, nested = false) => {
    const I = iconFor(p)
    const isActive = p.id === current?.id
    const c = catColor(p)
    return (
      <li key={p.id}>
        <Link to={p.path} onClick={onPick} aria-current={isActive ? 'page' : undefined}
          className={cn('group relative flex min-h-9 items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition', nested && 'min-h-8 py-1 text-[13px]', isActive ? 'bg-accent/10 font-medium text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
          {isActive && <motion.span layoutId="docs-active" className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent" />}
          {c ? <span className="ml-1 mr-0.5 size-2 shrink-0 rounded-full" style={{ background: c }} /> : <I className={cn('size-4 shrink-0', isActive && 'text-accent')} />}
          <span className="min-w-0 leading-snug">{p.title}</span>
          {p.source === 'category' && <span className="ml-auto text-[11px] tabular-nums text-muted/70">{toolCountFor(p.id.slice(6))}</span>}
        </Link>
        {isActive && sub.length > 1 && (
          <ul className="my-1 ml-[1.1rem] border-l border-border pl-2">
            {sub.map((h) => (
              <li key={h.id}><a href={`#${h.id}`} onClick={(e) => { e.preventDefault(); jumpTo(h.id); onPick?.() }}
                className={cn('-ml-[9px] block border-l-2 py-1 pl-3 text-[12.5px] leading-snug transition', active === h.id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg')}>{h.text}</a></li>
            ))}
          </ul>
        )}
        {p.id === 'tools' && (
          <div className="ml-[1.1rem]">
            <button onClick={() => setGuidesOpen((v) => !v)} aria-expanded={guidesOpen} className="flex w-full items-center gap-1 py-1 pl-2 text-[12px] text-muted hover:text-fg cursor-pointer">
              <ChevronDown className={cn('size-3.5 transition', !guidesOpen && '-rotate-90')} /> Tool guides by category ({CATEGORY_PAGES.length})
            </button>
            <AnimatePresence initial={false}>
              {guidesOpen && <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-l border-border pl-1">{CATEGORY_PAGES.map((c) => item(c, true))}</motion.ul>}
            </AnimatePresence>
          </div>
        )}
      </li>
    )
  }
  return (
    <div className="mt-5 space-y-5">
      {DOC_GROUPS.map((g) => (
        <div key={g}>
          <button onClick={() => setClosed((s) => ({ ...s, [g]: !s[g] }))} aria-expanded={!closed[g]} className="mb-1.5 flex w-full items-center justify-between px-2 text-[11px] font-bold uppercase tracking-widest text-muted hover:text-fg cursor-pointer">
            {g}<ChevronDown className={cn('size-3.5 transition', closed[g] && '-rotate-90')} />
          </button>
          <AnimatePresence initial={false}>
            {!closed[g] && <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-0.5 overflow-hidden">{DOC_PAGES.filter((p) => p.group === g).map((p) => item(p))}</motion.ul>}
          </AnimatePresence>
        </div>
      ))}
    </div>
  )
}

function Toc({ headings, active }: { headings: Heading[]; active: string | null }) {
  if (!headings.length) return null
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted"><ListTree className="size-3.5" /> On this page</div>
      <ul className="space-y-0.5 border-l border-border">
        {headings.map((h, i) => (
          <li key={h.id + i}>
            <a href={`#${h.id}`} onClick={(e) => { e.preventDefault(); jumpTo(h.id) }} aria-current={active === h.id ? 'location' : undefined}
              className={cn('-ml-px block border-l-2 py-1 text-[13px] leading-snug transition', h.depth === 3 ? 'pl-6' : 'pl-3', active === h.id ? 'border-accent font-medium text-fg' : 'border-transparent text-muted hover:text-fg')}>{h.text}</a>
          </li>
        ))}
      </ul>
      <button onClick={() => window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' })} className="mt-4 inline-flex items-center gap-1 text-xs text-muted hover:text-fg cursor-pointer"><ArrowUp className="size-3" /> Back to top</button>
    </div>
  )
}

function Pager({ page, dir }: { page: DocPage; dir: 'prev' | 'next' }) {
  return (
    <Link to={page.path} rel={dir} className={cn('group flex flex-col rounded-2xl border border-border bg-surface p-4 transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-xl', dir === 'next' && 'sm:col-start-2 sm:items-end sm:text-right')}>
      <span className="flex items-center gap-1 text-xs text-muted">{dir === 'prev' ? <><ChevronLeft className="size-3.5" /> Previous</> : <>Next <ChevronRight className="size-3.5" /></>}</span>
      <span className="mt-1 font-medium group-hover:text-accent">{page.title}</span>
    </Link>
  )
}

function CategoryBadge({ page }: { page: DocPage }) {
  const id = page.id.slice(6)
  const c = CATEGORIES.find((x) => x.id === id)
  if (!c) return null
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs"><span className="size-2 rounded-full" style={{ background: c.color }} />{toolCountFor(id)} tools, generated from the registry</span>
      <Link to={`/category/${c.id}`} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted hover:text-fg">Browse {c.name} <ChevronRight className="size-3" /></Link>
    </div>
  )
}

function Drawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>('[aria-current="page"], a, button')?.focus(), 60)
    return () => { document.body.style.overflow = prev; clearTimeout(t) }
  }, [open])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[80] lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
          <motion.div ref={panel} id="docs-drawer" role="dialog" aria-modal="true" aria-label="Docs menu" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="absolute inset-y-0 left-0 w-[min(320px,88vw)] overflow-y-auto border-r border-border bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] scrollbar-thin">
            <div className="mb-4 flex items-center justify-between"><span className="font-display font-semibold">Documentation</span><button onClick={onClose} className="grid size-10 place-items-center rounded-lg text-muted hover:text-fg cursor-pointer" aria-label="Close docs menu"><X className="size-5" /></button></div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
