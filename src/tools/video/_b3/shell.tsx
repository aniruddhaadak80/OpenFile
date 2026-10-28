/* Shared shell for the Batch 3 video tools: drop a video, preview it, set options, run one
 * ffmpeg recipe from src/lib/b3/ffops.ts, show the result. */
import React, { useRef, useState } from 'react'
import { Button, Dropzone, ResultCard, ToolGrid } from '@/components/ui'
import { baseName } from '@/lib/files'
import type { Op } from '@/lib/b3/ffops'
import { ffRun, ffProbe, extFromBlob, type ProbeInfo } from '../_media/engine'
import { fmtTime, useMediaJob, useObjectUrl, useVideoMeta, type VideoMeta, type MediaJob } from '../_media/media'
import { FileBar, JobPanel, Reveal, VideoStage, Note } from '../_media/ui'

export const VIDEO_ACCEPT = 'video/*,.mkv,.avi,.mov,.m4v,.flv,.wmv,.3gp,.ts,.mts,.m2ts,.mpg,.mpeg,.vob,.ogv'
export const inName = (f: Blob, stem = 'in') => stem + extFromBlob(f)

export interface Ctx { file: File; url: string | null; meta: VideoMeta | null; video: React.RefObject<HTMLVideoElement | null> }
export interface RunHelpers { setProgress: (p: number) => void; setLabel: (s: string) => void; probe: () => Promise<ProbeInfo>; run: (op: Op, inputs: { name: string; file: Blob | Uint8Array }[], duration?: number) => Promise<Blob> }
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
  const reset = () => { if (job.busy) job.cancel(); setFile(null); setOut(null); job.reset(); probeCache.current = null; onReset?.() }

  if (!file) return <Dropzone accept={accept} onFiles={(f) => setFile(f[0])} label={dropLabel} sub={dropSub ?? 'MP4, MOV, WEBM, MKV, AVI and more. Processed on your device.'} />
  const ctx: Ctx = { file, url, meta, video }
  const go = () => job.run(async ({ setProgress, setLabel }) => {
    setOut(null)
    const probe = () => {
      if (!probeCache.current || probeCache.current.f !== file) probeCache.current = { f: file, p: ffProbe(file, inName(file)) }
      return probeCache.current.p
    }
    const run = (op: Op, inputs: { name: string; file: Blob | Uint8Array }[], duration?: number) => ffRun({ inputs, args: op.args, output: op.output, duration: duration ?? (meta?.duration || undefined), onProgress: setProgress })
    setLabel('Reading streams')
    const r = await onRun(ctx, { setProgress, setLabel, probe, run })
    setOut(r)
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
