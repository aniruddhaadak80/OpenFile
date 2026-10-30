import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Button, Card, Label, Select, Textarea } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { TrackMap } from '@/lib/bcat/geoui'
import { guessLatLonCols, pointsGeoJSON, pointsGpx, pointsKml, rowsToPoints } from '@/lib/cf/geo'
import { str } from '@/lib/cf/sheet'
import { csvSplit } from '@/lib/cf/study'
import { useSheet, useColOptions, RowsTable, Stat, Stats } from '@/lib/cf/ui'
import { sniffDelimiter } from '@/lib/cf/sheet'
import { PALETTE } from '@/lib/bcat/kit'

const SAMPLE = 'name,latitude,longitude,category\nTaj Mahal,27.1751,78.0421,monument\nGateway of India,18.9220,72.8347,monument\nHawa Mahal,26.9239,75.8267,palace\nVictoria Memorial,22.5448,88.3426,museum\nMysore Palace,12.3052,76.6552,palace\nGolden Temple,31.6200,74.8765,temple'

export default function CsvToMap() {
  const s = useSheet()
  const [text, setText] = useState(SAMPLE)
  const rows = useMemo(() => (s.book ? s.rows.map((r) => r.map((c) => str(c))) : text.trim().split(/\r?\n/).map((l) => csvSplit(l, sniffDelimiter(text)))), [s.book, s.rows, text])
  const head = rows[0] ?? []
  const g = useMemo(() => guessLatLonCols(head), [head.join()])
  const [lat, setLat] = useState<string | null>(null), [lon, setLon] = useState<string | null>(null), [nm, setNm] = useState<string | null>(null), [grp, setGrp] = useState<string>('-1')
  const opts = useColOptions(rows, true)
  const L = +(lat ?? g.lat), O = +(lon ?? g.lon), N = +(nm ?? g.name)
  const { pts, bad } = useMemo(() => (L >= 0 && O >= 0 ? rowsToPoints(rows.slice(1), { lat: L, lon: O, name: N }) : { pts: [], bad: [] }), [rows, L, O, N])
  const groups = useMemo(() => { if (+grp < 0) return [{ key: 'All', pts }]; const m = new Map<string, typeof pts>(); for (const p of pts) { const k = rows[p.row + 1][+grp] || 'blank'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(p) } return [...m].map(([key, pts]) => ({ key, pts })) }, [pts, grp, rows])
  const props = (p: { row: number }) => Object.fromEntries(head.map((h, i) => [h || `col${i + 1}`, rows[p.row + 1][i]]))
  const base = s.book?.name ?? 'points'
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-3">
        {pts.length ? <TrackMap layers={groups.map((gr, i) => ({ points: gr.pts, color: PALETTE[i % PALETTE.length], width: 0, dots: true, label: gr.key }))} height={420} /> : <div className="grid h-72 place-items-center rounded-2xl border border-dashed border-border text-sm text-muted">Pick the latitude and longitude columns.</div>}
        {+grp >= 0 && <div className="flex flex-wrap gap-2 text-xs">{groups.map((gr, i) => <span key={gr.key} className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />{gr.key} ({gr.pts.length})</span>)}</div>}
        <Stats><Stat label="Points on the map" value={pts.length} tone="good" /><Stat label="Rows skipped" value={bad.length} tone={bad.length ? 'warn' : undefined} sub="no valid coordinates" /><Stat label="Groups" value={groups.length} /></Stats>
        <RowsTable rows={rows} max={60} />
      </div>
      <Card className="space-y-4 self-start">
        {!s.book ? <div><Label hint={<label className="cursor-pointer text-accent">or open a file<input type="file" hidden accept=".csv,.tsv,.txt,.xlsx,.xls,.ods" onChange={(e) => { const f = e.target.files?.[0]; if (f) s.open(f) }} /></label>}>CSV with coordinates</Label><Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-32" /></div>
          : <div className="flex items-center justify-between text-sm"><span className="truncate">{s.file?.name}</span><Button size="sm" variant="ghost" onClick={s.reset}>Clear</Button></div>}
        <div className="grid grid-cols-2 gap-2"><div><Label>Latitude</Label><Select value={String(L)} onChange={setLat} options={[{ value: '-1', label: 'Pick' }, ...opts]} /></div><div><Label>Longitude</Label><Select value={String(O)} onChange={setLon} options={[{ value: '-1', label: 'Pick' }, ...opts]} /></div></div>
        <div><Label>Name</Label><Select value={String(N)} onChange={setNm} options={[{ value: '-1', label: 'None' }, ...opts]} /></div>
        <div><Label>Colour by</Label><Select value={grp} onChange={setGrp} options={[{ value: '-1', label: 'One colour' }, ...opts]} /></div>
        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" variant="outline" icon={<Download className="size-4" />} disabled={!pts.length} onClick={() => downloadBlob(new Blob([JSON.stringify(pointsGeoJSON(pts.map((p) => ({ lat: p.lat, lon: p.lon, props: props(p) }))), null, 1)], { type: 'application/geo+json' }), `${base}.geojson`)}>GeoJSON</Button>
          <Button size="sm" variant="outline" icon={<Download className="size-4" />} disabled={!pts.length} onClick={() => downloadBlob(new Blob([pointsKml(base, pts.map((p) => ({ lat: p.lat, lon: p.lon, name: p.name || `Point ${p.row + 1}`, desc: Object.entries(props(p)).map(([k, v]) => `${k}: ${v}`).join('\n') })))], { type: 'application/vnd.google-earth.kml+xml' }), `${base}.kml`)}>KML</Button>
          <Button size="sm" variant="outline" icon={<Download className="size-4" />} disabled={!pts.length} onClick={() => downloadBlob(new Blob([pointsGpx(pts.map((p) => ({ lat: p.lat, lon: p.lon, name: p.name || `Point ${p.row + 1}` })))], { type: 'application/gpx+xml' }), `${base}.gpx`)}>GPX</Button>
        </div>
        <p className="text-xs text-muted">KML opens in Google Earth and My Maps, GPX in GPS apps and watches, GeoJSON in QGIS and web maps.</p>
      </Card>
    </div>
  )
}
