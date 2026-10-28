// Install page: detects the visitor's device, highlights the best way to get OpenFile, then offers every
// other option, an interactive step-by-step guide, the apps video and a FAQ.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Download, Globe, Monitor, Apple, Smartphone, Laptop, Terminal, AppWindow, ShieldCheck, WifiOff, Zap, ChevronDown, ExternalLink, Sparkles, Check, Package, Play, RefreshCw } from 'lucide-react'
import { Aurora, Reveal, Stagger, StaggerItem, spotlightMove } from '@/components/motion'
import { Logo, Github as GhIcon } from '@/components/Logo'
import { CopyButton, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { setPageMeta, setJsonLd } from '@/lib/seo'
import { useInstall } from '@/lib/ux'
import { usePwa, checkForUpdate, applyUpdate } from '@/lib/app/pwa'
import { ASSETS, BROWSER_LABEL, PLATFORM_LABEL, RELEASES, REPO, detect, dl, manualSteps, pwaSupport, type PlatformId } from '@/lib/app/platform'
import { TOOLS } from '@/tools/registry'
import { FAQ, type GuideId } from './install/data'
import { InstallGuide } from './install/Guide'

const BASE = import.meta.env.BASE_URL

interface Rel { tag: string; date: string; assets: Record<string, { size: number; url: string; count: number }> }
/** Latest GitHub release (public API, no token). Missing assets fall back to the releases page. */
function useLatestRelease() {
  const [rel, setRel] = useState<Rel | null>(null)
  useEffect(() => {
    let off = false
    fetch('https://api.github.com/repos/aniruddhaadak80/OpenFile/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (off || !j?.tag_name) return
        const assets: Rel['assets'] = {}
        for (const a of j.assets || []) assets[a.name] = { size: a.size, url: a.browser_download_url, count: a.download_count }
        setRel({ tag: j.tag_name, date: (j.published_at || '').slice(0, 10), assets })
      }).catch(() => {})
    return () => { off = true }
  }, [])
  return rel
}
const mb = (n?: number) => (n ? `${(n / 1048576).toFixed(n > 104857600 ? 0 : 1)} MB` : '')

type Opt = { label: string; href?: string; asset?: string; onClick?: () => void; primary?: boolean }
interface CardDef { id: PlatformId | 'browser'; guide: GuideId; title: string; tagline: string; icon: typeof Monitor; color: string; formats: string; opts: Opt[]; note?: string }

export default function Install() {
  const d = useMemo(detect, [])
  const rel = useLatestRelease()
  const { canPrompt, installed, prompt } = useInstall()
  const pwa = usePwa()
  const support = pwaSupport(d)
  const [showSteps, setShowSteps] = useState(false)
  useEffect(() => {
    setPageMeta('Install OpenFile | Web, Windows, macOS, Linux, Android and iPhone', 'Install OpenFile as an app on any device. Web app that works offline, desktop apps for Windows, macOS and Linux, Android APK, and iPhone home screen. Free, private, open source.')
    setJsonLd('install', { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'OpenFile', applicationCategory: 'UtilitiesApplication', operatingSystem: 'Windows, macOS, Linux, Android, iOS, ChromeOS, Web', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, downloadUrl: RELEASES, author: { '@type': 'Person', name: 'Aniruddha Adak' } })
    return () => setJsonLd('install', null)
  }, [])
  useEffect(() => { if (location.hash && location.hash !== '#guide') setTimeout(() => document.getElementById(location.hash.slice(1).replace(/^guide-.*/, 'guide'))?.scrollIntoView({ behavior: 'smooth' }), 200) }, [])

  const installWeb = async () => {
    if (installed || d.standalone) { toast('OpenFile is already installed on this device.', 'info'); return }
    if (canPrompt) {
      const r = await prompt()
      if (r === 'accepted') { toast('Installed. Find OpenFile with your apps.'); return }
      if (r === 'dismissed') return
    }
    setShowSteps(true)
    setTimeout(() => document.getElementById('web-steps')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
  }
  const href = (asset: string) => rel?.assets[asset]?.url ?? (rel ? RELEASES : dl(asset))

  const cards: CardDef[] = [
    { id: 'web', guide: 'web', title: 'Web app', tagline: 'Install from your browser. Tiny, offline, always up to date.', icon: Globe, color: '#F5A524', formats: 'Chrome, Edge, Safari, Samsung Internet, Opera, Brave', opts: [{ label: installed || d.standalone ? 'Installed' : canPrompt ? 'Install now' : 'Install web app', onClick: installWeb, primary: true }] },
    { id: 'windows', guide: 'windows', title: 'Windows', tagline: 'A classic installer for Windows 10 and 11, 64-bit.', icon: Monitor, color: '#38BDF8', formats: '.exe setup, .msi', opts: [{ label: 'Download .exe', asset: ASSETS.winExe, primary: true }, { label: '.msi', asset: ASSETS.winMsi }] },
    { id: 'macos', guide: 'macos', title: 'macOS', tagline: 'One universal app for Apple silicon and Intel Macs.', icon: Apple, color: '#E5E7EB', formats: '.dmg, universal', opts: [{ label: 'Download .dmg', asset: ASSETS.macDmg, primary: true }], note: 'First launch: right-click, Open.' },
    { id: 'linux', guide: 'linux', title: 'Linux', tagline: 'AppImage for any distro, plus .deb and .rpm packages.', icon: Terminal, color: '#F97316', formats: '.AppImage, .deb, .rpm', opts: [{ label: 'AppImage', asset: ASSETS.linuxAppImage, primary: true }, { label: '.deb', asset: ASSETS.linuxDeb }, { label: '.rpm', asset: ASSETS.linuxRpm }] },
    { id: 'android', guide: 'android', title: 'Android', tagline: 'Install the web app from Chrome, or sideload the APK.', icon: Smartphone, color: '#10B981', formats: 'Web app, .apk', opts: [{ label: 'Download APK', asset: ASSETS.androidApk, primary: true }, { label: 'Web app', onClick: installWeb }] },
    { id: 'ios', guide: 'ios', title: 'iPhone and iPad', tagline: 'Add to Home Screen from Safari. Full screen and offline.', icon: Smartphone, color: '#22D3EE', formats: 'Home Screen web app', opts: [{ label: 'Show me how', onClick: () => { location.hash = 'guide-ios'; document.getElementById('guide')?.scrollIntoView({ behavior: 'smooth' }) }, primary: true }], note: 'App Store version later.' },
    { id: 'chromeos', guide: 'chromeos', title: 'ChromeOS', tagline: 'Install the web app from Chrome and pin it to the shelf.', icon: Laptop, color: '#84CC16', formats: 'Web app, Android APK', opts: [{ label: 'Install web app', onClick: installWeb, primary: true }, { label: 'APK', asset: ASSETS.androidApk }] },
    { id: 'browser', guide: 'web', title: 'Just use it in the browser', tagline: 'No install, no extension, no account. Open a tool and go.', icon: AppWindow, color: '#14B8A6', formats: 'Any modern browser', opts: [{ label: 'Open all tools', href: `${BASE}tools`, primary: true }] },
  ]
  const best: PlatformId = d.native ? d.platform : d.platform === 'ios' ? 'ios' : d.platform === 'android' ? 'android' : d.platform === 'chromeos' ? 'chromeos' : support === 'prompt' ? 'web' : d.platform
  const bestCard = cards.find((c) => c.id === best) ?? cards[0]
  const order = [bestCard, ...cards.filter((c) => c !== bestCard)]
  const guideStart: GuideId = bestCard.guide

  return (
    <div className="relative">
      {/* ---------- hero ---------- */}
      <section className="relative overflow-hidden">
        <Aurora density={34} />
        <div className="dot-bg pointer-events-none absolute inset-0" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pb-12 pt-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-20 lg:pt-20">
          <div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent"><Download className="size-3.5" /> Install OpenFile</motion.div>
            <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">OpenFile on<br /><span className="text-gradient">every device you own.</span></motion.h1>
            <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-5 max-w-xl text-lg leading-relaxed text-muted">The same <span className="whitespace-nowrap">{TOOLS.length}+</span> tools as a real app on your computer or phone. It works offline, opens files from your system, and your files still never leave your device.</motion.p>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-6 inline-flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface/80 px-3 py-2 text-sm backdrop-blur">
              <Sparkles className="size-4 text-accent" />
              {d.native ? <span>You are using the OpenFile {d.native === 'tauri' ? 'desktop' : 'mobile'} app.</span>
                : <span>Looks like <strong>{PLATFORM_LABEL[d.platform === 'web' ? 'web' : d.platform]}</strong>{d.browser !== 'other' && <> with <strong>{BROWSER_LABEL[d.browser]}</strong></>}. Best pick: <strong className="text-accent">{bestCard.title}</strong></span>}
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-6 flex flex-wrap gap-3">
              <CardButtons card={bestCard} href={href} big />
              <a href="#all" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border px-5 font-semibold hover:border-accent">All platforms <ChevronDown className="size-4" /></a>
            </motion.div>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-4 text-success" /> No uploads</span>
              <span className="inline-flex items-center gap-1.5"><WifiOff className="size-4 text-teal" /> Works offline</span>
              <span className="inline-flex items-center gap-1.5"><Zap className="size-4 text-accent" /> Free and open source</span>
              {rel && <a href={RELEASES} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-fg"><Package className="size-4 text-sky" /> Latest {rel.tag}</a>}
            </div>
          </div>
          <DeviceStage />
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* manual web steps when the browser has no one-click prompt */}
        {(showSteps || (support === 'menu' && !installed && !d.standalone)) && (
          <Reveal>
            <div id="web-steps" className="mb-10 rounded-2xl border border-accent/40 bg-accent/5 p-5">
              <div className="font-semibold">Install the web app in {BROWSER_LABEL[d.browser]}{d.platform === 'ios' ? ' on iPhone or iPad' : ''}</div>
              <ol className="mt-3 grid gap-2 text-sm text-muted sm:grid-cols-2">{manualSteps(d).map((s, i) => <li key={i} className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent/20 font-mono text-xs text-accent">{i + 1}</span>{s}</li>)}</ol>
            </div>
          </Reveal>
        )}

        {/* ---------- all platforms ---------- */}
        <section id="all" className="scroll-mt-24">
          <Reveal><h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Pick your platform</h2><p className="mt-2 text-muted">Every option runs the same tools on your device. Choose what fits how you work.</p></Reveal>
          <Stagger className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {order.map((c) => (
              <StaggerItem key={c.id} className="h-full">
                <motion.div whileHover={{ y: -6 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }} onPointerMove={spotlightMove}
                  className={cn('spotlight relative flex h-full flex-col rounded-2xl border bg-surface p-5', c === bestCard ? 'border-accent shadow-glow' : 'border-border')}>
                  {c === bestCard && <span className="absolute -top-3 left-5 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold text-on-accent">Best for this device</span>}
                  <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${c.color} 16%, transparent)` }}><c.icon className="size-5" style={{ color: c.color }} /></span><div className="font-display text-lg font-bold">{c.title}</div></div>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{c.tagline}</p>
                  <div className="mt-3 text-xs text-muted/90">{c.formats}{c.opts[0]?.asset && rel?.assets[c.opts[0].asset] ? <> · {mb(rel.assets[c.opts[0].asset].size)}</> : null}</div>
                  {c.note && <div className="mt-1 text-xs text-accent/90">{c.note}</div>}
                  <div className="mt-4 flex flex-wrap gap-2"><CardButtons card={c} href={href} /></div>
                  <a href={`#guide-${c.guide}`} onClick={() => setTimeout(() => document.getElementById('guide')?.scrollIntoView({ behavior: 'smooth' }), 0)} className="mt-3 text-xs font-medium text-muted hover:text-accent">Step by step guide</a>
                </motion.div>
              </StaggerItem>
            ))}
          </Stagger>
          <p className="mt-4 text-sm text-muted">All downloads come from the <a className="text-accent hover:underline" href={RELEASES} target="_blank" rel="noreferrer">latest GitHub release</a>, built in public by GitHub Actions from the open source code.</p>
        </section>

        {/* ---------- video ---------- */}
        <section className="mt-20">
          <Reveal>
            <div className="on-dark relative overflow-hidden rounded-[2rem] border border-border bg-black">
              <div className="grid items-center gap-6 p-5 sm:p-8 lg:grid-cols-[1fr_1.6fr]">
                <div className="text-white">
                  <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-accent"><Play className="size-3.5" /> 40 second tour</div>
                  <h2 className="mt-3 font-display text-3xl font-bold">One app. Every screen.</h2>
                  <p className="mt-3 text-white/70">See OpenFile installed on the web, Windows, macOS, Linux, Android and iPhone, and how the install takes a few clicks.</p>
                  <a href={`${BASE}media/apps-vertical.mp4`} className="mt-4 inline-flex text-sm text-accent hover:underline">Vertical version for phones</a>
                </div>
                <video className="aspect-video w-full rounded-2xl border border-white/10 bg-black" src={`${BASE}media/apps.mp4`} poster={`${BASE}media/apps-poster.webp`} controls playsInline preload="none" muted loop aria-label="OpenFile apps on every device, video" />
              </div>
            </div>
          </Reveal>
        </section>

        {/* ---------- guide ---------- */}
        <section className="mt-20">
          <Reveal><h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Installation guide</h2><p className="mt-2 max-w-2xl text-muted">Choose your platform, then follow along. Open a step to see where to click, tick it off when it is done. Update and uninstall steps are one tab away.</p></Reveal>
          <div className="mt-8"><InstallGuide initial={guideStart} /></div>
        </section>

        {/* ---------- offline status ---------- */}
        <section id="offline" className="mt-20 scroll-mt-24">
          <Reveal>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-border bg-surface p-5 md:col-span-2">
                <div className="flex items-center gap-2 font-semibold"><WifiOff className="size-4 text-teal" /> Offline on this device</div>
                <p className="mt-2 text-sm text-muted">{d.native ? 'The app ships every file it needs, so it works offline from the first launch. Large AI models download once, the first time you use them.' : pwa.ready ? 'The app shell is saved on this device. Tools you open are saved too, so they keep working without a connection.' : pwa.supported ? 'Saving the app for offline use. Open a few tools while online and they will work offline next time.' : 'This browser cannot save the app for offline use. Try Chrome, Edge, Firefox or Safari.'}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1', pwa.ready || d.native ? 'border-success/50 text-success' : 'border-border text-muted')}>{pwa.ready || d.native ? <Check className="size-3" /> : <RefreshCw className="size-3" />}{pwa.ready || d.native ? 'Offline ready' : 'Not ready yet'}</span>
                  {pwa.build && <span className="rounded-full border border-border px-2.5 py-1 font-mono text-muted">build {pwa.build}</span>}
                  {!d.native && pwa.supported && <button onClick={async () => { const has = await checkForUpdate(); if (has) applyUpdate(); else toast('You are on the latest version.', 'info') }} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border px-2.5 hover:border-accent cursor-pointer"><RefreshCw className="size-3" /> Check for updates</button>}
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-success" /> Private by design</div>
                <p className="mt-2 text-sm text-muted">No account, no tracking of your files, nothing uploaded. Read the <Link to="/privacy" className="text-accent hover:underline">privacy page</Link>.</p>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ---------- FAQ ---------- */}
        <section className="mt-20">
          <Reveal><h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Questions</h2></Reveal>
          <div className="mt-6 grid gap-3 lg:grid-cols-2">{FAQ.map((f, i) => <Faq key={f.q} q={f.q} a={f.a} i={i} />)}</div>
        </section>

        {/* ---------- contributors ---------- */}
        <section className="mt-20">
          <Reveal>
            <div className="rounded-2xl border border-border bg-surface p-5 sm:p-7">
              <div className="flex items-center gap-2 font-semibold"><GhIcon className="size-4" /> Build the apps yourself</div>
              <p className="mt-2 text-sm text-muted">The desktop app uses Tauri and the mobile apps use Capacitor, both wrapping the same web build. Full notes live in <a className="text-accent hover:underline" href={`${REPO}/blob/main/docs/INSTALL.md`} target="_blank" rel="noreferrer">docs/INSTALL.md</a>.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {[['Desktop (needs Rust)', 'npm run app:desktop'], ['Android (needs JDK 21 and Android SDK)', 'npm run app:android'], ['iOS simulator (needs Xcode)', 'npm run app:ios']].map(([t, c]) => (
                  <div key={c} className="rounded-xl border border-border bg-black p-3"><div className="text-xs text-white/60">{t}</div><div className="mt-1 flex items-center gap-2"><code className="flex-1 font-mono text-[13px] text-[#e5e7eb]"><span className="text-emerald">$ </span>{c}</code><CopyButton text={c} /></div></div>
                ))}
              </div>
            </div>
          </Reveal>
        </section>
      </div>
    </div>
  )
}

function CardButtons({ card, href, big }: { card: CardDef; href: (a: string) => string; big?: boolean }) {
  return (
    <>
      {card.opts.map((o) => {
        const cls = cn('inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition', big ? 'min-h-12 px-5' : 'min-h-10 px-3.5 text-sm', o.primary ? 'btn-shine bg-gradient-brand text-on-accent hover:brightness-110' : 'border border-border hover:border-accent')
        const icon = o.asset ? <Download className="size-4" /> : o.href ? <ExternalLink className="size-4" /> : o.primary ? <Download className="size-4" /> : null
        if (o.asset) return <a key={o.label} href={href(o.asset)} className={cls} rel="noreferrer">{icon}{big ? `${o.label} for ${card.title}` : o.label}</a>
        if (o.href) return <a key={o.label} href={o.href} className={cls}>{icon}{o.label}</a>
        return <button key={o.label} onClick={o.onClick} className={cn(cls, 'cursor-pointer')}>{icon}{o.label}</button>
      })}
    </>
  )
}

function Faq({ q, a, i }: { q: string; a: string; i: number }) {
  const [open, setOpen] = useState(i === 0)
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: Math.min(i * 0.04, 0.3) }} className={cn('rounded-2xl border bg-surface transition-colors', open ? 'border-accent/50' : 'border-border')}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-12 w-full items-center gap-3 px-5 py-3 text-left font-semibold cursor-pointer">{q}<ChevronDown className={cn('ml-auto size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} /></button>
      <motion.div initial={false} animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }} transition={{ duration: 0.25 }} className="overflow-hidden"><p className="px-5 pb-4 text-sm leading-relaxed text-muted">{a}</p></motion.div>
    </motion.div>
  )
}

/** Laptop and phone mockups that float gently, each showing OpenFile. */
function DeviceStage() {
  const screen = (compact?: boolean) => (
    <div className="h-full w-full bg-black p-3">
      <div className="flex items-center gap-1.5"><Logo size={compact ? 12 : 16} /><span className={cn('font-bold text-white', compact ? 'text-[8px]' : 'text-[10px]')}>OpenFile</span></div>
      <div className={cn('mt-2 font-bold leading-tight text-white', compact ? 'text-[9px]' : 'text-sm')}>Every file tool.<br /><span className="text-gradient">On this device.</span></div>
      <div className={cn('mt-2 grid gap-1.5', compact ? 'grid-cols-2' : 'grid-cols-4')}>{['#F5A524', '#14B8A6', '#22D3EE', '#10B981', '#38BDF8', '#F97316', '#84CC16', '#FFD27A'].slice(0, compact ? 6 : 8).map((c, i) => (
        <motion.div key={c} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 + i * 0.07 }} className={cn('rounded-md border border-white/10 bg-white/[.04]', compact ? 'h-6' : 'h-9')}><span className="m-1 block size-2 rounded-sm" style={{ background: c }} /></motion.div>
      ))}</div>
    </div>
  )
  return (
    <div className="relative mx-auto h-[300px] w-full max-w-[540px] sm:h-[380px]" aria-hidden="true">
      <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(closest-side, color-mix(in oklab, var(--accent-glow) 28%, transparent), transparent)' }} />
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: [0, -10, 0] }} transition={{ opacity: { duration: 0.6 }, y: { duration: 6, repeat: Infinity, ease: 'easeInOut' } }} className="absolute left-0 top-6 w-[82%]">
        <div className="rounded-t-xl border border-white/15 bg-[#111] p-2 shadow-2xl"><div className="aspect-[16/10] overflow-hidden rounded-md">{screen()}</div></div>
        <div className="mx-auto h-3 w-[108%] -translate-x-[3.7%] rounded-b-xl bg-gradient-to-b from-[#2a2d33] to-[#16181c]" />
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: [0, -14, 0] }} transition={{ opacity: { duration: 0.6, delay: 0.2 }, y: { duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 0.8 } }} className="absolute bottom-0 right-2 w-[28%] min-w-[110px]">
        <div className="rounded-[1.4rem] border-[5px] border-[#1f2329] bg-black p-1 shadow-2xl"><div className="aspect-[9/19] overflow-hidden rounded-[1rem]">{screen(true)}</div></div>
      </motion.div>
      <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1, y: [0, -6, 0] }} transition={{ delay: 0.6, y: { duration: 4, repeat: Infinity, ease: 'easeInOut' } }} className="absolute right-[30%] top-0 flex items-center gap-1.5 rounded-full border border-success/40 bg-black/80 px-3 py-1.5 text-xs text-success backdrop-blur"><WifiOff className="size-3.5" /> Works offline</motion.div>
      <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1, y: [0, 6, 0] }} transition={{ delay: 0.8, y: { duration: 4.5, repeat: Infinity, ease: 'easeInOut' } }} className="absolute bottom-10 left-4 flex items-center gap-1.5 rounded-full border border-accent/40 bg-black/80 px-3 py-1.5 text-xs text-accent backdrop-blur"><ShieldCheck className="size-3.5" /> Files stay on device</motion.div>
    </div>
  )
}
