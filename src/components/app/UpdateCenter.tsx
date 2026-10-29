// Floating update card (gold), the release notes sheet shown before installing, and the What's new sheet.
// Mounted once from UpdateBar (AppStatus.tsx), so every page has it.
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDownToLine, BellOff, CalendarClock, Clock, ExternalLink, Globe, Sparkles, X, Check, AlertTriangle, Loader2, Wifi } from 'lucide-react'
import { setState, useUpdates } from '@/lib/app/updateCore'
import { dismissWeb, installUpdate, later, loadHosted, openReleasePage, skipVersion, snooze, startUpdates, backToBundled } from '@/lib/app/updateManager'
import { loadChangelog, renderNotes, type ChangelogEntry } from '@/lib/app/updateChangelog'
import { formatBytes } from '@/lib/files'
import { cn } from '../ui'

const GOLD = 'border-amber-400/60 bg-black/95 text-amber-50 shadow-[0_18px_60px_-18px_rgba(245,165,36,0.55)]'

export function UpdateCenter() {
  const s = useUpdates()
  useEffect(() => { void startUpdates() }, [])
  // short notes ("Reminder set for tomorrow") fade on their own
  useEffect(() => {
    if (!s.message || s.sheet !== 'none' || s.card === 'updated') return
    const t = setTimeout(() => setState({ message: null }), 5000)
    return () => clearTimeout(t)
  }, [s.message, s.sheet, s.card])
  return (
    <>
      <AnimatePresence>
        {s.card === 'update' && s.offer && s.sheet === 'none' && <UpdateCard key="u" />}
        {s.card === 'web' && s.web && s.sheet === 'none' && <WebCard key="w" />}
        {s.card === 'updated' && s.sheet === 'none' && <UpdatedCard key="d" />}
        {s.message && s.card === 'none' && s.sheet === 'none' && (
          <motion.div key="m" role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            className={cn('fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-1/2 z-[102] -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm', GOLD)}>{s.message}</motion.div>
        )}
      </AnimatePresence>
      {s.hosted && <HostedPill />}
      <AnimatePresence>
        {s.sheet === 'release' && <ReleaseSheet key="r" />}
        {s.sheet === 'whatsnew' && <WhatsNewSheet key="n" />}
      </AnimatePresence>
    </>
  )
}

function Card({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <motion.div role="dialog" aria-label={label} initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24 }} transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      className={cn('fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-3 z-[102] w-[min(25rem,calc(100vw-1.5rem))] rounded-2xl border p-4 backdrop-blur sm:right-5', GOLD)}>
      {children}
    </motion.div>
  )
}

const goldBtn = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-amber-400 px-4 text-sm font-semibold text-black hover:bg-amber-300 disabled:opacity-60 cursor-pointer'
const ghostBtn = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-amber-400/30 px-3 text-sm text-amber-100 hover:border-amber-300 hover:text-white cursor-pointer'

function UpdateCard() {
  const s = useUpdates()
  const o = s.offer!
  const [menu, setMenu] = useState(false)
  const ready = s.phase === 'ready'
  const firstLine = useMemo(() => o.notes.split('\n').map((l) => l.replace(/^[#>*\-\s|]+/, '').replace(/\*\*/g, '').trim()).find((l) => l.length > 12) || '', [o.notes])
  return (
    <Card label="Update ready">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-400 text-black"><ArrowDownToLine className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Update ready: v{o.version}{o.prerelease && <span className="ml-2 rounded-md bg-teal-400/15 px-1.5 py-0.5 text-[11px] font-medium text-teal-300">Beta</span>}</div>
          <div className="text-xs text-amber-100/70">You have v{o.current}. {ready ? 'Downloaded and verified, installs when you quit.' : s.platform === 'android' ? 'Downloads the signed APK and opens the installer.' : 'Signed and verified before it installs.'}</div>
          {firstLine && <p className="mt-2 line-clamp-2 text-xs text-amber-50/80">{firstLine}</p>}
        </div>
        <button onClick={later} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-lg text-amber-100/60 hover:text-white cursor-pointer"><X className="size-4" /></button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={() => setState({ sheet: 'release' })} className={goldBtn}>Install now</button>
        <div className="relative">
          <button onClick={() => setMenu((m) => !m)} aria-expanded={menu} className={ghostBtn}><Clock className="size-4" /> Later</button>
          {menu && (
            <div className="absolute bottom-12 left-0 z-10 w-52 overflow-hidden rounded-xl border border-amber-400/30 bg-black text-sm shadow-2xl">
              <MenuItem icon={CalendarClock} onClick={() => void snooze(1)}>Remind me tomorrow</MenuItem>
              <MenuItem icon={CalendarClock} onClick={() => void snooze(7)}>Remind me next week</MenuItem>
              <MenuItem icon={BellOff} onClick={() => void skipVersion()}>Skip this version</MenuItem>
            </div>
          )}
        </div>
        <button onClick={() => setState({ sheet: 'release' })} className={ghostBtn}><Sparkles className="size-4" /> What's new</button>
      </div>
    </Card>
  )
}

function MenuItem({ icon: I, onClick, children }: { icon: typeof Clock; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-amber-50 hover:bg-amber-400/10 cursor-pointer"><I className="size-4 text-amber-300" />{children}</button>
}

function WebCard() {
  const s = useUpdates()
  const w = s.web!
  const more = w.localTools != null ? w.remoteTools - w.localTools : 0
  return (
    <Card label="New tools available">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cyan-400 text-black"><Globe className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">New tools available, load them</div>
          <div className="text-xs text-amber-100/70">{more > 0 ? `${more} more tools online (${w.remoteTools} in total). ` : `A newer build of OpenFile is online (${w.remoteTools} tools). `}Files still save to this device, and the copy inside the app stays as the offline fallback.</div>
        </div>
        <button onClick={() => void dismissWeb()} aria-label="Not now" className="grid size-8 shrink-0 place-items-center rounded-lg text-amber-100/60 hover:text-white cursor-pointer"><X className="size-4" /></button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => loadHosted()} className={goldBtn}>Load them</button>
        <button onClick={() => loadHosted(true)} className={ghostBtn}>Always use latest</button>
        <button onClick={() => void dismissWeb()} className={ghostBtn}>Not now</button>
      </div>
    </Card>
  )
}

function UpdatedCard() {
  const s = useUpdates()
  return (
    <Card label="Updated">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-400 text-black"><Check className="size-5" /></span>
        <div className="min-w-0 flex-1"><div className="font-semibold">{s.message || 'OpenFile was updated.'}</div><div className="text-xs text-amber-100/70">See what changed in this version.</div></div>
        <button onClick={() => setState({ card: 'none', message: null })} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-lg text-amber-100/60 hover:text-white cursor-pointer"><X className="size-4" /></button>
      </div>
      <div className="mt-3 flex gap-2"><button onClick={() => setState({ card: 'none', message: null, sheet: 'whatsnew' })} className={goldBtn}><Sparkles className="size-4" /> What's new</button></div>
    </Card>
  )
}

function HostedPill() {
  return (
    <div className="fixed left-3 top-[calc(env(safe-area-inset-top)+4.25rem)] z-[90] flex items-center gap-2 rounded-full border border-cyan-400/40 bg-black/90 px-3 py-1 text-[11px] text-cyan-100 backdrop-blur">
      <Globe className="size-3.5 text-cyan-300" /> Latest web version
      <button onClick={backToBundled} className="rounded-full px-1.5 text-cyan-300 underline-offset-2 hover:underline cursor-pointer">Use built-in copy</button>
    </div>
  )
}

function Sheet({ title, onClose, children, footer }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    ref.current?.focus()
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <motion.div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-amber-400/40 bg-black text-amber-50 outline-none sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-amber-400/20 px-5 py-4">
          <div className="min-w-0 font-display text-lg font-semibold">{title}</div>
          <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-lg text-amber-100/60 hover:text-white cursor-pointer"><X className="size-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>
        {footer && <div className="border-t border-amber-400/20 px-5 py-4">{footer}</div>}
      </motion.div>
    </motion.div>
  )
}

const notesCls = 'of-notes text-sm leading-relaxed text-amber-50/90 [&_a]:text-cyan-300 [&_a]:underline [&_code]:rounded [&_code]:bg-amber-400/10 [&_code]:px-1 [&_h3]:mt-4 [&_h3]:font-semibold [&_h3]:text-amber-200 [&_h4]:mt-3 [&_h4]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_li]:py-0.5 [&_p]:my-2 [&_ul]:my-2'

function ReleaseSheet() {
  const s = useUpdates()
  const o = s.offer
  const close = () => setState({ sheet: 'none', error: s.error === 'metered' ? null : s.error })
  if (!o) return null
  const busy = s.phase === 'downloading' || s.phase === 'installing'
  const pct = s.progress && s.progress.total ? Math.min(100, (s.progress.done / s.progress.total) * 100) : 0
  return (
    <Sheet title={<>OpenFile v{o.version}{o.prerelease && <span className="ml-2 rounded-md bg-teal-400/15 px-1.5 py-0.5 text-xs font-medium text-teal-300">Beta</span>}</>} onClose={busy ? () => {} : close}
      footer={
        <div className="space-y-3">
          {s.phase === 'downloading' && (
            <div aria-live="polite">
              <div className="mb-1 flex justify-between text-xs text-amber-100/70"><span>Downloading{s.progress?.total ? ` ${formatBytes(s.progress.done)} of ${formatBytes(s.progress.total)}` : ''}</span><span>{s.progress?.total ? `${Math.round(pct)}%` : ''}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-amber-400/10"><div className="h-full rounded-full bg-amber-400 transition-[width]" style={{ width: `${s.progress?.total ? pct : 8}%` }} /></div>
            </div>
          )}
          {s.phase === 'installing' && <p className="flex items-center gap-2 text-sm text-amber-100/80"><Loader2 className="size-4 animate-spin" /> {s.message || 'Installing. OpenFile restarts in a moment.'}</p>}
          {s.message && s.phase !== 'installing' && <p className="text-sm text-amber-100/80">{s.message}</p>}
          {s.error === 'metered' ? (
            <div className="rounded-xl border border-orange-400/40 bg-orange-400/10 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium text-orange-200"><Wifi className="size-4" /> You are on mobile data</p>
              <p className="mt-1 text-orange-100/80">Updates are set to download only on Wi-Fi or an unmetered connection.</p>
              <div className="mt-2 flex gap-2"><button onClick={() => void installUpdate({ allowMetered: true })} className={goldBtn}>Download anyway</button><button onClick={() => void snooze(1)} className={ghostBtn}>Remind me tomorrow</button></div>
            </div>
          ) : s.error ? (
            <p className="flex items-start gap-2 text-sm text-orange-200"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{s.error}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => void installUpdate()} className={goldBtn}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowDownToLine className="size-4" />}
              {s.platform === 'android' ? (s.phase === 'ready' ? 'Install' : 'Download update') : s.phase === 'ready' ? 'Install and restart' : 'Download and install'}
            </button>
            {!busy && <button onClick={() => void snooze(1)} className={ghostBtn}><Clock className="size-4" /> Tomorrow</button>}
            {!busy && <button onClick={() => void snooze(7)} className={ghostBtn}>Next week</button>}
            {!busy && <button onClick={() => void skipVersion()} className={ghostBtn}><BellOff className="size-4" /> Skip</button>}
            <button onClick={() => void openReleasePage()} className={cn(ghostBtn, 'ml-auto')}><ExternalLink className="size-4" /> Release page</button>
          </div>
        </div>
      }>
      <p className="text-xs text-amber-100/60">You have v{o.current}.{o.date ? ` Released ${new Date(o.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}.` : ''} {s.platform === 'desktop' ? 'The download is checked against the OpenFile signing key before it installs. Your settings and files stay.' : s.platform === 'android' ? 'The APK is checked to be OpenFile, newer and signed with the same key before the installer opens.' : ''}</p>
      {o.notes.trim() ? <div className={cn(notesCls, 'mt-3')} dangerouslySetInnerHTML={{ __html: renderNotes(o.notes) }} /> : <p className="mt-3 text-sm text-amber-100/70">No release notes for this version. The release page has the full list of changes.</p>}
    </Sheet>
  )
}

function WhatsNewSheet() {
  const [entries, setEntries] = useState<ChangelogEntry[] | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => { loadChangelog(4).then(setEntries).catch(() => setErr(true)) }, [])
  return (
    <Sheet title={<span className="flex items-center gap-2"><Sparkles className="size-5 text-amber-300" /> What's new</span>} onClose={() => setState({ sheet: 'none' })}>
      {err && <p className="text-sm text-orange-200">The changelog could not be loaded.</p>}
      {!entries && !err && <p className="flex items-center gap-2 text-sm text-amber-100/70"><Loader2 className="size-4 animate-spin" /> Loading</p>}
      {entries?.map((e) => (
        <section key={e.title} className="border-b border-amber-400/15 pb-4 pt-2 last:border-0">
          <h3 className="font-display text-base font-semibold text-amber-200">{e.title}</h3>
          <div className={notesCls} dangerouslySetInnerHTML={{ __html: renderNotes(e.body) }} />
        </section>
      ))}
      {entries && <a href="https://github.com/aniruddhaadak80/OpenFile/blob/main/CHANGELOG.md" target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm text-cyan-300 hover:underline"><ExternalLink className="size-3.5" /> Full changelog</a>}
    </Sheet>
  )
}
