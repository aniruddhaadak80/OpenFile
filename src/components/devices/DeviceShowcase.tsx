// Interactive device showcase for the Install hero: pick a device, watch OpenFile run on its screen,
// tap a tool to play it, tilt with the pointer, switch the screen theme, open the tool for real.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useInView, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { Apple, Monitor, Terminal, Tablet, TabletSmartphone, Smartphone, Sun, Moon, Pause, Play, ArrowRight, ChevronLeft, ChevronRight, WifiOff, ShieldCheck, Zap } from 'lucide-react'
import { cn } from '@/components/ui'
import { useReducedMotion } from '@/lib/store'
import { DEVICES, SHOWCASE, detectDevice, fit, type DeviceId } from './devices'
import { useDemoLoop } from './demo'
import { OsScreen } from './OsScreen'
import { DeviceFrame } from './DeviceFrame'
import type { ScreenTheme } from './MiniApp'

const ICON: Record<DeviceId, typeof Monitor> = { mac: Apple, win: Monitor, linux: Terminal, ipad: Tablet, atab: TabletSmartphone, iphone: Smartphone, aphone: Smartphone, chromeos: Monitor, browser: Monitor }

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [s, setS] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const set = () => setS({ w: el.clientWidth, h: el.clientHeight })
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, s] as const
}

export function DeviceShowcase() {
  const detected = useMemo(detectDevice, [])
  const [device, setDevice] = useState<DeviceId>(detected)
  const [theme, setTheme] = useState<ScreenTheme>('dark')
  const [paused, setPaused] = useState(false)
  const reduced = useReducedMotion()
  const [stageRef, stage] = useSize<HTMLDivElement>()
  const inView = useInView(stageRef, { amount: 0.2 })
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  const loop = useDemoLoop(inView && visible && !paused, reduced)
  const hoverT = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onHover = (i: number | null) => {
    if (hoverT.current) clearTimeout(hoverT.current)
    if (i === null || i === loop.index) return
    hoverT.current = setTimeout(() => loop.play(i), 280)
  }
  useEffect(() => () => { if (hoverT.current) clearTimeout(hoverT.current) }, [])

  const tabsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const list = tabsRef.current
    const tab = list?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return
    list.scrollTo({ left: tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2, behavior: reduced ? 'auto' : 'smooth' })
  }, [device, reduced])
  const idx = SHOWCASE.indexOf(device)
  const go = (d: number) => setDevice(SHOWCASE[(idx + d + SHOWCASE.length) % SHOWCASE.length])

  // pointer tilt and parallax (desktop, fine pointers only)
  const px = useMotionValue(0), py = useMotionValue(0)
  const sx = useSpring(px, { stiffness: 120, damping: 18 }), sy = useSpring(py, { stiffness: 120, damping: 18 })
  const rotY = useTransform(sx, [-0.5, 0.5], [9, -9]), rotX = useTransform(sy, [-0.5, 0.5], [-7, 7])
  const bx = useTransform(sx, [-0.5, 0.5], [16, -16]), by = useTransform(sy, [-0.5, 0.5], [12, -12])
  const bx2 = useTransform(sx, [-0.5, 0.5], [-12, 12]), by2 = useTransform(sy, [-0.5, 0.5], [-9, 9])
  const tilt = !reduced
  const onMove = (e: React.PointerEvent) => {
    if (!tilt || e.pointerType === 'touch') return
    const r = e.currentTarget.getBoundingClientRect()
    px.set((e.clientX - r.left) / r.width - 0.5); py.set((e.clientY - r.top) / r.height - 0.5)
  }
  const onLeave = () => { px.set(0); py.set(0) }

  const g = stage.w ? fit(device, stage.w, stage.h, 0.9) : null
  const spec = DEVICES[device]
  const tool = loop.demo.tool

  return (
    <div className="relative mx-auto w-full min-w-0 max-w-[620px]">
      {/* switcher */}
      <div role="tablist" ref={tabsRef} aria-label="Choose a device" className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-1 [mask-image:linear-gradient(90deg,#000_85%,transparent)] [scrollbar-width:none] sm:flex-wrap sm:justify-center sm:overflow-visible sm:[mask-image:none] [&::-webkit-scrollbar]:hidden"
        onKeyDown={(e) => { if (e.key === 'ArrowRight') { e.preventDefault(); go(1) } if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) } }}>
        {SHOWCASE.map((id) => {
          const I = ICON[id]
          const on = id === device
          return (
            <button key={id} role="tab" aria-selected={on} tabIndex={on ? 0 : -1} onClick={() => setDevice(id)}
              className={cn('relative inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors sm:min-h-9 sm:px-2.5', on ? 'text-on-accent' : 'text-muted hover:text-fg')}>
              {on && <motion.span layoutId="device-pill" className="absolute inset-0 rounded-full bg-accent" transition={{ type: 'spring', stiffness: 380, damping: 30 }} />}
              <I className="relative size-4" /><span className="relative">{DEVICES[id].short}</span>
              {id === detected && <span className={cn('relative size-1.5 rounded-full', on ? 'bg-on-accent' : 'bg-emerald')} title="Your device" />}
            </button>
          )
        })}
      </div>

      {/* stage */}
      <motion.div ref={stageRef} className="relative mt-3 h-[300px] w-full select-none sm:h-[380px] lg:h-[420px]" style={{ touchAction: 'pan-y' }}
        onPointerMove={onMove} onPointerLeave={onLeave}
        onPanEnd={(_, info) => { if (Math.abs(info.offset.x) > 50 && Math.abs(info.offset.x) > Math.abs(info.offset.y)) go(info.offset.x < 0 ? 1 : -1) }}>
        <div className="pointer-events-none absolute inset-0 rounded-full" style={{ background: 'radial-gradient(closest-side, color-mix(in oklab, var(--accent-glow) 26%, transparent), transparent)' }} />
        <div className="absolute inset-0 flex items-center justify-center">
          {g && (
            <motion.div style={tilt ? { rotateX: rotX, rotateY: rotY, transformPerspective: 1200 } : undefined}
              animate={reduced ? undefined : { y: [0, -6, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}>
              <DeviceFrame device={device} g={g} animated={!reduced}>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div key={device} className="absolute inset-0" initial={reduced ? false : { opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={reduced ? undefined : { opacity: 0 }} transition={{ duration: 0.35 }}>
                    <OsScreen device={device} theme={theme} app={{ index: loop.index, phase: loop.phase, motionOn: !reduced, onHover, onPick: loop.play }} />
                  </motion.div>
                </AnimatePresence>
              </DeviceFrame>
            </motion.div>
          )}
        </div>
        {/* floating badges */}
        <Badge style={{ x: bx, y: by }} className="left-0 top-1" delay={0.5} reduced={reduced} tone="emerald"><WifiOff className="size-3.5" /> Works offline</Badge>
        <Badge style={{ x: bx2, y: by2 }} className="right-0 top-[38%]" delay={0.7} reduced={reduced} tone="accent"><ShieldCheck className="size-3.5" /> Files stay on device</Badge>
        <Badge style={{ x: bx, y: by2 }} className="bottom-1 left-2 sm:left-6" delay={0.9} reduced={reduced} tone="sky"><Zap className="size-3.5" /> Installs in seconds</Badge>
        {/* phone arrows */}
        <button onClick={() => go(-1)} aria-label="Previous device" className="absolute left-0 top-1/2 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-border bg-surface/80 backdrop-blur sm:hidden"><ChevronLeft className="size-4" /></button>
        <button onClick={() => go(1)} aria-label="Next device" className="absolute right-0 top-1/2 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-border bg-surface/80 backdrop-blur sm:hidden"><ChevronRight className="size-4" /></button>
      </motion.div>

      {/* controls */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="mr-auto min-w-0 text-sm">
          <div className="font-semibold">{spec.label}</div>
          <div className="truncate text-xs text-muted">{spec.os}{device === detected ? ' · your device' : ''}</div>
        </div>
        <div className="flex sm:hidden gap-1" aria-hidden="true">{SHOWCASE.map((id) => <span key={id} className={cn('h-1.5 rounded-full transition-all', id === device ? 'w-4 bg-accent' : 'w-1.5 bg-border')} />)}</div>
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Show the screen in light mode' : 'Show the screen in dark mode'} aria-pressed={theme === 'light'}
          className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 text-sm hover:border-accent">{theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}<span className="hidden sm:inline">{theme === 'dark' ? 'Light' : 'Dark'}</span></button>
        {!reduced && <button onClick={() => setPaused(!paused)} aria-label={paused ? 'Play the demo' : 'Pause the demo'} className="grid size-10 cursor-pointer place-items-center rounded-xl border border-border hover:border-accent">{paused ? <Play className="size-4" /> : <Pause className="size-4" />}</button>}
        <Link to={`/${tool.slug}`} data-testid="try-for-real" className="btn-shine inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-gradient-brand px-3.5 text-sm font-semibold text-on-accent hover:brightness-110">
          Try {tool.name} for real <ArrowRight className="size-4" />
        </Link>
      </div>
      <p className="mt-2 text-xs text-muted">Tap a tool on the screen to play it. <span className="sm:hidden">Swipe to switch devices.</span><span className="hidden sm:inline">Live preview, drawn in your browser.</span></p>
    </div>
  )
}

function Badge({ children, className, style, delay, reduced, tone }: { children: React.ReactNode; className: string; style: any; delay: number; reduced: boolean; tone: 'emerald' | 'accent' | 'sky' }) {
  const c = tone === 'emerald' ? 'border-emerald/40 text-emerald' : tone === 'sky' ? 'border-sky/40 text-sky' : 'border-accent/40 text-accent'
  return (
    <motion.div style={reduced ? undefined : style} className={cn('pointer-events-none absolute z-10', className)}>
      <motion.div initial={reduced ? false : { opacity: 0, scale: 0.8 }} animate={reduced ? undefined : { opacity: 1, scale: 1, y: [0, -6, 0] }} transition={{ opacity: { delay }, scale: { delay }, y: { duration: 4 + delay, repeat: Infinity, ease: 'easeInOut' } }}
        className={cn('flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-black/80 px-2.5 py-1 text-[11px] font-medium backdrop-blur sm:px-3 sm:py-1.5 sm:text-xs', c)}>{children}</motion.div>
    </motion.div>
  )
}
