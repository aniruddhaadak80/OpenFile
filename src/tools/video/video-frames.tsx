import { useEffect, useRef, useState } from 'react'
import { Images, Camera, Download, Check, X, Archive } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Dropzone, Label, Segmented, Slider, ToolGrid, Select, Input, Progress, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { baseName, downloadBlob, zipFiles, canvasToBlob } from '@/lib/files'
import { ffRunMany, extFromBlob, ts } from './_media/engine'
import { captureFrames, fmtTime, useMediaJob, useVideoMeta } from './_media/media'
import { FileBar, JobPanel, Note, TimeInput, VideoStage } from './_media/ui'

type Mode = 'interval' | 'fps' | 'single'
type Fmt = 'png' | 'jpg' | 'webp'
interface Frame { id: string; t: number; blob: Blob; url: string; name: string }
const MIME: Record<Fmt, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }
const MAX_FRAMES = 600
const tName = (t: number) => fmtTime(t, 2).replace(':', 'm').replace('.', 's') // 1m23s45

export default function VideoFrames() {
  const [file, setFile] = useState<File | null>(null)
  const { url, meta } = useVideoMeta(file)
  const video = useRef<HTMLVideoElement>(null)
  const [mode, setMode] = useState<Mode>('interval')
  const [every, setEvery] = useState('2')
  const [perSec, setPerSec] = useState(1)
  const [range, setRange] = useState<[number, number]>([0, 0])
  const [fmt, setFmt] = useState<Fmt>('jpg')
  const [quality, setQuality] = useState(90)
  const [width, setWidth] = useState('original')
  const [frames, setFrames] = useState<Frame[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [view, setView] = useState<Frame | null>(null)
  const job = useMediaJob()
  const [cur, setCur] = useState(0)
  const framesRef = useRef<Frame[]>([]); framesRef.current = frames
  useEffect(() => () => framesRef.current.forEach((f) => URL.revokeObjectURL(f.url)), [])
  useEffect(() => { if (meta?.duration) setRange([0, meta.duration]) }, [meta?.duration])

  const dur = meta?.duration || 0
  const [s, e] = range
  const step = mode === 'interval' ? Math.max(0.04, parseFloat(every) || 1) : 1 / perSec
  const count = mode === 'single' ? 1 : Math.max(1, Math.floor((e - s) / step) + 1)
  const base = file ? baseName(file.name) : 'frame'
  const W = width === 'original' ? undefined : +width

  const addFrames = (list: { t: number; blob: Blob }[]) => {
    const made = list.map((x) => ({ id: Math.random().toString(36).slice(2), t: x.t, blob: x.blob, url: URL.createObjectURL(x.blob), name: `${base}_${tName(x.t)}.${fmt}` }))
    setFrames((f) => [...f, ...made].sort((a, b) => a.t - b.t))
    return made
  }

  const grabSingle = async () => {
    const v = video.current
    if (!v || !meta?.playable) return toast('Preview unavailable for this format — use the interval modes.', 'error')
    const w = W ? Math.min(W, v.videoWidth) : v.videoWidth, h = Math.round((w / v.videoWidth) * v.videoHeight)
    const c = document.createElement('canvas'); c.width = w; c.height = h
    c.getContext('2d')!.drawImage(v, 0, 0, w, h)
    const blob = await canvasToBlob(c, MIME[fmt], quality / 100)
    const [f] = addFrames([{ t: v.currentTime, blob }])
    toast(`Captured frame at ${fmtTime(f.t)}`, 'success')
  }

  const extract = () => job.run(async ({ setProgress, setLabel, signal }) => {
    if (!file) return
    if (count > MAX_FRAMES) throw new Error(`That would create ${count} frames. Increase the interval or shorten the range (max ${MAX_FRAMES}).`)
    const times = Array.from({ length: count }, (_, i) => +(s + i * step).toFixed(3)).filter((t) => t <= (e || Infinity))
    if (meta?.playable && url) {
      setLabel(`Capturing ${times.length} frames…`)
      const got: { t: number; blob: Blob }[] = []
      await captureFrames(url, times, { width: W, type: MIME[fmt], quality: quality / 100, signal, onFrame: (i, blob, t) => { got.push({ t, blob }); setProgress((i + 1) / times.length); if (got.length % 12 === 0) addFrames(got.splice(0)) } })
      if (got.length) addFrames(got)
    } else {
      setLabel('Extracting frames with the video engine…')
      const input = 'in' + extFromBlob(file)
      const vf = [`fps=${1 / step}`, ...(W ? [`scale='min(${W},iw)':-2`] : [])].join(',')
      const out = await ffRunMany({ inputs: [{ name: input, file }], args: ['-ss', ts(s), ...(e ? ['-to', ts(e)] : []), '-i', input, '-vf', vf, ...(fmt === 'jpg' ? ['-q:v', String(Math.round(31 - (quality / 100) * 29))] : fmt === 'webp' ? ['-c:v', 'libwebp', '-quality', String(quality)] : []), '-f', 'image2', `f_%05d.${fmt}`], pattern: new RegExp(`^f_\\d+\\.${fmt}$`), duration: (e || dur) - s || undefined, onProgress: setProgress })
      addFrames(out.map((o, i) => ({ t: s + i * step, blob: o.blob })))
    }
  })

  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const chosen = sel.size ? frames.filter((f) => sel.has(f.id)) : frames
  const zip = async () => { const b = await zipFiles(chosen.map((f) => ({ name: f.name, data: f.blob }))); downloadBlob(b, `${base}-frames.zip`) }
  const clear = () => { frames.forEach((f) => URL.revokeObjectURL(f.url)); setFrames([]); setSel(new Set()) }
  const reset = () => { if (job.busy) job.cancel(); clear(); setFile(null); job.reset() }

  if (!file) return <Dropzone accept="video/*,.mkv,.avi,.mov,.m4v" onFiles={(f) => setFile(f[0])} label="Drop a video to grab frames" sub="Export stills every few seconds, at a set frame rate, or the exact frame you pause on." />

  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <FileBar file={file} onReset={reset} />
          <VideoStage ref={video} src={url} playable={meta?.playable !== false} onTimeUpdate={(ev) => setCur((ev.target as HTMLVideoElement).currentTime)} onSeeked={(ev) => setCur((ev.target as HTMLVideoElement).currentTime)} />
          {mode === 'single' && meta?.playable && <div className="flex justify-center"><Button icon={<Camera className="size-4" />} onClick={grabSingle}>Capture this frame</Button></div>}
        </>}
        side={<>
          <div><Label>Mode</Label><Segmented value={mode} onChange={setMode} options={[{ value: 'interval', label: 'Every N sec' }, { value: 'fps', label: 'N per sec' }, { value: 'single', label: 'At playhead' }]} /></div>
          {mode === 'interval' && <div><Label>Every (seconds)</Label><Input type="number" min={0.1} step={0.5} value={every} onChange={(ev) => setEvery(ev.target.value)} /></div>}
          {mode === 'fps' && <Slider label="Frames per second" value={perSec} onChange={setPerSec} min={1} max={30} suffix=" fps" />}
          {mode !== 'single' && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>From</Label><TimeInput value={s} max={e} onChange={(v) => setRange([v, e])} /></div>
              <div><Label>To</Label><TimeInput value={e} min={s} max={dur || Infinity} onChange={(v) => setRange([s, v])} /></div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Format</Label><Select value={fmt} onChange={setFmt} options={[{ value: 'jpg', label: 'JPG' }, { value: 'png', label: 'PNG' }, { value: 'webp', label: 'WEBP' }]} /></div>
            <div><Label>Width</Label><Select value={width} onChange={setWidth} options={[{ value: 'original', label: meta?.width ? `Original (${meta.width})` : 'Original' }, { value: '1280', label: '1280 px' }, { value: '640', label: '640 px' }, { value: '320', label: '320 px' }]} /></div>
          </div>
          {fmt !== 'png' && <Slider label="Quality" value={quality} onChange={setQuality} min={40} max={100} suffix="%" />}
          {mode === 'single' ? (
            <Button size="lg" className="w-full" icon={<Camera className="size-5" />} onClick={grabSingle} disabled={!meta?.playable}>Capture frame at {fmtTime(cur)}</Button>
          ) : (
            <>
              <div className={cn('rounded-xl px-3 py-2 text-sm', count > MAX_FRAMES ? 'bg-danger/10 text-danger' : 'bg-surface-2/60 text-muted')}>Will extract <b className="text-fg">{count}</b> frame{count > 1 ? 's' : ''}{count > MAX_FRAMES ? ` — max is ${MAX_FRAMES}` : ''}</div>
              <Button size="lg" className="w-full" icon={<Images className="size-5" />} onClick={extract} loading={job.busy} disabled={count > MAX_FRAMES || (!!dur && e <= s)}>Extract frames</Button>
            </>
          )}
          <JobPanel job={job} onRetry={extract} />
          {meta && !meta.playable && <Note>This format can't be decoded by your browser, so frames are extracted with the video engine instead.</Note>}
        </>}
      />

      {frames.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1 text-sm"><b>{frames.length}</b> frame{frames.length > 1 ? 's' : ''}{sel.size ? <span className="text-muted"> · {sel.size} selected</span> : null}</div>
            <Button variant="ghost" size="sm" onClick={() => setSel(sel.size === frames.length ? new Set() : new Set(frames.map((f) => f.id)))}>{sel.size === frames.length ? 'Select none' : 'Select all'}</Button>
            <Button variant="ghost" size="sm" onClick={clear}>Clear</Button>
            <Button size="sm" icon={<Archive className="size-4" />} onClick={zip}>Download {sel.size ? `${sel.size} selected` : 'all'} (ZIP)</Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <AnimatePresence initial={false}>
              {frames.map((f) => (
                <motion.div key={f.id} layout initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  className={cn('group relative overflow-hidden rounded-xl border bg-surface', sel.has(f.id) ? 'border-accent ring-2 ring-accent/30' : 'border-border')}>
                  <button onClick={() => setView(f)} className="block w-full cursor-zoom-in"><img src={f.url} alt={`Frame at ${fmtTime(f.t)}`} className="aspect-video w-full bg-black object-contain" loading="lazy" /></button>
                  <div className="flex items-center gap-1 px-2 py-1.5">
                    <span className="flex-1 font-mono text-[11px] text-muted">{fmtTime(f.t)}</span>
                    <button onClick={() => downloadBlob(f.blob, f.name)} className="rounded p-1 text-muted hover:text-accent cursor-pointer" aria-label="Download frame"><Download className="size-3.5" /></button>
                  </div>
                  <button onClick={() => toggle(f.id)} aria-label="Select" className={cn('absolute top-2 left-2 grid size-6 place-items-center rounded-md border transition cursor-pointer', sel.has(f.id) ? 'border-accent bg-accent text-white' : 'border-white/70 bg-black/30 text-transparent opacity-0 group-hover:opacity-100')}><Check className="size-4" /></button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}
      {job.busy && frames.length === 0 && <Progress value={job.progress} />}

      <AnimatePresence>
        {view && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur" onClick={() => setView(null)}>
            <motion.img initial={{ scale: 0.95 }} animate={{ scale: 1 }} src={view.url} alt="" className="max-h-[85vh] max-w-full rounded-xl" onClick={(ev) => ev.stopPropagation()} />
            <div className="absolute top-4 right-4 flex gap-2">
              <Button size="sm" icon={<Download className="size-4" />} onClick={(ev) => { ev.stopPropagation(); downloadBlob(view.blob, view.name) }}>Download</Button>
              <Button size="sm" variant="secondary" icon={<X className="size-4" />} onClick={() => setView(null)}>Close</Button>
            </div>
            <div className="absolute bottom-4 font-mono text-sm text-white/80">{fmtTime(view.t)} · {view.name}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
