import { useMemo, useState } from 'react'
import { Dropzone, Label, ToolGrid, Empty, Progress, Switch } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { writeGpx } from '@/lib/bcat/geo2'
import { TrackMap } from '@/lib/bcat/geoui'
import { DlButton, toCsv, useObjectUrl } from '@/lib/bcat/kit'
import { Stat } from '@/tools/dev/_b5/shell'

interface Photo { file: File; lat?: number; lon?: number; ele?: number; time?: number; camera?: string }
function Thumb({ file }: { file: File }) { const u = useObjectUrl(file); return u ? <img src={u} alt="" className="size-12 shrink-0 rounded-lg object-cover" /> : <div className="size-12 rounded-lg skeleton" /> }

export default function PhotoLocationMap() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [prog, setProg] = useState<number | null>(null)
  const [pick, setPick] = useState<number | null>(null)
  const [path, setPath] = useState(true)

  const add = async (fs: File[]) => {
    const exifr = (await import('exifr')).default
    const out: Photo[] = []
    for (let i = 0; i < fs.length; i++) {
      setProg(i / fs.length)
      const f = fs[i]
      try {
        const m: any = await exifr.parse(f, { gps: true, pick: ['GPSLatitude', 'GPSLatitudeRef', 'GPSLongitude', 'GPSLongitudeRef', 'GPSAltitude', 'GPSAltitudeRef', 'DateTimeOriginal', 'CreateDate', 'Make', 'Model'] })
        out.push({ file: f, lat: m?.latitude, lon: m?.longitude, ele: typeof m?.GPSAltitude === 'number' ? ((m?.GPSAltitudeRef === 1 || m?.GPSAltitudeRef?.[0] === 1) ? -m.GPSAltitude : m.GPSAltitude) : undefined, time: (m?.DateTimeOriginal ?? m?.CreateDate)?.getTime?.(), camera: [m?.Make, m?.Model].filter(Boolean).join(' ') || undefined })
      } catch { out.push({ file: f }) }
    }
    setPhotos((p) => [...p, ...out].sort((a, b) => (a.time ?? 0) - (b.time ?? 0))); setProg(null)
  }
  const geo = useMemo(() => photos.filter((p) => p.lat != null && p.lon != null && isFinite(p.lat) && isFinite(p.lon)), [photos])
  const none = photos.length - geo.length
  const fc = () => ({ type: 'FeatureCollection', features: geo.map((p) => ({ type: 'Feature', properties: { name: p.file.name, time: p.time ? new Date(p.time).toISOString() : null, camera: p.camera ?? null }, geometry: { type: 'Point', coordinates: p.ele != null ? [p.lon, p.lat, p.ele] : [p.lon, p.lat] } })) })
  const kml = () => `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Photo locations</name>\n${geo.map((p) => `<Placemark><name>${p.file.name.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</name>${p.time ? `<TimeStamp><when>${new Date(p.time).toISOString()}</when></TimeStamp>` : ''}<Point><coordinates>${p.lon},${p.lat}${p.ele != null ? ',' + p.ele : ''}</coordinates></Point></Placemark>`).join('\n')}\n</Document></kml>`

  if (!photos.length) return <><Dropzone multiple accept="image/jpeg,image/heic,image/heif,image/png,image/webp,image/tiff,.heic,.heif,.dng" onFiles={add} label="Drop photos to see where they were taken" sub="Reads the GPS position saved by phones and cameras. Nothing is uploaded." />{prog != null && <Progress value={prog} label="Reading photos" />}</>
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2"><Stat label="Photos" value={photos.length} /><Stat label="With location" value={geo.length} /><Stat label="No location" value={none} /></div>
          {prog != null && <Progress value={prog} label="Reading photos" />}
          {geo.length ? <TrackMap layers={[...(path && geo.length > 1 ? [{ points: geo.map((p) => ({ lat: p.lat!, lon: p.lon! })), color: '#14B8A6', width: 2, dash: [6, 6] }] : []), { points: geo.map((p) => ({ lat: p.lat!, lon: p.lon! })), color: '#F5A524', dots: true, width: 0 }]} marker={pick != null && photos[pick]?.lat != null ? { lat: photos[pick].lat!, lon: photos[pick].lon! } : null} height={420} /> : <Empty>None of these photos has a GPS position. Location is often removed by chat apps and social sites.</Empty>}
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {photos.map((p, i) => (
              <button key={i} type="button" onClick={() => setPick(i)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2/50 cursor-pointer">
                <Thumb file={p.file} />
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{p.file.name}</span><span className="block text-xs text-muted">{p.time ? new Date(p.time).toLocaleString() : 'No date'}{p.camera ? ` · ${p.camera}` : ''} · {formatBytes(p.file.size)}</span></span>
                <span className="shrink-0 font-mono text-xs text-muted">{p.lat != null ? `${p.lat.toFixed(5)}, ${p.lon!.toFixed(5)}` : 'no GPS'}</span>
              </button>
            ))}
          </div>
          <Dropzone compact multiple accept="image/*,.heic,.heif,.dng" onFiles={add} label="Add more photos" />
        </div>
      }
      side={
        <>
          <Switch checked={path} onChange={setPath} label="Connect photos in time order" />
          {geo.length > 0 && (
            <div className="space-y-2"><Label>Export locations</Label>
              <div className="flex flex-wrap gap-2">
                <DlButton variant="primary" name="photo-locations.geojson" mime="application/geo+json" data={() => JSON.stringify(fc(), null, 2)}>GeoJSON</DlButton>
                <DlButton name="photo-locations.kml" mime="application/vnd.google-earth.kml+xml" data={kml}>KML</DlButton>
                <DlButton name="photo-locations.gpx" mime="application/gpx+xml" data={() => writeGpx(geo.length > 1 ? [{ name: 'Photo trail', points: geo.map((p) => ({ lat: p.lat!, lon: p.lon!, ele: p.ele, time: p.time })) }] : [], geo.map((p) => ({ lat: p.lat!, lon: p.lon!, ele: p.ele, name: p.file.name })))}>GPX</DlButton>
                <DlButton name="photo-locations.csv" mime="text/csv" data={() => toCsv([['file', 'latitude', 'longitude', 'altitude_m', 'taken', 'camera'], ...photos.map((p) => [p.file.name, p.lat ?? '', p.lon ?? '', p.ele ?? '', p.time ? new Date(p.time).toISOString() : '', p.camera ?? ''])])}>CSV</DlButton>
              </div>
            </div>
          )}
          <p className="text-xs text-muted">Want to share photos without location? Use the metadata scrubber to remove GPS before sending.</p>
        </>
      }
    />
  )
}
