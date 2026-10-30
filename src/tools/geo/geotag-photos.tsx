import { useMemo, useState } from 'react'
import { MapPinned } from 'lucide-react'
import { Button, Card, Dropzone, Label, Select, Slider, Switch, ResultCard, Progress, ErrorNote, useJob } from '@/components/ui'
import { zipFiles } from '@/lib/files'
import { TrackMap, TRACK_ACCEPT, loadTracks } from '@/lib/bcat/geoui'
import type { Pt } from '@/lib/bcat/geo2'
import { exifToUtc, positionAt } from '@/lib/cf/geo'
import { toBin, fromBin, piexif } from '@/lib/b2/exif'

interface Photo { file: File; taken?: string; had?: boolean; pos?: { lat: number; lon: number; ele?: number; gap: number } | null }
const OFFSETS = Array.from({ length: 57 }, (_, i) => -720 + i * 30 - (i > 50 ? 0 : 0)).filter((m) => m <= 840)
const fmtOff = (m: number) => `UTC${m >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(m) / 60)).padStart(2, '0')}:${String(Math.abs(m) % 60).padStart(2, '0')}`
const rat = (x: number): [number, number] => [Math.round(x * 1000), 1000]
const dms = (v: number) => { const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = (a - d - m / 60) * 3600; return [[d, 1], [m, 1], [Math.round(s * 1000), 1000]] }

export default function GeotagPhotos() {
  const [pts, setPts] = useState<Pt[]>([]), [trackName, setTrackName] = useState('')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [offset, setOffset] = useState(-new Date().getTimezoneOffset()), [camShift, setCamShift] = useState(0), [maxGap, setMaxGap] = useState(300), [overwrite, setOverwrite] = useState(false)
  const [out, setOut] = useState<Blob | null>(null), [terr, setTerr] = useState<string | null>(null)
  const job = useJob()
  const loadTrack = async (f: File) => { setTerr(null); try { const r = await loadTracks(f); const p = r.tracks.flatMap((t) => t.points).filter((x) => x.time != null).sort((a, b) => a.time! - b.time!); if (!p.length) throw new Error('This track has no timestamps, so photos cannot be matched by time.'); setPts(p); setTrackName(f.name) } catch (e: any) { setTerr(e.message) } }
  const addPhotos = async (fs: File[]) => {
    const exifr: any = (await import('exifr')).default
    const list: Photo[] = []
    for (const f of fs) { const t = await exifr.parse(f, { pick: ['DateTimeOriginal', 'CreateDate', 'GPSLatitude'], reviveValues: false }).catch(() => null); list.push({ file: f, taken: t?.DateTimeOriginal ?? t?.CreateDate, had: t?.GPSLatitude != null }) }
    setPhotos((o) => [...o, ...list]); setOut(null)
  }
  const matched = useMemo(() => photos.map((p) => ({ ...p, pos: p.taken ? positionAt(pts, exifToUtc(String(p.taken), offset) + camShift * 1000, maxGap) : null })), [photos, pts, offset, camShift, maxGap])
  const ok = matched.filter((p) => p.pos && (overwrite || !p.had))
  const write = () => job.run(async (setP) => {
    const P = await piexif(), files: { name: string; data: Blob }[] = []
    for (let i = 0; i < ok.length; i++) {
      const p = ok[i], bin = toBin(new Uint8Array(await p.file.arrayBuffer()))
      let ex: any; try { ex = P.load(bin) } catch { ex = { '0th': {}, Exif: {}, GPS: {}, '1st': {} } }
      const G = P.GPSIFD
      ex.GPS = { [G.GPSVersionID]: [2, 3, 0, 0], [G.GPSLatitudeRef]: p.pos!.lat >= 0 ? 'N' : 'S', [G.GPSLatitude]: dms(p.pos!.lat), [G.GPSLongitudeRef]: p.pos!.lon >= 0 ? 'E' : 'W', [G.GPSLongitude]: dms(p.pos!.lon), ...(p.pos!.ele != null ? { [G.GPSAltitudeRef]: p.pos!.ele < 0 ? 1 : 0, [G.GPSAltitude]: rat(Math.abs(p.pos!.ele)) } : {}) }
      files.push({ name: p.file.name, data: new Blob([fromBin(P.insert(P.dump(ex), bin)) as BlobPart], { type: 'image/jpeg' }) })
      setP((i + 1) / ok.length)
    }
    setOut(await zipFiles(files))
  })
  const jpegOnly = photos.some((p) => !/\.jpe?g$/i.test(p.file.name))
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <Dropzone compact accept={TRACK_ACCEPT} onFiles={(f) => loadTrack(f[0])} label={trackName ? `Track: ${trackName}` : '1. Drop the GPX track you recorded'} sub={pts.length ? `${pts.length} timed points` : 'From a watch, phone or GPS app'} />
          <Dropzone compact multiple accept=".jpg,.jpeg" onFiles={addPhotos} label={photos.length ? `${photos.length} photos added` : '2. Drop JPG photos from the same day'} sub="The time each photo was taken is matched to the track" />
        </div>
        <ErrorNote error={terr} />
        {pts.length > 0 && <TrackMap layers={[{ points: pts, color: '#F5A524', width: 3 }, { points: matched.filter((p) => p.pos).map((p) => p.pos!), color: '#22D3EE', width: 0, dots: true }]} height={340} />}
        {photos.length > 0 && <Card className="max-h-80 divide-y divide-border overflow-auto p-0">{matched.map((p, i) => <div key={i} className="grid grid-cols-[1fr_auto] gap-2 px-3 py-1.5 text-xs"><span className="truncate">{p.file.name}<span className="ml-2 text-muted">{p.taken ? String(p.taken) : 'no capture time'}</span></span><span className={p.pos ? 'text-success' : 'text-warn'}>{p.pos ? `${p.pos.lat.toFixed(5)}, ${p.pos.lon.toFixed(5)}${p.had ? (overwrite ? ' (replaces GPS)' : ' (has GPS, kept)') : ''}` : p.taken ? 'outside the track time' : 'skipped'}</span></div>)}</Card>}
        {job.busy && <Progress value={job.progress} label="Writing GPS into photos" />}
        <ErrorNote error={job.error} />
        {out && <ResultCard blob={out} filename="geotagged-photos.zip" title={`${ok.length} photos geotagged`} />}
      </div>
      <Card className="space-y-4 self-start">
        <div><Label>Camera clock time zone</Label><Select value={String(offset)} onChange={(v) => setOffset(+v)} options={OFFSETS.map((m) => ({ value: String(m), label: fmtOff(m) }))} /><p className="mt-1 text-xs text-muted">Photos store local time without a zone. Pick the zone the camera clock was set to.</p></div>
        <Slider label="Camera clock was off by" value={camShift} onChange={setCamShift} min={-3600} max={3600} step={5} suffix=" s" />
        <Slider label="Max distance in time from the track" value={maxGap} onChange={setMaxGap} min={30} max={3600} step={30} suffix=" s" />
        <Switch checked={overwrite} onChange={setOverwrite} label="Replace GPS that photos already have" />
        {jpegOnly && <p className="text-xs text-warn">Only JPG photos can be written. Others are skipped.</p>}
        <Button className="w-full" icon={<MapPinned className="size-4" />} disabled={!ok.length} loading={job.busy} onClick={write}>Geotag {ok.length} photo{ok.length === 1 ? '' : 's'}</Button>
        <p className="text-xs text-muted">Image data is not re-encoded, only the GPS tags are added, so quality is untouched.</p>
      </Card>
    </div>
  )
}
