import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Button, Card, Dropzone, Label, Segmented, Select, Textarea } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { TrackMap } from '@/lib/bcat/geoui'
import { circleZone, xmlDocument, guessLatLonCols, parseLatLon, pointInGeometry, rowsToPoints, zonesFromGeoJSON, type Zone } from '@/lib/cf/geo'
import { sniffDelimiter, str, toCsvText } from '@/lib/cf/sheet'
import { csvSplit } from '@/lib/cf/study'
import { useSheet, useColOptions, RowsTable, Stat, Stats, NumBox } from '@/lib/cf/ui'
import { PALETTE } from '@/lib/bcat/kit'

const SAMPLE = 'id,lat,lon\nA,12.9716,77.5946\nB,12.9352,77.6245\nC,13.0827,80.2707\nD,12.9698,77.7500\nE,13.0358,77.5970'

export default function GeofenceChecker() {
  const s = useSheet()
  const [text, setText] = useState(SAMPLE)
  const [zones, setZones] = useState<Zone[]>([])
  const [zmode, setZmode] = useState<'circle' | 'file'>('circle')
  const [center, setCenter] = useState('12.9716, 77.5946'), [radius, setRadius] = useState<number | null>(15)
  const [lat, setLat] = useState<string | null>(null), [lon, setLon] = useState<string | null>(null)
  const [zerr, setZerr] = useState<string | null>(null)
  const rows = useMemo(() => (s.book ? s.rows.map((r) => r.map((c) => str(c))) : text.trim().split(/\r?\n/).map((l) => csvSplit(l, sniffDelimiter(text)))), [s.book, s.rows, text])
  const g = guessLatLonCols(rows[0] ?? []), opts = useColOptions(rows, true)
  const L = +(lat ?? g.lat), O = +(lon ?? g.lon)
  const C = parseLatLon(center)
  const allZones = useMemo(() => zmode === 'circle' ? (C && radius ? [circleZone(`Within ${radius} km`, C, radius * 1000)] : []) : zones, [zmode, center, radius, zones])
  const { pts } = useMemo(() => (L >= 0 && O >= 0 ? rowsToPoints(rows.slice(1), { lat: L, lon: O }) : { pts: [] }), [rows, L, O])
  const tagged = useMemo(() => pts.map((p) => ({ ...p, zones: allZones.filter((z) => pointInGeometry(p.lon, p.lat, z.geometry)).map((z) => z.name) })), [pts, allZones])
  const outRows = useMemo(() => [[...(rows[0] ?? []), 'zone', 'inside'], ...rows.slice(1).map((r, i) => { const t = tagged.find((x) => x.row === i); return [...r, t?.zones.join('; ') ?? '', t ? (t.zones.length ? 'yes' : 'no') : 'no coordinates'] })], [rows, tagged])
  const inside = tagged.filter((t) => t.zones.length).length
  const loadZones = async (f: File) => { setZerr(null); try { let gj: any; if (/\.km[lz]$/i.test(f.name)) { const tg = await import('@tmcw/togeojson'); let xml = await f.text(); if (/\.kmz$/i.test(f.name)) { const { unzipSync, strFromU8 } = await import('fflate'); const z = unzipSync(new Uint8Array(await f.arrayBuffer())); const k = Object.keys(z).find((p) => p.endsWith('.kml')); if (!k) throw new Error('No KML in this KMZ.'); xml = strFromU8(z[k]) } gj = tg.kml(await xmlDocument(xml)) } else gj = JSON.parse(await f.text()); const z = zonesFromGeoJSON(gj); if (!z.length) throw new Error('No polygons found in this file.'); setZones(z) } catch (e: any) { setZerr(e.message) } }
  const ring = (z: Zone) => { const g2 = z.geometry.type === 'Polygon' ? z.geometry.coordinates[0] : z.geometry.coordinates[0][0]; return g2.map(([x, y]: number[]) => ({ lat: y, lon: x })) }
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-3">
        <TrackMap layers={[...allZones.map((z, i) => ({ points: ring(z), color: PALETTE[(i + 1) % PALETTE.length], width: 2 })), { points: tagged.filter((t) => t.zones.length), color: '#10B981', width: 0, dots: true }, { points: tagged.filter((t) => !t.zones.length), color: '#F97316', width: 0, dots: true }]} height={400} />
        <Stats><Stat label="Points" value={pts.length} /><Stat label="Inside a zone" value={inside} tone="good" /><Stat label="Outside" value={pts.length - inside} tone={pts.length - inside ? 'warn' : undefined} /></Stats>
        <RowsTable rows={outRows} max={100} />
      </div>
      <Card className="space-y-4 self-start">
        {!s.book ? <div><Label hint={<label className="cursor-pointer text-accent focus-within:underline">or open a file<input type="file" className="sr-only" accept=".csv,.tsv,.txt,.xlsx,.ods" onChange={(e) => { const f = e.target.files?.[0]; if (f) s.open(f) }} /></label>}>Points (CSV)</Label><Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-28" /></div> : <div className="flex justify-between text-sm"><span className="truncate">{s.file?.name}</span><Button size="sm" variant="ghost" onClick={s.reset}>Clear</Button></div>}
        <div className="grid grid-cols-2 gap-2"><div><Label>Latitude</Label><Select value={String(L)} onChange={setLat} options={[{ value: '-1', label: 'Pick' }, ...opts]} /></div><div><Label>Longitude</Label><Select value={String(O)} onChange={setLon} options={[{ value: '-1', label: 'Pick' }, ...opts]} /></div></div>
        <div><Label>Zones</Label><Segmented value={zmode} onChange={setZmode} options={[{ value: 'circle', label: 'Distance from a point' }, { value: 'file', label: 'Polygons file' }]} /></div>
        {zmode === 'circle' ? <div className="grid grid-cols-[1fr_6rem] gap-2"><div><Label>Centre</Label><input value={center} onChange={(e) => setCenter(e.target.value)} className="of-field h-10 w-full rounded-xl border border-border bg-surface-2/60 px-3 font-mono text-sm" /></div><NumBox label="Radius" unit="km" value={radius} onChange={setRadius} /></div>
          : <><Dropzone compact accept=".geojson,.json,.kml,.kmz" onFiles={(f) => loadZones(f[0])} label={zones.length ? `${zones.length} zones loaded` : 'Drop GeoJSON or KML polygons'} />{zerr && <p className="text-xs text-danger">{zerr}</p>}</>}
        <Button className="w-full" icon={<Download className="size-4" />} disabled={!pts.length} onClick={() => downloadBlob(new Blob(['\ufeff' + toCsvText(outRows)], { type: 'text/csv' }), 'points-with-zones.csv')}>Download tagged CSV</Button>
      </Card>
    </div>
  )
}
