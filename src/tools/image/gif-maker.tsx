import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, rectSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Film, X, Plus, Play, Pause, Video, GripVertical } from 'lucide-react'
import { Button, ErrorNote, Label, Progress, ResultCard, Segmented, Slider, Switch, ToolGrid, cn, useJob } from '@/components/ui'
import { ColorInput, ImageDrop, canvas, decode, loadGifenc, useImageList, useObjectUrl, writeGifFrame, type Item } from './_img/kit'

function Frame({ it, i, onRemove, active }: { it: Item; i: number; onRemove: () => void; active: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: it.id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn('group relative overflow-hidden rounded-xl border bg-surface-2/40', isDragging ? 'z-10 shadow-2xl ring-2 ring-accent' : active ? 'border-accent' : 'border-border')}>
      <div {...attributes} {...listeners} className="checker grid aspect-square cursor-grab place-items-center active:cursor-grabbing"><img src={it.url} alt="" draggable={false} className="max-h-full max-w-full object-contain" /></div>
      <div className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted"><GripVertical className="size-3" />Frame {i + 1}</div>
      <button onClick={onRemove} className="absolute right-1.5 top-1.5 rounded-lg bg-black/55 p-1 text-white opacity-0 transition group-hover:opacity-100 cursor-pointer max-sm:opacity-100" aria-label="Remove frame"><X className="size-3.5" /></button>
    </div>
  )
}

export default function GifMaker() {
  const { items, add, remove, clear, setItems } = useImageList()
  const [delay, setDelay] = useState(500)
  const [width, setWidth] = useState(480)
  const [loop, setLoop] = useState<'forever' | 'once' | 'n'>('forever')
  const [loops, setLoops] = useState(3)
  const [fit, setFit] = useState<'contain' | 'cover'>('contain')
  const [bg, setBg] = useState('#ffffff')
  const [colors, setColors] = useState<'256' | '128' | '64'>('256')
  const [boomerang, setBoomerang] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [frame, setFrame] = useState(0)
  const [gif, setGif] = useState<Blob | null>(null)
  const { busy, progress, error, run } = useJob()
  const gifUrl = useObjectUrl(gif)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const fileIn = useRef<HTMLInputElement>(null)

  const onFiles = useCallback(async (f: File[]) => { await add(f.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))); setGif(null) }, [add])
  const seq = useMemo(() => (boomerang && items.length > 2 ? [...items, ...items.slice(1, -1).reverse()] : items), [items, boomerang])
  useEffect(() => { if (!playing || seq.length < 2) return; const t = setInterval(() => setFrame((f) => (f + 1) % seq.length), delay); return () => clearInterval(t) }, [playing, seq.length, delay])

  const first = items[0]
  const height = first ? Math.max(1, Math.round((width * first.h) / first.w)) : 0
  const onDragEnd = (e: DragEndEvent) => { const { active, over } = e; if (over && active.id !== over.id) { setItems((s) => arrayMove(s, s.findIndex((x) => x.id === active.id), s.findIndex((x) => x.id === over.id))); setGif(null) } }

  const make = () => run(async (setP) => {
    if (seq.length < 2) throw new Error('Add at least 2 images to make an animation.')
    const lib = await loadGifenc()
    const enc = lib.GIFEncoder()
    const { canvas: c, ctx } = canvas(width, height)
    const cache = new Map<string, HTMLImageElement>()
    for (let i = 0; i < seq.length; i++) {
      const it = seq[i]
      const img = cache.get(it.id) ?? await decode(it.file); cache.set(it.id, img)
      ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height)
      const s = fit === 'contain' ? Math.min(width / it.w, height / it.h) : Math.max(width / it.w, height / it.h)
      const dw = it.w * s, dh = it.h * s
      ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh)
      const data = ctx.getImageData(0, 0, width, height).data
      writeGifFrame(lib, enc, data, width, height, { delay, repeat: loop === 'forever' ? 0 : loop === 'once' ? -1 : loops, colors: Number(colors) })
      setP((i + 1) / seq.length)
      await new Promise((r) => setTimeout(r, 0))
    }
    enc.finish()
    setGif(new Blob([enc.bytes() as BlobPart], { type: 'image/gif' }))
  })
  const reset = () => { clear(); setGif(null) }

  if (!items.length) return (
    <div className="space-y-4">
      <ImageDrop onFiles={onFiles} label="Drop images to animate (in order)" sub="Frames are sorted by file name, drag to reorder afterwards." />
      <p className="text-center text-sm text-muted">Have a video clip instead? <Link to="/video-to-gif" className="text-accent hover:underline">Use Video to GIF →</Link></p>
    </div>
  )

  const cur = seq[frame % Math.max(1, seq.length)]
  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-medium">{gif ? 'Your GIF' : 'Live preview'}</span>
              {!gif && <Button size="sm" variant="ghost" icon={playing ? <Pause className="size-4" /> : <Play className="size-4" />} onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</Button>}
            </div>
            <div className="checker mx-auto grid place-items-center overflow-hidden rounded-xl" style={{ aspectRatio: `${width} / ${height}`, maxHeight: '55vh', maxWidth: '100%' }}>
              {gif && gifUrl ? <img src={gifUrl} alt="Animated GIF" className="size-full object-contain" /> :
                cur && <div className="relative size-full" style={{ background: bg }}><img src={cur.url} alt="" className={cn('size-full', fit === 'contain' ? 'object-contain' : 'object-cover')} /></div>}
            </div>
            {!gif && <div className="mt-2 text-center font-mono text-xs text-muted">Frame {(frame % Math.max(1, seq.length)) + 1}/{seq.length} · {width}×{height} · {(seq.length * delay / 1000).toFixed(1)}s</div>}
          </div>
          {gif && <ResultCard blob={gif} filename="animation.gif" title={`GIF ready, ${seq.length} frames, ${width}×${height}`} onReset={reset}><Button size="sm" variant="ghost" onClick={() => setGif(null)}>Edit frames</Button></ResultCard>}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
                {items.map((it, i) => <Frame key={it.id} it={it} i={i} active={cur?.id === it.id && !gif} onRemove={() => { remove(it.id); setGif(null) }} />)}
                <button onClick={() => fileIn.current?.click()} className="grid aspect-square place-items-center rounded-xl border-2 border-dashed border-border text-xs text-muted hover:border-accent hover:text-accent cursor-pointer"><span className="flex flex-col items-center gap-1"><Plus className="size-5" />Add frames</span></button>
              </div>
            </SortableContext>
          </DndContext>
          <input ref={fileIn} type="file" hidden multiple accept="image/*" onChange={(e) => { if (e.target.files) onFiles(Array.from(e.target.files)); e.target.value = '' }} />
        </>}
        side={<>
          <Slider label="Frame delay" value={delay} onChange={(v) => { setDelay(v); setGif(null) }} min={20} max={3000} step={10} suffix=" ms" />
          <div className="-mt-3 text-[11px] text-muted">{(1000 / delay).toFixed(1)} frames per second</div>
          <Slider label="Width" value={width} onChange={(v) => { setWidth(v); setGif(null) }} min={64} max={1200} step={8} suffix="px" />
          <div><Label>Loop</Label><Segmented value={loop} onChange={(v) => { setLoop(v); setGif(null) }} options={[{ value: 'forever', label: 'Forever' }, { value: 'once', label: 'Play once' }, { value: 'n', label: 'N times' }]} /></div>
          {loop === 'n' && <Slider label="Repeats" value={loops} onChange={(v) => { setLoops(v); setGif(null) }} min={1} max={20} />}
          <div><Label>Frame fit</Label><Segmented value={fit} onChange={(v) => { setFit(v); setGif(null) }} options={[{ value: 'contain', label: 'Fit (pad)' }, { value: 'cover', label: 'Fill (crop)' }]} /></div>
          <div><Label>Background</Label><ColorInput value={bg} onChange={(v) => { setBg(v); setGif(null) }} /></div>
          <div><Label>Colors per frame</Label><Segmented value={colors} onChange={(v) => { setColors(v); setGif(null) }} options={[{ value: '256', label: '256' }, { value: '128', label: '128' }, { value: '64', label: '64 (smaller)' }]} /></div>
          <Switch checked={boomerang} onChange={(v) => { setBoomerang(v); setGif(null) }} label="Boomerang (play forward & back)" />
          {busy && <Progress value={progress} label="Encoding GIF" />}
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" loading={busy} icon={<Film className="size-4" />} onClick={make}>Create GIF</Button>
          <Link to="/video-to-gif" className="flex items-center justify-center gap-1.5 text-xs text-muted hover:text-accent"><Video className="size-3.5" /> Making a GIF from a video? Use Video to GIF</Link>
          <Button variant="ghost" className="w-full" onClick={reset}>Start over</Button>
        </>}
      />
    </div>
  )
}
