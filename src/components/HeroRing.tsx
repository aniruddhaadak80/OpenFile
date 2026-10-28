// The Home hero centrepiece: the gold ring, filled with motion.
// Layers (back to front): a tiny WebGL light shader, the GoldRing, dashed and gradient arcs spinning at
// different speeds, light particles streaming into the core, a pulsing core glow with the logo, file-type
// chips drifting on two orbits and morphing into their converted format, one chip flying into the core and
// coming out converted, and the category icons with tooltips. The whole thing tilts with the cursor.
// Everything animates transform and opacity only, pauses off screen and freezes for reduced motion.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'framer-motion'
import { CATEGORIES, TOOLS } from '@/tools/registry'
import { useReducedMotion } from '@/lib/store'
import { resolvedReduceMotion } from '@/lib/prefs'
import { GoldRing } from './motion'
import { Logo } from './Logo'
import { getIcon } from './icons'
import { cn } from './ui'

const PAIRS: [string, string, string][] = [
  ['PDF', 'DOCX', '#F5A524'], ['JPG', 'WEBP', '#10B981'], ['MP4', 'GIF', '#38BDF8'], ['MP3', 'WAV', '#14B8A6'],
  ['ZIP', '7Z', '#A3A3A3'], ['GLB', 'STL', '#2DD4BF'], ['SVG', 'PNG', '#22D3EE'], ['EPUB', 'PDF', '#FB923C'],
]

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

function LightShader({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
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
    let raf = 0, last = 0, on = true, vis = !document.hidden
    const frame = (now: number) => { gl.uniform1f(uT, now / 1000); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4) }
    const loop = (now: number) => { if (now - last > 33) { last = now; frame(now) } if (on && vis && !resolvedReduceMotion()) raf = requestAnimationFrame(loop) }
    const start = () => { cancelAnimationFrame(raf); if (resolvedReduceMotion()) { frame(4000); return } raf = requestAnimationFrame(loop) }
    colors(); resize(); start()
    const ro = new ResizeObserver(() => { resize(); frame(performance.now()) }); ro.observe(canvas)
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

/* ---------------- light streaming into the core (pure CSS keyframes) ---------------- */
function Stream({ n = 22 }: { n?: number }) {
  const dots = useMemo(() => Array.from({ length: n }, (_, i) => ({ a: (i / n) * 360 + Math.random() * 12, r: 36 + Math.random() * 12, d: 2.6 + Math.random() * 2.2, delay: -Math.random() * 4, s: 2 + Math.random() * 2.5, teal: i % 3 === 0 })), [n])
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {dots.map((p, i) => (
        <span key={i} className="hr-stream absolute left-1/2 top-1/2 rounded-full" style={{ width: p.s, height: p.s, marginLeft: -p.s / 2, marginTop: -p.s / 2, background: p.teal ? 'var(--accent-2)' : 'var(--accent-glow)', boxShadow: `0 0 6px ${p.teal ? 'var(--accent-2)' : 'var(--accent-glow)'}`, ['--a' as string]: `${p.a}deg`, ['--r' as string]: `${p.r}cqw`, animationDuration: `${p.d}s`, animationDelay: `${p.delay}s` }} />
      ))}
    </div>
  )
}

/* ---------------- orbiting file chips that morph ---------------- */
function Chip({ label, color, className }: { label: string; color: string; className?: string }) {
  return (
    <span className={cn('relative inline-grid h-6 min-w-11 place-items-center overflow-hidden rounded-md border bg-surface/90 px-1.5 font-mono text-[10px] font-bold tracking-wide shadow-lg backdrop-blur sm:h-7 sm:text-[11px]', className)} style={{ borderColor: color + '66', color, boxShadow: `0 6px 20px -8px ${color}` }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={label} initial={{ y: 10, opacity: 0, filter: 'blur(2px)' }} animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }} exit={{ y: -10, opacity: 0 }} transition={{ duration: 0.35 }}>{label}</motion.span>
      </AnimatePresence>
    </span>
  )
}

function Orbit({ items, radius, dur, reverse, flipped, phase = 0 }: { items: number[]; radius: number; dur: number; reverse?: boolean; flipped: Set<number>; phase?: number }) {
  return (
    <div className={cn('hr-spin pointer-events-none absolute inset-0', reverse && 'hr-rev')} style={{ ['--dur' as string]: `${dur}s` }} aria-hidden="true">
      {items.map((idx, k) => {
        const a = (k / items.length) * Math.PI * 2 + phase
        const [from, to, color] = PAIRS[idx]
        return (
          <div key={idx} className="absolute" style={{ left: `${50 + Math.cos(a) * radius}%`, top: `${50 + Math.sin(a) * radius}%`, transform: 'translate(-50%,-50%)' }}>
            <div className={cn('hr-spin', !reverse && 'hr-rev')} style={{ ['--dur' as string]: `${dur}s` }}><Chip label={flipped.has(idx) ? to : from} color={color} /></div>
          </div>
        )
      })}
    </div>
  )
}

/** One chip at a time flies into the core and comes out the other side converted. */
function Flyer({ reduce }: { reduce: boolean }) {
  const [i, setI] = useState(0)
  const [phase, setPhase] = useState<'in' | 'out'>('in')
  useEffect(() => {
    if (reduce) return
    const t = setTimeout(() => { if (phase === 'in') setPhase('out'); else { setPhase('in'); setI((x) => (x + 1) % PAIRS.length) } }, phase === 'in' ? 1500 : 1700)
    return () => clearTimeout(t)
  }, [phase, reduce])
  if (reduce) return null
  const [from, to, color] = PAIRS[i]
  const a = (i / PAIRS.length) * Math.PI * 2 - Math.PI / 3
  const dx = Math.cos(a) * 30, dy = Math.sin(a) * 30
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden="true">
      <AnimatePresence mode="wait">
        {phase === 'in' ? (
          <motion.div key={'in' + i} className="absolute left-1/2 top-1/2"
            initial={{ x: `${dx}cqw`, y: `${dy}cqw`, scale: 1, opacity: 0 }} animate={{ x: ['' + dx + 'cqw', '0cqw'], y: ['' + dy + 'cqw', '0cqw'], scale: [1, 0.35], opacity: [0, 1, 1, 0] }} transition={{ duration: 1.4, ease: [0.6, 0, 0.8, 0.4] }}>
            <div className="-translate-x-1/2 -translate-y-1/2"><Chip label={from} color={color} /></div>
          </motion.div>
        ) : (
          <motion.div key={'out' + i} className="absolute left-1/2 top-1/2"
            initial={{ x: '0cqw', y: '0cqw', scale: 0.35, opacity: 0 }} animate={{ x: ['0cqw', '' + -dx + 'cqw'], y: ['0cqw', '' + -dy + 'cqw'], scale: [0.35, 1.08, 1], opacity: [0, 1, 1, 0] }} transition={{ duration: 1.6, ease: [0.2, 0.6, 0.3, 1] }}>
            <div className="-translate-x-1/2 -translate-y-1/2"><Chip label={to} color={color} className="ring-1 ring-success/50" /></div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{phase === 'out' && <motion.span key={'flash' + i} className="absolute size-24 rounded-full" style={{ background: `radial-gradient(circle, ${color}66, transparent 70%)` }} initial={{ scale: 0.4, opacity: 0.9 }} animate={{ scale: 1.6, opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.7 }} />}</AnimatePresence>
    </div>
  )
}

/* ---------------- category icons with tooltips ---------------- */
function CategoryIcon({ c, i, n }: { c: (typeof CATEGORIES)[number]; i: number; n: number }) {
  const a = (i / n) * Math.PI * 2 - Math.PI / 2
  const I = getIcon(TOOLS.find((t) => t.category === c.id)?.icon ?? 'FileText')
  const count = TOOLS.filter((t) => t.category === c.id).length
  const below = Math.sin(a) < -0.3
  return (
    <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 + i * 0.07 }} className="group absolute z-20" style={{ left: `${50 + Math.cos(a) * 47}%`, top: `${50 + Math.sin(a) * 47}%`, x: '-50%', y: '-50%' }}>
      <Link to={`/category/${c.id}`} aria-label={`${c.name}: ${count} ${count === 1 ? 'tool' : 'tools'}`} className="animate-float grid size-10 place-items-center rounded-2xl border border-border bg-surface/90 shadow-xl backdrop-blur transition hover:scale-110 focus-visible:scale-110 sm:size-11" style={{ color: c.color, animationDelay: `${i * 0.6}s`, boxShadow: `0 10px 30px -12px ${c.color}` }}><I className="size-[18px] sm:size-5" /></Link>
      <span role="tooltip" className={cn('pointer-events-none absolute left-1/2 z-30 w-max max-w-44 -translate-x-1/2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-center text-xs opacity-0 shadow-xl transition duration-200 group-hover:opacity-100 group-focus-within:opacity-100', below ? 'top-full mt-2 -translate-y-1 group-hover:translate-y-0' : 'bottom-full mb-2 translate-y-1 group-hover:translate-y-0')}>
        <span className="block font-semibold" style={{ color: c.color }}>{c.name}</span><span className="text-muted">{count} {count === 1 ? 'tool' : 'tools'}, open category</span>
      </span>
    </motion.div>
  )
}

/* ---------------- the ring ---------------- */
export function HeroRing({ className, style }: { className?: string; style?: Record<string, MotionValue<number> | number> }) {
  const reduce = useReducedMotion()
  const mx = useMotionValue(0), my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 120, damping: 18 }), sy = useSpring(my, { stiffness: 120, damping: 18 })
  const rotX = useTransform(sy, (v) => v * -10), rotY = useTransform(sx, (v) => v * 12)
  const near = { x: useTransform(sx, (v) => v * 14), y: useTransform(sy, (v) => v * 14) }
  const far = { x: useTransform(sx, (v) => v * -10), y: useTransform(sy, (v) => v * -10) }
  const [flipped, setFlipped] = useState<Set<number>>(new Set())
  useEffect(() => {
    if (reduce) return
    let k = 0
    const t = setInterval(() => { k = (k + 3) % PAIRS.length; setFlipped((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n }) }, 1400)
    return () => clearInterval(t)
  }, [reduce])
  const orbit = CATEGORIES.slice(0, 10)
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType !== 'mouse') return
    const r = e.currentTarget.getBoundingClientRect()
    mx.set((e.clientX - r.left) / r.width - 0.5); my.set((e.clientY - r.top) / r.height - 0.5)
  }
  return (
    <motion.div style={style} className={cn('relative mx-auto w-full max-w-[460px]', className)}>
      <div onPointerMove={move} onPointerLeave={() => { mx.set(0); my.set(0) }} style={{ perspective: 1000 }}>
        <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} style={{ rotateX: rotX, rotateY: rotY, transformStyle: 'preserve-3d' }} className="hr-root relative aspect-square w-full [container-type:inline-size]">
          <motion.div style={far} className="absolute inset-[-8%]"><LightShader /></motion.div>
          <div className="absolute inset-0 grid place-items-center"><GoldRing size={460} /></div>
          <motion.div style={far} className="absolute inset-0"><Arcs /></motion.div>
          <Stream n={reduce ? 0 : 22} />
          <div className="pointer-events-none absolute inset-[36%] rounded-full hr-core" aria-hidden="true" />
          <motion.div style={near} className="absolute inset-0">
            <Orbit items={[0, 2, 4, 6]} radius={33} dur={46} flipped={flipped} />
            <Orbit items={[1, 3, 5, 7]} radius={22} dur={34} reverse flipped={flipped} phase={Math.PI / 4} />
          </motion.div>
          <Flyer reduce={reduce} />
          <div className="absolute inset-0 grid place-items-center">
            <motion.div initial={{ rotate: -10, scale: 0.7 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 14, delay: 0.3 }} className="relative z-10 drop-shadow-[0_0_24px_color-mix(in_oklab,var(--accent-glow)_55%,transparent)]"><Logo size={88} /></motion.div>
          </div>
          {orbit.map((c, i) => <CategoryIcon key={c.id} c={c} i={i} n={orbit.length} />)}
        </motion.div>
      </div>
    </motion.div>
  )
}
