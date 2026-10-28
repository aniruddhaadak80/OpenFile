import { useEffect, useRef, useState } from 'react'
import { Play, Pause, Scissors, ArrowLeftToLine, ArrowRightToLine, Repeat } from 'lucide-react'
import { Button, Dropzone, Label, ResultCard, Segmented, ToolGrid, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { baseName } from '@/lib/files'
import { ffRun, extFromBlob, ts, X264, VP8 } from './_media/engine'
import { fmtTime, useMediaJob, useObjectUrl, useThumbStrip, useVideoMeta } from './_media/media'
import { FileBar, JobPanel, Note, RangeTimeline, Reveal, TimeInput, VideoStage } from './_media/ui'

type Mode = 'copy' | 'accurate'
type Fmt = 'mp4' | 'webm'

export default function VideoTrimmer() {
  const [file, setFile] = useState<File | null>(null)
  const { url, meta } = useVideoMeta(file)
  const duration = meta?.duration ?? 0
  const thumbs = useThumbStrip(meta?.playable ? url : null, duration, 12)
  const video = useRef<HTMLVideoElement>(null)
  const [range, setRange] = useState<[number, number]>([0, 0])
  const [cur, setCur] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loopSel, setLoopSel] = useState(true)
  const [mode, setMode] = useState<Mode>('copy')
  const [fmt, setFmt] = useState<Fmt>('mp4')
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null)
  const resultUrl = useObjectUrl(result?.blob)
  const job = useMediaJob()
  const playSel = useRef(false)

  useEffect(() => { if (duration) setRange([0, duration]) }, [duration])
  useEffect(() => { if (file) setFmt(/webm$/i.test(file.name) || file.type.includes('webm') ? 'webm' : 'mp4') }, [file])

  // keep playhead in sync; stop/loop at the out point when previewing the selection
  useEffect(() => {
    const v = video.current; if (!v) return
    let raf = 0
    const loop = () => {
      setCur(v.currentTime)
      if (playSel.current && v.currentTime >= range[1]) {
        if (loopSel) v.currentTime = range[0]
        else { v.pause(); playSel.current = false }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    const onPlay = () => setPlaying(true), onPause = () => setPlaying(false)
    v.addEventListener('play', onPlay); v.addEventListener('pause', onPause)
    return () => { cancelAnimationFrame(raf); v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause) }
  }, [url, range, loopSel, meta])

  const seek = (t: number) => { if (video.current) video.current.currentTime = t; setCur(t) }
  const togglePlaySel = () => {
    const v = video.current; if (!v) return
    if (!v.paused) { v.pause(); playSel.current = false; return }
    if (v.currentTime < range[0] || v.currentTime >= range[1] - 0.05) v.currentTime = range[0]
    playSel.current = true; v.play()
  }
  const setIn = () => { const t = video.current?.currentTime ?? cur; if (t >= range[1] - 0.1) return toast('In point must be before the out point', 'error'); setRange([t, range[1]]) }
  const setOut = () => { const t = video.current?.currentTime ?? cur; if (t <= range[0] + 0.1) return toast('Out point must be after the in point', 'error'); setRange([range[0], t]) }

  // keyboard shortcuts: I / O / space
  useEffect(() => {
    if (!file) return
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'i' || e.key === 'I') { e.preventDefault(); setIn() }
      else if (e.key === 'o' || e.key === 'O') { e.preventDefault(); setOut() }
      else if (e.key === ' ' && (e.target as HTMLElement)?.tagName !== 'BUTTON') { e.preventDefault(); togglePlaySel() }
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })

  const reset = () => { if (job.busy) job.cancel(); setFile(null); setResult(null); job.reset(); setRange([0, 0]) }

  const inExt = file ? extFromBlob(file) : '.mp4'
  const sameContainer = inExt === `.${fmt}` || (fmt === 'mp4' && (inExt === '.mov' || inExt === '.m4v'))

  const encodeArgs = (out: string) => fmt === 'mp4'
    ? [...X264, '-crf', '20', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out]
    : [...VP8, '-crf', '10', '-b:v', '2M', '-c:a', 'libvorbis', '-b:a', '128k', out]

  const go = () => job.run(async ({ setProgress, setLabel }) => {
    if (!file) return
    setResult(null)
    const [s, e] = range; const len = e - s
    const input = 'in' + inExt, out = `out.${fmt}`
    let blob: Blob | null = null
    if (mode === 'copy') {
      setLabel('Cutting without re-encoding…')
      try {
        blob = await ffRun({ inputs: [{ name: input, file }], args: ['-ss', ts(s), '-i', input, '-t', ts(len), '-map', '0:v?', '-map', '0:a?', '-c', 'copy', '-avoid_negative_ts', 'make_zero', ...(fmt === 'mp4' ? ['-movflags', '+faststart'] : []), out], output: out, duration: len, onProgress: setProgress })
      } catch (err: any) {
        if (err?.name === 'CancelledError') throw err
        toast(`Lossless copy isn't possible for this file as ${fmt.toUpperCase()}, re-encoding instead.`, 'info')
      }
    }
    if (!blob) {
      setLabel('Re-encoding the selection…'); setProgress(0)
      blob = await ffRun({ inputs: [{ name: input, file }], args: ['-ss', ts(s), '-i', input, '-t', ts(len), ...encodeArgs(out)], output: out, duration: len, onProgress: setProgress })
    }
    setResult({ blob, name: `${baseName(file.name)}-trim-${fmtTime(s, 1).replace(/[:.]/g, '')}-${fmtTime(e, 1).replace(/[:.]/g, '')}.${fmt}` })
  })

  if (!file) return <Dropzone accept="video/*,.mkv,.avi,.mov,.m4v" onFiles={(f) => setFile(f[0])} label="Drop a video to trim" sub="MP4, WEBM, MOV, MKV… processed locally, nothing is uploaded." />

  const [s, e] = range
  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <FileBar file={file} onReset={reset} extra={meta?.width ? <span className="hidden font-mono text-xs text-muted sm:inline">{meta.width}×{meta.height} · {fmtTime(duration, 1)}</span> : null} />
          <VideoStage ref={video} src={url} playable={meta?.playable !== false} onTimeUpdate={(ev) => setCur((ev.target as HTMLVideoElement).currentTime)} />
          {duration > 0 ? (
            <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
              <RangeTimeline duration={duration} start={s} end={e} current={cur} onSeek={seek} thumbs={thumbs} onChange={(a, b) => setRange([a, b])} />
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button variant="outline" size="sm" icon={<ArrowLeftToLine className="size-4" />} onClick={setIn} title="Set start at playhead (I)">Set in <kbd className="ml-1 rounded bg-surface-2 px-1 text-[10px]">I</kbd></Button>
                <Button size="sm" icon={playing ? <Pause className="size-4" /> : <Play className="size-4" />} onClick={togglePlaySel} title="Play selection (Space)">{playing ? 'Pause' : 'Play selection'}</Button>
                <Button variant="outline" size="sm" icon={<ArrowRightToLine className="size-4" />} onClick={setOut} title="Set end at playhead (O)">Set out <kbd className="ml-1 rounded bg-surface-2 px-1 text-[10px]">O</kbd></Button>
                <button onClick={() => setLoopSel(!loopSel)} className={cn('inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-xs cursor-pointer', loopSel ? 'bg-accent/15 text-accent' : 'text-muted hover:text-fg')} title="Loop selection"><Repeat className="size-3.5" />Loop</button>
              </div>
              <p className="text-center text-xs text-muted">Drag the handles or the highlighted range · click the strip to seek · playhead {fmtTime(cur)}</p>
            </div>
          ) : meta && !meta.playable ? (
            <Note tone="warn">Your browser can't preview this file, so the visual timeline is unavailable. Type the start and end times on the right, trimming still works.</Note>
          ) : null}
        </>}
        side={<>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start</Label><TimeInput value={s} max={e - 0.05} onChange={(v) => setRange([v, e])} label="Start time" /></div>
            <div><Label>End</Label><TimeInput value={e} min={s + 0.05} max={duration || Infinity} onChange={(v) => setRange([s, v])} label="End time" /></div>
          </div>
          {!duration && meta && !meta.playable && <Note>Enter times like <span className="font-mono">0:12.5</span> or <span className="font-mono">72</span>.</Note>}
          <div className="flex items-center justify-between rounded-xl bg-surface-2/60 px-3 py-2 text-sm"><span className="text-muted">Clip length</span><span className="font-mono font-medium">{fmtTime(Math.max(0, e - s))}</span></div>
          <div>
            <Label>Mode</Label>
            <Segmented value={mode} onChange={setMode} className="w-full" options={[{ value: 'copy', label: 'Fast · lossless' }, { value: 'accurate', label: 'Accurate · re-encode' }]} />
            <p className="mt-2 text-xs text-muted">{mode === 'copy' ? 'Copies the streams as-is, instant and no quality loss. Cuts snap to the nearest keyframe, so the start may shift by up to a few seconds.' : 'Re-encodes for frame-accurate cuts. Slower, with a tiny quality cost.'}</p>
          </div>
          <div>
            <Label>Output format</Label>
            <Segmented value={fmt} onChange={setFmt} options={[{ value: 'mp4', label: 'MP4' }, { value: 'webm', label: 'WEBM' }]} />
            {mode === 'copy' && !sameContainer && <p className="mt-2 text-xs text-warn">Changing container may need re-encoding; we'll fall back automatically if the codecs don't fit.</p>}
          </div>
          <Button size="lg" className="w-full" icon={<Scissors className="size-5" />} onClick={go} loading={job.busy} disabled={!(e - s > 0.05)}>Trim video</Button>
          <JobPanel job={job} onRetry={go} />
        </>}
      />
      {result && resultUrl && (
        <Reveal k={resultUrl}>
          <ResultCard blob={result.blob} filename={result.name} originalSize={file.size} title="Your clip is ready" onReset={reset}>
            <video src={resultUrl} controls playsInline className="max-h-80 w-full rounded-xl bg-black" />
          </ResultCard>
        </Reveal>
      )}
    </div>
  )
}
