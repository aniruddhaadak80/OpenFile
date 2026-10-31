import { useEffect, useMemo, useState } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { Search, Star, Clock, ArrowRight, LayoutGrid, List, SlidersHorizontal, X, GitCompare, Check, BookOpen, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useFavorites, useRecent } from '@/lib/store'
import { getIcon } from '@/components/icons'
import { CATEGORIES, TOOLS, toolBySlug, type Category, type ToolMeta } from '@/tools/registry'
import { ToolCard } from '@/components/ToolCard'
import { searchTools } from '@/components/CommandPalette'
import { allFormats, toolFormats, INPUT_KINDS, type InputKind } from '@/lib/formats'
import { setJsonLd, setPageMeta } from '@/lib/seo'
import { EmptyState } from '@/components/EmptyState'
import { CompareTray, useCompare } from '@/components/CompareTools'
import { DOC_NAV } from '@/docs/nav'
import { cn } from '@/components/ui'

type Sort = 'relevance' | 'popular' | 'az' | 'za' | 'category'
const SORTS: { id: Sort; label: string }[] = [{ id: 'relevance', label: 'Relevance' }, { id: 'popular', label: 'Most popular' }, { id: 'az', label: 'Name A to Z' }, { id: 'za', label: 'Name Z to A' }, { id: 'category', label: 'Category' }]
const VIEW_KEY = 'of:tools-view'

export default function Tools() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const format = (params.get('format') || '').toUpperCase()
  const input = (params.get('input') || '') as InputKind | ''
  const sort = (params.get('sort') as Sort) || 'relevance'
  const [view, setView] = useState<'grid' | 'list'>(() => { try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid' } catch { return 'grid' } })
  const [onlyFav, setOnlyFav] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const { fav } = useFavorites()
  const { recent } = useRecent()
  const cat = ((id as Category) || 'all') as Category | 'all'
  const c = CATEGORIES.find((x) => x.id === cat)
  useEffect(() => {
    setPageMeta(`${c ? c.name : 'All tools'} | OpenFile`, c ? `${c.blurb}. Free tools that run in your browser.` : `${TOOLS.length} tools for documents, images, media and code, all running in your browser.`)
    const home = location.origin + import.meta.env.BASE_URL
    setJsonLd('crumbs', { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: home }, { '@type': 'ListItem', position: 2, name: 'All tools', item: home + 'tools' }, ...(c ? [{ '@type': 'ListItem', position: 3, name: c.name, item: home + 'category/' + c.id }] : [])] })
    return () => setJsonLd('crumbs', null)
  }, [c])
  const cmp = useCompare()
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view) } catch { /* ignore */ } }, [view])
  const setParam = (k: string, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }) }
  useEffect(() => { const t = setTimeout(() => setParam('q', q.trim()), 250); return () => clearTimeout(t) }, [q])

  const inCat = useMemo(() => TOOLS.filter((t) => cat === 'all' || t.category === cat), [cat])
  const formats = useMemo(() => allFormats(inCat).slice(0, 36), [inCat])
  const list = useMemo(() => {
    let l = searchTools(q).filter((t) => (cat === 'all' || t.category === cat) && (!onlyFav || fav.includes(t.slug)) && (!format || toolFormats(t).all.includes(format)) && (!input || toolFormats(t).kind === input))
    const order = CATEGORIES.map((x) => x.id)
    if (sort === 'popular') l = [...l].sort((a, b) => Number(!!b.popular) - Number(!!a.popular) || Number(!!b.badge) - Number(!!a.badge))
    else if (sort === 'az') l = [...l].sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'za') l = [...l].sort((a, b) => b.name.localeCompare(a.name))
    else if (sort === 'category') l = [...l].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || a.name.localeCompare(b.name))
    return l
  }, [q, cat, onlyFav, fav, format, input, sort])
  const recentTools = recent.map(toolBySlug).filter((t): t is NonNullable<typeof t> => !!t && (cat === 'all' || t.category === cat)).slice(0, 8)
  const activeFilters = [format && { k: 'format', l: `.${format.toLowerCase()}` }, input && { k: 'input', l: INPUT_KINDS.find((x) => x.id === input)?.label ?? input }].filter(Boolean) as { k: string; l: string }[]
  const qs = (extra = '') => { const n = new URLSearchParams(params); n.delete('q'); const s = n.toString(); return s ? `?${s}${extra}` : extra }

  return (
    <div className={cn('relative', cmp.mode && 'pb-24')}>
      <div className="dot-bg pointer-events-none absolute inset-x-0 top-0 h-72" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80" style={{ background: `radial-gradient(600px 240px at 20% 0%, ${c ? c.color + '22' : 'color-mix(in oklab, var(--accent) 12%, transparent)'}, transparent)` }} />
      <div className="relative mx-auto max-w-7xl px-4 pt-12 sm:px-6">
        <motion.h1 key={cat} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="font-display text-4xl font-bold tracking-tight sm:text-5xl">{c ? c.name : <>All <span className="text-gradient">tools</span></>}</motion.h1>
        <p className="mt-2 text-muted">{c ? c.blurb : `${TOOLS.length} tools for documents, images, media and code, all running in your browser.`}</p>

        {c && <CategoryStrip cat={c.id} />}
        <div className="mt-8 flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex h-11 flex-1 items-center gap-2 of-field-wrap rounded-xl border border-border bg-surface px-3"><Search className="size-4 shrink-0 text-muted" /><input data-bare-input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter tools" aria-label="Filter tools" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />{q && <button onClick={() => setQ('')} aria-label="Clear search" className="text-muted hover:text-fg cursor-pointer"><X className="size-4" /></button>}</div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={sort} onChange={(e) => setParam('sort', e.target.value === 'relevance' ? '' : e.target.value)} aria-label="Sort tools" className="of-field h-11 min-w-36 flex-1 rounded-xl md:flex-none border border-border bg-surface px-3 text-sm outline-none cursor-pointer">
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <button onClick={() => setShowFilters((v) => !v)} className={cn('flex h-11 items-center gap-2 rounded-xl border px-3 text-sm transition cursor-pointer', showFilters || activeFilters.length ? 'border-accent text-fg' : 'border-border text-muted hover:text-fg')} aria-expanded={showFilters}><SlidersHorizontal className="size-4" /> Filters{activeFilters.length ? <span className="grid size-5 place-items-center rounded-full bg-accent text-[10px] font-bold text-on-accent">{activeFilters.length}</span> : null}</button>
            <button onClick={() => cmp.setMode(!cmp.mode)} aria-pressed={cmp.mode} title="Compare up to 3 tools side by side" className={cn('flex h-11 items-center gap-2 rounded-xl border px-3 text-sm transition cursor-pointer', cmp.mode ? 'border-accent bg-accent/10 text-fg' : 'border-border text-muted hover:text-fg')}><GitCompare className="size-4" /><span className="hidden sm:inline">Compare</span>{cmp.picked.length ? <span className="grid size-5 place-items-center rounded-full bg-accent text-[10px] font-bold text-on-accent">{cmp.picked.length}</span> : null}</button>
            <div className="flex h-11 items-center rounded-xl border border-border bg-surface p-1" role="group" aria-label="View">
              {(['grid', 'list'] as const).map((v) => { const I = v === 'grid' ? LayoutGrid : List; return (
                <button key={v} onClick={() => setView(v)} aria-pressed={view === v} aria-label={`${v} view`} className={cn('relative grid h-full w-9 place-items-center rounded-lg transition cursor-pointer', view === v ? 'text-fg' : 'text-muted hover:text-fg')}>
                  {view === v && <motion.span layoutId="view-pill" className="absolute inset-0 rounded-lg bg-surface-2" />}<I className="relative size-4" />
                </button>) })}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => setOnlyFav((v) => !v)} className={cn('flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition cursor-pointer', onlyFav ? 'bg-warn/15 text-warn ring-1 ring-warn/40' : 'border border-border text-muted hover:text-fg')} aria-pressed={onlyFav}><Star className={cn('size-3.5', onlyFav && 'fill-current')} /> Favorites{fav.length ? ` ${fav.length}` : ''}</button>
          {[{ id: 'all', name: 'All', color: '' }, ...CATEGORIES].map((x) => (
            <Link key={x.id} to={(x.id === 'all' ? '/tools' : `/category/${x.id}`) + qs()} className={cn('relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition', cat === x.id ? 'text-bg' : 'border border-border text-muted hover:text-fg')}>
              {cat === x.id && <motion.span layoutId="cat-chip" className="absolute inset-0 rounded-full bg-fg" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
              {x.color && <span className="relative size-2 rounded-full" style={{ background: x.color }} />}<span className="relative">{x.name}</span>
            </Link>
          ))}
        </div>

        <AnimatePresence initial={false}>
          {showFilters && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mt-4 grid gap-5 rounded-2xl border border-border bg-surface p-5 md:grid-cols-[1fr_260px]">
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">File format</div>
                  <div className="flex flex-wrap gap-1.5">
                    {formats.map(({ format: f, count, group }) => (
                      <button key={f} onClick={() => setParam('format', format === f ? '' : f)} className={cn('rounded-md border px-2 py-1 font-mono text-[11px] transition cursor-pointer', format === f ? 'border-transparent text-black' : 'border-border text-muted hover:text-fg')} style={format === f ? { background: group?.color ?? 'var(--accent)' } : undefined}>.{f.toLowerCase()} <span className="opacity-60">{count}</span></button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Input type</div>
                  <div className="space-y-1">
                    {INPUT_KINDS.map((k) => <button key={k.id} onClick={() => setParam('input', input === k.id ? '' : k.id)} className={cn('flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition cursor-pointer', input === k.id ? 'bg-accent/15 text-fg ring-1 ring-accent/40' : 'text-muted hover:bg-surface-2 hover:text-fg')}>{k.label}<span className="font-mono text-xs">{inCat.filter((t) => toolFormats(t).kind === k.id).length}</span></button>)}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {activeFilters.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            {activeFilters.map((f) => <button key={f.k} onClick={() => setParam(f.k, '')} className="flex items-center gap-1 rounded-full bg-accent/15 px-3 py-1 text-accent cursor-pointer">{f.l}<X className="size-3.5" /></button>)}
            <button onClick={() => { const n = new URLSearchParams(params); n.delete('format'); n.delete('input'); setParams(n, { replace: true }) }} className="text-xs text-muted underline cursor-pointer">Clear filters</button>
          </div>
        )}

        {!q && !onlyFav && !activeFilters.length && recentTools.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-6 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted"><Clock className="size-3.5" /> Recent</span>
            {recentTools.map((t) => { const I = getIcon(t.icon); const col = CATEGORIES.find((x) => x.id === t.category)?.color; return (
              <Link key={t.slug} to={`/${t.slug}`} className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted transition hover:border-accent hover:text-fg"><I className="size-3.5" style={{ color: col }} />{t.name}</Link>) })}
            <Link to="/history" className="flex items-center gap-1 px-2 text-xs text-accent hover:underline">History <ArrowRight className="size-3" /></Link>
          </motion.div>
        )}

        <div className="mt-6 text-xs text-muted" aria-live="polite">{list.length} {list.length === 1 ? 'tool' : 'tools'}</div>
        <motion.div layout className={cn('mt-3 grid', view === 'grid' ? 'gap-4 sm:grid-cols-2 lg:grid-cols-4' : 'gap-2')}>
          <AnimatePresence mode="popLayout" initial={false}>
            {list.map((t, i) => (
              <motion.div key={t.slug} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 16) * 0.015 } }} exit={{ opacity: 0, scale: 0.96 }}>
                {cmp.mode ? (
                  <div className="relative h-full">
                    <ToolCard tool={t} view={view} />
                    <button onClick={() => cmp.toggle(t.slug)} aria-pressed={cmp.has(t.slug)} aria-label={`${cmp.has(t.slug) ? 'Remove' : 'Add'} ${t.name} ${cmp.has(t.slug) ? 'from' : 'to'} compare`} disabled={!cmp.has(t.slug) && cmp.picked.length >= 3}
                      className={cn('absolute z-20 flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium shadow-lg backdrop-blur transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-40', view === 'grid' ? 'bottom-3 right-3' : 'right-14 top-1/2 -translate-y-1/2', cmp.has(t.slug) ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface/90 text-muted hover:text-fg')}>
                      {cmp.has(t.slug) ? <Check className="size-3.5" /> : <GitCompare className="size-3.5" />}{cmp.has(t.slug) ? 'Added' : 'Compare'}
                    </button>
                  </div>
                ) : <ToolCard tool={t} view={view} />}
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
        {!list.length && (
          <EmptyState className="mt-10" kind={onlyFav ? 'star' : 'search'} title={onlyFav && !fav.length ? 'No favorites yet' : onlyFav ? 'None of your favorites match' : q ? `No tools match "${q}"` : 'No tools match these filters'}
            actions={<>
              {(q || activeFilters.length || onlyFav) && <button onClick={() => { setQ(''); setOnlyFav(false); const n = new URLSearchParams(); setParams(n, { replace: true }) }} className="min-h-10 rounded-xl border border-border px-4 text-sm hover:border-accent cursor-pointer">Clear search and filters</button>}
              {c && q && <Link to={`/tools?q=${encodeURIComponent(q)}`} className="flex min-h-10 items-center rounded-xl bg-gradient-brand px-4 text-sm font-medium">Search all categories</Link>}
            </>}>
            {onlyFav && !fav.length ? 'Tap the star on any tool card to pin it here and on the home page.' : 'Try a shorter word, a file format like pdf or mp4, or what you want to do, like compress.'}
          </EmptyState>
        )}
        {c && !q && !activeFilters.length && !onlyFav && <AlsoUseful cat={c.id} />}
        <CompareTray compare={cmp} />
      </div>
    </div>
  )
}

/** Category header strip: counts, formats and the guide, so short categories still feel complete. */
function CategoryStrip({ cat }: { cat: Category }) {
  const list = TOOLS.filter((t) => t.category === cat)
  const fm = allFormats(list)
  const doc = DOC_NAV.find((d) => d.id === `tools-${cat}`)
  const color = CATEGORIES.find((x) => x.id === cat)?.color
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-border bg-surface/70 px-4 py-3 text-sm backdrop-blur">
      <span><span className="font-display text-lg font-bold" style={{ color }}>{list.length}</span> <span className="text-muted">{list.length === 1 ? 'tool' : 'tools'}</span></span>
      <span><span className="font-display text-lg font-bold">{fm.length}</span> <span className="text-muted">formats</span></span>
      {list.some((t) => t.badge === 'AI') && <span className="flex items-center gap-1 text-muted"><Sparkles className="size-3.5 text-accent" /> On-device AI</span>}
      <span className="flex min-w-[min(100%,15rem)] flex-1 flex-wrap gap-1">{fm.slice(0, 8).map((f) => <Link key={f.format} to={`?format=${f.format}`} className="whitespace-nowrap rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted hover:text-fg">.{f.format.toLowerCase()}</Link>)}</span>
      {doc && <Link to={doc.path} className="flex min-h-9 items-center gap-1.5 text-accent hover:underline"><BookOpen className="size-4" /> Guide</Link>}
    </div>
  )
}

/** For short categories: tools in other categories that work with the same formats. */
function AlsoUseful({ cat }: { cat: Category }) {
  const list = TOOLS.filter((t) => t.category === cat)
  if (list.length >= 8) return null
  const fmts = new Set(list.flatMap((t) => toolFormats(t).all))
  const more: ToolMeta[] = TOOLS.filter((t) => t.category !== cat && toolFormats(t).all.some((f) => fmts.has(f))).sort((a, b) => Number(!!b.popular) - Number(!!a.popular)).slice(0, 8)
  const fill = more.length ? more : TOOLS.filter((t) => t.popular && t.category !== cat).slice(0, 8)
  return (
    <section className="mt-14">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="font-display text-xl font-semibold">{more.length ? 'Also works with these files' : 'Popular tools'}</h2><p className="text-sm text-muted">{more.length ? 'Tools from other categories that read or write the same formats.' : 'Handy tools people use most.'}</p></div>
        <Link to="/tools" className="text-sm text-accent hover:underline">All {TOOLS.length} tools</Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{fill.map((t) => <ToolCard key={t.slug} tool={t} />)}</div>
    </section>
  )
}
