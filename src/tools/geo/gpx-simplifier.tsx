import { useMemo, useState } from 'react'
import { Dropzone, Label, Segmented, Slider, Switch, ToolGrid, ErrorNote } from '@/components/ui'
import { baseName, formatBytes } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { simplify, writeGpx, trackStats, stripExtras, fmtKm } from '@/lib/bcat/geo2'
import { useTrackFile, TRACK_ACCEPT, TrackMap } from '@/lib/bcat/geoui'
import { DlButton } from '@/lib/bcat/kit'
import { Stat } from '@/tools/dev/_b5/shell'

export default function GpxSimplifier() {
  const t = useTrackFile()
  const [mode, setMode] = useState<'tolerance' | 'target'>('tolerance')
  const [tol, setTol] = useState(5)
  const [target, setTarget] = useState(500)
  const [keepTime, setKeepTime] = useState(true)
  const [showOrig, setShowOrig] = useState(true)
  const all = t.tracks

  const out = useMemo(() => all.map((tr) => {
    let pts = tr.points
    if (mode === 'tolerance') pts = simplify(pts, tol)
    else { let lo = 0, hi = 500; for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; if (simplify(tr.points, mid).length > target) lo = mid; else hi = mid } pts = simplify(tr.points, hi) }
    return { ...tr, points: keepTime ? pts : stripExtras(pts, { time: true, hr: true }) }
  }), [all, mode, tol, target, keepTime])
  const gpx = useMemo(() => (out.length ? writeGpx(out, t.waypoints) : ''), [out, t.waypoints])
  const before = all.reduce((s, x) => s + x.points.length, 0), after = out.reduce((s, x) => s + x.points.length, 0)
  const d0 = all.reduce((s, x) => s + trackStats(x.points).distance, 0), d1 = out.reduce((s, x) => s + trackStats(x.points).distance, 0)

  if (!t.file) return <Dropzone accept={TRACK_ACCEPT} onFiles={(f) => t.open(f[0])} label="Drop a GPX, TCX, KML or GeoJSON track" sub="Cut thousands of points down while keeping the shape, so older GPS units and apps accept it." />
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <TopBar file={t.file} onReset={t.reset} />
          <ErrorNote error={t.error} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Points before" value={before.toLocaleString()} /><Stat label="Points after" value={after.toLocaleString()} sub={before ? `${Math.round((1 - after / before) * 100)}% fewer` : ''} /><Stat label="Distance change" value={d0 ? `${(((d1 - d0) / d0) * 100).toFixed(2)}%` : '-'} sub={fmtKm(d1)} /><Stat label="GPX size" value={formatBytes(new Blob([gpx]).size)} sub={`was ${formatBytes(t.file.size)}`} /></div>
          <TrackMap layers={[...(showOrig ? all.map((x) => ({ points: x.points, color: '#A3A3A3', width: 5 })) : []), ...out.map((x) => ({ points: x.points, color: '#F5A524', width: 2, dots: after < 400 }))]} height={420} />
        </div>
      }
      side={
        <>
          <div><Label>Method</Label><Segmented value={mode} onChange={setMode} options={[{ value: 'tolerance', label: 'Accuracy' }, { value: 'target', label: 'Point count' }]} /></div>
          {mode === 'tolerance' ? <Slider label="Allowed drift" value={tol} onChange={setTol} min={1} max={100} suffix=" m" /> : <Slider label="Target points per track" value={target} onChange={setTarget} min={20} max={5000} step={10} />}
          <Switch checked={keepTime} onChange={setKeepTime} label="Keep timestamps and heart rate" />
          <Switch checked={showOrig} onChange={setShowOrig} label="Show the original underneath" />
          <DlButton variant="primary" className="w-full" name={baseName(t.file.name) + '-simplified.gpx'} mime="application/gpx+xml" data={() => gpx}>Download GPX</DlButton>
          <p className="text-xs text-muted">Uses the Douglas-Peucker method: a point is kept only if dropping it would move the line more than the allowed drift.</p>
        </>
      }
    />
  )
}
