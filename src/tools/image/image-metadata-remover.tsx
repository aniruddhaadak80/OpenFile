import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ShieldCheck, MapPin, Camera, Calendar, AlertTriangle, ChevronDown, ExternalLink, Eraser } from 'lucide-react'
import { Button, ErrorNote, Label, Progress, Segmented, Slider, ToolGrid, Badge, Spinner, cn, useJob } from '@/components/ui'
import { BatchResults, ImageDrop, ThumbGrid, StatusPill, decode, exportCanvas, fmtFromMime, outName, toCanvas, useImageList, type Fmt, type Item, type Result } from './_img/kit'
import { jpegOrientation, pngText, sniff, stripJpeg, stripPng, stripWebp, webpExif } from './_img/strip'

type Meta = { groups: Record<string, Record<string, unknown>>; gps: { latitude: number; longitude: number } | null; count: number; error?: string }
const GROUP_NAMES: Record<string, string> = { ifd0: 'Camera & image (IFD0)', ifd1: 'Thumbnail (IFD1)', exif: 'Exposure & capture (EXIF)', gps: 'GPS location', interop: 'Interoperability', iptc: 'IPTC (captions, credits)', xmp: 'XMP (editing software, rights)', icc: 'Color profile (ICC)', jfif: 'JFIF', ihdr: 'PNG header', png: 'PNG text chunks', makerNote: 'Maker notes' }

async function readMeta(file: File): Promise<Meta> {
  const exifr: any = (await import('exifr')).default
  const bytes = new Uint8Array(await file.arrayBuffer())
  const groups: Record<string, Record<string, unknown>> = {}
  let gps: Meta['gps'] = null
  try {
    const src = sniff(bytes) === 'webp' ? webpExif(bytes) : bytes
    if (src) {
      const r = await exifr.parse(src, { tiff: true, exif: true, gps: true, interop: true, ifd1: true, iptc: true, xmp: true, icc: true, jfif: true, ihdr: true, mergeOutput: false, translateValues: true, reviveValues: true, sanitize: true })
      if (r) for (const [k, v] of Object.entries(r)) if (v && typeof v === 'object' && !(v instanceof Uint8Array) && Object.keys(v as object).length) groups[k] = v as Record<string, unknown>
      if (groups.gps && typeof (groups.gps as any).latitude === 'number') gps = { latitude: (groups.gps as any).latitude, longitude: (groups.gps as any).longitude }
    }
  } catch (e: any) { if (!/unknown file format/i.test(e?.message || '')) console.warn(e) }
  const t = pngText(bytes)
  if (Object.keys(t).length) groups.png = t
  const count = Object.entries(groups).filter(([k]) => k !== 'ihdr' && k !== 'jfif' && k !== 'icc').reduce((a, [, g]) => a + Object.keys(g).length, 0)
  return { groups, gps, count }
}

function fmtVal(v: unknown): string {
  if (v instanceof Date) return isNaN(+v) ? String(v) : v.toLocaleString()
  if (v instanceof Uint8Array || v instanceof ArrayBuffer) return `‹${(v as any).byteLength} bytes›`
  if (Array.isArray(v)) return v.length > 12 ? `[${v.slice(0, 12).map(fmtVal).join(', ')}, …]` : v.map(fmtVal).join(', ')
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(+v.toFixed(6))
  if (v && typeof v === 'object') { try { return JSON.stringify(v).slice(0, 200) } catch { return '[object]' } }
  return String(v)
}

async function strip(it: Item, mode: 'lossless' | 'reencode', quality: number): Promise<{ blob: Blob; name: string; note: string }> {
  const bytes = new Uint8Array(await it.file.arrayBuffer())
  const kind = sniff(bytes)
  if (mode === 'lossless' && kind) {
    if (kind === 'jpg' && jpegOrientation(bytes) !== 1) { /* rotation lives in EXIF, re-encode so the photo stays upright */ }
    else {
      const out = kind === 'jpg' ? stripJpeg(bytes) : kind === 'png' ? stripPng(bytes) : stripWebp(bytes)
      return { blob: new Blob([out as BlobPart], { type: it.file.type || `image/${kind}` }), name: outName(it.file.name, kind, '-clean'), note: 'lossless' }
    }
  }
  let f: Fmt = fmtFromMime(it.file.type, it.file.name)
  if (!['png', 'jpg', 'webp'].includes(f)) f = 'png'
  const c = toCanvas(await decode(it.file))
  return { blob: await exportCanvas(c, f, quality / 100), name: outName(it.file.name, f, '-clean'), note: kind === 'jpg' && mode === 'lossless' ? 're-encoded to keep rotation' : 're-encoded' }
}

export default function ImageMetadataRemover() {
  const { items, add, remove, clear } = useImageList()
  const [sel, setSel] = useState<string | null>(null)
  const [meta, setMeta] = useState<Record<string, Meta | 'loading'>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({ gps: true, ifd0: true, exif: true })
  const [mode, setMode] = useState<'lossless' | 'reencode'>('lossless')
  const [quality, setQuality] = useState(92)
  const [status, setStatus] = useState<Record<string, 'run' | 'done' | 'err'>>({})
  const [results, setResults] = useState<Result[] | null>(null)
  const [verify, setVerify] = useState<number | null>(null)
  const [showMap, setShowMap] = useState(false)
  const { busy, progress, error, run } = useJob()

  const onFiles = useCallback(async (f: File[]) => { const a = await add(f); setResults(null); if (a[0]) setSel((s) => s ?? a[0].id) }, [add])
  useEffect(() => {
    for (const it of items) if (!meta[it.id]) {
      setMeta((m) => ({ ...m, [it.id]: 'loading' }))
      readMeta(it.file).then((r) => setMeta((m) => ({ ...m, [it.id]: r }))).catch((e) => setMeta((m) => ({ ...m, [it.id]: { groups: {}, gps: null, count: 0, error: e?.message } })))
    }
  }, [items])
  const reset = () => { clear(); setMeta({}); setResults(null); setStatus({}); setSel(null); setVerify(null) }
  const cur = items.find((i) => i.id === sel) ?? items[0]
  const m = cur ? meta[cur.id] : undefined

  const go = () => run(async (setP) => {
    const out: Result[] = []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      setStatus((s) => ({ ...s, [it.id]: 'run' }))
      try { const r = await strip(it, mode, quality); out.push({ id: it.id, name: r.name, blob: r.blob, originalSize: it.file.size, url: URL.createObjectURL(r.blob), note: r.note }); setStatus((s) => ({ ...s, [it.id]: 'done' })) }
      catch (e) { setStatus((s) => ({ ...s, [it.id]: 'err' })); if (items.length === 1) throw e }
      setP((i + 1) / items.length)
    }
    // verify: re-read metadata from the cleaned files
    let remaining = 0
    for (const r of out) remaining += (await readMeta(new File([r.blob], r.name, { type: r.blob.type }))).count
    setVerify(remaining)
    setResults(out)
  })

  if (!items.length) return <ImageDrop onFiles={onFiles} label="Drop photos to inspect & remove metadata" sub="See hidden camera, date and GPS data, then strip it. Nothing is uploaded." />
  const totalWithGps = items.filter((i) => { const x = meta[i.id]; return x && x !== 'loading' && x.gps }).length
  const g = m && m !== 'loading' ? m.groups : {}
  const ifd0 = (g.ifd0 ?? {}) as any, exif = (g.exif ?? {}) as any

  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          {cur && (
            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start gap-4">
                <img src={cur.url} alt="" className="checker size-24 rounded-xl object-cover ring-1 ring-border" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{cur.file.name}</div>
                  <div className="text-xs text-muted">{cur.w}×{cur.h} · {cur.file.type || 'unknown type'}</div>
                  {m === 'loading' || !m ? <div className="mt-2"><Spinner label="Reading metadata…" /></div> : (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge color={m.count ? '#f59e0b' : '#22c55e'}>{m.count ? `${m.count} TAGS FOUND` : 'NO METADATA'}</Badge>
                      {m.gps && <Badge color="#ef4444">GPS LOCATION</Badge>}
                      {(ifd0.Make || ifd0.Model) && <span className="flex items-center gap-1 text-xs text-muted"><Camera className="size-3.5" />{[ifd0.Make, ifd0.Model].filter(Boolean).join(' ')}</span>}
                      {(exif.DateTimeOriginal || ifd0.ModifyDate) && <span className="flex items-center gap-1 text-xs text-muted"><Calendar className="size-3.5" />{fmtVal(exif.DateTimeOriginal ?? ifd0.ModifyDate)}</span>}
                    </div>
                  )}
                </div>
              </div>
              {m && m !== 'loading' && m.gps && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 overflow-hidden rounded-xl border border-danger/30 bg-danger/5">
                  <div className="flex flex-wrap items-center gap-3 p-3">
                    <MapPin className="size-5 text-danger" />
                    <div className="min-w-0 flex-1"><div className="text-sm font-semibold">This photo reveals where it was taken</div><div className="font-mono text-xs text-muted">{m.gps.latitude.toFixed(6)}, {m.gps.longitude.toFixed(6)}</div></div>
                    <a href={`https://www.openstreetmap.org/?mlat=${m.gps.latitude}&mlon=${m.gps.longitude}#map=15/${m.gps.latitude}/${m.gps.longitude}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-accent hover:underline">OpenStreetMap <ExternalLink className="size-3" /></a>
                    <a href={`https://www.google.com/maps?q=${m.gps.latitude},${m.gps.longitude}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-accent hover:underline">Google Maps <ExternalLink className="size-3" /></a>
                  </div>
                  {!showMap ? <button onClick={() => setShowMap(true)} className="w-full border-t border-danger/20 py-2 text-xs text-muted hover:text-fg cursor-pointer">Show map preview (loads tiles from OpenStreetMap)</button> : <iframe title="Photo location" loading="lazy" className="h-48 w-full border-t border-danger/20" src={`https://www.openstreetmap.org/export/embed.html?bbox=${m.gps.longitude - 0.01},${m.gps.latitude - 0.006},${m.gps.longitude + 0.01},${m.gps.latitude + 0.006}&layer=mapnik&marker=${m.gps.latitude},${m.gps.longitude}`} />}
                </motion.div>
              )}
              {m && m !== 'loading' && (
                <div className="mt-4 space-y-2">
                  {!Object.keys(g).length && <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">No EXIF, GPS, IPTC or XMP metadata found in this image.</div>}
                  {Object.entries(g).map(([k, grp]) => (
                    <div key={k} className="overflow-hidden rounded-xl border border-border">
                      <button onClick={() => setOpen((o) => ({ ...o, [k]: !o[k] }))} className="flex w-full items-center justify-between bg-surface-2/50 px-3 py-2 text-left text-sm font-medium cursor-pointer">
                        <span>{GROUP_NAMES[k] ?? k} <span className="ml-1 text-xs text-muted">({Object.keys(grp).length})</span></span>
                        <ChevronDown className={cn('size-4 transition', open[k] && 'rotate-180')} />
                      </button>
                      {open[k] && (
                        <div className="max-h-72 overflow-auto scrollbar-thin">
                          <table className="w-full text-xs"><tbody>
                            {Object.entries(grp).map(([tk, tv]) => <tr key={tk} className="border-t border-border"><td className="w-2/5 px-3 py-1.5 font-medium text-muted">{tk}</td><td className="break-all px-3 py-1.5 font-mono">{fmtVal(tv)}</td></tr>)}
                          </tbody></table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {items.length > 1 ? <ThumbGrid items={items} selected={cur?.id} onSelect={setSel} onRemove={(id) => { remove(id); setResults(null) }} onAdd={onFiles}
            extra={(it) => { const x = meta[it.id]; return <div className="flex items-center justify-between text-[11px]">{x && x !== 'loading' ? <span className={x.count ? 'text-warn' : 'text-success'}>{x.count ? `${x.count} tags${x.gps ? ' · GPS' : ''}` : 'clean'}</span> : <span className="text-muted">…</span>}<StatusPill state={status[it.id]} /></div> }} /> : <ThumbGrid items={[]} onAdd={onFiles} />}
        </>}
        side={<>
          {totalWithGps > 0 && <div className="flex gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger"><AlertTriangle className="size-4 shrink-0" />{totalWithGps} image{totalWithGps > 1 ? 's contain' : ' contains'} GPS coordinates.</div>}
          <div>
            <Label>Method</Label>
            <Segmented value={mode} onChange={(v) => { setMode(v); setResults(null) }} options={[{ value: 'lossless', label: 'Lossless' }, { value: 'reencode', label: 'Re-encode' }]} />
            <p className="mt-1.5 text-[11px] text-muted">{mode === 'lossless' ? 'Removes metadata blocks from JPEG, PNG and WEBP without touching pixels. Other formats are re-encoded.' : 'Redraws every pixel to a fresh file, guaranteed to drop everything, including embedded thumbnails.'}</p>
          </div>
          {mode === 'reencode' && <Slider label="Quality" value={quality} onChange={setQuality} min={50} max={100} suffix="%" />}
          {busy && <Progress value={progress} label="Cleaning" />}
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" loading={busy} icon={<Eraser className="size-4" />} onClick={go}>Remove metadata{items.length > 1 ? ` from ${items.length}` : ''}</Button>
          <Button variant="ghost" className="w-full" onClick={reset}>Start over</Button>
        </>}
      />
      {results && (
        <BatchResults results={results} zipName="metadata-removed.zip" onReset={reset} title={results.length === 1 ? 'Metadata removed' : `${results.length} images cleaned`}>
          {verify !== null && <div className={cn('flex items-center gap-2 text-sm', verify === 0 ? 'text-success' : 'text-warn')}><ShieldCheck className="size-4" />{verify === 0 ? 'Verified: no EXIF, GPS, IPTC or XMP tags remain.' : `${verify} non-identifying tags remain (e.g. color profile).`}</div>}
        </BatchResults>
      )}
    </div>
  )
}
