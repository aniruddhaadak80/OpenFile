import { useState } from 'react'
import { VolumeX, Zap } from 'lucide-react'
import { Button, Dropzone, ResultCard, ToolGrid } from '@/components/ui'
import { baseName } from '@/lib/files'
import { ffRun, extFromBlob } from './_media/engine'
import { fmtTime, useMediaJob, useObjectUrl, useVideoMeta } from './_media/media'
import { FileBar, JobPanel, Note, Reveal, VideoStage } from './_media/ui'

export default function MuteVideo() {
  const [file, setFile] = useState<File | null>(null)
  const { url, meta } = useVideoMeta(file)
  const [result, setResult] = useState<Blob | null>(null)
  const resultUrl = useObjectUrl(result)
  const job = useMediaJob()
  const reset = () => { if (job.busy) job.cancel(); setFile(null); setResult(null); job.reset() }
  const ext = file ? extFromBlob(file) : '.mp4'

  const go = () => job.run(async ({ setProgress, setLabel }) => {
    if (!file) return
    setResult(null); setLabel('Removing audio track…')
    const input = 'in' + ext, out = 'out' + ext
    const blob = await ffRun({ inputs: [{ name: input, file }], args: ['-i', input, '-map', '0:v', '-c', 'copy', '-an', ...(/\.(mp4|mov|m4v)$/.test(ext) ? ['-movflags', '+faststart'] : []), out], output: out, duration: meta?.duration || undefined, onProgress: setProgress })
    setResult(blob)
  })

  if (!file) return <Dropzone accept="video/*,.mkv,.avi,.mov,.m4v" onFiles={(f) => setFile(f[0])} label="Drop a video to mute" sub="Removes the sound without re-encoding — original quality, done in seconds." />

  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <FileBar file={file} onReset={reset} extra={meta?.duration ? <span className="font-mono text-xs text-muted">{fmtTime(meta.duration, 0)}</span> : null} />
          <VideoStage src={url} playable={meta?.playable !== false} />
        </>}
        side={<>
          <div className="flex gap-3 rounded-xl bg-surface-2/60 p-3 text-sm">
            <Zap className="mt-0.5 size-4 shrink-0 text-warn" />
            <div><div className="font-medium">Lossless & fast</div><div className="text-xs text-muted">The video stream is copied bit-for-bit; only the audio track is dropped. Output stays {ext.slice(1).toUpperCase()}.</div></div>
          </div>
          <Button size="lg" className="w-full" icon={<VolumeX className="size-5" />} onClick={go} loading={job.busy}>Mute video</Button>
          <JobPanel job={job} onRetry={go} />
          <Note>Want to keep the sound as a file? Use Extract Audio first.</Note>
        </>}
      />
      {result && resultUrl && (
        <Reveal k={resultUrl}>
          <ResultCard blob={result} filename={`${baseName(file.name)}-muted${ext}`} originalSize={file.size} title="Audio removed" onReset={reset}>
            {meta?.playable !== false && <video src={resultUrl} controls playsInline className="max-h-80 w-full rounded-xl bg-black" />}
          </ResultCard>
        </Reveal>
      )}
    </div>
  )
}
