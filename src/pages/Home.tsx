import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion'
import { Search, ArrowRight, ShieldCheck, Zap, Cpu, Workflow, Sparkles, GraduationCap, Users, Palette, Store, Check, X, Upload, Download, Lock, Infinity as Inf, Play, Star, ChevronDown, WifiOff, Code2, Layers, Command } from 'lucide-react'
import { CATEGORIES, TOOLS, toolBySlug, type ToolMeta } from '@/tools/registry'
import { ToolCard, BADGE_COLORS } from '@/components/ToolCard'
import { getIcon } from '@/components/icons'
import { searchTools } from '@/components/CommandPalette'
import { Button, cn } from '@/components/ui'
import { formatBytes, canvasToBlob, loadImage, downloadBlob, renameExt } from '@/lib/files'
import { setHandoff, suggestFor } from '@/lib/handoff'
import { useFavorites, useRecent } from '@/lib/store'
import { allFormats, toolFormats, FORMAT_GROUPS } from '@/lib/formats'
import { POSTS } from '@/blog/meta'
import { PostCard } from '@/blog/PostCard'
import { REPO_URL } from '@/components/Layout'
import { Github } from '@/components/Logo'
import { Aurora, Counter, GoldRing, Magnetic, Marquee, Reveal, Stagger, StaggerItem, spotlightMove } from '@/components/motion'
import { setJsonLd, setPageMeta } from '@/lib/seo'
import { HeroRing } from '@/components/HeroRing'
import { Parallax, RevealText } from '@/components/motion'
import { detectFile, toolsForFormat } from '@/lib/detect'
import { openDropSheet } from '@/lib/ux'
import { DOC_NAV } from '@/docs/nav'

const base = import.meta.env.BASE_URL

export default function Home() {
  useEffect(() => {
    setPageMeta(`OpenFile | Every file tool, private, in your browser`, `OpenFile: ${TOOLS.length}+ free, open-source tools for PDF, images, video, audio and code. Everything runs in your browser, nothing is uploaded.`)
    const home = location.origin + base
    setJsonLd('home', { '@context': 'https://schema.org', '@graph': [
      { '@type': 'WebSite', '@id': home + '#website', name: 'OpenFile', url: home, description: `${TOOLS.length}+ free file tools that run in your browser.`, potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${home}tools?q={search_term_string}` }, 'query-input': 'required name=search_term_string' } },
      { '@type': 'SoftwareApplication', name: 'OpenFile', applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any (web browser)', url: home, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } },
    ] })
    return () => setJsonLd('home', null)
  }, [])
  const [film, setFilm] = useState(false)
  return (
    <div>
      <Hero onFilm={() => setFilm(true)} />
      <FormatMarquee />
      <SmartDrop />
      <Personal />
      <CategoryExplorer />
      <PopularTools />
      <LaunchVideo onFilm={() => setFilm(true)} />
      <Stats />
      <AllFormatsSection />
      <WorkspacePromo />
      <Why />
      <Compare />
      <Workflows />
      <BlogTeaser />
      <Faq />
      <Cta />
      <FilmModal open={film} onClose={() => setFilm(false)} />
    </div>
  )
}

function Hero({ onFilm }: { onFilm: () => void }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const nav = useNavigate()
  const results = useMemo(() => (q ? searchTools(q).slice(0, 6) : []), [q])
  useEffect(() => setSel(0), [q])
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const ringY = useTransform(scrollYProgress, [0, 1], [0, 120])
  const ringScale = useTransform(scrollYProgress, [0, 1], [1, 0.85])
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0])
  return (
    <section ref={ref} className="relative overflow-hidden">
      <Aurora />
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.1fr_1fr]">
        <div className="text-center lg:text-left">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs text-muted backdrop-blur">
            <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-75" /><span className="relative inline-flex size-2 rounded-full bg-accent" /></span>
            {TOOLS.length} tools | open source | zero uploads
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.6 }} className="mt-6 font-display text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl xl:text-7xl">
            Every file tool.<br /><span className="text-gradient text-gradient-anim">One private tab.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.6 }} className="mx-auto mt-6 max-w-xl text-lg text-muted lg:mx-0">
            Merge, sign and compress PDFs. Remove backgrounds, trim videos, transcribe audio and format code. It all runs on your device, free, with nothing uploaded.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, duration: 0.6 }} className="relative mx-auto mt-8 max-w-xl lg:mx-0">
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface/90 px-4 shadow-2xl shadow-accent/10 backdrop-blur transition focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15">
              <Search className="size-5 text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tools" role="combobox" aria-expanded={results.length > 0} aria-controls="hero-results"
                onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)) } else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) } else if (e.key === 'Enter' && results[sel]) nav('/' + results[sel].slug); else if (e.key === 'Escape') setQ('') }}
                placeholder="What do you need to do? Try compress, sign, gif" className="h-14 flex-1 bg-transparent outline-none placeholder:text-muted" />
              <kbd className="hidden rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted sm:block">Enter</kbd>
            </div>
            <AnimatePresence>
              {results.length > 0 && (
                <motion.div id="hero-results" role="listbox" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-border bg-surface text-left shadow-2xl">
                  {results.map((t, i) => { const I = getIcon(t.icon); const c = CATEGORIES.find((x) => x.id === t.category)?.color; return (
                    <Link key={t.slug} to={'/' + t.slug} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} className={cn('flex items-center gap-3 px-4 py-3', i === sel && 'bg-surface-2')}><I className="size-4 shrink-0" style={{ color: c }} /><span className="shrink-0 font-medium">{t.name}</span><span className="truncate text-xs text-muted">{t.desc}</span></Link>) })}
                  <Link to={`/tools`} className="block border-t border-border px-4 py-2 text-xs text-accent">Browse all {TOOLS.length} tools</Link>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-6 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            <Magnetic><Link to="/tools"><Button size="lg" icon={<Layers className="size-4" />}>Explore tools</Button></Link></Magnetic>
            <Magnetic><Button size="lg" variant="outline" onClick={onFilm} icon={<Play className="size-4 fill-current" />}>Watch the film</Button></Magnetic>
          </motion.div>
          <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs lg:justify-start">
            {['merge-pdf', 'compress-pdf', 'background-remover', 'video-to-gif', 'sign-pdf', 'qr-generator'].map((s) => { const t = toolBySlug(s); return t ? <Link key={s} to={'/' + s} className="rounded-full border border-border bg-surface/70 px-3 py-1.5 text-muted backdrop-blur transition hover:border-accent hover:text-fg">{t.name}</Link> : null })}
          </div>
        </div>
        <HeroRing style={{ y: ringY, scale: ringScale, opacity: fade }} className="max-w-[300px] sm:max-w-[460px]" />
      </div>
    </section>
  )
}

function FormatMarquee() {
  const fmts = allFormats().slice(0, 40)
  return (
    <section aria-label="Supported formats" className="border-y border-border bg-surface/40 py-4">
      <Marquee duration={50}>
        {fmts.map(({ format, group }) => <Link key={format} to={`/tools?format=${format}`} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 font-mono text-xs text-muted transition hover:text-fg"><span className="size-1.5 rounded-full" style={{ background: group?.color ?? 'var(--accent)' }} />.{format.toLowerCase()}</Link>)}
      </Marquee>
    </section>
  )
}

function SectionHead({ kicker, title, sub }: { kicker: string; title: React.ReactNode; sub?: string }) {
  return (
    <Reveal className="mx-auto mb-10 max-w-2xl text-center">
      <div className="text-xs font-bold uppercase tracking-widest text-accent"><span className="text-gradient text-gradient-anim">{kicker}</span></div>
      <RevealText as="h2" className="mt-2 block font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</RevealText>
      {sub && <p className="mt-3 text-muted">{sub}</p>}
    </Reveal>
  )
}

/** Steps for the explorer's "try a pipeline" card: Workspace steps when the category has them, otherwise a
 *  two-tool chain where the first tool's output is the second tool's input. */
function pipelineFor(list: ToolMeta[]): { kind: 'workspace' | 'chain'; steps: ToolMeta[]; via?: string } | null {
  const steps = list.filter((t) => t.pipeline)
  if (steps.length >= 2) return { kind: 'workspace', steps: steps.slice(0, 4) }
  for (const a of list) {
    for (const out of toolFormats(a).outputs) {
      const b = TOOLS.find((t) => t.slug !== a.slug && t.inputs?.map((x) => x.toUpperCase()).includes(out) && t.category !== a.category) ?? TOOLS.find((t) => t.slug !== a.slug && toolFormats(t).inputs.includes(out) && toolFormats(t).kind === 'file' && t.slug !== a.slug)
      if (b) return { kind: 'chain', steps: [a, b], via: out }
    }
  }
  return null
}

function CategoryExplorer() {
  const [cat, setCat] = useState(CATEGORIES[0].id)
  const c = CATEGORIES.find((x) => x.id === cat) ?? CATEGORIES[0]
  const list = TOOLS.filter((t) => t.category === c.id)
  const top = [...list].sort((a, b) => Number(!!b.popular) - Number(!!a.popular) || Number(!!b.badge) - Number(!!a.badge)).slice(0, 15)
  const CatIcon = getIcon(list[0]?.icon ?? 'FileText')
  const formats = useMemo(() => allFormats(list).slice(0, 12), [c.id])
  const pipe = useMemo(() => pipelineFor(list), [c.id])
  const ai = list.filter((t) => t.badge === 'AI').length
  const fresh = list.filter((t) => t.badge === 'NEW').length
  const doc = DOC_NAV.find((d) => d.id === `tools-${c.id}`)
  return (
    <section className="mx-auto mt-24 max-w-7xl px-4 sm:px-6">
      <SectionHead kicker="Category explorer" title="Find the right station" sub="Pick a category to see what it can do." />
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]" data-tour="explorer">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0 scrollbar-thin" role="tablist" aria-label="Categories">
            {CATEGORIES.map((x) => {
              const n = TOOLS.filter((t) => t.category === x.id).length
              const on = x.id === cat
              return (
                <button key={x.id} role="tab" aria-selected={on} aria-controls="cat-panel" onClick={() => setCat(x.id)} onMouseEnter={() => setCat(x.id)} className={cn('relative flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition cursor-pointer', on ? 'text-fg' : 'text-muted hover:text-fg')}>
                  {on && <motion.span layoutId="cat-pill" className="absolute inset-0 rounded-xl border border-border bg-surface shadow-lg" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                  <span className="relative size-2.5 rounded-full" style={{ background: x.color, boxShadow: on ? `0 0 12px ${x.color}` : undefined }} />
                  <span className="relative flex-1 font-medium">{x.name}</span>
                  <span className="relative font-mono text-xs text-muted">{n}</span>
                </button>
              )
            })}
          </div>
          <Link to="/tools" className="mt-3 hidden items-center gap-1.5 px-4 text-sm text-accent hover:underline lg:flex">Browse all {TOOLS.length} tools <ArrowRight className="size-3.5" /></Link>
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={c.id} id="cat-panel" role="tabpanel" aria-label={c.name} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}
            onPointerMove={spotlightMove} className="spotlight @container relative flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-surface p-5 sm:p-8" style={{ ['--c' as string]: c.color }}>
            <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full blur-3xl" style={{ background: c.color + '22' }} />
            <div className="relative flex flex-wrap items-center gap-4">
              <div className="grid size-14 place-items-center rounded-2xl" style={{ background: c.color + '1f', color: c.color }}><CatIcon className="size-7" /></div>
              <div className="min-w-0 flex-1"><h3 className="font-display text-2xl font-bold">{c.name}</h3><p className="text-muted">{c.blurb}</p></div>
              <Link to={`/category/${c.id}`}><Button variant="outline" icon={<ArrowRight className="size-4" />}>All {list.length}</Button></Link>
            </div>
            {formats.length > 0 && (
              <div className="relative mt-5 flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Popular formats</span>
                {formats.map(({ format, count }) => (
                  <Link key={format} to={`/tools?format=${format}`} className="rounded-md border border-border bg-surface-2/40 px-2 py-1 font-mono text-[11px] text-muted transition hover:border-transparent hover:text-fg" style={{ ['--tw-ring-color' as string]: c.color }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = c.color + '22' }} onMouseLeave={(e) => { e.currentTarget.style.background = '' }}>.{format.toLowerCase()} <span className="opacity-60">{count}</span></Link>
                ))}
              </div>
            )}
            <div className="relative mt-5 grid gap-2 @lg:grid-cols-2 @4xl:grid-cols-3">
              {top.map((t, i) => { const I = getIcon(t.icon); return (
                <motion.div key={t.slug} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }}>
                  <Link to={`/${t.slug}`} className="group flex h-full items-start gap-3 rounded-xl border border-border bg-surface-2/40 p-3 transition hover:border-transparent hover:bg-surface-2">
                    <span data-cat={t.category} className="icon-anim mt-0.5 shrink-0" style={{ color: c.color }}><I className="size-4" /></span>
                    <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">{t.name}{t.badge && <span className="rounded px-1 text-[9px] font-bold" style={{ background: (BADGE_COLORS[t.badge] ?? c.color) + '22', color: BADGE_COLORS[t.badge] ?? c.color }}>{t.badge}</span>}</span><span className="line-clamp-1 text-xs text-muted">{t.desc}</span></span>
                  </Link>
                </motion.div>) })}
              {list.length > top.length && (
                <Link to={`/category/${c.id}`} className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border p-3 text-sm text-muted transition hover:border-accent hover:text-fg">+{list.length - top.length} more {c.name.toLowerCase()} tools <ArrowRight className="size-3.5" /></Link>
              )}
            </div>
            {pipe && (
              <div className="relative mt-5 rounded-2xl border border-border bg-gradient-to-r from-accent/8 via-transparent to-accent-2/8 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold"><Workflow className="size-4 text-accent" /> {pipe.kind === 'workspace' ? 'Try a pipeline' : 'Try a chain'}</div>
                  <Link to={pipe.kind === 'workspace' ? '/workspace' : `/${pipe.steps[0].slug}`} className="text-xs text-accent hover:underline">{pipe.kind === 'workspace' ? 'Open Workspace' : `Start with ${pipe.steps[0].name}`}</Link>
                </div>
                <ol className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                  {pipe.steps.map((t, i) => (
                    <li key={t.slug} className="flex items-center gap-1.5">
                      {i > 0 && <span className="flex items-center gap-1 text-muted">{pipe.kind === 'chain' && pipe.via ? <span className="font-mono text-[10px]">.{pipe.via.toLowerCase()}</span> : null}<ArrowRight className="size-3" /></span>}
                      <Link to={`/${t.slug}`} className="flex min-h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 hover:border-accent"><span className="grid size-4 place-items-center rounded-full bg-accent/15 text-[9px] font-bold text-accent">{i + 1}</span>{t.name}</Link>
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-xs text-muted">{pipe.kind === 'workspace' ? 'Chain these steps once, then run them on hundreds of files at the same time.' : 'The result of the first tool opens straight in the second with one tap after you download.'}</p>
              </div>
            )}
            <div className="min-h-5 flex-1" aria-hidden="true" />
            <div className="relative flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-4 text-xs text-muted">
              <span><Counter value={list.length} className="font-semibold text-fg" /> tools</span>
              <span><Counter value={allFormats(list).length} className="font-semibold text-fg" /> formats</span>
              {ai > 0 && <span><span className="font-semibold text-fg">{ai}</span> on-device AI</span>}
              {fresh > 0 && <span><span className="font-semibold text-fg">{fresh}</span> new</span>}
              <span className="flex items-center gap-1"><Lock className="size-3" /> all local</span>
              <span className="ml-auto flex flex-wrap gap-3">
                {doc && <Link to={doc.path} className="link-underline hover:text-fg">Read the guide</Link>}
                <Link to={`/category/${c.id}`} className="link-underline font-medium text-accent">Open {c.name}</Link>
              </span>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}

function PopularTools() {
  const list = TOOLS.filter((t) => t.popular).slice(0, 12)
  return (
    <section className="mx-auto mt-24 max-w-7xl px-4 sm:px-6">
      <SectionHead kicker="The essentials" title="Most used tools" sub="The fastest path from a raw file to a finished one. Hover a card for a preview when one is available." />
      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{list.map((t) => <StaggerItem key={t.slug}><ToolCard tool={t} /></StaggerItem>)}</Stagger>
      <div className="mt-8 text-center"><Link to="/tools" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">See every tool <ArrowRight className="size-4" /></Link></div>
    </section>
  )
}

function LaunchVideo({ onFilm }: { onFilm: () => void }) {
  return (
    <section className="mx-auto mt-28 max-w-6xl px-4 sm:px-6">
      <SectionHead kicker="Launch film" title={<>See OpenFile in <span className="text-gradient">under a minute</span></>} sub="A quick tour of the tools, the workspace and the privacy-first engine." />
      <Reveal>
        <button onClick={onFilm} onPointerMove={spotlightMove} className="spotlight group relative block w-full overflow-hidden rounded-3xl border border-border bg-black text-left shadow-glow cursor-pointer">
          <div className="flex items-center gap-1.5 border-b border-white/10 bg-black px-4 py-3"><span className="size-3 rounded-full bg-[#ff5f57]" /><span className="size-3 rounded-full bg-[#febc2e]" /><span className="size-3 rounded-full bg-[#28c840]" /><span className="ml-3 font-mono text-xs text-white/50">openfile | launch.mp4</span></div>
          <div className="relative aspect-video">
            <img src={`${base}media/poster.jpg`} alt="OpenFile launch video" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover transition duration-700 group-hover:scale-[1.03]" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <div className="absolute inset-0 grid place-items-center">
              <span className="relative grid size-20 place-items-center rounded-full bg-gradient-brand shadow-glow transition group-hover:scale-110"><span className="absolute inset-0 animate-ping rounded-full bg-accent/30" /><Play className="relative ml-1 size-8 fill-current" /></span>
            </div>
            <div className="absolute bottom-5 left-6 text-white"><div className="font-display text-2xl font-bold">Introducing OpenFile</div><div className="text-sm text-white/80">Every file tool, in your browser.</div></div>
          </div>
        </button>
      </Reveal>
    </section>
  )
}

function FilmModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', k)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = prev }
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[70] grid place-items-center bg-black/85 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} role="dialog" aria-modal="true" aria-label="OpenFile launch film">
          <motion.div initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }} className="relative w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-black shadow-glow" onClick={(e) => e.stopPropagation()}>
            <video src={`${base}media/launch.mp4`} poster={`${base}media/poster.jpg`} controls autoPlay playsInline className="aspect-video w-full bg-black" />
            <button onClick={onClose} className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-black/70 text-white hover:bg-black cursor-pointer" aria-label="Close video"><X className="size-5" /></button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Stats() {
  const formats = allFormats().length
  const items: { v: number; s?: string; l: string; d: string }[] = [
    { v: TOOLS.length, s: '+', l: 'Tools', d: 'for documents, media and code' },
    { v: CATEGORIES.length, l: 'Categories', d: 'from PDF to developer utilities' },
    { v: formats, s: '+', l: 'File formats', d: 'read, written or converted' },
    { v: 0, l: 'Bytes uploaded', d: 'your files stay on your device' },
  ]
  return (
    <section className="mx-auto mt-28 max-w-6xl px-4 sm:px-6">
      <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {items.map((x) => (
          <StaggerItem key={x.l}>
            <div onPointerMove={spotlightMove} className="spotlight h-full rounded-2xl border border-border bg-surface p-6">
              <div className="font-display text-4xl font-bold sm:text-5xl"><Counter value={x.v} suffix={x.s} className="text-gradient" /></div>
              <div className="mt-2 font-medium">{x.l}</div>
              <div className="text-sm text-muted">{x.d}</div>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  )
}

function AllFormatsSection() {
  const counts = new Map(allFormats().map((f) => [f.format, f.count]))
  return (
    <section className="mx-auto mt-28 max-w-7xl px-4 sm:px-6">
      <SectionHead kicker="All formats" title="Bring any file" sub="Click a format to see every tool that works with it." />
      <Stagger className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {FORMAT_GROUPS.map((g) => (
          <StaggerItem key={g.id}>
            <div onPointerMove={spotlightMove} className="spotlight h-full rounded-2xl border border-border bg-surface p-5" style={{ ['--c' as string]: g.color }}>
              <div className="flex items-center gap-2 font-semibold"><span className="size-2.5 rounded-full" style={{ background: g.color }} />{g.name}</div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {g.formats.map((f) => { const n = counts.get(f) ?? 0; return (
                  <Link key={f} to={n ? `/tools?format=${f}` : '/tools'} className={cn('rounded-md border px-2 py-1 font-mono text-[11px] transition', n ? 'border-border text-fg hover:border-transparent' : 'border-dashed border-border text-muted')} style={n ? { ['--tw-shadow-color' as string]: g.color } : undefined}
                    onMouseEnter={(e) => { if (n) e.currentTarget.style.background = g.color + '22' }} onMouseLeave={(e) => { e.currentTarget.style.background = '' }}>
                    .{f.toLowerCase()}{n ? <span className="ml-1 text-muted">{n}</span> : null}
                  </Link>) })}
              </div>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  )
}

function Why() {
  const items = [
    { i: ShieldCheck, t: 'Private by design', claim: 'Your files never leave your device.', d: 'Files are processed with WebAssembly and Canvas inside your tab. There is no upload step and no server that could keep a copy.' },
    { i: Zap, t: 'Fast', claim: 'No upload queue, no download wait.', d: 'Most jobs finish in milliseconds on your own CPU and GPU, because the bytes never travel over the network.' },
    { i: Cpu, t: 'On-device AI', claim: 'Smart tools without the cloud.', d: 'Background removal, OCR, upscaling and Whisper transcription run locally with WebAssembly and WebGPU.' },
    { i: Inf, t: 'No limits', claim: 'No caps, no quotas, no watermarks.', d: 'No file size limits, no daily quotas and no account. The only limit is your device memory.' },
    { i: WifiOff, t: 'Works offline', claim: 'Load once, keep working.', d: 'A service worker caches the app and every engine you use, so tools keep working with no connection.' },
    { i: Code2, t: 'Open source', claim: 'Read every line.', d: 'MIT licensed. Audit the code, self-host it, or add a tool of your own.' },
  ]
  return (
    <section className="mx-auto mt-28 max-w-7xl px-4 sm:px-6">
      <SectionHead kicker="Why OpenFile" title="What you can count on" sub="Promises the code keeps, not marketing lines." />
      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ i: I, t, claim, d }) => (
          <StaggerItem key={t}>
            <div onPointerMove={spotlightMove} className="spotlight group relative h-full overflow-hidden rounded-2xl border border-border bg-surface p-6">
              <div className="font-display text-5xl leading-none text-accent/30" aria-hidden="true">"</div>
              <p className="-mt-3 font-display text-xl font-semibold leading-snug">{claim}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted">{d}</p>
              <div className="mt-5 flex items-center gap-3 border-t border-border pt-4">
                <div className="grid size-9 place-items-center rounded-xl bg-gradient-brand shadow-lg shadow-accent/20 transition group-hover:rotate-[-6deg]"><I className="size-4" /></div>
                <div className="text-sm font-medium">{t}</div>
              </div>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  )
}

function BlogTeaser() {
  const posts = POSTS.slice(0, 3)
  return (
    <section className="mx-auto mt-28 max-w-7xl px-4 sm:px-6">
      <SectionHead kicker="From the blog" title="Guides with live demos" sub="Plain writing about files, privacy and the web, with demos you can try in the post." />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{posts.map((p, i) => <PostCard key={p.slug} p={p} i={i} />)}</div>
      <div className="mt-8 text-center"><Link to="/blog" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">All posts <ArrowRight className="size-4" /></Link></div>
    </section>
  )
}

function Faq() {
  const qs = [
    ['Are my files uploaded anywhere?', 'No. Every tool processes files inside your browser using JavaScript, WebAssembly and Canvas. You can even go offline after the page loads.'],
    ['Is OpenFile really free?', 'Yes. It is free and open source under the MIT license. There is no premium tier, no watermark and no limit.'],
    ['Why do some tools take longer the first time?', 'Heavy engines like ffmpeg (video), Tesseract (OCR) and AI models download once on first use, then your browser caches them.'],
    ['Which browsers are supported?', 'Recent Chrome, Edge, Firefox and Safari. AI tools run fastest in Chromium browsers with WebGPU.'],
    ['Can I self-host it?', 'Yes. It is a static site, so you can deploy it to Vercel, Netlify, GitHub Pages or any static host. The docs explain how.'],
    ['Can I install it like an app?', 'Yes. OpenFile is a Progressive Web App. Use your browser\u2019s Install option to add it to your desktop or phone.'],
    ['Can I change how it looks?', 'Yes. Pick Black, Dark, Sun or System, choose an accent color, and set density, corners and font from the theme button in the header.'],
  ]
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section className="mx-auto mt-28 max-w-3xl px-4 sm:px-6">
      <SectionHead kicker="FAQ" title="Questions, answered" />
      <Reveal className="divide-y divide-border rounded-2xl border border-border bg-surface">
        {qs.map(([q, a], i) => (
          <div key={q}>
            <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-medium cursor-pointer">{q}<ChevronDown className={cn('size-4 shrink-0 transition duration-300', open === i && 'rotate-180 text-accent')} /></button>
            <AnimatePresence initial={false}>
              {open === i && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden"><p className="px-5 pb-5 text-sm leading-relaxed text-muted">{a}</p></motion.div>}
            </AnimatePresence>
          </div>
        ))}
      </Reveal>
    </section>
  )
}

function Cta() {
  return (
    <section className="mx-auto mt-28 max-w-5xl px-4 sm:px-6">
      <Reveal>
        <div className="on-dark relative overflow-hidden rounded-3xl border border-border bg-black p-10 text-center text-white sm:p-16">
          <Aurora density={24} />
          <div className="pointer-events-none absolute left-1/2 top-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 opacity-60"><GoldRing size={520} /></div>
          <div className="relative">
            <Sparkles className="mx-auto size-8 text-accent" />
            <h2 className="mt-4 font-display text-3xl font-bold sm:text-5xl">Your files. Your device. <span className="text-gradient">Done.</span></h2>
            <p className="mx-auto mt-3 max-w-xl text-white/75">Bookmark OpenFile, install it as an app, or star the repo to follow new tools.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Magnetic><Link to="/tools"><Button size="lg" icon={<Layers className="size-4" />}>Explore all tools</Button></Link></Magnetic>
              <Magnetic><a href={REPO_URL} target="_blank" rel="noreferrer" className="flex h-12 items-center gap-2 rounded-xl border border-white/25 px-6 font-semibold transition hover:border-accent hover:text-accent"><Github className="size-4" /> Star on GitHub</a></Magnetic>
            </div>
            <div className="mt-6 flex justify-center gap-4 text-xs text-white/60"><span className="flex items-center gap-1"><Lock className="size-3" /> No uploads</span><span>|</span><span>MIT licensed</span><span>|</span><span className="flex items-center gap-1"><Command className="size-3" /> Ctrl K to search</span></div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

/** Drop any file for instant suggestions and a real in-browser conversion demo for images */
function SmartDrop() {
  const [file, setFile] = useState<File | null>(null)
  const [over, setOver] = useState(false)
  const [demo, setDemo] = useState<{ blob: Blob; ms: number; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()
  const [kind, setKind] = useState<{ label: string; format: string; mismatch: boolean; tools: ToolMeta[] } | null>(null)
  const pick = async (f: File) => {
    setFile(f); setDemo(null); setKind(null)
    detectFile(f).then((d) => setKind({ label: d.label, format: d.format, mismatch: d.mismatch, tools: toolsForFormat(d.format, f).slice(0, 10) })).catch(() => {})
    if (f.type.startsWith('image/') && f.type !== 'image/svg+xml') {
      setBusy(true)
      try {
        const t0 = performance.now(); const img = await loadImage(f)
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d')!.drawImage(img, 0, 0)
        const blob = await canvasToBlob(c, 'image/webp', 0.8)
        setDemo({ blob, ms: Math.round(performance.now() - t0), url: URL.createObjectURL(blob) })
      } catch {} finally { setBusy(false) }
    }
  }
  const sugg = file ? (kind?.tools.length ? kind.tools : suggestFor(file).map(toolBySlug).filter(Boolean)) : []
  return (
    <section className="mx-auto mt-16 max-w-6xl px-4 sm:px-6" data-tour="drop">
      <div onPointerMove={spotlightMove} className="spotlight relative overflow-hidden rounded-3xl border border-border bg-surface p-6 sm:p-10">
        <div className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative grid items-center gap-8 lg:grid-cols-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-accent">Smart drop | live sandbox</div>
            <h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Drop any file. OpenFile knows what to do.</h2>
            <p className="mt-3 text-muted">OpenFile detects the file type and suggests the right tools. Drop an image and watch it convert to WebP right here. Nothing leaves your machine.</p>
            <ul className="mt-5 space-y-2 text-sm">
              {['PDFs, images, video, audio, Office docs, data files', 'Reads the bytes, so a wrong extension cannot fool it', 'Opens the tool with your file already loaded', 'Or drop a file on any page, any time'].map((x) => <li key={x} className="flex items-center gap-2"><Check className="size-4 text-success" />{x}</li>)}
            </ul>
          </div>
          <div>
            <label onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) pick(f) }}
              className={cn('flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition', over ? 'border-accent bg-accent/10' : 'border-border bg-surface-2/40 hover:border-accent/60')}>
              <input type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = '' }} />
              {!file ? (<><div className="grid size-14 place-items-center rounded-2xl bg-gradient-brand text-on-accent shadow-lg"><Upload className="size-6" /></div><div className="font-semibold">Drop a file or click to choose</div><div className="text-xs text-muted">Try a photo for the live WebP demo</div></>) : (
                <div className="w-full text-left" onClick={(e) => e.preventDefault()}>
                  <div className="flex items-center justify-between gap-2"><div className="truncate font-medium">{file.name}</div><span className="shrink-0 text-xs text-muted">{formatBytes(file.size)}</span></div>
                  {kind && <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted"><span className="rounded-md bg-accent/15 px-1.5 py-0.5 font-mono font-bold text-accent">{kind.format || '?'}</span>{kind.label}{kind.mismatch && <span className="text-warn">name and content do not match</span>}</div>}
                  {busy && <div className="shimmer mt-3 h-2 rounded-full" />}
                  {demo && (
                    <div className="mt-3 flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 p-3">
                      <img src={demo.url} className="size-14 rounded-lg object-cover" alt="" />
                      <div className="min-w-0 flex-1 text-sm"><div className="font-medium">Converted to WebP in {demo.ms} ms</div><div className="text-muted">{formatBytes(file.size)} to <span className="text-success font-medium">{formatBytes(demo.blob.size)}</span></div></div>
                      <Button size="sm" icon={<Download className="size-3.5" />} onClick={() => downloadBlob(demo.blob, renameExt(file.name, 'webp'))}>Save</Button>
                    </div>
                  )}
                  <div className="mt-4 text-xs font-medium uppercase tracking-wide text-muted">Open with</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {sugg.map((t) => { const I = getIcon(t!.icon); return <button key={t!.slug} onClick={() => { setHandoff([file]); nav('/' + t!.slug) }} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs hover:border-accent hover:text-accent cursor-pointer"><I className="size-3.5" />{t!.name}</button> })}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-4">
                    <button onClick={() => { setFile(null); setDemo(null); setKind(null) }} className="min-h-9 text-xs text-muted underline cursor-pointer">Choose another file</button>
                    <button onClick={() => openDropSheet([file])} className="min-h-9 text-xs text-accent underline cursor-pointer">See every match</button>
                  </div>
                </div>
              )}
            </label>
          </div>
        </div>
      </div>
    </section>
  )
}

function Personal() {
  const { fav } = useFavorites(); const { recent } = useRecent()
  const f = fav.map(toolBySlug).filter(Boolean); const r = recent.map(toolBySlug).filter(Boolean)
  if (!f.length && !r.length) return null
  return (
    <section className="mx-auto mt-16 max-w-7xl px-4 sm:px-6">
      {f.length > 0 && <><h3 className="mb-3 flex items-center gap-2 font-semibold"><Star className="size-4 text-warn" /> Your favorites</h3><div className="mb-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{f.map((t) => <ToolCard key={t!.slug} tool={t!} compact />)}</div></>}
      {r.length > 0 && <><h3 className="mb-3 flex items-center justify-between font-semibold text-muted"><span>Recently used</span><Link to="/history" className="text-sm font-normal text-accent hover:underline">View history</Link></h3><div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{r.slice(0, 6).map((t) => <ToolCard key={t!.slug} tool={t!} compact />)}</div></>}
    </section>
  )
}

function WorkspacePromo() {
  const steps = ['Resize 1600px', 'Watermark', 'Strip EXIF', 'Convert WebP', 'ZIP']
  const [i, setI] = useState(0)
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % (steps.length + 1)), 900); return () => clearInterval(t) }, [])
  return (
    <section className="mx-auto mt-28 max-w-6xl px-4 sm:px-6">
      <div onPointerMove={spotlightMove} className="spotlight relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-accent/12 via-surface to-accent-2/10 p-8 sm:p-12">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-accent/15 px-3 py-1 text-xs font-bold text-accent"><Workflow className="size-3.5" /> OPENFILE WORKSPACE</div>
            <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Chain tools into one automated pipeline.</h2>
            <p className="mt-3 text-muted">Batch-process hundreds of images or PDFs with a reusable recipe. Save recipes, re-run them, and download everything as a ZIP.</p>
            <Link to="/workspace"><Button size="lg" className="mt-6" icon={<ArrowRight className="size-4" />}>Open Workspace</Button></Link>
          </div>
          <Parallax speed={0.12}><div className="rounded-2xl border border-border bg-surface p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between text-xs text-muted"><span className="font-mono">pipeline: product-photos</span><span>248 files</span></div>
            <div className="space-y-2">
              {steps.map((s, k) => (
                <div key={s} className={cn('flex items-center gap-3 rounded-xl border px-4 py-3 transition-all', k < i ? 'border-success/30 bg-success/5' : k === i ? 'border-accent bg-accent/10 scale-[1.02]' : 'border-border')}>
                  <div className={cn('grid size-6 place-items-center rounded-full text-[11px] font-bold', k < i ? 'bg-success text-white' : k === i ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted')}>{k < i ? <Check className="size-3.5" /> : k + 1}</div>
                  <span className="text-sm font-medium">{s}</span>
                  {k === i && <div className="shimmer ml-auto h-1.5 w-20 rounded-full" />}
                </div>
              ))}
            </div>
          </div></Parallax>
        </div>
      </div>
    </section>
  )
}

function Compare() {
  const rows: [string, boolean, boolean][] = [['Files stay on your device', true, false], ['No sign-up or email', true, false], ['Unlimited file size and count', true, false], ['No watermarks', true, false], ['Works offline after load', true, false], ['On-device AI tools', true, false], ['Batch pipelines', true, false], ['Open source', true, false]]
  return (
    <section className="mx-auto mt-28 max-w-4xl px-4 sm:px-6">
      <SectionHead kicker="Compare" title="OpenFile vs. typical upload-based tools" />
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="grid grid-cols-[1fr_72px_72px] sm:grid-cols-[1fr_120px_120px] border-b border-border bg-surface-2/60 px-5 py-3 text-xs font-bold uppercase tracking-wide text-muted"><span>Feature</span><span className="text-center text-accent">OpenFile</span><span className="text-center">Others</span></div>
        {rows.map(([f, a, b]) => (
          <div key={f} className="grid grid-cols-[1fr_72px_72px] sm:grid-cols-[1fr_120px_120px] border-b border-border px-5 py-3 text-sm last:border-0"><span>{f}</span><span className="flex justify-center">{a ? <Check className="size-5 text-success" /> : <X className="size-5 text-danger" />}</span><span className="flex justify-center">{b ? <Check className="size-5 text-success" /> : <X className="size-5 text-muted" />}</span></div>
        ))}
      </div>
    </section>
  )
}

function Workflows() {
  const w = [
    { i: GraduationCap, t: 'Students', d: 'Scan notes to PDF, merge assignments, compress for portals and OCR handouts.', tools: ['image-to-pdf', 'merge-pdf', 'compress-pdf', 'ocr-pdf'] },
    { i: Users, t: 'Teams', d: 'Sign contracts, redact sensitive data, watermark drafts and compare versions.', tools: ['sign-pdf', 'redact-pdf', 'pdf-watermark', 'compare-pdf'] },
    { i: Palette, t: 'Creators', d: 'Remove backgrounds, upscale, make GIFs and polish screenshots for socials.', tools: ['background-remover', 'image-upscaler', 'video-to-gif', 'screenshot-studio'] },
    { i: Store, t: 'Storefronts', d: 'Batch-resize product photos, strip EXIF, convert to WebP and create invoices.', tools: ['image-resizer', 'image-converter', 'invoice-generator', 'barcode-generator'] },
  ]
  return (
    <section className="mx-auto mt-28 max-w-7xl px-4 sm:px-6">
      <SectionHead kicker="Scenarios" title="Workflows people actually use" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {w.map(({ i: I, t, d, tools }) => (
          <div key={t} className="rounded-2xl border border-border bg-surface p-6">
            <I className="size-6 text-accent" /><div className="mt-3 font-semibold">For {t}</div><p className="mt-1.5 text-sm text-muted">{d}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">{tools.map((s) => <Link key={s} to={'/' + s} className="rounded-md bg-surface-2 px-2 py-1 text-xs hover:text-accent">{toolBySlug(s)?.name}</Link>)}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
