import { useState } from 'react'
import { Field, Label, Select, Slider, Switch } from '@/components/ui'
import { ColorInput, blurCanvas } from './_img/kit'
import { EffectShell } from './_b2/EffectShell'
import { hexToRgb } from '@/lib/b2/palette'

type Effect = 'duotone' | 'glitch' | 'noise' | 'outline' | 'shadow' | 'polaroid' | 'border' | 'mirror' | 'kaleidoscope' | 'splash' | 'vignette' | 'sketch'
const EFFECTS: { id: Effect; label: string }[] = [
  { id: 'duotone', label: 'Duotone' }, { id: 'glitch', label: 'Glitch (RGB split)' }, { id: 'noise', label: 'Film grain' },
  { id: 'outline', label: 'Outline / stroke' }, { id: 'shadow', label: 'Drop shadow' }, { id: 'polaroid', label: 'Polaroid frame' },
  { id: 'border', label: 'Border and padding' }, { id: 'mirror', label: 'Mirror' }, { id: 'kaleidoscope', label: 'Kaleidoscope' },
  { id: 'splash', label: 'Colour splash' }, { id: 'vignette', label: 'Vignette' }, { id: 'sketch', label: 'Pencil sketch' },
]
const mk = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return { c, ctx: c.getContext('2d')! } }
const px = (src: HTMLCanvasElement) => src.getContext('2d')!.getImageData(0, 0, src.width, src.height)
function hueOf(r: number, g: number, b: number) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return { h: 0, s: 0 }; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; return { h, s: mx ? d / mx : 0 } }

type O = { a: string; b: string; amount: number; size: number; color: string; mode: string; seed: number; k: number; mono: boolean }
function render(src: HTMLCanvasElement, e: Effect, o: O): HTMLCanvasElement {
  const W = src.width, H = src.height, S = Math.max(W, H) / 1000
  switch (e) {
    case 'duotone': {
      const id = px(src), d = id.data, A = hexToRgb(o.a), B = hexToRgb(o.b), t = o.amount / 100
      for (let i = 0; i < d.length; i += 4) { const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255; const c = (adj: number) => adj; for (let k = 0; k < 3; k++) d[i + k] = d[i + k] * (1 - t) + c(A[k] + (B[k] - A[k]) * l) * t }
      const { c, ctx } = mk(W, H); ctx.putImageData(id, 0, 0); return c
    }
    case 'glitch': {
      const { c, ctx } = mk(W, H); const off = o.size * S
      const id = px(src), d = id.data, out = ctx.createImageData(W, H), od = out.data
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4, rx = Math.min(W - 1, Math.max(0, Math.round(x - off))), bx = Math.min(W - 1, Math.max(0, Math.round(x + off)))
        od[i] = d[(y * W + rx) * 4]; od[i + 1] = d[i + 1]; od[i + 2] = d[(y * W + bx) * 4 + 2]; od[i + 3] = d[i + 3]
      }
      ctx.putImageData(out, 0, 0)
      let seed = o.seed * 9301 + 49297; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
      const slices = Math.round(o.amount / 6)
      for (let s = 0; s < slices; s++) { const y = rnd() * H, h = (2 + rnd() * 30) * S, dx = (rnd() - 0.5) * off * 6; ctx.drawImage(c, 0, y, W, h, dx, y, W, h) }
      if (o.mono) { ctx.globalAlpha = 0.12; for (let y = 0; y < H; y += Math.max(2, 3 * S)) { ctx.fillStyle = '#000'; ctx.fillRect(0, y, W, Math.max(1, S)) } ctx.globalAlpha = 1 }
      return c
    }
    case 'noise': {
      const id = px(src), d = id.data, a = o.amount * 1.2
      let seed = o.seed + 1; const rnd = () => { seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5; return ((seed >>> 0) % 10000) / 10000 }
      for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * a; if (o.mono) { d[i] += n; d[i + 1] += n; d[i + 2] += n } else { d[i] += (rnd() - 0.5) * a; d[i + 1] += (rnd() - 0.5) * a; d[i + 2] += (rnd() - 0.5) * a } }
      const { c, ctx } = mk(W, H); ctx.putImageData(id, 0, 0); return c
    }
    case 'outline': {
      const r = Math.max(1, o.size * S), pad = Math.ceil(r * 2)
      const { c, ctx } = mk(W + pad * 2, H + pad * 2)
      const { c: sil, ctx: sctx } = mk(W, H); sctx.drawImage(src, 0, 0); sctx.globalCompositeOperation = 'source-in'; sctx.fillStyle = o.color; sctx.fillRect(0, 0, W, H)
      const steps = Math.max(16, Math.round(r * 4))
      for (let i = 0; i < steps; i++) { const t = (i / steps) * Math.PI * 2; ctx.drawImage(sil, pad + Math.cos(t) * r, pad + Math.sin(t) * r) }
      ctx.drawImage(src, pad, pad); return c
    }
    case 'shadow': {
      const blur = o.size * S, dist = o.amount * S * 0.6, pad = Math.ceil(blur * 2 + dist)
      const { c, ctx } = mk(W + pad * 2, H + pad * 2)
      ctx.shadowColor = o.color; ctx.shadowBlur = blur; ctx.shadowOffsetX = dist * 0.7; ctx.shadowOffsetY = dist
      ctx.drawImage(src, pad, pad); return c
    }
    case 'polaroid': {
      const m = Math.round(Math.min(W, H) * 0.06), bottom = Math.round(Math.min(W, H) * 0.22), pad = Math.round(m * 1.2)
      const { c, ctx } = mk(W + m * 2 + pad * 2, H + m + bottom + pad * 2)
      ctx.save(); ctx.translate(c.width / 2, c.height / 2); ctx.rotate((o.amount - 50) / 50 * 0.06); ctx.translate(-c.width / 2, -c.height / 2)
      ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = pad * 0.8; ctx.shadowOffsetY = pad * 0.25
      ctx.fillStyle = o.color; ctx.fillRect(pad, pad, W + m * 2, H + m + bottom); ctx.shadowColor = 'transparent'
      ctx.drawImage(src, pad + m, pad + m); ctx.restore(); return c
    }
    case 'border': {
      const b = Math.round(o.size * S * 2), r = o.amount * S
      const { c, ctx } = mk(W + b * 2, H + b * 2)
      ctx.fillStyle = o.color; ctx.fillRect(0, 0, c.width, c.height)
      ctx.save(); ctx.beginPath(); (ctx as any).roundRect ? (ctx as any).roundRect(b, b, W, H, r) : ctx.rect(b, b, W, H); ctx.clip(); ctx.drawImage(src, b, b); ctx.restore(); return c
    }
    case 'mirror': {
      const { c, ctx } = mk(W, H)
      const half = o.mode
      if (half === 'left' || half === 'right') { const w2 = W / 2; ctx.drawImage(src, half === 'left' ? 0 : w2, 0, w2, H, 0, 0, w2, H); ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(src, half === 'left' ? 0 : w2, 0, w2, H, 0, 0, w2, H); ctx.restore(); if (half === 'right') { const t = mk(W, H); t.ctx.translate(W, 0); t.ctx.scale(-1, 1); t.ctx.drawImage(c, 0, 0); return t.c } }
      else { const h2 = H / 2; ctx.drawImage(src, 0, half === 'top' ? 0 : h2, W, h2, 0, 0, W, h2); ctx.save(); ctx.translate(0, H); ctx.scale(1, -1); ctx.drawImage(src, 0, half === 'top' ? 0 : h2, W, h2, 0, 0, W, h2); ctx.restore() }
      return c
    }
    case 'kaleidoscope': {
      const n = Math.max(3, Math.round(o.k)), size = Math.min(W, H), { c, ctx } = mk(size, size), rad = size / 2, seg = (Math.PI * 2) / n
      const rot = (o.amount / 100) * Math.PI * 2
      for (let i = 0; i < n; i++) {
        ctx.save(); ctx.translate(rad, rad); ctx.rotate(i * seg); if (i % 2) ctx.scale(1, -1)
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, rad * 1.02, -seg / 2 - 0.01, seg / 2 + 0.01); ctx.closePath(); ctx.clip()
        ctx.rotate(rot); ctx.drawImage(src, -W / 2, -H / 2); ctx.restore()
      }
      return c
    }
    case 'splash': {
      const id = px(src), d = id.data, target = hueOf(...hexToRgb(o.color)).h, tol = o.size * 1.8
      for (let i = 0; i < d.length; i += 4) {
        const { h, s } = hueOf(d[i], d[i + 1], d[i + 2]); let dh = Math.abs(h - target); dh = Math.min(dh, 360 - dh)
        const keep = s > 0.18 && dh < tol ? 1 : s > 0.18 && dh < tol * 1.4 ? 1 - (dh - tol) / (tol * 0.4) : 0
        const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
        for (let k = 0; k < 3; k++) d[i + k] = g + (d[i + k] - g) * keep
      }
      const { c, ctx } = mk(W, H); ctx.putImageData(id, 0, 0); return c
    }
    case 'vignette': {
      const { c, ctx } = mk(W, H); ctx.drawImage(src, 0, 0)
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * (0.6 - o.size / 200), W / 2, H / 2, Math.hypot(W, H) / 2)
      const [r, gg, b] = hexToRgb(o.color); g.addColorStop(0, `rgba(${r},${gg},${b},0)`); g.addColorStop(1, `rgba(${r},${gg},${b},${o.amount / 100})`)
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); return c
    }
    case 'sketch': {
      const id = px(src), d = id.data
      const gray = mk(W, H); const gid = gray.ctx.createImageData(W, H)
      for (let i = 0; i < d.length; i += 4) { const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; gid.data[i] = gid.data[i + 1] = gid.data[i + 2] = 255 - l; gid.data[i + 3] = 255 }
      gray.ctx.putImageData(gid, 0, 0)
      const bl = blurCanvas(gray.c, Math.max(1, o.size * S * 0.6)).getContext('2d')!.getImageData(0, 0, W, H).data
      const out = mk(W, H), oid = out.ctx.createImageData(W, H)
      for (let i = 0; i < d.length; i += 4) { const base = 255 - gid.data[i], blend = bl[i]; const v = blend >= 255 ? 255 : Math.min(255, (base * 255) / (255 - blend)); const vv = 255 - (255 - v) * (o.amount / 50); oid.data[i] = oid.data[i + 1] = oid.data[i + 2] = Math.max(0, vv); oid.data[i + 3] = d[i + 3] }
      out.ctx.putImageData(oid, 0, 0); return out.c
    }
  }
}

export default function PhotoEffects() {
  const [effect, setEffect] = useState<Effect>('duotone')
  const [a, setA] = useState('#0b3b3c'); const [b, setB] = useState('#F5A524')
  const [amount, setAmount] = useState(60); const [size, setSize] = useState(12)
  const [color, setColor] = useState('#ffffff'); const [mode, setMode] = useState('left')
  const [seed, setSeed] = useState(3); const [k, setK] = useState(8); const [mono, setMono] = useState(false)
  const pick = (id: Effect) => {
    setEffect(id)
    const d: Partial<Record<Effect, () => void>> = { outline: () => { setColor('#ffffff'); setSize(8) }, shadow: () => { setColor('#00000088'); setSize(30); setAmount(30) }, polaroid: () => { setColor('#fbfaf6'); setAmount(55) }, border: () => { setColor('#ffffff'); setSize(30); setAmount(0) }, splash: () => { setColor('#e53935'); setSize(15) }, vignette: () => { setColor('#000000'); setAmount(70); setSize(30) }, sketch: () => { setSize(12); setAmount(50) }, glitch: () => { setSize(8); setAmount(40) }, noise: () => { setAmount(40); setMono(true) } }
    d[id]?.()
  }
  const showAmount = !['outline', 'mirror'].includes(effect)
  const showSize = ['glitch', 'outline', 'shadow', 'border', 'splash', 'vignette', 'sketch'].includes(effect)
  const showColor = ['outline', 'shadow', 'polaroid', 'border', 'splash', 'vignette'].includes(effect)
  const amountLabel: Partial<Record<Effect, string>> = { duotone: 'Strength', glitch: 'Slices', noise: 'Grain', shadow: 'Distance', polaroid: 'Tilt', border: 'Corner radius', kaleidoscope: 'Rotation', vignette: 'Darkness', sketch: 'Darkness' }
  const sizeLabel: Partial<Record<Effect, string>> = { glitch: 'Channel offset', outline: 'Stroke width', shadow: 'Blur', border: 'Border width', splash: 'Hue tolerance', vignette: 'Spread', sketch: 'Line softness' }
  return (
    <EffectShell matchInput suffix={effect} label="Drop a photo to add effects" deps={[effect, a, b, amount, size, color, mode, seed, k, mono]}
      render={(src, _p, kk) => render(src, effect, { a, b, amount, size: size * (kk === 1 ? 1 : 1), color, mode, seed, k, mono })}
      controls={<>
        <Field label="Effect"><Select value={effect} onChange={(v) => pick(v as Effect)} options={EFFECTS.map((e) => ({ value: e.id, label: e.label }))} /></Field>
        {effect === 'duotone' && <div className="grid grid-cols-2 gap-2"><div><Label>Shadows</Label><ColorInput value={a} onChange={setA} /></div><div><Label>Highlights</Label><ColorInput value={b} onChange={setB} /></div></div>}
        {effect === 'mirror' && <Field label="Keep side"><Select value={mode} onChange={setMode} options={[{ value: 'left', label: 'Left half' }, { value: 'right', label: 'Right half' }, { value: 'top', label: 'Top half' }, { value: 'bottom', label: 'Bottom half' }]} /></Field>}
        {effect === 'kaleidoscope' && <Slider label="Segments" value={k} onChange={setK} min={3} max={24} />}
        {showAmount && <Slider label={amountLabel[effect] ?? 'Amount'} value={amount} onChange={setAmount} min={0} max={100} />}
        {showSize && <Slider label={sizeLabel[effect] ?? 'Size'} value={size} onChange={setSize} min={1} max={100} />}
        {showColor && <div><Label>{effect === 'splash' ? 'Colour to keep' : 'Colour'}</Label><ColorInput value={color} onChange={setColor} /></div>}
        {(effect === 'glitch' || effect === 'noise') && <><Slider label="Random seed" value={seed} onChange={setSeed} min={1} max={50} /><Switch checked={mono} onChange={setMono} label={effect === 'noise' ? 'Monochrome grain' : 'Scan lines'} /></>}
        <p className="text-xs text-muted">Effects that add a frame or shadow make the image bigger. Save as PNG to keep transparency.</p>
      </>}
    />
  )
}
