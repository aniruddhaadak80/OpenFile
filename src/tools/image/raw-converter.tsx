import { useEffect, useRef, useState } from 'react'
import { Aperture, Camera, RefreshCw } from 'lucide-react'
import { Button, Dropzone, Field, FileChip, Label, Progress, Segmented, Slider, Switch, ToolGrid, ErrorNote, ResultCard, Spinner, useJob } from '@/components/ui'
import { baseName } from '@/lib/files'
import { encodeCanvas, rgbaToCanvas, type OutFmt } from '@/lib/b2/codecs'

const ACCEPT = '.cr2,.cr3,.crw,.nef,.nrw,.arw,.srf,.sr2,.dng,.raf,.orf,.rw2,.pef,.srw,.3fr,.erf,.mos,.mrw,.x3f,.iiq,.gpr,.kdc,.dcr,.raw,.rwl,.mef'
type WB = 'camera' | 'auto' | 'daylight' | 'custom'

function rgbToRgba(d: Uint8Array | Uint16Array, w: number, h: number, colors: number, bits: number) {
  const out = new Uint8ClampedArray(w * h * 4)
  const shift = bits === 16 ? 8 : 0
  for (let i = 0, j = 0; i < w * h; i++, j += colors) {
    const r = d[j] >> shift, g = colors > 1 ? d[j + 1] >> shift : r, b = colors > 2 ? d[j + 2] >> shift : r
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255
  }
  return { data: out, width: w, height: h }
}

export default function RawConverter() {
  const [file, setFile] = useState<File | null>(null)
  const [meta, setMeta] = useState<any>(null)
  const [thumb, setThumb] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [exposure, setExposure] = useState(0)
  const [bright, setBright] = useState(1)
  const [wb, setWb] = useState<WB>('camera')
  const [temp, setTemp] = useState(0)
  const [tint, setTint] = useState(0)
  const [highlight, setHighlight] = useState('0')
  const [half, setHalf] = useState(false)
  const [fmt, setFmt] = useState<OutFmt>('jpg')
  const [quality, setQuality] = useState(90)
  const [result, setResult] = useState<Blob | null>(null)
  const [loading, setLoading] = useState(false)
  const { busy, progress, error, run, setError } = useJob()
  const urls = useRef<string[]>([])
  useEffect(() => () => urls.current.forEach(URL.revokeObjectURL), [])
  const track = (u: string) => (urls.current.push(u), u)

  const open = async (f: File) => {
    setFile(f); setResult(null); setPreview(null); setThumb(null); setMeta(null); setError(null); setLoading(true)
    try {
      const LibRaw = (await import('libraw-wasm')).default
      const raw = new LibRaw()
      await raw.open(new Uint8Array(await f.arrayBuffer()), { halfSize: true })
      const m = await raw.metadata()
      setMeta(m)
      const t = await raw.thumbnailData().catch(() => undefined)
      if (t && t.format === 'jpeg') setThumb(track(URL.createObjectURL(new Blob([t.data as BlobPart], { type: 'image/jpeg' }))))
      raw.dispose()
    } catch (e: any) { setError('Could not read this RAW file: ' + (e?.message || e)) } finally { setLoading(false) }
  }

  const settings = (full: boolean) => {
    const s: Record<string, unknown> = { halfSize: full ? half : true, bright, highlight: Number(highlight), userQual: full ? 3 : 0, outputBps: 8 }
    if (exposure !== 0) { s.expCorrec = true; s.expShift = Math.pow(2, exposure); s.expPreser = exposure > 0 ? 0.8 : 0 }
    if (wb === 'camera') s.useCameraWb = true
    else if (wb === 'auto') s.useAutoWb = true
    else if (wb === 'custom') { const r = 1 + temp / 100, b = 1 - temp / 100, g = 1 - tint / 200; s.userMul = [Math.max(0.1, 2 * r), Math.max(0.1, g), Math.max(0.1, 1.6 * b), Math.max(0.1, g)] }
    return s
  }

  const develop = (full: boolean) => run(async (setP) => {
    if (!file) return
    setP(0.1)
    const LibRaw = (await import('libraw-wasm')).default
    const raw = new LibRaw()
    try {
      await raw.open(new Uint8Array(await file.arrayBuffer()), settings(full) as any)
      setP(0.6)
      const img = await raw.imageData()
      if (!img) throw new Error('The decoder returned no image.')
      const c = rgbaToCanvas(rgbToRgba(img.data, img.width, img.height, img.colors, img.bits))
      setP(0.8)
      if (!full) { const b = await encodeCanvas(c, 'jpg', { quality: 80 }); setPreview(track(URL.createObjectURL(b))); setP(1); return }
      const blob = await encodeCanvas(c, fmt, { quality })
      setResult(blob); setPreview(track(URL.createObjectURL(blob))); setP(1)
    } finally { raw.dispose() }
  })

  if (!file) return <Dropzone accept={ACCEPT} onFiles={(f) => open(f[0])} label="Drop a camera RAW file" sub="CR2, CR3, NEF, ARW, DNG, RAF, ORF, RW2, PEF and more · processed on your device" />
  const shown = preview ?? thumb
  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <FileChip file={file} onRemove={() => setFile(null)} />
          <div className="checker grid min-h-72 place-items-center overflow-hidden rounded-2xl border border-border">
            {loading ? <Spinner label="Reading RAW file" /> : shown ? <img src={shown} alt="Preview" className="max-h-[65vh] max-w-full object-contain" /> : <div className="p-8 text-sm text-muted">No embedded preview. Press "Update preview" to develop the image.</div>}
          </div>
          {meta && (
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              {[['Camera', `${meta.camera_make ?? ''} ${meta.camera_model ?? ''}`.trim() || 'Unknown'], ['Size', `${meta.width}×${meta.height}`], ['ISO', meta.iso_speed || '-'], ['Shutter', meta.shutter ? (meta.shutter < 1 ? `1/${Math.round(1 / meta.shutter)}s` : `${meta.shutter}s`) : '-'], ['Aperture', meta.aperture ? `f/${meta.aperture.toFixed(1)}` : '-'], ['Focal length', meta.focal_len ? `${Math.round(meta.focal_len)} mm` : '-'], ['Taken', meta.timestamp ? new Date(meta.timestamp).toLocaleString() : '-'], ['Preview', shown === thumb ? 'Embedded' : 'Developed']].map(([k, v]) => (
                <div key={k as string} className="rounded-xl border border-border bg-surface-2/50 px-3 py-2"><div className="text-muted">{k}</div><div className="truncate font-medium">{String(v)}</div></div>
              ))}
            </div>
          )}
        </>}
        side={<>
          <Slider label="Exposure" value={exposure} onChange={setExposure} min={-2} max={3} step={0.25} suffix=" EV" />
          <Slider label="Brightness" value={bright} onChange={setBright} min={0.25} max={3} step={0.05} suffix="×" />
          <Field label="White balance"><Segmented value={wb} onChange={setWb} options={[{ value: 'camera', label: 'As shot' }, { value: 'auto', label: 'Auto' }, { value: 'daylight', label: 'Daylight' }, { value: 'custom', label: 'Custom' }]} /></Field>
          {wb === 'custom' && <><Slider label="Temperature" value={temp} onChange={setTemp} min={-60} max={60} /><Slider label="Tint" value={tint} onChange={setTint} min={-60} max={60} /></>}
          <Field label="Highlights"><Segmented value={highlight} onChange={setHighlight} options={[{ value: '0', label: 'Clip' }, { value: '1', label: 'Unclip' }, { value: '2', label: 'Blend' }, { value: '5', label: 'Rebuild' }]} /></Field>
          <Switch checked={half} onChange={setHalf} label="Half size (much faster)" />
          <div>
            <Label>Save as</Label>
            <Segmented value={fmt} onChange={setFmt} options={[{ value: 'jpg', label: 'JPG' }, { value: 'png', label: 'PNG' }, { value: 'tiff', label: 'TIFF' }, { value: 'webp', label: 'WEBP' }]} />
          </div>
          {(fmt === 'jpg' || fmt === 'webp') && <Slider label="Quality" value={quality} onChange={setQuality} min={40} max={100} suffix="%" />}
          {busy && <Progress value={progress} label="Developing" />}
          <ErrorNote error={error} />
          <Button variant="outline" className="w-full" disabled={busy || loading} icon={<Camera className="size-4" />} onClick={() => develop(false)}>Update preview</Button>
          <Button size="lg" className="w-full" loading={busy} disabled={loading} icon={<Aperture className="size-4" />} onClick={() => develop(true)}>Convert to {fmt.toUpperCase()}</Button>
          <Button variant="ghost" className="w-full" icon={<RefreshCw className="size-4" />} onClick={() => setFile(null)}>Start over</Button>
        </>}
      />
      {result && <ResultCard blob={result} filename={`${baseName(file.name)}.${fmt === 'tiff' ? 'tif' : fmt}`} originalSize={file.size} onReset={() => setFile(null)} />}
    </div>
  )
}
