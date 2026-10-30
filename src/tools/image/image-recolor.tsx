import { useEffect, useRef, useState } from 'react'
import { Paintbrush, RotateCcw } from 'lucide-react'
import { Button, Dropzone, Field, Input, Segmented, Slider, Switch, ToolGrid, ResultCard, Label } from '@/components/ui'
import { baseName, canvasToBlob, loadImage } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { recolor, topColors, hex2rgb, rgb2hex } from '@/lib/b14/image'

const MAXP = 4096

export default function ImageRecolor() {
  const [file, setFile] = useState<File | null>(null)
  const src = useRef<ImageData | null>(null)
  const view = useRef<HTMLCanvasElement>(null)
  const [from, setFrom] = useState('#FFFFFF')
  const [to, setTo] = useState('#14B8A6')
  const [mode, setMode] = useState<'color' | 'clear'>('color')
  const [tol, setTol] = useState(18)
  const [feather, setFeather] = useState(8)
  const [shade, setShade] = useState(true)
  const [colors, setColors] = useState<string[]>([])
  const [changed, setChanged] = useState(0)
  const [out, setOut] = useState<Blob | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    if (!file) return
    loadImage(file).then((img) => {
      const s = Math.min(1, MAXP / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s)
      const c = document.createElement('canvas'); c.width = w; c.height = h
      const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(img, 0, 0, w, h)
      src.current = ctx.getImageData(0, 0, w, h); setSize({ w, h })
      const tc = topColors(src.current.data); setColors(tc); if (tc[0]) setFrom(tc[0].toUpperCase())
    })
  }, [file])
  useEffect(() => {
    const s = src.current, c = view.current; if (!s || !c) return
    const t = setTimeout(async () => {
      const d = new Uint8ClampedArray(s.data)
      setChanged(recolor(d, { from: hex2rgb(from), to: mode === 'clear' ? null : hex2rgb(to), tolerance: tol, feather, keepShade: shade }))
      c.width = s.width; c.height = s.height; c.getContext('2d')!.putImageData(new ImageData(d, s.width, s.height), 0, 0)
      setOut(await canvasToBlob(c, 'image/png'))
    }, 60)
    return () => clearTimeout(t)
  }, [from, to, mode, tol, feather, shade, size])
  const pick = (e: React.MouseEvent<HTMLCanvasElement>) => { const s = src.current, c = view.current; if (!s || !c) return; const r = c.getBoundingClientRect(); const x = Math.floor(((e.clientX - r.left) / r.width) * s.width), y = Math.floor(((e.clientY - r.top) / r.height) * s.height); const i = (y * s.width + x) * 4; setFrom(rgb2hex(s.data[i], s.data[i + 1], s.data[i + 2]).toUpperCase()) }
  if (!file) return <Dropzone accept="image/*" onFiles={(f) => setFile(f[0])} label="Drop an image" sub="Swap one colour for another, or make a colour transparent, like removing a white background from a logo." />
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => { setFile(null); src.current = null; setOut(null) }} />
        <div className="checker grid place-items-center overflow-hidden rounded-2xl border border-border p-3"><canvas ref={view} onClick={pick} className="max-h-[65vh] max-w-full cursor-crosshair" aria-label="Result preview, click to pick the colour to replace" /></div>
        <p className="text-xs text-muted">Click the image to pick the colour you want to change. {changed.toLocaleString()} pixels changed.</p>
        {out && <ResultCard blob={out} filename={`${baseName(file.name)}-recolored.png`} originalSize={file.size} title="PNG ready" />}
      </>}
      side={<>
        <div><Label>Colour to change</Label><div className="flex items-center gap-2"><Input type="color" value={from} onChange={(e) => setFrom(e.target.value.toUpperCase())} className="w-14 p-1" aria-label="Colour to change" /><Input value={from} onChange={(e) => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && setFrom(e.target.value)} className="font-mono" aria-label="Hex" /></div>
          <div className="mt-2 flex flex-wrap gap-1.5">{colors.map((c) => <button key={c} type="button" title={c} aria-label={`Pick ${c}`} onClick={() => setFrom(c.toUpperCase())} className="size-7 cursor-pointer rounded-md border border-border" style={{ background: c }} />)}</div></div>
        <Field label="Change it to"><Segmented value={mode} onChange={setMode} options={[{ value: 'color', label: 'Another colour' }, { value: 'clear', label: 'Transparent' }]} /></Field>
        {mode === 'color' && <><div className="flex items-center gap-2"><Input type="color" value={to} onChange={(e) => setTo(e.target.value.toUpperCase())} className="w-14 p-1" aria-label="New colour" /><Input value={to} onChange={(e) => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && setTo(e.target.value)} className="font-mono" aria-label="New hex" /></div><Switch checked={shade} onChange={setShade} label="Keep light and shadow" /></>}
        <Slider label="Tolerance" value={tol} onChange={setTol} min={0} max={80} />
        <Slider label="Soft edge" value={feather} onChange={setFeather} min={0} max={40} />
        <Button variant="ghost" size="sm" icon={<RotateCcw className="size-4" />} onClick={() => { setTol(18); setFeather(8) }}>Reset sliders</Button>
        <p className="flex gap-1.5 text-xs text-muted"><Paintbrush className="size-4 shrink-0" />Large photos are worked on at up to 4096 pixels on the long side. Output is PNG, so transparency is kept.</p>
      </>}
    />
  )
}
