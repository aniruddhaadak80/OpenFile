import { useRef, useState } from 'react'
import { ZoomIn, Eye } from 'lucide-react'
import { Button, Dropzone, Label, ResultCard, Segmented, Slider, ToolGrid, Spinner, Progress } from '@/components/ui'
import { baseName, formatBytes } from '@/lib/files'
import { toast } from '@/components/toast'
import { ffRun, extFromBlob, ts, X264 } from './_media/engine'
import { captureFrames, fmtTime, useEngine, useMediaJob, useObjectUrl, useVideoMeta } from './_media/media'
import { FileBar, JobPanel, Note, Reveal, Stat, VideoStage } from './_media/ui'

type Target = '1080' | '1440' | '2160'
const LABEL: Record<Target, string> = { '1080': '1080p', '1440': '1440p', '2160': '4K' }

function Compare({ before, after }: { before: string; after: string }) {
  const [x, setX] = useState(50)
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-black select-none">
      <img src={after} alt="Upscaled" className="block w-full" />
      <img src={before} alt="Original" className="absolute inset-0 h-full w-full object-cover [image-rendering:auto]" style={{ clipPath: `inset(0 ${100 - x}% 0 0)` }} />
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${x}%` }} />
      <span className="absolute top-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">Original</span>
      <span className="absolute top-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">Upscaled</span>
      <input type="range" min={0} max={100} value={x} onChange={(e) => setX(+e.target.value)} className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0" aria-label="Compare" />
    </div>
  )
}

export default function VideoUpscaler() {
  const [file, setFile] = useState<File | null>(null)
  const { url, meta } = useVideoMeta(file)
  const video = useRef<HTMLVideoElement>(null)
  const [target, setTarget] = useState<Target>('1080')
  const [sharp, setSharp] = useState(0.8)
  const [preview, setPreview] = useState<{ before: string; after: string } | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [result, setResult] = useState<Blob | null>(null)
  const resultUrl = useObjectUrl(result)
  const job = useMediaJob()
  const engine = useEngine()

  const w = meta?.width || 0, h = meta?.height || 0, dur = meta?.duration || 0
  const portrait = h > w
  const short = Math.min(w, h) || 0
  const tShort = +target
  const outW = w ? Math.round(((portrait ? tShort : (w / h) * tShort)) / 2) * 2 : 0
  const outH = w ? Math.round(((portrait ? (h / w) * tShort : tShort)) / 2) * 2 : 0
  const already = short >= tShort
  const vf = `scale=${portrait ? `${tShort}:-2` : `-2:${tShort}`}:flags=lanczos${sharp > 0 ? `,unsharp=5:5:${sharp.toFixed(2)}:5:5:0` : ''}`
  // rough wasm throughput: ~ 9 megapixels/s with ultrafast single-thread
  const estSec = outW && dur ? (outW * outH * 30 * dur) / 9e6 : 0

  const reset = () => { if (job.busy) job.cancel(); setFile(null); setResult(null); setPreview(null); job.reset() }

  const makePreview = async () => {
    if (!file) return
    setPreviewBusy(true)
    try {
      const t = video.current?.currentTime ?? Math.min(1, dur / 2)
      const input = 'in' + extFromBlob(file)
      const after = await ffRun({ inputs: [{ name: input, file }], args: ['-ss', ts(t), '-i', input, '-frames:v', '1', '-vf', vf, 'frame.png'], output: 'frame.png' })
      let before = ''
      if (meta?.playable && url) { const [b] = await captureFrames(url, [t], { type: 'image/png' }); before = URL.createObjectURL(b) }
      setPreview((p) => { if (p) { URL.revokeObjectURL(p.after); if (p.before) URL.revokeObjectURL(p.before) } return { before, after: URL.createObjectURL(after) } })
    } catch (e: any) { if (e?.name !== 'CancelledError') toast(e?.message || String(e), 'error') } finally { setPreviewBusy(false) }
  }

  const go = () => job.run(async ({ setProgress, setLabel }) => {
    if (!file) return
    setResult(null); setLabel(`Upscaling to ${LABEL[target]}…`)
    const input = 'in' + extFromBlob(file)
    const blob = await ffRun({ inputs: [{ name: input, file }], args: ['-i', input, '-vf', vf, ...X264, '-crf', '18', '-c:a', 'copy', '-movflags', '+faststart', 'out.mp4'], output: 'out.mp4', duration: dur || undefined, onProgress: setProgress })
      .catch(async (e) => {
        if (e?.name === 'CancelledError') throw e
        // audio codec may not fit MP4, retry with AAC
        return ffRun({ inputs: [{ name: input, file }], args: ['-i', input, '-vf', vf, ...X264, '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', 'out.mp4'], output: 'out.mp4', duration: dur || undefined, onProgress: setProgress })
      })
    setResult(blob)
  })

  if (!file) return <Dropzone accept="video/*,.mkv,.avi,.mov,.m4v" onFiles={(f) => setFile(f[0])} label="Drop a video to upscale" sub="Lanczos resampling + unsharp mask, up to 4K, runs entirely on your device." />

  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <FileBar file={file} onReset={reset} />
          {preview ? (
            <Reveal k={preview.after}>
              <div className="space-y-2">
                {preview.before ? <Compare before={preview.before} after={preview.after} /> : <img src={preview.after} alt="Upscaled frame" className="w-full rounded-xl border border-border" />}
                <div className="flex justify-between text-xs text-muted"><span>Drag across to compare · real output frame at {outW}×{outH}</span><button className="text-accent hover:underline cursor-pointer" onClick={() => setPreview(null)}>Back to video</button></div>
              </div>
            </Reveal>
          ) : <VideoStage ref={video} src={url} playable={meta?.playable !== false} />}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Source" value={w ? `${w}×${h}` : '-'} />
            <Stat label="Output" value={outW ? `${outW}×${outH}` : LABEL[target]} />
            <Stat label="Duration" value={dur ? fmtTime(dur, 0) : '-'} />
            <Stat label="Scale" value={short ? `${(tShort / short).toFixed(2)}×` : '-'} />
          </div>
        </>}
        side={<>
          <div><Label>Target resolution</Label><Segmented value={target} onChange={setTarget} options={(Object.keys(LABEL) as Target[]).map((t) => ({ value: t, label: LABEL[t] }))} /></div>
          {already && <Note tone="warn">This video is already {short}p, pick a higher target to upscale.</Note>}
          <Slider label="Sharpening" value={sharp} onChange={setSharp} min={0} max={1.5} step={0.1} />
          <Button variant="outline" className="w-full" icon={previewBusy ? undefined : <Eye className="size-4" />} onClick={makePreview} disabled={previewBusy || job.busy}>{previewBusy ? <Spinner label="Rendering frame…" /> : 'Preview a frame'}</Button>
          {previewBusy && engine.status === 'loading' && <Progress value={engine.loaded / engine.total} label={`Loading video engine (~30 MB, first time only) · ${formatBytes(engine.loaded)}`} />}
          <Note tone="warn">Upscaling is heavy work for a browser. {estSec ? <>Expect roughly <b>{estSec < 90 ? `${Math.max(1, Math.round(estSec))} s` : `${Math.round(estSec / 60)} min`}</b> for this clip; </> : null}4K takes far longer than 1080p. Keep the tab open.</Note>
          <Button size="lg" className="w-full" icon={<ZoomIn className="size-5" />} onClick={go} loading={job.busy} disabled={already}>Upscale to {LABEL[target]}</Button>
          <JobPanel job={job} onRetry={go} />
          <p className="text-xs text-muted">Classic resampling makes video bigger and crisper, but can't invent detail like AI upscalers.</p>
        </>}
      />
      {result && resultUrl && (
        <Reveal k={resultUrl}>
          <ResultCard blob={result} filename={`${baseName(file.name)}-${LABEL[target]}.mp4`} title={`Upscaled to ${LABEL[target]}`} onReset={reset}>
            <video src={resultUrl} controls playsInline className="max-h-96 w-full rounded-xl bg-black" />
          </ResultCard>
        </Reveal>
      )}
    </div>
  )
}
