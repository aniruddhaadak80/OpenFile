import { useEffect, useRef, useState } from 'react'
import { Pipette } from 'lucide-react'
import { RGBA, rgbToHsv, hsvToRgb, rgbToHex, parseColor } from './color'
import { cn } from '@/components/ui'

/** Saturation/value square + hue + alpha sliders. Controlled by an RGBA value. */
export function ColorPicker({ value, onChange, alpha = true, className }: { value: RGBA; onChange: (c: RGBA) => void; alpha?: boolean; className?: string }) {
  const [hsv, setHsv] = useState(() => rgbToHsv(value))
  const last = useRef(value)
  // sync external changes (keep hue when grey)
  useEffect(() => {
    const l = last.current
    if (Math.round(l.r) === Math.round(value.r) && Math.round(l.g) === Math.round(value.g) && Math.round(l.b) === Math.round(value.b)) return
    const n = rgbToHsv(value)
    setHsv((o) => ({ h: n.s < 1 || n.v < 1 ? o.h : n.h, s: n.v < 1 ? o.s : n.s, v: n.v }))
    last.current = value
  }, [value])
  const emit = (h: number, s: number, v: number, a = value.a) => { setHsv({ h, s, v }); const c = hsvToRgb(h, s, v, a); last.current = c; onChange(c) }

  const sv = useRef<HTMLDivElement>(null)
  const drag = (e: React.PointerEvent, el: HTMLElement | null, fn: (x: number, y: number) => void) => {
    if (!el) return
    const move = (ev: PointerEvent | React.PointerEvent) => { const r = el.getBoundingClientRect(); fn(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))) }
    move(e)
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const hueEl = useRef<HTMLDivElement>(null), aEl = useRef<HTMLDivElement>(null)
  const solid = rgbToHex({ ...value, a: 1 })
  const key = (e: React.KeyboardEvent, axis: 'sv' | 'h' | 'a') => {
    const d = e.shiftKey ? 10 : 1
    const k = e.key
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) return
    e.preventDefault()
    const dx = k === 'ArrowRight' ? d : k === 'ArrowLeft' ? -d : 0, dy = k === 'ArrowUp' ? d : k === 'ArrowDown' ? -d : 0
    if (axis === 'sv') emit(hsv.h, Math.min(100, Math.max(0, hsv.s + dx)), Math.min(100, Math.max(0, hsv.v + dy)))
    if (axis === 'h') emit((hsv.h + (dx || dy) * 3.6 + 360) % 360, hsv.s, hsv.v)
    if (axis === 'a') emit(hsv.h, hsv.s, hsv.v, Math.min(1, Math.max(0, value.a + (dx || dy) / 100)))
  }
  const eyedrop = async () => {
    const ED = (window as any).EyeDropper
    if (!ED) return
    try { const r = await new ED().open(); const c = parseColor(r.sRGBHex); if (c) { onChange({ ...c, a: value.a }) } } catch {}
  }
  return (
    <div className={cn('space-y-3 select-none', className)}>
      <div ref={sv} tabIndex={0} onKeyDown={(e) => key(e, 'sv')} onPointerDown={(e) => drag(e, sv.current, (x, y) => emit(hsv.h, x * 100, (1 - y) * 100))}
        className="relative h-44 w-full cursor-crosshair rounded-xl outline-none ring-accent/40 focus-visible:ring-2 touch-none"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))` }}>
        <div className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.4),0_2px_6px_rgba(0,0,0,.4)]" style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%`, background: solid }} />
      </div>
      <div className="flex items-center gap-3">
        {'EyeDropper' in window && <button type="button" onClick={eyedrop} title="Pick from screen" className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-surface-2 text-muted hover:text-accent cursor-pointer"><Pipette className="size-4" /></button>}
        <div className="flex-1 space-y-2.5">
          <div ref={hueEl} tabIndex={0} onKeyDown={(e) => key(e, 'h')} onPointerDown={(e) => drag(e, hueEl.current, (x) => emit(x * 360, hsv.s, hsv.v))} className="relative h-3 cursor-pointer rounded-full outline-none focus-visible:ring-2 ring-accent/40 touch-none" style={{ background: 'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)' }}>
            <div className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow" style={{ left: `${(hsv.h / 360) * 100}%`, background: `hsl(${hsv.h} 100% 50%)` }} />
          </div>
          {alpha && <div ref={aEl} tabIndex={0} onKeyDown={(e) => key(e, 'a')} onPointerDown={(e) => drag(e, aEl.current, (x) => emit(hsv.h, hsv.s, hsv.v, Math.round(x * 100) / 100))} className="checker relative h-3 cursor-pointer rounded-full outline-none focus-visible:ring-2 ring-accent/40 touch-none">
            <div className="absolute inset-0 rounded-full" style={{ background: `linear-gradient(to right, transparent, ${solid})` }} />
            <div className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow" style={{ left: `${value.a * 100}%`, background: solid }} />
          </div>}
        </div>
      </div>
    </div>
  )
}

/** Compact swatch button + hex input that opens a popover picker */
export function ColorField({ value, onChange, alpha = true, label }: { value: string; onChange: (hex: string) => void; alpha?: boolean; label?: string }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('pointerdown', h); return () => window.removeEventListener('pointerdown', h)
  }, [open])
  const c = parseColor(value) ?? { r: 0, g: 0, b: 0, a: 1 }
  return (
    <div ref={ref} className="relative">
      {label && <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">{label}</div>}
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2/60 p-1 pr-2 focus-within:border-accent">
        <button type="button" aria-label="Pick colour" onClick={() => setOpen((o) => !o)} className="checker relative size-8 shrink-0 overflow-hidden rounded-lg ring-1 ring-border cursor-pointer"><span className="absolute inset-0" style={{ background: value }} /></button>
        <input value={text} onChange={(e) => { setText(e.target.value); const p = parseColor(e.target.value); if (p) onChange(rgbToHex(p, alpha)) }} onBlur={() => setText(value)} className="w-full min-w-0 bg-transparent font-mono text-sm outline-none" spellCheck={false} />
      </div>
      {open && <div className="absolute left-0 top-full z-30 mt-2 w-64 rounded-2xl border border-border bg-surface p-3 shadow-2xl">
        <ColorPicker value={c} alpha={alpha} onChange={(n) => onChange(rgbToHex(n, alpha))} />
      </div>}
    </div>
  )
}
