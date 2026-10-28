import { useState } from 'react'
import { Field, Label, Segmented, Slider, Switch } from '@/components/ui'
import { ColorInput } from './_img/kit'
import { EffectShell } from './_b2/EffectShell'

type Shape = 'dot' | 'line' | 'square' | 'cross' | 'diamond'
type Mode = 'mono' | 'cmyk' | 'duo'

/** Halftone: sample average luminance per cell on a rotated grid and draw a shape sized by darkness. */
function halftone(src: HTMLCanvasElement, o: { cell: number; angle: number; shape: Shape; mode: Mode; ink: string; paper: string; ink2: string; contrast: number; scale: number; smooth: boolean }) {
  const w = src.width, h = src.height
  const data = src.getContext('2d')!.getImageData(0, 0, w, h).data
  const out = document.createElement('canvas'); out.width = w; out.height = h
  const ctx = out.getContext('2d')!
  ctx.fillStyle = o.paper; ctx.fillRect(0, 0, w, h)
  const cell = Math.max(2, o.cell * o.scale)
  const channels: { angle: number; color: string; pick: (r: number, g: number, b: number) => number; op: GlobalCompositeOperation }[] =
    o.mode === 'cmyk' ? [
      { angle: 15, color: '#00aeef', pick: (r, g, b) => { const k = 1 - Math.max(r, g, b) / 255; return k >= 1 ? 0 : (1 - r / 255 - k) / (1 - k) }, op: 'multiply' },
      { angle: 75, color: '#ec008c', pick: (r, g, b) => { const k = 1 - Math.max(r, g, b) / 255; return k >= 1 ? 0 : (1 - g / 255 - k) / (1 - k) }, op: 'multiply' },
      { angle: 0, color: '#fff200', pick: (r, g, b) => { const k = 1 - Math.max(r, g, b) / 255; return k >= 1 ? 0 : (1 - b / 255 - k) / (1 - k) }, op: 'multiply' },
      { angle: 45, color: '#231f20', pick: (r, g, b) => 1 - Math.max(r, g, b) / 255, op: 'multiply' },
    ] : o.mode === 'duo' ? [
      { angle: o.angle, color: o.ink, pick: (r, g, b) => 1 - (0.299 * r + 0.587 * g + 0.114 * b) / 255, op: 'source-over' },
      { angle: o.angle + 45, color: o.ink2, pick: (r, g, b) => Math.max(0, (Math.max(r, g, b) - Math.min(r, g, b)) / 255), op: 'multiply' },
    ] : [{ angle: o.angle, color: o.ink, pick: (r, g, b) => 1 - (0.299 * r + 0.587 * g + 0.114 * b) / 255, op: 'source-over' }]
  for (const ch of channels) {
    const a = (ch.angle * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a)
    const diag = Math.hypot(w, h)
    ctx.globalCompositeOperation = ch.op
    ctx.fillStyle = ch.color; ctx.strokeStyle = ch.color
    for (let gy = -diag / 2; gy < diag / 2; gy += cell) {
      for (let gx = -diag / 2; gx < diag / 2; gx += cell) {
        const cx = w / 2 + gx * cos - gy * sin, cy = h / 2 + gx * sin + gy * cos
        if (cx < -cell || cy < -cell || cx > w + cell || cy > h + cell) continue
        const sx = Math.min(w - 1, Math.max(0, cx | 0)), sy = Math.min(h - 1, Math.max(0, cy | 0))
        const i = (sy * w + sx) * 4
        if (data[i + 3] < 10) continue
        let v = ch.pick(data[i], data[i + 1], data[i + 2])
        v = Math.max(0, Math.min(1, (v - 0.5) * o.contrast + 0.5))
        if (v < 0.02) continue
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(a)
        const s = cell
        switch (o.shape) {
          case 'dot': ctx.beginPath(); ctx.arc(0, 0, (s / 2) * Math.sqrt(v) * 1.42, 0, Math.PI * 2); ctx.fill(); break
          case 'square': { const q = s * Math.sqrt(v); ctx.fillRect(-q / 2, -q / 2, q, q); break }
          case 'diamond': { const q = (s / 2) * Math.sqrt(v) * 1.42; ctx.beginPath(); ctx.moveTo(0, -q); ctx.lineTo(q, 0); ctx.lineTo(0, q); ctx.lineTo(-q, 0); ctx.fill(); break }
          case 'line': ctx.fillRect(-s / 2, (-s / 2) * v, s + 0.5, s * v); break
          case 'cross': { const t = s * v * 0.5; ctx.fillRect(-s / 2, -t / 2, s, t); ctx.fillRect(-t / 2, -s / 2, t, s); break }
        }
        ctx.restore()
      }
    }
  }
  ctx.globalCompositeOperation = 'source-over'
  if (o.smooth) { const t = document.createElement('canvas'); t.width = w; t.height = h; const x = t.getContext('2d')!; x.filter = `blur(${Math.max(0.4, cell / 14)}px)`; x.drawImage(out, 0, 0); return t }
  return out
}

export default function HalftoneGenerator() {
  const [cell, setCell] = useState(10)
  const [angle, setAngle] = useState(45)
  const [shape, setShape] = useState<Shape>('dot')
  const [mode, setMode] = useState<Mode>('mono')
  const [ink, setInk] = useState('#111111')
  const [ink2, setInk2] = useState('#F5A524')
  const [paper, setPaper] = useState('#f6f1e7')
  const [contrast, setContrast] = useState(1.2)
  const [smooth, setSmooth] = useState(false)
  return (
    <EffectShell suffix="halftone" label="Drop an image to turn into halftone"
      deps={[cell, angle, shape, mode, ink, ink2, paper, contrast, smooth]}
      render={(src, preview) => {
        // keep the dot size relative to the image, so preview and full size match
        const scale = preview ? 1 : 1
        const rel = Math.max(src.width, src.height) / 900
        return halftone(src, { cell, angle, shape, mode, ink, ink2, paper, contrast, scale: scale * rel, smooth })
      }}
      controls={<>
        <Field label="Style"><Segmented value={mode} onChange={setMode} options={[{ value: 'mono', label: 'One ink' }, { value: 'duo', label: 'Two inks' }, { value: 'cmyk', label: 'CMYK' }]} /></Field>
        <Field label="Shape"><Segmented value={shape} onChange={setShape} options={[{ value: 'dot', label: 'Dots' }, { value: 'line', label: 'Lines' }, { value: 'square', label: 'Squares' }, { value: 'diamond', label: 'Diamonds' }, { value: 'cross', label: 'Cross' }]} /></Field>
        <Slider label="Cell size" value={cell} onChange={setCell} min={3} max={40} suffix=" px" />
        {mode !== 'cmyk' && <Slider label="Screen angle" value={angle} onChange={setAngle} min={0} max={90} suffix="°" />}
        <Slider label="Contrast" value={contrast} onChange={setContrast} min={0.5} max={2.5} step={0.05} />
        {mode !== 'cmyk' && <div className="grid grid-cols-2 gap-2"><div><Label>Ink</Label><ColorInput value={ink} onChange={setInk} /></div>{mode === 'duo' && <div><Label>Second ink</Label><ColorInput value={ink2} onChange={setInk2} /></div>}</div>}
        <div><Label>Paper</Label><ColorInput value={paper} onChange={setPaper} /></div>
        <Switch checked={smooth} onChange={setSmooth} label="Soften edges (print look)" />
      </>}
    />
  )
}
