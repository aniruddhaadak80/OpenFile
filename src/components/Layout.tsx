import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigationType } from 'react-router-dom'
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
import { catGroups, colsClass, spanClass } from '@/lib/catgrid'
import { getIcon } from './icons'
import { useReducedMotion } from '@/lib/store'
import { cn } from './ui'
import { bootDone } from '@/lib/boot'
import { ErrorBoundary } from './ErrorBoundary'
import { UpdateBar, HeaderInstall } from './app/AppStatus'
import { startFrameWatchdog, startOffscreenMotion } from '@/lib/offscreenMotion'

export const REPO_URL = 'https://github.com/aniruddhaadak80/OpenFile'

// Scroll position per history entry, so Back and Forward return to where the reader was (a blog search result list,
// a long category page) instead of the top. New navigations still start at the top.
const scrollByKey = new Map<string, number>()
const SCROLL_KEY = 'of:scroll'
function savedScroll(key: string): number | undefined {
  if (scrollByKey.has(key)) return scrollByKey.get(key)
  try { const v = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || '{}')[key]; return typeof v === 'number' ? v : undefined } catch { return undefined }
}
function persistScroll() {
  try { sessionStorage.setItem(SCROLL_KEY, JSON.stringify(Object.fromEntries([...scrollByKey].slice(-50)))) } catch { /* storage may be blocked */ }
}

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
  const navType = useNavigationType()
  const keyRef = useRef(loc.key)
  useLayoutEffect(() => { keyRef.current = loc.key }, [loc.key])
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
    let t = 0
    const save = () => { scrollByKey.set(keyRef.current, Math.round(window.scrollY)); clearTimeout(t); t = window.setTimeout(persistScroll, 250) }
    window.addEventListener('scroll', save, { passive: true })
    window.addEventListener('pagehide', persistScroll)
    return () => { window.removeEventListener('scroll', save); window.removeEventListener('pagehide', persistScroll); clearTimeout(t) }
  }, [])
  useEffect(() => {
    setMobile(false); setMega(false)
    const y = navType === 'POP' ? savedScroll(loc.key) : undefined
    if (y == null) { if (!loc.hash) window.scrollTo({ top: 0 }); return }
    // The page may still be loading (lazy route, list animating in), so keep trying until it is tall enough, for up to 2 s.
    // Any wheel, touch or key from the reader stops it.
    let raf = 0, stop = false
    const end = Date.now() + 2000
    const cancel = () => { stop = true }
    const tryScroll = () => {
      if (stop) return
      const max = document.documentElement.scrollHeight - window.innerHeight
      window.scrollTo({ top: Math.min(y, Math.max(0, max)) })
      if (max < y && Date.now() < end) raf = requestAnimationFrame(tryScroll)
    }
    tryScroll()
    const opts = { passive: true, once: true } as const
    window.addEventListener('wheel', cancel, opts); window.addEventListener('touchstart', cancel, opts); window.addEventListener('keydown', cancel, opts)
    return () => { stop = true; cancelAnimationFrame(raf); window.removeEventListener('wheel', cancel); window.removeEventListener('touchstart', cancel); window.removeEventListener('keydown', cancel) }
  }, [loc.pathname]) // eslint-disable-line react-hooks/exhaustive-deps
  // The Tools menu opens on hover, so focus is often outside it: Escape closes it from anywhere, and so does a tap
  // or click outside it (touch screens never send the mouse leave that closes it on desktop).
  const megaWrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!mega) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setMega(false) }
    const d = (e: PointerEvent) => { if (megaWrap.current && !megaWrap.current.contains(e.target as Node)) setMega(false) }
    window.addEventListener('keydown', k); window.addEventListener('pointerdown', d)
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('pointerdown', d) }
  }, [mega])
  const megaBox = useRef<HTMLDivElement>(null)
  // Touch screens send no hover, and a mouse click right after the hover opened the menu should not close it again.
  const hoverAt = useRef(0)
  const [megaEnd, setMegaEnd] = useState(true)
  const megaScroll = useCallback(() => { const el = megaBox.current; if (el) setMegaEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 8) }, [])
  useEffect(() => { if (mega) requestAnimationFrame(megaScroll) }, [mega, megaScroll])
  // The menu lines up with the Tools button but always stays inside the viewport with a 16 px margin, at any width.
  const [megaPos, setMegaPos] = useState<{ left: number; width: number }>({ left: 0, width: 860 })
  useLayoutEffect(() => {
    if (!mega) return
    const place = () => {
      const r = megaWrap.current?.getBoundingClientRect(); if (!r) return
      const vw = document.documentElement.clientWidth, width = Math.min(1120, vw - 32)
      const x = Math.min(Math.max(r.left, 16), vw - 16 - width)
      setMegaPos({ left: Math.round(x - r.left), width })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [mega])
  useEffect(() => { const a = startOffscreenMotion(), b = startFrameWatchdog(); return () => { a(); b() } }, [])
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
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 md:gap-2 lg:gap-4">
          <Link to="/" className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight">
            <span className="transition-transform duration-500 hover:rotate-[-8deg]"><Logo size={30} /></span> OpenFile <span className="hidden rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent sm:inline md:hidden lg:inline">v{__APP_VERSION__.split('.').slice(0, 2).join('.')}</span>
          </Link>
          <nav className="ml-1 hidden items-center gap-0.5 whitespace-nowrap text-sm md:flex lg:ml-4 lg:gap-1">
            <div ref={megaWrap} className="relative" onPointerEnter={(e) => { if (e.pointerType === 'mouse') { hoverAt.current = Date.now(); setMega(true) } }} onPointerLeave={(e) => { if (e.pointerType === 'mouse') setMega(false) }} onKeyDown={(e) => { if (e.key === 'Escape') setMega(false) }} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setMega(false) }}>
              <button onClick={() => { if (Date.now() - hoverAt.current < 500) setMega(true); else setMega((v) => !v) }} aria-expanded={mega} aria-haspopup="true" className="nav-pill flex items-center gap-1 rounded-lg px-2 py-2 text-muted hover:text-fg cursor-pointer lg:px-3">Tools <ChevronDown className={cn('size-3.5 transition', mega && 'rotate-180')} /></button>
              <AnimatePresence>
              {mega && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} style={{ left: megaPos.left, width: megaPos.width }} className="absolute top-full pt-2">
                  <div className="relative">
                  <div ref={megaBox} onScroll={megaScroll} className="max-h-[75vh] space-y-5 overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl scrollbar-thin">
                    {catGroups(CATEGORIES).map((group, gi) => { const lay = { base: 2, md: 4 } /* four even columns in both blocks: five left about 160 px per name at 1024 to 1280 px */; return group.length > 0 && (
                    <div key={gi} className={gi ? 'border-t border-border pt-5' : undefined}>
                    {gi > 0 && <div className="mb-3 px-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted">More categories</div>}
                    {/* Every name sits in its own column: a fixed icon slot keeps the text aligned, and a long name ends in an
                        ellipsis (full name on hover) on desktop, or wraps to two lines on tablets, instead of running into the next column. */}
                    <div className={cn('grid gap-x-6 gap-y-5', colsClass(lay))}>
                    {group.map((c, i) => { const n = TOOLS.filter((t) => t.category === c.id).length; return (
                      <div key={c.id} className="min-w-0">
                        <Link to={`/category/${c.id}`} title={c.name} className="cat-head mb-1.5 block px-1.5 text-xs leading-snug max-lg:whitespace-normal lg:truncate font-bold uppercase tracking-wider" style={{ ['--cat' as string]: c.color }}>{c.name}</Link>
                        <div className="space-y-0.5">
                          {TOOLS.filter((t) => t.category === c.id).slice(0, 6).map((t) => { const I = getIcon(t.icon); return (
                            <Link key={t.slug} to={`/${t.slug}`} title={t.name} className="flex min-w-0 items-start gap-2 rounded-md px-1.5 py-1 text-[13px] text-muted hover:bg-surface-2 hover:text-fg"><I className="mt-[3px] size-3.5 shrink-0" aria-hidden="true" /><span className="min-w-0 max-lg:line-clamp-2 max-lg:whitespace-normal lg:truncate">{t.name}</span></Link>) })}
                          <Link to={`/category/${c.id}`} className="block px-1.5 py-1 text-xs text-accent">All {n} {n === 1 ? 'tool' : 'tools'}</Link>
                        </div>
                      </div>) })}
                    </div>
                    </div>) })}
                  </div>
                  {!megaEnd && (
                    <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => megaBox.current?.scrollBy({ top: megaBox.current.clientHeight * 0.7, behavior: 'smooth' })}
                      className="absolute inset-x-px bottom-px flex h-14 cursor-pointer items-end justify-center rounded-b-2xl bg-gradient-to-t from-surface via-surface/80 to-transparent pb-1.5 text-xs text-muted hover:text-fg">
                      <span className="inline-flex items-center gap-1">More categories <ChevronDown className="size-3.5" /></span>
                    </button>
                  )}
                  </div>
                </motion.div>
              )}
              </AnimatePresence>
            </div>
            {/* Install and About wait for xl: below 1280 px the full row crowded the header (768 px wrapped, 1024 px overflowed); both stay in the footer */}
            {[['/tools', 'All Tools'], ['/workspace', 'Workspace'], ['/docs', 'Docs'], ['/blog', 'Blog'], ['/install', 'Install', 'xl'], ['/about', 'About', 'xl']].map(([to, l, bp]) => (
              <NavLink key={to} to={to} className={({ isActive }) => cn('nav-pill relative whitespace-nowrap rounded-lg px-2 py-2 transition-colors hover:text-fg lg:px-3', bp && 'hidden xl:block', isActive ? 'text-fg' : 'text-muted')}>
                {({ isActive }) => <>{l}{isActive && <motion.span layoutId="nav-underline" className="absolute inset-x-2 -bottom-px lg:inset-x-3 h-0.5 rounded-full bg-accent" />}</>}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button data-tour="search" onClick={() => setPalette(true)} aria-label="Search tools" className="hidden h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-border bg-surface-2/60 px-3 text-sm text-muted hover:text-fg sm:flex cursor-pointer">
              <Search className="size-4" /><span className="md:sr-only xl:not-sr-only">Search tools</span> <kbd className="ml-4 rounded border border-border px-1.5 font-mono text-[10px] md:hidden xl:inline">Ctrl K</kbd>
            </button>
            <button onClick={() => setPalette(true)} className="grid size-11 place-items-center rounded-xl text-muted hover:bg-surface-2 sm:hidden" aria-label="Search"><Search className="size-4" /></button>
            <HeaderInstall />
            <Link to="/history" className="hidden size-9 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg md:grid" aria-label="History" title="History"><HistoryIcon className="size-4" /></Link>
            <Link to="/settings" className="hidden size-9 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg md:grid" aria-label="Settings" title="Settings"><SettingsIcon className="size-4" /></Link>
            <span data-tour="theme" className="inline-flex rounded-xl"><ThemeSwitcher /></span>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="hidden size-11 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg sm:grid md:hidden xl:grid xl:size-9" aria-label="GitHub"><Github className="size-4" /></a>
            <button onClick={() => setMobile(!mobile)} className="grid size-11 place-items-center rounded-xl text-muted hover:bg-surface-2 md:hidden" aria-label={mobile ? 'Close menu' : 'Open menu'} aria-expanded={mobile} aria-controls="mobile-menu">{mobile ? <X className="size-5" /> : <Menu className="size-5" />}</button>
          </div>
        </div>
        {mobile && (
          <motion.div id="mobile-menu" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-border bg-surface px-4 py-3 md:hidden">
            <div className="grid grid-cols-2 gap-1">{[['/tools', 'All Tools'], ['/install', 'Install app'], ['/workspace', 'Workspace'], ['/docs', 'Docs'], ['/blog', 'Blog'], ['/history', 'History'], ['/settings', 'Settings'], ['/changelog', 'Changelog'], ['/about', 'About'], ['/privacy', 'Privacy']].map(([to, l]) => <Link key={to} to={to} className="flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-surface-2">{l}</Link>)}</div>
            <div className="mt-2 grid grid-cols-2 gap-1">{CATEGORIES.map((c, i) => <Link key={c.id} to={`/category/${c.id}`} className={cn(spanClass(i, CATEGORIES.length, { base: 2 }), 'flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-muted hover:bg-surface-2')}><span className="size-2 rounded-full" style={{ background: c.color }} />{c.name}</Link>)}</div>
          </motion.div>
        )}
      </header>
      <RouteWipe k={loc.pathname} />
      <main id="main" tabIndex={-1} className="flex-1 outline-none"><AnimatePresence mode="wait" initial={false}><PageTransition key={loc.pathname} k={loc.pathname}><ErrorBoundary title="This page could not load." onError={bootDone}><Suspense fallback={<RouteSkeleton />}><Outlet /><BootDone /></Suspense></ErrorBoundary></PageTransition></AnimatePresence></main>
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
    <div className="of-delay mx-auto max-w-7xl px-4 pt-12 sm:px-6" role="status" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-10 w-64" /><div className="skeleton mt-3 h-4 w-96 max-w-full" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton h-40 rounded-2xl" />)}</div>
    </div>
  )
}
