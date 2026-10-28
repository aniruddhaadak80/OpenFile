import { Suspense, lazy, useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight, ShieldCheck, Star, Zap, Infinity as Inf } from 'lucide-react'
import { CATEGORIES, loadTool, toolBySlug } from '@/tools/registry'
import { getIcon } from '@/components/icons'
import { ToolGuideSection } from '@/components/ToolGuide'
import { toolGuide } from '@/tools/guides'
import { setJsonLd, setPageMeta } from '@/lib/seo'
import { Badge, cn } from '@/components/ui'
import { useFavorites, useRecent } from '@/lib/store'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { WatchPreview } from '@/components/ToolPreview'
import { BADGE_COLORS } from '@/components/ToolCard'
import { motion } from 'framer-motion'
import NotFound from './NotFound'

export default function ToolPage() {
  const { slug = '' } = useParams()
  const tool = toolBySlug(slug)
  const loader = loadTool(slug)
  const Comp = useMemo(() => (loader ? lazy(loader) : null), [slug])
  const { push } = useRecent()
  const { isFav, toggle } = useFavorites()
  const guide = useMemo(() => (tool ? toolGuide(tool) : null), [slug])
  useEffect(() => {
    if (!tool || !guide) return
    push(tool.slug)
    setPageMeta(`${tool.name} | Free and private in your browser | OpenFile`, `${tool.desc} Free, no uploads, no sign-up. Runs 100% in your browser.`)
    const url = location.origin + location.pathname
    setJsonLd('tool', {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'SoftwareApplication', name: tool.name, description: tool.desc, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any (web browser)', url, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } },
        { '@type': 'HowTo', name: `How to use ${tool.name}`, step: guide.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, text: s })) },
        { '@type': 'FAQPage', mainEntity: guide.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
      ],
    })
    return () => setJsonLd('tool', null)
  }, [slug])
  if (!tool || !guide) return <NotFound />
  const cat = CATEGORIES.find((c) => c.id === tool.category)!
  const Icon = getIcon(tool.icon)
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 opacity-70" style={{ background: `radial-gradient(640px 240px at 18% 0%, ${cat.color}26, transparent), radial-gradient(500px 200px at 85% 0%, color-mix(in oklab, var(--accent) 10%, transparent), transparent)` }} />
      <div className="dot-bg pointer-events-none absolute inset-x-0 top-0 h-72 opacity-60" />
      <div className="relative mx-auto max-w-7xl px-4 pt-8 sm:px-6">
        <nav className="flex items-center gap-1.5 text-xs text-muted">
          <Link to="/" className="hover:text-fg">Home</Link><ChevronRight className="size-3" />
          <Link to={`/category/${cat.id}`} className="hover:text-fg">{cat.name}</Link><ChevronRight className="size-3" />
          <span className="text-fg">{tool.name}</span>
        </nav>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="mt-5 flex flex-wrap items-start gap-4">
          <motion.div initial={{ scale: 0.8, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }} className="grid size-14 place-items-center rounded-2xl shadow-lg" style={{ background: cat.color + '1f', color: cat.color, boxShadow: `0 12px 40px -12px ${cat.color}66, inset 0 0 0 1px ${cat.color}33` }}><Icon className="size-7" /></motion.div>
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">{tool.name}{tool.badge && <Badge color={BADGE_COLORS[tool.badge]}>{tool.badge}</Badge>}</h1>
            <p className="mt-1.5 max-w-2xl text-muted">{tool.desc}</p>
          </div>
          <button onClick={() => toggle(tool.slug)} className={cn('flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm cursor-pointer', isFav(tool.slug) ? 'text-warn' : 'text-muted hover:text-fg')}>
            <Star className={cn('size-4', isFav(tool.slug) && 'fill-current')} /> {isFav(tool.slug) ? 'Saved' : 'Save'}
          </button>
        </motion.div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
          <span className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1"><ShieldCheck className="size-3.5 text-success" /> Processed locally</span>
          <span className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1"><Zap className="size-3.5 text-warn" /> No sign-up</span>
          <span className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1"><Inf className="size-3.5 text-accent" /> No limits or watermarks</span>
        </div>
        <div className="mt-8">
          <ErrorBoundary key={slug}>
            <Suspense fallback={<ToolSkeleton />}>
              {Comp ? <Comp /> : <div className="rounded-2xl border border-border p-10 text-center text-muted">This tool is coming soon.</div>}
            </Suspense>
          </ErrorBoundary>
        </div>
        <WatchPreview slug={tool.slug} name={tool.name} className="mx-auto mt-10 max-w-3xl" />
        <ToolGuideSection tool={tool} guide={guide} />
      </div>
    </div>
  )
}

function ToolSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]" aria-busy="true" aria-label="Loading tool">
      <div className="space-y-4"><div className="skeleton h-56 rounded-2xl" /><div className="skeleton h-10 w-2/3" /><div className="skeleton h-10 w-1/2" /></div>
      <div className="space-y-3 rounded-2xl border border-border bg-surface p-5"><div className="skeleton h-4 w-1/3" /><div className="skeleton h-10" /><div className="skeleton h-4 w-1/4" /><div className="skeleton h-10" /><div className="skeleton h-10" /></div>
    </div>
  )
}
