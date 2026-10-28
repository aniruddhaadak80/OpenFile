import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Search, Moon, Sun, Menu, X, ChevronDown, Heart, ShieldCheck, Settings as SettingsIcon, History as HistoryIcon } from 'lucide-react'
import { MotionConfig } from 'framer-motion'
import { Logo, Github } from './Logo'
import { CommandPalette } from './CommandPalette'
import { Toaster } from './toast'
import { CATEGORIES, TOOLS } from '@/tools/registry'
import { getIcon } from './icons'
import { useTheme, useReducedMotion } from '@/lib/store'
import { cn } from './ui'

export const REPO_URL = 'https://github.com/aniruddhaadak80/OpenFile'

export function Layout() {
  const { theme, toggle } = useTheme()
  const reduce = useReducedMotion()
  const [palette, setPalette] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [mega, setMega] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const loc = useLocation()
  useEffect(() => { setMobile(false); setMega(false); window.scrollTo({ top: 0 }) }, [loc.pathname])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p) } }
    const s = () => setScrolled(window.scrollY > 8)
    window.addEventListener('keydown', k); window.addEventListener('scroll', s)
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('scroll', s) }
  }, [])

  return (
    <MotionConfig reducedMotion={reduce ? 'always' : 'never'}>
    <div className="flex min-h-screen flex-col">
      <header className={cn('sticky top-0 z-50 transition-all', scrolled ? 'glass border-b border-border' : 'bg-transparent')}>
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight">
            <Logo size={30} /> OpenFile <span className="hidden rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent sm:inline">v1.0</span>
          </Link>
          <nav className="ml-4 hidden items-center gap-1 text-sm md:flex">
            <div className="relative" onMouseEnter={() => setMega(true)} onMouseLeave={() => setMega(false)}>
              <button className="flex items-center gap-1 rounded-lg px-3 py-2 text-muted hover:text-fg cursor-pointer">Tools <ChevronDown className="size-3.5" /></button>
              {mega && (
                <div className="absolute left-0 top-full w-[860px] pt-2">
                  <div className="grid grid-cols-4 gap-4 rounded-2xl border border-border bg-surface p-5 shadow-2xl">
                    {CATEGORIES.map((c) => (
                      <div key={c.id}>
                        <Link to={`/category/${c.id}`} className="mb-2 block text-xs font-bold uppercase tracking-wider" style={{ color: c.color }}>{c.name}</Link>
                        <div className="space-y-0.5">
                          {TOOLS.filter((t) => t.category === c.id).slice(0, 6).map((t) => { const I = getIcon(t.icon); return (
                            <Link key={t.slug} to={`/${t.slug}`} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[13px] text-muted hover:bg-surface-2 hover:text-fg"><I className="size-3.5" />{t.name}</Link>) })}
                          <Link to={`/category/${c.id}`} className="block px-1.5 py-1 text-xs text-accent">All {TOOLS.filter((t) => t.category === c.id).length} →</Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {[['/tools', 'All Tools'], ['/workspace', 'Workspace'], ['/docs', 'Docs'], ['/about', 'About']].map(([to, l]) => (
              <NavLink key={to} to={to} className={({ isActive }) => cn('rounded-lg px-3 py-2 hover:text-fg', isActive ? 'text-fg' : 'text-muted')}>{l}</NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setPalette(true)} className="hidden h-9 items-center gap-2 rounded-xl border border-border bg-surface-2/60 px-3 text-sm text-muted hover:text-fg sm:flex cursor-pointer">
              <Search className="size-4" /> Search tools… <kbd className="ml-4 rounded border border-border px-1.5 font-mono text-[10px]">Ctrl K</kbd>
            </button>
            <button onClick={() => setPalette(true)} className="grid size-9 place-items-center rounded-xl text-muted hover:bg-surface-2 sm:hidden" aria-label="Search"><Search className="size-4" /></button>
            <Link to="/history" className="hidden size-9 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg md:grid" aria-label="History" title="History"><HistoryIcon className="size-4" /></Link>
            <Link to="/settings" className="hidden size-9 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg md:grid" aria-label="Settings" title="Settings"><SettingsIcon className="size-4" /></Link>
            <button onClick={toggle} className="grid size-9 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg cursor-pointer" aria-label="Toggle theme">{theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}</button>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="grid size-9 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg" aria-label="GitHub"><Github className="size-4" /></a>
            <button onClick={() => setMobile(!mobile)} className="grid size-9 place-items-center rounded-xl text-muted hover:bg-surface-2 md:hidden" aria-label="Menu">{mobile ? <X className="size-5" /> : <Menu className="size-5" />}</button>
          </div>
        </div>
        {mobile && (
          <div className="border-t border-border bg-surface px-4 py-3 md:hidden">
            <div className="grid grid-cols-2 gap-1">{[['/tools', 'All Tools'], ['/workspace', 'Workspace'], ['/docs', 'Docs'], ['/history', 'History'], ['/settings', 'Settings'], ['/changelog', 'Changelog'], ['/about', 'About'], ['/privacy', 'Privacy']].map(([to, l]) => <Link key={to} to={to} className="block rounded-lg px-3 py-2.5 text-sm hover:bg-surface-2">{l}</Link>)}</div>
            <div className="mt-2 grid grid-cols-2 gap-1">{CATEGORIES.map((c) => <Link key={c.id} to={`/category/${c.id}`} className="rounded-lg px-3 py-2 text-sm text-muted">{c.name}</Link>)}</div>
          </div>
        )}
      </header>
      <main className="flex-1"><Outlet /></main>
      <Footer />
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <Toaster />
    </div>
    </MotionConfig>
  )
}

function Footer() {
  return (
    <footer className="mt-24 border-t border-border bg-surface/50">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3 lg:grid-cols-[1.4fr_repeat(5,1fr)]">
        <div>
          <Link to="/" className="flex items-center gap-2.5 font-display text-lg font-bold"><Logo size={28} /> OpenFile</Link>
          <p className="mt-3 max-w-xs text-sm text-muted">{TOOLS.length}+ free, open-source file tools that run entirely in your browser. No uploads, no sign-up, no watermarks.</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs text-success"><ShieldCheck className="size-3.5" /> Zero-upload client sandbox</div>
        </div>
        {CATEGORIES.slice(0, 4).map((c) => (
          <div key={c.id}>
            <div className="mb-3 text-sm font-semibold">{c.name}</div>
            <ul className="space-y-2 text-sm text-muted">{TOOLS.filter((t) => t.category === c.id).slice(0, 5).map((t) => <li key={t.slug}><Link to={`/${t.slug}`} className="hover:text-fg">{t.name}</Link></li>)}</ul>
          </div>
        ))}
        <div>
          <div className="mb-3 text-sm font-semibold">Resources</div>
          <ul className="space-y-2 text-sm text-muted">
            {[['/docs', 'Documentation'], ['/docs/self-hosting', 'Self-hosting'], ['/docs/api', 'API reference'], ['/changelog', 'Changelog'], ['/history', 'History'], ['/settings', 'Settings']].map(([to, l]) => <li key={to}><Link to={to} className="hover:text-fg">{l}</Link></li>)}
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-muted sm:px-6">
          <span>© {new Date().getFullYear()} OpenFile · MIT licensed · Built by <a className="hover:text-fg" href="https://github.com/aniruddhaadak80" target="_blank" rel="noreferrer">Aniruddha Adak</a></span>
          <span className="flex flex-wrap items-center gap-4"><Link to="/docs" className="hover:text-fg">Docs</Link><Link to="/changelog" className="hover:text-fg">Changelog</Link><Link to="/about" className="hover:text-fg">About</Link><Link to="/privacy" className="hover:text-fg">Privacy</Link><Link to="/status" className="hover:text-fg">Status</Link><a href={REPO_URL} className="flex items-center gap-1 hover:text-fg"><Heart className="size-3" /> Star on GitHub</a></span>
        </div>
      </div>
    </footer>
  )
}
