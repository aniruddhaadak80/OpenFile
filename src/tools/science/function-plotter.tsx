import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, RotateCcw } from 'lucide-react'
import { Button, Input, Label, Switch, ToolGrid } from '@/components/ui'
import { canvasToBlob } from '@/lib/files'
import { useLib } from '@/tools/dev/_b5/shell'
import { DlButton, pal } from '@/lib/bcat/kit'

interface Fn { expr: string; on: boolean }
interface View { x0: number; x1: number; y0: number; y1: number }
const START: View = { x0: -10, x1: 10, y0: -6, y1: 6 }
const step = (span: number) => { const r = span / 8, p = 10 ** Math.floor(Math.log10(r)), m = r / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p }
const fmt = (v: number) => (Math.abs(v) < 1e-9 ? '0' : Math.abs(v) >= 1e5 || Math.abs(v) < 1e-3 ? v.toExponential(1) : (+v.toPrecision(4)).toString())

export default function FunctionPlotter() {
  const math = useLib('mathjs', () => import('mathjs'))
  const [fns, setFns] = useState<Fn[]>([{ expr: 'sin(x)', on: true }, { expr: 'x^2 / 8 - 2', on: true }])
  const [deriv, setDeriv] = useState(false)
  const [view, setView] = useState<View>(START)
  const [hover, setHover] = useState<{ x: number; px: number } | null>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ x: number; y: number; v: View } | null>(null)

  const compiled = useMemo(() => {
    if (!math) return []
    return fns.map((f) => {
      try {
        const node = math.parse(f.expr.replace(/^\s*y\s*=|^\s*f\(x\)\s*=/i, ''))
        const c = node.compile(), d = deriv ? math.derivative(node, 'x').compile() : null
        const ev = (cc: any) => (x: number) => { try { const v = cc.evaluate({ x, e: Math.E, pi: Math.PI }); return typeof v === 'number' ? v : NaN } catch { return NaN } }
        ev(c)(1)
        return { f: ev(c), d: d ? ev(d) : null, err: null as string | null }
      } catch (e: any) { return { f: null, d: null, err: e.message as string } }
    })
  }, [math, fns, deriv])

  const roots = useMemo(() => compiled.map((c, i) => {
    if (!c.f || !fns[i].on) return []
    const out: number[] = [], N = 2000
    let px = view.x0, py = c.f(px)
    for (let k = 1; k <= N; k++) {
      const x = view.x0 + ((view.x1 - view.x0) * k) / N, y = c.f(x)
      if (isFinite(py) && isFinite(y) && (py === 0 || py * y < 0) && Math.abs(y - py) < (view.y1 - view.y0)) { let a = px, b = x; for (let it = 0; it < 40; it++) { const m = (a + b) / 2; if (c.f(a) * c.f(m) <= 0) b = m; else a = m } out.push((a + b) / 2) }
      px = x; py = y
      if (out.length > 12) break
    }
    return out
  }), [compiled, view, fns])

  const draw = (c: HTMLCanvasElement, W: number, H: number, dpr: number, bg?: string) => {
    c.width = W * dpr; c.height = H * dpr
    const ctx = c.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H) } else ctx.clearRect(0, 0, W, H)
    const X = (x: number) => ((x - view.x0) / (view.x1 - view.x0)) * W, Y = (y: number) => H - ((y - view.y0) / (view.y1 - view.y0)) * H
    const sx = step(view.x1 - view.x0), sy = step(view.y1 - view.y0)
    ctx.font = '11px system-ui, sans-serif'; ctx.lineWidth = 1
    for (let x = Math.ceil(view.x0 / sx) * sx; x <= view.x1; x += sx) { ctx.strokeStyle = 'rgba(128,128,128,.18)'; ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), H); ctx.stroke(); ctx.fillStyle = 'rgba(150,150,150,.9)'; ctx.fillText(fmt(x), X(x) + 3, Math.min(H - 4, Math.max(12, Y(0) + 13))) }
    for (let y = Math.ceil(view.y0 / sy) * sy; y <= view.y1; y += sy) { ctx.strokeStyle = 'rgba(128,128,128,.18)'; ctx.beginPath(); ctx.moveTo(0, Y(y)); ctx.lineTo(W, Y(y)); ctx.stroke(); if (Math.abs(y) > 1e-12) { ctx.fillStyle = 'rgba(150,150,150,.9)'; ctx.fillText(fmt(y), Math.min(W - 40, Math.max(3, X(0) + 4)), Y(y) - 3) } }
    ctx.strokeStyle = 'rgba(160,160,160,.7)'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(W, Y(0)); ctx.moveTo(X(0), 0); ctx.lineTo(X(0), H); ctx.stroke()
    const plot = (f: (x: number) => number, color: string, dash: number[]) => {
      ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.setLineDash(dash); ctx.beginPath()
      let pen = false, prev = NaN
      for (let px = 0; px <= W; px += 0.5) {
        const y = f(view.x0 + (px / W) * (view.x1 - view.x0)), py = Y(y)
        if (!isFinite(y) || Math.abs(py - prev) > H * 2) { pen = false; prev = py; continue }
        if (pen) ctx.lineTo(px, py); else { ctx.moveTo(px, py); pen = true }
        prev = py
      }
      ctx.stroke(); ctx.setLineDash([])
    }
    compiled.forEach((cc, i) => { if (cc.f && fns[i].on) { plot(cc.f, pal(i), []); if (cc.d) plot(cc.d, pal(i), [6, 5]) } })
    roots.forEach((rs, i) => rs.forEach((r) => { ctx.fillStyle = pal(i); ctx.beginPath(); ctx.arc(X(r), Y(0), 3.5, 0, 7); ctx.fill() }))
  }
  useEffect(() => { const c = cv.current; if (c) draw(c, c.clientWidth || 800, 460, window.devicePixelRatio || 1) }, [compiled, view, roots])

  const zoom = (f: number, cx = (view.x0 + view.x1) / 2, cy = (view.y0 + view.y1) / 2) => setView((v) => ({ x0: cx + (v.x0 - cx) * f, x1: cx + (v.x1 - cx) * f, y0: cy + (v.y0 - cy) * f, y1: cy + (v.y1 - cy) * f }))
  const svg = () => {
    const W = 1200, H = 700, X = (x: number) => ((x - view.x0) / (view.x1 - view.x0)) * W, Y = (y: number) => H - ((y - view.y0) / (view.y1 - view.y0)) * H
    const paths = compiled.flatMap((cc, i) => (cc.f && fns[i].on ? [{ f: cc.f, c: pal(i), d: false }, ...(cc.d ? [{ f: cc.d, c: pal(i), d: true }] : [])] : [])).map((p) => {
      let d = '', pen = false
      for (let px = 0; px <= W; px += 1) { const y = p.f(view.x0 + (px / W) * (view.x1 - view.x0)); if (!isFinite(y) || Math.abs(Y(y)) > H * 3) { pen = false; continue } d += `${pen ? 'L' : 'M'}${px} ${Y(y).toFixed(2)}`; pen = true }
      return `<path d="${d}" fill="none" stroke="${p.c}" stroke-width="2.5"${p.d ? ' stroke-dasharray="8 6"' : ''}/>`
    })
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#0a0a0a"/><path d="M0 ${Y(0)}H${W}M${X(0)} 0V${H}" stroke="#777" stroke-width="1.5"/>${paths.join('')}</svg>`
  }
  const hv = hover ? compiled.map((cc, i) => (cc.f && fns[i].on ? { i, y: cc.f(hover.x) } : null)).filter(Boolean) as { i: number; y: number }[] : []

  return (
    <ToolGrid
      main={
        <div className="space-y-2">
          <div className="relative">
            <canvas ref={cv} className="h-[460px] w-full touch-none rounded-2xl border border-border bg-surface cursor-grab active:cursor-grabbing" aria-label="Function graph"
              onWheel={(e) => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, view.x0 + ((e.clientX - r.left) / r.width) * (view.x1 - view.x0), view.y1 - ((e.clientY - r.top) / r.height) * (view.y1 - view.y0)) }}
              onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, v: view } }}
              onPointerUp={() => { drag.current = null }}
              onPointerLeave={() => setHover(null)}
              onPointerMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                if (drag.current) { const d = drag.current, dx = ((e.clientX - d.x) / r.width) * (d.v.x1 - d.v.x0), dy = ((e.clientY - d.y) / r.height) * (d.v.y1 - d.v.y0); setView({ x0: d.v.x0 - dx, x1: d.v.x1 - dx, y0: d.v.y0 + dy, y1: d.v.y1 + dy }) }
                else setHover({ x: view.x0 + ((e.clientX - r.left) / r.width) * (view.x1 - view.x0), px: e.clientX - r.left })
              }} />
            {hover && hv.length > 0 && <div className="pointer-events-none absolute top-2 rounded-lg border border-border bg-surface/95 px-2 py-1 font-mono text-[11px]" style={{ left: Math.min(hover.px + 12, 600) }}><div>x = {fmt(hover.x)}</div>{hv.map((h) => <div key={h.i} style={{ color: pal(h.i) }}>f{h.i + 1} = {isFinite(h.y) ? fmt(h.y) : 'undefined'}</div>)}</div>}
          </div>
          <p className="text-xs text-muted">Drag to move, scroll to zoom. Dots mark where a curve crosses the x axis.</p>
        </div>
      }
      side={
        <>
          <Label>Functions of x</Label>
          {fns.map((f, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-2">
                <button type="button" aria-label={f.on ? 'Hide' : 'Show'} onClick={() => setFns((p) => p.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} className="size-4 shrink-0 rounded-full border-2 cursor-pointer" style={{ borderColor: pal(i), background: f.on ? pal(i) : 'transparent' }} />
                <Input value={f.expr} onChange={(e) => setFns((p) => p.map((x, j) => (j === i ? { ...x, expr: e.target.value } : x)))} className="font-mono" aria-label={`Function ${i + 1}`} />
                <Button variant="ghost" size="sm" aria-label="Remove" onClick={() => setFns((p) => p.filter((_, j) => j !== i))} icon={<Trash2 className="size-4" />} />
              </div>
              {compiled[i]?.err && <p className="text-[11px] text-danger">{compiled[i].err}</p>}
              {roots[i]?.length > 0 && <p className="text-[11px] text-muted">Zeros: {roots[i].slice(0, 6).map((r) => fmt(r)).join(', ')}{roots[i].length > 6 ? '...' : ''}</p>}
            </div>
          ))}
          <Button variant="outline" size="sm" icon={<Plus className="size-4" />} disabled={fns.length >= 8} onClick={() => setFns((p) => [...p, { expr: 'cos(x)', on: true }])}>Add function</Button>
          <Switch checked={deriv} onChange={setDeriv} label="Show derivatives (dashed)" />
          <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => zoom(1 / 1.5)}>Zoom in</Button><Button variant="outline" size="sm" onClick={() => zoom(1.5)}>Zoom out</Button><Button variant="ghost" size="sm" icon={<RotateCcw className="size-4" />} onClick={() => setView(START)}>Reset</Button></div>
          <div className="flex flex-wrap gap-2">
            <DlButton variant="primary" name="graph.png" data={() => { const c = document.createElement('canvas'); draw(c, 1600, 920, 1, '#0a0a0a'); return canvasToBlob(c, 'image/png') }}>PNG</DlButton>
            <DlButton name="graph.svg" mime="image/svg+xml" data={svg}>SVG</DlButton>
          </div>
          <p className="text-xs text-muted">Use x as the variable. Functions: sin, cos, tan, sqrt, abs, log (natural), log10, exp, floor, and constants pi and e.</p>
        </>
      }
    />
  )
}
