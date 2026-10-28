import { Link } from 'react-router-dom'
import { ShieldCheck, Keyboard, Download, Star, ArrowUpRight, Rss } from 'lucide-react'
import { CATEGORIES, TOOLS, type ToolMeta } from '@/tools/registry'
import { overlayBus, useInstall } from '@/lib/ux'
import { MadeByCard } from './Author'
import { OnlineDot } from './Overlays'
import { Logo, Github } from './Logo'
import { OfflineReadyBadge } from './app/AppStatus'

const REPO = 'https://github.com/aniruddhaadak80/OpenFile'
const BASE = import.meta.env.BASE_URL

type FLink = { to: string; label: string; external?: boolean }

/** Popular first, then registry order, so every column leads with the tools people use most. */
function pick(cats: string[], n: number): FLink[] {
  return TOOLS.filter((t) => cats.includes(t.category))
    .map((t, i) => ({ t, i }))
    .sort((a, b) => Number(!!b.t.popular) - Number(!!a.t.popular) || a.i - b.i)
    .slice(0, n)
    .map(({ t }: { t: ToolMeta }) => ({ to: `/${t.slug}`, label: t.name }))
}

const count = (id: string) => TOOLS.filter((t) => t.category === id).length

function Column({ title, links, more }: { title: string; links: FLink[]; more?: FLink }) {
  if (!links.length) return null
  return (
    <div className="min-w-0">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-fg">{title}</h3>
      <ul className="space-y-2 text-sm text-muted">
        {links.map((l) => (
          <li key={l.to + l.label} className="leading-snug">
            {l.external
              ? <a href={l.to} target={l.to.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="link-underline hover:text-fg">{l.label}</a>
              : <Link to={l.to} className="link-underline hover:text-fg">{l.label}</Link>}
          </li>
        ))}
        {more && <li><Link to={more.to} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">{more.label}<ArrowUpRight className="size-3" /></Link></li>}
      </ul>
    </div>
  )
}

export function Footer() {
  const popular: FLink[] = TOOLS.filter((t) => t.popular).slice(0, 8).map((t) => ({ to: `/${t.slug}`, label: t.name }))
  const videoAudio = [...pick(['video'], 3), ...pick(['audio'], 3)]
  const resources: FLink[] = [
    { to: '/install', label: 'Install the app' },
    { to: '/open', label: 'Open a file' },
    { to: '/docs', label: 'Docs' },
    { to: '/blog', label: 'Blog' },
    { to: '/changelog', label: 'Changelog' },
    { to: '/status', label: 'Status' },
    { to: '/about', label: 'About' },
    { to: '/privacy', label: 'Privacy' },
    { to: '/settings', label: 'Settings' },
    { to: `${BASE}sitemap.xml`, label: 'Sitemap', external: true },
    { to: `${BASE}blog/rss.xml`, label: 'RSS feed', external: true },
    { to: `${BASE}llms.txt`, label: 'llms.txt', external: true },
    { to: REPO, label: 'GitHub', external: true },
    { to: `${REPO}/issues/new`, label: 'Report an issue', external: true },
    { to: `${REPO}/blob/main/LICENSE`, label: 'MIT licence', external: true },
  ]
  const year = new Date().getFullYear()

  return (
    <footer className="mt-24 border-t border-border bg-surface/50">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        {/* stat strip + call to action */}
        <div className="mb-12 flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span><strong className="font-display text-lg text-fg">{TOOLS.length}</strong> <span className="text-muted">tools</span></span>
            <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
            <span><strong className="font-display text-lg text-fg">{CATEGORIES.length}</strong> <span className="text-muted">categories</span></span>
            <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
            <span className="inline-flex items-center gap-1.5 text-success"><ShieldCheck className="size-4" /><strong className="font-display text-lg">100%</strong> <span className="text-muted">in your browser</span></span>
          </div>
          <a href={REPO} target="_blank" rel="noreferrer" className="btn-shine inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-gradient-brand px-5 text-sm font-semibold sm:self-auto">
            <Star className="size-4" /> Star on GitHub
          </a>
        </div>

        <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-[minmax(270px,1.2fr)_repeat(3,minmax(0,1fr))] xl:grid-cols-[290px_repeat(6,minmax(0,1fr))]">
          {/* brand + author */}
          <div className="sm:col-span-2 md:col-span-3 lg:col-span-1 lg:row-span-2 xl:row-span-1">
            <Link to="/" className="inline-flex items-center gap-2.5 font-display text-lg font-bold"><Logo size={28} /> OpenFile</Link>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted"><span className="whitespace-nowrap">{TOOLS.length}+</span>{'\u00a0'}free, open-source file tools that run entirely in your browser. No uploads, no sign-up, no watermarks.</p>
            <MadeByCard className="mt-5 max-w-sm" />
          </div>
          <Column title="Popular tools" links={popular} more={{ to: '/tools', label: `All ${TOOLS.length} tools` }} />
          <Column title="PDF" links={pick(['pdf'], 7)} more={{ to: '/category/pdf', label: 'All PDF tools' }} />
          <Column title="Image" links={pick(['image'], 7)} more={{ to: '/category/image', label: 'All image tools' }} />
          <Column title="Video and Audio" links={videoAudio} more={{ to: '/category/video', label: 'All video tools' }} />
          <Column title="Convert" links={pick(['convert'], 7)} more={{ to: '/category/convert', label: 'All converters' }} />
          <Column title="Developer" links={pick(['dev'], 7)} more={{ to: '/category/dev', label: 'All developer tools' }} />
        </div>

        {/* categories + resources */}
        <div className="mt-12 grid gap-x-8 gap-y-10 border-t border-border pt-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-fg">Categories</h3>
            <ul className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 md:grid-cols-4">
              {CATEGORIES.map((c) => (
                <li key={c.id} className="min-w-0">
                  <Link to={`/category/${c.id}`} className="group flex min-h-10 items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 text-sm text-muted transition hover:border-accent/60 hover:text-fg">
                    <span className="flex min-w-0 items-center gap-2"><span className="size-2 shrink-0 rounded-full" style={{ background: c.color }} /><span className="truncate">{c.name}</span></span>
                    <span className="shrink-0 font-mono text-[11px] text-muted/80">{count(c.id)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-fg">Resources</h3>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-muted">
              {resources.map((l) => (
                <li key={l.label} className="leading-snug">
                  {l.external
                    ? <a href={l.to} target={l.to.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="link-underline hover:text-fg">{l.label}</a>
                    : <Link to={l.to} className="link-underline hover:text-fg">{l.label}</Link>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* bottom bar */}
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 text-xs text-muted sm:px-6 md:flex-row md:items-center md:justify-between">
          <span>© {year} OpenFile. MIT licensed. Built by <a className="text-fg/80 hover:text-accent" href="https://github.com/aniruddhaadak80" target="_blank" rel="noreferrer">Aniruddha Adak</a>.</span>
          <FooterApp />
        </div>
      </div>
    </footer>
  )
}

function FooterApp() {
  const { canPrompt, installed, prompt } = useInstall()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={() => overlayBus.emit('shortcuts')} className="flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 hover:border-accent hover:text-fg cursor-pointer"><Keyboard className="size-3.5" /> Shortcuts <kbd className="rounded border border-border px-1 text-[10px]">?</kbd></button>
      {canPrompt && !installed && <button onClick={async () => { const r = await prompt(); if (r === 'unavailable') location.assign(`${BASE}install`) }} className="flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 hover:border-accent hover:text-fg cursor-pointer"><Download className="size-3.5" /> Install app</button>}
      {!canPrompt && !installed && <Link to="/install" className="flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 hover:border-accent hover:text-fg"><Download className="size-3.5" /> Get the app</Link>}
      <OfflineReadyBadge />
      <span className="flex min-h-9 items-center rounded-lg border border-border px-2.5"><OnlineDot /></span>
      <span className="hidden min-h-9 items-center px-1 lg:flex">Theme: Black, Dark, Sun or System, set from the header</span>
      <a href={`${BASE}blog/rss.xml`} className="flex min-h-9 items-center gap-1 px-1 hover:text-fg"><Rss className="size-3" /> RSS</a>
      <a href={REPO} target="_blank" rel="noreferrer" className="flex min-h-9 items-center gap-1 px-1 hover:text-fg"><Github className="size-3.5" /> GitHub</a>
    </div>
  )
}
