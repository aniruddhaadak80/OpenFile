import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, AlertCircle, Info, X, Undo2 } from 'lucide-react'

export interface ToastAction { label: string; onClick: () => void }
export interface ToastOptions { action?: ToastAction; /** shorthand for an Undo action */ undo?: () => void; duration?: number }
type T = { id: number; msg: string; type: 'success' | 'error' | 'info'; action?: ToastAction; duration: number }
let push: ((t: T) => void) | null = null
let id = 0
/** Show a toast. Backwards compatible: toast(msg) and toast(msg, 'error') still work. Pass { undo } for an Undo button. */
export function toast(msg: string, type: T['type'] = 'success', opts: ToastOptions = {}) {
  const action = opts.action ?? (opts.undo ? { label: 'Undo', onClick: opts.undo } : undefined)
  push?.({ id: ++id, msg, type, action, duration: opts.duration ?? (action ? 6000 : type === 'error' ? 5000 : 3200) })
}

export function Toaster() {
  const [items, setItems] = useState<T[]>([])
  useEffect(() => { push = (t) => setItems((s) => [...s.slice(-3), t]); return () => { push = null } }, [])
  const remove = (tid: number) => setItems((s) => s.filter((x) => x.id !== tid))
  // Phones: at most two compact toasts at a time so they never cover much of a 360 px screen
  const [narrow, setNarrow] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 639px)').matches)
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const m = matchMedia('(max-width: 639px)')
    const on = () => setNarrow(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  const shown = narrow ? items.slice(-2) : items
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[100] flex flex-col items-center gap-1.5 sm:gap-2 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:items-end lg:bottom-5" role="region" aria-label="Notifications">
      <AnimatePresence initial={false}>
        {shown.map((t) => <ToastItem key={t.id} t={t} onDone={() => remove(t.id)} />)}
      </AnimatePresence>
    </div>
  )
}

function ToastItem({ t, onDone }: { t: T; onDone: () => void }) {
  const [paused, setPaused] = useState(false)
  const left = useRef(t.duration)
  const started = useRef(Date.now())
  useEffect(() => {
    if (paused) return
    started.current = Date.now()
    const h = setTimeout(onDone, left.current)
    return () => { clearTimeout(h); left.current -= Date.now() - started.current }
  }, [paused])
  return (
    <motion.div layout initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      role={t.type === 'error' ? 'alert' : 'status'} aria-live={t.type === 'error' ? 'assertive' : 'polite'}
      className="glass pointer-events-auto relative flex w-auto max-w-full items-center gap-2 overflow-hidden rounded-xl border border-border py-1.5 pl-3 pr-1.5 text-xs shadow-xl sm:w-full sm:max-w-sm sm:gap-2.5 sm:px-4 sm:py-3 sm:text-sm sm:shadow-2xl">
      {t.type === 'success' ? <CheckCircle2 className="size-4 shrink-0 text-success" /> : t.type === 'error' ? <AlertCircle className="size-4 shrink-0 text-danger" /> : <Info className="size-4 shrink-0 text-accent" />}
      <span className="line-clamp-2 min-w-0 flex-1 break-words sm:line-clamp-none">{t.msg}</span>
      {t.action && <button onClick={() => { t.action!.onClick(); onDone() }} className="flex min-h-8 shrink-0 items-center gap-1 rounded-lg border sm:min-h-9 border-border px-2.5 text-xs font-semibold text-accent hover:border-accent cursor-pointer"><Undo2 className="size-3.5" />{t.action.label}</button>}
      <button onClick={onDone} className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:text-fg cursor-pointer" aria-label="Dismiss notification"><X className="size-3.5" /></button>
      {t.action && <motion.span className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-accent/60" initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: t.duration / 1000, ease: 'linear' }} aria-hidden="true" />}
    </motion.div>
  )
}
