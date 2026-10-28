import { useState } from 'react'
import { Download, Film, Image as ImageIcon } from 'lucide-react'
import { Button, Dropzone, ErrorNote, Label, Segmented, Slider, ToolGrid } from '@/components/ui'
import { baseName, downloadBlob } from '@/lib/files'
import { type Anim, videoToAnim } from '@/lib/b3/anim'
import { extractMotion, type MotionParts } from '@/lib/b3/motion'
import { ffRun } from '@/tools/video/_media/engine'
import { useMediaJob, useObjectUrl } from '@/tools/video/_media/media'
import { JobPanel, Note } from '@/tools/video/_media/ui'
import { ExportPanel } from './_b3/anim-ui'

const KIND: Record<MotionParts['kind'], string> = { google: 'Google Motion Photo', samsung: 'Samsung Motion Photo', livp: 'Apple Live Photo', embedded: 'Photo with an embedded clip' }

export default function MotionPhotoExtractor() {
  const [file, setFile] = useState<File | null>(null)
  const [parts, setParts] = useState<MotionParts | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [anim, setAnim] = useState<Anim | null>(null)
  const [fps, setFps] = useState(12), [width, setWidth] = useState('480')
  const job = useMediaJob()
  const videoBlob = parts ? new Blob([parts.video as BlobPart], { type: parts.videoExt === 'mov' ? 'video/quicktime' : 'video/mp4' }) : null
  const videoUrl = useObjectUrl(videoBlob)
  const stillUrl = useObjectUrl(parts && parts.still.length && parts.stillExt !== 'heic' ? new Blob([parts.still as BlobPart], { type: 'image/jpeg' }) : null)
  const open = async (f: File) => {
    setFile(f); setError(null); setParts(null); setAnim(null)
    try { setParts(extractMotion(new Uint8Array(await f.arrayBuffer()), f.name)) } catch (e: any) { setError(e?.message || String(e)) }
  }
  const toMp4 = () => job.run(async ({ setProgress, setLabel }) => {
    if (!videoBlob || !file) return
    setLabel('Converting to MP4')
    const out = await ffRun({ inputs: [{ name: `in.${parts!.videoExt}`, file: videoBlob }], args: ['-i', `in.${parts!.videoExt}`, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', 'out.mp4'], output: 'out.mp4', onProgress: setProgress })
    downloadBlob(out, `${baseName(file.name)}-motion.mp4`)
  })
  const toGif = () => job.run(async ({ setProgress, setLabel }) => {
    if (!videoBlob) return
    setLabel('Reading frames')
    setAnim(await videoToAnim(new File([videoBlob], `clip.${parts!.videoExt}`, { type: videoBlob.type }), { fps, width: +width || undefined, onProgress: setProgress }))
  })
  const reset = () => { setFile(null); setParts(null); setAnim(null) }
  if (!file) return <Dropzone accept="image/jpeg,image/heic,.jpg,.jpeg,.heic,.livp,.zip" onFiles={(f) => open(f[0])} label="Drop a motion photo or Live Photo" sub="Google Pixel (MP / MVIMG), Samsung motion photos and Apple .livp bundles." />
  if (!parts || !file) return <div className="space-y-3"><ErrorNote error={error} /><Note>On iPhone, Live Photos are two files (a HEIC and a MOV). Exporting with “Include all photos data” or sharing as a .livp keeps them together.</Note><Button variant="outline" onClick={reset}>Try another file</Button></div>
  return (
    <ToolGrid
      main={<>
        <div className="flex items-center justify-between"><span className="truncate text-sm font-medium">{file.name}</span><Button variant="ghost" size="sm" onClick={reset}>Start over</Button></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>Motion clip</Label>{videoUrl && <video src={videoUrl} controls autoPlay loop muted playsInline className="w-full rounded-xl bg-black" />}</div>
          <div className="space-y-1"><Label>Still photo</Label>{stillUrl ? <img src={stillUrl} alt="Still" className="w-full rounded-xl" /> : <div className="grid aspect-video place-items-center rounded-xl bg-surface-2 text-xs text-muted">{parts.stillExt.toUpperCase()} still (preview not shown)</div>}</div>
        </div>
        <p className="text-xs text-muted">{KIND[parts.kind]}. The clip is {(parts.video.length / 1024 / 1024).toFixed(2)} MB.</p>
      </>}
      side={<>
        <Button className="w-full" icon={<Download className="size-4" />} onClick={() => videoBlob && downloadBlob(videoBlob, `${baseName(file.name)}-motion.${parts.videoExt}`)}>Save clip as {parts.videoExt.toUpperCase()} (original)</Button>
        <Button variant="outline" className="w-full" icon={<Film className="size-4" />} onClick={toMp4} loading={job.busy}>Convert clip to MP4</Button>
        {parts.still.length > 0 && <Button variant="outline" className="w-full" icon={<ImageIcon className="size-4" />} onClick={() => downloadBlob(new Blob([parts.still as BlobPart], { type: parts.stillExt === 'heic' ? 'image/heic' : 'image/jpeg' }), `${baseName(file.name)}-still.${parts.stillExt}`)}>Save still without the clip</Button>}
        <div className="space-y-3 border-t border-border pt-4">
          <Label>Make a GIF</Label>
          <Slider label="Frames per second" value={fps} onChange={setFps} min={5} max={30} />
          <Segmented value={width} onChange={setWidth} options={['320', '480', '640', '0'].map((v) => ({ value: v, label: v === '0' ? 'Full' : v }))} />
          {!anim && <Button variant="secondary" className="w-full" onClick={toGif} loading={job.busy}>Read frames</Button>}
        </div>
        <JobPanel job={job} />
        {anim && <ExportPanel anim={anim} name={file.name} suffix="-motion" formats={['gif', 'webp', 'apng']} onReset={reset} />}
      </>}
    />
  )
}
