import { useState } from 'react'
import { Download, Scissors } from 'lucide-react'
import { Button, Label, Segmented, ToolGrid, ErrorNote, Slider, cn } from '@/components/ui'
import { baseName, downloadBlob, zipFiles } from '@/lib/files'
import { framesToPngs, frameToCanvas, ANIM_OR_VIDEO_ACCEPT } from '@/lib/b3/anim'
import { useMediaJob } from '@/tools/video/_media/media'
import { JobPanel } from '@/tools/video/_media/ui'
import { AnimBar, AnimDrop, AnimStats, Loading, useAnim, useFrameThumbs } from './_b3/anim-ui'

export default function GifSplitter() {
  const { file, anim, loading, progress, error, load, reset } = useAnim({ video: { fps: 10, width: 640, duration: 10 } })
  const thumbs = useFrameThumbs(anim, 128)
  const [fmt, setFmt] = useState<'png' | 'jpg' | 'webp'>('png')
  const [every, setEvery] = useState(1)
  const [sel, setSel] = useState<Set<number> | null>(null)
  const job = useMediaJob()
  const chosen = (i: number) => (sel ? sel.has(i) : i % every === 0)
  const toggle = (i: number) => setSel((s) => { const n = new Set(s ?? anim!.frames.map((_, k) => k).filter((k) => k % every === 0)); n.has(i) ? n.delete(i) : n.add(i); return n })
  const one = async (i: number) => {
    if (!anim || !file) return
    const c = frameToCanvas(anim.frames[i].rgba, anim.width, anim.height)
    const mime = fmt === 'png' ? 'image/png' : fmt === 'jpg' ? 'image/jpeg' : 'image/webp'
    if (fmt === 'jpg') { const ctx = c.getContext('2d')!; ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height) }
    c.toBlob((b) => b && downloadBlob(b, `${baseName(file.name)}_frame_${String(i + 1).padStart(3, '0')}.${fmt}`), mime, 0.92)
  }
  const all = () => job.run(async ({ setProgress, setLabel }) => {
    if (!anim || !file) return
    const idx = anim.frames.map((_, i) => i).filter(chosen)
    if (!idx.length) throw new Error('Pick at least one frame.')
    setLabel('Exporting frames')
    const files: { name: string; data: Blob | Uint8Array | string }[] = []
    if (fmt === 'png') {
      const sub = { ...anim, frames: idx.map((i) => anim.frames[i]) }
      framesToPngs(sub, baseName(file.name)).forEach((f, k) => files.push({ ...f, name: `${baseName(file.name)}_frame_${String(idx[k] + 1).padStart(3, '0')}.png` }))
    } else {
      for (let k = 0; k < idx.length; k++) {
        const i = idx[k]
        const c = frameToCanvas(anim.frames[i].rgba, anim.width, anim.height)
        if (fmt === 'jpg') { const ctx = c.getContext('2d')!; ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height) }
        const b = await new Promise<Blob>((res, rej) => c.toBlob((x) => (x ? res(x) : rej(new Error('Export failed'))), fmt === 'jpg' ? 'image/jpeg' : 'image/webp', 0.92))
        files.push({ name: `${baseName(file.name)}_frame_${String(i + 1).padStart(3, '0')}.${fmt}`, data: b })
        setProgress(k / idx.length)
      }
    }
    files.push({ name: 'timing.txt', data: idx.map((i) => `frame ${i + 1}\t${anim.frames[i].delay} ms`).join('\n') })
    setLabel('Zipping')
    downloadBlob(await zipFiles(files), `${baseName(file.name)}-frames.zip`)
  })

  if (!file) return <AnimDrop onFile={load} accept={ANIM_OR_VIDEO_ACCEPT} label="Drop a GIF, APNG, WebP or short video to split into frames" />
  if (loading) return <Loading progress={progress} />
  if (!anim) return <div className="space-y-3"><ErrorNote error={error} /><Button variant="outline" onClick={reset}>Try another file</Button></div>
  const count = anim.frames.filter((_, i) => chosen(i)).length
  return (
    <ToolGrid
      main={<>
        <AnimBar file={file} onReset={() => { reset(); setSel(null) }} />
        <AnimStats anim={anim} file={file} />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
          {thumbs.map((t, i) => (
            <div key={i} className={cn('group relative overflow-hidden rounded-xl border transition', chosen(i) ? 'border-accent' : 'border-border opacity-50')}>
              <button onClick={() => toggle(i)} aria-pressed={chosen(i)} aria-label={`Frame ${i + 1}`} className="checker grid aspect-square w-full place-items-center cursor-pointer"><img src={t} alt="" className="max-h-full max-w-full" /></button>
              <div className="flex items-center justify-between px-1.5 py-1 text-[11px] text-muted"><span className="font-mono">{i + 1}</span><span>{anim.frames[i].delay}ms</span>
                <button onClick={() => one(i)} aria-label={`Download frame ${i + 1}`} className="rounded p-0.5 hover:text-accent cursor-pointer"><Download className="size-3.5" /></button></div>
            </div>
          ))}
        </div>
      </>}
      side={<>
        <div><Label>Image format</Label><Segmented value={fmt} onChange={setFmt} options={[{ value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }, { value: 'webp', label: 'WebP' }]} /></div>
        <Slider label="Take every" value={every} onChange={(v) => { setEvery(v); setSel(null) }} min={1} max={10} suffix=" frame(s)" />
        <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => setSel(new Set(anim.frames.map((_, i) => i)))}>All</Button><Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>None</Button></div>
        <p className="text-sm">{count} of {anim.frames.length} frames selected. Click a frame to include or skip it.</p>
        <Button size="lg" className="w-full" icon={<Scissors className="size-5" />} onClick={all} loading={job.busy} disabled={!count}>Download {count} frames (ZIP)</Button>
        <JobPanel job={job} onRetry={all} />
        <p className="text-xs text-muted">Each frame is the full picture, already combined with the frames before it. The ZIP includes a timing list.</p>
      </>}
    />
  )
}
