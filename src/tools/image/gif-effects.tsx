import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button, Label, Segmented, Slider, Switch, Tabs, ToolGrid, ErrorNote, Spinner } from '@/components/ui'
import { type Anim, type Frame, cloneAnim, flattenAnim, hexToRgba, mapFramesCanvas } from '@/lib/b3/anim'
import { RegionBox, type Rect } from '@/tools/video/_b3/region'
import { useMediaJob } from '@/tools/video/_media/media'
import { JobPanel, Note } from '@/tools/video/_media/ui'
import { AnimBar, AnimCanvas, AnimDrop, AnimPlayer, AnimStats, ColorInput, ExportPanel, Loading, useAnim, usePreview } from './_b3/anim-ui'

type Tab = 'colour' | 'shape' | 'censor' | 'style' | 'background'
interface Fx {
  brightness: number; contrast: number; saturation: number; hue: number; gray: boolean; sepia: boolean; invert: boolean
  radius: number; circle: boolean
  censor: Rect | null; censorStyle: 'blur' | 'pixelate' | 'black'; censorAmount: number
  style: 'none' | 'halftone' | 'pixel'; dot: number; pixel: number; levels: number
  keyOn: boolean; key: string; tolerance: number; flatten: boolean; bg: string
}
const NONE: Fx = { brightness: 0, contrast: 100, saturation: 100, hue: 0, gray: false, sepia: false, invert: false, radius: 0, circle: false, censor: null, censorStyle: 'pixelate', censorAmount: 12, style: 'none', dot: 6, pixel: 6, levels: 6, keyOn: false, key: '#ffffff', tolerance: 20, flatten: false, bg: '#ffffff' }

function colourPass(px: Uint8ClampedArray, f: Fx) {
  const b = f.brightness * 2.55, c = f.contrast / 100, s = f.saturation / 100
  const h = (f.hue * Math.PI) / 180, cos = Math.cos(h), sin = Math.sin(h)
  // hue rotation matrix (luminance preserving)
  const m = [0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928, 0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.14, 0.072 - cos * 0.072 - sin * 0.283, 0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072]
  for (let i = 0; i < px.length; i += 4) {
    let r = px[i], g = px[i + 1], bl = px[i + 2]
    if (f.hue) { const nr = m[0] * r + m[1] * g + m[2] * bl, ng = m[3] * r + m[4] * g + m[5] * bl, nb = m[6] * r + m[7] * g + m[8] * bl; r = nr; g = ng; bl = nb }
    const l = 0.299 * r + 0.587 * g + 0.114 * bl
    if (s !== 1) { r = l + (r - l) * s; g = l + (g - l) * s; bl = l + (bl - l) * s }
    r = (r - 128) * c + 128 + b; g = (g - 128) * c + 128 + b; bl = (bl - 128) * c + 128 + b
    if (f.gray) { const y = 0.299 * r + 0.587 * g + 0.114 * bl; r = g = bl = y }
    if (f.sepia) { const nr = 0.393 * r + 0.769 * g + 0.189 * bl, ng = 0.349 * r + 0.686 * g + 0.168 * bl, nb = 0.272 * r + 0.534 * g + 0.131 * bl; r = nr; g = ng; bl = nb }
    if (f.invert) { r = 255 - r; g = 255 - g; bl = 255 - bl }
    px[i] = r; px[i + 1] = g; px[i + 2] = bl
  }
}

function keyPass(px: Uint8ClampedArray, f: Fx) {
  const [kr, kg, kb] = hexToRgba(f.key), tol = (f.tolerance / 100) * 441
  for (let i = 0; i < px.length; i += 4) {
    const d = Math.sqrt((px[i] - kr) ** 2 + (px[i + 1] - kg) ** 2 + (px[i + 2] - kb) ** 2)
    if (d <= tol) px[i + 3] = 0
    else if (d <= tol * 1.25) px[i + 3] = Math.min(px[i + 3], ((d - tol) / (tol * 0.25)) * 255)
  }
}

async function apply(a: Anim, f: Fx, onProgress?: (p: number) => void): Promise<Anim> {
  let out = cloneAnim(a)
  const colourOn = f.brightness || f.contrast !== 100 || f.saturation !== 100 || f.hue || f.gray || f.sepia || f.invert
  for (const fr of out.frames) { if (colourOn) colourPass(fr.rgba, f); if (f.keyOn) keyPass(fr.rgba, f) }
  if (f.flatten) out = flattenAnim(out, hexToRgba(f.bg))
  const needCanvas = f.radius || f.circle || f.censor || f.style !== 'none'
  if (!needCanvas) return out
  const W = a.width, H = a.height
  return mapFramesCanvas(out, (ctx, _i, c) => {
    if (f.censor) {
      const { x, y, w, h } = f.censor
      if (f.censorStyle === 'black') { ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h) }
      else if (f.censorStyle === 'pixelate') {
        const bs = Math.max(2, f.censorAmount)
        const t = document.createElement('canvas'); t.width = Math.max(1, Math.round(w / bs)); t.height = Math.max(1, Math.round(h / bs))
        t.getContext('2d')!.drawImage(c, x, y, w, h, 0, 0, t.width, t.height)
        ctx.imageSmoothingEnabled = false; ctx.drawImage(t, 0, 0, t.width, t.height, x, y, w, h); ctx.imageSmoothingEnabled = true
      } else {
        const t = document.createElement('canvas'); t.width = w; t.height = h
        const tc = t.getContext('2d')!; tc.filter = `blur(${f.censorAmount / 2}px)`; tc.drawImage(c, x, y, w, h, 0, 0, w, h)
        ctx.drawImage(t, x, y)
      }
    }
    if (f.style !== 'none') {
      const id = ctx.getImageData(0, 0, W, H), src = id.data.slice(), d = id.data
      if (f.style === 'pixel') {
        const bs = Math.max(2, f.pixel), q = 255 / Math.max(1, f.levels - 1)
        for (let by = 0; by < H; by += bs) for (let bx = 0; bx < W; bx += bs) {
          let r = 0, g = 0, b = 0, al = 0, n = 0
          for (let y = by; y < Math.min(H, by + bs); y++) for (let x = bx; x < Math.min(W, bx + bs); x++) { const i = (y * W + x) * 4; r += src[i]; g += src[i + 1]; b += src[i + 2]; al += src[i + 3]; n++ }
          r = Math.round(r / n / q) * q; g = Math.round(g / n / q) * q; b = Math.round(b / n / q) * q; al = al / n > 128 ? 255 : 0
          for (let y = by; y < Math.min(H, by + bs); y++) for (let x = bx; x < Math.min(W, bx + bs); x++) { const i = (y * W + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = al }
        }
        ctx.putImageData(id, 0, 0)
      } else {
        const s = Math.max(3, f.dot)
        ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#000'
        for (let y = 0; y < H; y += s) for (let x = 0; x < W; x += s) {
          const i = (Math.min(H - 1, y + (s >> 1)) * W + Math.min(W - 1, x + (s >> 1))) * 4
          const l = 1 - (0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]) / 255
          const r = (s / 2) * Math.sqrt(l) * 1.15
          if (r > 0.3) { ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, r, 0, Math.PI * 2); ctx.fill() }
        }
      }
    }
    if (f.circle || f.radius) {
      ctx.globalCompositeOperation = 'destination-in'
      ctx.beginPath()
      if (f.circle) ctx.ellipse(W / 2, H / 2, W / 2, H / 2, 0, 0, Math.PI * 2)
      else (ctx as any).roundRect(0, 0, W, H, Math.min(W, H) * (f.radius / 200))
      ctx.fill(); ctx.globalCompositeOperation = 'source-over'
    }
  }, onProgress)
}

export default function GifEffects() {
  const { file, anim, setAnim, loading, progress, error, load, reset } = useAnim()
  const [tab, setTab] = useState<Tab>('colour')
  const [fx, setFx] = useState<Fx>(NONE)
  const set = (p: Partial<Fx>) => setFx((x) => ({ ...x, ...p }))
  const preview = usePreview(async () => (anim ? apply(anim, fx) : null), [anim, fx], 300)
  const job = useMediaJob()
  const removeBg = () => job.run(async ({ setProgress, setLabel }) => {
    if (!anim) return
    setLabel('Loading cut-out model (first time only)')
    // the model runs in a worker so the page keeps responding between frames
    const { cutOut } = await import('./_img/bgcut')
    const c = document.createElement('canvas'); c.width = anim.width; c.height = anim.height
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    const frames: Frame[] = []
    for (let i = 0; i < anim.frames.length; i++) {
      setLabel(`Removing background, frame ${i + 1} of ${anim.frames.length}`)
      ctx.putImageData(new ImageData(new Uint8ClampedArray(anim.frames[i].rgba), anim.width, anim.height), 0, 0)
      const png = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'))
      const cut = await cutOut(png, (key, cur, total) => { if (key.startsWith('fetch') && total) setLabel(`Downloading cut-out model (first time only) ${Math.round((cur / total) * 100)}%`) })
      const bmp = await createImageBitmap(cut)
      ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height)
      frames.push({ rgba: ctx.getImageData(0, 0, c.width, c.height).data, delay: anim.frames[i].delay })
      setProgress((i + 1) / anim.frames.length)
    }
    setAnim({ ...anim, frames })
  })

  if (!file) return <AnimDrop onFile={load} label="Drop a GIF, APNG or animated WebP to add effects" />
  if (loading) return <Loading progress={progress} />
  if (!anim) return <div className="space-y-3"><ErrorNote error={error} /><Button variant="outline" onClick={reset}>Try another file</Button></div>
  const shown = preview.value ?? anim
  const cr = fx.censor ?? { x: Math.round(anim.width * 0.3), y: Math.round(anim.height * 0.3), w: Math.round(anim.width * 0.3), h: Math.round(anim.height * 0.3) }
  return (
    <ToolGrid
      main={<>
        <AnimBar file={file} onReset={() => { reset(); setFx(NONE) }}>{preview.busy && <Spinner label="Updating" />}</AnimBar>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'colour', label: 'Colour' }, { value: 'shape', label: 'Shape' }, { value: 'censor', label: 'Censor' }, { value: 'style', label: 'Style' }, { value: 'background', label: 'Background' }]} />
        {tab === 'censor' ? (
          <div className="checker rounded-2xl border border-border p-2"><RegionBox width={anim.width} height={anim.height} rect={cr} onChange={(r) => set({ censor: r })} shade={false}><AnimCanvas anim={shown} /></RegionBox></div>
        ) : <AnimPlayer anim={shown} />}
        <AnimStats anim={shown} />
      </>}
      side={<>
        {tab === 'colour' && <div className="space-y-3">
          <Slider label="Brightness" value={fx.brightness} onChange={(v) => set({ brightness: v })} min={-100} max={100} />
          <Slider label="Contrast" value={fx.contrast} onChange={(v) => set({ contrast: v })} min={0} max={250} suffix="%" />
          <Slider label="Saturation" value={fx.saturation} onChange={(v) => set({ saturation: v })} min={0} max={300} suffix="%" />
          <Slider label="Hue" value={fx.hue} onChange={(v) => set({ hue: v })} min={-180} max={180} suffix="°" />
          <div className="grid grid-cols-2 gap-2"><Switch checked={fx.gray} onChange={(v) => set({ gray: v })} label="Grayscale" /><Switch checked={fx.sepia} onChange={(v) => set({ sepia: v })} label="Sepia" /><Switch checked={fx.invert} onChange={(v) => set({ invert: v })} label="Invert" /></div>
        </div>}
        {tab === 'shape' && <div className="space-y-3">
          <Switch checked={fx.circle} onChange={(v) => set({ circle: v })} label="Circle / oval" />
          {!fx.circle && <Slider label="Rounded corners" value={fx.radius} onChange={(v) => set({ radius: v })} min={0} max={100} suffix="%" />}
          <Note>Corners become transparent. Save as GIF, APNG or WebP to keep them.</Note>
        </div>}
        {tab === 'censor' && <div className="space-y-3">
          <Switch checked={!!fx.censor} onChange={(v) => set({ censor: v ? cr : null })} label="Hide an area" />
          <div><Label>Style</Label><Segmented value={fx.censorStyle} onChange={(v) => set({ censorStyle: v, censor: cr })} options={[{ value: 'pixelate', label: 'Pixelate' }, { value: 'blur', label: 'Blur' }, { value: 'black', label: 'Black bar' }]} /></div>
          {fx.censorStyle !== 'black' && <Slider label="Strength" value={fx.censorAmount} onChange={(v) => set({ censorAmount: v })} min={2} max={40} />}
          <p className="text-xs text-muted">Drag on the picture to choose the area.</p>
        </div>}
        {tab === 'style' && <div className="space-y-3">
          <Segmented value={fx.style} onChange={(v) => set({ style: v })} options={[{ value: 'none', label: 'None' }, { value: 'pixel', label: 'Pixel art' }, { value: 'halftone', label: 'Halftone' }]} />
          {fx.style === 'pixel' && <><Slider label="Pixel size" value={fx.pixel} onChange={(v) => set({ pixel: v })} min={2} max={32} /><Slider label="Colour levels" value={fx.levels} onChange={(v) => set({ levels: v })} min={2} max={16} /></>}
          {fx.style === 'halftone' && <Slider label="Dot size" value={fx.dot} onChange={(v) => set({ dot: v })} min={3} max={24} />}
        </div>}
        {tab === 'background' && <div className="space-y-3">
          <Switch checked={fx.keyOn} onChange={(v) => set({ keyOn: v })} label="Make a colour transparent" />
          {fx.keyOn && <><ColorInput value={fx.key} onChange={(v) => set({ key: v })} /><Slider label="Tolerance" value={fx.tolerance} onChange={(v) => set({ tolerance: v })} min={1} max={60} /></>}
          <Switch checked={fx.flatten} onChange={(v) => set({ flatten: v })} label="Fill transparency with a colour" />
          {fx.flatten && <ColorInput value={fx.bg} onChange={(v) => set({ bg: v })} />}
          <div className="border-t border-border pt-3">
            <Button variant="secondary" className="w-full" onClick={removeBg} loading={job.busy}>Remove background with AI</Button>
            <p className="mt-1.5 text-xs text-muted">Cuts out the subject on every frame with an on-device model (about 40 MB, downloaded once). Slow for long animations{anim.frames.length > 60 ? `; this one has ${anim.frames.length} frames` : ''}.</p>
            <JobPanel job={job} onRetry={removeBg} />
          </div>
        </div>}
        <Button variant="ghost" size="sm" icon={<RotateCcw className="size-4" />} onClick={() => setFx(NONE)}>Reset effects</Button>
        <ExportPanel anim={shown} prepare={() => apply(anim, fx)} name={file.name} suffix="-fx" defaultFmt={anim.source === 'WebP' ? 'webp' : 'gif'} originalSize={file.size} onReset={() => { reset(); setFx(NONE) }} />
      </>}
    />
  )
}
