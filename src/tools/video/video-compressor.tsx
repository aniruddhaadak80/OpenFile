import { useMemo, useState } from 'react'
import { Minimize2, ArrowRight } from 'lucide-react'
import { Button, Dropzone, Label, ResultCard, Segmented, Slider, Switch, ToolGrid, cn } from '@/components/ui'
import { baseName, formatBytes } from '@/lib/files'
import { ffRun, extFromBlob, X264 } from './_media/engine'
import { fmtTime, useMediaJob, useObjectUrl, useVideoMeta } from './_media/media'
import { FileBar, JobPanel, Note, Reveal, Stat, VideoStage } from './_media/ui'

type Preset = 'small' | 'balanced' | 'high'
type Res = 'original' | '1080' | '720' | '480'
type Fps = 'original' | '30' | '24' | '15'
const PRESETS: Record<Preset, { crf: number; label: string; sub: string }> = {
  small: { crf: 32, label: 'Small file', sub: 'Smallest size, visible softness' },
  balanced: { crf: 28, label: 'Balanced', sub: 'Great for sharing & chat apps' },
  high: { crf: 23, label: 'High quality', sub: 'Near-original, modest savings' },
}

export default function VideoCompressor() {
  const [file, setFile] = useState<File | null>(null)
  const { url, meta } = useVideoMeta(file)
  const [preset, setPreset] = useState<Preset>('balanced')
  const [crf, setCrf] = useState(28)
  const [res, setRes] = useState<Res>('original')
  const [fps, setFps] = useState<Fps>('original')
  const [noAudio, setNoAudio] = useState(false)
  const [result, setResult] = useState<Blob | null>(null)
  const resultUrl = useObjectUrl(result)
  const job = useMediaJob()

  const w = meta?.width || 0, h = meta?.height || 0, dur = meta?.duration || 0
  const short = Math.min(w, h)
  const target = useMemo(() => {
    if (res === 'original' || !w || short <= +res) return { w, h }
    const k = +res / short
    return { w: Math.round((w * k) / 2) * 2, h: Math.round((h * k) / 2) * 2 }
  }, [res, w, h, short])

  const estimate = useMemo(() => {
    if (!file || !dur || !target.w) return null
    const f = fps === 'original' ? 30 : +fps
    const bpp = 0.14 * Math.pow(2, (23 - crf) / 6)
    const vbits = target.w * target.h * f * bpp * dur
    const abits = noAudio ? 0 : 96000 * dur
    const est = (vbits + abits) / 8
    return Math.min(est, file.size * 1.05)
  }, [file, dur, target, fps, crf, noAudio])

  const pick = (p: Preset) => { setPreset(p); setCrf(PRESETS[p].crf) }
  const reset = () => { if (job.busy) job.cancel(); setFile(null); setResult(null); job.reset() }

  const go = () => job.run(async ({ setProgress, setLabel }) => {
    if (!file) return
    setResult(null); setLabel('Compressing…')
    const input = 'in' + extFromBlob(file)
    const vf: string[] = []
    if (res !== 'original' && short > +res) vf.push(w >= h ? `scale=-2:${res}` : `scale=${res}:-2`)
    else if (res !== 'original' && !w) vf.push(`scale=-2:'min(${res},ih)'`)
    const args = ['-i', input, ...(vf.length ? ['-vf', vf.join(',')] : []), ...(fps !== 'original' ? ['-r', fps] : []), ...X264, '-crf', String(crf),
      ...(noAudio ? ['-an'] : ['-c:a', 'aac', '-b:a', '96k', '-ac', '2']), '-movflags', '+faststart', 'out.mp4']
    const blob = await ffRun({ inputs: [{ name: input, file }], args, output: 'out.mp4', duration: dur || undefined, onProgress: setProgress })
    setResult(blob)
  })

  if (!file) return <Dropzone accept="video/*,.mkv,.avi,.mov,.m4v" onFiles={(f) => setFile(f[0])} label="Drop a video to compress" sub="Output is H.264 MP4 — plays everywhere. Processed on your device." />

  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <FileBar file={file} onReset={reset} />
          <VideoStage src={url} playable={meta?.playable !== false} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Original" value={formatBytes(file.size)} />
            <Stat label="Resolution" value={w ? `${w}×${h}` : '—'} />
            <Stat label="Duration" value={dur ? fmtTime(dur, 1) : '—'} />
            <Stat label="Bitrate" value={dur ? `${Math.round((file.size * 8) / dur / 1000)} kb/s` : '—'} />
          </div>
        </>}
        side={<>
          <div>
            <Label>Quality preset</Label>
            <div className="grid gap-2">
              {(Object.keys(PRESETS) as Preset[]).map((p) => (
                <button key={p} onClick={() => pick(p)} className={cn('rounded-xl border px-3 py-2 text-left transition cursor-pointer', preset === p && crf === PRESETS[p].crf ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50')}>
                  <div className="text-sm font-medium">{PRESETS[p].label}</div><div className="text-xs text-muted">{PRESETS[p].sub}</div>
                </button>
              ))}
            </div>
          </div>
          <Slider label="Fine-tune (CRF — lower is better quality)" value={crf} onChange={setCrf} min={18} max={40} />
          <div><Label>Resolution</Label><Segmented value={res} onChange={setRes} options={[{ value: 'original', label: 'Original' }, { value: '1080', label: '1080p' }, { value: '720', label: '720p' }, { value: '480', label: '480p' }]} />
            {res !== 'original' && short && short <= +res && <p className="mt-1.5 text-xs text-muted">Video is already {short}p or smaller — resolution kept.</p>}
          </div>
          <div><Label>Frame rate</Label><Segmented value={fps} onChange={setFps} options={[{ value: 'original', label: 'Original' }, { value: '30', label: '30' }, { value: '24', label: '24' }, { value: '15', label: '15' }]} /></div>
          <Switch checked={noAudio} onChange={setNoAudio} label="Remove audio" />
          {estimate != null && (
            <div className="flex items-center justify-between rounded-xl bg-surface-2/60 px-3 py-2.5 text-sm">
              <span className="text-muted">Estimated output</span>
              <span className="flex items-center gap-1.5 font-mono">{formatBytes(file.size)}<ArrowRight className="size-3.5 text-muted" /><span className="font-semibold text-accent">≈{formatBytes(estimate)}</span></span>
            </div>
          )}
          <Button size="lg" className="w-full" icon={<Minimize2 className="size-5" />} onClick={go} loading={job.busy}>Compress video</Button>
          <JobPanel job={job} onRetry={go} />
          {dur > 300 && <Note tone="warn">Long video: compression runs in your browser and may take a while. Lower resolutions are much faster.</Note>}
        </>}
      />
      {result && resultUrl && (
        <Reveal k={resultUrl}>
          <ResultCard blob={result} filename={`${baseName(file.name)}-compressed.mp4`} originalSize={file.size} title={result.size < file.size ? 'Compressed!' : 'Done — but the file did not get smaller'} onReset={reset}>
            {result.size >= file.size && <Note tone="warn" className="mb-3">This video is already well compressed. Try a smaller preset or a lower resolution.</Note>}
            <div className="grid gap-3 sm:grid-cols-2">
              <div><div className="mb-1 text-xs text-muted">Before · {formatBytes(file.size)}</div>{meta?.playable ? <video src={url!} controls playsInline className="aspect-video w-full rounded-xl bg-black" /> : <div className="grid aspect-video place-items-center rounded-xl bg-black text-xs text-white/60">No preview</div>}</div>
              <div><div className="mb-1 text-xs text-muted">After · {formatBytes(result.size)}</div><video src={resultUrl} controls playsInline className="aspect-video w-full rounded-xl bg-black" /></div>
            </div>
          </ResultCard>
        </Reveal>
      )}
    </div>
  )
}
