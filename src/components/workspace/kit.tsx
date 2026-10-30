/* Small shared pieces for the Workspace studio: motion level, progress ring, shimmer skeletons, step icons,
 * contextual tips, the before/after compare slider and a safe object URL hook. */
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Scaling, RefreshCw, Shrink, Crop, RotateCw, SlidersHorizontal, Stamp, Squircle, ShieldCheck, Eraser, Combine, Scissors, Hash, Contrast, FileImage, Images, ScanText, Music, Film, Table, Replace, FileArchive, PackageOpen, TextCursorInput, Fingerprint, Upload, Download, Box, MoveHorizontal } from 'lucide-react'
import { X, Lightbulb, Zap, Wind, Ban } from 'lucide-react'
import { cn } from '@/components/ui'
import { safeBlobUrl } from '@/lib/safe'
import { CATS, metaOf } from '@/pages/workspace/catalog'

/* ---------- motion level ---------- */
export type MotionLevel = 'off' | 'subtle' | 'full'
const MKEY = 'of:ws-motion'
export function initialMotion(): MotionLevel {
  try { const v = localStorage.getItem(MKEY); if (v === 'off' || v === 'subtle' || v === 'full') return v } catch { /* storage blocked */ }
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'off' : 'full'
}
export const MotionCtx = createContext<MotionLevel>('full')
export const useMotion = () => useContext(MotionCtx)
export function saveMotion(m: MotionLevel) { try { localStorage.setItem(MKEY, m) } catch { /* ignore */ } }

export function MotionToggle({ value, onChange }: { value: MotionLevel; onChange: (m: MotionLevel) => void }) {
  const opts: { v: MotionLevel; label: string; icon: React.ReactNode }[] = [{ v: 'off', label: 'Off', icon: <Ban className="size-3.5" /> }, { v: 'subtle', label: 'Subtle', icon: <Wind className="size-3.5" /> }, { v: 'full', label: 'Full', icon: <Zap className="size-3.5" /> }]
  return (
    <div role="radiogroup" aria-label="Motion" data-tour="motion" className="inline-flex rounded-xl border border-border bg-surface p-0.5">
      {opts.map((o) => (
        <button key={o.v} role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)} title={`Motion: ${o.label}`} aria-label={`Motion: ${o.label}`}
          className={cn('relative flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition cursor-pointer', value === o.v ? 'text-on-accent' : 'text-muted hover:text-fg')}>
          {value === o.v && <motion.span layoutId="ws-motion-pill" className="absolute inset-0 rounded-lg bg-gradient-brand" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
          <span className="relative flex items-center gap-1">{o.icon}<span className="hidden xl:inline" aria-hidden="true">{o.label}</span></span>
        </button>
      ))}
    </div>
  )
}

/* ---------- progress ring ---------- */
export function ProgressRing({ value, size = 44, stroke = 4, color = 'var(--accent)', track = 'color-mix(in oklab, var(--fg) 12%, transparent)', label, spin }: { value: number; size?: number; stroke?: number; color?: string; track?: string; label?: React.ReactNode; spin?: boolean }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value || 0))
  const m = useMotion()
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <svg width={size} height={size} className={cn('-rotate-90', spin && m !== 'off' && v === 0 && 'animate-spin')} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={spin && v === 0 ? c * 0.75 : c * (1 - v)} style={{ transition: m === 'off' ? 'none' : 'stroke-dashoffset .35s ease' }} />
      </svg>
      {label != null && <div className="absolute inset-0 grid place-items-center text-[10px] font-bold tabular-nums">{label}</div>}
    </div>
  )
}

/* ---------- skeleton / shimmer ---------- */
export function Skeleton({ className }: { className?: string }) {
  const m = useMotion()
  return <div className={cn('relative overflow-hidden rounded-xl bg-surface-2', className)} aria-hidden="true">{m !== 'off' && <div className="shimmer absolute inset-0" />}</div>
}

/* ---------- step icon ---------- */
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = { Scaling, RefreshCw, Shrink, Crop, RotateCw, SlidersHorizontal, Stamp, Squircle, ShieldCheck, Eraser, Combine, Scissors, Hash, Contrast, FileImage, Images, ScanText, Music, Film, Table, Replace, FileArchive, PackageOpen, TextCursorInput, Fingerprint, Upload, Download }
export function StepIcon({ step, className }: { step: string; className?: string }) {
  if (step === '@in') return <Upload className={className} />
  if (step === '@out') return <Download className={className} />
  const m = metaOf(step)
  const I = (m && ICONS[m.icon]) || Box
  return <I className={className} />
}
export const catColor = (step: string) => (step === '@in' ? '#F5A524' : step === '@out' ? '#10B981' : CATS.find((c) => c.id === metaOf(step)?.cat)?.color ?? '#F5A524')

/* ---------- contextual tip ---------- */
export function Tip({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  const key = 'of:ws-tip:' + id
  const [show, setShow] = useState(() => { try { return !localStorage.getItem(key) } catch { return true } })
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className={cn('overflow-hidden', className)}>
          <div className="flex items-start gap-2 rounded-xl border border-accent/25 bg-accent/5 px-3 py-2 text-xs text-muted">
            <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">{children}</div>
            <button aria-label="Hide tip" onClick={() => { setShow(false); try { localStorage.setItem(key, '1') } catch { /* ignore */ } }} className="rounded p-0.5 hover:text-fg cursor-pointer"><X className="size-3.5" /></button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------- object URLs ---------- */
/** An object URL for a blob, revoked when the blob changes or the component goes away. Always a blob: URL or ''. */
export function useObjectUrl(blob: Blob | null | undefined): string {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!blob) { setUrl(''); return }
    const u = URL.createObjectURL(blob)
    setUrl(safeBlobUrl(u))
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

/* ---------- before / after compare ---------- */
export function CompareSlider({ before, after, className }: { before: Blob; after: Blob; className?: string }) {
  const a = useObjectUrl(before), b = useObjectUrl(after)
  const [pos, setPos] = useState(50)
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef(false)
  const at = (clientX: number) => { const r = box.current!.getBoundingClientRect(); setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100))) }
  if (!a || !b) return <Skeleton className={cn('aspect-video w-full', className)} />
  return (
    <div ref={box} className={cn('relative select-none overflow-hidden rounded-xl border border-border bg-[repeating-conic-gradient(color-mix(in_oklab,var(--fg)_8%,transparent)_0_25%,transparent_0_50%)] bg-[length:16px_16px]', className)}
      onPointerDown={(e) => { drag.current = true; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); at(e.clientX) }}
      onPointerMove={(e) => drag.current && at(e.clientX)} onPointerUp={() => { drag.current = false }}>
      <img src={b} alt="After" className="block max-h-[60vh] w-full object-contain" draggable={false} />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}><img src={a} alt="Before" className="block max-h-[60vh] w-full object-contain" draggable={false} /></div>
      <div className="absolute inset-y-0 w-0.5 bg-accent shadow-[0_0_12px_var(--accent)]" style={{ left: pos + '%' }} />
      <div role="slider" tabIndex={0} aria-label="Compare before and after" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pos)}
        onKeyDown={(e) => { if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 5)); if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 5)) }}
        className="absolute top-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full bg-gradient-brand text-on-accent shadow-lg" style={{ left: pos + '%' }}><MoveHorizontal className="size-4" /></div>
      <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">BEFORE</span>
      <span className="absolute right-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">AFTER</span>
    </div>
  )
}

export const fmtMs = (ms: number | null) => {
  if (ms == null) return '…'
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}
