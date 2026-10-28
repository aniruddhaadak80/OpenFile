import { useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { Button, Dropzone, Label, ResultCard, Segmented, Switch, ToolGrid, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { baseName } from '@/lib/files'
import { ffRun, ffProbe, extFromBlob, isCancel, X264, VP8 } from './_media/engine'
import { fmtTime, useMediaJob, useObjectUrl, useVideoMeta } from './_media/media'
import { FileBar, JobPanel, Note, Reveal, ToolLink, VideoStage } from './_media/ui'

type Fmt = 'mp4' | 'webm' | 'mov' | 'mkv' | 'avi' | 'm4v' | '3gp' | 'flv' | 'wmv' | 'asf' | 'mpg' | 'ts' | 'vob' | 'ogv' | 'divx' | 'prores'
type Q = 'high' | 'medium' | 'low'
const FORMATS: Record<Fmt, { label: string; codecs: string; note: string; args: (crf: number) => string[] }> = {
  mp4: { label: 'MP4', codecs: 'H.264 + AAC', note: 'The universal choice, plays on every phone, browser, TV and editor.', args: (crf) => [...X264, '-crf', String(crf), '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart'] },
  webm: { label: 'WEBM', codecs: 'VP8 + Vorbis', note: 'Open format for the web. Great in browsers; not supported by some Apple apps.', args: (crf) => [...VP8, '-crf', String(Math.max(4, crf - 12)), '-b:v', crf <= 20 ? '4M' : crf <= 26 ? '2M' : '1M', '-c:a', 'libvorbis', '-b:a', '128k'] },
  mov: { label: 'MOV', codecs: 'H.264 + AAC', note: 'QuickTime container, best for Final Cut, iMovie and Apple workflows.', args: (crf) => [...X264, '-crf', String(crf), '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart'] },
  mkv: { label: 'MKV', codecs: 'H.264 + AAC', note: 'Flexible Matroska container, ideal for archiving and media players like VLC/Plex.', args: (crf) => [...X264, '-crf', String(crf), '-c:a', 'aac', '-b:a', '160k'] },
  avi: { label: 'AVI', codecs: 'MPEG-4 Part 2 + MP3', note: 'Legacy format for old players, DVD players and older software. Larger files.', args: (crf) => ['-c:v', 'mpeg4', '-q:v', String(crf <= 20 ? 3 : crf <= 26 ? 5 : 8), '-vtag', 'xvid', '-c:a', 'libmp3lame', '-b:a', '192k'] },
  // more formats (all encoders verified against the bundled ffmpeg.wasm core)
  m4v: { label: 'M4V', codecs: 'H.264 + AAC', note: 'Apple flavoured MP4 for iTunes, Apple TV and iOS.', args: (crf) => [...X264, '-crf', String(crf), '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-f', 'mp4'] },
  '3gp': { label: '3GP', codecs: 'H.264 Baseline + AAC', note: 'Small files for old and basic phones. Resized to 352×288 or less.', args: (crf) => ['-vf', "scale='min(352,iw)':-2", ...X264, '-profile:v', 'baseline', '-crf', String(crf + 2), '-c:a', 'aac', '-ar', '22050', '-ac', '1', '-b:a', '64k'] },
  flv: { label: 'FLV', codecs: 'H.264 + AAC', note: 'Flash Video, still used by some streaming and legacy players.', args: (crf) => [...X264, '-crf', String(crf), '-c:a', 'aac', '-ar', '44100', '-b:a', '128k'] },
  wmv: { label: 'WMV', codecs: 'WMV2 + WMA', note: 'Windows Media for old Windows PCs and PowerPoint.', args: (crf) => ['-c:v', 'wmv2', '-b:v', crf <= 20 ? '6M' : crf <= 26 ? '3M' : '1500k', '-c:a', 'wmav2', '-b:a', '160k'] },
  asf: { label: 'ASF', codecs: 'MS-MPEG4 + WMA', note: 'Advanced Systems Format for older Windows software and devices.', args: (crf) => ['-c:v', 'msmpeg4', '-q:v', String(crf <= 20 ? 3 : crf <= 26 ? 5 : 8), '-c:a', 'wmav2', '-b:a', '160k'] },
  mpg: { label: 'MPEG-2', codecs: 'MPEG-2 + MP2', note: 'MPG for DVD authoring tools, set-top boxes and broadcast software.', args: (crf) => ['-c:v', 'mpeg2video', '-q:v', String(crf <= 20 ? 2 : crf <= 26 ? 4 : 7), '-c:a', 'mp2', '-b:a', '192k', '-f', 'mpeg'] },
  ts: { label: 'TS', codecs: 'H.264 + AAC', note: 'MPEG transport stream for TVs, IPTV and camcorder (AVCHD) workflows.', args: (crf) => [...X264, '-crf', String(crf), '-c:a', 'aac', '-b:a', '160k', '-f', 'mpegts'] },
  vob: { label: 'VOB', codecs: 'MPEG-2 + AC-3', note: 'DVD video object. Use with DVD authoring software.', args: (crf) => ['-c:v', 'mpeg2video', '-q:v', String(crf <= 20 ? 2 : crf <= 26 ? 4 : 7), '-c:a', 'ac3', '-b:a', '192k', '-f', 'vob'] },
  ogv: { label: 'OGV', codecs: 'Theora + Vorbis', note: 'Fully open Ogg video, for Wikipedia and open source players.', args: (crf) => ['-c:v', 'libtheora', '-q:v', String(crf <= 20 ? 8 : crf <= 26 ? 6 : 4), '-c:a', 'libvorbis', '-q:a', '5'] },
  divx: { label: 'DivX', codecs: 'MPEG-4 ASP + MP3', note: 'AVI tagged for DivX certified DVD players and TVs.', args: (crf) => ['-c:v', 'mpeg4', '-vtag', 'DIVX', '-q:v', String(crf <= 20 ? 3 : crf <= 26 ? 5 : 8), '-c:a', 'libmp3lame', '-b:a', '192k'] },
  prores: { label: 'ProRes', codecs: 'ProRes 422 Proxy + PCM', note: 'MOV for editing in Final Cut, Premiere and DaVinci. Very large files.', args: () => ['-c:v', 'prores_ks', '-profile:v', '0', '-pix_fmt', 'yuv422p10le', '-c:a', 'pcm_s16le'] },
}
const OUT_EXT: Partial<Record<Fmt, string>> = { divx: 'avi', prores: 'mov' }
const extFor = (f: Fmt) => OUT_EXT[f] ?? f
const MAIN: Fmt[] = ['mp4', 'webm', 'mov', 'mkv', 'avi']
const MORE: Fmt[] = ['m4v', '3gp', 'flv', 'wmv', 'asf', 'mpg', 'ts', 'vob', 'ogv', 'divx', 'prores']
const PLAYABLE: Fmt[] = ['mp4', 'webm', 'mov', 'm4v']

/** Device presets pick a format and a size that the device is known to play. */
const DEVICES: { id: string; label: string; fmt: Fmt; scale?: string; extra?: string[] }[] = [
  { id: 'iphone', label: 'iPhone / iPad', fmt: 'mp4', scale: "scale='min(1920,iw)':-2", extra: ['-profile:v', 'high', '-level', '4.1'] },
  { id: 'android', label: 'Android phone', fmt: 'mp4', scale: "scale='min(1920,iw)':-2", extra: ['-profile:v', 'high'] },
  { id: 'kindle', label: 'Kindle Fire', fmt: 'mp4', scale: 'scale=1280:800:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2', extra: ['-profile:v', 'main'] },
  { id: 'psp', label: 'PSP', fmt: 'mp4', scale: 'scale=480:272:force_original_aspect_ratio=decrease,pad=480:272:(ow-iw)/2:(oh-ih)/2', extra: ['-profile:v', 'main', '-level', '3.0', '-r', '29.97'] },
  { id: 'xbox', label: 'Xbox / PlayStation', fmt: 'mp4', scale: "scale='min(1920,iw)':-2", extra: ['-profile:v', 'high'] },
  { id: 'tv', label: 'Smart TV / USB stick', fmt: 'mkv', scale: "scale='min(1920,iw)':-2" },
  { id: 'web', label: 'Web page (small)', fmt: 'mp4', scale: "scale='min(1280,iw)':-2" },
  { id: 'oldphone', label: 'Basic phone', fmt: '3gp' },
]
const CRF: Record<Q, number> = { high: 20, medium: 24, low: 29 }

export default function VideoConverter() {
  const [file, setFile] = useState<File | null>(null)
  const { url, meta } = useVideoMeta(file)
  const [fmt, setFmt] = useState<Fmt>('mp4')
  const [q, setQ] = useState<Q>('high')
  const [tryCopy, setTryCopy] = useState(true)
  const [device, setDevice] = useState('')
  const [showMore, setShowMore] = useState(false)
  const [result, setResult] = useState<{ blob: Blob; name: string; copied: boolean } | null>(null)
  const resultUrl = useObjectUrl(result?.blob)
  const job = useMediaJob()

  const reset = () => { if (job.busy) job.cancel(); setFile(null); setResult(null); job.reset() }
  const inExt = file ? extFromBlob(file).slice(1) : ''
  const dev = DEVICES.find((d) => d.id === device)
  const copyable = ['mp4', 'mov', 'mkv', 'm4v'].includes(fmt) && !dev

  const go = () => job.run(async ({ setProgress, setLabel }) => {
    if (!file) return
    setResult(null)
    const input = 'in' + extFromBlob(file), out = `out.${extFor(fmt)}`
    const dur = meta?.duration || undefined
    let blob: Blob | null = null, copied = false
    if (tryCopy && copyable) {
      setLabel('Checking codecs…')
      const info = await ffProbe(file, input)
      const vOk = fmt === 'mkv' || /^(h264|hevc|mpeg4)$/.test(info.vcodec ?? '')
      const aOk = fmt === 'mkv' || !info.hasAudio || /^(aac|mp3)$/.test(info.acodec ?? '')
      if (vOk && aOk && info.hasVideo) try {
        setLabel('Fast remux (no re-encode)…')
        blob = await ffRun({ inputs: [{ name: input, file }], args: ['-i', input, '-map', '0:v:0?', '-map', '0:a:0?', '-c', 'copy', ...(fmt === 'mp4' || fmt === 'mov' || fmt === 'm4v' ? ['-movflags', '+faststart'] : []), ...(fmt === 'm4v' ? ['-f', 'mp4'] : []), out], output: out, duration: dur, onProgress: setProgress })
        copied = true
      } catch (e) { if (isCancel(e)) throw e }
    }
    if (!blob) {
      setLabel(`Converting to ${FORMATS[fmt].label}…`); setProgress(0)
      const base = FORMATS[fmt].args(CRF[q])
      // a device preset adds its own size and profile on top of the format recipe
      const vfAt = base.indexOf('-vf')
      const args = dev?.scale ? (vfAt >= 0 ? base.map((a, i) => (i === vfAt + 1 ? `${a},${dev.scale}` : a)) : ['-vf', dev.scale, ...base]) : base
      blob = await ffRun({ inputs: [{ name: input, file }], args: ['-i', input, '-map', '0:v:0?', '-map', '0:a:0?', ...args, ...(dev?.extra && args.includes('libx264') ? dev.extra : []), out], output: out, duration: dur, onProgress: setProgress })
    }
    if (copied) toast('Remuxed instantly, no quality lost', 'success')
    setResult({ blob, name: `${baseName(file.name)}${dev ? '-' + dev.id : ''}.${extFor(fmt)}`, copied })
  })

  if (!file) return (
    <div className="space-y-4">
      <Dropzone accept="video/*,.mkv,.avi,.mov,.m4v,.flv,.f4v,.wmv,.asf,.3gp,.3g2,.ts,.mts,.m2ts,.mpg,.mpeg,.m2v,.vob,.ogv,.divx,.xvid,.mxf,.rm,.rmvb,.swf,.wtv,.dv" onFiles={(f) => setFile(f[0])} label="Drop a video to convert" sub="MP4, WEBM, MOV, MKV, AVI, FLV, WMV, 3GP, MPG, TS, VOB, MXF, RM and more. Stays on your device." />
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
              {[...MAIN, ...(showMore || MORE.includes(fmt) ? MORE : [])].map((f) => (
                <button key={f} onClick={() => { setFmt(f); setDevice('') }} className={cn('rounded-xl border py-2.5 text-sm font-semibold transition cursor-pointer', fmt === f ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:border-accent/50', f === inExt && 'relative')}>
                  {FORMATS[f].label}{f === inExt && <span className="absolute -top-2 right-1 rounded bg-surface-2 px-1 text-[9px] font-normal text-muted">current</span>}
                </button>
              ))}
              <Link to="/video-to-gif" className="rounded-xl border border-dashed border-border py-2.5 text-center text-sm font-semibold text-muted transition hover:border-accent hover:text-accent">GIF ↗</Link>
            </div>
            {!showMore && !MORE.includes(fmt) && <button onClick={() => setShowMore(true)} className="mt-2 text-xs font-medium text-accent hover:underline cursor-pointer">More formats (3GP, FLV, WMV, MPEG-2, TS, VOB, OGV, DivX, ProRes)</button>}
          </div>
          <div>
            <Label>Or pick a device</Label>
            <select value={device} onChange={(e) => { const d = DEVICES.find((x) => x.id === e.target.value); setDevice(e.target.value); if (d) setFmt(d.fmt) }} className="h-10 w-full cursor-pointer rounded-xl border border-border bg-surface-2/60 px-3 text-sm text-fg outline-none focus:border-accent">
              <option value="">No device preset</option>
              {DEVICES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
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
            {PLAYABLE.includes(fmt) ? <video src={resultUrl} controls playsInline className="max-h-80 w-full rounded-xl bg-black" /> : <Note>Browsers can't play {FORMATS[fmt].label} inline, but the file opens in VLC, your OS player and editors.</Note>}
          </ResultCard>
        </Reveal>
      )}
    </div>
  )
}
