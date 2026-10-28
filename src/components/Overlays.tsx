// App-wide overlays: keyboard shortcuts (?), onboarding tour, offline indicator and install prompt.
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Keyboard, X, WifiOff, Wifi, Download, Share, ArrowRight, ArrowLeft, Compass } from 'lucide-react'
import { flag, setFlag, isTyping, overlayBus, useInstall, useOnline } from '@/lib/ux'
import { useRecent } from '@/lib/store'
import { toast } from './toast'
import { Button, cn } from './ui'

/* ---------------- shortcuts ---------------- */
export const SHORTCUTS: { group: string; items: [string[], string][] }[] = [
  { group: 'Anywhere', items: [[['Ctrl', 'K'], 'Search tools, pages and docs'], [['/'], 'Search'], [['?'], 'Show this list'], [['Esc'], 'Close a dialog']] },
  { group: 'Go to', items: [[['G', 'H'], 'Home'], [['G', 'T'], 'All tools'], [['G', 'W'], 'Workspace'], [['G', 'D'], 'Docs'], [['G', 'B'], 'Blog'], [['G', 'Y'], 'History'], [['G', 'S'], 'Settings'], [['G', 'I'], 'Install the app']] },
  { group: 'Tools', items: [[['Alt', '1 to 9'], 'Open a recently used tool'], [['F'], 'Save or unsave the open tool'], [['Drop'], 'Drop a file on any page to find a tool']] },
]
const GO: Record<string, string> = { h: '/', t: '/tools', w: '/workspace', d: '/docs', b: '/blog', y: '/history', s: '/settings', i: '/install' }

/** Global single-key shortcuts. Ignored while typing. */
export function useGlobalShortcuts(openPalette: () => void) {
  const nav = useNavigate()
  const [help, setHelp] = useState(false)
  useEffect(() => overlayBus.on((o) => { if (o === 'shortcuts') setHelp(true); if (o === 'palette') openPalette() }), [openPalette])
  useEffect(() => {
    let g = 0
    const k = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
      // some tools have their own single-key shortcuts (the Sketch board uses ? and letters): leave them alone
      const path = location.pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ''), '')
      if (/^\/(sketch-board|whiteboard)/.test(path)) return
      if (e.key === '/' && path.startsWith('/docs')) return
      if (e.key === '?') { e.preventDefault(); setHelp((v) => !v); return }
      if (e.key === '/') { e.preventDefault(); openPalette(); return }
      const key = e.key.toLowerCase()
      if (key === 'g') { g = Date.now(); return }
      if (g && Date.now() - g < 1200 && GO[key]) { e.preventDefault(); g = 0; nav(GO[key]); return }
      g = 0
      if (key === 'f') window.dispatchEvent(new CustomEvent('of:toggle-fav'))
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [openPalette])
  return { help, setHelp }
}

export function ShortcutsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    setTimeout(() => ref.current?.focus(), 30)
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [open])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[96] grid place-items-center bg-black/55 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div role="dialog" aria-modal="true" aria-labelledby="kbd-title" initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-border bg-surface p-6 shadow-2xl scrollbar-thin">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-gradient-brand"><Keyboard className="size-5" /></div>
              <h2 id="kbd-title" className="flex-1 font-display text-xl font-bold">Keyboard shortcuts</h2>
              <button ref={ref} onClick={onClose} className="grid size-11 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg cursor-pointer" aria-label="Close"><X className="size-5" /></button>
            </div>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              {SHORTCUTS.map((g) => (
                <section key={g.group} className={g.group === 'Go to' ? 'sm:row-span-2' : undefined}>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-accent">{g.group}</h3>
                  <ul className="divide-y divide-border rounded-2xl border border-border">
                    {g.items.map(([keys, label]) => (
                      <li key={label} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                        <span className="text-muted">{label}</span>
                        <span className="flex shrink-0 gap-1">{keys.map((x, i) => <kbd key={i} className="min-w-7 rounded-md border border-b-2 border-border bg-surface-2 px-1.5 py-0.5 text-center text-[11px]">{x}</kbd>)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <p className="mt-5 text-xs text-muted">On a Mac use Cmd instead of Ctrl. Press G, then a letter, within a second to jump.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------------- onboarding tour ---------------- */
const STEPS: { sel?: string; title: string; body: string }[] = [
  { title: 'Welcome to OpenFile', body: 'Every tool runs in this tab. Your files are never uploaded. Here is a 20 second tour.' },
  { sel: '[data-tour="search"]', title: 'Search everything', body: 'Press Ctrl K or / to find any tool, page or guide.' },
  { sel: '[data-tour="drop"]', title: 'Drop anything, anywhere', body: 'Drag a file onto any page. OpenFile reads its type and suggests the right tools.' },
  { sel: '[data-tour="explorer"]', title: 'Browse by category', body: 'Pick a category to see its tools, popular formats and a ready pipeline.' },
  { sel: '[data-tour="theme"]', title: 'Make it yours', body: 'Black, Dark or Sun themes, accent colors, density and fonts.' },
  { title: 'One more thing', body: 'Press ? at any time to see keyboard shortcuts. Enjoy.' },
]
export function OnboardingTour() {
  const loc = useLocation()
  const [step, setStep] = useState(-1)
  useEffect(() => overlayBus.on((o) => { if (o === 'tour') { setFlag('tour-done', false); setStep(0) } }), [])
  useEffect(() => {
    if (loc.pathname !== '/' || flag('tour-done')) return
    const t = setTimeout(() => setStep((s) => (s < 0 ? 0 : s)), 2200)
    return () => clearTimeout(t)
  }, [loc.pathname])
  const s = step >= 0 ? STEPS[step] : null
  useEffect(() => {
    if (!s?.sel) return
    const el = document.querySelector<HTMLElement>(s.sel)
    if (!el) return
    el.classList.add('tour-target')
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return () => el.classList.remove('tour-target')
  }, [step])
  useEffect(() => {
    if (step < 0) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') done(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') setStep((x) => Math.max(0, x - 1)) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [step])
  const done = () => { setFlag('tour-done'); setStep(-1) }
  const next = () => setStep((x) => { if (x >= STEPS.length - 1) { setFlag('tour-done'); return -1 } return x + 1 })
  return (
    <AnimatePresence>
      {s && (
        <motion.div key="tour" role="dialog" aria-label="Quick tour" aria-live="polite" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-4 left-3 right-3 z-[97] mx-auto max-w-sm rounded-3xl border border-accent/40 bg-surface p-5 shadow-glow sm:left-6 sm:right-auto sm:mx-0">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-accent"><Compass className="size-4" /> Tour {step + 1} of {STEPS.length}</div>
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.18 }}>
              <h2 className="mt-2 font-display text-lg font-bold">{s.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
            </motion.div>
          </AnimatePresence>
          <div className="mt-4 flex items-center gap-1" aria-hidden="true">{STEPS.map((_, i) => <span key={i} className={cn('h-1.5 rounded-full transition-all', i === step ? 'w-6 bg-accent' : 'w-1.5 bg-border')} />)}</div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <button onClick={done} className="min-h-10 px-1 text-sm text-muted hover:text-fg cursor-pointer">Skip tour</button>
            <div className="flex gap-2">
              {step > 0 && <Button variant="ghost" onClick={() => setStep(step - 1)} icon={<ArrowLeft className="size-4" />} aria-label="Previous step" />}
              <Button onClick={next} icon={step === STEPS.length - 1 ? undefined : <ArrowRight className="size-4" />}>{step === STEPS.length - 1 ? 'Start' : 'Next'}</Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------------- offline indicator ---------------- */
export function OfflineIndicator() {
  const online = useOnline()
  const first = useRef(true)
  useEffect(() => { if (first.current) { first.current = false; return } if (online) toast('Back online', 'success') }, [online])
  return (
    <AnimatePresence>
      {!online && (
        <motion.div role="status" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="fixed left-1/2 top-[4.5rem] z-[65] flex -translate-x-1/2 items-center gap-2 rounded-full border border-warn/40 bg-surface/95 px-4 py-2 text-xs shadow-xl backdrop-blur">
          <WifiOff className="size-3.5 text-warn" /> You are offline. Tools you opened before still work.
        </motion.div>
      )}
    </AnimatePresence>
  )
}
export function OnlineDot() {
  const online = useOnline()
  return <span title={online ? 'Online' : 'Offline'} className="flex items-center gap-1.5">{online ? <Wifi className="size-3.5 text-success" /> : <WifiOff className="size-3.5 text-warn" />}{online ? 'Online' : 'Offline'}</span>
}

/* ---------------- install prompt ---------------- */
const DISMISS_KEY = 'of:install-dismissed'
export function InstallPrompt() {
  const { canPrompt, installed, prompt, iosHint } = useInstall()
  const { recent } = useRecent()
  const [hidden, setHidden] = useState(() => { try { const t = Number(localStorage.getItem(DISMISS_KEY) || 0); return Date.now() - t < 30 * 864e5 } catch { return false } })
  const eligible = !installed && !hidden && (canPrompt || iosHint) && (recent.length >= 1 || flag('tour-done'))
  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* ignore */ } setHidden(true) }
  return (
    <AnimatePresence>
      {eligible && (
        <motion.div role="dialog" aria-label="Install OpenFile" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }} className="fixed bottom-4 left-3 right-3 z-[66] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-surface/95 p-3 shadow-2xl backdrop-blur sm:left-6 sm:right-auto sm:mx-0">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-brand">{iosHint ? <Share className="size-5" /> : <Download className="size-5" />}</div>
          <div className="min-w-0 flex-1 text-sm"><div className="font-semibold">Install OpenFile</div><div className="text-xs text-muted">{iosHint ? 'Tap Share, then Add to Home Screen.' : 'Open it like an app, offline too.'}</div></div>
          {!iosHint && <Button size="sm" onClick={async () => { const r = await prompt(); if (r === 'accepted') toast('Installed. Find OpenFile with your apps.'); dismiss() }}>Install</Button>}
          <button onClick={dismiss} className="grid size-10 shrink-0 place-items-center rounded-xl text-muted hover:text-fg cursor-pointer" aria-label="Not now"><X className="size-4" /></button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
