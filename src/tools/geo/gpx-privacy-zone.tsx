import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Dropzone, Label, Slider, Switch, ToolGrid, ErrorNote } from '@/components/ui'
import { baseName } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { privacyFilter, stripExtras, writeGpx, trackStats, fmtKm } from '@/lib/bcat/geo2'
import { useTrackFile, TRACK_ACCEPT, TrackMap } from '@/lib/bcat/geoui'
import { DlButton } from '@/lib/bcat/kit'
import { Stat } from '@/tools/dev/_b5/shell'

export default function GpxPrivacyZone() {
  const t = useTrackFile()
  const [zones, setZones] = useState<{ lat: number; lon: number }[]>([])
  const [radius, setRadius] = useState(300)
  const [trimS, setTrimS] = useState(200)
  const [trimE, setTrimE] = useState(200)
  const [noTime, setNoTime] = useState(false)
  const [noHr, setNoHr] = useState(true)
  const [noWpt, setNoWpt] = useState(true)
  const [shift, setShift] = useState(false)

  const out = useMemo(() => t.tracks.map((tr) => {
    let pts = privacyFilter(tr.points, zones.map((z) => ({ ...z, r: radius })), trimS, trimE)
    pts = stripExtras(pts, { time: noTime, hr: noHr })
    if (shift && !noTime) { const t0 = pts.find((p) => p.time != null)?.time; if (t0 != null) { const base = Date.UTC(2000, 0, 1); pts = pts.map((p) => (p.time != null ? { ...p, time: base + (p.time - t0) } : p)) } }
    return { ...tr, points: pts }
  }), [t.tracks, zones, radius, trimS, trimE, noTime, noHr, shift])
  const removed = t.tracks.reduce((s, x) => s + x.points.length, 0) - out.reduce((s, x) => s + x.points.length, 0)
  const start = t.track?.points[0]

  if (!t.file) return <Dropzone accept={TRACK_ACCEPT} onFiles={(f) => t.open(f[0])} label="Drop a GPX track before you share it" sub="Hide where you start and finish, cut out your home area, and remove times and heart rate." />
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <TopBar file={t.file} onReset={() => { t.reset(); setZones([]) }} />
          <ErrorNote error={t.error} />
          <div className="grid grid-cols-3 gap-2"><Stat label="Hidden zones" value={zones.length} /><Stat label="Points removed" value={removed.toLocaleString()} /><Stat label="Shared distance" value={fmtKm(out.reduce((s, x) => s + trackStats(x.points).distance, 0))} /></div>
          <p className="text-xs text-muted">Click the map to add a hidden zone (your home, work or school). The grey line is what gets removed.</p>
          <TrackMap layers={[...t.tracks.map((x) => ({ points: x.points, color: '#737373', width: 4 })), ...out.map((x) => ({ points: x.points, color: '#F5A524', width: 3 }))]} circles={zones.map((z) => ({ ...z, r: radius, color: '#F97316' }))} onPick={(lat, lon) => setZones((p) => [...p, { lat, lon }])} height={440} />
        </div>
      }
      side={
        <>
          {start && zones.length === 0 && <button className="w-full rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted hover:text-fg cursor-pointer" onClick={() => setZones([{ lat: start.lat, lon: start.lon }])}>Add a zone around the start point</button>}
          {zones.length > 0 && <div><Label>Zones</Label><div className="space-y-1">{zones.map((z, i) => <div key={i} className="flex items-center gap-2 text-xs"><span className="flex-1 font-mono">{z.lat.toFixed(4)}, {z.lon.toFixed(4)}</span><button aria-label="Remove zone" className="text-muted hover:text-danger cursor-pointer" onClick={() => setZones((p) => p.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></button></div>)}</div></div>}
          <Slider label="Zone radius" value={radius} onChange={setRadius} min={50} max={2000} step={50} suffix=" m" />
          <Slider label="Trim from start" value={trimS} onChange={setTrimS} min={0} max={2000} step={50} suffix=" m" />
          <Slider label="Trim from end" value={trimE} onChange={setTrimE} min={0} max={2000} step={50} suffix=" m" />
          <Switch checked={noTime} onChange={setNoTime} label="Remove all timestamps" />
          {!noTime && <Switch checked={shift} onChange={setShift} label="Hide the real date (move to 1 Jan 2000)" />}
          <Switch checked={noHr} onChange={setNoHr} label="Remove heart rate and cadence" />
          <Switch checked={noWpt} onChange={setNoWpt} label="Remove waypoints" />
          <DlButton variant="primary" className="w-full" name={baseName(t.file.name) + '-private.gpx'} mime="application/gpx+xml" data={() => writeGpx(out.filter((x) => x.points.length), noWpt ? [] : t.waypoints)}>Download safe GPX</DlButton>
        </>
      }
    />
  )
}
