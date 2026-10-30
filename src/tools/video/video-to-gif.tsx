import { useEffect, useRef, useState } from 'react'
import { Film, Play, Pause } from 'lucide-react'
import { Button, Dropzone, Field, Label, ResultCard, Segmented, Select, Slider, ToolGrid } from '@/components/ui'
import { baseName } from '@/lib/files'
import { ffRun, extFromBlob, ts } from './_media/engine'
import { fmtTime, useMediaJob, useObjectUrl, useThumbStrip, useVideoMeta } from './_media/media'
import { FileBar, JobPanel, Note, RangeTimeline, Reveal, TimeInput, VideoStage } from './_media/ui'

type Loop = '0' | '-1' | '2'
type Dither = 'sierra2_4a' | 'bayer' | 'none'
const MAX = 30

export default function VideoToGif() {
  const [file, setFile] = useState<File | null>(null)
  const { url, meta } = useVideoMeta(file)
  const duration = meta?.duration ?? 0
  const thumbs = useThumbStrip(meta?.playable ? url : null, duration, 12)
  const video = useRef<HTMLVideoElement>(null)
  const [range, setRange] = useState<[number, number]>([0, 0])
  const [cur, setCur] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [fps, setFps] = useState(12)
  const [width, setWidth] = useState('480')
  const [loop, setLoop] = useState<Loop>('0')
  const [dither, setDither] = useState<Dither>('sierra2_4a')
  const [colors, setColors] = useState('256')
  const [result, setResult] = useState<Blob | null>(null)
  const resultUrl = useObjectUrl(result)
  const job = useMediaJob()

  useEffect(() => { if (duration) setRange([0, Math.min(duration, 5)]) }, [duration])
  useEffect(() => {
    const v = video.current; if (!v) return
    let raf = 0
    const tick = () => { setCur(v.currentTime); if (!v.paused && v.currentTime >= range[1]) v.currentTime = range[0]; raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    const p = () => setPlaying(!v.paused)
    v.addEventListener('play', p); v.addEventListener('pause', p)
    return () => { cancelAnimationFrame(raf); v.removeEventListener('play', p); v.removeEventListener('pause', p) }
  }, [url, range, meta])

  const seek = (t: number) => { if (video.current) video.current.currentTime = t; setCur(t) }
  const toggle = () => { const v = video.current; if (!v) return; if (v.paused) { if (v.currentTime < range[0] || v.currentTime >= range[1]) v.currentTime = range[0]; v.play() } else v.pause() }
  const reset = () => { if (job.busy) job.cancel(); setFile(null); setResult(null); job.reset() }

  const [s, e] = range
  const len = Math.max(0, e - s)
  const outW = width === 'original' ? meta?.width || 0 : Math.min(+width, meta?.width || +width)
  const outH = meta?.width ? Math.round((outW / meta.width) * meta.height) : 0
  const frames = Math.round(len * fps)
  const estMB = outW && outH ? (outW * outH * frames * (dither === 'bayer' ? 0.22 : 0.32) * (+colors / 256) ** 0.3) / 1048576 : 0

  const go = () => job.run(async ({ setProgress, setLabel }) => {
    if (!file) return
    setResult(null); setLabel('Building palette & encoding GIF…')
    const input = 'in' + extFromBlob(file)
    const scale = width === 'original' ? '' : `scale='min(${width},iw)':-1:flags=lanczos,`
    const ditherOpt = dither === 'bayer' ? 'dither=bayer:bayer_scale=4' : `dither=${dither}`
    const vf = `fps=${fps},${scale}split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=${ditherOpt}:diff_mode=rectangle`
    const blob = await ffRun({ inputs: [{ name: input, file }], args: ['-ss', ts(s), '-t', ts(len), '-i', input, '-filter_complex', vf, '-loop', loop, 'out.gif'], output: 'out.gif', duration: len, onProgress: setProgress })
    setResult(blob)
  })

  if (!file) return <Dropzone accept="video/*,.mkv,.avi,.mov,.m4v" onFiles={(f) => setFile(f[0])} label="Drop a video to make a GIF" sub="Pick the moment, tune size & smoothness, get an optimized GIF, all offline." />

  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <FileBar file={file} onReset={reset} />
          <VideoStage ref={video} src={url} playable={meta?.playable !== false} muted />
          {duration > 0 && (
            <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
              <RangeTimeline duration={duration} start={s} end={e} current={cur} onSeek={seek} thumbs={thumbs} maxLen={MAX} onChange={(a, b) => setRange([a, b])} />
              <div className="flex justify-center"><Button size="sm" variant="outline" icon={playing ? <Pause className="size-4" /> : <Play className="size-4" />} onClick={toggle}>{playing ? 'Pause' : 'Preview loop'}</Button></div>
            </div>
          )}
        </>}
        side={<>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start</Label><TimeInput label="Start" value={s} max={e - 0.1} onChange={(v) => setRange([v, Math.min(e, v + MAX)])} /></div>
            <div><Label>End</Label><TimeInput label="End" value={e} min={s + 0.1} max={Math.min(duration || Infinity, s + MAX)} onChange={(v) => setRange([s, v])} /></div>
          </div>
          <Slider label="Frames per second" value={fps} onChange={setFps} min={5} max={30} suffix=" fps" />
          <div><Label>Width</Label><Segmented value={width} onChange={setWidth} options={[{ value: '320', label: '320' }, { value: '480', label: '480' }, { value: '640', label: '640' }, { value: '800', label: '800' }, { value: 'original', label: 'Orig.' }]} /></div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Loop"><Select value={loop} onChange={setLoop} options={[{ value: '0', label: 'Forever' }, { value: '-1', label: 'Play once' }, { value: '2', label: '3 times' }]} /></Field>
            <Field label="Colors"><Select value={colors} onChange={setColors} options={[{ value: '256', label: '256 (best)' }, { value: '128', label: '128' }, { value: '64', label: '64 (small)' }]} /></Field>
          </div>
          <div><Label>Dithering</Label><Segmented value={dither} onChange={setDither} options={[{ value: 'sierra2_4a', label: 'Smooth' }, { value: 'bayer', label: 'Pattern' }, { value: 'none', label: 'None' }]} /></div>
          <div className="rounded-xl bg-surface-2/60 px-3 py-2 text-xs text-muted">
            {fmtTime(len, 1)} · {frames} frames{outW ? ` · ${outW}×${outH}` : ''}{estMB ? <> · <span className="text-fg">≈{estMB < 1 ? `${Math.round(estMB * 1024)} KB` : `${estMB.toFixed(1)} MB`}</span></> : null}
          </div>
          {len > 15 && <Note tone="warn">GIFs over ~15 s get very large. Consider a shorter range, lower fps or width.</Note>}
          <Button size="lg" className="w-full" icon={<Film className="size-5" />} onClick={go} loading={job.busy} disabled={len < 0.1}>Create GIF</Button>
          <JobPanel job={job} onRetry={go} />
        </>}
      />
      {result && resultUrl && (
        <Reveal k={resultUrl}>
          <ResultCard blob={result} filename={`${baseName(file.name)}.gif`} title="Your GIF is ready" onReset={reset}>
            <div className="checker grid place-items-center overflow-hidden rounded-xl p-3"><img src={resultUrl} alt="GIF preview" className="max-h-96 max-w-full rounded-lg" /></div>
          </ResultCard>
        </Reveal>
      )}
    </div>
  )
}
