import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Rss, ArrowRight, Film } from 'lucide-react'
import { POSTS, ALL_TAGS } from '@/blog/meta'
import { PostCard, Meta } from '@/blog/PostCard'
import { CoverMedia } from '@/blog/media/CoverMedia'
import { ListenProvider, CardListen } from '@/blog/media/IndexListen'
import { fmtTime, mediaFor } from '@/blog/media/media'
import { setPageMeta } from '@/lib/seo'
import { Reveal } from '@/components/motion'
import { cn } from '@/components/ui'
import { EmptyState } from '@/components/EmptyState'

const base = import.meta.env.BASE_URL

export default function Blog() {
  useEffect(() => { setPageMeta('Blog | OpenFile', 'Guides, tips and behind the scenes notes on private, in-browser file tools.') }, [])
  const [params, setParams] = useSearchParams()
  const tag = params.get('tag') || ''
  const [q, setQ] = useState(params.get('q') || '')
  const kind = (params.get('kind') || 'all') as Kind
  const sort = (params.get('sort') || 'new') as Sort
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    const r = POSTS.filter((p) => (!tag || p.tags.includes(tag)) && (!s || `${p.title} ${p.description} ${p.tags.join(' ')}`.toLowerCase().includes(s))
      && (kind === 'all' || (kind === 'video' && !!mediaFor(p.slug).video) || (kind === 'listen' && !!mediaFor(p.slug).voices?.length) || (kind === 'quick' && p.minutes <= 6) || (kind === 'deep' && p.minutes >= 7)))
    const by: Record<Sort, (a: typeof r[number], b: typeof r[number]) => number> = { new: (a, b) => b.date.localeCompare(a.date), old: (a, b) => a.date.localeCompare(b.date), short: (a, b) => a.minutes - b.minutes, long: (a, b) => b.minutes - a.minutes }
    return [...r].sort(by[sort])
  }, [q, tag, kind, sort])
  const setParam = (k: string, v: string, def: string) => { const n = new URLSearchParams(params); if (v && v !== def) n.set(k, v); else n.delete(k); setParams(n, { replace: true }) }
  const [featured, ...rest] = list
  const setTag = (t: string) => { const n = new URLSearchParams(params); if (t && t !== tag) n.set('tag', t); else n.delete('tag'); setParams(n, { replace: true }) }
  return (
    <ListenProvider>
    <div className="relative pb-24">
      <div className="dot-bg pointer-events-none absolute inset-x-0 top-0 h-80" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80" style={{ background: 'radial-gradient(600px 240px at 50% 0%, color-mix(in oklab, var(--accent) 14%, transparent), transparent)' }} />
      <div className="relative mx-auto max-w-6xl px-4 pt-14 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-accent">OpenFile blog</div>
            <h1 className="mt-2 font-display text-4xl font-bold tracking-tight sm:text-5xl">Notes on files, <span className="text-gradient">privacy and the web</span></h1>
            <p className="mt-3 max-w-xl text-muted">Plain guides and tips, with live demos you can try right on the page.</p>
          </div>
          <a href={`${base}blog/rss.xml`} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-muted hover:border-accent hover:text-fg"><Rss className="size-4 text-accent" /> RSS feed</a>
        </div>
        <div className="mt-8 flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex h-11 flex-1 items-center gap-2 md:min-w-64 of-field-wrap rounded-xl border border-border bg-surface px-3"><Search className="size-4 shrink-0 text-muted" /><input data-bare-input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search posts" aria-label="Search posts" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setTag('')} className={cn('min-h-9 rounded-full px-3 py-1.5 text-xs transition cursor-pointer', !tag ? 'bg-fg text-bg' : 'border border-border text-muted hover:text-fg')}>All</button>
            {ALL_TAGS.map((t) => <button key={t} onClick={() => setTag(t)} className={cn('min-h-9 rounded-full px-3 py-1.5 text-xs transition cursor-pointer', tag === t ? 'bg-accent text-on-accent' : 'border border-border text-muted hover:text-fg')}>#{t}</button>)}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">Show</span>
          {KINDS.map(([k, label]) => <button key={k} onClick={() => setParam('kind', k, 'all')} aria-pressed={kind === k} className={cn('min-h-8 rounded-full px-3 py-1 transition cursor-pointer', kind === k ? 'bg-accent-2 text-black' : 'border border-border text-muted hover:text-fg')}>{label}</button>)}
          <label className="ml-auto flex items-center gap-2 text-muted">Sort
            <select value={sort} onChange={(e) => setParam('sort', e.target.value, 'new')} className="h-8 rounded-lg border border-border bg-surface px-2 text-xs text-fg cursor-pointer">
              <option value="new">Newest first</option><option value="old">Oldest first</option><option value="short">Shortest first</option><option value="long">Longest first</option>
            </select></label>
          <span className="text-muted">{list.length} {list.length === 1 ? 'post' : 'posts'}</span>
        </div>
        {featured && (
          <Reveal className="relative mt-10">
            <Link to={`/blog/${featured.slug}`} className="spotlight group grid overflow-hidden rounded-3xl border border-border bg-surface md:grid-cols-[1.2fr_1fr]">
              <div className="relative overflow-hidden"><CoverMedia slug={featured.slug} kind={featured.cover} title={featured.title} className="aspect-[16/10] h-full transition duration-700 group-hover:scale-[1.04]" />{mediaFor(featured.slug).video && <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white backdrop-blur"><Film className="size-3.5 text-accent" /> Video {fmtTime(mediaFor(featured.slug).video!.dur)}</span>}</div>
              <div className="flex flex-col justify-center p-6 sm:p-10">
                <Meta p={featured} />
                <h2 className="mt-3 font-display text-2xl font-bold leading-tight sm:text-3xl">{featured.title}</h2>
                <p className="mt-3 text-muted">{featured.description}</p>
                <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent">Read the post <ArrowRight className="size-4 transition group-hover:translate-x-1" /></span>
              </div>
            </Link>
            <CardListen slug={featured.slug} minutes={featured.minutes} className="absolute left-4 top-4 z-10" />
          </Reveal>
        )}
        <motion.div layout className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">{rest.map((p, i) => <PostCard key={p.slug} p={p} i={i} />)}</AnimatePresence>
        </motion.div>
        {!list.length && <EmptyState className="mt-10" kind="search" title="No posts match that search" actions={<button onClick={() => { setQ(''); setParams(new URLSearchParams(), { replace: true }) }} className="min-h-10 rounded-xl border border-border px-4 text-sm hover:border-accent cursor-pointer">Show all posts</button>}>Try another word or tag.</EmptyState>}
      </div>
    </div>
    </ListenProvider>
  )
}

type Kind = 'all' | 'video' | 'listen' | 'quick' | 'deep'
type Sort = 'new' | 'old' | 'short' | 'long'
const KINDS: [Kind, string][] = [['all', 'Everything'], ['video', 'With video'], ['listen', 'Listen'], ['quick', 'Quick reads'], ['deep', 'Deep dives']]

