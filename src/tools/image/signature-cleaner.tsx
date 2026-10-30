import { useEffect, useRef, useState } from 'react'
import { Signature } from 'lucide-react'
import { Dropzone, Field, Input, Segmented, Slider, Switch, ToolGrid, ResultCard } from '@/components/ui'
import { baseName, canvasToBlob, loadImage } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { cleanSignature, hex2rgb } from '@/lib/b14/image'

const INKS = [{ value: 'keep', label: 'Keep' }, { value: '#0B1F5C', label: 'Blue' }, { value: '#111111', label: 'Black' }, { value: 'custom', label: 'Custom' }]

export default function SignatureCleaner() {
  const [file, setFile] = useState<File | null>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [thr, setThr] = useState(22)
  const [smooth, setSmooth] = useState(12)
  const [ink, setInk] = useState('#0B1F5C')
  const [custom, setCustom] = useState('#0E7490')
  const [crop, setCrop] = useState(true)
  const [pad, setPad] = useState(16)
  const [out, setOut] = useState<Blob | null>(null)
  const view = useRef<HTMLCanvasElement>(null)
  useEffect(() => { if (file) loadImage(file).then(setImg) }, [file])
  useEffect(() => {
    if (!img || !view.current) return
    const t = setTimeout(async () => {
      const s = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s)
      const c = document.createElement('canvas'); c.width = w; c.height = h
      const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(img, 0, 0, w, h)
      const data = ctx.getImageData(0, 0, w, h)
      const box = cleanSignature(data.data, w, h, { threshold: thr, smooth, ink: ink === 'keep' ? null : hex2rgb(ink === 'custom' ? custom : ink) })
      ctx.putImageData(data, 0, 0)
      const v = view.current!
      if (crop && box.x1 >= box.x0) { const x = Math.max(0, box.x0 - pad), y = Math.max(0, box.y0 - pad), cw = Math.min(w, box.x1 + pad + 1) - x, ch = Math.min(h, box.y1 + pad + 1) - y; v.width = cw; v.height = ch; v.getContext('2d')!.drawImage(c, x, y, cw, ch, 0, 0, cw, ch) }
      else { v.width = w; v.height = h; v.getContext('2d')!.drawImage(c, 0, 0) }
      setOut(await canvasToBlob(v, 'image/png'))
    }, 80)
    return () => clearTimeout(t)
  }, [img, thr, smooth, ink, custom, crop, pad])
  if (!file) return <Dropzone accept="image/*" onFiles={(f) => setFile(f[0])} label="Drop a photo of your signature" sub="Sign on white paper, take a photo, and get a clean transparent PNG for PDFs and documents. Shadows and paper colour are removed." />
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => { setFile(null); setImg(null); setOut(null) }} />
        <div className="checker grid min-h-48 place-items-center rounded-2xl border border-border p-4"><canvas ref={view} className="max-h-[50vh] max-w-full" aria-label="Clean signature preview" /></div>
        {out && <ResultCard blob={out} filename={`${baseName(file.name)}-signature.png`} title="Transparent signature ready" />}
      </>}
      side={<>
        <Slider label="Ink strength" value={thr} onChange={setThr} min={5} max={60} />
        <Slider label="Edge smoothness" value={smooth} onChange={setSmooth} min={1} max={40} />
        <Field label="Ink colour"><Segmented value={ink} onChange={setInk} options={INKS} /></Field>
        {ink === 'custom' && <Input type="color" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Custom ink colour" />}
        <Switch checked={crop} onChange={setCrop} label="Crop to the signature" />
        {crop && <Slider label="Padding" value={pad} onChange={setPad} min={0} max={80} suffix=" px" />}
        <p className="flex gap-1.5 text-xs text-muted"><Signature className="size-4 shrink-0" />Raise ink strength if paper texture shows, lower it if thin strokes break up. Then use Sign PDF to place it.</p>
      </>}
    />
  )
}
