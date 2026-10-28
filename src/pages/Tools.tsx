import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Search, Star, Clock, ArrowRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { useFavorites, useRecent } from '@/lib/store'
import { getIcon } from '@/components/icons'
import { CATEGORIES, TOOLS, toolBySlug, type Category } from '@/tools/registry'
import { ToolCard } from '@/components/ToolCard'
import { searchTools } from '@/components/CommandPalette'
import { cn } from '@/components/ui'

export default function Tools() {
  const { id } = useParams()
  const [q, setQ] = useState('')
  const [onlyFav, setOnlyFav] = useState(false)
  const { fav } = useFavorites()
  const { recent } = useRecent()
  const [cat, setCat] = useState<Category | 'all'>((id as Category) || 'all')
  useEffect(() => setCat((id as Category) || 'all'), [id])
  const c = CATEGORIES.find((x) => x.id === cat)
  useEffect(() => { document.title = `${c ? c.name : 'All tools'} — OpenFile` }, [c])
  const list = useMemo(() => searchTools(q).filter((t) => (cat === 'all' || t.category === cat) && (!onlyFav || fav.includes(t.slug))), [q, cat, onlyFav, fav])
  const recentTools = recent.map(toolBySlug).filter((t): t is NonNullable<typeof t> => !!t && (cat === 'all' || t.category === cat)).slice(0, 8)
  return (
    <div className="mx-auto max-w-7xl px-4 pt-12 sm:px-6">
      <h1 className="font-display text-4xl font-bold tracking-tight">{c ? c.name : 'All tools'}</h1>
      <p className="mt-2 text-muted">{c ? c.blurb : `${TOOLS.length} tools for documents, images, media and code — all running in your browser.`}</p>
      <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-accent"><Search className="size-4 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter tools…" className="flex-1 bg-transparent text-sm outline-none" /></div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setOnlyFav((v) => !v)} className={cn('flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition cursor-pointer', onlyFav ? 'bg-warn/15 text-warn ring-1 ring-warn/40' : 'border border-border text-muted hover:text-fg')} aria-pressed={onlyFav}><Star className={cn('size-3.5', onlyFav && 'fill-current')} /> Favorites{fav.length ? ` ${fav.length}` : ''}</button>
          {[{ id: 'all', name: 'All' }, ...CATEGORIES].map((x) => <Link key={x.id} to={x.id === 'all' ? '/tools' : `/category/${x.id}`} className={cn('rounded-full px-3.5 py-1.5 text-sm', cat === x.id ? 'bg-fg text-bg' : 'border border-border text-muted hover:text-fg')}>{x.name}</Link>)}
        </div>
      </div>
      {!q && !onlyFav && recentTools.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-6 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted"><Clock className="size-3.5" /> Recent</span>
          {recentTools.map((t) => { const I = getIcon(t.icon); const c = CATEGORIES.find((x) => x.id === t.category)!.color; return (
            <Link key={t.slug} to={`/${t.slug}`} className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted transition hover:border-accent hover:text-fg"><I className="size-3.5" style={{ color: c }} />{t.name}</Link>) })}
          <Link to="/history" className="flex items-center gap-1 px-2 text-xs text-accent hover:underline">History <ArrowRight className="size-3" /></Link>
        </motion.div>
      )}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{list.map((t) => <ToolCard key={t.slug} tool={t} />)}</div>
      {!list.length && <p className="mt-16 text-center text-muted">{onlyFav && !fav.length ? 'No favorites yet. Hover a tool card and tap the star to save it.' : onlyFav ? 'None of your favorites match this filter.' : `No tools match “${q}”.`}</p>}
    </div>
  )
}
