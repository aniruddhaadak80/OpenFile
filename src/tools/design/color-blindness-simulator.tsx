import { useState } from 'react'
import { Field, Segmented, Select, Slider, Switch } from '@/components/ui'
import { EffectShell } from '@/tools/image/_b2/EffectShell'

type Kind = 'protan' | 'deutan' | 'tritan' | 'achroma'
// Machado, Oliveira and Fernandes (2009) matrices at full severity, applied in linear RGB.
const M: Record<Exclude<Kind, 'achroma'>, number[]> = {
  protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
}
const TYPES: { id: string; kind: Kind; sev: number; label: string; share: string }[] = [
  { id: 'protanopia', kind: 'protan', sev: 1, label: 'Protanopia (no red)', share: 'about 1% of men' },
  { id: 'deuteranopia', kind: 'deutan', sev: 1, label: 'Deuteranopia (no green)', share: 'about 1% of men' },
  { id: 'tritanopia', kind: 'tritan', sev: 1, label: 'Tritanopia (no blue)', share: 'very rare' },
  { id: 'protanomaly', kind: 'protan', sev: 0.6, label: 'Protanomaly (weak red)', share: 'about 1% of men' },
  { id: 'deuteranomaly', kind: 'deutan', sev: 0.6, label: 'Deuteranomaly (weak green)', share: 'about 5% of men, the most common' },
  { id: 'tritanomaly', kind: 'tritan', sev: 0.6, label: 'Tritanomaly (weak blue)', share: 'rare' },
  { id: 'achromatopsia', kind: 'achroma', sev: 1, label: 'Achromatopsia (no colour)', share: 'very rare' },
  { id: 'achromatomaly', kind: 'achroma', sev: 0.6, label: 'Achromatomaly (weak colour)', share: 'very rare' },
]
const toLin = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })
const toS = (v: number) => { v = Math.max(0, Math.min(1, v)); return Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055) * 255) }

export function simulate(data: Uint8ClampedArray, kind: Kind, sev: number) {
  const out = new Uint8ClampedArray(data.length)
  const m = kind === 'achroma' ? null : M[kind]
  for (let i = 0; i < data.length; i += 4) {
    const r = toLin[data[i]], g = toLin[data[i + 1]], b = toLin[data[i + 2]]
    let nr: number, ng: number, nb: number
    if (!m) { const y = 0.2126 * r + 0.7152 * g + 0.0722 * b; nr = ng = nb = y }
    else { nr = m[0] * r + m[1] * g + m[2] * b; ng = m[3] * r + m[4] * g + m[5] * b; nb = m[6] * r + m[7] * g + m[8] * b }
    out[i] = toS(r + (nr - r) * sev); out[i + 1] = toS(g + (ng - g) * sev); out[i + 2] = toS(b + (nb - b) * sev); out[i + 3] = data[i + 3]
  }
  return out
}
function apply(src: HTMLCanvasElement, kind: Kind, sev: number) {
  const id = src.getContext('2d')!.getImageData(0, 0, src.width, src.height)
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height
  c.getContext('2d')!.putImageData(new ImageData(simulate(id.data, kind, sev), src.width, src.height), 0, 0)
  return c
}

export default function ColorBlindnessSimulator() {
  const [type, setType] = useState('deuteranomaly')
  const [view, setView] = useState<'one' | 'grid'>('one')
  const [sev, setSev] = useState(100)
  const [labels, setLabels] = useState(true)
  const t = TYPES.find((x) => x.id === type)!
  return (
    <EffectShell suffix={view === 'grid' ? 'colour-vision' : type} label="Drop a design, chart or photo to check"
      deps={[type, view, sev, labels]}
      render={(src) => {
        if (view === 'one') return apply(src, t.kind, t.sev * (sev / 100))
        const all = [{ id: 'normal', label: 'Normal vision' }, ...TYPES.filter((x) => x.sev === 1 || x.id === 'deuteranomaly')]
        const cols = 3, rows = Math.ceil(all.length / cols), gap = Math.round(src.width * 0.02)
        const c = document.createElement('canvas'); c.width = cols * src.width + (cols - 1) * gap; c.height = rows * src.height + (rows - 1) * gap
        const ctx = c.getContext('2d')!
        all.forEach((x, i) => {
          const tt = TYPES.find((y) => y.id === x.id)
          const img = tt ? apply(src, tt.kind, tt.sev) : src
          const px = (i % cols) * (src.width + gap), py = Math.floor(i / cols) * (src.height + gap)
          ctx.drawImage(img, px, py)
          if (labels) { const fs = Math.max(12, src.width / 22); ctx.font = `600 ${fs}px sans-serif`; const w = ctx.measureText(x.label).width; ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(px + fs * 0.4, py + fs * 0.4, w + fs * 0.8, fs * 1.5); ctx.fillStyle = '#fff'; ctx.fillText(x.label, px + fs * 0.8, py + fs * 1.5) }
        })
        return c
      }}
      controls={<>
        <Field label="View"><Segmented value={view} onChange={setView} options={[{ value: 'one', label: 'One type' }, { value: 'grid', label: 'All at once' }]} /></Field>
        {view === 'one' ? <>
          <Field label="Colour vision"><Select value={type} onChange={setType} options={TYPES.map((x) => ({ value: x.id, label: x.label }))} /></Field>
          <p className="text-xs text-muted">Affects {t.share}.</p>
          <Slider label="Severity" value={sev} onChange={setSev} min={0} max={100} suffix="%" />
        </> : <Switch checked={labels} onChange={setLabels} label="Show labels" />}
        <p className="text-xs text-muted">Tip: do not rely on red against green alone. Add labels, patterns or a strong lightness difference.</p>
      </>}
    />
  )
}
