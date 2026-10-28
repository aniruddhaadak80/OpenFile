import { useMemo, useState } from 'react'
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, rectSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Copy, Trash2, Shuffle, Undo2, ArrowLeftRight, Clock, CheckSquare, Square, Plus } from 'lucide-react'
import { Button, Input, Label, ToolGrid, ErrorNote, Segmented, cn } from '@/components/ui'
import { type Anim, type Frame, decodeAnim, fitAnim, totalDuration } from '@/lib/b3/anim'
import { toast } from '@/components/toast'
import { AnimBar, AnimDrop, AnimPlayer, AnimStats, ExportPanel, Loading, useAnim, useFrameThumbs } from './_b3/anim-ui'

type Item = { id: number; frame: Frame; thumb: string }
let nextId = 1

function Tile({ it, i, selected, active, onToggle, onShow, onDelay }: { it: Item; i: number; selected: boolean; active: boolean; onToggle: (e: React.MouseEvent | React.KeyboardEvent) => void; onShow: () => void; onDelay: (d: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: it.id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group relative overflow-hidden rounded-xl border bg-surface-2/40 transition', isDragging ? 'z-10 shadow-2xl ring-2 ring-accent' : selected ? 'border-accent ring-1 ring-accent/50' : active ? 'border-accent/60' : 'border-border')}>
      <div {...attributes} {...listeners} onClick={(e) => { onShow(); if (e.shiftKey || e.metaKey || e.ctrlKey) onToggle(e) }} className="checker grid aspect-square cursor-grab place-items-center active:cursor-grabbing">
        <img src={it.thumb} alt={`Frame ${i + 1}`} draggable={false} className="max-h-full max-w-full object-contain" />
      </div>
      <button type="button" aria-label={selected ? `Unselect frame ${i + 1}` : `Select frame ${i + 1}`} onClick={onToggle} className="absolute left-1.5 top-1.5 rounded-md bg-black/55 p-0.5 text-white cursor-pointer">
        {selected ? <CheckSquare className="size-3.5 text-accent" /> : <Square className="size-3.5" />}
      </button>
      <div className="flex items-center gap-1 px-1.5 py-1 text-[11px] text-muted">
        <span className="font-mono">{i + 1}</span>
        <input aria-label={`Delay of frame ${i + 1} in milliseconds`} type="number" min={10} step={10} value={it.frame.delay} onChange={(e) => onDelay(Math.max(10, +e.target.value || 10))}
          className="ml-auto w-14 rounded border border-border bg-surface px-1 py-0.5 text-right font-mono text-[11px] text-fg outline-none focus:border-accent" />
        <span>ms</span>
      </div>
    </div>
  )
}

export default function GifEditor() {
  const { file, anim: src, loading, progress, error, load, reset } = useAnim()
  const thumbs = useFrameThumbs(src)
  const [items, setItems] = useState<Item[] | null>(null)
  const [history, setHistory] = useState<Item[][]>([])
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [shown, setShown] = useState(0)
  const [loopMode, setLoopMode] = useState<'forever' | 'once' | 'n'>('forever')
  const [loops, setLoops] = useState(3)
  const [bulkDelay, setBulkDelay] = useState(100)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  // initialise the editable list once frames and thumbnails exist
  const list: Item[] = useMemo(() => items ?? (src && thumbs.length === src.frames.length ? src.frames.map((f, i) => ({ id: nextId++, frame: f, thumb: thumbs[i] })) : []), [items, src, thumbs])
  const commit = (next: Item[]) => { setHistory((h) => [...h.slice(-30), list]); setItems(next) }
  const anim: Anim | null = useMemo(() => src && list.length ? { ...src, frames: list.map((x) => x.frame), loop: loopMode === 'forever' ? 0 : loopMode === 'once' ? 1 : loops } : null, [src, list, loopMode, loops])
  const target = sel.size ? list.filter((x) => sel.has(x.id)) : []

  const start = () => { reset(); setItems(null); setHistory([]); setSel(new Set()) }
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const onDragEnd = (e: DragEndEvent) => { const { active, over } = e; if (over && active.id !== over.id) commit(arrayMove(list, list.findIndex((x) => x.id === active.id), list.findIndex((x) => x.id === over.id))) }
  const del = () => { if (!target.length) return toast('Select frames first', 'info'); if (target.length >= list.length) return toast('An animation needs at least one frame', 'error'); commit(list.filter((x) => !sel.has(x.id))); setSel(new Set()) }
  const dup = () => { if (!target.length) return toast('Select frames first', 'info'); const out: Item[] = []; for (const x of list) { out.push(x); if (sel.has(x.id)) out.push({ ...x, id: nextId++ }) } commit(out) }
  const reverse = () => commit([...list].reverse())
  const shuffle = () => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } commit(a) }
  const applyDelay = () => { const ids = sel.size ? sel : new Set(list.map((x) => x.id)); commit(list.map((x) => (ids.has(x.id) ? { ...x, frame: { ...x.frame, delay: bulkDelay } } : x))) }
  const freezeLast = () => { const last = list[list.length - 1]; commit([...list.slice(0, -1), { ...last, frame: { ...last.frame, delay: last.frame.delay + 1000 } }]) }
  const setDelay = (id: number, d: number) => setItems(list.map((x) => (x.id === id ? { ...x, frame: { ...x.frame, delay: d } } : x)))
  const undo = () => { const h = history[history.length - 1]; if (!h) return; setHistory(history.slice(0, -1)); setItems(h) }
  const addFrames = async (files: File[]) => {
    if (!src) return
    try {
      const added: Item[] = []
      for (const f of files) {
        const a = fitAnim(await decodeAnim(f), src.width, src.height, 'contain')
        const c = document.createElement('canvas'); c.width = 96; c.height = Math.round(96 * src.height / src.width)
        for (const fr of a.frames) {
          const big = document.createElement('canvas'); big.width = src.width; big.height = src.height
          big.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(fr.rgba), src.width, src.height), 0, 0)
          c.getContext('2d')!.clearRect(0, 0, c.width, c.height); c.getContext('2d')!.drawImage(big, 0, 0, c.width, c.height)
          added.push({ id: nextId++, frame: { ...fr, delay: a.frames.length > 1 ? fr.delay : 500 }, thumb: c.toDataURL() })
        }
      }
      commit([...list, ...added]); toast(`Added ${added.length} frame${added.length > 1 ? 's' : ''}`, 'success')
    } catch (e: any) { toast(e?.message || 'Could not add that file', 'error') }
  }

  if (!file) return <AnimDrop onFile={load} label="Drop a GIF, APNG or animated WebP to edit its frames" />
  if (loading || (src && !list.length)) return <Loading progress={progress} />
  if (!src || !anim) return <div className="space-y-3"><ErrorNote error={error} /><Button variant="outline" onClick={start}>Try another file</Button></div>

  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <AnimBar file={file} onReset={start}><Button variant="ghost" size="sm" icon={<Undo2 className="size-4" />} onClick={undo} disabled={!history.length}>Undo</Button></AnimBar>
          <AnimPlayer anim={anim} frame={Math.min(shown, list.length - 1)} onFrame={setShown} maxH="45vh" />
          <AnimStats anim={anim} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setSel(new Set(list.map((x) => x.id)))}>Select all</Button>
            <Button size="sm" variant="ghost" onClick={() => setSel(new Set())} disabled={!sel.size}>Clear ({sel.size})</Button>
            <span className="mx-1 h-5 w-px bg-border" />
            <Button size="sm" variant="outline" icon={<Copy className="size-4" />} onClick={dup}>Duplicate</Button>
            <Button size="sm" variant="outline" icon={<Trash2 className="size-4" />} onClick={del}>Delete</Button>
            <Button size="sm" variant="outline" icon={<ArrowLeftRight className="size-4" />} onClick={reverse}>Reverse</Button>
            <Button size="sm" variant="outline" icon={<Shuffle className="size-4" />} onClick={shuffle}>Shuffle</Button>
            <Button size="sm" variant="outline" icon={<Clock className="size-4" />} onClick={freezeLast}>Hold last +1s</Button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-accent hover:text-accent">
              <Plus className="size-4" />Add frames
              <input type="file" multiple accept="image/*" className="sr-only" onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; if (f.length) addFrames(f) }} />
            </label>
          </div>
          <p className="text-xs text-muted">Drag frames to reorder. Click the box or Shift-click a frame to select it. Edit the number to change one frame's delay.</p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={list.map((x) => x.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-6">
                {list.map((it, i) => <Tile key={it.id} it={it} i={i} selected={sel.has(it.id)} active={i === shown} onToggle={(e) => { e.stopPropagation(); toggle(it.id) }} onShow={() => setShown(i)} onDelay={(d) => setDelay(it.id, d)} />)}
              </div>
            </SortableContext>
          </DndContext>
        </>}
        side={<>
          <div>
            <Label hint={sel.size ? `${sel.size} selected` : 'all frames'}>Set delay</Label>
            <div className="flex gap-2"><Input type="number" min={10} step={10} value={bulkDelay} onChange={(e) => setBulkDelay(Math.max(10, +e.target.value || 10))} /><Button variant="secondary" onClick={applyDelay}>Apply</Button></div>
            <p className="mt-1 text-xs text-muted">Total length {(totalDuration(anim) / 1000).toFixed(2)}s</p>
          </div>
          <div>
            <Label>Loop</Label>
            <Segmented value={loopMode} onChange={setLoopMode} options={[{ value: 'forever', label: 'Forever' }, { value: 'once', label: 'Once' }, { value: 'n', label: 'Count' }]} />
            {loopMode === 'n' && <Input className="mt-2" type="number" min={2} max={1000} value={loops} onChange={(e) => setLoops(Math.max(2, +e.target.value || 2))} />}
          </div>
          <ExportPanel anim={anim} name={file.name} suffix="-edited" originalSize={file.size} onReset={start} />
        </>}
      />
    </div>
  )
}
