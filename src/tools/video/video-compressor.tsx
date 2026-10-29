import { useMemo, useState } from 'react'
import { Minimize2, ArrowRight } from 'lucide-react'
import { Button, Dropzone, Input, Label, ResultCard, Segmented, Slider, Switch, ToolGrid, cn } from '@/components/ui'
import { baseName, formatBytes } from '@/lib/files'
import { KEPT_ORIGINAL_VIDEO, RETRY_FACTOR, audioArgs, notSmaller, planVideo, videoArgs, type VideoOptions, type VideoPlan, type VideoPreset, type VideoSource } from '@/lib/compress-guard'
import { ffProbe, ffRun, extFromBlob, isCancel } from './_media/engine'
import { fmtTime, useMediaJob, useObjectUrl, useVideoMeta } from './_media/media'
import { FileBar, JobPanel, Note, Reveal, Stat, VideoStage } from './_media/ui'

type Res = 'original' | '1080' | '720' | '480'
type Fps = 'original' | '30' | '24' | '15'
type Mode = 'preset' | 'target'
const MB = 1024 * 1024
const PRESETS: Record<VideoPreset, { crf: number; label: string; sub: string }> = {
  small: { crf: 30, label: 'Small file', sub: 'About a third of the size, some softness' },
  balanced: { crf: 27, label: 'Balanced', sub: 'About half the size, good for sharing' },
  high: { crf: 23, label: 'High quality', sub: 'About three quarters of the size, near original' },
}
type Result = { blob: Blob; kept: boolean; note?: string }

export default function VideoCompressor() {
  const [file, setFile] = useState<File | null>(null)
  const { url, meta } = useVideoMeta(file)
  const [mode, setMode] = useState<Mode>('preset')
  const [preset, setPreset] = useState<VideoPreset>('balanced')
  const [crf, setCrf] = useState(PRESETS.balanced.crf)
  const [targetMb, setTargetMb] = useState(8)
  const [res, setRes] = useState<Res>('original')
  const [fps, setFps] = useState<Fps>('original')
  const [noAudio, setNoAudio] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const resultUrl = useObjectUrl(result && !result.kept ? result.blob : null)
  const job = useMediaJob()

  const w = meta?.width || 0, h = meta?.height || 0, dur = meta?.duration || 0
  const short = Math.min(w, h)
  const targetBytes = mode === 'target' ? Math.max(0.1, targetMb) * MB : undefined
  const opts: VideoOptions = useMemo(() => ({ preset, res: res === 'original' ? 'original' : +res, noAudio, targetBytes }), [preset, res, noAudio, targetBytes])

  const plan = useMemo<VideoPlan | null>(() => {
    if (!file || !dur) return null
    return planVideo({ sizeBytes: file.size, duration: dur, width: w, height: h }, opts)
  }, [file, dur, w, h, opts])

  const pick = (p: VideoPreset) => { setPreset(p); setCrf(PRESETS[p].crf) }
  const reset = () => { if (job.busy) job.cancel(); setFile(null); setResult(null); job.reset() }

  const go = () => job.run(async ({ setProgress, setLabel }) => {
    if (!file) return
    setResult(null); setLabel('Reading the video')
    const probe = await ffProbe(file).catch((e) => { if (isCancel(e)) throw e; return null })
    const duration = dur || probe?.duration || 0
    const src: VideoSource = {
      sizeBytes: file.size, duration, width: w || probe?.width || 0, height: h || probe?.height || 0,
      fps: probe?.fps, hasAudio: probe ? probe.hasAudio : undefined, videoKbps: probe?.videoKbps, audioKbps: probe?.audioKbps, acodec: probe?.acodec,
    }
    if (!duration) throw new Error('Could not read the length of this video, so its size cannot be planned. Try converting it to MP4 first.')
    const landscape = (src.width || 16) >= (src.height || 9)
    const input = 'in' + extFromBlob(file)

    const encode = async (p: VideoPlan, from: number, span: number) => {
      const args = ['-i', input, ...videoArgs(p, crf, landscape, targetBytes ? 'abr' : 'cap'), ...(fps !== 'original' ? ['-r', fps] : []),
        ...audioArgs(p), '-movflags', '+faststart', 'out.mp4']
      return ffRun({ inputs: [{ name: input, file }], args, output: 'out.mp4', duration, onProgress: (x) => setProgress(from + x * span) })
    }
    const fits = (b: Blob) => !notSmaller(file.size, b.size) && (!targetBytes || b.size <= targetBytes)

    const first = planVideo(src, opts)
    if (first.tooSmall) throw new Error(`${formatBytes(targetBytes!)} is too small for a video this long. Pick a larger size, a lower resolution, or trim the video first.`)
    setLabel('Compressing')
    const a = await encode(first, 0, 1)
    if (fits(a)) { setResult({ blob: a, kept: false }); return }

    // not smaller (or over the target): try once more at a clearly lower bitrate
    const factor = targetBytes ? Math.min(0.85, (targetBytes / a.size) * 0.92) : RETRY_FACTOR
    setLabel('Second try at a lower bitrate'); setProgress(0)
    const b = await encode(planVideo(src, { ...opts, factor }), 0, 1)
    if (fits(b)) { setResult({ blob: b, kept: false, note: 'The first try was not small enough, so this is a second, lower bitrate version.' }); return }

    const best = a.size <= b.size ? a : b
    if (!notSmaller(file.size, best.size)) {
      setResult({ blob: best, kept: false, note: `Could not get under ${formatBytes(targetBytes!)} at this resolution. This is the smallest version. Pick a lower resolution to go further.` })
      return
    }
    setResult({ blob: file, kept: true })
  })

  if (!file) return <Dropzone accept="video/*,.mkv,.avi,.mov,.m4v" onFiles={(f) => setFile(f[0])} label="Drop a video to compress" sub="Output is H.264 MP4, plays everywhere. Processed on your device." />

  const srcKbps = dur ? Math.round((file.size * 8) / dur / 1000) : 0
  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <FileBar file={file} onReset={reset} />
          <VideoStage src={url} playable={meta?.playable !== false} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Original" value={formatBytes(file.size)} />
            <Stat label="Resolution" value={w ? `${w}×${h}` : '-'} />
            <Stat label="Duration" value={dur ? fmtTime(dur, 1) : '-'} />
            <Stat label="Bitrate" value={srcKbps ? `${srcKbps} kb/s` : '-'} />
          </div>
        </>}
        side={<>
          <div><Label>Mode</Label><Segmented value={mode} onChange={(m) => { setMode(m); setResult(null) }} options={[{ value: 'preset', label: 'Quality preset' }, { value: 'target', label: 'Fit under a size' }]} /></div>
          {mode === 'preset' ? <>
            <div className="grid gap-2">
              {(Object.keys(PRESETS) as VideoPreset[]).map((p) => (
                <button key={p} onClick={() => pick(p)} className={cn('rounded-xl border px-3 py-2 text-left transition cursor-pointer', preset === p ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50')}>
                  <div className="text-sm font-medium">{PRESETS[p].label}</div><div className="text-xs text-muted">{PRESETS[p].sub}</div>
                </button>
              ))}
            </div>
            <Slider label="Fine-tune (CRF, lower is better quality)" value={crf} onChange={setCrf} min={18} max={40} />
            <p className="-mt-2 text-[11px] text-muted">The size is capped by the preset, so the file never ends up bigger than planned.</p>
          </> : (
            <div>
              <Label hint={formatBytes(targetMb * MB)}>Largest file size (MB)</Label>
              <Input type="number" min={0.5} step={0.5} value={targetMb} onChange={(e) => setTargetMb(Math.max(0.1, +e.target.value || 0.1))} aria-label="Target size in MB" />
              <div className="mt-2 flex flex-wrap gap-1.5">{[8, 10, 25, 50].map((m) => <Button key={m} size="sm" variant={targetMb === m ? 'primary' : 'secondary'} onClick={() => setTargetMb(m)}>Under {m} MB</Button>)}</div>
              <p className="mt-2 text-xs text-muted">The bitrate is worked out from the length of the video so the file lands just under this size. Very small targets also lower the resolution.</p>
            </div>
          )}
          <div><Label>Resolution</Label><Segmented value={res} onChange={setRes} options={[{ value: 'original', label: 'Original' }, { value: '1080', label: '1080p' }, { value: '720', label: '720p' }, { value: '480', label: '480p' }]} />
            {res !== 'original' && short > 0 && short <= +res && <p className="mt-1.5 text-xs text-muted">Video is already {short}p or smaller, resolution kept.</p>}
          </div>
          <div><Label>Frame rate</Label><Segmented value={fps} onChange={setFps} options={[{ value: 'original', label: 'Original' }, { value: '30', label: '30' }, { value: '24', label: '24' }, { value: '15', label: '15' }]} /></div>
          <Switch checked={noAudio} onChange={setNoAudio} label="Remove audio" />
          {plan && (
            <div className="space-y-1 rounded-xl bg-surface-2/60 px-3 py-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted">Estimated output</span>
                <span className="flex items-center gap-1.5 font-mono">{formatBytes(file.size)}<ArrowRight className="size-3.5 text-muted" /><span className="font-semibold text-accent">about {formatBytes(Math.min(plan.estimateBytes, file.size))}</span></span>
              </div>
              <div className="text-[11px] text-muted">{plan.outWidth ? `${plan.outWidth}×${plan.outHeight}, ` : ''}video {plan.videoKbps} kb/s{plan.audioKbps ? `, audio ${plan.audioKbps} kb/s` : ', no audio'}</div>
              {plan.tooSmall && <div className="text-[11px] text-danger">This size is too small for a video this long.</div>}
              {!plan.tooSmall && plan.estimateBytes >= file.size * 0.97 && <div className="text-[11px] text-muted">This video is already very compact. If the result is not smaller, you get your original file back.</div>}
            </div>
          )}
          <Button size="lg" className="w-full" icon={<Minimize2 className="size-5" />} onClick={go} loading={job.busy}>Compress video</Button>
          <JobPanel job={job} onRetry={go} />
          {dur > 300 && <Note tone="warn">Long video: compression runs in your browser and may take a while. Lower resolutions are much faster.</Note>}
        </>}
      />
      {result && (
        <Reveal k={result.kept ? 'kept' : resultUrl ?? 'r'}>
          {result.kept ? (
            <ResultCard blob={file} filename={file.name} originalSize={file.size} title="Here is your original file" onReset={reset}>
              <Note tone="warn" className="mb-1">{KEPT_ORIGINAL_VIDEO} To go smaller, pick the Small file preset, a lower resolution, or Fit under a size.</Note>
            </ResultCard>
          ) : resultUrl && (
            <ResultCard blob={result.blob} filename={`${baseName(file.name)}-compressed.mp4`} originalSize={file.size} title={`Compressed, ${Math.round((1 - result.blob.size / file.size) * 100)}% smaller`} onReset={reset}>
              {result.note && <Note className="mb-3">{result.note}</Note>}
              <div className="grid gap-3 sm:grid-cols-2">
                <div><div className="mb-1 text-xs text-muted">Before · {formatBytes(file.size)}</div>{meta?.playable ? <video src={url!} controls playsInline className="aspect-video w-full rounded-xl bg-black" /> : <div className="grid aspect-video place-items-center rounded-xl bg-black text-xs text-white/60">No preview</div>}</div>
                <div><div className="mb-1 text-xs text-muted">After · {formatBytes(result.blob.size)}</div><video src={resultUrl} controls playsInline className="aspect-video w-full rounded-xl bg-black" /></div>
              </div>
            </ResultCard>
          )}
        </Reveal>
      )}
    </div>
  )
}
