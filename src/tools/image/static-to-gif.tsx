import { useState } from 'react'

import { Button, Dropzone, Label, Select, Slider, ToolGrid, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { type Anim, type Frame, makeCanvas } from '@/lib/b3/anim'
import { baseName } from '@/lib/files'
import { usePreview, AnimPlayer, AnimStats, ExportPanel, ColorInput } from './_b3/anim-ui'

type Effect = 'shake' | 'pulse' | 'zoom' | 'spin' | 'glitch' | 'doorbell' | 'bounce' | 'rainbow' | 'flash' | 'slideshow'
const EFFECTS: { value: Effect; label: string; hint: string }[] = [
  { value: 'shake', label: 'Shake', hint: 'Jitters around like it is excited or angry.' },
  { value: 'pulse', label: 'Pulse', hint: 'Grows and shrinks like a heartbeat.' },
  { value: 'zoom', label: 'Zoom in', hint: 'Slow push in, then back.' },
  { value: 'spin', label: 'Spin', hint: 'Rotates a full turn.' },
  { value: 'glitch', label: 'Glitch', hint: 'Colour channels split and slices jump.' },
  { value: 'doorbell', label: 'Wobble', hint: 'Swings left and right like a bell.' },
  { value: 'bounce', label: 'Bounce', hint: 'Hops up and down.' },
  { value: 'rainbow', label: 'Rainbow', hint: 'Cycles through hues.' },
  { value: 'flash', label: 'Flash', hint: 'Blinks on and off.' },
  { value: 'slideshow', label: 'Fading slideshow', hint: 'Fades between several images.' },
]

async function load(f: File) { return createImageBitmap(f) }

function render(imgs: ImageBitmap[], effect: Effect, frames: number, delay: number, size: number, intensity: number, bg: string | null, hold: number): Anim {
  const base = imgs[0]
  const s = Math.min(1, size / Math.max(base.width, base.height))
  const W = Math.max(2, Math.round(base.width * s)), H = Math.max(2, Math.round(base.height * s))
  const c = makeCanvas(W, H), ctx = c.getContext('2d', { willReadFrequently: true })!
  const out: Frame[] = []
  const k = intensity / 50
  const draw = (img: ImageBitmap, alpha = 1) => {
    const r = Math.min(W / img.width, H / img.height)
    const w = img.width * r, h = img.height * r
    ctx.globalAlpha = alpha; ctx.drawImage(img, -w / 2, -h / 2, w, h); ctx.globalAlpha = 1
  }
  if (effect === 'slideshow') {
    const fade = Math.max(2, Math.round(frames / 2))
    for (let i = 0; i < imgs.length; i++) {
      const a = imgs[i], b = imgs[(i + 1) % imgs.length]
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H) }
      ctx.translate(W / 2, H / 2); draw(a)
      out.push({ rgba: ctx.getImageData(0, 0, W, H).data, delay: hold })
      for (let f = 1; f < fade; f++) {
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H) }
        ctx.translate(W / 2, H / 2); draw(a, 1 - f / fade); draw(b, f / fade)
        out.push({ rgba: ctx.getImageData(0, 0, W, H).data, delay })
      }
    }
    return { width: W, height: H, frames: out, loop: 0 }
  }
  for (let i = 0; i < frames; i++) {
    const t = i / frames, wave = Math.sin(t * Math.PI * 2)
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.filter = 'none'; ctx.clearRect(0, 0, W, H)
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H) }
    ctx.translate(W / 2, H / 2)
    switch (effect) {
      case 'shake': ctx.translate((Math.random() - 0.5) * W * 0.06 * k, (Math.random() - 0.5) * H * 0.06 * k); ctx.rotate((Math.random() - 0.5) * 0.08 * k); draw(base); break
      case 'pulse': { const sc = 1 + 0.12 * k * Math.max(0, Math.sin(t * Math.PI * 2)); ctx.scale(sc * 0.9, sc * 0.9); draw(base); break }
      case 'zoom': { const sc = 1 + 0.5 * k * (1 - Math.cos(t * Math.PI * 2)) / 2; ctx.scale(sc, sc); draw(base); break }
      case 'spin': ctx.rotate(t * Math.PI * 2); ctx.scale(0.8, 0.8); draw(base); break
      case 'doorbell': ctx.translate(0, -H / 2); ctx.rotate(wave * 0.25 * k); ctx.translate(0, H / 2); ctx.scale(0.9, 0.9); draw(base); break
      case 'bounce': ctx.translate(0, -Math.abs(Math.sin(t * Math.PI * 2)) * H * 0.12 * k); ctx.scale(0.85, 0.85); draw(base); break
      case 'rainbow': ctx.filter = `hue-rotate(${Math.round(t * 360)}deg) saturate(1.6)`; draw(base); break
      case 'flash': draw(base, i % 2 ? 1 : Math.max(0.05, 1 - k)); break
      case 'glitch': {
        draw(base)
        const id = ctx.getImageData(0, 0, W, H), d = id.data, src = d.slice()
        const shift = Math.round((Math.random() * 10 + 2) * k) * (Math.random() > 0.5 ? 1 : -1)
        for (let p = 0; p < d.length; p += 4) { const q = p + shift * 4; if (q >= 0 && q < d.length) d[p] = src[q] }
        const slices = Math.round(3 * k) + 1
        for (let n = 0; n < slices; n++) {
          const y = Math.floor(Math.random() * H), hh = Math.floor(Math.random() * H * 0.08) + 2, dx = Math.round((Math.random() - 0.5) * W * 0.15 * k)
          for (let yy = y; yy < Math.min(H, y + hh); yy++) for (let x = 0; x < W; x++) { const sx = Math.min(W - 1, Math.max(0, x - dx)); const a = (yy * W + x) * 4, b = (yy * W + sx) * 4; d[a] = src[b]; d[a + 1] = src[b + 1]; d[a + 2] = src[b + 2]; d[a + 3] = src[b + 3] }
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.putImageData(id, 0, 0); break
      }
    }
    out.push({ rgba: ctx.getImageData(0, 0, W, H).data, delay })
  }
  return { width: W, height: H, frames: out, loop: 0 }
}

export default function StaticToGif() {
  const [files, setFiles] = useState<File[]>([])
  const [imgs, setImgs] = useState<ImageBitmap[]>([])
  const [effect, setEffect] = useState<Effect>('shake')
  const [frames, setFrames] = useState(12)
  const [delay, setDelay] = useState(60)
  const [size, setSize] = useState(360)
  const [intensity, setIntensity] = useState(50)
  const [bgOn, setBgOn] = useState(false), [bg, setBg] = useState('#ffffff')
  const [hold, setHold] = useState(1500)
  const open = async (f: File[]) => { try { setFiles(f); setImgs(await Promise.all(f.map(load))); if (f.length > 1) setEffect('slideshow') } catch { toast('Could not read that image', 'error') } }
  const preview = usePreview(() => (imgs.length ? render(imgs, effect, frames, delay, size, intensity, bgOn || effect === 'slideshow' ? bg : null, hold) : null), [imgs, effect, frames, delay, size, intensity, bgOn, bg, hold], 150)
  const reset = () => { setFiles([]); setImgs([]) }
  if (!imgs.length) return <Dropzone multiple accept="image/*" onFiles={open} label="Drop an image to animate" sub="Shake, pulse, zoom, spin, glitch, wobble. Drop several images for a fading slideshow." />
  const e = EFFECTS.find((x) => x.value === effect)!
  return (
    <ToolGrid
      main={<>
        <div className="flex items-center justify-between"><span className="truncate text-sm text-muted">{files.map((f) => f.name).join(', ')}</span><Button variant="ghost" size="sm" onClick={reset}>Start over</Button></div>
        {preview.value && <><AnimPlayer anim={preview.value} /><AnimStats anim={preview.value} /></>}
      </>}
      side={<>
        <div>
          <Label>Effect</Label>
          <div className="grid grid-cols-2 gap-1.5">{EFFECTS.filter((x) => x.value !== 'slideshow' || imgs.length > 1).map((x) => <button key={x.value} onClick={() => setEffect(x.value)} className={cn('rounded-lg px-2 py-1.5 text-xs font-medium cursor-pointer', effect === x.value ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted hover:text-fg')}>{x.label}</button>)}</div>
          <p className="mt-1.5 text-xs text-muted">{e.hint}</p>
        </div>
        {effect === 'slideshow' ? <Slider label="Time on each image" value={hold} onChange={setHold} min={300} max={5000} step={100} suffix=" ms" /> : <>
          <Slider label="Strength" value={intensity} onChange={setIntensity} min={5} max={100} />
          <Slider label="Frames" value={frames} onChange={setFrames} min={4} max={48} />
        </>}
        <Slider label={effect === 'slideshow' ? 'Fade speed' : 'Frame delay'} value={delay} onChange={setDelay} min={20} max={300} step={10} suffix=" ms" />
        <Slider label="Size" value={size} onChange={setSize} min={64} max={1024} step={8} suffix="px" />
        {effect !== 'slideshow' && <div><Label>Background</Label><Select aria-label="Background" value={bgOn ? 'c' : 't'} onChange={(v) => setBgOn(v === 'c')} options={[{ value: 't', label: 'Transparent' }, { value: 'c', label: 'Solid colour' }]} /></div>}
        {(bgOn || effect === 'slideshow') && <ColorInput value={bg} onChange={setBg} />}
        <ExportPanel anim={preview.value} name={files[0] ? `${baseName(files[0].name)}-${effect}` : 'animated'} formats={['gif', 'webp', 'apng', 'mp4']} onReset={reset} />
      </>}
    />
  )
}
