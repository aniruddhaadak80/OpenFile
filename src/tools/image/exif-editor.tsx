import { useState } from 'react'
import { Save, MapPin, Trash2, LocateFixed } from 'lucide-react'
import { Button, Field, FileChip, Input, Label, Select, Switch, Textarea, ToolGrid, ErrorNote, ResultCard, useJob } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { ImageDrop } from './_img/kit'
import { sniff } from '@/lib/b2/codecs'
import type { ExifFields } from '@/lib/b2/exif'

const ORIENT = [{ value: '0', label: 'Leave unchanged' }, { value: '1', label: 'Normal' }, { value: '3', label: 'Rotate 180°' }, { value: '6', label: 'Rotate 90° clockwise' }, { value: '8', label: 'Rotate 90° counter-clockwise' }, { value: '2', label: 'Mirror horizontal' }, { value: '4', label: 'Mirror vertical' }]
const EMPTY: ExifFields = { artist: '', copyright: '', description: '', make: '', model: '', software: '', dateTaken: '', orientation: 0, gps: null, keepOther: true }

export default function ExifEditor() {
  const [file, setFile] = useState<File | null>(null)
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [kind, setKind] = useState('')
  const [url, setUrl] = useState('')
  const [all, setAll] = useState<[string, string][]>([])
  const [f, setF] = useState<ExifFields>(EMPTY)
  const [lat, setLat] = useState(''); const [lng, setLng] = useState(''); const [alt, setAlt] = useState('')
  const [existing, setExisting] = useState<any>(null)
  const [result, setResult] = useState<Blob | null>(null)
  const { busy, error, run } = useJob()
  const set = (p: Partial<ExifFields>) => { setF((o) => ({ ...o, ...p })); setResult(null) }

  const open = (fs: File[]) => run(async () => {
    const file = fs[0]
    const u8 = new Uint8Array(await file.arrayBuffer())
    const k = sniff(u8, file.name)
    const exifr: any = (await import('exifr')).default
    const meta = await exifr.parse(u8, { tiff: true, exif: true, gps: true, xmp: true, iptc: true, icc: false, translateValues: true, reviveValues: true }).catch(() => null) ?? {}
    const { readExifObject, fromExifDate } = await import('@/lib/b2/exif')
    const obj = await readExifObject(u8, k)
    setExisting(obj)
    const dt = meta.DateTimeOriginal instanceof Date ? new Date(meta.DateTimeOriginal.getTime() - meta.DateTimeOriginal.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : fromExifDate(obj?.Exif?.[36867])
    setF({ ...EMPTY, artist: meta.Artist ?? '', copyright: meta.Copyright ?? '', description: meta.ImageDescription ?? '', make: meta.Make ?? '', model: meta.Model ?? '', software: meta.Software ?? '', dateTaken: dt ?? '', orientation: 0, gps: null })
    setLat(meta.latitude != null ? String(+meta.latitude.toFixed(6)) : ''); setLng(meta.longitude != null ? String(+meta.longitude.toFixed(6)) : ''); setAlt(meta.GPSAltitude != null ? String(meta.GPSAltitude) : '')
    setAll(Object.entries(meta).filter(([, v]) => v !== undefined && typeof v !== 'object' || v instanceof Date).map(([k2, v]) => [k2, v instanceof Date ? v.toLocaleString() : String(v)] as [string, string]).slice(0, 200))
    setFile(file); setBytes(u8); setKind(k); setUrl(URL.createObjectURL(file)); setResult(null)
  })

  const gpsVal = () => {
    if (!lat.trim() && !lng.trim()) return null
    const la = Number(lat), lo = Number(lng)
    if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) throw new Error('GPS needs a latitude between -90 and 90 and a longitude between -180 and 180.')
    return { lat: la, lng: lo, alt: alt.trim() ? Number(alt) : undefined }
  }
  const save = (strip = false) => run(async () => {
    if (!bytes || !file) return
    const { buildExif, writeExif } = await import('@/lib/b2/exif')
    let target = bytes, k = kind
    if (!['jpg', 'png', 'webp'].includes(k)) {
      // other formats: re-encode to JPEG first
      const { decodeAny, encodeCanvas } = await import('@/lib/b2/codecs')
      const { canvas } = await decodeAny(file)
      target = new Uint8Array(await (await encodeCanvas(canvas, 'jpg', { quality: 95 })).arrayBuffer()); k = 'jpg'
    }
    const ex = strip ? null : await buildExif({ ...f, gps: gpsVal() }, existing)
    const out = await writeExif(target, k, ex)
    setResult(new Blob([out as BlobPart], { type: k === 'jpg' ? 'image/jpeg' : `image/${k}` }))
    if (k !== kind) setKind(k)
  })
  const here = () => navigator.geolocation?.getCurrentPosition((p) => { setLat(p.coords.latitude.toFixed(6)); setLng(p.coords.longitude.toFixed(6)); if (p.coords.altitude != null) setAlt(p.coords.altitude.toFixed(1)) }, () => {})

  if (!file || !bytes) return <div className="space-y-3"><ImageDrop multiple={false} onFiles={open} label="Drop a photo to edit its metadata" sub="JPEG, PNG and WebP are edited in place. HEIC, TIFF and others are saved as JPEG." accept="image/*,.heic,.tif,.tiff" /><ErrorNote error={error} /></div>
  const ext = kind === 'jpg' ? 'jpg' : kind
  const mapHref = lat && lng ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}` : ''
  return (
    <div className="space-y-6">
      <ToolGrid
        main={<div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[200px_1fr]">
            <div className="checker grid aspect-square place-items-center overflow-hidden rounded-xl border border-border"><img src={url} alt="" className="max-h-full max-w-full object-contain" /></div>
            <div className="grid content-start gap-3 sm:grid-cols-2">
              <Field label="Date taken"><Input type="datetime-local" value={f.dateTaken} onChange={(e) => set({ dateTaken: e.target.value })} /></Field>
              <Field label="Author / artist"><Input value={f.artist} onChange={(e) => set({ artist: e.target.value })} /></Field>
              <Field label="Copyright"><Input value={f.copyright} onChange={(e) => set({ copyright: e.target.value })} placeholder="© 2026 Your Name" /></Field>
              <Field label="Orientation"><Select value={String(f.orientation)} onChange={(v) => set({ orientation: Number(v) })} options={ORIENT} /></Field>
              <Field label="Camera make"><Input value={f.make} onChange={(e) => set({ make: e.target.value })} /></Field>
              <Field label="Camera model"><Input value={f.model} onChange={(e) => set({ model: e.target.value })} /></Field>
              <Field label="Software"><Input value={f.software} onChange={(e) => set({ software: e.target.value })} /></Field>
              <Field label="Description" className="sm:col-span-2"><Textarea value={f.description} onChange={(e) => set({ description: e.target.value })} className="min-h-16 font-sans" /></Field>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3">
            <Label hint={<span className="flex gap-3">{mapHref && <a href={mapHref} target="_blank" rel="noreferrer" className="underline">View on map</a>}<button className="flex items-center gap-1 underline cursor-pointer" onClick={here}><LocateFixed className="size-3" />Use my location</button><button className="underline cursor-pointer" onClick={() => { setLat(''); setLng(''); setAlt('') }}>Clear</button></span>}><span className="flex items-center gap-1"><MapPin className="size-3.5" />GPS location</span></Label>
            <div className="grid grid-cols-3 gap-2"><Input placeholder="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} aria-label="Latitude" /><Input placeholder="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} aria-label="Longitude" /><Input placeholder="Altitude (m)" value={alt} onChange={(e) => setAlt(e.target.value)} aria-label="Altitude" /></div>
            <p className="mt-1.5 text-[11px] text-muted">Leave empty to remove the location. Decimal degrees, for example 22.4241 and 87.3197.</p>
          </div>
          {all.length > 0 && <details className="rounded-xl border border-border bg-surface p-3 text-xs"><summary className="cursor-pointer font-medium">All metadata found ({all.length} fields)</summary><div className="mt-2 grid max-h-72 gap-x-4 overflow-auto sm:grid-cols-2 scrollbar-thin">{all.map(([k, v]) => <div key={k} className="flex gap-2 border-b border-border/50 py-1"><span className="w-40 shrink-0 text-muted">{k}</span><span className="break-all">{v}</span></div>)}</div></details>}
        </div>}
        side={<>
          <FileChip file={file} extra={<span className="text-xs uppercase text-muted">{kind}</span>} onRemove={() => { setFile(null); setBytes(null) }} />
          <Switch checked={f.keepOther} onChange={(v) => set({ keepOther: v })} label="Keep other existing tags" />
          {!['jpg', 'png', 'webp'].includes(kind) && <p className="text-xs text-warn">This format is saved as a high-quality JPEG with the new metadata.</p>}
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" loading={busy} icon={<Save className="size-4" />} onClick={() => save(false)}>Save metadata</Button>
          <Button variant="outline" className="w-full" icon={<Trash2 className="size-4" />} onClick={() => save(true)}>Remove all EXIF</Button>
          <p className="text-[11px] text-muted">Pixels are not re-encoded for JPEG, PNG and WebP, so there is no quality loss. Original size {formatBytes(file.size)}.</p>
        </>}
      />
      {result && <ResultCard blob={result} filename={file.name.replace(/\.[^.]+$/, '') + '-edited.' + ext} originalSize={file.size} onReset={() => { setFile(null); setBytes(null); setResult(null) }} />}
    </div>
  )
}
