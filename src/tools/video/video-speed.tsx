import { useEffect, useRef, useState } from 'react'
import { Gauge } from 'lucide-react'
import { Button, Dropzone, Label, ResultCard, Switch, ToolGrid, cn } from '@/components/ui'
import { baseName } from '@/lib/files'
import { ffRun, ffProbe, extFromBlob, atempoChain, X264 } from './_media/engine'
import { fmtTime, useMediaJob, useObjectUrl, useVideoMeta } from './_media/media'
import { FileBar, JobPanel, Note, Reveal, VideoStage } from './_media/ui'

const PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]
// slider is logarithmic so 0.25–1 and 1–4 get equal room
const toSlider = (s: number) => Math.log2(s)
const fromSlider = (v: number) => +Math.pow(2, v).toFixed(2)

export default function VideoSpeed() {
  const [file, setFile] = useState<File | null>(null)
  const { url, meta } = useVideoMeta(file)
  const video = useRef<HTMLVideoElement>(null)
  const [speed, setSpeed] = useState(2)
  const [keepPitch, setKeepPitch] = useState(true)
  const [result, setResult] = useState<Blob | null>(null)
  const resultUrl = useObjectUrl(result)
  const job = useMediaJob()

  // live preview using the browser's own playbackRate
  useEffect(() => {
    const v = video.current; if (!v) return
    v.playbackRate = speed
    ;(v as any).preservesPitch = keepPitch; (v as any).mozPreservesPitch = keepPitch; (v as any).webkitPreservesPitch = keepPitch
  }, [speed, keepPitch, url, meta])

  const reset = () => { if (job.busy) job.cancel(); setFile(null); setResult(null); job.reset() }
  const dur = meta?.duration || 0

  const go = () => job.run(async ({ setProgress, setLabel }) => {
    if (!file) return
    setResult(null); setLabel('Reading streams…')
    const input = 'in' + extFromBlob(file)
    const info = await ffProbe(file, input)
    const af = keepPitch ? atempoChain(speed) : `asetrate=${Math.round((info.sampleRate || 44100) * speed)},aresample=${info.sampleRate || 44100}`
    setLabel(`Re-timing to ${speed}×…`)
    const args = ['-i', input, '-filter:v', `setpts=PTS/${speed}`, ...(info.hasAudio ? ['-filter:a', af, '-c:a', 'aac', '-b:a', '160k'] : ['-an']), ...X264, '-crf', '21', '-movflags', '+faststart', 'out.mp4']
    const blob = await ffRun({ inputs: [{ name: input, file }], args, output: 'out.mp4', duration: (info.duration || dur) / speed || undefined, onProgress: setProgress })
    setResult(blob)
  })

  if (!file) return <Dropzone accept="video/*,.mkv,.avi,.mov,.m4v" onFiles={(f) => setFile(f[0])} label="Drop a video to change its speed" sub="Slow motion or time-lapse from 0.25× to 4× — processed locally." />

  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <FileBar file={file} onReset={reset} />
          <VideoStage ref={video} src={url} playable={meta?.playable !== false} />
          {meta?.playable && <p className="text-center text-xs text-muted">Press play to preview at {speed}× right here.</p>}
        </>}
        side={<>
          <div>
            <Label hint={`${speed}×`}>Speed</Label>
            <input type="range" min={-2} max={2} step={0.01} value={toSlider(speed)} onChange={(e) => setSpeed(fromSlider(+e.target.value))} className="w-full cursor-pointer accent-[var(--accent)]" aria-label="Speed" />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => <button key={p} onClick={() => setSpeed(p)} className={cn('rounded-lg px-2.5 py-1 font-mono text-xs transition cursor-pointer', speed === p ? 'bg-accent text-white' : 'bg-surface-2 text-muted hover:text-fg')}>{p}×</button>)}
            </div>
          </div>
          <div>
            <Switch checked={keepPitch} onChange={setKeepPitch} label="Keep audio pitch" />
            <p className="mt-1.5 text-xs text-muted">{keepPitch ? 'Voices sound natural at any speed (time-stretch).' : 'Pitch follows speed, like a tape — chipmunk when fast, deep when slow.'}</p>
          </div>
          {dur > 0 && <div className="flex justify-between rounded-xl bg-surface-2/60 px-3 py-2 text-sm"><span className="text-muted">New length</span><span className="font-mono">{fmtTime(dur, 1)} → <span className="font-semibold text-accent">{fmtTime(dur / speed, 1)}</span></span></div>}
          <Button size="lg" className="w-full" icon={<Gauge className="size-5" />} onClick={go} loading={job.busy} disabled={speed === 1}>Apply {speed}×</Button>
          <JobPanel job={job} onRetry={go} />
          {speed < 0.5 && <Note>Very slow speeds repeat frames; for smooth slow-motion the source should be high frame rate.</Note>}
        </>}
      />
      {result && resultUrl && (
        <Reveal k={resultUrl}>
          <ResultCard blob={result} filename={`${baseName(file.name)}-${speed}x.mp4`} title={`Speed changed to ${speed}×`} onReset={reset}>
            <video src={resultUrl} controls playsInline className="max-h-80 w-full rounded-xl bg-black" />
          </ResultCard>
        </Reveal>
      )}
    </div>
  )
}
