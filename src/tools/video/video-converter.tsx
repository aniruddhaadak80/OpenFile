import { useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { Button, Dropzone, Label, ResultCard, Segmented, Switch, ToolGrid, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { baseName } from '@/lib/files'
import { ffRun, ffProbe, extFromBlob, isCancel, X264, VP8 } from './_media/engine'
import { fmtTime, useMediaJob, useObjectUrl, useVideoMeta } from './_media/media'
import { FileBar, JobPanel, Note, Reveal, ToolLink, VideoStage } from './_media/ui'

type Fmt = 'mp4' | 'webm' | 'mov' | 'mkv' | 'avi'
type Q = 'high' | 'medium' | 'low'
const FORMATS: Record<Fmt, { label: string; codecs: string; note: string; args: (crf: number) => string[] }> = {
  mp4: { label: 'MP4', codecs: 'H.264 + AAC', note: 'The universal choice — plays on every phone, browser, TV and editor.', args: (crf) => [...X264, '-crf', String(crf), '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart'] },
  webm: { label: 'WEBM', codecs: 'VP8 + Vorbis', note: 'Open format for the web. Great in browsers; not supported by some Apple apps.', args: (crf) => [...VP8, '-crf', String(Math.max(4, crf - 12)), '-b:v', crf <= 20 ? '4M' : crf <= 26 ? '2M' : '1M', '-c:a', 'libvorbis', '-b:a', '128k'] },
  mov: { label: 'MOV', codecs: 'H.264 + AAC', note: 'QuickTime container — best for Final Cut, iMovie and Apple workflows.', args: (crf) => [...X264, '-crf', String(crf), '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart'] },
  mkv: { label: 'MKV', codecs: 'H.264 + AAC', note: 'Flexible Matroska container — ideal for archiving and media players like VLC/Plex.', args: (crf) => [...X264, '-crf', String(crf), '-c:a', 'aac', '-b:a', '160k'] },
  avi: { label: 'AVI', codecs: 'MPEG-4 Part 2 + MP3', note: 'Legacy format for old players, DVD players and older software. Larger files.', args: (crf) => ['-c:v', 'mpeg4', '-q:v', String(crf <= 20 ? 3 : crf <= 26 ? 5 : 8), '-vtag', 'xvid', '-c:a', 'libmp3lame', '-b:a', '192k'] },
}
const CRF: Record<Q, number> = { high: 20, medium: 24, low: 29 }

export default function VideoConverter() {
  const [file, setFile] = useState<File | null>(null)
  const { url, meta } = useVideoMeta(file)
  const [fmt, setFmt] = useState<Fmt>('mp4')
  const [q, setQ] = useState<Q>('high')
  const [tryCopy, setTryCopy] = useState(true)
  const [result, setResult] = useState<{ blob: Blob; name: string; copied: boolean } | null>(null)
  const resultUrl = useObjectUrl(result?.blob)
  const job = useMediaJob()

  const reset = () => { if (job.busy) job.cancel(); setFile(null); setResult(null); job.reset() }
  const inExt = file ? extFromBlob(file).slice(1) : ''
  const copyable = fmt !== 'avi' && fmt !== 'webm'

  const go = () => job.run(async ({ setProgress, setLabel }) => {
    if (!file) return
    setResult(null)
    const input = 'in' + extFromBlob(file), out = `out.${fmt}`
    const dur = meta?.duration || undefined
    let blob: Blob | null = null, copied = false
    if (tryCopy && copyable) {
      setLabel('Checking codecs…')
      const info = await ffProbe(file, input)
      const vOk = fmt === 'mkv' || /^(h264|hevc|mpeg4)$/.test(info.vcodec ?? '')
      const aOk = fmt === 'mkv' || !info.hasAudio || /^(aac|mp3)$/.test(info.acodec ?? '')
      if (vOk && aOk && info.hasVideo) try {
        setLabel('Fast remux (no re-encode)…')
        blob = await ffRun({ inputs: [{ name: input, file }], args: ['-i', input, '-map', '0:v:0?', '-map', '0:a:0?', '-c', 'copy', ...(fmt === 'mp4' || fmt === 'mov' ? ['-movflags', '+faststart'] : []), out], output: out, duration: dur, onProgress: setProgress })
        copied = true
      } catch (e) { if (isCancel(e)) throw e }
    }
    if (!blob) {
      setLabel(`Converting to ${FORMATS[fmt].label}…`); setProgress(0)
      blob = await ffRun({ inputs: [{ name: input, file }], args: ['-i', input, '-map', '0:v:0?', '-map', '0:a:0?', ...FORMATS[fmt].args(CRF[q]), out], output: out, duration: dur, onProgress: setProgress })
    }
    if (copied) toast('Remuxed instantly — no quality lost', 'success')
    setResult({ blob, name: `${baseName(file.name)}.${fmt}`, copied })
  })

  if (!file) return (
    <div className="space-y-4">
      <Dropzone accept="video/*,.mkv,.avi,.mov,.m4v,.flv,.wmv,.3gp,.ts,.mts" onFiles={(f) => setFile(f[0])} label="Drop a video to convert" sub="MP4, WEBM, MOV, MKV, AVI, FLV, WMV, 3GP… — stays on your device." />
      <ToolLink to="/video-to-gif" title="Need an animated GIF?" sub="Use Video to GIF for an optimized palette and loop control." />
    </div>
  )

  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <FileBar file={file} onReset={reset} extra={meta?.width ? <span className="hidden font-mono text-xs text-muted sm:inline">{inExt.toUpperCase()} · {meta.width}×{meta.height} · {fmtTime(meta.duration, 1)}</span> : null} />
          <VideoStage src={url} playable={meta?.playable !== false} />
        </>}
        side={<>
          <div>
            <Label>Convert to</Label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(FORMATS) as Fmt[]).map((f) => (
                <button key={f} onClick={() => setFmt(f)} className={cn('rounded-xl border py-2.5 text-sm font-semibold transition cursor-pointer', fmt === f ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:border-accent/50', f === inExt && 'relative')}>
                  {FORMATS[f].label}{f === inExt && <span className="absolute -top-2 right-1 rounded bg-surface-2 px-1 text-[9px] font-normal text-muted">current</span>}
                </button>
              ))}
              <Link to="/video-to-gif" className="rounded-xl border border-dashed border-border py-2.5 text-center text-sm font-semibold text-muted transition hover:border-accent hover:text-accent">GIF ↗</Link>
            </div>
          </div>
          <div className="rounded-xl bg-surface-2/60 p-3 text-xs">
            <div className="mb-1 font-medium text-fg">{FORMATS[fmt].label} · {FORMATS[fmt].codecs}</div>
            <div className="text-muted">{FORMATS[fmt].note}</div>
          </div>
          <div><Label>Quality</Label><Segmented value={q} onChange={setQ} options={[{ value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Small' }]} /></div>
          {copyable && (
            <div>
              <Switch checked={tryCopy} onChange={setTryCopy} label="Fast remux when possible" />
              <p className="mt-1.5 text-xs text-muted">If the codecs already fit {FORMATS[fmt].label}, streams are copied in seconds with zero quality loss. Otherwise we re-encode.</p>
            </div>
          )}
          <Button size="lg" className="w-full" icon={<RefreshCw className="size-5" />} onClick={go} loading={job.busy}>Convert to {FORMATS[fmt].label}</Button>
          <JobPanel job={job} onRetry={go} />
          {fmt === inExt && <Note>The file is already {FORMATS[fmt].label}. Converting re-packages or re-encodes it with the codecs above.</Note>}
        </>}
      />
      {result && resultUrl && (
        <Reveal k={resultUrl}>
          <ResultCard blob={result.blob} filename={result.name} originalSize={file.size} title={result.copied ? 'Converted (lossless remux)' : 'Converted'} onReset={reset}>
            {['mp4', 'webm', 'mov'].includes(fmt) ? <video src={resultUrl} controls playsInline className="max-h-80 w-full rounded-xl bg-black" /> : <Note>Browsers can't play {FORMATS[fmt].label} inline, but the file opens in VLC, your OS player and editors.</Note>}
          </ResultCard>
        </Reveal>
      )}
    </div>
  )
}
