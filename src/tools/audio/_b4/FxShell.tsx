/* Shared shell for single-file ffmpeg audio effects (speed, volume, noise, reverse, EQ, silence).
 * Handles file pick, output format, progress/cancel, before/after players and download. */
import React, { useEffect, useState } from 'react'
import { Wand2, Headphones } from 'lucide-react'
import { Button, Dropzone, Label, Select, Segmented, ResultCard, ToolGrid } from '@/components/ui'
import { baseName } from '@/lib/files'
import { ffRun, ffProbe, extFromBlob } from '@/tools/video/_media/engine'
import { matchAudioKbps, sourceRate } from '@/tools/video/_media/bitrate'
import { audioCodecArgs } from '@/tools/video/_media/audio'
import { vorbisQuality } from '@/tools/video/_media/codec-args'
import { useMediaJob, useObjectUrl } from '@/tools/video/_media/media'
import { JobPanel, FileBar, Note } from '@/tools/video/_media/ui'

export type OutFmt = 'same' | 'mp3' | 'wav' | 'm4a' | 'ogg' | 'flac'
export const AUDIO_ACCEPT = 'audio/*,.mp3,.wav,.ogg,.oga,.m4a,.flac,.aac,.opus,.wma,.aiff,.aif,.amr,.ape,.wv,.webm'
export const AV_ACCEPT = AUDIO_ACCEPT + ',video/*,.mp4,.mov,.mkv,.avi,.m4v'

export const isVideoFile = (f: File) => f.type.startsWith('video/') || /\.(mp4|mov|mkv|avi|m4v|wmv|flv|3gp)$/i.test(f.name) || (/\.webm$/i.test(f.name) && !f.type.startsWith('audio/'))

export interface FxCtx {
  file: File; inName: string; isVideo: boolean; duration: number
  /** output file name inside ffmpeg (extension decides the container) */
  outName: string; outExt: string
  /** audio codec args for the chosen output */
  acodec: string[]
  /** video codec args when the input is a video (copy unless a video filter is used) */
  vcodec: (reencode: boolean) => string[]
  setLabel: (s: string) => void; setProgress: (p: number) => void
}

/** Duration of a media file via a hidden element (0 when the browser cannot read it). */
export function mediaDuration(file: Blob, video = false): Promise<number> {
  return new Promise((res) => {
    const el = document.createElement(video ? 'video' : 'audio')
    const u = URL.createObjectURL(file)
    const done = (d: number) => { URL.revokeObjectURL(u); res(Number.isFinite(d) && d > 0 ? d : 0) }
    el.preload = 'metadata'; el.onloadedmetadata = () => done(el.duration); el.onerror = () => done(0)
    setTimeout(() => done(0), 8000)
    el.src = u
  })
}

export function codecFor(ext: string, bitrate = 192) {
  if (ext === 'webm') return ['-c:a', 'libvorbis', '-q:a', vorbisQuality(bitrate)]
  if (ext === 'mp4' || ext === 'mov' || ext === 'm4v') return ['-c:a', 'aac', '-b:a', `${bitrate}k`]
  if (ext === 'mkv') return ['-c:a', 'aac', '-b:a', `${bitrate}k`]
  if (ext === 'avi') return ['-c:a', 'libmp3lame', '-b:a', `${bitrate}k`]
  return audioCodecArgs(ext, bitrate)
}

const AUDIO_EXTS = ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac', 'opus']

export function useFxFile(video: boolean) {
  const [file, setFile] = useState<File | null>(null)
  const [duration, setDuration] = useState(0)
  useEffect(() => { if (file) mediaDuration(file, video && isVideoFile(file)).then(setDuration); else setDuration(0) }, [file, video])
  return { file, setFile, duration }
}

export function FxShell({ accept = AUDIO_ACCEPT, allowVideo = false, dropLabel, dropSub, actionLabel, actionIcon, suffix, children, process, note, file: fileProp, onFile, defaultFmt = 'same', main }: {
  accept?: string; allowVideo?: boolean; dropLabel: string; dropSub: string; actionLabel: string; actionIcon?: React.ReactNode; suffix: string
  children?: React.ReactNode; note?: React.ReactNode; defaultFmt?: OutFmt
  /** run the effect; return the output blob */
  process: (ctx: FxCtx) => Promise<Blob>
  file?: File | null; onFile?: (f: File | null) => void
  main?: (file: File, duration: number) => React.ReactNode
}) {
  const [own, setOwn] = useState<File | null>(null)
  const file = fileProp !== undefined ? fileProp : own
  const setFile = (f: File | null) => { onFile ? onFile(f) : setOwn(f); setResult(null); job.reset() }
  const [duration, setDuration] = useState(0)
  const [fmt, setFmt] = useState<OutFmt>(defaultFmt)
  // 'same' matches the source bitrate, so an effect on a 128 kb/s MP3 does not come back 50% bigger at 192 kb/s
  const [bitrate, setBitrate] = useState('same')
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null)
  const job = useMediaJob()
  const isVideo = !!file && allowVideo && isVideoFile(file)
  const srcUrl = useObjectUrl(file)
  const outUrl = useObjectUrl(result?.blob)
  useEffect(() => { setDuration(0); if (file) mediaDuration(file, isVideo).then(setDuration) }, [file, isVideo])

  const inExt = file ? extFromBlob(file).slice(1) : 'mp3'
  const outExt = isVideo ? (['mp4', 'mov', 'mkv', 'webm', 'm4v'].includes(inExt) ? inExt : 'mp4') : fmt === 'same' ? (AUDIO_EXTS.includes(inExt) ? inExt : 'mp3') : fmt

  const go = () => file && job.run(async ({ setLabel, setProgress }) => {
    setResult(null); setLabel('Processing audio')
    const inName = 'in.' + (inExt || 'bin')
    const outName = 'out.' + outExt
    let kbps = +bitrate
    if (bitrate === 'same') {
      const info = await ffProbe(file, inName).catch(() => null)
      const lossless = !isVideo && ['wav', 'flac', 'aif', 'aiff'].includes(inExt)
      kbps = lossless ? 192 : matchAudioKbps(isVideo ? info?.audioKbps ?? 0 : sourceRate(info, file.size, duration).total)
      setLabel('Processing audio')
    }
    const blob = await process({
      file, inName, isVideo, duration, outName, outExt, acodec: codecFor(outExt, kbps),
      vcodec: (re) => (re ? (outExt === 'webm' ? ['-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '2M'] : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p']) : ['-c:v', 'copy']),
      setLabel, setProgress,
    })
    setResult({ blob, name: `${baseName(file.name)}-${suffix}.${outExt}` })
  })

  if (!file) return <Dropzone accept={accept} onFiles={(f) => setFile(f[0])} label={dropLabel} sub={dropSub} />
  const lossy = !['wav', 'flac'].includes(outExt)

  return (
    <ToolGrid
      main={<>
        <FileBar file={file} onReset={() => { if (job.busy) job.cancel(); setFile(null) }} />
        {main ? main(file, duration) : (
          <div className="space-y-2 rounded-2xl border border-border bg-surface p-4">
            <Label className="mb-0">Original</Label>
            {isVideo ? <video src={srcUrl ?? undefined} controls className="max-h-[45vh] w-full rounded-xl bg-black" /> : <audio src={srcUrl ?? undefined} controls className="w-full" />}
          </div>
        )}
        {result && outUrl && (
          <ResultCard blob={result.blob} filename={result.name} originalSize={file.size} onReset={() => setResult(null)} title="Done. Listen and download">
            {isVideo ? <video src={outUrl} controls className="max-h-[45vh] w-full rounded-xl bg-black" /> : <audio src={outUrl} controls className="w-full" />}
          </ResultCard>
        )}
      </>}
      side={<>
        {children}
        {!isVideo && (
          <div className="space-y-3">
            <div><Label>Output format</Label><Select value={fmt} onChange={setFmt} options={[{ value: 'same', label: `Same as input (${(AUDIO_EXTS.includes(inExt) ? inExt : 'mp3').toUpperCase()})` }, { value: 'mp3', label: 'MP3' }, { value: 'm4a', label: 'M4A (AAC)' }, { value: 'ogg', label: 'OGG Vorbis' }, { value: 'wav', label: 'WAV (lossless)' }, { value: 'flac', label: 'FLAC (lossless)' }]} /></div>
            {lossy && <div><Label>Bitrate (kbps)</Label><Segmented value={bitrate} onChange={setBitrate} options={[{ value: 'same', label: 'Same' }, '128', '192', '256', '320']} /><p className="mt-1 text-xs text-muted">{bitrate === 'same' ? 'Matches the original bitrate, so the file stays about the same size.' : `Encodes at ${bitrate} kb/s.`}</p></div>}
          </div>
        )}
        {isVideo && <Note>Video input: the picture is kept and only the sound is changed, so the result is ready to share.</Note>}
        {note}
        <Button size="lg" className="w-full" icon={actionIcon ?? <Wand2 className="size-5" />} onClick={go} loading={job.busy}>{actionLabel}</Button>
        <JobPanel job={job} onRetry={go} />
        {!job.busy && !result && <p className="flex gap-1.5 text-xs text-muted"><Headphones className="size-4 shrink-0" />Runs on your device with ffmpeg. The first run downloads the engine (about 30 MB) once.</p>}
      </>}
    />
  )
}

/** Run one ffmpeg pass with an audio filter chain, keeping any video stream. */
export function runAudioFilter(ctx: FxCtx, af: string, opts: { vf?: string; outDuration?: number; extra?: string[] } = {}) {
  const v = ctx.isVideo ? (opts.vf ? ['-filter:v', opts.vf, ...ctx.vcodec(true)] : ['-map', '0:v:0?', '-map', '0:a:0', ...ctx.vcodec(false)]) : ['-vn']
  return ffRun({
    inputs: [{ name: ctx.inName, file: ctx.file }],
    args: ['-i', ctx.inName, ...v, ...(af ? ['-af', af] : []), ...ctx.acodec, ...(opts.extra ?? []), ...(ctx.outExt === 'mp4' || ctx.outExt === 'm4a' || ctx.outExt === 'mov' ? ['-movflags', '+faststart'] : []), ctx.outName],
    output: ctx.outName, duration: opts.outDuration ?? (ctx.duration || undefined), onProgress: ctx.setProgress,
  })
}
