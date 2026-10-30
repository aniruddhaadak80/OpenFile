// The Home hero centrepiece: the gold ring, filled with motion, where every element is a real link.
// Layers (back to front): a tiny WebGL light shader, the gold rings, dashed and gradient arcs spinning at
// different speeds, an occasional comet along the ring, light particles streaming into the core, format chips
// drifting on two orbits (each one links to the best tool for its format and briefly "converts", PDF to DOCX,
// linking to the converter while it does), one chip flying into the core and coming out converted, the core
// itself (a live showcase of real tool previews; click it to choose a file), and the category icons.
// Every visit is seeded differently: which chips, their colours, drift paths, orbit speeds and the showcase.
// Hovering or focusing anything freezes all motion in place and opens a card with a preview of that tool.
// Everything animates transform and opacity only, pauses off screen and stays static for reduced motion.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, type MotionValue } from 'framer-motion'
import { CATEGORIES, TOOLS, toolBySlug } from '@/tools/registry'
import { useReducedMotion } from '@/lib/store'
import { resolvedReduceMotion } from '@/lib/prefs'
import { openDropSheet } from '@/lib/ux'
import { Logo } from './Logo'
import { getIcon } from './icons'
import { cn } from './ui'
import { HoverCard } from './hero/HoverCard'
import { Showcase } from './hero/Showcase'
import { categoryInfo, chipInfo, makeSeed, planVisit, type HeroChip, type HoverInfo } from './hero/pool'

type InfoGetter = () => Omit<HoverInfo, 'x' | 'y' | 'key'>
type ItemProps = (key: string, get: InfoGetter) => {
  'data-active'?: true
  'aria-describedby'?: string
  onPointerEnter: (e: React.PointerEvent<HTMLElement>) => void
  onPointerLeave: (e: React.PointerEvent<HTMLElement>) => void
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
  onFocus: (e: React.FocusEvent<HTMLElement>) => void
  onBlur: () => void
  onClick: (e: React.MouseEvent<HTMLElement>) => void
}

/* ---------------- WebGL light (gold and teal), low resolution, ~30 fps ---------------- */
const FRAG = `precision mediump float;
uniform float t; uniform vec2 r; uniform vec3 c1; uniform vec3 c2;
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*r)/min(r.x,r.y);
  float d=length(uv); float a=atan(uv.y,uv.x);
  float s1=sin(a*3.+t*.55-d*9.)*.5+.5;
  float s2=sin(a*5.-t*.35+d*7.)*.5+.5;
  float ring=exp(-pow((d-.37)*7.5,2.));
  float inner=exp(-pow((d-.2)*9.,2.));
  float core=exp(-d*d*22.)*(.75+.25*sin(t*1.3));
  vec3 col=c1*(ring*(.25+.75*s1)*.85+core*.9)+c2*(ring*s2*.45+inner*s1*.35);
  float al=clamp(max(max(col.r,col.g),col.b),0.,1.)*smoothstep(.64,.32,d);
  gl_FragColor=vec4(col*al,al);
}`
const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'
const hex3 = (h: string): [number, number, number] => { const m = /^#?([0-9a-f]{6})$/i.exec(h.trim()); const n = m ? parseInt(m[1], 16) : 0xf5a524; return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] }

function LightShader({ className, frozen = false }: { className?: string; frozen?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const frozenRef = useRef(frozen)
  frozenRef.current = frozen
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true, powerPreference: 'low-power' })
    if (!gl) return
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s }
    const prog = gl.createProgram()!
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return
    gl.useProgram(prog)
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const uT = gl.getUniformLocation(prog, 't'), uR = gl.getUniformLocation(prog, 'r'), u1 = gl.getUniformLocation(prog, 'c1'), u2 = gl.getUniformLocation(prog, 'c2')
    const colors = () => { const cs = getComputedStyle(document.documentElement); gl.uniform3fv(u1, hex3(cs.getPropertyValue('--accent') || '#F5A524')); gl.uniform3fv(u2, hex3(cs.getPropertyValue('--accent-2') || '#14B8A6')) }
    const resize = () => { const b = canvas.getBoundingClientRect(); const s = 0.5 * Math.min(window.devicePixelRatio || 1, 2); canvas.width = Math.max(2, Math.round(b.width * s)); canvas.height = Math.max(2, Math.round(b.height * s)); gl.viewport(0, 0, canvas.width, canvas.height); gl.uniform2f(uR, canvas.width, canvas.height) }
    let raf = 0, last = 0, on = true, vis = !document.hidden, clock = 0, prev = 0
    const frame = (now: number) => { gl.uniform1f(uT, now / 1000); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4) }
    // the shader keeps its own clock, which stops while the ring is hovered, so it freezes and resumes without a jump
    const loop = (now: number) => { const dt = prev ? Math.min(now - prev, 100) : 0; prev = now; if (!frozenRef.current) { clock += dt; if (now - last > 33) { last = now; frame(clock + 4000) } } if (on && vis && !resolvedReduceMotion()) raf = requestAnimationFrame(loop) }
    const start = () => { cancelAnimationFrame(raf); prev = 0; if (resolvedReduceMotion()) { frame(4000); return } raf = requestAnimationFrame(loop) }
    colors(); resize(); start()
    const ro = new ResizeObserver(() => { resize(); frame(clock + 4000) }); ro.observe(canvas)
    const io = new IntersectionObserver(([e]) => { on = e.isIntersecting; if (on) start(); else cancelAnimationFrame(raf) }); io.observe(canvas)
    const onVis = () => { vis = !document.hidden; if (vis) start(); else cancelAnimationFrame(raf) }
    document.addEventListener('visibilitychange', onVis)
    const mo = new MutationObserver(() => { colors(); if (resolvedReduceMotion()) frame(4000); start() }); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] })
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); mo.disconnect(); document.removeEventListener('visibilitychange', onVis); gl.getExtension('WEBGL_lose_context')?.loseContext() }
  }, [])
  return <canvas ref={ref} aria-hidden="true" className={cn('pointer-events-none absolute inset-0 size-full', className)} />
}

/* ---------------- arcs (SVG, vector so it stays crisp) ---------------- */
function Arcs() {
  return (
    <svg viewBox="0 0 200 200" className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
      <defs>
        <linearGradient id="hr-g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--accent-glow)" stopOpacity="0" /><stop offset=".6" stopColor="var(--accent)" /><stop offset="1" stopColor="var(--accent-glow)" /></linearGradient>
        <linearGradient id="hr-g2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent-2)" stopOpacity="0" /><stop offset="1" stopColor="var(--accent-2)" /></linearGradient>
      </defs>
      <g className="hr-spin" style={{ ['--dur' as string]: '38s' }}><circle cx="100" cy="100" r="84" fill="none" stroke="var(--accent)" strokeOpacity=".35" strokeWidth=".6" strokeDasharray="1.2 4.2" /></g>
      <g className="hr-spin hr-rev" style={{ ['--dur' as string]: '24s' }}><circle cx="100" cy="100" r="74" fill="none" stroke="var(--accent-2)" strokeOpacity=".4" strokeWidth=".5" strokeDasharray="8 6 1 6" /></g>
      <g className="hr-spin" style={{ ['--dur' as string]: '11s' }}><circle cx="100" cy="100" r="64" fill="none" stroke="url(#hr-g1)" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="70 332" /></g>
      <g className="hr-spin hr-rev" style={{ ['--dur' as string]: '16s' }}><circle cx="100" cy="100" r="56" fill="none" stroke="url(#hr-g2)" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="44 308" /></g>
      <g className="hr-spin" style={{ ['--dur' as string]: '7s' }}><circle cx="100" cy="100" r="46" fill="none" stroke="var(--accent-glow)" strokeOpacity=".7" strokeWidth=".8" strokeLinecap="round" strokeDasharray="18 271" /></g>
      <g className="hr-spin hr-rev" style={{ ['--dur' as string]: '60s' }}>{Array.from({ length: 48 }, (_, i) => { const a = (i / 48) * Math.PI * 2; const long = i % 4 === 0; return <line key={i} x1={100 + Math.cos(a) * (long ? 90 : 91.5)} y1={100 + Math.sin(a) * (long ? 90 : 91.5)} x2={100 + Math.cos(a) * 93} y2={100 + Math.sin(a) * 93} stroke="var(--accent)" strokeOpacity={long ? 0.5 : 0.22} strokeWidth=".5" /> })}</g>
    </svg>
  )
}

/* ---------------- gold rings (CSS, so hover can freeze them) ---------------- */
function Rings() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <div className="gold-halo animate-ring-pulse absolute inset-[9%]" />
      <div className="gold-ring hr-spin absolute inset-[6%]" style={{ ['--ring-w' as string]: '3px', ['--dur' as string]: '14s' }} />
      <div className="gold-ring hr-spin hr-rev absolute inset-0 opacity-50" style={{ ['--ring-w' as string]: '1.5px', ['--dur' as string]: '26s' }} />
      <div className="gold-ring hr-spin absolute inset-[16%] opacity-70" style={{ ['--ring-w' as string]: '1px', ['--dur' as string]: '9s' }} />
      <div className="absolute inset-[22%] rounded-full" style={{ background: 'radial-gradient(circle, color-mix(in oklab, var(--accent-glow) 14%, transparent), transparent 70%)' }} />
    </div>
  )
}

/** A bright head with a fading tail that sweeps part of the ring now and then. */
function Comet({ dur, delay, start }: { dur: number; delay: number; start: number }) {
  return (
    <div className="hr-comet pointer-events-none absolute inset-[6%]" aria-hidden="true" style={{ ['--s' as string]: `${start}deg`, animationDuration: `${dur}s`, animationDelay: `${delay}s` }}>
      <div className="hr-comet-tail absolute inset-0 rounded-full" />
    </div>
  )
}

/* ---------------- light streaming into the core (pure CSS keyframes) ---------------- */
function Stream({ dots }: { dots: { a: number; r: number; d: number; delay: number; s: number; teal: boolean }[] }) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {dots.map((p, i) => (
        <span key={i} className="hr-stream absolute left-1/2 top-1/2 rounded-full" style={{ width: p.s, height: p.s, marginLeft: -p.s / 2, marginTop: -p.s / 2, background: p.teal ? 'var(--accent-2)' : 'var(--accent-glow)', boxShadow: `0 0 6px ${p.teal ? 'var(--accent-2)' : 'var(--accent-glow)'}`, ['--a' as string]: `${p.a}deg`, ['--r' as string]: `${p.r}cqw`, animationDuration: `${p.d}s`, animationDelay: `${p.delay}s` }} />
      ))}
    </div>
  )
}

/* ---------------- format chips ---------------- */
function ChipFace({ label, color, className }: { label: string; color: string; className?: string }) {
  return (
    <span className={cn('hr-face relative inline-grid h-6 min-w-11 place-items-center overflow-hidden rounded-md border bg-surface/90 px-1.5 font-mono text-[10px] font-bold tracking-wide shadow-lg backdrop-blur sm:h-7 sm:text-[11px]', className)} style={{ borderColor: color + '66', color, boxShadow: `0 6px 20px -8px ${color}`, ['--c' as string]: color }}>
      <span key={label} className="hr-flipin">{label}</span>
    </span>
  )
}

function Orbit({ chips, radius, dur, reverse, flipped, phase = 0, item }: { chips: HeroChip[]; radius: number; dur: number; reverse?: boolean; flipped: Set<string>; phase?: number; item: ItemProps }) {
  return (
    <div className={cn('hr-spin pointer-events-none absolute inset-0', reverse && 'hr-rev')} style={{ ['--dur' as string]: `${dur}s` }}>
      {chips.map((c, k) => {
        const a = (k / chips.length) * Math.PI * 2 + phase
        const on = flipped.has(c.f) && !!c.to
        const label = on ? c.to! : c.f
        const info = chipInfo(c, on)
        return (
          <div key={c.f} className="absolute" style={{ left: `${50 + Math.cos(a) * radius}%`, top: `${50 + Math.sin(a) * radius}%`, transform: 'translate(-50%,-50%)' }}>
            <div className={cn('hr-spin', !reverse && 'hr-rev')} style={{ ['--dur' as string]: `${dur}s` }}>
              <div className={`hr-drift hr-drift-${c.drift}`} style={{ animationDuration: `${c.driftDur}s`, animationDelay: `${c.driftDelay}s` }}>
                <Link to={info.href} aria-label={`${label}: ${info.title}`} className="hr-item pointer-events-auto block rounded-lg p-1 outline-none" {...item('chip-' + c.f, () => chipInfo(c, on))}>
                  <ChipFace label={label} color={c.color} />
                </Link>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** One chip at a time flies into the core and comes out the other side converted. CSS keyframes drive it
 *  and animationend advances it, so it freezes with everything else on hover. */
function Flyer({ chips, item }: { chips: HeroChip[]; item: ItemProps }) {
  const [n, setN] = useState(0)
  const [phase, setPhase] = useState<'in' | 'out'>('in')
  const geo = useMemo(() => {
    const a = Math.random() * Math.PI * 2, d = 27 + Math.random() * 9
    return { dx: Math.cos(a) * d, dy: Math.sin(a) * d, din: 1.15 + Math.random() * 0.6, dout: 1.35 + Math.random() * 0.7, rest: 0.4 + Math.random() * 2.2 }
  }, [n])
  if (!chips.length) return null
  const c = chips[n % chips.length]
  const out = phase === 'out' && !!c.to
  const info = chipInfo(c, out)
  const end = (e: React.AnimationEvent) => { if (e.target !== e.currentTarget) return; if (phase === 'in') setPhase('out'); else { setPhase('in'); setN((x) => x + 1) } }
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute left-1/2 top-1/2">
        <Link key={n + phase} to={info.href} aria-label={`${out ? c.to : c.f}: ${info.title}`} tabIndex={-1} onAnimationEnd={end}
          className={cn('hr-item hr-fly pointer-events-auto absolute block outline-none', phase === 'in' ? 'hr-fly-in' : 'hr-fly-out')}
          style={{ ['--dx' as string]: geo.dx, ['--dy' as string]: geo.dy, animationDuration: `${phase === 'in' ? geo.din : geo.dout}s`, animationDelay: phase === 'in' ? `${geo.rest}s` : '0s' }}
          {...item('fly-' + c.f + phase, () => chipInfo(c, out))}>
          <span className="block -translate-x-1/2 -translate-y-1/2 p-1"><ChipFace label={out ? c.to! : c.f} color={c.color} className={out ? 'ring-1 ring-success/50' : undefined} /></span>
        </Link>
        {phase === 'out' && <span key={'flash' + n} className="hr-flash pointer-events-none absolute -ml-12 -mt-12 size-24 rounded-full" style={{ background: `radial-gradient(circle, ${c.color}66, transparent 70%)` }} />}
      </div>
    </div>
  )
}

/* ---------------- category icons ---------------- */
function CategoryIcon({ c, i, n, offset, item }: { c: (typeof CATEGORIES)[number]; i: number; n: number; offset: number; item: ItemProps }) {
  const a = (((i + offset) % n) / n) * Math.PI * 2 - Math.PI / 2
  const I = getIcon(TOOLS.find((t) => t.category === c.id && t.popular)?.icon ?? TOOLS.find((t) => t.category === c.id)?.icon ?? 'FileText')
  const count = TOOLS.filter((t) => t.category === c.id).length
  return (
    <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.45 + i * 0.05 }} className="absolute z-20" style={{ left: `${50 + Math.cos(a) * 47}%`, top: `${50 + Math.sin(a) * 47}%`, x: '-50%', y: '-50%' }}>
      <div className="animate-float" style={{ animationDelay: `${-((i * 1.7) % 6)}s`, animationDuration: `${5 + ((i * 7) % 5) * 0.6}s` }}>
        <Link to={`/category/${c.id}`} aria-label={`${c.name}: ${count} ${count === 1 ? 'tool' : 'tools'}`} {...item('cat-' + c.id, () => categoryInfo(c.id))}
          className="hr-item hr-cat grid size-8 place-items-center rounded-xl border border-border bg-surface/90 shadow-xl outline-none backdrop-blur sm:size-10 sm:rounded-2xl" style={{ color: c.color, boxShadow: `0 10px 30px -12px ${c.color}`, ['--c' as string]: c.color }}>
          <I className="size-4 sm:size-[18px]" />
        </Link>
      </div>
    </motion.div>
  )
}

/* ---------------- the core: live showcase, click to choose a file ---------------- */
function Core({ visit, frozen, inView, reduce, item, onShown }: { visit: ReturnType<typeof planVisit>; frozen: boolean; inView: boolean; reduce: boolean; item: ItemProps; onShown: (slug: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const props = item('core', () => ({ title: 'Drop or choose a file', desc: 'OpenFile looks at the file and suggests the right tools. Nothing is uploaded.', ins: ['Any file'], outs: ['Right tool'], href: '/tools', color: '#F5A524' }))
  return (
    <>
      <button type="button" aria-label="Choose a file and get tool suggestions" {...props}
        onClick={(e) => { props.onClick(e); if (!e.defaultPrevented) input.current?.click() }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); openDropSheet([...e.dataTransfer.files]) }}
        className={cn('hr-item hr-coreb absolute inset-[35%] z-10 cursor-pointer rounded-full outline-none', drag && 'hr-drag')}>
        <Showcase slugs={visit.showcase} paused={frozen} active={inView} reduce={reduce} onChange={onShown} />
        <span className="absolute -bottom-[14%] left-1/2 -translate-x-1/2 drop-shadow-[0_0_18px_color-mix(in_oklab,var(--accent-glow)_60%,transparent)]"><Logo size={30} /></span>
      </button>
      <input ref={input} type="file" multiple hidden tabIndex={-1} aria-hidden="true" onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; openDropSheet(f) }} />
    </>
  )
}

/* ---------------- the ring ---------------- */
export function HeroRing({ className, style }: { className?: string; style?: Record<string, MotionValue<number> | number> }) {
  const reduce = useReducedMotion()
  const [seed] = useState(makeSeed)
  const visit = useMemo(() => planVisit(seed), [seed])
  const root = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  const [inView, setInView] = useState(true)
  const [ringHover, setRingHover] = useState(false)
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const [touch, setTouch] = useState(false)
  const lastPointer = useRef('mouse')
  const [flipped, setFlipped] = useState<Set<string>>(new Set())
  const [shown, setShown] = useState(visit.showcase[0])
  const paused = ringHover || !!hover
  const frozen = paused || !inView

  useEffect(() => {
    const el = root.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.offsetWidth)); ro.observe(el)
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: '40px' }); io.observe(el)
    return () => { ro.disconnect(); io.disconnect() }
  }, [])

  // keyboard users get the card on focus even when their last pointer was a touch
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Tab') lastPointer.current = 'keyboard' }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [])

  // tapping anywhere outside the ring closes a card opened by touch
  useEffect(() => {
    if (!hover) return
    const off = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) { setHover(null); setTouch(false) } }
    document.addEventListener('pointerdown', off)
    return () => document.removeEventListener('pointerdown', off)
  }, [hover])

  // chips briefly convert (PDF to DOCX) and convert back, at uneven intervals, at most two at a time, and only
  // while nothing is hovered and the ring is on screen
  const flipQueue = useRef<string[]>([])
  useEffect(() => {
    if (frozen || reduce) return
    const all = [...visit.outer, ...visit.inner].filter((c) => c.to).map((c) => c.f)
    if (!all.length) return
    let t = 0
    const tick = () => {
      t = window.setTimeout(() => {
        const q = flipQueue.current
        let f: string | undefined
        if (q.length >= 2 || (q.length && Math.random() < 0.55)) f = q.shift()
        else { const free = all.filter((x) => !q.includes(x)); f = free[Math.floor(Math.random() * free.length)]; if (f) q.push(f) }
        if (f) { const k = f; setFlipped((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n }) }
        tick()
      }, 1200 + Math.random() * 1600)
    }
    tick()
    return () => clearTimeout(t)
  }, [frozen, reduce, visit])

  const show = useCallback((key: string, get: InfoGetter, el: HTMLElement) => {
    const r = root.current?.getBoundingClientRect()
    if (!r || !r.width) return
    const target = (el.querySelector('.hr-face, svg, .hr-sc') as HTMLElement | null) ?? el
    const b = target.getBoundingClientRect()
    setHover({ key, ...get(), h: b.height / 2, x: ((b.left + b.width / 2 - r.left) / r.width) * 100, y: ((b.top + b.height / 2 - r.top) / r.height) * 100 })
  }, [])

  const item: ItemProps = (key, get) => ({
    'data-active': hover?.key === key ? true : undefined,
    'aria-describedby': hover?.key === key ? 'hr-card' : undefined,
    onPointerEnter: (e) => { lastPointer.current = e.pointerType; if (e.pointerType === 'mouse') { setTouch(false); show(key, get, e.currentTarget) } },
    onPointerLeave: (e) => { if (e.pointerType === 'mouse') setHover((h) => (h?.key === key ? null : h)) },
    onPointerDown: (e) => { lastPointer.current = e.pointerType },
    onFocus: (e) => { if (lastPointer.current === 'mouse' || lastPointer.current === 'keyboard') show(key, get, e.currentTarget) },
    onBlur: () => { if (lastPointer.current !== 'touch' && lastPointer.current !== 'pen') setHover((h) => (h?.key === key ? null : h)) },
    // touch: the first tap opens the card, the second tap on the same item follows the link
    onClick: (e) => { if ((lastPointer.current === 'touch' || lastPointer.current === 'pen') && hover?.key !== key) { e.preventDefault(); setTouch(true); show(key, get, e.currentTarget) } },
  })

  const shownTool = toolBySlug(shown)
  // the caption names whatever is hovered or focused (a chip, a category, the flying chip) and goes back to the
  // showcase in the core when nothing is
  const caption = hover && hover.key !== 'core' ? { key: hover.key, title: hover.title, href: hover.href } : shownTool ? { key: shownTool.slug, title: shownTool.name, href: '/' + shownTool.slug } : null
  return (
    <motion.div style={style} className={cn('relative mx-auto w-full max-w-[460px]', className)}>
      <div ref={root}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') setRingHover(true) }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') { setRingHover(false); setHover(null) } }}
        onKeyDown={(e) => { if (e.key === 'Escape') { setHover(null); setTouch(false) } }}
        className="hr-root relative aspect-square w-full [container-type:inline-size]">
        <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} className={cn('hr-scene absolute inset-0', frozen && 'hr-paused', hover && 'hr-has-active')}>
          <div className="absolute inset-[-8%]"><LightShader frozen={frozen} /></div>
          <Rings />
          <Arcs />
          {!reduce && <Comet {...visit.comet} />}
          <Stream dots={reduce ? [] : visit.stream} />
          <div className="pointer-events-none absolute inset-[33%] rounded-full hr-core" aria-hidden="true" />
          <Orbit chips={visit.outer} radius={35} dur={visit.orbitOuter} flipped={flipped} phase={visit.phase} item={item} />
          <Orbit chips={visit.inner} radius={24.5} dur={visit.orbitInner} reverse flipped={flipped} phase={visit.phase + Math.PI / 4} item={item} />
          {!reduce && <Flyer chips={visit.flyers} item={item} />}
          <Core visit={visit} frozen={frozen} inView={inView} reduce={reduce} item={item} onShown={setShown} />
          {CATEGORIES.map((c, i) => <CategoryIcon key={c.id} c={c} i={i} n={CATEGORIES.length} offset={visit.catOffset} item={item} />)}
        </motion.div>
        <HoverCard info={hover} ringW={w} reduce={reduce} touch={touch} />
      </div>
      <p className="mt-3 flex h-5 items-center justify-center gap-1.5 text-xs text-muted">
        {caption && <><span className="relative flex size-1.5"><span className="hr-live absolute inline-flex size-full rounded-full bg-accent" /><span className="relative inline-flex size-1.5 rounded-full bg-accent" /></span>
          <span>Now showing</span>
          <Link key={caption.key} to={caption.href} className="hr-caption inline-block max-w-[60vw] truncate font-medium text-fg underline decoration-accent/40 underline-offset-4 transition hover:text-accent hover:decoration-accent focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{caption.title}</Link></>}
      </p>
    </motion.div>
  )
}
