import { useMemo, useState } from 'react'
import { Download, MapPin, Route, Hexagon } from 'lucide-react'
import { Button, Dropzone, Select, Badge, Spinner, Segmented } from '@/components/ui'
import { downloadBlob, baseName, formatBytes } from '@/lib/files'
import { Bar, Status, Stat, DataTable, cellText } from '../dev/_b5/shell'
import { toFC, bbox, fcStats, toGPX, toCSVRows, rowsToFC, fmtDistance, eachCoord, type FC } from '@/lib/b5/geo'

type Out = 'geojson' | 'kml' | 'gpx' | 'csv' | 'shp'
const OUTS: { value: Out; label: string; ext: string; mime: string }[] = [
  { value: 'geojson', label: 'GeoJSON', ext: 'geojson', mime: 'application/geo+json' },
  { value: 'kml', label: 'KML (Google Earth)', ext: 'kml', mime: 'application/vnd.google-earth.kml+xml' },
  { value: 'gpx', label: 'GPX (GPS devices)', ext: 'gpx', mime: 'application/gpx+xml' },
  { value: 'csv', label: 'CSV (one row per point)', ext: 'csv', mime: 'text/csv' },
  { value: 'shp', label: 'Shapefile (ZIP)', ext: 'zip', mime: 'application/zip' },
]

async function readGeo(f: File): Promise<{ fc: FC; fmt: string }> {
  const n = f.name.toLowerCase()
  if (n.endsWith('.zip') || n.endsWith('.shp')) {
    const shp = (await import('shpjs')).default as any
    const buf = await f.arrayBuffer()
    if (n.endsWith('.shp')) { const geoms = shp.parseShp(buf); return { fc: { type: 'FeatureCollection', features: geoms.map((g: any) => ({ type: 'Feature', properties: {}, geometry: g })) }, fmt: 'Shapefile (.shp only)' } }
    return { fc: toFC(await shp(buf)), fmt: 'Shapefile ZIP' }
  }
  if (n.endsWith('.kmz')) {
    const { unzipSync, strFromU8 } = await import('fflate')
    const files = unzipSync(new Uint8Array(await f.arrayBuffer()))
    const k = Object.keys(files).find((x) => x.toLowerCase().endsWith('.kml'))
    if (!k) throw new Error('No KML file found inside this KMZ.')
    const tg = await import('@tmcw/togeojson')
    return { fc: toFC(tg.kml(new DOMParser().parseFromString(strFromU8(files[k]), 'text/xml'))), fmt: 'KMZ' }
  }
  const text = await f.text()
  if (n.endsWith('.csv') || n.endsWith('.tsv') || n.endsWith('.txt')) {
    const Papa = (await import('papaparse')).default
    const r = Papa.parse<Record<string, any>>(text, { header: true, skipEmptyLines: true, dynamicTyping: true })
    return { fc: rowsToFC(r.data), fmt: 'CSV' }
  }
  const t = text.trimStart()
  if (t.startsWith('{') || t.startsWith('[')) return { fc: toFC(JSON.parse(text)), fmt: 'GeoJSON' }
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  if (doc.getElementsByTagName('parsererror')[0]) throw new Error('This file is not valid XML or JSON.')
  const tg = await import('@tmcw/togeojson')
  const root = doc.documentElement.nodeName.toLowerCase()
  if (root === 'gpx') return { fc: toFC(tg.gpx(doc)), fmt: 'GPX' }
  if (root === 'kml') return { fc: toFC(tg.kml(doc)), fmt: 'KML' }
  if (root === 'trainingcenterdatabase') return { fc: toFC(tg.tcx(doc)), fmt: 'TCX' }
  throw new Error(`Unknown format with root element <${root}>.`)
}

async function write(fc: FC, out: Out, name: string): Promise<Blob> {
  if (out === 'geojson') return new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' })
  if (out === 'kml') { const { toKML } = await import('@placemarkio/tokml'); return new Blob([toKML(fc as any)], { type: OUTS[1].mime }) }
  if (out === 'gpx') return new Blob([toGPX(fc)], { type: OUTS[2].mime })
  if (out === 'csv') { const Papa = (await import('papaparse')).default; const rows = toCSVRows(fc); const fields = [...new Set(rows.flatMap((r) => Object.keys(r)))]; return new Blob([Papa.unparse({ fields, data: rows.map((r) => fields.map((k) => cellText(r[k]))) })], { type: 'text/csv' }) }
  const shpwrite = (await import('@mapbox/shp-write')) as any
  const clean: FC = { type: 'FeatureCollection', features: fc.features.filter((f) => f.geometry).map((f) => ({ ...f, properties: Object.fromEntries(Object.entries(f.properties ?? {}).filter(([, v]) => v === null || typeof v !== 'object').map(([k, v]) => [k.slice(0, 10), v])) })) }
  const res = await (shpwrite.zip ?? shpwrite.default.zip)(clean, { folder: name, outputType: 'blob', compression: 'DEFLATE' })
  return res as Blob
}

function MapPreview({ fc }: { fc: FC }) {
  const box = bbox(fc)
  if (!box) return <div className="grid h-80 place-items-center text-sm text-muted">No coordinates to draw</div>
  const merc = (lon: number, lat: number) => [lon, -Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360)) * 57.29578]
  const [x0, y0] = merc(box[0], box[3]), [x1, y1] = merc(box[2], box[1])
  const w = Math.max(x1 - x0, 1e-6), h = Math.max(y1 - y0, 1e-6), pad = Math.max(w, h) * 0.06
  const vb = `${x0 - pad} ${y0 - pad} ${w + pad * 2} ${h + pad * 2}`
  const sw = Math.max(w, h) / 300
  const path = (cs: number[][]) => cs.map((c, i) => `${i ? 'L' : 'M'}${merc(c[0], c[1]).join(' ')}`).join('')
  const els: React.ReactNode[] = []
  fc.features.slice(0, 5000).forEach((f, i) => {
    const g = f.geometry; if (!g) return
    const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
    lines.forEach((l: number[][], k: number) => els.push(<path key={`l${i}-${k}`} d={path(l)} fill="none" stroke="var(--accent)" strokeWidth={sw * 2} strokeLinejoin="round" strokeLinecap="round" />))
    polys.forEach((p: number[][][], k: number) => els.push(<path key={`p${i}-${k}`} d={p.map((r) => path(r) + 'Z').join('')} fill="color-mix(in oklab, var(--color-teal) 25%, transparent)" stroke="var(--color-teal)" strokeWidth={sw} fillRule="evenodd" />))
    if (g.type === 'Point' || g.type === 'MultiPoint') eachCoord(g, (c) => { const [x, y] = merc(c[0], c[1]); els.push(<circle key={`c${i}-${els.length}`} cx={x} cy={y} r={sw * 3.5} fill="var(--color-sky)" stroke="var(--bg)" strokeWidth={sw} />) })
  })
  return (
    <svg viewBox={vb} className="h-80 w-full rounded-xl bg-surface-2/40 sm:h-96" role="img" aria-label="Map preview of the features">
      <defs><pattern id="geo-grid" width={(w + pad * 2) / 10} height={(w + pad * 2) / 10} patternUnits="userSpaceOnUse"><path d={`M ${(w + pad * 2) / 10} 0 L 0 0 0 ${(w + pad * 2) / 10}`} fill="none" stroke="var(--border)" strokeWidth={sw / 2} /></pattern></defs>
      <rect x={x0 - pad} y={y0 - pad} width={w + pad * 2} height={h + pad * 2} fill="url(#geo-grid)" />
      {els}
    </svg>
  )
}

export default function GeoConverter() {
  const [file, setFile] = useState<File | null>(null)
  const [data, setData] = useState<{ fc: FC; fmt: string } | null>(null)
  const [out, setOut] = useState<Out>('kml')
  const [tab, setTab] = useState<'map' | 'table'>('map')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const open = async (fs: File[]) => {
    setErr(null); setBusy(true); setFile(fs[0])
    try { const d = await readGeo(fs[0]); if (!d.fc.features.length) throw new Error('No features found in this file.'); setData(d); setOut(d.fmt === 'KML' || d.fmt === 'KMZ' ? 'gpx' : 'kml') } catch (e: any) { setErr(e.message); setData(null) } finally { setBusy(false) }
  }
  const stats = useMemo(() => (data ? fcStats(data.fc) : null), [data])
  const props = useMemo(() => { if (!data) return { cols: [] as string[], rows: [] as unknown[][] }; const cols = [...new Set(data.fc.features.flatMap((f) => Object.keys(f.properties ?? {})))].filter((k) => k !== 'coordinateProperties').slice(0, 12); return { cols: ['#', 'type', ...cols], rows: data.fc.features.map((f, i) => [i + 1, f.geometry?.type ?? 'none', ...cols.map((c) => f.properties?.[c])]) } }, [data])
  const save = async () => {
    if (!data || !file) return
    setBusy(true); setErr(null)
    try { const meta = OUTS.find((o) => o.value === out)!; downloadBlob(await write(data.fc, out, baseName(file.name)), `${baseName(file.name)}.${meta.ext}`) } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  if (!data) return (
    <div className="space-y-3">
      <Dropzone onFiles={open} accept=".gpx,.kml,.kmz,.geojson,.json,.zip,.shp,.csv,.tsv,.tcx,.txt" label="Drop a GPX, KML, KMZ, GeoJSON, Shapefile ZIP, TCX or CSV file" sub="See it on a preview map, then convert it. CSV needs lat and lon columns." />
      {busy && <Spinner label="Reading…" />}
      {err && <Status kind="err">{err}</Status>}
    </div>
  )

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        <Bar><span className="truncate font-medium">{file?.name}</span><Badge>{data.fmt}</Badge>{file && <span className="text-xs text-muted">{formatBytes(file.size)}</span>}<Segmented className="ml-auto" value={tab} onChange={setTab} options={[{ value: 'map', label: 'Map' }, { value: 'table', label: 'Attributes' }]} /></Bar>
        {tab === 'map' ? <MapPreview fc={data.fc} /> : <DataTable columns={props.cols} rows={props.rows} className="max-h-96" />}
        {stats && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label={<span className="inline-flex items-center gap-1"><MapPin className="size-3" />Points</span>} value={stats.points.toLocaleString()} />
            <Stat label={<span className="inline-flex items-center gap-1"><Route className="size-3" />Lines</span>} value={stats.lines.toLocaleString()} sub={stats.length ? fmtDistance(stats.length) : undefined} />
            <Stat label={<span className="inline-flex items-center gap-1"><Hexagon className="size-3" />Polygons</span>} value={stats.polygons.toLocaleString()} />
            <Stat label="Vertices" value={stats.vertices.toLocaleString()} />
          </div>
        )}
      </div>
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
          <div><div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Convert to</div><Select value={out} onChange={setOut} options={OUTS.map((o) => ({ value: o.value, label: o.label }))} /></div>
          <Button className="w-full" size="lg" loading={busy} icon={<Download className="size-4" />} onClick={save}>Convert and download</Button>
          {err && <Status kind="err">{err}</Status>}
          <div className="space-y-1 text-xs text-muted">
            {out === 'gpx' && <p>Points become waypoints. Lines and polygon outlines become tracks.</p>}
            {out === 'shp' && <p>Shapefile field names are cut to 10 characters. Each geometry type goes in its own .shp inside the ZIP.</p>}
            {out === 'csv' && <p>Each vertex becomes a row with its feature number, latitude, longitude and simple properties.</p>}
            <p>The preview uses a plain grid, so no map tiles are loaded from the internet.</p>
          </div>
          <Button variant="ghost" className="w-full" onClick={() => { setData(null); setFile(null) }}>Open another file</Button>
        </div>
      </aside>
    </div>
  )
}
