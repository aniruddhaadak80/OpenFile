// App-level status for the installable web app: the "New version ready, reload" bar, a one-time
// "Ready to work offline" note, the header Install button and the small offline-ready badge.
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { RefreshCw, X, Download, CloudOff, Check } from 'lucide-react'
import { applyUpdate, usePwa } from '@/lib/app/pwa'
import { useInstall, flag, setFlag } from '@/lib/ux'
import { detect } from '@/lib/app/platform'
import { toast } from '../toast'
import { cn } from '../ui'
import { UpdateCenter } from './UpdateCenter'
import { setState as setUpdateState } from '@/lib/app/updateCore'

export function UpdateBar() {
  const { waiting, ready } = usePwa()
  const [hide, setHide] = useState(false)
  const first = useRef(true)
  useEffect(() => {
    if (!ready || flag('offline-ready')) return
    if (first.current) { first.current = false; setFlag('offline-ready'); toast('Ready to work offline. Tools you open are saved on this device.', 'success') }
  }, [ready])
  return (
    <>
    <UpdateCenter />
    <AnimatePresence>
      {waiting && !hide && (
        <motion.div role="status" aria-live="polite" initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24 }} transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-1/2 z-[101] flex w-[min(28rem,calc(100vw-1.5rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-accent/50 bg-surface/95 p-3 shadow-2xl backdrop-blur">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-brand"><RefreshCw className="size-4" /></span>
          <span className="min-w-0 flex-1 text-sm"><span className="block font-semibold">New version ready, reload</span><span className="block text-xs text-muted">Takes a second. Your settings stay. <button onClick={() => setUpdateState({ sheet: 'whatsnew' })} className="text-accent underline-offset-2 hover:underline cursor-pointer">What's new</button></span></span>
          <button onClick={applyUpdate} className="min-h-10 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent cursor-pointer">Reload</button>
          <button onClick={() => setHide(true)} aria-label="Later" className="grid size-10 shrink-0 place-items-center rounded-xl text-muted hover:text-fg cursor-pointer"><X className="size-4" /></button>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  )
}

/** Header button: one click install where the browser allows it, otherwise the Install page with steps. */
export function HeaderInstall({ className }: { className?: string }) {
  const { canPrompt, installed, prompt } = useInstall()
  const nav = useNavigate()
  const d = detect()
  if (installed || d.standalone || d.native) return null
  const click = async () => {
    if (canPrompt) {
      const r = await prompt()
      if (r === 'accepted') { toast('Installed. Find OpenFile with your apps.'); return }
      if (r === 'dismissed') return
    }
    nav('/install')
  }
  return (
    <button onClick={click} title="Install OpenFile on this device" className={cn('btn-shine group hidden h-9 items-center gap-1.5 rounded-xl border border-accent/50 bg-accent/10 px-3 text-sm font-semibold text-accent transition hover:-translate-y-0.5 hover:bg-accent/20 lg:inline-flex cursor-pointer', className)}>
      <Download className="size-4 transition group-hover:translate-y-0.5" /> Install
    </button>
  )
}

/** Tiny pill: shows whether this device can open OpenFile without a connection. */
export function OfflineReadyBadge({ className }: { className?: string }) {
  const { ready, supported } = usePwa()
  const d = detect()
  const ok = ready || !!d.native
  if (!supported && !d.native) return null
  return (
    <Link to="/install#offline" className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 hover:border-accent hover:text-fg', className)} title={ok ? 'The app shell is saved on this device' : 'Saving the app for offline use'}>
      {ok ? <Check className="size-3.5 text-success" /> : <CloudOff className="size-3.5 text-warn" />}{ok ? 'Offline ready' : 'Getting offline ready'}
    </Link>
  )
}
