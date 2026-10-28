/* Slide list + settings + ffmpeg export, shared by Images to Video and PDF to Video. */
import { useMemo, useState } from 'react'
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, rectSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Clapperboard, X } from 'lucide-react'
import { Button, Label, ResultCard, Segmented, Select, Slider, Switch, cn } from '@/components/ui'
import { slideshowOp, type Transition } from '@/lib/b3/ffops'
import { ColorInput } from '@/tools/image/_img/kit'
import { ffRun } from '../_media/engine'
import { fmtTime, useMediaJob, useObjectUrl } from '../_media/media'
import { JobPanel, Reveal } from '../_media/ui'
import { FilePick } from './shell'

export interface Slide { id: string; url: string; label: string; duration?: number; /** returns a JPEG/PNG ffmpeg can read */ load: () => Promise<Blob> }

const TRANSITIONS: { value: Transition; label: string }[] = [
  { value: 'fade', label: 'Crossfade' }, { value: 'fadeblack', label: 'Fade through black' }, { value: 'dissolve', label: 'Dissolve' },
  { value: 'wipeleft', label: 'Wipe left' }, { value: 'wiperight', label: 'Wipe right' }, { value: 'slideleft', label: 'Slide left' }, { value: 'slideright', label: 'Slide right' },
  { value: 'slideup', label: 'Slide up' }, { value: 'smoothleft', label: 'Smooth left' }, { value: 'circleopen', label: 'Circle open' }, { value: 'radial', label: 'Radial' },
  { value: 'zoomin', label: 'Zoom in' }, { value: 'pixelize', label: 'Pixelize' }, { value: 'none', label: 'Cut (no transition)' },
]
const SIZES = [
  { value: '1920x1080', label: '1080p 16:9' }, { value: '1280x720', label: '720p 16:9' }, { value: '1080x1920', label: 'Vertical 9:16' },
  { value: '1080x1080', label: 'Square 1:1' }, { value: '1080x1350', label: 'Portrait 4:5' }, { value: '1440x1080', label: '4:3' },
]

function Tile({ s, i, onRemove, onDur, perSlide }: { s: Slide; i: number; onRemove: () => void; onDur: (d: number) => void; perSlide: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn('group relative overflow-hidden rounded-xl border bg-surface-2/40', isDragging ? 'z-10 shadow-2xl ring-2 ring-accent' : 'border-border')}>
      <div {...attributes} {...listeners} className="grid aspect-video cursor-grab place-items-center bg-black/80 active:cursor-grabbing"><img src={s.url} alt={s.label} draggable={false} className="max-h-full max-w-full object-contain" /></div>
      <div className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted">
        <span className="truncate">{i + 1}. {s.label}</span>
        {perSlide && <input aria-label={`Seconds for slide ${i + 1}`} type="number" min={0.5} step={0.5} value={s.duration ?? 3} onChange={(e) => onDur(Math.max(0.5, +e.target.value || 0.5))} className="ml-auto w-12 rounded border border-border bg-surface px-1 text-right font-mono text-fg outline-none focus:border-accent" />}
      </div>
      <button onClick={onRemove} aria-label={`Remove slide ${i + 1}`} className="absolute right-1.5 top-1.5 rounded-lg bg-black/55 p-1 text-white opacity-0 transition group-hover:opacity-100 cursor-pointer max-sm:opacity-100"><X className="size-3.5" /></button>
    </div>
  )
}

export function SlideList({ slides, setSlides, perSlide }: { slides: Slide[]; setSlides: (s: Slide[]) => void; perSlide: boolean }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const onDragEnd = (e: DragEndEvent) => { const { active, over } = e; if (over && active.id !== over.id) setSlides(arrayMove(slides, slides.findIndex((x) => x.id === active.id), slides.findIndex((x) => x.id === over.id))) }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={slides.map((s) => s.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {slides.map((s, i) => <Tile key={s.id} s={s} i={i} perSlide={perSlide} onRemove={() => setSlides(slides.filter((x) => x.id !== s.id))} onDur={(d) => setSlides(slides.map((x) => (x.id === s.id ? { ...x, duration: d } : x)))} />)}
        </div>
      </SortableContext>
    </DndContext>
  )
}

export function useSlideshowSettings(defaultDur = 3) {
  const [dur, setDur] = useState(defaultDur)
  const [perSlide, setPerSlide] = useState(false)
  const [transition, setTransition] = useState<Transition>('fade')
  const [td, setTd] = useState(0.8)
  const [kenBurns, setKenBurns] = useState(true)
  const [size, setSize] = useState('1920x1080')
  const [fit, setFit] = useState<'fit' | 'fill'>('fit')
  const [bg, setBg] = useState('#000000')
  const [fps, setFps] = useState(30)
  const [music, setMusic] = useState<File | null>(null)
  const [fadeMusic, setFadeMusic] = useState(true)
  return { dur, setDur, perSlide, setPerSlide, transition, setTransition, td, setTd, kenBurns, setKenBurns, size, setSize, fit, setFit, bg, setBg, fps, setFps, music, setMusic, fadeMusic, setFadeMusic }
}
export type SlideshowSettings = ReturnType<typeof useSlideshowSettings>

export function SlideshowPanel({ s, slides, name, onReset, extra }: { s: SlideshowSettings; slides: Slide[]; name: string; onReset: () => void; extra?: React.ReactNode }) {
  const job = useMediaJob()
  const [result, setResult] = useState<Blob | null>(null)
  const url = useObjectUrl(result)
  const durations = slides.map((x) => (s.perSlide ? x.duration ?? s.dur : s.dur))
  const tdEff = s.transition === 'none' ? 0 : Math.min(s.td, ...durations.map((d) => d / 2))
  const total = useMemo(() => durations.reduce((a, b) => a + b, 0) - tdEff * Math.max(0, slides.length - 1), [durations, tdEff, slides.length])
  const go = () => job.run(async ({ setProgress, setLabel }) => {
    if (!slides.length) throw new Error('Add at least one slide.')
    setResult(null)
    const inputs: { name: string; file: Blob | Uint8Array }[] = []
    for (let i = 0; i < slides.length; i++) {
      setLabel(`Preparing slide ${i + 1} of ${slides.length}`); setProgress((i / slides.length) * 0.15)
      const b = await slides[i].load()
      inputs.push({ name: `s${String(i).padStart(3, '0')}.${b.type === 'image/png' ? 'png' : 'jpg'}`, file: b })
    }
    const [w, h] = s.size.split('x').map(Number)
    let audio: string | undefined
    if (s.music) { audio = 'music' + (s.music.name.match(/\.[a-z0-9]+$/i)?.[0] ?? '.mp3'); inputs.push({ name: audio, file: s.music }) }
    const op = slideshowOp(inputs.filter((x) => x.name.startsWith('s')).map((x, i) => ({ name: x.name, duration: durations[i] })), { w, h, fps: s.fps, transition: s.transition, td: s.td, kenBurns: s.kenBurns, fit: s.fit, bg: s.bg, audio, audioFade: s.fadeMusic })
    setLabel('Rendering video')
    const blob = await ffRun({ inputs, args: op.args, output: op.output, duration: total, onProgress: (p) => setProgress(0.15 + p * 0.85) })
    setResult(blob)
  })
  return (
    <div className="space-y-4">
      {extra}
      <Switch checked={s.perSlide} onChange={s.setPerSlide} label="Set time per slide" />
      {!s.perSlide && <Slider label="Seconds per slide" value={s.dur} onChange={s.setDur} min={0.5} max={15} step={0.5} suffix=" s" />}
      <div><Label>Transition</Label><Select value={s.transition} onChange={(v) => s.setTransition(v as Transition)} options={TRANSITIONS} /></div>
      {s.transition !== 'none' && <Slider label="Transition length" value={s.td} onChange={s.setTd} min={0.2} max={2} step={0.1} suffix=" s" />}
      <Switch checked={s.kenBurns} onChange={s.setKenBurns} label="Slow zoom (Ken Burns)" />
      <div><Label>Video size</Label><Select value={s.size} onChange={s.setSize} options={SIZES} /></div>
      <div><Label>Picture fit</Label><Segmented value={s.fit} onChange={s.setFit} options={[{ value: 'fit', label: 'Fit with bars' }, { value: 'fill', label: 'Fill and crop' }]} /></div>
      {s.fit === 'fit' && <div><Label>Bar colour</Label><ColorInput value={s.bg} onChange={s.setBg} /></div>}
      <div><Label>Music (optional)</Label><FilePick file={s.music} onFile={s.setMusic} accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac" label="Drop a song" /></div>
      {s.music && <Switch checked={s.fadeMusic} onChange={s.setFadeMusic} label="Fade music in and out" />}
      <p className="text-sm">Video length <span className="font-mono text-accent">{fmtTime(Math.max(0, total), 1)}</span></p>
      <Button size="lg" className="w-full" icon={<Clapperboard className="size-5" />} onClick={go} loading={job.busy} disabled={!slides.length}>Create video</Button>
      <JobPanel job={job} onRetry={go} />
      {result && url && (
        <Reveal k={url}>
          <ResultCard blob={result} filename={`${name}.mp4`} title="Video ready" onReset={onReset}>
            <video src={url} controls playsInline className="max-h-80 w-full rounded-xl bg-black" />
          </ResultCard>
        </Reveal>
      )}
    </div>
  )
}

/** Re-encode any browser-readable image to a JPEG ffmpeg can read, capped in size, with EXIF orientation applied. */
export async function normaliseImage(file: Blob, maxSide = 2560): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions).catch(async () => {
    const url = URL.createObjectURL(file); const img = new Image(); img.src = url; await img.decode(); URL.revokeObjectURL(url); return createImageBitmap(img)
  })
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s)
  const ctx = c.getContext('2d')!; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not prepare an image.'))), 'image/jpeg', 0.92))
}
