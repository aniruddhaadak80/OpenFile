import { useEffect, useState } from 'react'
import { Crop as CropIcon, ScanSearch } from 'lucide-react'
import { Button, Dropzone, ResultCard, Slider, Switch, ToolGrid } from '@/components/ui'
import { baseName } from '@/lib/files'
import { cropOp } from '@/lib/b3/ffops'
import { ffProbe, ffRun } from './_media/engine'
import { captureFrames, useMediaJob, useObjectUrl, useVideoMeta } from './_media/media'
import { FileBar, JobPanel, Note } from './_media/ui'
import { VIDEO_ACCEPT, inName } from './_b3/shell'
import { detectBars, mergeCrops, parseCropdetect, sampleTimes, type Crop } from '@/lib/b14/video'

export default function RemoveBlackBars() {
  const [file, setFile] = useState<File | null>(null)
  const { url, meta } = useVideoMeta(file)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [crop, setCrop] = useState<Crop | null>(null)
  const [auto, setAuto] = useState<Crop | null>(null)
  const [still, setStill] = useState<string | null>(null)
  const [limit, setLimit] = useState(24)
  const [reencodeAudio, setReencodeAudio] = useState(false)
  const [res, setRes] = useState<Blob | null>(null)
  const rUrl = useObjectUrl(res)
  const job = useMediaJob()

  const detect = () => job.run(async ({ setProgress, setLabel }) => {
    if (!file) return
    setLabel('Looking for black bars')
    if (meta?.playable !== false && url && meta?.duration) {
      const times = sampleTimes(meta.duration, 12, 0.08)
      const blobs = await captureFrames(url, times, { type: 'image/png', onFrame: (i) => setProgress((i + 1) / times.length) })
      const crops: Crop[] = []
      let w = 0, h = 0, best: { b: Blob; area: number } | null = null
      for (const b of blobs) {
        const bmp = await createImageBitmap(b); w = bmp.width; h = bmp.height
        const c = new OffscreenCanvas(w, h), ctx = c.getContext('2d')!; ctx.drawImage(bmp, 0, 0)
        const d = ctx.getImageData(0, 0, w, h).data, l = new Uint8Array(w * h)
        let sum = 0
        for (let i = 0; i < l.length; i++) { l[i] = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000; sum += l[i] }
        const cr = detectBars(l, w, h, limit); crops.push(cr)
        if (!best || sum > best.area) best = { b, area: sum }
        bmp.close()
      }
      const m = mergeCrops(crops, w, h)
      setSize({ w, h }); setAuto(m); setCrop(m)
      if (best) setStill(URL.createObjectURL(best.b))
    } else {
      const p = await ffProbe(file, inName(file))
      const lines: string[] = []
      await ffRun({ inputs: [{ name: inName(file), file }], output: 'last.jpg', duration: Math.min(60, p.duration || 60), onProgress: setProgress, onLog: (l) => { if (l.includes('crop=')) lines.push(l) }, args: ['-i', inName(file), '-t', '60', '-vf', `fps=1,cropdetect=limit=${limit}:round=2:reset=0`, '-update', '1', 'last.jpg'] })
      const c = parseCropdetect(lines.join('\n'))
      const w = p.width || 1920, h = p.height || 1080
      setSize({ w, h }); const m = c ?? { x: 0, y: 0, w, h }; setAuto(m); setCrop(m)
    }
  })
  useEffect(() => { if (file && meta) detect() }, [file, meta])
  useEffect(() => () => { if (still) URL.revokeObjectURL(still) }, [still])

  const apply = () => job.run(async ({ setProgress, setLabel }) => {
    if (!file || !crop) return
    setLabel('Cropping')
    const p = await ffProbe(file, inName(file))
    const op = cropOp(inName(file), crop, p.hasAudio)
    if ((reencodeAudio || !/\.(mp4|m4v|mov)$/i.test(file.name)) && p.hasAudio) { const i = op.args.indexOf('copy'); if (i > 0) op.args.splice(i, 1, 'aac') }
    setRes(await ffRun({ inputs: [{ name: inName(file), file }], args: op.args, output: op.output, duration: p.duration, onProgress: setProgress }))
  })

  if (!file) return <Dropzone accept={VIDEO_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a video with black bars" sub="Finds letterbox bars (top and bottom) and pillarbox bars (sides) by itself and crops them away. You can fine tune the edges before saving." />
  const W = size?.w ?? 1, H = size?.h ?? 1
  const none = crop && auto && crop.w === W && crop.h === H
  const set = (p: Partial<Crop>) => crop && setCrop({ ...crop, ...p })
  const top = crop?.y ?? 0, left = crop?.x ?? 0, bottom = crop ? H - crop.y - crop.h : 0, right = crop ? W - crop.x - crop.w : 0
  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <FileBar file={file} onReset={() => { if (job.busy) job.cancel(); setFile(null); setRes(null); setCrop(null); setStill(null) }} />
          <div className="relative overflow-hidden rounded-2xl border border-border bg-black">
            {still ? <img src={still} alt="Frame from the video" className="block w-full" /> : <div className="aspect-video" />}
            {crop && size && <>
              <div className="pointer-events-none absolute inset-0" style={{ background: 'rgba(239,68,68,0.28)', clipPath: `polygon(0 0,100% 0,100% 100%,0 100%,0 0,${(left / W) * 100}% ${(top / H) * 100}%,${(left / W) * 100}% ${100 - (bottom / H) * 100}%,${100 - (right / W) * 100}% ${100 - (bottom / H) * 100}%,${100 - (right / W) * 100}% ${(top / H) * 100}%,${(left / W) * 100}% ${(top / H) * 100}%)` }} />
              <div className="pointer-events-none absolute border-2 border-accent" style={{ left: `${(left / W) * 100}%`, top: `${(top / H) * 100}%`, width: `${(crop.w / W) * 100}%`, height: `${(crop.h / H) * 100}%` }} />
            </>}
          </div>
          {crop && size && <p className="text-sm">{none ? 'No black bars found. You can still trim edges by hand.' : <>Picture area <b>{crop.w} x {crop.h}</b> from {W} x {H}. Removes {top + bottom} px from top and bottom and {left + right} px from the sides.</>}</p>}
        </>}
        side={<>
          {crop && size && <>
            <Slider label="Top" value={top} onChange={(v) => set({ y: v - (v % 2), h: H - (v - (v % 2)) - bottom })} min={0} max={Math.floor(H / 3)} suffix=" px" />
            <Slider label="Bottom" value={bottom} onChange={(v) => set({ h: H - top - (v - (v % 2)) })} min={0} max={Math.floor(H / 3)} suffix=" px" />
            <Slider label="Left" value={left} onChange={(v) => set({ x: v - (v % 2), w: W - (v - (v % 2)) - right })} min={0} max={Math.floor(W / 3)} suffix=" px" />
            <Slider label="Right" value={right} onChange={(v) => set({ w: W - left - (v - (v % 2)) })} min={0} max={Math.floor(W / 3)} suffix=" px" />
            <Button variant="ghost" size="sm" onClick={() => auto && setCrop(auto)}>Back to detected edges</Button>
          </>}
          <Slider label="Darkness limit" value={limit} onChange={setLimit} min={8} max={64} />
          <Button variant="outline" className="w-full" icon={<ScanSearch className="size-4" />} onClick={detect} disabled={job.busy}>Detect again</Button>
          <Switch checked={reencodeAudio} onChange={setReencodeAudio} label="Re-encode sound to AAC" />
          <Button size="lg" className="w-full" icon={<CropIcon className="size-5" />} onClick={apply} loading={job.busy} disabled={!crop}>Remove bars</Button>
          <JobPanel job={job} onRetry={apply} />
          <Note>Twelve frames from across the video are checked, so a dark opening scene does not fool it. Raise the limit if bars are grey, not black.</Note>
        </>}
      />
      {res && rUrl && (
        <ResultCard blob={res} filename={`${baseName(file.name)}-no-bars.mp4`} originalSize={file.size} title="Bars removed" onReset={() => setRes(null)}>
          <video src={rUrl} controls playsInline className="max-h-80 w-full rounded-xl bg-black" />
        </ResultCard>
      )}
    </div>
  )
}
