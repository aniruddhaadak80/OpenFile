// Motion kit: small, GPU-friendly building blocks used across pages.
// Everything here respects the reduced-motion preference (Settings or the OS) and only animates
// transform and opacity, so it stays cheap on low-end devices.
import React, { useEffect, useRef, useState } from 'react'
import { motion, useInView, useMotionValue, useSpring, animate, type Variants } from 'framer-motion'
import { useReducedMotion } from '@/lib/store'
import { resolvedReduceMotion } from '@/lib/prefs'
import { cn } from './ui'

const ease = [0.22, 1, 0.36, 1] as const

/** Fade and rise into view once, when scrolled to. */
export function Reveal({ children, delay = 0, y = 18, className, as = 'div' }: { children: React.ReactNode; delay?: number; y?: number; className?: string; as?: 'div' | 'section' | 'li' }) {
  const M = motion[as] as typeof motion.div
  return (
    <M className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, delay, ease }}>
      {children}
    </M>
  )
}

const staggerParent: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } } }
export const staggerChild: Variants = { hidden: { opacity: 0, y: 16, scale: 0.98 }, show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease } } }

/** Parent for staggered card reveals. Children should be <StaggerItem>. */
export function Stagger({ children, className, once = true }: { children: React.ReactNode; className?: string; once?: boolean }) {
  return <motion.div className={className} variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once, margin: '-40px' }}>{children}</motion.div>
}
export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return <motion.div className={className} variants={staggerChild}>{children}</motion.div>
}

/** Pulls its child gently toward the cursor. Desktop pointers only. */
export function Magnetic({ children, strength = 0.25, className }: { children: React.ReactNode; strength?: number; className?: string }) {
  const reduce = useReducedMotion()
  const x = useSpring(useMotionValue(0), { stiffness: 260, damping: 18, mass: 0.4 })
  const y = useSpring(useMotionValue(0), { stiffness: 260, damping: 18, mass: 0.4 })
  const ref = useRef<HTMLDivElement>(null)
  const move = (e: React.PointerEvent) => {
    if (reduce || e.pointerType !== 'mouse' || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    x.set((e.clientX - (r.left + r.width / 2)) * strength)
    y.set((e.clientY - (r.top + r.height / 2)) * strength)
  }
  const leave = () => { x.set(0); y.set(0) }
  return <motion.div ref={ref} onPointerMove={move} onPointerLeave={leave} style={{ x, y }} className={cn('inline-block', className)}>{children}</motion.div>
}

/** Cursor-follow spotlight: spread the returned handlers on an element with the `spotlight` class. */
export function spotlightMove(e: React.PointerEvent<HTMLElement>) {
  const el = e.currentTarget
  const r = el.getBoundingClientRect()
  el.style.setProperty('--mx', `${e.clientX - r.left}px`)
  el.style.setProperty('--my', `${e.clientY - r.top}px`)
}

/** Hover tilt (3D). Returns pointer handlers for an element with the `tilt` class. */
export function useTilt(max = 6) {
  const reduce = useReducedMotion()
  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    spotlightMove(e)
    if (reduce || e.pointerType !== 'mouse') return
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    el.style.transform = `perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg) translateY(-3px)`
  }
  const onPointerLeave = (e: React.PointerEvent<HTMLElement>) => { e.currentTarget.style.transform = '' }
  return { onPointerMove, onPointerLeave }
}

/** Counts up to `value` when scrolled into view. Non-numeric values render as-is. */
export function Counter({ value, suffix = '', prefix = '', className, duration = 1.4 }: { value: number; suffix?: string; prefix?: string; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const reduce = useReducedMotion()
  const [n, setN] = useState(reduce ? value : 0)
  useEffect(() => {
    if (!inView) return
    if (reduce) { setN(value); return }
    const c = animate(0, value, { duration, ease, onUpdate: (v) => setN(Math.round(v)) })
    return () => c.stop()
  }, [inView, value, reduce, duration])
  return <span ref={ref} className={cn('tabular-nums', className)}>{prefix}{n.toLocaleString()}{suffix}</span>
}

/** Infinite horizontal marquee. Content is duplicated once for a seamless loop. */
export function Marquee({ children, duration = 40, reverse, className }: { children: React.ReactNode; duration?: number; reverse?: boolean; className?: string }) {
  return (
    <div className={cn('marquee-wrap marquee-mask overflow-hidden', className)}>
      <div className="marquee" style={{ ['--marquee-dur' as string]: `${duration}s`, animationDirection: reverse ? 'reverse' : undefined }}>
        <div className="flex shrink-0 items-center gap-3 pr-3">{children}</div>
        <div className="flex shrink-0 items-center gap-3 pr-3" aria-hidden="true">{children}</div>
      </div>
    </div>
  )
}

/** Route transition wrapper (keyed by pathname in Layout). */
export function PageTransition({ children, k }: { children: React.ReactNode; k: string }) {
  return (
    <motion.div key={k} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }}>
      {children}
    </motion.div>
  )
}

/** Accent color read from CSS (so canvas art follows the accent picker). */
function readAccent(): [string, string, string] {
  const cs = getComputedStyle(document.documentElement)
  return [cs.getPropertyValue('--accent').trim() || '#F5A524', cs.getPropertyValue('--accent-glow').trim() || '#FFB224', cs.getPropertyValue('--accent-2').trim() || '#14B8A6']
}

/**
 * Aurora + drifting particles on a canvas. Renders at a reduced resolution, pauses when the tab is hidden
 * or the canvas is off screen, and draws a single static frame when reduced motion is on.
 */
export function Aurora({ className, density = 46 }: { className?: string; density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0, visible = true, onScreen = true, t = 0
    let [a1, a2, a3] = readAccent()
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    let w = 0, h = 0
    const parts = Array.from({ length: density }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + 0.4, vx: (Math.random() - 0.5) * 0.00018, vy: -Math.random() * 0.00035 - 0.00005, a: Math.random() * 0.6 + 0.2 }))
    const resize = () => { const r = canvas.getBoundingClientRect(); w = r.width; h = r.height; canvas.width = Math.max(1, w * dpr); canvas.height = Math.max(1, h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0) }
    const blob = (x: number, y: number, rad: number, color: string, alpha: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad)
      g.addColorStop(0, color + Math.round(alpha * 255).toString(16).padStart(2, '0'))
      g.addColorStop(1, color + '00')
      ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2)
    }
    const hex = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#F5A524')
    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'
      const s = Math.max(w, h)
      blob(w * (0.3 + Math.sin(t * 0.00021) * 0.12), h * (0.25 + Math.cos(t * 0.00017) * 0.08), s * 0.42, hex(a1), 0.16)
      blob(w * (0.72 + Math.cos(t * 0.00019) * 0.1), h * (0.3 + Math.sin(t * 0.00023) * 0.1), s * 0.36, hex(a2), 0.1)
      blob(w * (0.55 + Math.sin(t * 0.00013) * 0.15), h * (0.7 + Math.cos(t * 0.00011) * 0.08), s * 0.4, hex(a3), 0.06)
      ctx.globalCompositeOperation = 'source-over'
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy
        if (p.y < -0.02) { p.y = 1.02; p.x = Math.random() }
        if (p.x < -0.02) p.x = 1.02; else if (p.x > 1.02) p.x = -0.02
        ctx.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(t * 0.002 + p.x * 10))
        ctx.fillStyle = hex(a2)
        ctx.beginPath(); ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2); ctx.fill()
      }
      ctx.globalAlpha = 1
    }
    const loop = (now: number) => { t = now; draw(); if (visible && onScreen && !resolvedReduceMotion()) raf = requestAnimationFrame(loop) }
    const start = () => { cancelAnimationFrame(raf); if (resolvedReduceMotion()) { draw(); return } raf = requestAnimationFrame(loop) }
    resize(); start()
    const ro = new ResizeObserver(() => { resize(); if (resolvedReduceMotion()) draw() }); ro.observe(canvas)
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; if (onScreen) start(); else cancelAnimationFrame(raf) }); io.observe(canvas)
    const vis = () => { visible = !document.hidden; if (visible) start(); else cancelAnimationFrame(raf) }
    document.addEventListener('visibilitychange', vis)
    const mo = new MutationObserver(() => { [a1, a2, a3] = readAccent(); if (resolvedReduceMotion()) draw() })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme', 'class'] })
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); mo.disconnect(); document.removeEventListener('visibilitychange', vis) }
  }, [density])
  return <canvas ref={ref} aria-hidden="true" className={cn('pointer-events-none absolute inset-0 size-full', className)} />
}

/** Animated glowing ring, the hero centerpiece (a glowing gold ring on black). */
export function GoldRing({ size = 420, className, children }: { size?: number; className?: string; children?: React.ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <div className={cn('relative grid place-items-center', className)} style={{ width: size, maxWidth: '100%', aspectRatio: '1 / 1' }} aria-hidden={children ? undefined : true}>
      <div className="gold-halo animate-ring-pulse absolute inset-[9%]" />
      <motion.div className="gold-ring absolute inset-[6%]" style={{ ['--ring-w' as string]: '3px' }} animate={reduce ? undefined : { rotate: 360 }} transition={{ duration: 14, ease: 'linear', repeat: Infinity }} />
      <motion.div className="gold-ring absolute inset-0 opacity-50" style={{ ['--ring-w' as string]: '1.5px' }} animate={reduce ? undefined : { rotate: -360 }} transition={{ duration: 26, ease: 'linear', repeat: Infinity }} />
      <motion.div className="gold-ring absolute inset-[16%] opacity-70" style={{ ['--ring-w' as string]: '1px' }} animate={reduce ? undefined : { rotate: 360 }} transition={{ duration: 9, ease: 'linear', repeat: Infinity }} />
      <div className="absolute inset-[22%] rounded-full" style={{ background: 'radial-gradient(circle, color-mix(in oklab, var(--accent-glow) 14%, transparent), transparent 70%)' }} />
      {children && <div className="relative z-10">{children}</div>}
    </div>
  )
}
