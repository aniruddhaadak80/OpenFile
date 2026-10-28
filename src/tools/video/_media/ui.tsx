/* Shared UI pieces for the media tools. */
import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Cpu, X, RotateCcw, ArrowRight, AlertTriangle, Film } from 'lucide-react'
import { Button, Progress, ErrorNote, FileChip, cn } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { eta, fmtTime, parseTimeInput, useEngine, useInterval, type MediaJob } from './media'

/** Progress / engine-loading / cancel panel for an ffmpeg job. */
export function JobPanel({ job, onRetry }: { job: MediaJob; onRetry?: () => void }) {
  const engine = useEngine()
  const [, force] = useState(0)
  useInterval(() => force((n) => n + 1), job.busy ? 1000 : null)
  const loadingEngine = job.busy && engine.status === 'loading'
  return (
    <AnimatePresence initial={false}>
      {job.busy && (
        <motion.div key="busy" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="space-y-3 rounded-xl border border-border bg-surface-2/50 p-3">
          {loadingEngine ? (
            <>
              <div className="flex items-center gap-2 text-sm font-medium"><Cpu className="size-4 animate-pulse text-accent" />Loading video engine (~30 MB, first time only)</div>
              <Progress value={engine.total ? engine.loaded / engine.total : 0} label={`${formatBytes(engine.loaded)} of ~${formatBytes(engine.total)}`} />
              <p className="text-xs text-muted">The engine is cached by your browser, so next time it starts instantly.</p>
            </>
          ) : (
            <>
              <Progress value={job.progress} label={<span>{job.label}{eta(job.startedAt, job.progress) && <span className="ml-2 text-muted/80">· {eta(job.startedAt, job.progress)}</span>}</span>} />
              <p className="text-xs text-muted">Runs on your device. Keep this tab open; larger files take longer.</p>
            </>
          )}
          <Button variant="outline" size="sm" className="w-full" icon={<X className="size-4" />} onClick={job.cancel}>Cancel</Button>
        </motion.div>
      )}
      {job.phase === 'error' && job.error && (
        <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
          <ErrorNote error={job.error} />
          {onRetry && <Button variant="secondary" size="sm" icon={<RotateCcw className="size-4" />} onClick={onRetry}>Try again</Button>}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Text input for a time value that accepts 1:23.45 or 83.45. */
export function TimeInput({ value, onChange, min = 0, max = Infinity, className, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; className?: string; label?: string }) {
  const [text, setText] = useState(fmtTime(value))
  const [focus, setFocus] = useState(false)
  useEffect(() => { if (!focus) setText(fmtTime(value)) }, [value, focus])
  const commit = () => {
    const v = parseTimeInput(text)
    if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)))
    else setText(fmtTime(value))
  }
  return (
    <input aria-label={label} value={text} onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); commit() }}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const step = e.shiftKey ? 1 : 0.1; onChange(Math.min(max, Math.max(min, value + (e.key === 'ArrowUp' ? step : -step)))) }
      }}
      className={cn('h-10 w-full rounded-xl border border-border bg-surface-2/60 px-3 font-mono text-sm text-fg outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20', className)} />
  )
}

/** Dual-handle range timeline with a thumbnail strip and a playhead. */
export function RangeTimeline({ duration, start, end, onChange, current, onSeek, thumbs = [], minGap = 0.1, maxLen }: {
  duration: number; start: number; end: number; onChange: (s: number, e: number) => void; current: number; onSeek: (t: number) => void; thumbs?: string[]; minGap?: number; maxLen?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<null | { kind: 's' | 'e' | 'range' | 'seek'; x0: number; s0: number; e0: number; moved?: boolean }>(null)
  const pct = (t: number) => (duration ? (t / duration) * 100 : 0)
  const tAt = (clientX: number) => { const r = ref.current!.getBoundingClientRect(); return Math.min(duration, Math.max(0, ((clientX - r.left) / r.width) * duration)) }
  const onDown = (kind: 's' | 'e' | 'range' | 'seek') => (e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { kind, x0: e.clientX, s0: start, e0: end }
    if (kind === 'seek') onSeek(tAt(e.clientX))
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || !ref.current) return
    const t = tAt(e.clientX)
    if (d.kind === 'seek') return onSeek(t)
    if (d.kind === 's') { let s = Math.min(t, end - minGap); if (maxLen) s = Math.max(s, end - maxLen); onChange(Math.max(0, s), end); onSeek(Math.max(0, s)) }
    else if (d.kind === 'e') { let en = Math.max(t, start + minGap); if (maxLen) en = Math.min(en, start + maxLen); onChange(start, Math.min(duration, en)); onSeek(Math.min(duration, en)) }
    else {
      if (Math.abs(e.clientX - d.x0) > 3) d.moved = true
      if (!d.moved) return
      const r = ref.current.getBoundingClientRect(); const dt = ((e.clientX - d.x0) / r.width) * duration
      const len = d.e0 - d.s0; const s = Math.min(duration - len, Math.max(0, d.s0 + dt)); onChange(s, s + len)
    }
  }
  const onUp = (e: React.PointerEvent) => { const d = drag.current; drag.current = null; if (d?.kind === 'range' && !d.moved && ref.current) onSeek(tAt(e.clientX)) }
  const handle = (side: 's' | 'e') => (
    <div role="slider" tabIndex={0} aria-label={side === 's' ? 'Start' : 'End'} aria-valuenow={side === 's' ? start : end} aria-valuemin={0} aria-valuemax={duration}
      onPointerDown={onDown(side)} onPointerMove={onMove} onPointerUp={onUp}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 1 : 0.1
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault(); const dir = e.key === 'ArrowLeft' ? -step : step
        if (side === 's') onChange(Math.max(0, Math.min(end - minGap, start + dir)), end)
        else onChange(start, Math.min(duration, Math.max(start + minGap, end + dir)))
      }}
      className="absolute top-0 bottom-0 z-20 flex w-4 cursor-ew-resize touch-none items-center justify-center bg-accent outline-none focus-visible:ring-2 focus-visible:ring-fg"
      style={{ left: `calc(${pct(side === 's' ? start : end)}% - ${side === 's' ? 16 : 0}px)`, borderRadius: side === 's' ? '10px 0 0 10px' : '0 10px 10px 0' }}>
      <div className="h-6 w-0.5 rounded bg-white/90" />
    </div>
  )
  return (
    <div className="select-none px-4">
      <div ref={ref} className="relative h-16 touch-none" onPointerDown={onDown('seek')} onPointerMove={onMove} onPointerUp={onUp}>
        <div className="absolute inset-0 flex overflow-hidden rounded-lg bg-surface-2">
          {Array.from({ length: Math.max(thumbs.length, 1) }).map((_, i) => (
            <div key={i} className="h-full flex-1 bg-cover bg-center" style={{ backgroundImage: thumbs[i] ? `url(${thumbs[i]})` : undefined }}>
              {!thumbs[i] && <div className="h-full w-full animate-pulse bg-surface-2" />}
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 rounded-l-lg bg-bg/70" style={{ width: pct(start) + '%' }} />
        <div className="pointer-events-none absolute inset-y-0 right-0 rounded-r-lg bg-bg/70" style={{ width: 100 - pct(end) + '%' }} />
        <div className="absolute inset-y-0 z-10 cursor-grab border-y-[3px] border-accent active:cursor-grabbing" style={{ left: pct(start) + '%', width: pct(end) - pct(start) + '%' }} onPointerDown={onDown('range')} onPointerMove={onMove} onPointerUp={onUp} />
        {handle('s')}{handle('e')}
        <div className="pointer-events-none absolute -top-1.5 -bottom-1.5 z-30 w-0.5 bg-fg shadow" style={{ left: pct(current) + '%' }}>
          <div className="absolute -top-1 -left-[5px] size-3 rounded-full bg-fg" />
        </div>
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[11px] text-muted"><span>0:00</span><span className="text-accent">{fmtTime(end - start)} selected</span><span>{fmtTime(duration, 1)}</span></div>
    </div>
  )
}

/** File chip + start over row shown above a workspace. */
export function FileBar({ file, onReset, extra }: { file: File; onReset: () => void; extra?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-0 flex-1"><FileChip file={file} extra={extra} /></div>
      <Button variant="ghost" size="sm" icon={<RotateCcw className="size-4" />} onClick={onReset}>Start over</Button>
    </div>
  )
}

/** Video element in a nice frame, with a fallback when the browser cannot preview it. */
export const VideoStage = React.forwardRef<HTMLVideoElement, { src: string | null; playable?: boolean; className?: string; controls?: boolean } & Omit<React.VideoHTMLAttributes<HTMLVideoElement>, 'src'>>(
  ({ src, playable = true, className, controls = true, ...rest }, ref) => (
    <div className={cn('relative overflow-hidden rounded-2xl border border-border bg-black/90', className)}>
      {playable && src ? <video ref={ref} src={src} controls={controls} playsInline className="mx-auto max-h-[60vh] w-full bg-black object-contain" {...rest} />
        : <div className="grid aspect-video place-items-center p-6 text-center text-sm text-white/70"><div><Film className="mx-auto mb-2 size-8 opacity-60" />Your browser can't preview this format, but it can still be processed.</div></div>}
    </div>
  ))
VideoStage.displayName = 'VideoStage'

export function Note({ children, tone = 'info', className }: { children: React.ReactNode; tone?: 'info' | 'warn'; className?: string }) {
  return (
    <div className={cn('flex gap-2 rounded-xl border px-3 py-2.5 text-xs leading-relaxed', tone === 'warn' ? 'border-warn/30 bg-warn/10 text-fg' : 'border-border bg-surface-2/50 text-muted', className)}>
      {tone === 'warn' && <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" />}<div>{children}</div>
    </div>
  )
}

export function ToolLink({ to, title, sub, onClick }: { to: string; title: string; sub?: string; onClick?: () => void }) {
  return (
    <Link to={to} onClick={onClick} className="group flex items-center gap-3 rounded-xl border border-border bg-surface-2/40 px-3 py-2.5 text-sm transition hover:border-accent">
      <div className="min-w-0 flex-1"><div className="font-medium group-hover:text-accent">{title}</div>{sub && <div className="text-xs text-muted">{sub}</div>}</div>
      <ArrowRight className="size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" />
    </Link>
  )
}

export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-xl bg-surface-2/60 px-3 py-2"><div className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</div><div className="font-mono text-sm">{value}</div></div>
}

/** Animated wrapper for result sections. */
export function Reveal({ children, k }: { children: React.ReactNode; k?: string | number }) {
  return <motion.div key={k} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>{children}</motion.div>
}

/** Big pulsing record timer. */
export function RecTimer({ seconds, paused }: { seconds: number; paused?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 font-mono text-sm text-white backdrop-blur">
      <span className={cn('size-2.5 rounded-full', paused ? 'bg-warn' : 'animate-pulse bg-red-500')} />
      {fmtTime(seconds, 0)}{paused && <span className="text-xs text-white/70">paused</span>}
    </div>
  )
}

/** Fullscreen-ish countdown overlay. */
export function Countdown({ n }: { n: number | null }) {
  return (
    <AnimatePresence>
      {n != null && n > 0 && (
        <motion.div key={n} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.35 }}
          className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-black/40 font-display text-8xl font-bold text-white drop-shadow-xl">{n}</motion.div>
      )}
    </AnimatePresence>
  )
}

/** Live level meter bar driven by an AnalyserNode. */
export function LevelMeter({ analyser, className }: { analyser: AnalyserNode | null; className?: string }) {
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!analyser) return
    const data = new Float32Array(analyser.fftSize)
    let raf = 0, peak = 0
    const loop = () => {
      analyser.getFloatTimeDomainData(data)
      let m = 0; for (let i = 0; i < data.length; i++) m = Math.max(m, Math.abs(data[i]))
      peak = Math.max(m, peak * 0.92)
      if (bar.current) bar.current.style.width = Math.min(100, Math.sqrt(peak) * 100) + '%'
      raf = requestAnimationFrame(loop)
    }
    loop(); return () => cancelAnimationFrame(raf)
  }, [analyser])
  return <div className={cn('h-1.5 overflow-hidden rounded-full bg-surface-2', className)}><div ref={bar} className="h-full w-0 rounded-full bg-gradient-to-r from-success via-warn to-danger transition-[width] duration-75" /></div>
}

/** Shows the engine download bar whenever ffmpeg.wasm is being fetched (for flows not wrapped in a job). */
export function EngineLoading() {
  const engine = useEngine()
  if (engine.status !== 'loading') return null
  return <div className="w-72 max-w-full text-left"><Progress value={engine.total ? engine.loaded / engine.total : 0} label={`Loading video engine (~30 MB, first time only)`} /></div>
}
