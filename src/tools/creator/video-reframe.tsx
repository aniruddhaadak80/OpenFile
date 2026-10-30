import { useState } from 'react'
import { safeBlobUrl } from '@/lib/safe'
import { Crop } from 'lucide-react'
import { Button, Dropzone, Label, Segmented, Slider, ToolGrid, ResultCard } from '@/components/ui'
import { baseName } from '@/lib/files'
import { safeBlobUrl } from '@/lib/safe'
import { ffRun, extFromBlob, X264 } from '@/tools/video/_media/engine'
import { useMediaJob, useObjectUrl, useVideoMeta, fmtTime } from '@/tools/video/_media/media'
import { JobPanel, FileBar, VideoStage } from '@/tools/video/_media/ui'

const RATIOS = { '9:16': [9, 16], '1:1': [1, 1], '4:5': [4, 5], '16:9': [16, 9] } as const
type Ratio = keyof typeof RATIOS
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

/** Build the ffmpeg filter for a reframe. Pure. */
export function reframeFilter(W: number, H: number, fill: 'blur' | 'color' | 'crop', pos: number, color: string, blur: number) {
  if (fill === 'crop') return `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}:(iw-${W})*${pos.toFixed(3)}:(ih-${H})*${pos.toFixed(3)},setsar=1,format=yuv420p`
  if (fill === 'color') return `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${color},setsar=1,format=yuv420p`
  return `split[a][b];[a]scale=${even(W / 4)}:${even(H / 4)}:force_original_aspect_ratio=increase,crop=${even(W / 4)}:${even(H / 4)},boxblur=${blur}:2,scale=${W}:${H}[bg];[b]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p`
}

export default function VideoReframe() {
  const [file, setFile] = useState<File | null>(null)
  const { url, meta } = useVideoMeta(file)
  const [ratio, setRatio] = useState<Ratio>('9:16')
  const [fill, setFill] = useState<'blur' | 'color' | 'crop'>('blur')
  const [pos, setPos] = useState(50)
  const [blur, setBlur] = useState(12)
  const [color, setColor] = useState('#000000')
  const [res, setRes] = useState<'720' | '1080'>('720')
  // the shape is stored with the result, so changing the shape later never relabels an older render
  const [out, setOut] = useState<{ blob: Blob; ratio: Ratio } | null>(null)
  const outUrl = useObjectUrl(out?.blob)
  const job = useMediaJob()
  const [rw, rh] = RATIOS[ratio], short = +res
  const W = even(rw <= rh ? short : (short * rw) / rh), H = even(rw <= rh ? (short * rh) / rw : short)

  const go = () => job.run(async ({ setProgress, setLabel }) => {
    setOut(null); setLabel('Reframing the video')
    const made = ratio
    const ext = extFromBlob(file!), inp = 'in' + ext
    const blob = await ffRun({ inputs: [{ name: inp, file: file! }], args: ['-i', inp, '-vf', reframeFilter(W, H, fill, pos / 100, color.replace('#', '0x'), blur), ...X264, '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', 'out.mp4'], output: 'out.mp4', duration: meta?.duration || undefined, onProgress: setProgress })
    setOut({ blob, ratio: made })
  })

  if (!file) return <Dropzone accept="video/*,.mkv,.mov,.m4v,.avi" onFiles={(f) => setFile(f[0])} label="Drop a video to reframe" sub="Turn a landscape video into a vertical 9:16 short, a square post or 4:5, with a blurred or solid background." />
  const prevAspect = `${rw} / ${rh}`
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <FileBar file={file} onReset={() => { if (job.busy) job.cancel(); setFile(null); setOut(null) }} extra={meta?.duration ? <span className="font-mono text-xs text-muted">{meta.width}×{meta.height} · {fmtTime(meta.duration, 0)}</span> : null} />
          {out && outUrl ? <ResultCard blob={out.blob} filename={`${baseName(file.name)}-${out.ratio.replace(':', 'x')}.mp4`} originalSize={file.size} title={`Reframed to ${out.ratio}`}><video src={safeBlobUrl(outUrl)} controls playsInline className="mx-auto max-h-[480px] rounded-xl bg-black" /></ResultCard> : (
            <div className="grid gap-3 sm:grid-cols-2">
              <VideoStage src={url} playable={meta?.playable !== false} />
              <div className="relative mx-auto max-h-[420px] w-full overflow-hidden rounded-2xl border border-border" style={{ aspectRatio: prevAspect, maxWidth: rw < rh ? 240 : undefined, background: fill === 'color' ? color : '#000' }} aria-label="Frame preview">
                {url && fill === 'blur' && <video src={url} muted autoPlay loop playsInline className="absolute inset-0 size-full scale-110 object-cover opacity-70 blur-xl" />}
                {url && <video src={url} muted autoPlay loop playsInline className="absolute inset-0 size-full" style={{ objectFit: fill === 'crop' ? 'cover' : 'contain', objectPosition: `${pos}% ${pos}%` }} />}
              </div>
            </div>
          )}
          <JobPanel job={job} onRetry={go} />
        </div>
      }
      side={
        <>
          <div><Label>New shape</Label><Segmented value={ratio} onChange={setRatio} options={[{ value: '9:16', label: '9:16' }, { value: '1:1', label: '1:1' }, { value: '4:5', label: '4:5' }, { value: '16:9', label: '16:9' }]} /></div>
          <div><Label>Fill the space with</Label><Segmented value={fill} onChange={setFill} options={[{ value: 'blur', label: 'Blur' }, { value: 'color', label: 'Colour' }, { value: 'crop', label: 'Crop in' }]} /></div>
          {fill === 'crop' && <Slider label="Focus position" value={pos} onChange={setPos} min={0} max={100} suffix="%" />}
          {fill === 'blur' && <Slider label="Blur" value={blur} onChange={setBlur} min={4} max={30} />}
          {fill === 'color' && <div className="flex items-center gap-2"><Label className="mb-0 flex-1">Colour</Label><input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Background colour" className="h-9 w-14 cursor-pointer rounded border border-border bg-transparent" /></div>}
          <div><Label hint={`${W}×${H}`}>Quality</Label><Segmented value={res} onChange={setRes} options={[{ value: '720', label: '720p (faster)' }, { value: '1080', label: '1080p' }]} /></div>
          {out && out.ratio !== ratio && !job.busy && <p className="text-xs text-muted">The result above is {out.ratio}. Press Reframe video to make a {ratio} version.</p>}
          <Button className="w-full" icon={<Crop className="size-4" />} loading={job.busy} onClick={go}>Reframe video</Button>
          <p className="text-xs text-muted">Encoding happens on your device. Expect roughly real time or slower for 720p, depending on your computer.</p>
        </>
      }
    />
  )
}
