import { useEffect, useRef, useState } from 'react'
import { ListMusic, GripVertical, X, Plus, Loader2, Play, Pause, AlertCircle } from 'lucide-react'
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Dropzone, Label, ResultCard, Segmented, Slider, Switch, ToolGrid, Empty } from '@/components/ui'
import { audioCtx, cssVar, decodeAudioFile, drawMiniWave, encodeBuffer, peakOf } from '@/tools/video/_media/audio'
import { fmtTime, stamp, useMediaJob, useObjectUrl } from '@/tools/video/_media/media'
import { JobPanel, Note, Reveal } from '@/tools/video/_media/ui'

interface Item { id: string; file: File; buffer?: AudioBuffer; error?: string }
type Fmt = 'wav' | 'mp3' | 'm4a' | 'ogg' | 'flac'
type Curve = 'linear' | 'equal'
/** Equal-power fade curve (sin/cos), smoother than a straight line for music. */
export const fadeCurve = (dir: 'in' | 'out', level: number, n = 64) => Float32Array.from({ length: n }, (_, i) => { const x = i / (n - 1); return level * (dir === 'in' ? Math.sin((x * Math.PI) / 2) : Math.cos((x * Math.PI) / 2)) })

function MiniWave({ buffer }: { buffer: AudioBuffer }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => { if (ref.current) drawMiniWave(ref.current, buffer, cssVar('--accent')) }, [buffer])
  return <canvas ref={ref} className="h-8 w-full" />
}

function Row({ item, index, onRemove, playing, onPlay }: { item: Item; index: number; onRemove: () => void; playing: boolean; onPlay: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
      ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }}
      className={`flex items-center gap-3 rounded-xl border bg-surface p-2 pr-3 ${isDragging ? 'border-accent shadow-xl' : 'border-border'}`}>
      <button {...attributes} {...listeners} className="cursor-grab touch-none rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg active:cursor-grabbing" aria-label="Drag to reorder"><GripVertical className="size-4" /></button>
      <span className="w-5 text-center font-mono text-xs text-muted">{index + 1}</span>
      <button onClick={onPlay} disabled={!item.buffer} className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-40 cursor-pointer" aria-label="Preview">{playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}</button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2"><span className="truncate text-sm font-medium">{item.file.name}</span>{item.buffer && <span className="shrink-0 font-mono text-[11px] text-muted">{fmtTime(item.buffer.duration, 1)}</span>}</div>
        {item.buffer ? <MiniWave buffer={item.buffer} /> : item.error ? <div className="flex items-center gap-1 text-xs text-danger"><AlertCircle className="size-3" />{item.error}</div> : <div className="flex items-center gap-1.5 text-xs text-muted"><Loader2 className="size-3 animate-spin" />Decoding…</div>}
      </div>
      <button onClick={onRemove} className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger cursor-pointer" aria-label="Remove"><X className="size-4" /></button>
    </motion.div>
  )
}

export default function AudioMerger() {
  const [items, setItems] = useState<Item[]>([])
  const [mode, setMode] = useState<'gap' | 'crossfade'>('gap')
  const [gap, setGap] = useState(0)
  const [xfade, setXfade] = useState(2)
  const [curve, setCurve] = useState<Curve>('equal')
  const [norm, setNorm] = useState(false)
  const [fmt, setFmt] = useState<Fmt>('wav')
  const [br, setBr] = useState('192')
  const [result, setResult] = useState<Blob | null>(null)
  const resultUrl = useObjectUrl(result)
  const [playing, setPlaying] = useState<string | null>(null)
  const src = useRef<AudioBufferSourceNode | null>(null)
  const job = useMediaJob()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  const stopPreview = () => { if (src.current) { src.current.onended = null; try { src.current.stop() } catch { /* */ } src.current = null } setPlaying(null) }
  useEffect(() => () => stopPreview(), [])
  const preview = (it: Item) => {
    if (playing === it.id) return stopPreview()
    stopPreview(); if (!it.buffer) return
    const ctx = audioCtx(); ctx.resume()
    const s = ctx.createBufferSource(); s.buffer = it.buffer; s.connect(ctx.destination); s.start(); s.onended = () => setPlaying(null)
    src.current = s; setPlaying(it.id)
  }

  const add = async (files: File[]) => {
    setResult(null)
    const added = files.map((file) => ({ id: Math.random().toString(36).slice(2), file }))
    setItems((l) => [...l, ...added])
    for (const it of added) {
      try { const buffer = await decodeAudioFile(it.file); setItems((l) => l.map((x) => (x.id === it.id ? { ...x, buffer } : x))) }
      catch (e: any) { setItems((l) => l.map((x) => (x.id === it.id ? { ...x, error: e?.message || 'Could not decode' } : x))) }
    }
  }
  const onDragEnd = (e: DragEndEvent) => { const { active, over } = e; if (over && active.id !== over.id) { setItems((l) => arrayMove(l, l.findIndex((x) => x.id === active.id), l.findIndex((x) => x.id === over.id))); setResult(null) } }

  const ready = items.filter((x) => x.buffer)
  const cf = mode === 'crossfade' ? Math.max(0, Math.min(xfade, ...ready.map((x) => x.buffer!.duration / 2 - 0.02))) : 0
  const gp = mode === 'gap' ? gap : 0
  const total = ready.reduce((a, x, i) => a + x.buffer!.duration + (i ? gp - cf : 0), 0)

  const merge = () => job.run(async ({ setProgress, setLabel }) => {
    if (ready.length < 2) return
    stopPreview(); setResult(null); setLabel('Mixing tracks…')
    const sr = Math.max(...ready.map((x) => x.buffer!.sampleRate))
    const chs = Math.max(...ready.map((x) => x.buffer!.numberOfChannels))
    const ctx = new OfflineAudioContext(chs, Math.ceil(total * sr) + 1, sr)
    let t = 0
    ready.forEach((x, i) => {
      const b = x.buffer!
      const s = ctx.createBufferSource(); s.buffer = b
      const g = ctx.createGain()
      const level = norm ? Math.min(4, 0.89 / (peakOf(b) || 1)) : 1
      if (i > 0) t += gp - cf
      g.gain.setValueAtTime(level, 0)
      if (cf > 0 && i > 0) { if (curve === 'equal') g.gain.setValueCurveAtTime(fadeCurve('in', level), t, cf); else { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + cf) } }
      if (cf > 0 && i < ready.length - 1) { if (curve === 'equal') g.gain.setValueCurveAtTime(fadeCurve('out', level), t + b.duration - cf, cf); else { g.gain.setValueAtTime(level, t + b.duration - cf); g.gain.linearRampToValueAtTime(0, t + b.duration) } }
      s.connect(g).connect(ctx.destination); s.start(t)
      t += b.duration
    })
    const rendered = await ctx.startRendering()
    setProgress(fmt === 'wav' ? 0.9 : 0.3)
    setLabel(`Encoding ${fmt.toUpperCase()}…`)
    const blob = await encodeBuffer(rendered, fmt, +br, (p) => setProgress(0.3 + p * 0.7))
    setResult(blob)
  })

  const reset = () => { stopPreview(); if (job.busy) job.cancel(); setItems([]); setResult(null); job.reset() }

  if (!items.length) return <Dropzone multiple accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac,.opus,.webm" onFiles={add} label="Drop the audio files to join" sub="Add two or more tracks, reorder, add gaps or crossfades, export as one file." />

  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <div className="flex items-center justify-between"><Label className="mb-0">{items.length} track{items.length > 1 ? 's' : ''}{ready.length > 1 && ` · ${fmtTime(total, 1)} merged`}</Label><Button variant="ghost" size="sm" onClick={reset}>Start over</Button></div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((x) => x.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2"><AnimatePresence initial={false}>
                {items.map((x, i) => <Row key={x.id} item={x} index={i} playing={playing === x.id} onPlay={() => preview(x)} onRemove={() => { if (playing === x.id) stopPreview(); setItems((l) => l.filter((k) => k.id !== x.id)); setResult(null) }} />)}
              </AnimatePresence></div>
            </SortableContext>
          </DndContext>
          {items.length < 2 && <Empty>Add at least one more track.</Empty>}
          <Dropzone compact multiple accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac,.opus,.webm" onFiles={add} label={<span className="inline-flex items-center gap-1.5"><Plus className="size-4" />Add more tracks</span>} sub="Drag rows by the handle to reorder." />
        </>}
        side={<>
          <div><Label>Transition</Label><Segmented value={mode} onChange={setMode} options={[{ value: 'gap', label: 'Gap / back-to-back' }, { value: 'crossfade', label: 'Crossfade' }]} /></div>
          {mode === 'gap' ? <Slider label="Silence between tracks" value={gap} onChange={setGap} min={0} max={10} step={0.5} suffix=" s" /> : <><Slider label="Crossfade length" value={xfade} onChange={setXfade} min={0.5} max={10} step={0.5} suffix=" s" /><div><Label>Fade shape</Label><Segmented value={curve} onChange={setCurve} options={[{ value: 'equal', label: 'Smooth (equal power)' }, { value: 'linear', label: 'Linear' }]} /><p className="mt-1 text-xs text-muted">Smooth keeps the loudness steady through the blend, which suits music. Linear dips slightly in the middle.</p></div></>}
          <div><Switch checked={norm} onChange={setNorm} label="Even out volume" /><p className="mt-1 text-xs text-muted">Peak-normalizes each track so none is much quieter.</p></div>
          <div><Label>Output</Label><Segmented value={fmt} onChange={setFmt} options={[{ value: 'wav', label: 'WAV' }, { value: 'mp3', label: 'MP3' }, { value: 'm4a', label: 'M4A' }, { value: 'ogg', label: 'OGG' }, { value: 'flac', label: 'FLAC' }]} /></div>
          {(fmt === 'mp3' || fmt === 'm4a' || fmt === 'ogg') && <div><Label>Bitrate</Label><Segmented value={br} onChange={setBr} options={['128', '192', '256', '320'].map((v) => ({ value: v, label: v }))} /></div>}
          <Button size="lg" className="w-full" icon={<ListMusic className="size-5" />} onClick={merge} loading={job.busy} disabled={ready.length < 2 || ready.length !== items.filter((x) => !x.error).length}>Merge {ready.length} tracks</Button>
          <JobPanel job={job} onRetry={merge} />
          {items.some((x) => x.error) && <Note tone="warn">Tracks that couldn't be decoded will be skipped.</Note>}
        </>}
      />
      {result && resultUrl && (
        <Reveal k={resultUrl}>
          <ResultCard blob={result} filename={`merged-${stamp()}.${fmt}`} title="Tracks merged" onReset={reset}>
            <audio src={resultUrl} controls className="w-full" />
          </ResultCard>
        </Reveal>
      )}
    </div>
  )
}
