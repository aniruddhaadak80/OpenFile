import { Suspense, useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Search, Menu, X, ChevronDown, Settings as SettingsIcon, History as HistoryIcon } from 'lucide-react'
import { MotionConfig, AnimatePresence, motion, useScroll, useSpring } from 'framer-motion'
import { ThemeSwitcher } from './ThemeSwitcher'
import { Footer } from './Footer'
import { PageTransition, RouteWipe } from './motion'
import { Logo, Github } from './Logo'
import { CommandPalette } from './CommandPalette'
import { Toaster } from './toast'
import { GlobalDrop } from './DropFlow'
import { ShortcutsOverlay, OnboardingTour, OfflineIndicator, InstallPrompt, useGlobalShortcuts } from './Overlays'
import { CATEGORIES, TOOLS } from '@/tools/registry'
import { getIcon } from './icons'
import { useReducedMotion } from '@/lib/store'
import { cn } from './ui'
import { bootDone } from '@/lib/boot'
import { UpdateBar, HeaderInstall } from './app/AppStatus'

export const REPO_URL = 'https://github.com/aniruddhaadak80/OpenFile'

export function Layout() {
  const reduce = useReducedMotion()
  const [palette, setPalette] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [mega, setMega] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const openPalette = useCallback(() => setPalette(true), [])
  const { help, setHelp } = useGlobalShortcuts(openPalette)
  const loc = useLocation()
  const { scrollYProgress } = useScroll()
  const progress = useSpring(scrollYProgress, { stiffness: 200, damping: 30, mass: 0.3 })
  useEffect(() => { setMobile(false); setMega(false); if (!loc.hash) window.scrollTo({ top: 0 }) }, [loc.pathname])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p) } }
    const s = () => setScrolled(window.scrollY > 8)
    window.addEventListener('keydown', k); window.addEventListener('scroll', s)
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('scroll', s) }
  }, [])

  return (
    <MotionConfig reducedMotion={reduce ? 'always' : 'never'}>
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-on-accent">Skip to content</a>
      <header className={cn('sticky top-0 z-50 transition-all duration-300', scrolled ? 'glass border-b border-border' : 'border-b border-transparent bg-transparent')}>
        <motion.div className="absolute inset-x-0 bottom-0 h-px origin-left bg-gradient-brand" style={{ scaleX: progress, opacity: scrolled ? 1 : 0 }} aria-hidden="true" />
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight">
            <span className="transition-transform duration-500 hover:rotate-[-8deg]"><Logo size={30} /></span> OpenFile <span className="hidden rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent sm:inline">v1.0</span>
          </Link>
          <nav className="ml-4 hidden items-center gap-1 text-sm md:flex">
            <div className="relative" onMouseEnter={() => setMega(true)} onMouseLeave={() => setMega(false)} onKeyDown={(e) => { if (e.key === 'Escape') setMega(false) }} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setMega(false) }}>
              <button onClick={() => setMega((v) => !v)} aria-expanded={mega} aria-haspopup="true" className="nav-pill flex items-center gap-1 rounded-lg px-3 py-2 text-muted hover:text-fg cursor-pointer">Tools <ChevronDown className={cn('size-3.5 transition', mega && 'rotate-180')} /></button>
              <AnimatePresence>
              {mega && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="absolute left-0 top-full w-[min(860px,calc(100vw-2rem))] pt-2">
                  <div className="grid max-h-[75vh] grid-cols-3 gap-4 overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl scrollbar-thin lg:grid-cols-4">
                    {CATEGORIES.map((c) => (
                      <div key={c.id}>
                        <Link to={`/category/${c.id}`} className="mb-2 block text-xs font-bold uppercase tracking-wider" style={{ color: c.color }}>{c.name}</Link>
                        <div className="space-y-0.5">
                          {TOOLS.filter((t) => t.category === c.id).slice(0, 6).map((t) => { const I = getIcon(t.icon); return (
                            <Link key={t.slug} to={`/${t.slug}`} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[13px] text-muted hover:bg-surface-2 hover:text-fg"><I className="size-3.5" />{t.name}</Link>) })}
                          <Link to={`/category/${c.id}`} className="block px-1.5 py-1 text-xs text-accent">All {TOOLS.filter((t) => t.category === c.id).length} {TOOLS.filter((t) => t.category === c.id).length === 1 ? "tool" : "tools"}</Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
              </AnimatePresence>
            </div>
            {[['/tools', 'All Tools'], ['/workspace', 'Workspace'], ['/docs', 'Docs'], ['/blog', 'Blog'], ['/install', 'Install'], ['/about', 'About']].map(([to, l]) => (
              <NavLink key={to} to={to} className={({ isActive }) => cn('nav-pill relative rounded-lg px-3 py-2 transition-colors hover:text-fg', isActive ? 'text-fg' : 'text-muted')}>
                {({ isActive }) => <>{l}{isActive && <motion.span layoutId="nav-underline" className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" />}</>}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button data-tour="search" onClick={() => setPalette(true)} className="hidden h-9 items-center gap-2 rounded-xl border border-border bg-surface-2/60 px-3 text-sm text-muted hover:text-fg sm:flex cursor-pointer">
              <Search className="size-4" /> Search tools <kbd className="ml-4 rounded border border-border px-1.5 font-mono text-[10px]">Ctrl K</kbd>
            </button>
            <button onClick={() => setPalette(true)} className="grid size-11 place-items-center rounded-xl text-muted hover:bg-surface-2 sm:hidden" aria-label="Search"><Search className="size-4" /></button>
            <HeaderInstall />
            <Link to="/history" className="hidden size-9 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg md:grid" aria-label="History" title="History"><HistoryIcon className="size-4" /></Link>
            <Link to="/settings" className="hidden size-9 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg md:grid" aria-label="Settings" title="Settings"><SettingsIcon className="size-4" /></Link>
            <span data-tour="theme" className="inline-flex rounded-xl"><ThemeSwitcher /></span>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="hidden size-11 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg sm:grid md:size-9" aria-label="GitHub"><Github className="size-4" /></a>
            <button onClick={() => setMobile(!mobile)} className="grid size-11 place-items-center rounded-xl text-muted hover:bg-surface-2 md:hidden" aria-label={mobile ? 'Close menu' : 'Open menu'} aria-expanded={mobile} aria-controls="mobile-menu">{mobile ? <X className="size-5" /> : <Menu className="size-5" />}</button>
          </div>
        </div>
        {mobile && (
          <motion.div id="mobile-menu" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-border bg-surface px-4 py-3 md:hidden">
            <div className="grid grid-cols-2 gap-1">{[['/tools', 'All Tools'], ['/install', 'Install app'], ['/workspace', 'Workspace'], ['/docs', 'Docs'], ['/blog', 'Blog'], ['/history', 'History'], ['/settings', 'Settings'], ['/changelog', 'Changelog'], ['/about', 'About'], ['/privacy', 'Privacy']].map(([to, l]) => <Link key={to} to={to} className="flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-surface-2">{l}</Link>)}</div>
            <div className="mt-2 grid grid-cols-2 gap-1">{CATEGORIES.map((c) => <Link key={c.id} to={`/category/${c.id}`} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-muted hover:bg-surface-2"><span className="size-2 rounded-full" style={{ background: c.color }} />{c.name}</Link>)}</div>
          </motion.div>
        )}
      </header>
      <RouteWipe k={loc.pathname} />
      <main id="main" tabIndex={-1} className="flex-1 outline-none"><AnimatePresence mode="wait" initial={false}><PageTransition key={loc.pathname} k={loc.pathname}><Suspense fallback={<RouteSkeleton />}><Outlet /><BootDone /></Suspense></PageTransition></AnimatePresence></main>
      <Footer />
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <ShortcutsOverlay open={help} onClose={() => setHelp(false)} />
      <GlobalDrop />
      <OnboardingTour />
      <OfflineIndicator />
      <InstallPrompt />
      <UpdateBar />
      <Toaster />
    </div>
    </MotionConfig>
  )
}

/** Commits only once the route's lazy chunk has resolved (it sits inside the Suspense boundary), then ends the boot splash. */
function BootDone() {
  useEffect(() => { bootDone() }, [])
  return null
}

function RouteSkeleton() {
  return (
    <div className="of-delay mx-auto max-w-7xl px-4 pt-12 sm:px-6" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-10 w-64" /><div className="skeleton mt-3 h-4 w-96 max-w-full" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton h-40 rounded-2xl" />)}</div>
    </div>
  )
}
