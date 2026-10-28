import { useMemo, useState } from 'react'
import { Dropzone, Label, Textarea, ToolGrid, ErrorNote, Button } from '@/components/ui'
import { baseName } from '@/lib/files'
import { toFC, bbox, type FC } from '@/lib/b5/geo'
import { geomArea, geomLength, geomCentroid, fmtArea, fmtKm } from '@/lib/bcat/geo2'
import { TrackMap } from '@/lib/bcat/geoui'
import { DlButton, toCsv, pal } from '@/lib/bcat/kit'
import { Stat } from '@/tools/dev/_b5/shell'

async function readAny(f: File): Promise<FC> {
  const n = f.name.toLowerCase()
  if (n.endsWith('.geojson') || n.endsWith('.json')) {
    const j = JSON.parse(await f.text())
    if (j.type === 'Topology') throw new Error('TopoJSON is not supported here. Convert it to GeoJSON first.')
    return toFC(j)
  }
  const tg = await import('@tmcw/togeojson')
  let xml: string
  if (n.endsWith('.kmz')) { const { unzipSync, strFromU8 } = await import('fflate'); const z = unzipSync(new Uint8Array(await f.arrayBuffer())); const k = Object.keys(z).find((p) => p.toLowerCase().endsWith('.kml')); if (!k) throw new Error('No KML inside this KMZ'); xml = strFromU8(z[k]) } else xml = await f.text()
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  return (n.endsWith('.gpx') ? tg.gpx(doc) : tg.kml(doc)) as FC
}
const SAMPLE = '{"type":"Feature","properties":{"name":"Park"},"geometry":{"type":"Polygon","coordinates":[[[-0.1657,51.5073],[-0.1517,51.5073],[-0.1517,51.5112],[-0.1657,51.5112],[-0.1657,51.5073]]]}}'

export default function GeojsonMeasure() {
  const [fc, setFc] = useState<FC | null>(null)
  const [name, setName] = useState('shapes')
  const [paste, setPaste] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const rows = useMemo(() => (fc?.features ?? []).map((f, i) => ({ i, name: String(f.properties?.name ?? f.properties?.NAME ?? f.properties?.title ?? `Feature ${i + 1}`), type: f.geometry?.type ?? 'none', area: geomArea(f.geometry), length: geomLength(f.geometry), c: geomCentroid(f.geometry) })), [fc])
  const box = useMemo(() => (fc ? bbox(fc) : null), [fc])
  const totalA = rows.reduce((s, r) => s + r.area, 0), totalL = rows.reduce((s, r) => s + (r.type.includes('Line') ? r.length : 0), 0)
  const layers = useMemo(() => (fc?.features ?? []).flatMap((f, i) => {
    const g = f.geometry; if (!g) return []
    const rings: number[][][] = g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : g.type === 'Point' ? [[g.coordinates]] : g.type === 'MultiPoint' ? [g.coordinates] : []
    return rings.map((r) => ({ points: r.map((c) => ({ lon: c[0], lat: c[1] })), color: pal(i), width: g.type.includes('Point') ? 0 : 2, dots: g.type.includes('Point') }))
  }), [fc])

  const open = async (f: File) => { setErr(null); try { setFc(await readAny(f)); setName(baseName(f.name)) } catch (e: any) { setErr(e?.message || 'Could not read this file') } }
  const fromPaste = (t: string) => { setErr(null); try { setFc(toFC(JSON.parse(t))); setName('pasted') } catch { setErr('That is not valid GeoJSON.') } }

  if (!fc) return (
    <div className="space-y-3">
      <Dropzone accept=".geojson,.json,.kml,.kmz,.gpx" onFiles={(f) => open(f[0])} label="Drop GeoJSON, KML, KMZ or GPX" sub="Measure the area, perimeter and length of every shape, with a map." />
      <Label>Or paste GeoJSON</Label>
      <Textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={SAMPLE} className="min-h-28 text-xs" aria-label="GeoJSON" />
      <div className="flex gap-2"><Button onClick={() => fromPaste(paste)} disabled={!paste.trim()}>Measure</Button><Button variant="ghost" onClick={() => { setPaste(SAMPLE); fromPaste(SAMPLE) }}>Try an example</Button></div>
      <ErrorNote error={err} />
    </div>
  )
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Features" value={rows.length} /><Stat label="Total area" value={<span className="text-sm">{totalA ? fmtArea(totalA) : '-'}</span>} /><Stat label="Line length" value={totalL ? fmtKm(totalL) : '-'} /><Stat label="Bounding box" value={<span className="text-xs">{box ? box.map((v) => v.toFixed(4)).join(', ') : '-'}</span>} /></div>
          <TrackMap layers={layers} height={360} />
          <div className="overflow-auto rounded-2xl border border-border bg-surface">
            <table className="w-full text-sm"><thead className="bg-surface-2/60 text-left text-xs text-muted"><tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Area</th><th className="px-3 py-2">Length or perimeter</th><th className="px-3 py-2">Centre</th></tr></thead>
              <tbody>{rows.slice(0, 1000).map((r) => <tr key={r.i} className="border-t border-border"><td className="px-3 py-1.5"><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: pal(r.i) }} />{r.name}</td><td className="px-3 py-1.5 text-xs">{r.type}</td><td className="px-3 py-1.5 text-xs">{r.area ? fmtArea(r.area) : '-'}</td><td className="px-3 py-1.5 text-xs">{r.length ? fmtKm(r.length) : '-'}</td><td className="px-3 py-1.5 font-mono text-[11px]">{r.c ? `${r.c[1].toFixed(5)}, ${r.c[0].toFixed(5)}` : '-'}</td></tr>)}</tbody></table>
          </div>
        </div>
      }
      side={
        <>
          <DlButton variant="primary" className="w-full" name={`${name}-measurements.csv`} mime="text/csv" data={() => toCsv([['name', 'type', 'area_m2', 'area_ha', 'length_m', 'centroid_lat', 'centroid_lon'], ...rows.map((r) => [r.name, r.type, r.area.toFixed(2), (r.area / 1e4).toFixed(4), r.length.toFixed(2), r.c?.[1] ?? '', r.c?.[0] ?? ''])])}>Download table (CSV)</DlButton>
          <DlButton className="w-full" name={`${name}-measured.geojson`} mime="application/geo+json" data={() => JSON.stringify({ ...fc, features: fc.features.map((f, i) => ({ ...f, properties: { ...(f.properties ?? {}), area_m2: +rows[i].area.toFixed(2), length_m: +rows[i].length.toFixed(2) } })) }, null, 2)}>GeoJSON with measurements</DlButton>
          <Button variant="ghost" className="w-full" onClick={() => setFc(null)}>Start over</Button>
          <p className="text-xs text-muted">Areas are worked out on the WGS84 sphere, the same way common GIS tools do. Holes in polygons are subtracted.</p>
        </>
      }
    />
  )
}
