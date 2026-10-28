import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Plus, Shuffle, Move } from 'lucide-react'
import { Button, ErrorNote, Field, Input, Label, Segmented, Select, Slider, ToolGrid, cn, useJob } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { ColorInput, ImageDrop, ThumbGrid, canvas, decode, exportCanvas, rrect, useImageList } from './_img/kit'

type Cell = [number, number, number, number]
const T = (name: string, cells: Cell[]) => ({ name, cells })
const g = (c: number, r: number): Cell[] => Array.from({ length: c * r }, (_, i) => [(i % c) / c, Math.floor(i / c) / r, 1 / c, 1 / r])
const TEMPLATES = [
  T('2 · Side by side', g(2, 1)), T('2 · Stacked', g(1, 2)),
  T('3 · Feature left', [[0, 0, 0.6, 1], [0.6, 0, 0.4, 0.5], [0.6, 0.5, 0.4, 0.5]]), T('3 · Columns', g(3, 1)),
  T('4 · Grid', g(2, 2)), T('4 · Hero top', [[0, 0, 1, 0.6], [0, 0.6, 1 / 3, 0.4], [1 / 3, 0.6, 1 / 3, 0.4], [2 / 3, 0.6, 1 / 3, 0.4]]),
  T('5 · Two over three', [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 1 / 3, 0.5], [1 / 3, 0.5, 1 / 3, 0.5], [2 / 3, 0.5, 1 / 3, 0.5]]),
  T('6 · Grid 3×2', g(3, 2)),
  T('6 · Feature corner', [[0, 0, 2 / 3, 2 / 3], [2 / 3, 0, 1 / 3, 1 / 3], [2 / 3, 1 / 3, 1 / 3, 1 / 3], [0, 2 / 3, 1 / 3, 1 / 3], [1 / 3, 2 / 3, 1 / 3, 1 / 3], [2 / 3, 2 / 3, 1 / 3, 1 / 3]]),
  T('7 · Center stage', [[0, 0, 0.25, 1 / 3], [0, 1 / 3, 0.25, 1 / 3], [0, 2 / 3, 0.25, 1 / 3], [0.25, 0, 0.5, 1], [0.75, 0, 0.25, 1 / 3], [0.75, 1 / 3, 0.25, 1 / 3], [0.75, 2 / 3, 0.25, 1 / 3]]),
  T('8 · Grid 4×2', g(4, 2)), T('9 · Grid 3×3', g(3, 3)),
]
const SIZES = [
  { id: 'sq', label: 'Square 2048×2048', w: 2048, h: 2048 }, { id: 'igp', label: 'Instagram portrait 1080×1350', w: 1080, h: 1350 },
  { id: 'story', label: 'Story 1080×1920', w: 1080, h: 1920 }, { id: 'land', label: 'Landscape 1920×1080', w: 1920, h: 1080 },
  { id: 'fb', label: 'Facebook post 1200×630', w: 1200, h: 630 }, { id: 'a4', label: 'A4 print 2480×3508', w: 2480, h: 3508 }, { id: 'custom', label: 'Custom…', w: 0, h: 0 },
]

function rectFor(c: Cell, W: number, H: number, s: number) {
  const [x, y, w, h] = c, e = 1e-6
  const l = x * W + (x < e ? s : s / 2), t = y * H + (y < e ? s : s / 2)
  const r = (x + w) * W - (x + w > 1 - e ? s : s / 2), b = (y + h) * H - (y + h > 1 - e ? s : s / 2)
  return { x: l, y: t, w: Math.max(1, r - l), h: Math.max(1, b - t) }
}

function TemplateIcon({ cells, active }: { cells: Cell[]; active: boolean }) {
  return <svg viewBox="0 0 40 40" className="size-full">{cells.map((c, i) => <rect key={i} x={c[0] * 40 + 1.2} y={c[1] * 40 + 1.2} width={c[2] * 40 - 2.4} height={c[3] * 40 - 2.4} rx={2} className={active ? 'fill-accent' : 'fill-muted/40'} />)}</svg>
}

export default function CollageMaker() {
  const { items, add, remove, clear } = useImageList()
  const [tpl, setTpl] = useState(4)
  const [order, setOrder] = useState<number[]>([]) // slot -> item index
  const [size, setSize] = useState('sq')
  const [custom, setCustom] = useState({ w: 1600, h: 1200 })
  const [spacing, setSpacing] = useState(16)
  const [radius, setRadius] = useState(12)
  const [bg, setBg] = useState('#ffffff')
  const [fit, setFit] = useState<'cover' | 'contain'>('cover')
  const [fmt, setFmt] = useState<'jpg' | 'png' | 'webp'>('jpg')
  const [drag, setDrag] = useState<{ from: number; over: number | null } | null>(null)
  const { busy, error, run } = useJob()
  const box = useRef<HTMLDivElement>(null)
  const [bw, setBw] = useState(600)
  const fileIn = useRef<HTMLInputElement>(null)

  const onFiles = useCallback(async (f: File[]) => {
    const before = items.length
    const a = await add(f)
    const n = before + a.length
    setTpl((t) => (before === 0 ? Math.max(0, TEMPLATES.findIndex((x) => x.cells.length === Math.min(9, Math.max(2, n)))) : t))
  }, [add, items.length])
  useLayoutEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(() => setBw(el.clientWidth)); ro.observe(el); setBw(el.clientWidth); return () => ro.disconnect() }, [items.length > 0])

  const cells = TEMPLATES[tpl].cells
  const slotItem = (slot: number) => { const idx = order[slot] ?? slot; return items[idx] }
  const ensureOrder = () => { const o = [...order]; for (let i = 0; i < Math.max(cells.length, items.length); i++) if (o[i] === undefined) o[i] = i; return o }
  const swap = (a: number, b: number) => { const o = ensureOrder(); [o[a], o[b]] = [o[b], o[a]]; setOrder(o) }
  const shuffle = () => { const o = ensureOrder().slice(0, Math.max(cells.length, items.length)); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]] } setOrder(o) }

  const S = SIZES.find((s) => s.id === size)!
  const W = size === 'custom' ? custom.w : S.w, H = size === 'custom' ? custom.h : S.h
  const maxH = typeof window !== 'undefined' ? window.innerHeight * 0.68 : 700
  const dispW = Math.max(50, Math.min(bw, (maxH * W) / Math.max(1, H)))
  const k = dispW / W
  const sp = (spacing / 1000) * Math.min(W, H) // spacing scales with canvas
  const rad = (radius / 1000) * Math.min(W, H)

  const exportImg = () => run(async () => {
    if (W < 16 || H < 16 || W > 12000 || H > 12000) throw new Error('Canvas size must be between 16 and 12000 px')
    const { canvas: c, ctx } = canvas(W, H)
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
    for (let i = 0; i < cells.length; i++) {
      const it = slotItem(i); if (!it) continue
      const img = await decode(it.file)
      const r = rectFor(cells[i], W, H, sp)
      ctx.save(); rrect(ctx, r.x, r.y, r.w, r.h, rad); ctx.clip()
      const s = fit === 'cover' ? Math.max(r.w / it.w, r.h / it.h) : Math.min(r.w / it.w, r.h / it.h)
      const dw = it.w * s, dh = it.h * s
      ctx.drawImage(img, r.x + (r.w - dw) / 2, r.y + (r.h - dh) / 2, dw, dh)
      ctx.restore()
    }
    downloadBlob(await exportCanvas(c, fmt, 0.92, bg), `collage-${W}x${H}.${fmt}`)
  })
  const reset = () => { clear(); setOrder([]) }

  if (!items.length) return <ImageDrop onFiles={onFiles} label="Drop 2–9 photos to make a collage" />

  return (
    <ToolGrid
      main={<>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <input ref={fileIn} type="file" hidden multiple accept="image/*" onChange={(e) => { if (e.target.files) onFiles(Array.from(e.target.files)); e.target.value = '' }} />
          <div ref={box} className="w-full">
          <div className="relative mx-auto overflow-hidden rounded-lg shadow-lg ring-1 ring-border touch-none" style={{ width: dispW, height: dispW * H / W, background: bg }}
            onPointerMove={(e) => { if (!drag) return; const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('[data-slot]'); const over = el ? Number(el.getAttribute('data-slot')) : null; if (over !== drag.over) setDrag({ ...drag, over }) }}
            onPointerUp={() => { if (drag && drag.over !== null && drag.over !== drag.from) swap(drag.from, drag.over); setDrag(null) }} onPointerLeave={() => setDrag(null)}>
            {cells.map((c, i) => {
              const r = rectFor(c, W, H, sp), it = slotItem(i)
              return (
                <motion.div key={i} layout data-slot={i}
                  onPointerDown={(e) => { if (it) { e.preventDefault(); (e.target as Element).releasePointerCapture?.(e.pointerId); setDrag({ from: i, over: i }) } }}
                  className={cn('group absolute overflow-hidden select-none', it ? 'cursor-grab active:cursor-grabbing' : 'grid cursor-pointer place-items-center border-2 border-dashed border-muted/40 bg-surface-2/60', drag?.over === i && drag.from !== i && 'ring-4 ring-accent', drag?.from === i && 'opacity-60')}
                  style={{ left: r.x * k, top: r.y * k, width: r.w * k, height: r.h * k, borderRadius: rad * k }}
                  onClick={() => !it && fileIn.current?.click()}>
                  {it ? <>
                    <img src={it.url} alt="" draggable={false} className={cn('pointer-events-none size-full', fit === 'cover' ? 'object-cover' : 'object-contain')} />
                    <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-md bg-black/50 p-1 text-white opacity-0 transition group-hover:opacity-100"><Move className="size-3" /></span>
                  </> : <Plus className="size-6 text-muted" />}
                </motion.div>
              )
            })}
          </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-muted">
            <span>Drag a photo onto another to swap · {W}×{H}px</span>
            <Button size="sm" variant="ghost" icon={<Shuffle className="size-4" />} onClick={shuffle}>Shuffle</Button>
          </div>
        </div>
        <ThumbGrid items={items} onRemove={(id) => { remove(id); setOrder([]) }} onAdd={onFiles} />
        {items.length > cells.length && <p className="text-xs text-warn">This layout shows {cells.length} photos — the last {items.length - cells.length} aren't used. Pick a larger layout or swap them in.</p>}
      </>}
      side={<>
        <div>
          <Label hint={`${cells.length} photos`}>Layout</Label>
          <div className="grid grid-cols-4 gap-2">
            {TEMPLATES.map((t, i) => <button key={t.name} title={t.name} onClick={() => setTpl(i)} className={cn('aspect-square rounded-xl border p-1.5 transition cursor-pointer', tpl === i ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50')}><TemplateIcon cells={t.cells} active={tpl === i} /></button>)}
          </div>
        </div>
        <Field label="Canvas size"><Select value={size} onChange={setSize} options={SIZES.map((s) => ({ value: s.id, label: s.label }))} /></Field>
        {size === 'custom' && <div className="grid grid-cols-2 gap-2"><Field label="Width"><Input type="number" value={custom.w} onChange={(e) => setCustom((c) => ({ ...c, w: Number(e.target.value) || 0 }))} /></Field><Field label="Height"><Input type="number" value={custom.h} onChange={(e) => setCustom((c) => ({ ...c, h: Number(e.target.value) || 0 }))} /></Field></div>}
        <Slider label="Spacing" value={spacing} onChange={setSpacing} min={0} max={80} />
        <Slider label="Corner radius" value={radius} onChange={setRadius} min={0} max={120} />
        <div><Label>Background</Label><ColorInput value={bg} onChange={setBg} /></div>
        <div><Label>Photo fit</Label><Segmented value={fit} onChange={setFit} options={[{ value: 'cover', label: 'Fill cell' }, { value: 'contain', label: 'Show whole photo' }]} /></div>
        <div><Label>Format</Label><Segmented value={fmt} onChange={setFmt} options={[{ value: 'jpg', label: 'JPG' }, { value: 'png', label: 'PNG' }, { value: 'webp', label: 'WEBP' }]} /></div>
        <ErrorNote error={error} />
        <Button size="lg" className="w-full" loading={busy} icon={<Download className="size-4" />} onClick={exportImg}>Download collage</Button>
        <Button variant="ghost" className="w-full" onClick={reset}>Start over</Button>
      </>}
    />
  )
}
