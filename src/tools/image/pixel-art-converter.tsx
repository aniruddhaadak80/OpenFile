import { useState } from 'react'
import { Field, Label, Segmented, Select, Slider, Switch } from '@/components/ui'
import { ColorInput } from './_img/kit'
import { EffectShell } from './_b2/EffectShell'
import { RETRO_PALETTES, applyPalette, buildPalette, hexToRgb, type Dither, type RGB } from '@/lib/b2/palette'

function pixelate(src: HTMLCanvasElement, o: { px: number; palette: string; colors: number; dither: Dither; strength: number; grid: boolean; gridColor: string; outScale: 'original' | 'pixels' }) {
  const bw = Math.max(1, Math.round(src.width / o.px)), bh = Math.max(1, Math.round(src.height / o.px))
  const small = document.createElement('canvas'); small.width = bw; small.height = bh
  const sctx = small.getContext('2d')!; sctx.imageSmoothingQuality = 'high'; sctx.drawImage(src, 0, 0, bw, bh)
  const id = sctx.getImageData(0, 0, bw, bh)
  let pal: RGB[]
  if (o.palette === 'auto') pal = buildPalette(id.data, o.colors)
  else pal = RETRO_PALETTES[o.palette].colors.map(hexToRgb)
  const mapped = applyPalette(id.data, bw, bh, pal, o.dither, o.strength)
  sctx.putImageData(new ImageData(mapped, bw, bh), 0, 0)
  if (o.outScale === 'pixels') return small
  const out = document.createElement('canvas'); out.width = bw * o.px; out.height = bh * o.px
  const ctx = out.getContext('2d')!; ctx.imageSmoothingEnabled = false; ctx.drawImage(small, 0, 0, out.width, out.height)
  if (o.grid && o.px >= 4) {
    ctx.strokeStyle = o.gridColor; ctx.lineWidth = 1; ctx.beginPath()
    for (let x = 0; x <= bw; x++) { ctx.moveTo(x * o.px + 0.5, 0); ctx.lineTo(x * o.px + 0.5, out.height) }
    for (let y = 0; y <= bh; y++) { ctx.moveTo(0, y * o.px + 0.5); ctx.lineTo(out.width, y * o.px + 0.5) }
    ctx.stroke()
  }
  return out
}

export default function PixelArtConverter() {
  const [px, setPx] = useState(8)
  const [palette, setPalette] = useState('auto')
  const [colors, setColors] = useState(16)
  const [dither, setDither] = useState<Dither>('none')
  const [strength, setStrength] = useState(1)
  const [grid, setGrid] = useState(false)
  const [gridColor, setGridColor] = useState('#00000033')
  const [outScale, setOutScale] = useState<'original' | 'pixels'>('original')
  return (
    <EffectShell suffix="pixel" label="Drop an image to turn into pixel art"
      deps={[px, palette, colors, dither, strength, grid, gridColor, outScale]}
      render={(src, _preview, k) => pixelate(src, { px: Math.max(1, px * k), palette, colors, dither, strength, grid, gridColor, outScale })}
      controls={<>
        <Slider label="Pixel size" value={px} onChange={setPx} min={2} max={48} suffix=" px" />
        <Field label="Palette"><Select value={palette} onChange={setPalette} options={[{ value: 'auto', label: 'Automatic (from image)' }, ...Object.entries(RETRO_PALETTES).map(([k, v]) => ({ value: k, label: v.label }))]} /></Field>
        {palette === 'auto' && <Slider label="Colours" value={colors} onChange={setColors} min={2} max={64} />}
        <Field label="Dithering"><Segmented value={dither} onChange={setDither} options={[{ value: 'none', label: 'None' }, { value: 'floyd', label: 'Floyd' }, { value: 'atkinson', label: 'Atkinson' }, { value: 'bayer4', label: 'Bayer 4' }, { value: 'bayer8', label: 'Bayer 8' }]} /></Field>
        {dither !== 'none' && <Slider label="Dither strength" value={strength} onChange={setStrength} min={0.2} max={1.5} step={0.05} />}
        <Field label="Output size"><Segmented value={outScale} onChange={setOutScale} options={[{ value: 'original', label: 'Same as original' }, { value: 'pixels', label: '1 px per block' }]} /></Field>
        {outScale === 'original' && <><Switch checked={grid} onChange={setGrid} label="Show pixel grid" />{grid && <div><Label>Grid colour</Label><ColorInput value={gridColor} onChange={setGridColor} /></div>}</>}
        {palette !== 'auto' && <div className="flex flex-wrap gap-1">{RETRO_PALETTES[palette].colors.map((c) => <span key={c} className="size-5 rounded border border-border" style={{ background: c }} title={c} />)}</div>}
      </>}
    />
  )
}
