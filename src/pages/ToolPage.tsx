import { Suspense, lazy, useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight, ShieldCheck, Star, Zap, Infinity as Inf } from 'lucide-react'
import { CATEGORIES, TOOLS, loadTool, toolBySlug } from '@/tools/registry'
import { getIcon } from '@/components/icons'
import { ToolCard } from '@/components/ToolCard'
import { Badge, Spinner, cn } from '@/components/ui'
import { useFavorites, useRecent } from '@/lib/store'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import NotFound from './NotFound'

export default function ToolPage() {
  const { slug = '' } = useParams()
  const tool = toolBySlug(slug)
  const loader = loadTool(slug)
  const Comp = useMemo(() => (loader ? lazy(loader) : null), [slug])
  const { push } = useRecent()
  const { isFav, toggle } = useFavorites()
  useEffect(() => { if (tool) { push(tool.slug); document.title = `${tool.name} — OpenFile` } }, [slug])
  if (!tool) return <NotFound />
  const cat = CATEGORIES.find((c) => c.id === tool.category)!
  const Icon = getIcon(tool.icon)
  const related = TOOLS.filter((t) => t.category === tool.category && t.slug !== tool.slug).slice(0, 4)
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 opacity-60" style={{ background: `radial-gradient(600px 220px at 20% 0%, ${cat.color}22, transparent)` }} />
      <div className="relative mx-auto max-w-7xl px-4 pt-8 sm:px-6">
        <nav className="flex items-center gap-1.5 text-xs text-muted">
          <Link to="/" className="hover:text-fg">Home</Link><ChevronRight className="size-3" />
          <Link to={`/category/${cat.id}`} className="hover:text-fg">{cat.name}</Link><ChevronRight className="size-3" />
          <span className="text-fg">{tool.name}</span>
        </nav>
        <div className="mt-5 flex flex-wrap items-start gap-4">
          <div className="grid size-14 place-items-center rounded-2xl shadow-lg" style={{ background: cat.color + '1f', color: cat.color }}><Icon className="size-7" /></div>
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">{tool.name}{tool.badge && <Badge>{tool.badge}</Badge>}</h1>
            <p className="mt-1.5 max-w-2xl text-muted">{tool.desc}</p>
          </div>
          <button onClick={() => toggle(tool.slug)} className={cn('flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm cursor-pointer', isFav(tool.slug) ? 'text-warn' : 'text-muted hover:text-fg')}>
            <Star className={cn('size-4', isFav(tool.slug) && 'fill-current')} /> {isFav(tool.slug) ? 'Saved' : 'Save'}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
          <span className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1"><ShieldCheck className="size-3.5 text-success" /> Processed locally</span>
          <span className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1"><Zap className="size-3.5 text-warn" /> No sign-up</span>
          <span className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1"><Inf className="size-3.5 text-accent" /> No limits or watermarks</span>
        </div>
        <div className="mt-8">
          <ErrorBoundary key={slug}>
            <Suspense fallback={<div className="grid h-64 place-items-center"><Spinner label="Loading tool…" /></div>}>
              {Comp ? <Comp /> : <div className="rounded-2xl border border-border p-10 text-center text-muted">This tool is coming soon.</div>}
            </Suspense>
          </ErrorBoundary>
        </div>
        {related.length > 0 && (
          <section className="mt-20">
            <h2 className="mb-4 font-display text-xl font-semibold">More {cat.name.toLowerCase()}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{related.map((t) => <ToolCard key={t.slug} tool={t} />)}</div>
          </section>
        )}
      </div>
    </div>
  )
}
