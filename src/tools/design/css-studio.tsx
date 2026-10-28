import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Trash2, Shuffle } from 'lucide-react'
import { Button, Card, Label, Segmented, Slider, Switch, Tabs, Textarea, CopyButton, Input, cn } from '@/components/ui'
import { ColorField } from './_design/ColorPicker'
import { parseColor, rgbToHex, hslToRgb, rgbToHsl, RGBA } from './_design/color'

type Tab = 'shadow' | 'glass' | 'neu' | 'radius' | 'text'
type Out = { css: Record<string, string>; tw: string; extraCss?: string }
type BgKind = 'solid' | 'gradient' | 'mesh' | 'image'

const rgba = (hex: string, a: number) => { const c = parseColor(hex) ?? { r: 0, g: 0, b: 0, a: 1 }; return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${+(a * c.a).toFixed(3)})` }
const twv = (v: string) => v.replace(/,\s+/g, ',').replace(/\s+/g, '_')
const shade = (hex: string, amt: number) => { const c = parseColor(hex) ?? { r: 128, g: 128, b: 128, a: 1 }; const { h, s, l } = rgbToHsl(c); return rgbToHex(hslToRgb(h, s, Math.max(0, Math.min(100, l + amt)))) }

export default function CssStudio() {
  const [tab, setTab] = useState<Tab>('shadow')
  const [bgKind, setBgKind] = useState<BgKind>('gradient')
  const [bgColor, setBgColor] = useState('#e8ebf3')
  const [out, setOut] = useState<'css' | 'tailwind' | 'scss'>('css')

  // ---------- Box shadow ----------
  const [sh, setSh] = useState({ layers: 6, distance: 24, blur: 48, spread: 0, opacity: 0.22, angle: 180, color: '#0f172a', inset: false, ease: 2 })
  const shadowValue = useMemo(() => {
    const parts: string[] = []
    const rad = (sh.angle * Math.PI) / 180
    for (let i = 1; i <= sh.layers; i++) {
      const t = (i / sh.layers) ** sh.ease
      const d = sh.distance * t, b = sh.blur * t
      const X = +(Math.sin(rad) * d).toFixed(1) || 0
      const Y = +(-Math.cos(rad) * d).toFixed(1) || 0
      const a = (sh.opacity / sh.layers) * (1.6 - (i / sh.layers) * 0.9)
      parts.push(`${sh.inset ? 'inset ' : ''}${X}px ${Y}px ${+b.toFixed(1)}px ${sh.spread ? `${+(sh.spread * t).toFixed(1)}px ` : ''}${rgba(sh.color, Math.min(1, a))}`)
    }
    return parts.join(',\n    ')
  }, [sh])

  // ---------- Glass ----------
  const [gl, setGl] = useState({ blur: 16, transparency: 0.25, saturation: 180, color: '#ffffff', border: 0.35, radius: 20, outline: true })
  // ---------- Neumorphism ----------
  const [nu, setNu] = useState({ shape: 'flat' as 'flat' | 'concave' | 'convex' | 'pressed', distance: 18, intensity: 0.15, blur: 36, radius: 40, size: 220, color: '#e0e5ec' })
  // ---------- Border radius ----------
  const [br, setBr] = useState([30, 70, 70, 30, 30, 30, 70, 70])
  const [brColor, setBrColor] = useState('#f5a524')
  // ---------- Text shadow ----------
  const [txt, setTxt] = useState({ text: 'OpenFile', size: 72, color: '#ffffff', weight: 800 })
  const [ts, setTs] = useState([{ id: 1, x: 0, y: 0, blur: 8, color: '#5eead4' }, { id: 2, x: 0, y: 0, blur: 24, color: '#f5a524' }, { id: 3, x: 0, y: 0, blur: 48, color: '#14b8a6' }])

  const result: Out = useMemo(() => {
    if (tab === 'shadow') return { css: { 'box-shadow': shadowValue, 'border-radius': '16px' }, tw: `shadow-[${twv(shadowValue)}] rounded-2xl` }
    if (tab === 'glass') {
      const css: Record<string, string> = {
        background: rgba(gl.color, gl.transparency), 'backdrop-filter': `blur(${gl.blur}px) saturate(${gl.saturation}%)`, '-webkit-backdrop-filter': `blur(${gl.blur}px) saturate(${gl.saturation}%)`,
        'border-radius': `${gl.radius}px`, ...(gl.outline ? { border: `1px solid ${rgba(gl.color, gl.border)}` } : {}), 'box-shadow': `0 8px 32px ${rgba('#0f766e', 0.18)}`,
      }
      return { css, tw: `bg-[${twv(rgba(gl.color, gl.transparency))}] backdrop-blur-[${gl.blur}px] backdrop-saturate-[${gl.saturation}%] rounded-[${gl.radius}px]${gl.outline ? ` border border-[${twv(rgba(gl.color, gl.border))}]` : ''} shadow-[0_8px_32px_${twv(rgba('#0f766e', 0.18))}]` }
    }
    if (tab === 'neu') {
      const dark = shade(nu.color, -nu.intensity * 100), light = shade(nu.color, nu.intensity * 100)
      const d = nu.distance, b = nu.blur
      const shadow = nu.shape === 'pressed' ? `inset ${d}px ${d}px ${b}px ${dark}, inset -${d}px -${d}px ${b}px ${light}` : `${d}px ${d}px ${b}px ${dark}, -${d}px -${d}px ${b}px ${light}`
      const bg = nu.shape === 'concave' ? `linear-gradient(145deg, ${shade(nu.color, -5)}, ${shade(nu.color, 5)})` : nu.shape === 'convex' ? `linear-gradient(145deg, ${shade(nu.color, 5)}, ${shade(nu.color, -5)})` : nu.color
      return { css: { 'border-radius': `${nu.radius}px`, background: bg, 'box-shadow': shadow }, tw: `rounded-[${nu.radius}px] bg-[${twv(bg)}] shadow-[${twv(shadow)}]` }
    }
    if (tab === 'radius') {
      const v = `${br[0]}% ${br[1]}% ${br[2]}% ${br[3]}% / ${br[4]}% ${br[5]}% ${br[6]}% ${br[7]}%`
      return { css: { 'border-radius': v }, tw: `rounded-[${v.replace(/ \/ /, '/').replace(/ /g, '_')}]` }
    }
    const v = ts.map((s) => `${s.x}px ${s.y}px ${s.blur}px ${s.color}`).join(', ')
    return { css: { color: txt.color, 'text-shadow': v }, tw: `text-[${txt.color}] [text-shadow:${twv(v)}]` }
  }, [tab, shadowValue, gl, nu, br, ts, txt.color])

  const cssText = `.element {\n${Object.entries(result.css).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`
  const scssText = (() => {
    const name = { shadow: 'smooth-shadow', glass: 'glass', neu: 'neumorphic', radius: 'blob', text: 'text-glow' }[tab]
    const vars = Object.entries(result.css).filter(([k]) => !k.startsWith('-webkit')).map(([k, v]) => `$${name}-${k.replace(/^-+/, '')}: ${v.replace(/\n\s*/g, ' ')};`)
    return `${vars.join('\n')}\n\n@mixin ${name} {\n${Object.keys(result.css).map((k) => `  ${k}: $${name}-${k.replace(/^-+/, '').replace(/^webkit-/, '')};`).join('\n')}\n}\n\n.element {\n  @include ${name};\n}`
  })()
  const code = out === 'css' ? cssText : out === 'tailwind' ? result.tw : scssText

  const bgStyle: React.CSSProperties = bgKind === 'solid' ? { background: bgColor }
    : bgKind === 'gradient' ? { background: `linear-gradient(135deg, ${bgColor}, ${shade(bgColor, -18)})` }
      : bgKind === 'mesh' ? { background: 'radial-gradient(at 20% 20%, #fdba74 0, transparent 50%), radial-gradient(at 80% 30%, #5eead4 0, transparent 50%), radial-gradient(at 50% 90%, #4ade80 0, transparent 50%), #134e4a' }
        : { background: 'repeating-linear-gradient(45deg, #f97316 0 24px, #facc15 24px 48px, #22c55e 48px 72px, #3b82f6 72px 96px, #14b8a6 96px 120px)' }
  // neumorphism needs the bg to equal the element colour
  const previewBg = tab === 'neu' ? { background: nu.color } : bgStyle
  const styleObj = (css: Record<string, string>): React.CSSProperties => Object.fromEntries(Object.entries(css).map(([k, v]) => [k.replace(/^-webkit-/, 'Webkit-').replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v.replace(/\n\s*/g, ' ')])) as React.CSSProperties

  return (
    <div className="space-y-5">
      <div className="overflow-x-auto scrollbar-thin"><Tabs value={tab} onChange={setTab} tabs={[{ value: 'shadow', label: 'Box Shadow' }, { value: 'glass', label: 'Glassmorphism' }, { value: 'neu', label: 'Neumorphism' }, { value: 'radius', label: 'Border Radius' }, { value: 'text', label: 'Text Shadow' }]} /></div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          <motion.div layout className="relative grid min-h-[380px] place-items-center overflow-hidden rounded-2xl border border-border p-10 transition-colors" style={previewBg}>
            {tab === 'glass' && <>
              <div className="absolute left-[18%] top-[16%] size-40 rounded-full bg-gradient-to-br from-orange-500 to-orange-400" />
              <div className="absolute bottom-[12%] right-[16%] size-52 rounded-full bg-gradient-to-br from-cyan-400 to-teal-600" />
            </>}
            <motion.div key={tab} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
              {tab === 'shadow' && <div className="grid h-44 w-64 place-items-center bg-white text-sm font-medium text-slate-500" style={styleObj(result.css)}>Smooth shadow</div>}
              {tab === 'glass' && <div className="relative w-72 p-6 text-white" style={styleObj(result.css)}>
                <div className="text-xs uppercase tracking-widest opacity-80">Glass card</div><div className="mt-2 font-display text-2xl font-bold">Frosted UI</div>
                <p className="mt-2 text-sm opacity-85">Backdrop blur + saturation creates depth over colourful content.</p>
                <div className="mt-5 flex gap-2"><span className="h-2 w-16 rounded-full bg-white/60" /><span className="h-2 w-8 rounded-full bg-white/40" /></div></div>}
              {tab === 'neu' && <div className="grid place-items-center" style={{ ...styleObj(result.css), width: nu.size, height: nu.size }}><span className="text-sm font-medium" style={{ color: shade(nu.color, -35) }}>{nu.shape}</span></div>}
              {tab === 'radius' && <div className="relative size-64">
                <div className="absolute inset-0 transition-[border-radius] duration-500" style={{ borderRadius: result.css['border-radius'], background: `linear-gradient(135deg, ${brColor}, ${shade(brColor, 20)})` }} />
                <RadiusHandles v={br} onChange={setBr} />
              </div>}
              {tab === 'text' && <div style={{ ...styleObj(result.css), fontSize: txt.size, fontWeight: txt.weight, lineHeight: 1.1 }} className="max-w-full break-words text-center font-display">{txt.text || ' '}</div>}
            </motion.div>
          </motion.div>
          {tab !== 'neu' && <Card className="flex flex-wrap items-end gap-4 p-4">
            <div><Label>Preview background</Label><Segmented value={bgKind} onChange={setBgKind} options={[{ value: 'solid', label: 'Solid' }, { value: 'gradient', label: 'Gradient' }, { value: 'mesh', label: 'Mesh' }, { value: 'image', label: 'Stripes' }]} /></div>
            {(bgKind === 'solid' || bgKind === 'gradient') && <div className="w-44"><ColorField value={bgColor} onChange={setBgColor} alpha={false} /></div>}
          </Card>}
          <Card>
            <div className="mb-3 flex items-center justify-between gap-2"><Segmented value={out} onChange={setOut} options={[{ value: 'css', label: 'CSS' }, { value: 'tailwind', label: 'Tailwind' }, { value: 'scss', label: 'SCSS' }]} /><CopyButton text={code} /></div>
            <Textarea readOnly value={code} className="h-44 text-[12px]" />
          </Card>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card className="space-y-5">
            {tab === 'shadow' && <>
              <Slider label="Layers" value={sh.layers} onChange={(layers) => setSh({ ...sh, layers })} min={1} max={10} />
              <Slider label="Distance" value={sh.distance} onChange={(distance) => setSh({ ...sh, distance })} min={0} max={120} suffix="px" />
              <Slider label="Blur" value={sh.blur} onChange={(blur) => setSh({ ...sh, blur })} min={0} max={200} suffix="px" />
              <Slider label="Spread" value={sh.spread} onChange={(spread) => setSh({ ...sh, spread })} min={-40} max={40} suffix="px" />
              <Slider label="Opacity" value={sh.opacity} onChange={(opacity) => setSh({ ...sh, opacity })} min={0} max={1} step={0.01} />
              <Slider label="Direction" value={sh.angle} onChange={(angle) => setSh({ ...sh, angle })} min={0} max={359} suffix="°" />
              <Slider label="Easing curve" value={sh.ease} onChange={(ease) => setSh({ ...sh, ease })} min={1} max={4} step={0.1} />
              <ColorField label="Shadow colour" value={sh.color} onChange={(color) => setSh({ ...sh, color })} alpha={false} />
              <Switch checked={sh.inset} onChange={(inset) => setSh({ ...sh, inset })} label="Inset" />
              <div className="flex flex-wrap gap-1.5">{[['Subtle', { layers: 4, distance: 8, blur: 16, opacity: 0.12 }], ['Soft', { layers: 6, distance: 24, blur: 48, opacity: 0.22 }], ['Deep', { layers: 8, distance: 60, blur: 120, opacity: 0.35 }], ['Sharp', { layers: 3, distance: 6, blur: 2, opacity: 0.3 }]].map(([n, p]) => <Button key={n as string} size="sm" variant="secondary" onClick={() => setSh({ ...sh, ...(p as object) })}>{n as string}</Button>)}</div>
            </>}
            {tab === 'glass' && <>
              <Slider label="Blur" value={gl.blur} onChange={(blur) => setGl({ ...gl, blur })} min={0} max={40} suffix="px" />
              <Slider label="Transparency (fill)" value={gl.transparency} onChange={(transparency) => setGl({ ...gl, transparency })} min={0} max={1} step={0.01} />
              <Slider label="Saturation" value={gl.saturation} onChange={(saturation) => setGl({ ...gl, saturation })} min={100} max={300} suffix="%" />
              <Slider label="Corner radius" value={gl.radius} onChange={(radius) => setGl({ ...gl, radius })} min={0} max={48} suffix="px" />
              <ColorField label="Tint" value={gl.color} onChange={(color) => setGl({ ...gl, color })} alpha={false} />
              <Switch checked={gl.outline} onChange={(outline) => setGl({ ...gl, outline })} label="Border" />
              {gl.outline && <Slider label="Border opacity" value={gl.border} onChange={(border) => setGl({ ...gl, border })} min={0} max={1} step={0.01} />}
            </>}
            {tab === 'neu' && <>
              <div><Label>Shape</Label><Segmented value={nu.shape} onChange={(shape) => setNu({ ...nu, shape })} options={['flat', 'concave', 'convex', 'pressed']} /></div>
              <ColorField label="Surface colour" value={nu.color} onChange={(color) => setNu({ ...nu, color })} alpha={false} />
              <Slider label="Size" value={nu.size} onChange={(size) => setNu({ ...nu, size, distance: Math.min(nu.distance, Math.round(size / 10)) })} min={60} max={320} suffix="px" />
              <Slider label="Distance" value={nu.distance} onChange={(distance) => setNu({ ...nu, distance, blur: distance * 2 })} min={2} max={50} suffix="px" />
              <Slider label="Intensity" value={nu.intensity} onChange={(intensity) => setNu({ ...nu, intensity })} min={0.01} max={0.6} step={0.01} />
              <Slider label="Blur" value={nu.blur} onChange={(blur) => setNu({ ...nu, blur })} min={0} max={100} suffix="px" />
              <Slider label="Radius" value={nu.radius} onChange={(radius) => setNu({ ...nu, radius })} min={0} max={160} suffix="px" />
            </>}
            {tab === 'radius' && <>
              <p className="text-xs text-muted">Drag the 8 handles on the shape, or fine-tune each value. Horizontal radii first, then vertical (after the slash).</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {['Top-left X', 'Top-right X', 'Bottom-right X', 'Bottom-left X', 'Top-left Y', 'Top-right Y', 'Bottom-right Y', 'Bottom-left Y'].map((l, i) => <Slider key={l} label={l} value={br[i]} onChange={(v) => setBr(br.map((x, j) => (j === i ? v : x)))} suffix="%" />)}
              </div>
              <ColorField label="Fill" value={brColor} onChange={setBrColor} alpha={false} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={<Shuffle className="size-4" />} onClick={() => { const r = () => 20 + Math.round(Math.random() * 60); const a = r(), b = r(), c = r(), d = r(); setBr([a, 100 - a, b, 100 - b, c, d, 100 - d, 100 - c]) }}>Random blob</Button>
                <Button size="sm" variant="ghost" onClick={() => setBr([50, 50, 50, 50, 50, 50, 50, 50])}>Circle</Button>
                <Button size="sm" variant="ghost" onClick={() => setBr([10, 10, 10, 10, 10, 10, 10, 10])}>Rounded</Button>
                <Button size="sm" variant="ghost" onClick={() => setBr([100, 0, 100, 0, 100, 0, 100, 0])}>Leaf</Button>
              </div>
            </>}
            {tab === 'text' && <>
              <div><Label>Text</Label><Input value={txt.text} onChange={(e) => setTxt({ ...txt, text: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3"><Slider label="Size" value={txt.size} onChange={(size) => setTxt({ ...txt, size })} min={16} max={140} suffix="px" /><Slider label="Weight" value={txt.weight} onChange={(weight) => setTxt({ ...txt, weight })} min={100} max={900} step={100} /></div>
              <ColorField label="Text colour" value={txt.color} onChange={(color) => setTxt({ ...txt, color })} />
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(TEXT_PRESETS).map(([n, p]) => <Button key={n} size="sm" variant="secondary" onClick={() => { setTs(p.layers.map((l, i) => ({ ...l, id: Date.now() + i }))); setTxt((t) => ({ ...t, color: p.color })); if (p.bg) { setBgKind('solid'); setBgColor(p.bg) } }}>{n}</Button>)}
              </div>
              <div className="space-y-3">
                {ts.map((s, i) => (
                  <div key={s.id} className="space-y-2 rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between text-xs font-semibold text-muted">Layer {i + 1}<button disabled={ts.length <= 1} onClick={() => setTs(ts.filter((x) => x.id !== s.id))} className="rounded p-1 hover:text-danger disabled:opacity-40 cursor-pointer"><Trash2 className="size-3.5" /></button></div>
                    <div className="grid grid-cols-3 gap-2">
                      {(['x', 'y', 'blur'] as const).map((k) => <div key={k}><div className="mb-1 text-[10px] uppercase text-muted">{k}</div><Input type="number" value={s[k]} min={k === 'blur' ? 0 : -100} max={100} className="h-8" onChange={(e) => setTs(ts.map((x) => (x.id === s.id ? { ...x, [k]: +e.target.value } : x)))} /></div>)}
                    </div>
                    <ColorField value={s.color} onChange={(color) => setTs(ts.map((x) => (x.id === s.id ? { ...x, color } : x)))} />
                  </div>
                ))}
                <Button size="sm" variant="outline" className="w-full" icon={<Plus className="size-4" />} onClick={() => setTs([...ts, { id: Date.now(), x: 2, y: 2, blur: 4, color: 'rgba(0,0,0,0.4)' }])}>Add layer</Button>
              </div>
            </>}
          </Card>
        </aside>
      </div>
    </div>
  )
}

const TEXT_PRESETS: Record<string, { color: string; bg?: string; layers: { x: number; y: number; blur: number; color: string }[] }> = {
  Neon: { color: '#ffffff', bg: '#134e4a', layers: [{ x: 0, y: 0, blur: 6, color: '#fff' }, { x: 0, y: 0, blur: 16, color: '#f97316' }, { x: 0, y: 0, blur: 40, color: '#f97316' }, { x: 0, y: 0, blur: 80, color: '#14b8a6' }] },
  Retro: { color: '#ffd23f', bg: '#134e4a', layers: [{ x: 3, y: 3, blur: 0, color: '#ef4444' }, { x: 6, y: 6, blur: 0, color: '#134e4a' }, { x: 9, y: 9, blur: 0, color: '#3bceac' }] },
  '3D': { color: '#ffffff', bg: '#5b8def', layers: Array.from({ length: 6 }, (_, i) => ({ x: 0, y: i + 1, blur: 0, color: `hsl(220 40% ${70 - i * 6}%)` })).concat([{ x: 0, y: 8, blur: 12, color: 'rgba(0,0,0,.35)' }]) },
  Outline: { color: '#f8fafc', bg: '#f8fafc', layers: [{ x: -2, y: -2, blur: 0, color: '#0f172a' }, { x: 2, y: -2, blur: 0, color: '#0f172a' }, { x: -2, y: 2, blur: 0, color: '#0f172a' }, { x: 2, y: 2, blur: 0, color: '#0f172a' }] },
  Emboss: { color: '#d1d5db', bg: '#d1d5db', layers: [{ x: -1, y: -1, blur: 1, color: 'rgba(255,255,255,.9)' }, { x: 2, y: 2, blur: 3, color: 'rgba(0,0,0,.35)' }] },
  Soft: { color: '#1e293b', bg: '#f1f5f9', layers: [{ x: 0, y: 4, blur: 12, color: 'rgba(15,23,42,.25)' }] },
}

/** 8 draggable handles for fancy border radius (two per side) */
function RadiusHandles({ v, onChange }: { v: number[]; onChange: (v: number[]) => void }) {
  // handle positions: index -> {side, axis}
  // 0 TL-x on top (left%), 1 TR-x on top (100-v), 2 BR-x on bottom (100-v), 3 BL-x on bottom (left%)
  // 4 TL-y on left (top%), 5 TR-y on right (top%), 6 BR-y on right (100-v), 7 BL-y on left (100-v)
  const pos = (i: number): [number, number] => [
    [v[0], 0], [100 - v[1], 0], [100 - v[2], 100], [v[3], 100], [0, v[4]], [100, v[5]], [100, 100 - v[6]], [0, 100 - v[7]],
  ][i] as [number, number]
  const down = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    const box = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect()
    const mv = (ev: PointerEvent) => {
      const x = Math.round(Math.min(100, Math.max(0, ((ev.clientX - box.left) / box.width) * 100))), y = Math.round(Math.min(100, Math.max(0, ((ev.clientY - box.top) / box.height) * 100)))
      const val = [x, 100 - x, 100 - x, x, y, y, 100 - y, 100 - y][i]
      const n = [...v]; n[i] = val
      // keep opposite handle on the same edge consistent (fancy-border-radius behaviour)
      const pair: Record<number, number> = { 0: 1, 1: 0, 2: 3, 3: 2, 4: 7, 7: 4, 5: 6, 6: 5 }
      n[pair[i]] = 100 - val
      onChange(n)
    }
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
  }
  return <>
    <div className="pointer-events-none absolute inset-0 rounded-sm border border-dashed border-fg/30" />
    {v.map((_, i) => { const [x, y] = pos(i); return <div key={i} onPointerDown={down(i)} className={cn('absolute size-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white shadow-md touch-none', i < 4 ? 'bg-accent' : 'bg-cyan-500')} style={{ left: `${x}%`, top: `${y}%` }} /> })}
  </>
}
