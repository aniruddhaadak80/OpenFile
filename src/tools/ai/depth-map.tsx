import { useEffect, useRef, useState } from 'react'
import { Mountain } from 'lucide-react'
import { Button, Dropzone, Label, Segmented, Slider, Switch, ToolGrid } from '@/components/ui'
import { baseName, canvasToBlob, loadImage } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { VMODELS } from '@/lib/bcat/vision'
import { useVision, EnginePanel, VisionProgress } from '@/lib/bcat/aiui'
import { useObjectUrl, DlButton } from '@/lib/bcat/kit'

type Map = 'gray' | 'gold' | 'ocean'
interface Depth { width: number; height: number; data: Uint8ClampedArray }
const STOPS: Record<Map, number[][]> = {
  gray: [[0, 0, 0], [255, 255, 255]],
  gold: [[0, 0, 0], [120, 53, 15], [245, 165, 36], [255, 240, 200]],
  ocean: [[0, 0, 0], [13, 74, 84], [20, 184, 166], [103, 232, 249], [240, 253, 250]],
}
function lut(m: Map) {
  const s = STOPS[m], out = new Uint8ClampedArray(256 * 3)
  for (let v = 0; v < 256; v++) { const t = (v / 255) * (s.length - 1), i = Math.min(s.length - 2, Math.floor(t)), f = t - i; for (let c = 0; c < 3; c++) out[v * 3 + c] = s[i][c] + (s[i + 1][c] - s[i][c]) * f }
  return out
}
function depthCanvas(d: Depth, m: Map, invert: boolean) {
  const c = document.createElement('canvas'); c.width = d.width; c.height = d.height
  const ctx = c.getContext('2d')!, img = ctx.createImageData(d.width, d.height), L = lut(m)
  for (let i = 0; i < d.data.length; i++) { const v = invert ? 255 - d.data[i] : d.data[i]; img.data[i * 4] = L[v * 3]; img.data[i * 4 + 1] = L[v * 3 + 1]; img.data[i * 4 + 2] = L[v * 3 + 2]; img.data[i * 4 + 3] = 255 }
  ctx.putImageData(img, 0, 0)
  return c
}

export default function DepthMap() {
  const [file, setFile] = useState<File | null>(null)
  const [depth, setDepth] = useState<Depth | null>(null)
  const [map, setMap] = useState<Map>('gold')
  const [invert, setInvert] = useState(false)
  const [quality, setQuality] = useState<'384' | '518' | '768'>('518')
  const [view, setView] = useState<'depth' | 'blur'>('depth')
  const [focus, setFocus] = useState(55)
  const [blur, setBlur] = useState(10)
  const url = useObjectUrl(file)
  const cv = useRef<HTMLCanvasElement>(null)
  const ai = useVision(VMODELS.depth)

  const go = () => ai.run(async () => { setDepth(await ai.infer<Depth>(file, { maxSide: +quality })) })

  const portrait = async (maxSide: number) => {
    const img = await loadImage(file!)
    const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s)
    const out = document.createElement('canvas'); out.width = w; out.height = h
    const o = out.getContext('2d')!
    o.filter = `blur(${(blur * w) / 1000}px)`; o.drawImage(img, 0, 0, w, h); o.filter = 'none'
    // mask from depth: near (bright) stays sharp
    const m = document.createElement('canvas'); m.width = depth!.width; m.height = depth!.height
    const mc = m.getContext('2d')!, md = mc.createImageData(m.width, m.height), f = (focus / 100) * 255
    for (let i = 0; i < depth!.data.length; i++) { const v = depth!.data[i]; const a = Math.max(0, Math.min(1, (v - f + 18) / 36)); md.data[i * 4 + 3] = a * 255 }
    mc.putImageData(md, 0, 0)
    const sharp = document.createElement('canvas'); sharp.width = w; sharp.height = h
    const sc = sharp.getContext('2d')!
    sc.drawImage(img, 0, 0, w, h); sc.globalCompositeOperation = 'destination-in'; sc.filter = 'blur(2px)'; sc.drawImage(m, 0, 0, w, h)
    o.drawImage(sharp, 0, 0)
    return out
  }

  useEffect(() => {
    if (!depth || !cv.current) return
    let alive = true
    const draw = async () => {
      const src = view === 'depth' ? depthCanvas(depth, map, invert) : await portrait(1000)
      if (!alive || !cv.current) return
      cv.current.width = src.width; cv.current.height = src.height
      cv.current.getContext('2d')!.drawImage(src, 0, 0)
    }
    draw()
    return () => { alive = false }
  }, [depth, map, invert, view, focus, blur])

  const fullDepth = async () => {
    const img = await loadImage(file!), src = depthCanvas(depth!, map, invert)
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
    const ctx = c.getContext('2d')!; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, 0, 0, c.width, c.height)
    return canvasToBlob(c, 'image/png')
  }

  if (!file) return <Dropzone accept="image/*" onFiles={(f) => { setFile(f[0]); setDepth(null) }} label="Drop a photo to make a depth map" sub="Near things come out bright, far things dark. Runs on your device." />
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <TopBar file={file} onReset={() => { ai.cancel(); setFile(null); setDepth(null) }} />
          {depth && <Segmented value={view} onChange={setView} options={[{ value: 'depth', label: 'Depth map' }, { value: 'blur', label: 'Portrait blur' }]} />}
          <div className="grid gap-3 sm:grid-cols-2">
            {url && <img src={url} alt="Original" className="w-full rounded-2xl border border-border" />}
            {depth ? <canvas ref={cv} className="w-full rounded-2xl border border-border" aria-label="Depth result" /> : <div className="grid min-h-40 place-items-center rounded-2xl border border-dashed border-border text-sm text-muted">The depth map shows here</div>}
          </div>
        </div>
      }
      side={
        <>
          <EnginePanel ai={ai} />
          <div><Label>Detail</Label><Segmented value={quality} onChange={setQuality} options={[{ value: '384', label: 'Fast' }, { value: '518', label: 'Normal' }, { value: '768', label: 'Fine' }]} /></div>
          <VisionProgress ai={ai} />
          <Button className="w-full" icon={<Mountain className="size-4" />} loading={ai.busy} onClick={go}>{depth ? 'Run again' : 'Make depth map'}</Button>
          {depth && view === 'depth' && (
            <>
              <div><Label>Colours</Label><Segmented value={map} onChange={setMap} options={[{ value: 'gray', label: 'Gray' }, { value: 'gold', label: 'Gold' }, { value: 'ocean', label: 'Ocean' }]} /></div>
              <Switch checked={invert} onChange={setInvert} label="Invert (far is bright)" />
              <DlButton variant="primary" name={baseName(file.name) + '-depth.png'} data={fullDepth}>Download depth PNG</DlButton>
            </>
          )}
          {depth && view === 'blur' && (
            <>
              <Slider label="Focus distance" value={focus} onChange={setFocus} min={5} max={95} suffix="%" />
              <Slider label="Blur strength" value={blur} onChange={setBlur} min={2} max={30} />
              <DlButton variant="primary" name={baseName(file.name) + '-portrait.jpg'} data={async () => canvasToBlob(await portrait(3000), 'image/jpeg', 0.92)}>Download photo</DlButton>
            </>
          )}
        </>
      }
    />
  )
}
