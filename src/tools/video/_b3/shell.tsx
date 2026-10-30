/* Shared shell for the Batch 3 video tools: drop a video, preview it, set options, run one
 * ffmpeg recipe from src/lib/b3/ffops.ts, show the result. */
import React, { useRef, useState } from 'react'
import { Button, Dropzone, ResultCard, ToolGrid } from '@/components/ui'
import { baseName } from '@/lib/files'
import { safeAudioCopy, type Op } from '@/lib/b3/ffops'
import { ffRun, ffProbe, extFromBlob, type ProbeInfo } from '../_media/engine'
import { fmtTime, useMediaJob, useObjectUrl, useVideoMeta, type VideoMeta, type MediaJob } from '../_media/media'
import { FileBar, JobPanel, Reveal, VideoStage, Note } from '../_media/ui'
import { capToSource, lowerQuality, sourceRate } from '../_media/bitrate'

export const VIDEO_ACCEPT = 'video/*,.mkv,.avi,.mov,.m4v,.flv,.wmv,.3gp,.ts,.mts,.m2ts,.mpg,.mpeg,.vob,.ogv'
export const inName = (f: Blob, stem = 'in') => stem + extFromBlob(f)

export interface Ctx { file: File; url: string | null; meta: VideoMeta | null; video: React.RefObject<HTMLVideoElement | null> }
/** `pixelScale`: output pixels over source pixels, when a recipe makes the picture bigger (resize, canvas, grid).
 * `cap: false` leaves the encoder uncapped (the input is not the main video, for example a slideshow). */
export interface RunOpts { pixelScale?: number; cap?: boolean; /** false: the result may be bigger than the source (do not retry smaller) */ pure?: boolean }
export interface RunHelpers { setProgress: (p: number) => void; setLabel: (s: string) => void; probe: () => Promise<ProbeInfo>; run: (op: Op, inputs: { name: string; file: Blob | Uint8Array }[], duration?: number, opts?: RunOpts) => Promise<Blob> }
export interface Output { blob: Blob; name: string; title?: string; note?: string }

export function VideoOpTool({ dropLabel, dropSub, accept = VIDEO_ACCEPT, main, side, action, icon, onRun, disabled, below, onReset }: {
  dropLabel: string; dropSub?: string; accept?: string
  main?: (c: Ctx) => React.ReactNode
  side: (c: Ctx) => React.ReactNode
  action: string; icon: React.ReactNode
  onRun: (c: Ctx, h: RunHelpers) => Promise<Output>
  disabled?: (c: Ctx) => boolean
  below?: (c: Ctx) => React.ReactNode
  onReset?: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const { url, meta } = useVideoMeta(file)
  const video = useRef<HTMLVideoElement>(null)
  const [out, setOut] = useState<Output | null>(null)
  const outUrl = useObjectUrl(out?.blob)
  const job = useMediaJob()
  const probeCache = useRef<{ f: File; p: Promise<ProbeInfo> } | null>(null)
  const sizeNote = useRef('')
  const reset = () => { if (job.busy) job.cancel(); setFile(null); setOut(null); job.reset(); probeCache.current = null; onReset?.() }

  if (!file) return <Dropzone accept={accept} onFiles={(f) => setFile(f[0])} label={dropLabel} sub={dropSub ?? 'MP4, MOV, WEBM, MKV, AVI and more. Processed on your device.'} />
  const ctx: Ctx = { file, url, meta, video }
  const go = () => job.run(async ({ setProgress, setLabel }) => {
    setOut(null)
    const probe = () => {
      if (!probeCache.current || probeCache.current.f !== file) probeCache.current = { f: file, p: ffProbe(file, inName(file)) }
      return probeCache.current.p
    }
    const run = async (op: Op, inputs: { name: string; file: Blob | Uint8Array }[], duration?: number, opts: RunOpts = {}) => {
      // only recipes that read this file need its probe
      const info = inputs.some((i) => i.file === file) ? await probe().catch(() => null) : null
      let args = op.args
      if (info) {
        // PCM, FLAC, Vorbis, AC-3 and Opus audio cannot be copied into an MP4 that plays everywhere
        args = safeAudioCopy(op, info.acodec).args
        // keep re-encodes near the source bitrate so an edit does not come back several times bigger
        if (opts.cap !== false) {
          const src = sourceRate(info, file.size, info.duration || meta?.duration || 0)
          // the output file name stays last, so the cap goes in front of it
          const outAt = args.lastIndexOf(op.output)
          if (outAt === args.length - 1) args = [...capToSource(args.slice(0, -1), { ...src, video: src.video * Math.max(1, opts.pixelScale ?? 1) }, 1.25), op.output]
        }
      }
      const expected = duration ?? (meta?.duration || undefined)
      const blob = await ffRun({ inputs, args, output: op.output, duration: expected, onProgress: setProgress })
      // A pure edit (same length, same or smaller picture, no new video or audio file) should not come back bigger than
      // the source. Very low bitrate clips can, because the encoder needs a minimum size per frame, so try once more
      // at a lower quality and keep whichever file is smaller.
      const srcDur = info?.duration || meta?.duration || 0
      const pure = info && opts.cap !== false && opts.pure !== false && (opts.pixelScale ?? 1) <= 1 && srcDur > 0 && (!expected || expected <= srcDur * 1.02)
        && inputs.every((i) => i.file === file || !(i.file instanceof Blob && /^(video|audio)\//.test(i.file.type)))
      if (!pure || blob.size <= file.size) return blob
      const smaller = lowerQuality(args, sourceRate(info, file.size, srcDur))
      if (!smaller) return blob
      setLabel('Making a smaller copy'); setProgress(0)
      const again = await ffRun({ inputs, args: smaller, output: op.output, duration: expected, onProgress: setProgress }).catch(() => null)
      const best = again && again.size < blob.size ? again : blob
      sizeNote.current = best.size <= file.size
        ? 'The first result came out bigger than your video, so it was made again at a slightly lower quality to keep it smaller.'
        : `Your video is already very compressed, so the edited copy is ${Math.round((best.size / file.size - 1) * 100)}% bigger. This is the smallest result that keeps the picture usable.`
      return best
    }
    setLabel('Reading streams')
    sizeNote.current = ''
    const r = await onRun(ctx, { setProgress, setLabel, probe, run })
    setOut(sizeNote.current ? { ...r, note: [r.note, sizeNote.current].filter(Boolean).join(' ') } : r)
  })
  const isVideoOut = out && /^video\//.test(out.blob.type) && !/x-matroska|x-msvideo/.test(out.blob.type)
  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <FileBar file={file} onReset={reset} extra={meta?.width ? <span className="hidden font-mono text-xs text-muted sm:inline">{meta.width}×{meta.height} · {fmtTime(meta.duration, 1)}</span> : null} />
          {main ? main(ctx) : <VideoStage ref={video} src={url} playable={meta?.playable !== false} />}
          {below?.(ctx)}
        </>}
        side={<>
          {side(ctx)}
          <Button size="lg" className="w-full" icon={icon} onClick={go} loading={job.busy} disabled={disabled?.(ctx)}>{action}</Button>
          <JobPanel job={job} onRetry={go} />
        </>}
      />
      {out && outUrl && (
        <Reveal k={outUrl}>
          <ResultCard blob={out.blob} filename={out.name} originalSize={file.size} title={out.title ?? 'Done'} onReset={reset}>
            {isVideoOut ? <video src={outUrl} controls playsInline className="max-h-80 w-full rounded-xl bg-black" /> : null}
            {out.note && <Note className="mt-2">{out.note}</Note>}
          </ResultCard>
        </Reveal>
      )}
    </div>
  )
}

export const outName = (file: File, suffix: string, ext = 'mp4') => `${baseName(file.name)}-${suffix}.${ext}`

/** Small inline second-file picker (audio track, logo, subtitles, second clip). */
export function FilePick({ file, onFile, accept, label, hint }: { file: File | null; onFile: (f: File | null) => void; accept: string; label: string; hint?: string }) {
  return file ? (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2/50 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1 truncate" title={file.name}>{file.name}</span>
      <Button size="sm" variant="ghost" onClick={() => onFile(null)}>Change</Button>
    </div>
  ) : <Dropzone compact accept={accept} onFiles={(f) => onFile(f[0])} label={label} sub={hint} />
}

/** Natural-size frame grabbed from the playing video, for region pickers. */
export function useStill(url: string | null, at = 0.5) {
  const [still, setStill] = useState<{ src: string; w: number; h: number } | null>(null)
  React.useEffect(() => {
    setStill(null)
    if (!url) return
    let alive = true
    const v = document.createElement('video')
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url
    v.onloadeddata = () => { v.currentTime = Math.min(at, (v.duration || 1) / 2) }
    v.onseeked = () => {
      if (!alive) return
      const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight
      c.getContext('2d')!.drawImage(v, 0, 0)
      setStill({ src: c.toDataURL('image/jpeg', 0.85), w: v.videoWidth, h: v.videoHeight })
      v.removeAttribute('src'); v.load()
    }
    return () => { alive = false }
  }, [url, at])
  return still
}

export type { MediaJob }
