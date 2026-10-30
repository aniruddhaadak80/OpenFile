import { useEffect, useRef, useState } from 'react'
import { Grid3x3, Download } from 'lucide-react'
import { Button, Dropzone, Field, Input, Slider, Switch, ToolGrid, ErrorNote, Textarea } from '@/components/ui'
import { canvasToBlob, downloadBlob, zipFiles } from '@/lib/files'
import { packShelves, type Box2 } from '@/lib/b14/font'
import { Tile } from '@/lib/b14/ui'

const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('')

export default function BitmapFontGenerator() {
  const [file, setFile] = useState<File | null>(null)
  const [family, setFamily] = useState('')
  const [chars, setChars] = useState(ASCII)
  const [size, setSize] = useState(32)
  const [pad, setPad] = useState(2)
  const [color, setColor] = useState('#FFFFFF')
  const [stroke, setStroke] = useState(0)
  const [strokeColor, setStrokeColor] = useState('#000000')
  const [smooth, setSmooth] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [atlas, setAtlas] = useState<{ w: number; h: number; glyphs: (Box2 & { ch: string; xo: number; yo: number; adv: number })[]; lineH: number; base: number } | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!file) return
    const name = 'bmf-' + Math.random().toString(36).slice(2, 8)
    file.arrayBuffer().then(async (b) => { const ff = new FontFace(name, b); await ff.load(); document.fonts.add(ff); setFamily(name); setErr(null) }).catch(() => setErr('This font could not be loaded by the browser. Try a TTF, OTF, WOFF or WOFF2 file.'))
  }, [file])
  useEffect(() => {
    if (!family || !canvas.current) return
    const meas = document.createElement('canvas').getContext('2d')!
    meas.font = `${size}px "${family}"`
    const list = [...new Set([...chars])]
    const m0 = meas.measureText('Mg')
    const ascent = Math.ceil(m0.fontBoundingBoxAscent ?? size * 0.8), descent = Math.ceil(m0.fontBoundingBoxDescent ?? size * 0.2)
    const glyphs: (Box2 & { ch: string; xo: number; yo: number; adv: number })[] = list.map((ch, id) => { const m = meas.measureText(ch); const l = Math.ceil(m.actualBoundingBoxLeft), r = Math.ceil(m.actualBoundingBoxRight); const w = Math.max(1, l + r) + pad * 2 + stroke * 2, h = ascent + descent + pad * 2 + stroke * 2; return { id, ch, w: ch === ' ' ? 1 : w, h: ch === ' ' ? 1 : h, xo: -l - pad - stroke, yo: -pad - stroke, adv: Math.round(m.width) } })
    const s = packShelves(glyphs)
    const c = canvas.current; c.width = s.w; c.height = s.h
    const ctx = c.getContext('2d')!; ctx.clearRect(0, 0, s.w, s.h)
    ctx.font = `${size}px "${family}"`; ctx.textBaseline = 'alphabetic'; ctx.imageSmoothingEnabled = smooth
    ;(ctx as any).fontKerning = 'none'
    for (const g of glyphs) {
      if (g.ch === ' ') continue
      const x = g.x! - g.xo, y = g.y! + pad + stroke + ascent
      if (stroke) { ctx.lineWidth = stroke * 2; ctx.strokeStyle = strokeColor; ctx.lineJoin = 'round'; ctx.strokeText(g.ch, x, y) }
      ctx.fillStyle = color; ctx.fillText(g.ch, x, y)
    }
    if (!smooth) { const d = ctx.getImageData(0, 0, s.w, s.h); for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 110 ? 255 : 0; ctx.putImageData(d, 0, 0) }
    setAtlas({ ...s, glyphs, lineH: ascent + descent, base: ascent })
  }, [family, chars, size, pad, color, stroke, strokeColor, smooth])
  const name = (file?.name ?? 'font').replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-') + `-${size}`
  const fnt = () => { if (!atlas) return ''; const lines = [`info face="${name}" size=${size} bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=${smooth ? 1 : 0} aa=1 padding=${pad},${pad},${pad},${pad} spacing=0,0`, `common lineHeight=${atlas.lineH} base=${atlas.base} scaleW=${atlas.w} scaleH=${atlas.h} pages=1 packed=0`, `page id=0 file="${name}.png"`, `chars count=${atlas.glyphs.length}`]; for (const g of atlas.glyphs) lines.push(`char id=${g.ch.codePointAt(0)} x=${g.x} y=${g.y} width=${g.ch === ' ' ? 0 : g.w} height=${g.ch === ' ' ? 0 : g.h} xoffset=${g.xo} yoffset=${g.yo} xadvance=${g.adv} page=0 chnl=15`); return lines.join('\n') + '\n' }
  const json = () => JSON.stringify({ face: name, size, lineHeight: atlas?.lineH, base: atlas?.base, width: atlas?.w, height: atlas?.h, chars: atlas?.glyphs.map((g) => ({ char: g.ch, id: g.ch.codePointAt(0), x: g.x, y: g.y, width: g.ch === ' ' ? 0 : g.w, height: g.ch === ' ' ? 0 : g.h, xoffset: g.xo, yoffset: g.yo, xadvance: g.adv })) }, null, 2)
  const save = async () => { if (!canvas.current || !atlas) return; downloadBlob(await zipFiles([{ name: `${name}.png`, data: await canvasToBlob(canvas.current, 'image/png') }, { name: `${name}.fnt`, data: fnt() }, { name: `${name}.json`, data: json() }]), `${name}-bitmap-font.zip`) }
  if (!file) return <Dropzone accept=".ttf,.otf,.woff,.woff2" onFiles={(f) => setFile(f[0])} label="Drop a font" sub="Make a glyph atlas PNG with a BMFont .fnt and JSON file for game engines like Phaser, Unity, Godot, libGDX and PixiJS." />
  return (
    <ToolGrid
      main={<>
        <ErrorNote error={err} />
        <div className="checker scrollbar-thin grid max-h-[65vh] place-items-center overflow-auto rounded-2xl border border-border p-3"><canvas ref={canvas} className="max-w-full" style={{ imageRendering: smooth ? 'auto' : 'pixelated' }} aria-label="Glyph atlas preview" /></div>
        {atlas && <div className="grid grid-cols-3 gap-2"><Tile label="Atlas" value={`${atlas.w} x ${atlas.h}`} /><Tile label="Glyphs" value={atlas.glyphs.length} /><Tile label="Line height" value={`${atlas.lineH} px`} /></div>}
      </>}
      side={<>
        <Field label="Characters"><Textarea value={chars} onChange={(e) => setChars(e.target.value.replace(/\n/g, ''))} className="min-h-20 font-mono text-xs" /></Field>
        <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setChars(ASCII)}>ASCII</Button><Button size="sm" variant="outline" onClick={() => setChars('0123456789:.,+-%')}>Digits</Button></div>
        <Slider label="Size" value={size} onChange={setSize} min={8} max={128} suffix=" px" />
        <Slider label="Padding" value={pad} onChange={setPad} min={0} max={8} suffix=" px" />
        <div className="grid grid-cols-2 gap-2"><Field label="Colour"><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></Field><Field label="Outline colour"><Input type="color" value={strokeColor} onChange={(e) => setStrokeColor(e.target.value)} /></Field></div>
        <Slider label="Outline" value={stroke} onChange={setStroke} min={0} max={6} suffix=" px" />
        <Switch checked={smooth} onChange={setSmooth} label="Smooth edges (off for pixel fonts)" />
        <Button className="w-full" icon={<Download className="size-4" />} disabled={!atlas} onClick={save}>Download PNG + FNT + JSON</Button>
        <p className="flex gap-1.5 text-xs text-muted"><Grid3x3 className="size-4 shrink-0" />The .fnt file uses the text BMFont format most engines read.</p>
      </>}
    />
  )
}
