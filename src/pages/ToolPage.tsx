import { Suspense, lazy, useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight, ShieldCheck, Star, Zap, Infinity as Inf } from 'lucide-react'
import { CATEGORIES, loadTool, toolBySlug } from '@/tools/registry'
import { getIcon } from '@/components/icons'
import { ToolGuideSection } from '@/components/ToolGuide'
import { toolGuide } from '@/tools/guides'
import { setJsonLd, setPageMeta } from '@/lib/seo'
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
        <ToolGuideSection tool={tool} guide={guide} />
      </div>
    </div>
  )
}
