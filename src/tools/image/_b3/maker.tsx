/* Build an animation from still images (or a video clip) and save it as one format.
 * Shared by the APNG Maker and Animated WebP Maker. */
import { useEffect, useMemo, useState } from 'react'
import { Film, Images, Video } from 'lucide-react'
import { Button, Dropzone, Label, Segmented, Slider, Switch, Tabs, ToolGrid } from '@/components/ui'
import { toast } from '@/components/toast'
import { type Anim, type OutFmt, blobToRGBA, boomerang, cropRGBA, resizeRGBA, videoToAnim } from '@/lib/b3/anim'
import { ThumbGrid, useImageList, ColorInput, hexToRgbaSafe } from './maker-kit'
import { fmtTime, useVideoMeta } from '@/tools/video/_media/media'
import { TimeInput, VideoStage } from '@/tools/video/_media/ui'
import { AnimPlayer, AnimStats, ExportPanel, Loading } from './anim-ui'

export function MakerTool({ fmt, title }: { fmt: OutFmt; title: string }) {
  const [tab, setTab] = useState<'images' | 'video'>('images')
  const { items, add, remove, clear, setItems } = useImageList()
  const [delay, setDelay] = useState(500)
  const [width, setWidth] = useState(480)
  const [fit, setFit] = useState<'contain' | 'cover'>('contain')
  const [bg, setBg] = useState('#ffffff')
  const [transparent, setTransparent] = useState(true)
  const [loop, setLoop] = useState<'forever' | 'once'>('forever')
  const [bounce, setBounce] = useState(false)
  const [anim, setAnim] = useState<Anim | null>(null)
  const [building, setBuilding] = useState(false)
  // video
  const [vfile, setVfile] = useState<File | null>(null)
  const { url, meta } = useVideoMeta(vfile)
  const [vs, setVs] = useState(0), [vl, setVl] = useState(4), [fps, setFps] = useState(12), [progress, setProgress] = useState(0)
  useEffect(() => { if (meta?.duration) setVl(Math.min(6, meta.duration)) }, [meta])

  const first = items[0]
  const height = first ? Math.max(1, Math.round((width * first.h) / first.w)) : 0
  // rebuild frames when the inputs change
  useEffect(() => {
    if (tab !== 'images') return
    if (items.length < 1) { setAnim(null); return }
    let alive = true
    setBuilding(true)
    const t = setTimeout(async () => {
      try {
        const fill: [number, number, number, number] = transparent ? [0, 0, 0, 0] : hexToRgbaSafe(bg)
        const frames = []
        for (const it of items) {
          const { rgba, width: w, height: h } = await blobToRGBA(it.file, 2048)
          const s = fit === 'contain' ? Math.min(width / w, height / h) : Math.max(width / w, height / h)
          const rw = Math.max(1, Math.round(w * s)), rh = Math.max(1, Math.round(h * s))
          const scaled = resizeRGBA(rgba, w, h, rw, rh)
          frames.push({ rgba: cropRGBA(scaled, rw, rh, Math.round((rw - width) / 2), Math.round((rh - height) / 2), width, height, fill), delay })
        }
        let a: Anim = { width, height, frames, loop: loop === 'forever' ? 0 : 1, source: 'Images' }
        if (bounce) a = boomerang(a)
        if (alive) setAnim(a)
      } catch (e: any) { toast(e?.message || 'Could not read an image', 'error') } finally { if (alive) setBuilding(false) }
    }, 200)
    return () => { alive = false; clearTimeout(t) }
  }, [tab, items, delay, width, height, fit, bg, transparent, loop, bounce])

  const readVideo = async () => {
    if (!vfile) return
    setBuilding(true); setProgress(0)
    try {
      let a = await videoToAnim(vfile, { fps, width, start: vs, duration: vl, onProgress: setProgress })
      a = { ...a, loop: loop === 'forever' ? 0 : 1 }
      setAnim(bounce ? boomerang(a) : a)
    } catch (e: any) { toast(e?.message || 'Could not read the video', 'error') } finally { setBuilding(false) }
  }
  const reset = () => { clear(); setVfile(null); setAnim(null) }
  const preview = useMemo(() => anim, [anim])

  if (!items.length && !vfile) return (
    <div className="space-y-4">
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'images', label: <span className="inline-flex items-center gap-1.5"><Images className="size-4" />From images</span> }, { value: 'video', label: <span className="inline-flex items-center gap-1.5"><Video className="size-4" />From a video clip</span> }]} />
      {tab === 'images'
        ? <Dropzone multiple accept="image/*" onFiles={(f) => add(f.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })))} label={`Drop images to make an ${title}`} sub="Frames are used in file name order. Transparency is kept." />
        : <Dropzone accept="video/*,.mov,.mkv,.webm" onFiles={(f) => setVfile(f[0])} label={`Drop a short video to turn into an ${title}`} sub="Pick the part you want next." />}
    </div>
  )

  return (
    <ToolGrid
      main={<>
        <div className="flex items-center justify-between"><span className="text-sm text-muted">{vfile ? vfile.name : `${items.length} images`}</span><Button variant="ghost" size="sm" onClick={reset}>Start over</Button></div>
        {building && !preview ? <Loading progress={progress} label="Building frames" /> : preview ? <><AnimPlayer anim={preview} /><AnimStats anim={preview} /></> : vfile ? <VideoStage src={url} playable={meta?.playable !== false} /> : null}
        {!vfile && <ThumbGrid items={items} onRemove={remove} onAdd={(f) => add(f)} />}
        {!vfile && items.length > 1 && <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => setItems([...items].reverse())}>Reverse order</Button></div>}
      </>}
      side={<>
        {vfile ? <>
          <div className="grid grid-cols-2 gap-2"><div><Label>Start</Label><TimeInput value={vs} onChange={setVs} max={meta?.duration || Infinity} label="Start" /></div><div><Label>Length</Label><TimeInput value={vl} onChange={(v) => setVl(Math.max(0.2, Math.min(30, v)))} label="Length" /></div></div>
          {meta?.duration ? <p className="text-xs text-muted">Video length {fmtTime(meta.duration, 1)}.</p> : null}
          <Slider label="Frames per second" value={fps} onChange={setFps} min={2} max={30} />
        </> : <Slider label="Frame delay" value={delay} onChange={setDelay} min={20} max={3000} step={10} suffix=" ms" />}
        <Slider label="Width" value={width} onChange={setWidth} min={64} max={1280} step={8} suffix="px" />
        {!vfile && <>
          <div><Label>Fit</Label><Segmented value={fit} onChange={setFit} options={[{ value: 'contain', label: 'Fit inside' }, { value: 'cover', label: 'Fill' }]} /></div>
          <div><Label>Background</Label><Segmented value={transparent ? 't' : 'c'} onChange={(v) => setTransparent(v === 't')} options={[{ value: 't', label: 'Transparent' }, { value: 'c', label: 'Colour' }]} />{!transparent && <ColorInput className="mt-2" value={bg} onChange={setBg} />}</div>
        </>}
        <div><Label>Loop</Label><Segmented value={loop} onChange={setLoop} options={[{ value: 'forever', label: 'Forever' }, { value: 'once', label: 'Once' }]} /></div>
        <Switch checked={bounce} onChange={setBounce} label="Boomerang (forward then back)" />
        {vfile && <Button className="w-full" variant="secondary" icon={<Film className="size-4" />} onClick={readVideo} loading={building}>{anim ? 'Read again' : 'Read frames'}</Button>}
        <ExportPanel anim={anim} name={vfile?.name ?? (first?.file.name ? 'animation' : 'animation')} formats={[fmt]} onReset={reset} action={`Create ${title}`} />
      </>}
    />
  )
}
