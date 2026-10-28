import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Search, ArrowRight } from 'lucide-react'
import { CATEGORIES, TOOLS } from '@/tools/registry'
import { searchTools } from '@/components/CommandPalette'
import { EmptyState } from '@/components/EmptyState'
import { ToolCard } from '@/components/ToolCard'
import { QuickBar } from '@/components/ToolExtras'
import { setPageMeta } from '@/lib/seo'

export default function NotFound() {
  const loc = useLocation()
  const nav = useNavigate()
  // guess what the visitor wanted from the words in the broken URL
  const words = decodeURIComponent(loc.pathname).replace(/^\/+|\/+$/g, '').split(/[/\-_.\s]+/).filter((w) => w.length > 1 && !/^(category|tools|blog|docs)$/.test(w))
  const [q, setQ] = useState(words.join(' '))
  const guesses = useMemo(() => {
    const seen = new Set<string>()
    const out = []
    for (const w of [words.join(' '), ...words]) for (const t of w ? searchTools(w) : []) { if (!seen.has(t.slug)) { seen.add(t.slug); out.push(t) } }
    return out.slice(0, 4)
  }, [loc.pathname])
  const popular = TOOLS.filter((t) => t.popular && !guesses.includes(t)).slice(0, 8 - guesses.length)
  useEffect(() => {
    setPageMeta('Page not found | OpenFile', 'That page does not exist. Search every OpenFile tool instead.')
    let m = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')
    if (!m) { m = document.createElement('meta'); m.name = 'robots'; document.head.appendChild(m) }
    m.content = 'noindex'
    return () => { m?.remove() }
  }, [])
  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 pt-12 sm:px-6">
      <QuickBar className="mb-6" />
      <EmptyState kind="lost" title={<><span className="font-display text-5xl font-bold text-gradient">404</span><span className="mt-2 block">That page wandered off</span></>}
        actions={<Link to="/tools" className="flex min-h-11 items-center gap-1.5 rounded-xl bg-gradient-brand px-5 text-sm font-medium">Browse all {TOOLS.length} tools <ArrowRight className="size-4" /></Link>}>
        The link may be old or mistyped. Search below, press Ctrl K, or pick a category.
      </EmptyState>
      <form onSubmit={(e) => { e.preventDefault(); nav(`/tools?q=${encodeURIComponent(q.trim())}`) }} className="mx-auto mt-6 flex max-w-xl items-center gap-2 of-field-wrap rounded-2xl border border-border bg-surface px-4" role="search">
        <Search className="size-5 shrink-0 text-muted" />
        <input data-bare-input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tools" aria-label="Search tools" className="h-12 min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted" />
        <button className="min-h-10 rounded-xl px-3 text-sm text-accent cursor-pointer">Search</button>
      </form>
      <div className="mt-6 flex flex-wrap justify-center gap-2">{CATEGORIES.map((c) => <Link key={c.id} to={`/category/${c.id}`} className="flex min-h-10 items-center gap-2 rounded-full border border-border px-3 text-sm text-muted hover:border-accent hover:text-fg"><span className="size-2 rounded-full" style={{ background: c.color }} />{c.name}</Link>)}</div>
      <h2 className="mb-4 mt-12 font-display text-xl font-semibold">{guesses.length ? 'Were you looking for one of these?' : 'Popular tools'}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[...guesses, ...popular].map((t) => <ToolCard key={t.slug} tool={t} />)}</div>
    </div>
  )
}
