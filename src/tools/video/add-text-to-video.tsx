import { useEffect, useRef, useState } from 'react'
import { Type, Smile, Pencil, Trash2, Crosshair, Eraser } from 'lucide-react'
import { Button, Input, Label, Segmented, Select, Slider, Switch, cn } from '@/components/ui'
import { timedOverlaysOp } from '@/lib/b3/ffops'
import { ColorInput } from '@/tools/image/_img/kit'
import { fmtTime } from './_media/media'
import { TimeInput } from './_media/ui'
import { VideoOpTool, inName, outName } from './_b3/shell'
import { drawText, renderPng, FONTS, type TextItem } from './_b3/text-png'

type Item = TextItem & { id: number; t0: number; t1: number; emoji: boolean }
type Stroke = { color: string; width: number; pts: [number, number][] }
const EMOJI = ['😂', '🔥', '❤️', '👍', '😮', '🎉', '👀', '💯', '✨', '😎', '🙌', '⭐', '➡️', '✅', '❌', '📍']
let uid = 1

export default function AddTextToVideo() {
  const [items, setItems] = useState<Item[]>([])
  const [sel, setSel] = useState<number | null>(null)
  const [now, setNow] = useState(0)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [drawMode, setDrawMode] = useState(false)
  const [pen, setPen] = useState('#F5A524'), [penW, setPenW] = useState(8)
  const [bar, setBar] = useState(false), [barColor, setBarColor] = useState('#F5A524'), [barTop, setBarTop] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const cur = items.find((i) => i.id === sel) ?? null
  const patch = (p: Partial<Item>) => setItems((l) => l.map((i) => (i.id === sel ? { ...i, ...p } : i)))
  const add = (emoji: string | null, dur: number) => {
    const t0 = +now.toFixed(2)
    const it: Item = { id: uid++, text: emoji ?? 'Your text', font: 'Inter', size: emoji ? 12 : 7, color: '#ffffff', stroke: '#000000', strokeW: emoji ? 0 : 2, box: false, boxColor: 'rgba(0,0,0,0.6)', x: 50, y: emoji ? 30 : 82, bold: true, t0, t1: Math.min(dur || t0 + 3, t0 + 3), emoji: !!emoji }
    setItems((l) => [...l, it]); setSel(it.id); setDrawMode(false)
  }
  return (
    <VideoOpTool
      dropLabel="Drop a video to add text, emoji and drawings" action="Render video" icon={<Type className="size-5" />}
      onReset={() => { setItems([]); setStrokes([]); setSel(null) }}
      main={({ url, meta }) => (
        <Stage url={url} meta={meta} video={video} items={items} sel={sel} onSel={setSel} now={now} setNow={setNow} onPlace={(x, y) => cur && patch({ x, y })}
          drawMode={drawMode} strokes={strokes} setStrokes={setStrokes} pen={pen} penW={penW} bar={bar ? { color: barColor, top: barTop } : null} />
      )}
      below={({ meta }) => meta?.duration ? <Timeline items={items} sel={sel} onSel={setSel} duration={meta.duration} now={now} /> : null}
      side={({ meta }) => {
        const dur = meta?.duration ?? 0
        return <>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={<Type className="size-4" />} onClick={() => add(null, dur)}>Text</Button>
            <Button size="sm" variant={drawMode ? 'primary' : 'secondary'} icon={<Pencil className="size-4" />} onClick={() => setDrawMode(!drawMode)}>{drawMode ? 'Done' : 'Draw'}</Button>
          </div>
          <div>
            <Label>Stickers</Label>
            <div className="grid grid-cols-8 gap-1">{EMOJI.map((e) => <button key={e} onClick={() => add(e, dur)} aria-label={`Add ${e}`} className="grid h-8 place-items-center rounded-lg bg-surface-2 text-lg hover:bg-border cursor-pointer">{e}</button>)}</div>
          </div>
          {drawMode ? <div className="space-y-3">
            <ColorInput value={pen} onChange={setPen} />
            <Slider label="Pen size" value={penW} onChange={setPenW} min={2} max={40} suffix="px" />
            <Button size="sm" variant="outline" icon={<Eraser className="size-4" />} onClick={() => setStrokes([])} disabled={!strokes.length}>Clear drawing</Button>
            <p className="text-xs text-muted">Pause the video and draw on it. Drawings stay for the whole video.</p>
          </div> : cur ? <div className="space-y-3 rounded-xl border border-border p-3">
            {!cur.emoji && <textarea value={cur.text} onChange={(e) => patch({ text: e.target.value })} rows={2} aria-label="Text" className="w-full rounded-xl border border-border bg-surface-2/60 px-3 py-2 text-sm text-fg outline-none focus:border-accent" />}
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Start</Label><TimeInput value={cur.t0} onChange={(v) => patch({ t0: Math.min(v, cur.t1 - 0.1) })} max={dur || Infinity} label="Start" /></div>
              <div><Label>End</Label><TimeInput value={cur.t1} onChange={(v) => patch({ t1: Math.max(v, cur.t0 + 0.1) })} max={dur || Infinity} label="End" /></div>
            </div>
            <Button size="sm" variant="ghost" icon={<Crosshair className="size-4" />} onClick={() => patch({ t0: +now.toFixed(2) })}>Start at playhead ({fmtTime(now, 1)})</Button>
            <Slider label="Size" value={cur.size} onChange={(v) => patch({ size: v })} min={2} max={30} suffix="%" />
            {!cur.emoji && <>
              <div className="grid grid-cols-2 gap-2"><Select value={cur.font} onChange={(v) => patch({ font: v })} options={FONTS} /><ColorInput value={cur.color} onChange={(v) => patch({ color: v })} /></div>
              <div className="grid grid-cols-2 gap-2 items-center"><Switch checked={cur.strokeW > 0} onChange={(v) => patch({ strokeW: v ? 2 : 0 })} label="Outline" /><Switch checked={cur.box} onChange={(v) => patch({ box: v })} label="Box" /></div>
            </>}
            <p className="text-xs text-muted">Click on the video to move it there.</p>
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => { setItems((l) => l.filter((i) => i.id !== sel)); setSel(null) }}>Remove</Button>
          </div> : <p className="text-sm text-muted">Add text or a sticker. It starts at the playhead and lasts 3 seconds.</p>}
          <div className="space-y-2 border-t border-border pt-3">
            <Switch checked={bar} onChange={setBar} label="Progress bar" />
            {bar && <div className="grid grid-cols-2 gap-2"><ColorInput value={barColor} onChange={setBarColor} /><Segmented value={barTop ? 't' : 'b'} onChange={(v) => setBarTop(v === 't')} options={[{ value: 'b', label: 'Bottom' }, { value: 't', label: 'Top' }]} /></div>}
          </div>
        </>
      }}
      disabled={() => !items.length && !strokes.length && !bar}
      onRun={async ({ file, meta }, h) => {
        const info = await h.probe()
        const W = info.width || meta?.width || 1280, H = info.height || meta?.height || 720
        const dur = info.duration || meta?.duration || 1
        const pngs: { name: string; t0: number; t1: number }[] = []
        const inputs: { name: string; file: Blob | Uint8Array }[] = []
        const unit = Math.min(W, H) / 100
        for (let i = 0; i < items.length; i++) {
          h.setLabel(`Rendering text ${i + 1} of ${items.length}`)
          const it = items[i]
          const png = await renderPng(W, H, (ctx) => drawText(ctx, { ...it, size: Math.max(8, Math.round(it.size * unit)), strokeW: it.strokeW ? Math.max(1, Math.round(it.size * unit / 14)) : 0 }, W, H))
          const name = `t${i}.png`; inputs.push({ name, file: png }); pngs.push({ name, t0: it.t0, t1: it.t1 })
        }
        if (strokes.length) {
          const png = await renderPng(W, H, (ctx) => paintStrokes(ctx, strokes, W / (meta?.width || W)))
          inputs.push({ name: 'draw.png', file: png }); pngs.push({ name: 'draw.png', t0: 0, t1: dur + 1 })
        }
        h.setLabel('Rendering video')
        const input = inName(file)
        const op = timedOverlaysOp(input, pngs, info.hasAudio, dur, bar ? { color: barColor, height: Math.max(4, Math.round(H / 120)), top: barTop, width: W } : undefined)
        const blob = await h.run(op, [{ name: input, file }, ...inputs], dur)
        return { blob, name: outName(file, 'text'), title: 'Video rendered' }
      }}
    />
  )
}

function paintStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], scale = 1) {
  for (const s of strokes) {
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width * scale; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath(); s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * scale, y * scale) : ctx.moveTo(x * scale, y * scale))); if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] * scale + 0.1, s.pts[0][1] * scale); ctx.stroke()
  }
}

function Stage({ url, meta, video, items, sel, onSel, now, setNow, onPlace, drawMode, strokes, setStrokes, pen, penW, bar }: {
  url: string | null; meta: { width: number; height: number; duration: number } | null; video: React.RefObject<HTMLVideoElement | null>; items: Item[]; sel: number | null; onSel: (id: number) => void; now: number; setNow: (t: number) => void
  onPlace: (x: number, y: number) => void; drawMode: boolean; strokes: Stroke[]; setStrokes: (f: (s: Stroke[]) => Stroke[]) => void; pen: string; penW: number; bar: { color: string; top: boolean } | null
}) {
  const box = useRef<HTMLDivElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const W = meta?.width || 1280, H = meta?.height || 720
  useEffect(() => {
    const c = cv.current; if (!c) return
    c.width = W; c.height = H
    const ctx = c.getContext('2d')!; ctx.clearRect(0, 0, W, H); paintStrokes(ctx, strokes)
  }, [strokes, W, H])
  const pt = (e: React.PointerEvent): [number, number] => { const r = box.current!.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H] }
  const [boxW, setBoxW] = useState(640)
  useEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(() => setBoxW(el.clientWidth)); ro.observe(el); return () => ro.disconnect() }, [url])
  const scale = boxW / W
  return (
    <div className="rounded-2xl border border-border bg-black/90 p-2">
      <div ref={box} className="relative mx-auto w-fit max-w-full">
        {url && <video ref={video} src={url} controls={!drawMode} playsInline className="block max-h-[60vh] max-w-full" onTimeUpdate={(e) => setNow((e.target as HTMLVideoElement).currentTime)} />}
        <canvas ref={cv} className={cn('absolute inset-0 h-full w-full', drawMode ? 'cursor-crosshair touch-none' : 'pointer-events-none')}
          onPointerDown={(e) => { if (!drawMode) return; (e.target as HTMLElement).setPointerCapture(e.pointerId); drawing.current = true; const p = pt(e); setStrokes((s) => [...s, { color: pen, width: penW, pts: [p] }]) }}
          onPointerMove={(e) => { if (!drawing.current) return; const p = pt(e); setStrokes((s) => { const l = s[s.length - 1]; return [...s.slice(0, -1), { ...l, pts: [...l.pts, p] }] }) }}
          onPointerUp={() => { drawing.current = false }} />
        {!drawMode && <div className="absolute inset-x-0 top-0 bottom-12" onClick={(e) => { const r = box.current!.getBoundingClientRect(); onPlace(+(((e.clientX - r.left) / r.width) * 100).toFixed(1), +(((e.clientY - r.top) / r.height) * 100).toFixed(1)) }} />}
        {items.filter((i) => now >= i.t0 && now <= i.t1).map((i) => {
          const px = i.size * Math.min(W, H) / 100 * scale
          return (
            <button key={i.id} onClick={(e) => { e.stopPropagation(); onSel(i.id) }} className={cn('absolute -translate-x-1/2 -translate-y-1/2 whitespace-pre text-center leading-tight cursor-pointer', sel === i.id && 'ring-2 ring-accent ring-offset-1 ring-offset-transparent')}
              style={{ left: `${i.x}%`, top: `${i.y}%`, fontFamily: `"${i.font}", sans-serif`, fontWeight: 700, fontSize: px, color: i.color, WebkitTextStroke: i.strokeW ? `${Math.max(1, px / 14)}px ${i.stroke}` : undefined, background: i.box ? i.boxColor : undefined, padding: i.box ? `0 ${px * 0.3}px` : undefined, borderRadius: px * 0.2 }}>{i.text}</button>
          )
        })}
        {bar && meta?.duration ? <div className="pointer-events-none absolute left-0" style={{ [bar.top ? 'top' : 'bottom']: 0, height: Math.max(3, (H / 120) * scale), width: `${(now / meta.duration) * 100}%`, background: bar.color }} /> : null}
      </div>
    </div>
  )
}

function Timeline({ items, sel, onSel, duration, now }: { items: Item[]; sel: number | null; onSel: (id: number) => void; duration: number; now: number }) {
  if (!items.length) return null
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-2"><div className="relative space-y-1">
      <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-fg/70" style={{ left: `${(now / duration) * 100}%` }} />
      {items.map((i) => (
        <div key={i.id} className="relative h-6">
          <button onClick={() => onSel(i.id)} className={cn('absolute inset-y-0 truncate rounded-md px-2 text-left text-[11px] cursor-pointer', sel === i.id ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted hover:text-fg')}
            style={{ left: `${(i.t0 / duration) * 100}%`, width: `${Math.max(2, ((i.t1 - i.t0) / duration) * 100)}%` }}>{i.text.split('\n')[0]}</button>
        </div>
      ))}
    </div></div>
  )
}
