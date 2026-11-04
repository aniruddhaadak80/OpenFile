import { useEffect, useMemo, useState } from 'react'
import { Input, Label, ToolGrid, Empty, Switch } from '@/components/ui'
import { Stat, Stats } from '@/lib/cf/ui'
import { parseLocation, locStats, toGpx, toKml, toGeoJson, type Pt } from '@/lib/r15/exports'
import { useExport, ExportDrop, plainError, readJson, Columns, Panel, fmtDate, fmtNum, LocalNote } from '@/lib/r15/ui'
import { Bars, DlButton, toCsv } from '@/lib/bcat/kit'

const pick = (p: string) => /\.json$/i.test(p) && /(timeline|records|location|semantic|\d{4}_[a-z]+\.json$|^[^/]+\.json$)/i.test(p)
function Dots({ pts }: { pts: Pt[] }) {
  if (pts.length < 2) return null
  const step = Math.max(1, Math.floor(pts.length / 6000))
  const s = pts.filter((_, i) => i % step === 0)
  const lat = s.map((p) => p.lat), lon = s.map((p) => p.lon)
  const y0 = Math.min(...lat), y1 = Math.max(...lat), x0 = Math.min(...lon), x1 = Math.max(...lon)
  const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180), w = Math.max(1e-6, (x1 - x0) * k), h = Math.max(1e-6, y1 - y0)
  const W = 600, H = Math.min(420, Math.max(200, (W * h) / w))
  const sc = Math.min((W - 20) / w, (H - 20) / h)
  return <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded-xl bg-surface-2/40" role="img" aria-label="Shape of your recorded places">{s.map((p, i) => <circle key={i} cx={10 + (p.lon - x0) * k * sc} cy={H - 10 - (p.lat - y0) * sc} r={p.kind === 'visit' ? 3 : 1.2} fill={p.kind === 'visit' ? '#F5A524' : '#6EE7B7'} opacity={p.kind === 'visit' ? 0.9 : 0.5} />)}</svg>
}
export default function LocationHistoryConverter() {
  const ex = useExport(pick)
  const [pts, setPts] = useState<Pt[]>([]), [fmt, setFmt] = useState(''), [err, setErr] = useState<string | null>(null)
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [visits, setVisits] = useState(true), [paths, setPaths] = useState(true)
  useEffect(() => { (async () => {
    setErr(null); setPts([])
    const all: Pt[] = [], fm = new Set<string>()
    for (const e of ex.entries) { try { const r = parseLocation(await readJson(e)); all.push(...r.points); fm.add(r.format) } catch (x: any) { if (ex.entries.length === 1) setErr(plainError(x)) } }
    if (ex.entries.length && !all.length) setErr((m) => m ?? 'No locations were found in these files.')
    setPts(all); setFmt([...fm].join(', '))
  })() }, [ex.entries])
  const sel = useMemo(() => {
    const a = from ? new Date(from + 'T00:00:00') : null, b = to ? new Date(to + 'T23:59:59') : null
    return pts.filter((p) => (p.kind === 'visit' ? visits : paths) && (!a || (p.t && p.t >= a)) && (!b || (p.t && p.t <= b)))
  }, [pts, from, to, visits, paths])
  const s = useMemo(() => (sel.length ? locStats(sel) : null), [sel])
  const tag = from || to ? `${from || 'start'}_${to || 'end'}` : 'all'
  return (
    <ToolGrid
      main={<>
        <ExportDrop st={{ ...ex, error: ex.error ?? err }} accept=".zip,.json" label="Drop Google location history" sub="Timeline.json from your phone, or Records.json and Semantic Location History from Takeout. Read in your browser." />
        {s ? <>
          <Stats cols={4}>
            <Stat label="Points" value={fmtNum(s.points)} sub={fmt} />
            <Stat label="Place visits" value={fmtNum(s.visits)} />
            <Stat label="Days with data" value={fmtNum(s.days)} sub={`${fmtDate(s.first)} to ${fmtDate(s.last)}`} />
            <Stat label="Distance moved" value={`${fmtNum(s.totalKm)} km`} sub="straight lines between points, same day" />
          </Stats>
          <Panel title="Where your points are" hint="no map tiles are loaded, so nothing leaves the page"><Dots pts={sel} /></Panel>
          {s.kmByMonth.length > 1 && <Columns label="Kilometres per month" data={s.kmByMonth.map((m) => ({ label: m.label.slice(2), value: m.value }))} color="#6EE7B7" unit=" km" />}
          {s.places.length > 0 && <Panel title="Places you went most" hint="by number of visits"><Bars items={s.places} color="#F5A524" /></Panel>}
        </> : ex.entries.length > 0 && !err ? <Empty>Reading your history...</Empty> : null}
      </>}
      side={<>
        <div className="grid grid-cols-2 gap-2"><div><Label>From</Label><Input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div><div><Label>To</Label><Input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div></div>
        <Switch checked={visits} onChange={setVisits} label="Place visits" />
        <Switch checked={paths} onChange={setPaths} label="Routes and raw points" />
        {s && <div className="grid gap-2">
          <DlButton variant="primary" name={`location-${tag}.gpx`} mime="application/gpx+xml" data={() => toGpx(sel)}>GPX (one track per day)</DlButton>
          <DlButton name={`location-${tag}.kml`} mime="application/vnd.google-earth.kml+xml" data={() => toKml(sel)}>KML for Google Earth</DlButton>
          <DlButton name={`location-${tag}.geojson`} mime="application/geo+json" data={() => toGeoJson(sel)}>GeoJSON</DlButton>
          <DlButton name={`location-${tag}.csv`} mime="text/csv" data={() => toCsv([['time', 'latitude', 'longitude', 'kind', 'name', 'activity'], ...sel.map((p) => [p.t?.toISOString() ?? '', p.lat, p.lon, p.kind, p.name ?? '', p.activity ?? ''])])}>CSV</DlButton>
        </div>}
        <p className="text-xs text-muted">Since 2024 Google keeps Timeline on your phone. Export it in Settings, Location, Location services, Timeline, Export Timeline data. Older history comes from Takeout as Records.json.</p>
        <LocalNote>Location history shows where you live and work. It is read inside this tab and never uploaded.</LocalNote>
      </>}
    />
  )
}
