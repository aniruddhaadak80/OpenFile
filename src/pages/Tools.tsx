import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { CATEGORIES, TOOLS, type Category } from '@/tools/registry'
import { ToolCard } from '@/components/ToolCard'
import { searchTools } from '@/components/CommandPalette'
import { cn } from '@/components/ui'

export default function Tools() {
  const { id } = useParams()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<Category | 'all'>((id as Category) || 'all')
  useEffect(() => setCat((id as Category) || 'all'), [id])
  const c = CATEGORIES.find((x) => x.id === cat)
  useEffect(() => { document.title = `${c ? c.name : 'All tools'} — OpenFile` }, [c])
  const list = useMemo(() => searchTools(q).filter((t) => cat === 'all' || t.category === cat), [q, cat])
  return (
    <div className="mx-auto max-w-7xl px-4 pt-12 sm:px-6">
      <h1 className="font-display text-4xl font-bold tracking-tight">{c ? c.name : 'All tools'}</h1>
      <p className="mt-2 text-muted">{c ? c.blurb : `${TOOLS.length} tools for documents, images, media and code — all running in your browser.`}</p>
      <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-accent"><Search className="size-4 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter tools…" className="flex-1 bg-transparent text-sm outline-none" /></div>
        <div className="flex flex-wrap gap-2">
          {[{ id: 'all', name: 'All' }, ...CATEGORIES].map((x) => <Link key={x.id} to={x.id === 'all' ? '/tools' : `/category/${x.id}`} className={cn('rounded-full px-3.5 py-1.5 text-sm', cat === x.id ? 'bg-fg text-bg' : 'border border-border text-muted hover:text-fg')}>{x.name}</Link>)}
        </div>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{list.map((t) => <ToolCard key={t.slug} tool={t} />)}</div>
      {!list.length && <p className="mt-16 text-center text-muted">No tools match “{q}”.</p>}
    </div>
  )
}
