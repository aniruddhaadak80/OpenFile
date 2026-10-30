// Extras around every tool page, added without touching the tools themselves:
//  - WhatNext: after a download, suggest tools that accept the output and hand the file over in one tap
//  - MobileActionBar: a sticky bar on phones that mirrors the tool's main button when it scrolls away
//  - QuickBar: recently used tools, one tap (or Alt + number) away
//  - burstConfetti: a short gold and teal celebration after a download
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Sparkles, X, Clock, Upload, Zap } from 'lucide-react'
import { CATEGORIES, toolBySlug, type ToolMeta } from '@/tools/registry'
import { downloadBus, type DownloadEvent } from '@/lib/ux'
import { formatFromName, formatLabel, toolsForFormat } from '@/lib/detect'
import { setHandoff } from '@/lib/handoff'
import { formatBytes } from '@/lib/files'
import { useRecent } from '@/lib/store'
import { resolvedReduceMotion } from '@/lib/prefs'
import { getIcon } from './icons'
import { cn } from './ui'

/* ---------------- confetti ---------------- */
export function burstConfetti(x = window.innerWidth / 2, y = window.innerHeight * 0.75) {
  if (resolvedReduceMotion() || typeof document === 'undefined') return
  const colors = ['#F5A524', '#FFB224', '#14B8A6', '#22D3EE', '#10B981']
  const layer = document.createElement('div')
  layer.setAttribute('aria-hidden', 'true')
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:120;overflow:hidden'
  document.body.appendChild(layer)
  const n = window.innerWidth < 640 ? 26 : 42
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i')
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.4
    const d = 90 + Math.random() * 160
    const dx = Math.cos(a) * d, dy = Math.sin(a) * d - 120
    const s = 5 + Math.random() * 6
    p.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${s}px;height:${s * (Math.random() > 0.5 ? 0.45 : 1)}px;border-radius:${Math.random() > 0.6 ? '50%' : '2px'};background:${colors[i % colors.length]};will-change:transform,opacity`
    layer.appendChild(p)
    p.animate([{ transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 1 }, { transform: `translate(${dx}px,${dy}px) rotate(${Math.random() * 540}deg)`, opacity: 1, offset: 0.55 }, { transform: `translate(${dx * 1.2}px,${dy + 260}px) rotate(${Math.random() * 900}deg)`, opacity: 0 }], { duration: 1300 + Math.random() * 600, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' })
  }
  setTimeout(() => layer.remove(), 2200)
}

/* ---------------- what next ---------------- */
export function WhatNext({ slug }: { slug: string }) {
  const [ev, setEv] = useState<(DownloadEvent & { format: string; tools: ToolMeta[] }) | null>(null)
  const nav = useNavigate()
  const last = useRef(0)
  useEffect(() => downloadBus.on((e) => {
    const format = formatFromName(e.name)
    const tools = format ? toolsForFormat(format, undefined, slug).slice(0, 6) : []
    if (Date.now() - last.current > 4000) burstConfetti()
    last.current = Date.now()
    setEv({ ...e, format, tools })
  }), [slug])
  useEffect(() => setEv(null), [slug])
  // A new file dropped or picked means the saved file named here is no longer the one being worked on (and the new
  // one may be unreadable), so hide the suggestions until the next save.
  useEffect(() => {
    if (!ev) return
    const clear = (e: Event) => { const t = e.target; if (e.type === 'drop' || (t instanceof HTMLInputElement && t.type === 'file')) setEv(null) }
    window.addEventListener('drop', clear, true)
    window.addEventListener('change', clear, true)
    return () => { window.removeEventListener('drop', clear, true); window.removeEventListener('change', clear, true) }
  }, [ev])
  const go = async (t: ToolMeta) => {
    if (!ev) return
    let blob = ev.blob
    if (!blob && ev.dataUrl) { try { blob = await (await fetch(ev.dataUrl)).blob() } catch { /* ignore */ } }
    if (blob) setHandoff([new File([blob], ev.name, { type: blob.type })])
    nav('/' + t.slug)
  }
  return (
    <AnimatePresence>
      {ev && (
        <motion.aside initial={{ opacity: 0, y: 30, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-[70] mx-auto max-w-lg rounded-3xl border border-border bg-surface/95 p-4 shadow-2xl backdrop-blur sm:bottom-6 sm:left-auto sm:right-6 sm:mx-0 sm:w-[420px] lg:bottom-6" aria-label="What next" role="complementary">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-success/15 text-success"><Sparkles className="size-5" /></div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Saved. What next?</div>
              <div className="truncate text-xs text-muted" title={ev.name}>{ev.name}{ev.size ? ` | ${formatBytes(ev.size)}` : ''}</div>
            </div>
            <button onClick={() => setEv(null)} className="grid size-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg cursor-pointer" aria-label="Close suggestions"><X className="size-4" /></button>
          </div>
          {ev.tools.length > 0 ? (
            <>
              <div className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Keep going with this {formatLabel(ev.format).toLowerCase()}</div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {ev.tools.map((t) => { const I = getIcon(t.icon); const col = CATEGORIES.find((c) => c.id === t.category)?.color; return (
                  <button key={t.slug} onClick={() => go(t)} className="group flex min-h-11 items-center gap-2 rounded-xl border border-border px-2.5 py-1.5 text-left text-xs transition hover:border-accent/60 hover:bg-surface-2 cursor-pointer">
                    <I className="size-4 shrink-0 transition group-hover:scale-110" style={{ color: col }} /><span className="line-clamp-2 font-medium">{t.name}</span>
                  </button>) })}
              </div>
              <p className="mt-2 text-[11px] text-muted">Your file goes straight into the next tool. Nothing is uploaded.</p>
            </>
          ) : <p className="mt-3 text-xs text-muted">Find your file in your downloads folder. Want to do more? <Link to="/tools" className="text-accent hover:underline">Browse tools</Link></p>}
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

/* ---------------- sticky main action on phones ---------------- */
/** Mirrors the tool's primary button (the gold one) when it is off screen, or offers the file picker. */
export function MobileActionBar({ container, slug }: { container: React.RefObject<HTMLElement | null>; slug: string }) {
  const [target, setTarget] = useState<{ el: HTMLElement; label: string; kind: 'button' | 'file' } | null>(null)
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const root = container.current
    if (!root) return
    let raf = 0
    let io: IntersectionObserver | null = null
    const pick = () => {
      raf = 0
      const buttons = [...root.querySelectorAll<HTMLButtonElement>('button.bg-gradient-brand')].filter((b) => !b.disabled && b.offsetParent !== null && !b.closest('[role="dialog"]'))
      const btn = buttons[buttons.length - 1]
      let next: typeof target = null
      if (btn) next = { el: btn, label: (btn.textContent || 'Run').trim().slice(0, 40) || 'Run', kind: 'button' }
      else {
        const dz = root.querySelector<HTMLElement>('[role="button"] input[type="file"]')?.closest<HTMLElement>('[role="button"]')
        if (dz) next = { el: dz, label: 'Choose a file', kind: 'file' }
      }
      setTarget((cur) => (cur?.el === next?.el && cur?.label === next?.label ? cur : next))
      io?.disconnect()
      if (next) { io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '0px 0px -64px 0px' }); io.observe(next.el) }
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(pick) }
    const mo = new MutationObserver(schedule)
    mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'class'] })
    schedule()
    return () => { mo.disconnect(); io?.disconnect(); if (raf) cancelAnimationFrame(raf) }
  }, [slug])
  const show = !!target && !visible
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }} className="glass fixed inset-x-0 bottom-0 z-[60] border-t border-border px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 lg:hidden">
          <div className="mx-auto flex max-w-xl items-center gap-2">
            <button onClick={() => target!.el.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="grid size-12 shrink-0 place-items-center rounded-xl border border-border text-muted cursor-pointer" aria-label="Scroll to the tool controls"><Zap className="size-4" /></button>
            <button onClick={() => { if (target!.kind === 'file') target!.el.querySelector<HTMLInputElement>('input[type="file"]')?.click(); else target!.el.click() }} className="btn-shine flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-brand px-4 font-semibold shadow-lg shadow-accent/25 cursor-pointer">
              {target!.kind === 'file' && <Upload className="size-4" />}<span className="truncate">{target!.label}</span>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------------- recently used quick bar ---------------- */
export function QuickBar({ current, className }: { current?: string; className?: string }) {
  const { recent } = useRecent()
  const tools = recent.filter((s) => s !== current).map(toolBySlug).filter((t): t is ToolMeta => !!t).slice(0, 8)
  const nav = useNavigate()
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return
      const n = Number(e.key)
      if (n >= 1 && n <= 9 && tools[n - 1]) { e.preventDefault(); nav('/' + tools[n - 1].slug) }
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [tools.map((t) => t.slug).join()])
  if (!tools.length) return null
  return (
    <nav aria-label="Recently used tools" className={cn('flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin', className)}>
      <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted"><Clock className="size-3.5" /> Recent</span>
      {tools.map((t, i) => { const I = getIcon(t.icon); const col = CATEGORIES.find((c) => c.id === t.category)?.color; return (
        <Link key={t.slug} to={'/' + t.slug} title={i < 9 ? `Alt + ${i + 1}` : undefined} className="group flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface/70 px-3 text-xs text-muted transition hover:border-accent hover:text-fg">
          <I className="size-3.5 transition group-hover:scale-110" style={{ color: col }} />{t.name}<kbd className="hidden rounded border border-border px-1 text-[9px] lg:inline">{i + 1}</kbd>
        </Link>) })}
      <Link to="/history" className="flex shrink-0 items-center gap-1 px-1 text-xs text-accent hover:underline">History <ArrowRight className="size-3" /></Link>
    </nav>
  )
}
