import { useEffect, useMemo, useRef, useState } from 'react'
import { Combine, GripVertical, X, Plus, Film } from 'lucide-react'
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Dropzone, Label, ResultCard, Segmented, ToolGrid, Empty } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { ffRun, ffProbe, extFromBlob, X264, type ProbeInfo } from './_media/engine'
import { captureFrames, fmtTime, probeVideo, stamp, useMediaJob, useObjectUrl } from './_media/media'
import { JobPanel, Note, Reveal } from './_media/ui'

interface Clip { id: string; file: File; url: string; duration: number; width: number; height: number; thumb?: string; playable: boolean }
type Res = 'auto' | '1080' | '720' | '480'
type Fit = 'pad' | 'crop'

function Row({ clip, index, onRemove }: { clip: Clip; index: number; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: clip.id })
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
      ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }}
      className={`flex items-center gap-3 rounded-xl border bg-surface p-2 pr-3 ${isDragging ? 'border-accent shadow-xl' : 'border-border'}`}>
      <button {...attributes} {...listeners} className="cursor-grab touch-none rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg active:cursor-grabbing" aria-label="Drag to reorder"><GripVertical className="size-4" /></button>
      <div className="font-mono text-xs text-muted w-5 text-center">{index + 1}</div>
      <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-surface-2">
        {clip.thumb ? <img src={clip.thumb} alt="" className="h-full w-full object-cover" /> : <Film className="absolute inset-0 m-auto size-5 text-muted" />}
        {clip.duration > 0 && <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 font-mono text-[10px] text-white">{fmtTime(clip.duration, 0)}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{clip.file.name}</div>
        <div className="text-xs text-muted">{clip.width ? `${clip.width}×${clip.height} · ` : ''}{formatBytes(clip.file.size)}</div>
      </div>
      <button onClick={onRemove} className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger cursor-pointer" aria-label="Remove"><X className="size-4" /></button>
    </motion.div>
  )
}

export default function MergeVideos() {
  const [clips, setClips] = useState<Clip[]>([])
  const [res, setRes] = useState<Res>('auto')
  const [fit, setFit] = useState<Fit>('pad')
  const [result, setResult] = useState<Blob | null>(null)
  const resultUrl = useObjectUrl(result)
  const job = useMediaJob()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  const live = useRef<Clip[]>([]); live.current = clips
  useEffect(() => () => live.current.forEach((c) => { URL.revokeObjectURL(c.url); if (c.thumb) URL.revokeObjectURL(c.thumb) }), [])

  const add = async (files: File[]) => {
    setResult(null)
    for (const file of files) {
      const id = Math.random().toString(36).slice(2)
      const url = URL.createObjectURL(file)
      setClips((c) => [...c, { id, file, url, duration: 0, width: 0, height: 0, playable: true }])
      probeVideo(url).then(async (m) => {
        setClips((c) => c.map((x) => (x.id === id ? { ...x, ...m } : x)))
        if (m.playable) {
          try { const [b] = await captureFrames(url, [Math.min(1, m.duration / 3)], { width: 240 }); const t = URL.createObjectURL(b); setClips((c) => c.map((x) => (x.id === id ? { ...x, thumb: t } : x))) } catch { /* no thumb */ }
        }
      })
    }
  }
  const remove = (id: string) => setClips((c) => { const x = c.find((k) => k.id === id); if (x) { URL.revokeObjectURL(x.url); if (x.thumb) URL.revokeObjectURL(x.thumb) } return c.filter((k) => k.id !== id) })
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (over && active.id !== over.id) setClips((c) => arrayMove(c, c.findIndex((x) => x.id === active.id), c.findIndex((x) => x.id === over.id)))
  }

  const target = useMemo(() => {
    const f = clips[0]
    const portrait = f && f.height > f.width
    if (res === 'auto') {
      if (!f?.width) return { w: 1280, h: 720 }
      return { w: Math.round(f.width / 2) * 2, h: Math.round(f.height / 2) * 2 }
    }
    const short = +res, long = Math.round((short * 16) / 9 / 2) * 2
    return portrait ? { w: short, h: long } : { w: long, h: short }
  }, [clips, res])
  const total = clips.reduce((a, c) => a + c.duration, 0)
  const mixed = new Set(clips.filter((c) => c.width).map((c) => `${c.width}x${c.height}`)).size > 1

  const go = () => job.run(async ({ setProgress, setLabel }) => {
    if (clips.length < 2) return
    setResult(null)
    const { w, h } = target
    const infos: ProbeInfo[] = []
    for (let i = 0; i < clips.length; i++) {
      setLabel(`Reading clip ${i + 1} of ${clips.length}…`); setProgress(i / clips.length * 0.05)
      infos.push(await ffProbe(clips[i].file, `p${i}${extFromBlob(clips[i].file)}`))
    }
    setLabel('Merging clips…')
    const parts: string[] = [], pairs: string[] = []
    const fitF = fit === 'pad' ? `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black` : `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`
    clips.forEach((c, i) => {
      const d = infos[i].duration || c.duration
      parts.push(`[${i}:v:0]${fitF},setsar=1,fps=30,format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[v${i}]`)
      parts.push(infos[i].hasAudio
        ? `[${i}:a:0]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[a${i}]`
        : `anullsrc=r=44100:cl=stereo,atrim=duration=${d.toFixed(3)},aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`)
      pairs.push(`[v${i}][a${i}]`)
    })
    const graph = `${parts.join(';')};${pairs.join('')}concat=n=${clips.length}:v=1:a=1[v][a]`
    const inputs = clips.map((c, i) => ({ name: `in${i}${extFromBlob(c.file)}`, file: c.file as Blob }))
    const args = [...inputs.flatMap((x) => ['-i', x.name]), '-filter_complex', graph, '-map', '[v]', '-map', '[a]', ...X264, '-crf', '22', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', 'out.mp4']
    const sum = infos.reduce((a, x, i) => a + (x.duration || clips[i].duration), 0)
    const blob = await ffRun({ inputs, args, output: 'out.mp4', duration: sum || undefined, onProgress: (p) => setProgress(0.05 + p * 0.95) })
    setResult(blob)
  })

  const reset = () => { if (job.busy) job.cancel(); clips.forEach((c) => URL.revokeObjectURL(c.url)); setClips([]); setResult(null); job.reset() }

  if (!clips.length) return <Dropzone multiple accept="video/*,.mkv,.avi,.mov,.m4v" onFiles={add} label="Drop the clips you want to join" sub="Add two or more videos — reorder them, then merge into one MP4." />

  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <div className="flex items-center justify-between"><Label className="mb-0">{clips.length} clip{clips.length > 1 ? 's' : ''} · {fmtTime(total, 0)} total</Label><Button variant="ghost" size="sm" onClick={reset}>Start over</Button></div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={clips.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2"><AnimatePresence initial={false}>{clips.map((c, i) => <Row key={c.id} clip={c} index={i} onRemove={() => remove(c.id)} />)}</AnimatePresence></div>
            </SortableContext>
          </DndContext>
          {clips.length < 2 && <Empty>Add at least one more clip to merge.</Empty>}
          <Dropzone compact multiple accept="video/*,.mkv,.avi,.mov,.m4v" onFiles={add} label={<span className="inline-flex items-center gap-1.5"><Plus className="size-4" />Add more clips</span>} sub="Drag rows by the handle to change the order." />
        </>}
        side={<>
          <div><Label hint={`${target.w}×${target.h}`}>Output resolution</Label><Segmented value={res} onChange={setRes} options={[{ value: 'auto', label: 'Clip 1' }, { value: '1080', label: '1080p' }, { value: '720', label: '720p' }, { value: '480', label: '480p' }]} /></div>
          <div>
            <Label>When sizes differ</Label>
            <Segmented value={fit} onChange={setFit} options={[{ value: 'pad', label: 'Fit (black bars)' }, { value: 'crop', label: 'Fill (crop)' }]} />
            {mixed && <p className="mt-1.5 text-xs text-warn">Your clips have different sizes — they'll be normalized to {target.w}×{target.h}.</p>}
          </div>
          <Note>All clips are re-encoded to H.264/AAC at 30 fps so they join seamlessly. Clips without sound get silent audio.</Note>
          <Button size="lg" className="w-full" icon={<Combine className="size-5" />} onClick={go} loading={job.busy} disabled={clips.length < 2}>Merge {clips.length} clips</Button>
          <JobPanel job={job} onRetry={go} />
        </>}
      />
      {result && resultUrl && (
        <Reveal k={resultUrl}>
          <ResultCard blob={result} filename={`merged-${stamp()}.mp4`} title="Clips merged" onReset={reset}>
            <video src={resultUrl} controls playsInline className="max-h-96 w-full rounded-xl bg-black" />
          </ResultCard>
        </Reveal>
      )}
    </div>
  )
}
