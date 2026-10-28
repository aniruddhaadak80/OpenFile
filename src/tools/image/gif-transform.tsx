import { useEffect, useMemo, useState } from 'react'
import { RotateCw, RotateCcw, FlipHorizontal, FlipVertical, Link2, Link2Off } from 'lucide-react'
import { Button, Input, Label, Segmented, Tabs, ToolGrid, ErrorNote } from '@/components/ui'
import { type Anim, cropAnim, fitAnim, flipAnim, hexToRgba, resizeAnim, rotateAnim } from '@/lib/b3/anim'
import { RegionBox, RectInputs, RATIOS, aspectRect, type Rect } from '@/tools/video/_b3/region'
import { AnimBar, AnimCanvas, AnimDrop, AnimPlayer, AnimStats, ColorInput, ExportPanel, Loading, useAnim } from './_b3/anim-ui'

type Tab = 'resize' | 'crop' | 'rotate' | 'canvas'
type Rot = 0 | 90 | 180 | 270

export default function GifTransform() {
  const { file, anim, loading, progress, error, load, reset } = useAnim()
  const [tab, setTab] = useState<Tab>('resize')
  const [w, setW] = useState(0), [h, setH] = useState(0), [lock, setLock] = useState(true)
  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 })
  const [ratio, setRatio] = useState('free')
  const [rot, setRot] = useState<Rot>(0)
  const [flipH, setFlipH] = useState(false), [flipV, setFlipV] = useState(false)
  const [cw, setCw] = useState(0), [ch, setCh] = useState(0)
  const [fitMode, setFitMode] = useState<'contain' | 'cover' | 'stretch'>('contain')
  const [bg, setBg] = useState('#00000000')
  const [transparentBg, setTransparentBg] = useState(true)
  useEffect(() => { if (anim) { setW(anim.width); setH(anim.height); setCrop({ x: 0, y: 0, w: anim.width, h: anim.height }); setCw(anim.width); setCh(anim.height) } }, [anim])

  // order: crop -> rotate/flip -> resize -> canvas
  const result: Anim | null = useMemo(() => {
    if (!anim) return null
    let a = anim
    if (crop.w && (crop.w !== a.width || crop.h !== a.height || crop.x || crop.y)) a = cropAnim(a, crop.x, crop.y, crop.w, crop.h)
    if (rot) a = rotateAnim(a, rot)
    if (flipH) a = flipAnim(a, true)
    if (flipV) a = flipAnim(a, false)
    return a
  }, [anim, crop, rot, flipH, flipV])
  const base = result ? { w: result.width, h: result.height } : { w: 0, h: 0 }
  const prepare = () => {
    let a = result!
    if (w && h && (w !== a.width || h !== a.height)) a = resizeAnim(a, w, h)
    if (cw && ch && (cw !== a.width || ch !== a.height)) a = fitAnim(a, cw, ch, fitMode, transparentBg ? [0, 0, 0, 0] : hexToRgba(bg))
    return a
  }
  // keep the resize box in step with crop/rotation changes
  useEffect(() => { if (result) { setW(result.width); setH(result.height); setCw(result.width); setCh(result.height) } }, [result?.width, result?.height])

  const setWidth = (v: number) => { setW(v); if (lock && base.w) setH(Math.max(1, Math.round(v * base.h / base.w))) }
  const setHeight = (v: number) => { setH(v); if (lock && base.h) setW(Math.max(1, Math.round(v * base.w / base.h))) }
  const start = () => { reset(); setRot(0); setFlipH(false); setFlipV(false) }

  if (!file) return <AnimDrop onFile={load} label="Drop a GIF, APNG or animated WebP to resize, crop or rotate" />
  if (loading) return <Loading progress={progress} />
  if (!anim || !result) return <div className="space-y-3"><ErrorNote error={error} /><Button variant="outline" onClick={start}>Try another file</Button></div>

  return (
    <ToolGrid
      main={<>
        <AnimBar file={file} onReset={start} />
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'resize', label: 'Resize' }, { value: 'crop', label: 'Crop' }, { value: 'rotate', label: 'Rotate & flip' }, { value: 'canvas', label: 'Canvas size' }]} />
        {tab === 'crop' ? (
          <div className="checker rounded-2xl border border-border p-2">
            <RegionBox width={anim.width} height={anim.height} rect={crop} onChange={setCrop} ratio={RATIOS.find((r) => r.value === ratio)?.r ?? null}>
              <AnimCanvas anim={anim} />
            </RegionBox>
          </div>
        ) : <AnimPlayer anim={result} />}
        <AnimStats anim={result} file={file} extra={<span className="rounded-lg bg-surface-2/70 px-2 py-1 text-xs"><span className="text-muted">Output </span><span className="font-mono">{cw}×{ch}</span></span>} />
      </>}
      side={<>
        {tab === 'resize' && (
          <div className="space-y-3">
            <div className="flex items-end gap-2">
              <label className="flex-1"><Label>Width</Label><Input type="number" min={1} value={w} onChange={(e) => setWidth(Math.max(1, +e.target.value || 1))} /></label>
              <Button variant="ghost" size="sm" aria-label={lock ? 'Unlock aspect ratio' : 'Lock aspect ratio'} onClick={() => setLock(!lock)} icon={lock ? <Link2 className="size-4" /> : <Link2Off className="size-4" />} />
              <label className="flex-1"><Label>Height</Label><Input type="number" min={1} value={h} onChange={(e) => setHeight(Math.max(1, +e.target.value || 1))} /></label>
            </div>
            <div className="flex flex-wrap gap-1.5">{[25, 50, 75, 150, 200].map((p) => <Button key={p} size="sm" variant="secondary" onClick={() => { setW(Math.round(base.w * p / 100)); setH(Math.round(base.h * p / 100)) }}>{p}%</Button>)}</div>
          </div>
        )}
        {tab === 'crop' && (
          <div className="space-y-3">
            <div><Label>Aspect ratio</Label><Segmented value={ratio} onChange={(v) => { setRatio(v); setCrop(aspectRect(anim.width, anim.height, RATIOS.find((r) => r.value === v)?.r ?? null)) }} options={RATIOS.map((r) => ({ value: r.value, label: r.label }))} /></div>
            <RectInputs rect={crop} onChange={setCrop} W={anim.width} H={anim.height} />
            <p className="text-xs text-muted">Drag on the picture to draw a new area, or drag the corners.</p>
          </div>
        )}
        {tab === 'rotate' && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" icon={<RotateCcw className="size-4" />} onClick={() => setRot(((rot + 270) % 360) as Rot)}>Left</Button>
            <Button variant="outline" icon={<RotateCw className="size-4" />} onClick={() => setRot(((rot + 90) % 360) as Rot)}>Right</Button>
            <Button variant={flipH ? 'secondary' : 'outline'} icon={<FlipHorizontal className="size-4" />} onClick={() => setFlipH(!flipH)}>Mirror</Button>
            <Button variant={flipV ? 'secondary' : 'outline'} icon={<FlipVertical className="size-4" />} onClick={() => setFlipV(!flipV)}>Flip</Button>
            <p className="col-span-2 text-xs text-muted">Rotation {rot}°. Mirror flips left to right, Flip turns it upside down.</p>
          </div>
        )}
        {tab === 'canvas' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <label><Label>Width</Label><Input type="number" min={1} value={cw} onChange={(e) => setCw(Math.max(1, +e.target.value || 1))} /></label>
              <label><Label>Height</Label><Input type="number" min={1} value={ch} onChange={(e) => setCh(Math.max(1, +e.target.value || 1))} /></label>
            </div>
            <div className="flex flex-wrap gap-1.5">{[['1:1', 1], ['9:16', 9 / 16], ['16:9', 16 / 9], ['4:5', 4 / 5]].map(([l, r]) => <Button key={l as string} size="sm" variant="secondary" onClick={() => { const rr = r as number; const s = Math.max(w, h); if (rr >= 1) { setCw(s); setCh(Math.round(s / rr)) } else { setCh(s); setCw(Math.round(s * rr)) } }}>{l}</Button>)}</div>
            <div><Label>Fit</Label><Segmented value={fitMode} onChange={setFitMode} options={[{ value: 'contain', label: 'Fit inside' }, { value: 'cover', label: 'Fill' }, { value: 'stretch', label: 'Stretch' }]} /></div>
            <div>
              <Label>Background</Label>
              <Segmented value={transparentBg ? 't' : 'c'} onChange={(v) => setTransparentBg(v === 't')} options={[{ value: 't', label: 'Transparent' }, { value: 'c', label: 'Colour' }]} />
              {!transparentBg && <ColorInput className="mt-2" value={bg.slice(0, 7)} onChange={setBg} />}
            </div>
          </div>
        )}
        <ExportPanel anim={result} prepare={prepare} name={file.name} suffix="-edited" defaultFmt={anim.source === 'WebP' ? 'webp' : anim.source === 'APNG' ? 'apng' : 'gif'} originalSize={file.size} onReset={start} />
      </>}
    />
  )
}
