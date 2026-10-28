import { useMemo, useState } from 'react'
import { LocateFixed, ExternalLink } from 'lucide-react'
import { Button, Input, Segmented, Label } from '@/components/ui'
import { toast } from '@/components/toast'
import { Bar, Status, KV, Chip } from '../dev/_b5/shell'
import { parseLatLon, toDMS, toDDM, toUTM, toMGRS, fromMGRS, fromUTM, haversine, bearing, midpoint, fmtDistance } from '@/lib/b5/geo'

function parseAny(s: string): { lat: number; lon: number; via: string } | null {
  const t = s.trim(); if (!t) return null
  const utm = t.match(/^(\d{1,2})\s*([C-HJ-NP-X])?\s+(\d+(?:\.\d+)?)\s*(?:m?E)?\s+(\d+(?:\.\d+)?)\s*(?:m?N)?$/i)
  if (utm) { const z = Number(utm[1]); const band = (utm[2] ?? 'N').toUpperCase(); const [lat, lon] = fromUTM(z, band >= 'N' ? 'N' : 'S', Number(utm[3]), Number(utm[4])); return { lat, lon, via: 'UTM' } }
  if (/^\d{1,2}[C-HJ-NP-X]\s*[A-HJ-NP-Z]{2}\s*\d*\s*\d*$/i.test(t)) { try { const [lat, lon] = fromMGRS(t); return { lat, lon, via: 'MGRS' } } catch { return null } }
  const p = parseLatLon(t); return p ? { lat: p[0], lon: p[1], via: /[°'′"″]|\d\s+\d/.test(t) ? 'Degrees, minutes, seconds' : 'Decimal degrees' } : null
}
const EXAMPLES = ['22.5726, 88.3639', `48°51'30"N 2°17'40"E`, '40° 26.767′ N 79° 58.933′ W', '33U UP 05465 91412', '31 U 448252 5411954', '-33.8568, 151.2153']

export default function CoordinateConverter() {
  const [mode, setMode] = useState<'convert' | 'distance'>('convert')
  const [a, setA] = useState('22.5726, 88.3639')
  const [b, setB] = useState('28.6139, 77.2090')
  const pa = useMemo(() => { try { return parseAny(a) } catch { return null } }, [a])
  const pb = useMemo(() => { try { return parseAny(b) } catch { return null } }, [b])
  const locate = () => navigator.geolocation?.getCurrentPosition((p) => setA(`${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`), () => toast('Location permission was denied or unavailable', 'error'), { enableHighAccuracy: true })
  const utm = pa && Math.abs(pa.lat) <= 84 && pa.lat >= -80 ? toUTM(pa.lat, pa.lon) : null
  return (
    <div className="space-y-4">
      <Bar><Segmented value={mode} onChange={setMode} options={[{ value: 'convert', label: 'Convert formats' }, { value: 'distance', label: 'Distance between two points' }]} /><Button size="sm" variant="ghost" className="ml-auto" icon={<LocateFixed className="size-4" />} onClick={locate}>Use my location</Button></Bar>
      <div className="space-y-2">
        <Label>{mode === 'distance' ? 'Point A' : 'Coordinates in any format'}</Label>
        <Input value={a} onChange={(e) => setA(e.target.value)} className="h-12 font-mono text-lg" placeholder="lat, lon or DMS or UTM or MGRS" aria-label="Point A" spellCheck={false} />
        {mode === 'convert' && <div className="flex flex-wrap gap-1.5">{EXAMPLES.map((x) => <Chip key={x} active={a === x} onClick={() => setA(x)}>{x}</Chip>)}</div>}
      </div>
      {mode === 'distance' && <div className="space-y-2"><Label>Point B</Label><Input value={b} onChange={(e) => setB(e.target.value)} className="h-12 font-mono text-lg" aria-label="Point B" spellCheck={false} /></div>}
      {!pa && a.trim() && <Status kind="err">Could not read point A. Try 22.5726, 88.3639 or 48°51′30″N 2°17′40″E or 33U UP 05465 91412.</Status>}
      {mode === 'distance' && !pb && b.trim() && <Status kind="err">Could not read point B.</Status>}
      {pa && mode === 'convert' && <>
        <Status kind="ok">Read as {pa.via}.</Status>
        <div className="grid gap-2 sm:grid-cols-2">
          <KV label="Decimal degrees (lat, lon)" value={`${pa.lat.toFixed(6)}, ${pa.lon.toFixed(6)}`} />
          <KV label="Degrees, minutes, seconds" value={`${toDMS(pa.lat, true)} ${toDMS(pa.lon, false)}`} />
          <KV label="Degrees and decimal minutes" value={`${toDDM(pa.lat, true)} ${toDDM(pa.lon, false)}`} />
          <KV label="UTM (WGS84)" value={utm ? `${utm.zone}${utm.band} ${utm.easting.toFixed(0)}mE ${utm.northing.toFixed(0)}mN` : 'Outside UTM range'} />
          <KV label="MGRS / USNG" value={utm ? toMGRS(pa.lat, pa.lon) : 'Outside MGRS range'} />
          <KV label="GeoJSON point" value={JSON.stringify({ type: 'Point', coordinates: [+pa.lon.toFixed(6), +pa.lat.toFixed(6)] })} />
          <KV label="Geo URI" value={`geo:${pa.lat.toFixed(6)},${pa.lon.toFixed(6)}`} />
          <KV label="Lon, lat order (for GIS tools)" value={`${pa.lon.toFixed(6)}, ${pa.lat.toFixed(6)}`} />
        </div>
        <a href={`https://www.openstreetmap.org/?mlat=${pa.lat}&mlon=${pa.lon}#map=15/${pa.lat}/${pa.lon}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">Open on OpenStreetMap<ExternalLink className="size-3.5" /></a>
      </>}
      {mode === 'distance' && pa && pb && (() => {
        const A: [number, number] = [pa.lon, pa.lat], B: [number, number] = [pb.lon, pb.lat]
        const d = haversine(A, B), br = bearing(A, B), mid = midpoint(A, B)
        const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
        return (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-surface p-5 sm:col-span-2"><div className="text-xs font-semibold uppercase tracking-wide text-muted">Great-circle distance</div><div className="font-display text-3xl font-semibold text-accent">{fmtDistance(d)}</div><div className="text-sm text-muted">{(d / 1852).toFixed(2)} nautical miles</div></div>
            <KV label="Initial bearing" value={`${br.toFixed(1)}° (${dirs[Math.round(br / 45) % 8]})`} />
            <KV label="Midpoint" value={`${mid[1].toFixed(6)}, ${mid[0].toFixed(6)}`} />
            <KV label="Flight time at 850 km/h" value={`${Math.floor(d / 850000)} h ${Math.round(((d / 850000) % 1) * 60)} min`} mono={false} />
            <KV label="Driving at 60 km/h (straight line)" value={`${Math.floor(d / 60000)} h ${Math.round(((d / 60000) % 1) * 60)} min`} mono={false} />
          </div>
        )
      })()}
    </div>
  )
}
