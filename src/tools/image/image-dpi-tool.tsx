import { useEffect, useMemo, useState } from 'react'
import { Ruler } from 'lucide-react'
import { Button, Dropzone, Field, Input, Segmented, Select, ToolGrid, ResultCard, ErrorNote } from '@/components/ui'
import { baseName, canvasToBlob, loadImage } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { readDpi, setDpi } from '@/lib/b14/image'
import { Tile } from '@/lib/b14/ui'
import { piexif, toBin, fromBin } from '@/lib/b2/exif'

/** Also update EXIF XResolution when a JPEG carries EXIF, since Windows and phones read that first. */
async function withExifDpi(b: Uint8Array, dpi: number): Promise<Uint8Array> {
  if (!(b[0] === 0xff && b[1] === 0xd8)) return b
  const bin = toBin(b)
  if (!bin.slice(0, 65536).includes('Exif\0\0')) return b
  try { const px = await piexif(); const ex = px.load(bin); ex['0th'] = ex['0th'] || {}; ex['0th'][px.ImageIFD.XResolution] = [dpi, 1]; ex['0th'][px.ImageIFD.YResolution] = [dpi, 1]; ex['0th'][px.ImageIFD.ResolutionUnit] = 2; return fromBin(px.insert(px.dump(ex), bin)) } catch { return b }
}

const PRESETS = ['72', '96', '150', '200', '300', '600']
type Unit = 'cm' | 'mm' | 'in'
const toIn = (v: number, u: Unit) => (u === 'in' ? v : u === 'cm' ? v / 2.54 : v / 25.4)
const fromIn = (v: number, u: Unit) => (u === 'in' ? v : u === 'cm' ? v * 2.54 : v * 25.4)

export default function ImageDpiTool() {
  const [file, setFile] = useState<File | null>(null)
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [img, setImg] = useState<{ w: number; h: number } | null>(null)
  const [mode, setMode] = useState<'meta' | 'resize'>('meta')
  const [dpi, setDpiV] = useState('300')
  const [unit, setUnit] = useState<Unit>('cm')
  const [pw, setPw] = useState(3.5)
  const [ph, setPh] = useState(4.5)
  const [out, setOut] = useState<Blob | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { if (!file) return; file.arrayBuffer().then((b) => setBytes(new Uint8Array(b))); loadImage(file).then((i) => setImg({ w: i.naturalWidth, h: i.naturalHeight })) }, [file])
  useEffect(() => setOut(null), [mode, dpi, unit, pw, ph])
  const cur = useMemo(() => (bytes ? readDpi(bytes) : null), [bytes])
  const d = Math.max(1, +dpi || 300)
  const print = img ? { w: fromIn(img.w / d, unit), h: fromIn(img.h / d, unit) } : null
  const target = { w: Math.round(toIn(pw, unit) * d), h: Math.round(toIn(ph, unit) * d) }
  const run = async () => {
    setErr(null)
    try {
      if (!file || !bytes) return
      if (mode === 'meta') { const fmt = cur?.format; if (fmt === 'other') throw new Error('Only JPG and PNG can store DPI. Pick Resize to make a new JPG.'); setOut(new Blob([setDpi(await withExifDpi(bytes, d), d) as BlobPart], { type: file.type || (fmt === 'png' ? 'image/png' : 'image/jpeg') })); return }
      const im = await loadImage(file)
      const c = document.createElement('canvas'); c.width = target.w; c.height = target.h
      const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
      ctx.imageSmoothingQuality = 'high'
      const s = Math.max(target.w / im.naturalWidth, target.h / im.naturalHeight); const w = im.naturalWidth * s, h = im.naturalHeight * s
      ctx.drawImage(im, (target.w - w) / 2, (target.h - h) / 2, w, h)
      const isPng = file.type === 'image/png'
      const blob = await canvasToBlob(c, isPng ? 'image/png' : 'image/jpeg', 0.92)
      setOut(new Blob([setDpi(new Uint8Array(await blob.arrayBuffer()), d) as BlobPart], { type: blob.type }))
    } catch (e: any) { setErr(e?.message || 'Could not change the DPI.') }
  }
  if (!file) return <Dropzone accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onFiles={(f) => setFile(f[0])} label="Drop a JPG or PNG" sub="Check and change DPI for exam forms, visa photos and print shops, or resize to an exact size in cm, mm or inches." />
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => { setFile(null); setBytes(null); setImg(null); setOut(null) }} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Pixels" value={img ? `${img.w} x ${img.h}` : '...'} />
          <Tile label="Current DPI" value={cur?.x ? `${cur.x}` : 'Not set'} sub={cur?.source} />
          <Tile label={`Print size at ${d} DPI`} value={print ? `${print.w.toFixed(1)} x ${print.h.toFixed(1)} ${unit}` : '...'} />
          <Tile label="Format" value={cur?.format.toUpperCase() ?? '...'} />
        </div>
        {out && <ResultCard blob={out} filename={`${baseName(file.name)}-${d}dpi.${out.type === 'image/png' ? 'png' : 'jpg'}`} originalSize={file.size} title={mode === 'meta' ? `DPI set to ${d}, pixels untouched` : `Resized to ${target.w} x ${target.h} px at ${d} DPI`} />}
        <p className="text-sm text-muted">DPI is only a label that says how big the image prints. Changing it alone keeps every pixel. To make a photo exactly 3.5 x 4.5 cm at 300 DPI, use Resize.</p>
      </>}
      side={<>
        <Field label="What to do"><Segmented value={mode} onChange={setMode} options={[{ value: 'meta', label: 'Change DPI only' }, { value: 'resize', label: 'Resize to print size' }]} /></Field>
        <Field label="DPI"><div className="flex gap-2"><Select value={PRESETS.includes(dpi) ? dpi : 'custom'} onChange={(v) => v !== 'custom' && setDpiV(v)} options={[...PRESETS, { value: 'custom', label: 'Custom' }]} /><Input type="number" min={1} max={2400} value={dpi} onChange={(e) => setDpiV(e.target.value)} className="w-24" aria-label="DPI value" /></div></Field>
        {mode === 'resize' && <>
          <Field label="Unit"><Segmented value={unit} onChange={setUnit} options={[{ value: 'cm', label: 'cm' }, { value: 'mm', label: 'mm' }, { value: 'in', label: 'inch' }]} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Width"><Input type="number" step={0.1} min={0.1} value={pw} onChange={(e) => setPw(Math.max(0.1, +e.target.value || 1))} /></Field><Field label="Height"><Input type="number" step={0.1} min={0.1} value={ph} onChange={(e) => setPh(Math.max(0.1, +e.target.value || 1))} /></Field></div>
          <p className="text-xs text-muted">Output {target.w} x {target.h} pixels. The photo is scaled and centre cropped to fill the size.</p>
        </>}
        <ErrorNote error={err} />
        <Button className="w-full" icon={<Ruler className="size-4" />} onClick={run}>{mode === 'meta' ? `Set ${d} DPI` : 'Resize and set DPI'}</Button>
      </>}
    />
  )
}
