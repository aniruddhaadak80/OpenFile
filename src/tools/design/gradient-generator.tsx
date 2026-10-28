import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Shuffle, Download, Trash2, Plus, Copy, RotateCw, Maximize2 } from 'lucide-react'
import { Button, Card, Label, Segmented, Slider, Switch, Tabs, Textarea, CopyButton, Input, Select, cn } from '@/components/ui'
import { downloadBlob, canvasToBlob } from '@/lib/files'
import { ColorField } from './_design/ColorPicker'
import { parseColor, rgbToHex, hslToRgb } from './_design/color'

type Stop = { id: number; color: string; pos: number }
type Kind = 'linear' | 'radial' | 'conic'
type State = { kind: Kind; angle: number; stops: Stop[]; shape: 'circle' | 'ellipse'; cx: number; cy: number }
let sid = 100
const mk = (colors: string[], kind: Kind = 'linear', angle = 135): State => ({ kind, angle, shape: 'ellipse', cx: 50, cy: 50, stops: colors.map((c, i) => ({ id: sid++, color: c, pos: Math.round((i / (colors.length - 1)) * 100) })) })

const PRESETS: { name: string; s: State }[] = [
  { name: 'Aurora', s: mk(['#00c6ff', '#0072ff']) }, { name: 'Sunset', s: mk(['#ff512f', '#f09819'], 'linear', 90) },
  { name: 'Golden Hour', s: mk(['#f5a524', '#ffb224', '#f97316']) }, { name: 'Mint', s: mk(['#11998e', '#38ef7d']) },
  { name: 'Peach', s: mk(['#ffecd2', '#fcb69f'], 'linear', 180) }, { name: 'Ocean', s: mk(['#0f766e', '#1bffff']) },
  { name: 'Ember', s: mk(['#f97316', '#7c2d12']) }, { name: 'Lush', s: mk(['#56ab2f', '#a8e063'], 'linear', 45) },
  { name: 'Midnight', s: mk(['#0f2027', '#203a43', '#2c5364'], 'linear', 160) }, { name: 'Candy', s: mk(['#fed7aa', '#a6c1ee'], 'linear', 120) },
  { name: 'Fire', s: mk(['#f12711', '#f5af19'], 'radial') }, { name: 'Royal', s: mk(['#141e30', '#243b55'], 'linear', 200) },
  { name: 'Citrus', s: mk(['#fdc830', '#f37335']) }, { name: 'Lagoon', s: mk(['#43cea2', '#185a9d']) },
  { name: 'Cotton', s: mk(['#fad0c4', '#fed7aa']) }, { name: 'Neon', s: mk(['#00f260', '#0575e6'], 'linear', 270) },
  { name: 'Spectrum', s: mk(['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000'], 'conic', 0) },
  { name: 'Dusk', s: mk(['#2c3e50', '#fd746c'], 'linear', 30) }, { name: 'Glow', s: mk(['#fffbd5', '#ef4444'], 'radial') },
  { name: 'Deep Teal', s: mk(['#14b8a6', '#134e4a']) }, { name: 'Sky', s: mk(['#e0eafc', '#cfdef3'], 'linear', 180) },
  { name: 'Mango', s: mk(['#ffe259', '#ffa751'], 'linear', 60) }, { name: 'Pastel Wheel', s: mk(['#fed7aa', '#c7d2fe', '#a7f3d0', '#fde68a', '#fed7aa'], 'conic', 45) },
  { name: 'Emerald Night', s: mk(['#000000', '#0f9b0f'], 'radial') },
]

const sorted = (s: Stop[]) => [...s].sort((a, b) => a.pos - b.pos)
function css(st: State, withPos = true) {
  const stops = sorted(st.stops).map((s) => `${s.color} ${s.pos}%`).join(', ')
  const at = `at ${st.cx}% ${st.cy}%`
  if (st.kind === 'linear') return `linear-gradient(${st.angle}deg, ${stops})`
  if (st.kind === 'radial') return `radial-gradient(${st.shape} ${withPos ? at : 'at 50% 50%'}, ${stops})`
  return `conic-gradient(from ${st.angle}deg ${withPos ? at : 'at 50% 50%'}, ${stops})`
}
function tailwind(st: State) {
  const tw = (c: string) => c.replace(/ /g, '')
  const arb = `bg-[${css(st).replace(/, /g, ',').replace(/ /g, '_')}]`
  const out = [`/* Arbitrary value (Tailwind v3.3+ / v4) */`, arb]
  const s = sorted(st.stops)
  const dirs: Record<number, string> = { 0: 't', 45: 'tr', 90: 'r', 135: 'br', 180: 'b', 225: 'bl', 270: 'l', 315: 'tl' }
  if (st.kind === 'linear' && dirs[st.angle] != null && s.length <= 3) {
    const pos = (p: number) => p
    const parts = [`bg-gradient-to-${dirs[st.angle]}`, `from-[${tw(s[0].color)}]`, s[0].pos ? `from-${pos(s[0].pos)}%` : '']
    if (s.length === 3) parts.push(`via-[${tw(s[1].color)}]`, `via-${s[1].pos}%`)
    parts.push(`to-[${tw(s[s.length - 1].color)}]`, s[s.length - 1].pos !== 100 ? `to-${s[s.length - 1].pos}%` : '')
    out.push('', '/* Gradient utilities (v3; in v4 use bg-linear-to-…) */', parts.filter(Boolean).join(' '))
  }
  if (st.kind === 'linear') out.push('', '/* Tailwind v4 */', `bg-linear-${st.angle} ${s.length <= 3 ? `from-[${tw(s[0].color)}] ${s.length === 3 ? `via-[${tw(s[1].color)}] ` : ''}to-[${tw(s[s.length - 1].color)}]` : ''}`.trim())
  return out.join('\n')
}

export default function GradientGenerator() {
  const [st, setSt] = useState<State>(PRESETS[2].s)
  const [selId, setSelId] = useState(st.stops[0].id)
  const [tab, setTab] = useState<'css' | 'tailwind'>('css')
  const [animate, setAnimate] = useState(false)
  const [speed, setSpeed] = useState(8)
  const [size, setSize] = useState({ w: 1920, h: 1080 })
  const [hist, setHist] = useState<State[]>([])
  const bar = useRef<HTMLDivElement>(null)
  const dragging = useRef<number | null>(null)

  const upd = (p: Partial<State>) => setSt((s) => ({ ...s, ...p }))
  const setStop = (id: number, p: Partial<Stop>) => setSt((s) => ({ ...s, stops: s.stops.map((x) => (x.id === id ? { ...x, ...p } : x)) }))
  const sel = st.stops.find((s) => s.id === selId) ?? st.stops[0]
  const g = css(st)
  const barBg = `linear-gradient(90deg, ${sorted(st.stops).map((s) => `${s.color} ${s.pos}%`).join(', ')})`

  const colorAt = (pos: number) => {
    const s = sorted(st.stops); if (pos <= s[0].pos) return s[0].color; if (pos >= s[s.length - 1].pos) return s[s.length - 1].color
    for (let i = 0; i < s.length - 1; i++) if (pos >= s[i].pos && pos <= s[i + 1].pos) {
      const t = (pos - s[i].pos) / (s[i + 1].pos - s[i].pos || 1); const a = parseColor(s[i].color)!, b = parseColor(s[i + 1].color)!
      return rgbToHex({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t, a: a.a + (b.a - a.a) * t }, true)
    }
    return '#000'
  }
  const posFrom = (clientX: number) => { const r = bar.current!.getBoundingClientRect(); return Math.round(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100))) }
  const onBarDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).dataset.stop) return
    const pos = posFrom(e.clientX); const n: Stop = { id: sid++, color: colorAt(pos), pos }
    setSt((s) => ({ ...s, stops: [...s.stops, n] })); setSelId(n.id); startDrag(n.id)
  }
  const startDrag = (id: number) => {
    dragging.current = id
    const mv = (ev: PointerEvent) => { if (dragging.current != null) setStop(dragging.current, { pos: posFrom(ev.clientX) }) }
    const up = () => { dragging.current = null; window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
  }
  const removeStop = (id: number) => { if (st.stops.length <= 2) return; setSt((s) => ({ ...s, stops: s.stops.filter((x) => x.id !== id) })); setSelId(st.stops.find((x) => x.id !== id)!.id) }
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.key === 'Delete' || e.key === 'Backspace') && (document.activeElement as HTMLElement)?.dataset?.stop) removeStop(selId) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })

  const random = () => {
    setHist((h) => [st, ...h].slice(0, 12))
    const n = 2 + Math.floor(Math.random() * 2), h0 = Math.random() * 360, kinds: Kind[] = ['linear', 'linear', 'linear', 'radial', 'conic']
    const cols = Array.from({ length: n }, (_, i) => rgbToHex(hslToRgb(h0 + i * (40 + Math.random() * 80), 65 + Math.random() * 30, 45 + Math.random() * 25)))
    const kind = kinds[Math.floor(Math.random() * kinds.length)]
    const s = mk(kind === 'conic' ? [...cols, cols[0]] : cols, kind, Math.round(Math.random() * 24) * 15); setSt(s); setSelId(s.stops[0].id)
  }
  const animCss = `.gradient-animated {\n  background: ${css({ ...st, kind: 'linear' })};\n  background-size: 400% 400%;\n  animation: gradient-shift ${speed}s ease infinite;\n}\n\n@keyframes gradient-shift {\n  0% { background-position: 0% 50%; }\n  50% { background-position: 100% 50%; }\n  100% { background-position: 0% 50%; }\n}`
  const code = tab === 'css' ? (animate ? animCss : `background: ${sorted(st.stops)[0].color};\nbackground: ${g};`) : tailwind(st) + (animate ? `\n\n/* Animated: add to your CSS */\n${animCss}` : '')

  const exportPng = async () => {
    const { w, h } = size
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const ctx = c.getContext('2d')!
    const s = sorted(st.stops)
    let grad: CanvasGradient
    const cx = (st.cx / 100) * w, cy = (st.cy / 100) * h
    if (st.kind === 'linear') {
      const a = (st.angle * Math.PI) / 180, len = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a))
      const dx = (Math.sin(a) * len) / 2, dy = (-Math.cos(a) * len) / 2
      grad = ctx.createLinearGradient(w / 2 - dx, h / 2 - dy, w / 2 + dx, h / 2 + dy)
    } else if (st.kind === 'radial') {
      // farthest-corner
      const fx = Math.max(cx, w - cx), fy = Math.max(cy, h - cy)
      if (st.shape === 'circle') grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(fx, fy))
      else { const r = Math.hypot(fx, fy) ; const rx = fx * Math.SQRT2, ry = fy * Math.SQRT2; ctx.setTransform(rx / r, 0, 0, ry / r, cx - (cx * rx) / r, cy - (cy * ry) / r); grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r) }
    } else grad = ctx.createConicGradient(((st.angle - 90) * Math.PI) / 180, cx, cy)
    s.forEach((x) => { const p = parseColor(x.color); grad.addColorStop(x.pos / 100, p ? `rgba(${p.r},${p.g},${p.b},${p.a})` : x.color) })
    ctx.fillStyle = grad
    if (st.kind === 'radial' && st.shape === 'ellipse') { const m = ctx.getTransform().inverse(); const p1 = m.transformPoint({ x: 0, y: 0 }), p2 = m.transformPoint({ x: w, y: h }); ctx.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y) } else ctx.fillRect(0, 0, w, h)
    downloadBlob(await canvasToBlob(c), `gradient-${w}x${h}.png`)
  }

  const [full, setFull] = useState(false)
  return (
    <div className="space-y-6">
      <style>{`@keyframes of-grad-shift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}`}</style>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          <motion.div layout className={cn('relative overflow-hidden rounded-2xl border border-border shadow-xl', full ? 'fixed inset-0 z-50 rounded-none' : 'h-72 sm:h-96')}
            style={animate ? { background: css({ ...st, kind: 'linear' }), backgroundSize: '400% 400%', animation: `of-grad-shift ${speed}s ease infinite` } : { background: g }}>
            {st.kind !== 'linear' && !full && <PosHandle cx={st.cx} cy={st.cy} onChange={(cx, cy) => upd({ cx, cy })} />}
            <button onClick={() => setFull((f) => !f)} className="absolute right-3 top-3 grid size-9 place-items-center rounded-xl bg-black/30 text-white backdrop-blur hover:bg-black/50 cursor-pointer" title="Toggle fullscreen preview"><Maximize2 className="size-4" /></button>
          </motion.div>

          <Card className="space-y-4">
            <div className="flex items-center justify-between"><Label className="mb-0">Colour stops</Label><span className="text-xs text-muted">Click bar to add · drag to move · Del to remove</span></div>
            <div className="px-2">
              <div ref={bar} onPointerDown={onBarDown} className="checker relative h-10 cursor-copy rounded-xl ring-1 ring-border touch-none">
                <div className="absolute inset-0 rounded-xl" style={{ background: barBg }} />
                {st.stops.map((s) => (
                  <button key={s.id} data-stop="1" onPointerDown={(e) => { e.stopPropagation(); setSelId(s.id); startDrag(s.id) }} onDoubleClick={() => removeStop(s.id)}
                    className={cn('absolute top-1/2 h-12 w-5 -translate-x-1/2 -translate-y-1/2 rounded-lg border-[3px] shadow-lg transition-[box-shadow] cursor-grab active:cursor-grabbing', s.id === selId ? 'border-white ring-2 ring-accent' : 'border-white/90')}
                    style={{ left: `${s.pos}%`, background: s.color }} aria-label={`Stop at ${s.pos}%`} />
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto] sm:items-end">
              <ColorField label="Selected stop" value={sel.color} onChange={(c) => setStop(sel.id, { color: c })} />
              <div><Label>Position</Label><Input type="number" min={0} max={100} value={sel.pos} onChange={(e) => setStop(sel.id, { pos: Math.max(0, Math.min(100, +e.target.value)) })} /></div>
              <Button variant="outline" disabled={st.stops.length <= 2} onClick={() => removeStop(sel.id)} icon={<Trash2 className="size-4" />}>Remove</Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {sorted(st.stops).map((s) => (
                <button key={s.id} onClick={() => setSelId(s.id)} className={cn('flex items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-xs cursor-pointer', s.id === selId ? 'border-accent' : 'border-border')}>
                  <span className="size-3.5 rounded" style={{ background: s.color }} />{s.color} · {s.pos}%
                </button>
              ))}
              <button onClick={() => { const s = sorted(st.stops); let gap = 0, at = 50; for (let i = 0; i < s.length - 1; i++) if (s[i + 1].pos - s[i].pos > gap) { gap = s[i + 1].pos - s[i].pos; at = Math.round((s[i].pos + s[i + 1].pos) / 2) } const n = { id: sid++, color: colorAt(at), pos: at }; setSt((x) => ({ ...x, stops: [...x.stops, n] })); setSelId(n.id) }} className="flex items-center gap-1 rounded-lg border border-dashed border-border px-2 py-1 text-xs text-muted hover:text-accent cursor-pointer"><Plus className="size-3.5" />Add stop</button>
              <button onClick={() => setSt((s) => ({ ...s, stops: s.stops.map((x) => ({ ...x, pos: 100 - x.pos })) }))} className="flex items-center gap-1 rounded-lg border border-dashed border-border px-2 py-1 text-xs text-muted hover:text-accent cursor-pointer"><RotateCw className="size-3.5" />Reverse</button>
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between"><h3 className="font-display font-semibold">Presets</h3><span className="text-xs text-muted">{PRESETS.length} curated</span></div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
              {PRESETS.map((p) => (
                <button key={p.name} title={p.name} onClick={() => { setHist((h) => [st, ...h].slice(0, 12)); const s = { ...p.s, stops: p.s.stops.map((x) => ({ ...x, id: sid++ })) }; setSt(s); setSelId(s.stops[0].id) }}
                  className="group flex flex-col gap-1 cursor-pointer">
                  <span className="aspect-square w-full rounded-xl ring-1 ring-border transition group-hover:scale-105 group-hover:shadow-lg" style={{ background: css(p.s, false) }} />
                  <span className="truncate text-[10px] text-muted">{p.name}</span>
                </button>
              ))}
            </div>
            {hist.length > 0 && <>
              <Label className="mt-4">History</Label>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">{hist.map((h, i) => <button key={i} onClick={() => { setSt(h); setSelId(h.stops[0].id) }} className="size-9 shrink-0 rounded-lg ring-1 ring-border cursor-pointer" style={{ background: css(h, false) }} />)}</div>
            </>}
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="space-y-5">
            <div className="flex items-center gap-2">
              <Segmented value={st.kind} onChange={(kind) => upd({ kind })} options={[{ value: 'linear', label: 'Linear' }, { value: 'radial', label: 'Radial' }, { value: 'conic', label: 'Conic' }]} />
              <Button variant="outline" size="sm" onClick={random} icon={<Shuffle className="size-4" />}>Random</Button>
            </div>
            {st.kind !== 'radial' && (
              <div className="flex items-center gap-4">
                <AngleDial value={st.angle} onChange={(angle) => upd({ angle })} />
                <div className="flex-1 space-y-2">
                  <Slider label={st.kind === 'conic' ? 'Start angle' : 'Angle'} value={st.angle} onChange={(angle) => upd({ angle })} min={0} max={359} suffix="°" />
                  <div className="flex flex-wrap gap-1">{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <button key={a} onClick={() => upd({ angle: a })} className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-mono cursor-pointer', st.angle === a ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted hover:text-fg')}>{a}°</button>)}</div>
                </div>
              </div>
            )}
            {st.kind === 'radial' && <div><Label>Shape</Label><Segmented value={st.shape} onChange={(shape) => upd({ shape })} options={['ellipse', 'circle']} /></div>}
            {st.kind !== 'linear' && <div className="grid grid-cols-2 gap-3"><Slider label="Center X" value={st.cx} onChange={(cx) => upd({ cx })} suffix="%" /><Slider label="Center Y" value={st.cy} onChange={(cy) => upd({ cy })} suffix="%" /></div>}
            <div className="space-y-3 rounded-xl border border-border p-3">
              <Switch checked={animate} onChange={setAnimate} label="Animated gradient" />
              {animate && <Slider label="Cycle duration" value={speed} onChange={setSpeed} min={2} max={30} suffix="s" />}
              {animate && st.kind !== 'linear' && <p className="text-[11px] text-muted">Animation uses a linear gradient with a moving background-position.</p>}
            </div>
            <div>
              <Tabs value={tab} onChange={setTab} tabs={[{ value: 'css', label: 'CSS' }, { value: 'tailwind', label: 'Tailwind' }]} />
              <Textarea readOnly value={code} className="mt-3 h-40 text-[12px]" />
              <div className="mt-2"><CopyButton text={code} /></div>
            </div>
            <div className="space-y-2 border-t border-border pt-4">
              <Label>Export PNG</Label>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <Input type="number" min={16} max={8000} value={size.w} onChange={(e) => setSize((s) => ({ ...s, w: Math.max(16, Math.min(8000, +e.target.value || 16)) }))} />
                <span className="text-muted">×</span>
                <Input type="number" min={16} max={8000} value={size.h} onChange={(e) => setSize((s) => ({ ...s, h: Math.max(16, Math.min(8000, +e.target.value || 16)) }))} />
              </div>
              <Select value={`${size.w}x${size.h}`} onChange={(v) => { const [w, h] = v.split('x').map(Number); if (w) setSize({ w, h }) }} options={[{ value: `${size.w}x${size.h}`, label: 'Size presets…' }, { value: '1920x1080', label: 'Full HD 1920×1080' }, { value: '3840x2160', label: '4K 3840×2160' }, { value: '1080x1080', label: 'Instagram 1080×1080' }, { value: '1080x1920', label: 'Phone 1080×1920' }, { value: '1200x630', label: 'OG image 1200×630' }, { value: '1500x500', label: 'X header 1500×500' }, { value: '2560x1440', label: 'QHD 2560×1440' }]} />
              <Button className="w-full" onClick={exportPng} icon={<Download className="size-4" />}>Download PNG</Button>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  )
}

function AngleDial({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const down = (e: React.PointerEvent) => {
    const set = (ev: PointerEvent | React.PointerEvent) => {
      const r = ref.current!.getBoundingClientRect(); const a = (Math.atan2(ev.clientX - (r.left + r.width / 2), -(ev.clientY - (r.top + r.height / 2))) * 180) / Math.PI
      let v = Math.round((a + 360) % 360); if (ev.shiftKey) v = Math.round(v / 15) * 15 % 360; onChange(v)
    }
    set(e)
    const up = () => { window.removeEventListener('pointermove', set); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', set); window.addEventListener('pointerup', up)
  }
  return (
    <div ref={ref} onPointerDown={down} tabIndex={0} onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange((value + (e.shiftKey ? 15 : 1)) % 360); if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange((value - (e.shiftKey ? 15 : 1) + 360) % 360) }}
      className="relative size-20 shrink-0 cursor-pointer rounded-full border-2 border-border bg-surface-2 outline-none focus-visible:ring-2 ring-accent/40 touch-none" title="Drag to rotate (Shift snaps to 15°)">
      <div className="absolute inset-0" style={{ transform: `rotate(${value}deg)` }}>
        <div className="absolute left-1/2 top-1.5 h-[calc(50%-6px)] w-1 -translate-x-1/2 rounded-full bg-gradient-brand" />
        <div className="absolute left-1/2 top-1 size-3 -translate-x-1/2 rounded-full bg-accent ring-2 ring-surface" />
      </div>
      <div className="absolute inset-0 grid place-items-center font-mono text-xs font-semibold">{value}°</div>
    </div>
  )
}

function PosHandle({ cx, cy, onChange }: { cx: number; cy: number; onChange: (x: number, y: number) => void }) {
  const down = (e: React.PointerEvent) => {
    const parent = (e.currentTarget as HTMLElement).parentElement!
    const mv = (ev: PointerEvent) => { const r = parent.getBoundingClientRect(); onChange(Math.round(Math.min(100, Math.max(0, ((ev.clientX - r.left) / r.width) * 100))), Math.round(Math.min(100, Math.max(0, ((ev.clientY - r.top) / r.height) * 100)))) }
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
  }
  return <div onPointerDown={down} title="Drag to move the centre" className="absolute size-6 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-[3px] border-white bg-white/20 shadow-[0_0_0_1px_rgba(0,0,0,.3),0_4px_12px_rgba(0,0,0,.3)] backdrop-blur touch-none" style={{ left: `${cx}%`, top: `${cy}%` }} />
}
