import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Rss, ArrowRight, Film, X, Hash, Timer, Headphones, ListChecks, SlidersHorizontal } from 'lucide-react'
import { POSTS, ALL_TAGS, type PostMeta } from '@/blog/meta'
import { PostCard, Meta } from '@/blog/PostCard'
import { CoverMedia } from '@/blog/media/CoverMedia'
import { ListenProvider, CardListen } from '@/blog/media/IndexListen'
import { fmtTime, mediaFor } from '@/blog/media/media'
import { SearchBox } from '@/blog/search/SearchBox'
import { ResultCard } from '@/blog/search/ResultCard'
import { useRecentSearches, useSearchIndex } from '@/blog/search/support'
import { parseQuery, search, suggestQuery, stripFilter, type Hit, type SearchDoc } from '@/blog/search/engine'
import { setPageMeta } from '@/lib/seo'
import { Reveal } from '@/components/motion'
import { cn } from '@/components/ui'
import { EmptyState } from '@/components/EmptyState'

const base = import.meta.env.BASE_URL
const META_BY_SLUG: Record<string, PostMeta> = Object.fromEntries(POSTS.map((p) => [p.slug, p]))

export default function Blog() {
  useEffect(() => { setPageMeta('Blog | OpenFile', 'Guides, tips and behind the scenes notes on private, in-browser file tools.') }, [])
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const qParam = params.get('q') || ''
  const tag = params.get('tag') || ''
  const kind = (KINDS.some(([k]) => k === params.get('kind')) ? params.get('kind') : 'all') as Kind
  const sortParam = (SORTS.some(([k]) => k === params.get('sort')) || params.get('sort') === 'old' || params.get('sort') === 'long' ? params.get('sort') : '') as Sort | ''

  // ----- typed text <-> ?q= -----
  const [input, setInput] = useState(qParam)
  const lastWritten = useRef(qParam)
  const session = useRef(false) // first URL write of a typing session pushes history, the rest replace it
  useEffect(() => { if (qParam !== lastWritten.current) { lastWritten.current = qParam; setInput(qParam) } }, [qParam])
  const writeQ = useCallback((v: string, push: boolean) => {
    const t = v.trim()
    if (t === lastWritten.current) return
    lastWritten.current = t
    setParams((cur) => { const n = new URLSearchParams(cur); if (t) n.set('q', t); else n.delete('q'); return n }, { replace: !push })
  }, [setParams])
  useEffect(() => {
    if (input.trim() === lastWritten.current) return
    const id = setTimeout(() => { writeQ(input, !session.current); session.current = true }, 350)
    return () => clearTimeout(id)
  }, [input, writeQ])
  const commit = () => { writeQ(input, !session.current); session.current = false }

  const setParam = (k: string, v: string, push = true) => {
    const n = new URLSearchParams(params)
    if (v) n.set(k, v); else n.delete(k)
    setParams(n, { replace: !push })
  }

  // ----- index and docs -----
  const { data: index, status, load } = useSearchIndex(!!qParam)
  const docs: SearchDoc[] = useMemo(() => POSTS.map((p) => {
    const m = mediaFor(p.slug), ix = index?.posts[p.slug]
    return {
      slug: p.slug, title: p.title, description: p.description, tags: p.tags, date: p.date, minutes: p.minutes,
      video: !!m.video, listen: !!m.voices?.length, quiz: index ? !!ix?.q : true,
      sections: ix?.s.map(([id, h, text]) => ({ id, h, text })),
    }
  }), [index])

  const parsed = useMemo(() => {
    const q = parseQuery(input)
    if (tag && !q.tags.includes(tag)) q.tags = [...q.tags, tag]
    q.active = q.active || !!tag
    return q
  }, [input, tag])

  const kindOk = useCallback((d: SearchDoc) => kind === 'all' || (kind === 'video' && d.video) || (kind === 'listen' && d.listen) || (kind === 'quick' && d.minutes <= 6) || (kind === 'deep' && d.minutes >= 7), [kind])
  const ranked: Hit[] = useMemo(() => search(docs, parsed).filter((h) => kindOk(h.doc)), [docs, parsed, kindOk])
  const sort: Sort = sortParam || (parsed.textual ? 'relevance' : 'new')
  const sorted = useMemo(() => {
    const by: Record<Sort, (a: Hit, b: Hit) => number> = {
      relevance: (a, b) => b.score - a.score, new: (a, b) => b.doc.date.localeCompare(a.doc.date), old: (a, b) => a.doc.date.localeCompare(b.doc.date),
      short: (a, b) => a.doc.minutes - b.doc.minutes || b.doc.date.localeCompare(a.doc.date), long: (a, b) => b.doc.minutes - a.doc.minutes,
    }
    return [...ranked].sort(sort === 'relevance' && !parsed.textual ? by.new : by[sort])
  }, [ranked, sort, parsed.textual])
  const closest = useMemo(() => (ranked.length || !parsed.textual ? [] : search(docs, { ...parsed, tags: [], has: [], time: null }, 'any').slice(0, 3)), [ranked.length, parsed, docs])
  const suggestion = useMemo(() => (ranked.length || !parsed.textual ? null : suggestQuery(docs, input)), [ranked.length, parsed.textual, docs, input])

  const recent = useRecentSearches()
  const resultsRef = useRef<HTMLDivElement>(null)
  const showAll = () => { commit(); if (parsed.textual) recent.add(input); resultsRef.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }) }
  const openPost = (slug: string) => { commit(); if (parsed.textual) recent.add(input); navigate(`/blog/${slug}`) }
  const clearAll = () => { setInput(''); lastWritten.current = ''; session.current = false; setParams(new URLSearchParams(), { replace: false }) }

  const searching = parsed.textual
  const list = sorted.map((h) => META_BY_SLUG[h.doc.slug]).filter(Boolean)
  const [featured, ...rest] = list
  const typedTags = parseQuery(input).tags
  const removeTyped = (key: string, val?: string) => setInput((v) => stripFilter(v, key, val))
  const pills: { key: string; label: React.ReactNode; onRemove: () => void }[] = [
    ...typedTags.filter((t) => t !== tag).map((t) => ({ key: `t-${t}`, label: <><Hash className="size-3 text-accent" />{t}</>, onRemove: () => removeTyped('tag', t) })),
    ...parsed.has.map((h) => ({ key: `h-${h}`, label: <>{h === 'video' ? <Film className="size-3 text-sky-400" /> : h === 'listen' ? <Headphones className="size-3 text-emerald-400" /> : <ListChecks className="size-3 text-teal-400" />}has {h}</>, onRemove: () => { removeTyped('has', h); removeTyped('is', h) } })),
    ...(parsed.time ? [{ key: 'time', label: <><Timer className="size-3 text-cyan-400" />{parsed.time.op === '=' ? '' : parsed.time.op.replace('<=', 'up to ').replace('>=', 'at least ').replace('<', 'under ').replace('>', 'over ')}{parsed.time.n} min</>, onRemove: () => removeTyped('time') }] : []),
  ]

  return (
    <ListenProvider>
    <div className="relative pb-24">
      <div className="dot-bg pointer-events-none absolute inset-x-0 top-0 h-96" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96" style={{ background: 'radial-gradient(640px 260px at 50% 0%, color-mix(in oklab, var(--accent) 15%, transparent), transparent), radial-gradient(420px 200px at 85% 30%, color-mix(in oklab, #22D3EE 7%, transparent), transparent)' }} />
      <div className="relative mx-auto max-w-6xl px-4 pt-12 sm:px-6 sm:pt-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-widest text-accent">OpenFile blog</div>
            <h1 className="mt-2 font-display text-[2rem] font-bold leading-tight tracking-tight sm:text-5xl">Notes on files, <span className="text-gradient">privacy and the web</span></h1>
            <p className="mt-3 max-w-xl text-muted">Plain guides and tips, with live demos you can try right on the page.</p>
          </div>
          <a href={`${base}blog/rss.xml`} className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-muted hover:border-accent hover:text-fg"><Rss className="size-4 text-accent" /> RSS feed</a>
        </div>

        <section role="search" className="mt-8 sm:mt-10" aria-label="Search the blog">
          <SearchBox
            value={input}
            onChange={(v) => { setInput(v); if (v && status === 'idle') load() }}
            onFocusBox={() => { if (status === 'idle') load() }}
            onShowAll={showAll}
            onOpenPost={openPost}
            hits={sorted}
            parsed={parsed}
            closest={closest}
            suggestion={suggestion}
            metaBySlug={META_BY_SLUG}
            status={status}
            recent={recent.list}
            onRemoveRecent={recent.remove}
            onClearRecent={recent.clear}
            tags={ALL_TAGS}
          />

          {/* topic chips: one row that scrolls sideways on small screens */}
          <div className="-mx-4 mt-4 sm:mx-0">
            <div role="group" aria-label="Filter by topic" className="flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
              <Chip on={!tag} onClick={() => setParam('tag', '')} tone="fg">All topics</Chip>
              {ALL_TAGS.map((t) => <Chip key={t} on={tag === t || typedTags.includes(t)} onClick={() => setParam('tag', tag === t ? '' : t)}>#{t}</Chip>)}
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
            <div className="-mx-4 md:mx-0 md:flex-1">
              <div role="group" aria-label="Show" className="flex snap-x items-center gap-2 overflow-x-auto px-4 pb-1 text-xs [scrollbar-width:none] md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
                <span className="hidden shrink-0 items-center gap-1.5 text-muted md:flex"><SlidersHorizontal className="size-3.5" /> Show</span>
                {KINDS.map(([k, label]) => <Chip key={k} on={kind === k || (k === 'video' && kind === 'all' && parsed.has.includes('video')) || (k === 'listen' && kind === 'all' && parsed.has.includes('listen'))} onClick={() => setParam('kind', k === 'all' || kind === k ? '' : k)} tone="teal">{label}</Chip>)}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div role="radiogroup" aria-label="Sort posts" className="inline-flex rounded-xl border border-border bg-surface p-1">
                {SORTS.map(([k, label]) => (
                  <button key={k} type="button" role="radio" aria-checked={sort === k} onClick={() => setParam('sort', k === (parsed.textual ? 'relevance' : 'new') ? '' : k, false)}
                    className={cn('relative min-h-9 rounded-lg px-3 text-xs font-medium transition-colors cursor-pointer', sort === k ? 'text-on-accent' : 'text-muted hover:text-fg')}>
                    {sort === k && <motion.span layoutId="blog-sort-pill" className="absolute inset-0 rounded-lg bg-accent" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                    <span className="relative">{label}</span>
                  </button>
                ))}
              </div>
              <span className="shrink-0 text-xs text-muted md:hidden">{list.length} {list.length === 1 ? 'post' : 'posts'}</span>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {(pills.length > 0 || searching || tag || kind !== 'all') && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 pt-3 text-xs">
                  <span className="hidden text-muted md:inline">{list.length} {list.length === 1 ? 'post' : 'posts'}{searching && input.trim() ? <> for <span className="text-fg">"{input.trim().length > 48 ? input.trim().slice(0, 48) + '...' : input.trim()}"</span></> : null}</span>
                  {pills.map((p) => (
                    <button key={p.key} type="button" onClick={p.onRemove} aria-label="Remove filter" className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 text-fg hover:border-accent cursor-pointer">
                      {p.label}<X className="size-3 text-muted" />
                    </button>
                  ))}
                  <button type="button" onClick={clearAll} className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-muted hover:text-fg cursor-pointer"><X className="size-3" /> Clear all</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <div ref={resultsRef} className="scroll-mt-24" />
        {searching ? (
          <motion.ul layout className="mt-8 grid gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3" aria-label="Search results">
            <AnimatePresence mode="popLayout">{sorted.map((h, i) => { const m = META_BY_SLUG[h.doc.slug]; return m ? <ResultCard key={m.slug} meta={m} hit={h} i={i} activeTags={parsed.tags} /> : null })}</AnimatePresence>
          </motion.ul>
        ) : (
          <>
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
          </>
        )}
        {!list.length && (
          <EmptyState className="mt-10" kind="search" title="No posts match that search"
            actions={<div className="flex flex-wrap justify-center gap-2">
              {suggestion && <button onClick={() => setInput(suggestion)} className="min-h-11 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent cursor-pointer">Search for "{suggestion}"</button>}
              <button onClick={clearAll} className="min-h-11 rounded-xl border border-border px-4 text-sm hover:border-accent cursor-pointer">Show all posts</button>
            </div>}>
            {closest.length ? <>Closest posts: {closest.map((h, i) => <span key={h.doc.slug}>{i ? ', ' : ''}<Link className="text-accent hover:underline" to={`/blog/${h.doc.slug}`}>{h.doc.title}</Link></span>)}</> : 'Try another word, or remove a filter.'}
          </EmptyState>
        )}
      </div>
    </div>
    </ListenProvider>
  )
}

function Chip({ on, onClick, children, tone = 'gold' }: { on: boolean; onClick: () => void; children: React.ReactNode; tone?: 'gold' | 'teal' | 'fg' }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cn('min-h-11 shrink-0 snap-start whitespace-nowrap rounded-full px-3.5 text-xs font-medium transition-colors cursor-pointer sm:min-h-9 sm:px-3',
        on ? (tone === 'teal' ? 'bg-accent-2 text-black' : tone === 'fg' ? 'bg-fg text-bg' : 'bg-accent text-on-accent shadow-[0_6px_20px_-8px_var(--accent)]')
          : 'border border-border bg-surface/60 text-muted hover:border-accent/50 hover:text-fg')}>
      {children}
    </button>
  )
}

type Kind = 'all' | 'video' | 'listen' | 'quick' | 'deep'
type Sort = 'relevance' | 'new' | 'short' | 'old' | 'long'
const KINDS: [Kind, string][] = [['all', 'Everything'], ['video', 'With video'], ['listen', 'Listen'], ['quick', 'Quick reads'], ['deep', 'Deep dives']]
const SORTS: [Sort, string][] = [['relevance', 'Best match'], ['new', 'Newest'], ['short', 'Shortest']]
