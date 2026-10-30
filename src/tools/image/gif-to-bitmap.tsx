import { useMemo, useState } from 'react'
import { Download, Cpu } from 'lucide-react'
import { Button, CopyButton, Input, Label, Segmented, Slider, Switch, ToolGrid, ErrorNote, Select } from '@/components/ui'
import { baseName, downloadBlob } from '@/lib/files'
import { type Anim, ANIM_OR_VIDEO_ACCEPT, fitAnim, frameToCanvas } from '@/lib/b3/anim'
import { arduinoSketch, cIdent, packBits, toCArray, toMono, type BitOrder } from '@/lib/b3/bitmap'
import { AnimBar, AnimDrop, Loading, useAnim } from './_b3/anim-ui'

const SIZES = [{ value: '128x64', label: '128×64 (SSD1306)' }, { value: '128x32', label: '128×32' }, { value: '96x64', label: '96×64' }, { value: '64x64', label: '64×64' }, { value: '64x48', label: '64×48' }, { value: '84x48', label: '84×48 (Nokia 5110)' }, { value: '32x32', label: '32×32' }, { value: '16x16', label: '16×16 icon' }, { value: 'custom', label: 'Custom' }]

export default function GifToBitmap() {
  const { file, anim, loading, progress, error, load, reset } = useAnim({ video: { fps: 10, width: 256, duration: 5 } })
  const [size, setSize] = useState('128x64')
  const [cw, setCw] = useState(128), [ch, setCh] = useState(64)
  const [fit, setFit] = useState<'contain' | 'cover' | 'stretch'>('contain')
  const [threshold, setThreshold] = useState(128)
  const [invert, setInvert] = useState(false)
  const [dither, setDither] = useState(false)
  const [order, setOrder] = useState<BitOrder>('gfx')
  const [maxFrames, setMaxFrames] = useState(30)
  const [frame, setFrame] = useState(0)
  const [w, h] = size === 'custom' ? [cw, ch] : size.split('x').map(Number)
  const fitted: Anim | null = useMemo(() => (anim ? fitAnim({ ...anim, frames: anim.frames.slice(0, maxFrames) }, w, h, fit, [0, 0, 0, 255]) : null), [anim, w, h, fit, maxFrames])
  const bits = useMemo(() => fitted?.frames.map((f) => toMono(f.rgba, w, h, threshold, invert, dither)) ?? [], [fitted, w, h, threshold, invert, dither])
  const name = file ? cIdent(baseName(file.name)) : 'bitmap'
  const code = useMemo(() => (fitted ? toCArray(bits.map((b) => packBits(b, w, h, order)), w, h, name, order, fitted.frames.map((f) => f.delay)) : ''), [bits, fitted, w, h, order, name])
  const previewUrl = useMemo(() => {
    const b = bits[Math.min(frame, bits.length - 1)]; if (!b) return ''
    const px = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < b.length; i++) { const on = b[i]; px[i * 4] = on ? 120 : 8; px[i * 4 + 1] = on ? 210 : 12; px[i * 4 + 2] = on ? 255 : 20; px[i * 4 + 3] = 255 }
    return frameToCanvas(px, w, h).toDataURL()
  }, [bits, frame, w, h])
  const bytes = bits.length * (order === 'ssd1306' ? w * Math.ceil(h / 8) : Math.ceil(w / 8) * h)

  if (!file) return <AnimDrop onFile={load} accept={ANIM_OR_VIDEO_ACCEPT + ',image/*'} label="Drop a GIF, image or short clip for an OLED display" sub="Get C byte arrays for Arduino, ESP32 and Raspberry Pi Pico with Adafruit GFX or U8g2." />
  if (loading) return <Loading progress={progress} />
  if (!anim || !fitted) return <div className="space-y-3"><ErrorNote error={error} /><Button variant="outline" onClick={reset}>Try another file</Button></div>
  return (
    <ToolGrid
      main={<>
        <AnimBar file={file} onReset={reset} />
        <div className="grid place-items-center rounded-2xl border border-border bg-black p-4"><img src={previewUrl} alt="Display preview" className="w-full max-w-lg [image-rendering:pixelated]" style={{ aspectRatio: `${w}/${h}` }} /></div>
        {bits.length > 1 && <input type="range" min={0} max={bits.length - 1} value={frame} onChange={(e) => setFrame(+e.target.value)} aria-label="Frame" className="w-full accent-[var(--accent)]" />}
        <div className="flex items-center gap-2"><span className="text-xs text-muted">{bits.length} frame{bits.length === 1 ? '' : 's'}, {bytes.toLocaleString()} bytes of flash</span><div className="ml-auto flex gap-2"><CopyButton text={code} label="Copy code" /><Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([code], { type: 'text/plain' }), `${name}.h`)}>.h file</Button></div></div>
        <pre className="max-h-72 overflow-auto rounded-xl border border-border bg-surface-2/40 p-3 font-mono text-[11px] scrollbar-thin">{code.slice(0, 20000)}{code.length > 20000 ? '\n…' : ''}</pre>
        <details className="rounded-xl border border-border p-3 text-sm"><summary className="cursor-pointer font-medium">Example sketch</summary><pre className="mt-2 overflow-auto font-mono text-[11px]">{arduinoSketch(name, order)}</pre></details>
      </>}
      side={<>
        <div><Label>Display size</Label><Select aria-label="Display size" value={size} onChange={setSize} options={SIZES} /></div>
        {size === 'custom' && <div className="grid grid-cols-2 gap-2"><Input type="number" min={8} max={512} value={cw} onChange={(e) => setCw(Math.max(8, +e.target.value || 8))} aria-label="Width" /><Input type="number" min={8} max={512} value={ch} onChange={(e) => setCh(Math.max(8, +e.target.value || 8))} aria-label="Height" /></div>}
        <div><Label>Fit</Label><Segmented value={fit} onChange={setFit} options={[{ value: 'contain', label: 'Fit' }, { value: 'cover', label: 'Fill' }, { value: 'stretch', label: 'Stretch' }]} /></div>
        <Slider label="Threshold" value={threshold} onChange={setThreshold} min={1} max={254} />
        <Switch checked={dither} onChange={setDither} label="Dither (shades as dots)" />
        <Switch checked={invert} onChange={setInvert} label="Invert" />
        <div><Label>Byte layout</Label><Select aria-label="Byte layout" value={order} onChange={(v) => setOrder(v as BitOrder)} options={[{ value: 'gfx', label: 'Adafruit GFX (horizontal, MSB)' }, { value: 'xbm', label: 'U8g2 / XBM (horizontal, LSB)' }, { value: 'ssd1306', label: 'SSD1306 buffer (vertical pages)' }]} /></div>
        {anim.frames.length > 1 && <Slider label="Max frames" value={maxFrames} onChange={setMaxFrames} min={1} max={Math.min(200, anim.frames.length)} />}
        <p className="flex items-center gap-1.5 text-xs text-muted"><Cpu className="size-3.5" />An Arduino Uno has 32 KB of flash; keep the total small.</p>
      </>}
    />
  )
}
