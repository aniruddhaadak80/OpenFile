import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Rss, ArrowRight } from 'lucide-react'
import { POSTS, ALL_TAGS } from '@/blog/meta'
import { PostCard, Meta } from '@/blog/PostCard'
import { Cover } from '@/blog/Cover'
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
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return POSTS.filter((p) => (!tag || p.tags.includes(tag)) && (!s || `${p.title} ${p.description} ${p.tags.join(' ')}`.toLowerCase().includes(s)))
  }, [q, tag])
  const [featured, ...rest] = list
  const setTag = (t: string) => { const n = new URLSearchParams(params); if (t && t !== tag) n.set('tag', t); else n.delete('tag'); setParams(n, { replace: true }) }
  return (
    <div className="relative">
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
        {featured && (
          <Reveal className="mt-10">
            <Link to={`/blog/${featured.slug}`} className="spotlight group grid overflow-hidden rounded-3xl border border-border bg-surface md:grid-cols-[1.2fr_1fr]">
              <div className="relative overflow-hidden"><Cover kind={featured.cover} title={featured.title} className="aspect-[16/10] h-full object-cover transition duration-700 group-hover:scale-[1.04]" /></div>
              <div className="flex flex-col justify-center p-6 sm:p-10">
                <Meta p={featured} />
                <h2 className="mt-3 font-display text-2xl font-bold leading-tight sm:text-3xl">{featured.title}</h2>
                <p className="mt-3 text-muted">{featured.description}</p>
                <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent">Read the post <ArrowRight className="size-4 transition group-hover:translate-x-1" /></span>
              </div>
            </Link>
          </Reveal>
        )}
        <motion.div layout className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">{rest.map((p, i) => <PostCard key={p.slug} p={p} i={i} />)}</AnimatePresence>
        </motion.div>
        {!list.length && <EmptyState className="mt-10" kind="search" title="No posts match that search" actions={<button onClick={() => { setQ(''); setTag('') }} className="min-h-10 rounded-xl border border-border px-4 text-sm hover:border-accent cursor-pointer">Show all posts</button>}>Try another word or tag.</EmptyState>}
      </div>
    </div>
  )
}

