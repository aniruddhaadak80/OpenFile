import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Button, Card, Dropzone, Input, Label, Segmented, Slider, Switch } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { TrackMap, TRACK_ACCEPT, useTrackFile } from '@/lib/bcat/geoui'
import { trackStats, writeGpx, fmtKm, fmtDur, type Pt } from '@/lib/bcat/geo2'
import { removeStops, retime, reverseTrack, shiftTimes, trimTrack } from '@/lib/cf/geo'
import { FileBar, Stat, Stats } from '@/lib/cf/ui'

const toLocal = (ms: number) => { const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16) }

export default function GpxEditor() {
  const t = useTrackFile()
  const [trimS, setTrimS] = useState(0), [trimE, setTrimE] = useState(0)
  const [rev, setRev] = useState(false), [keepTimes, setKeepTimes] = useState(true)
  const [stops, setStops] = useState(false), [stopKmh, setStopKmh] = useState(1.5)
  const [shiftMode, setShiftMode] = useState<'none' | 'shift' | 'start' | 'pace'>('none')
  const [shiftMin, setShiftMin] = useState(0), [start, setStart] = useState(''), [kmh, setKmh] = useState(12)
  const [name, setName] = useState('')
  const src = t.track?.points ?? []
  const total = useMemo(() => trackStats(src).distance, [src])
  const out = useMemo((): Pt[] => {
    let p = trimTrack(src, trimS, trimE)
    if (stops) p = removeStops(p, stopKmh, 20).pts
    if (rev) p = reverseTrack(p, keepTimes)
    if (shiftMode === 'shift' && shiftMin) p = shiftTimes(p, shiftMin * 60000)
    if (shiftMode === 'start' && start && p[0]?.time != null) p = shiftTimes(p, new Date(start).getTime() - p[0].time!)
    if (shiftMode === 'pace' && start) p = retime(p, new Date(start).getTime(), kmh)
    return p
  }, [src, trimS, trimE, rev, keepTimes, stops, stopKmh, shiftMode, shiftMin, start, kmh])
  const a = useMemo(() => trackStats(src), [src]), b = useMemo(() => trackStats(out), [out])
  if (!t.file) return <Dropzone accept={TRACK_ACCEPT} onFiles={(f) => t.open(f[0])} label="Drop a GPX, TCX, KML or GeoJSON track" sub="Trim the start and end, reverse it, cut out stops, or shift and set times. Your route never leaves this device." />
  const nm = name || t.track?.name || 'track'
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-3">
        <FileBar name={t.file.name} size={t.file.size} onReset={t.reset} />
        {t.error && <p className="text-sm text-danger">{t.error}</p>}
        {t.track && <>
          <TrackMap layers={[{ points: src, color: '#64748B', width: 2, dash: [4, 4] }, { points: out, color: '#F5A524', width: 3.5 }]} height={380} />
          <Stats cols={4}><Stat label="Distance" value={fmtKm(b.distance)} sub={`was ${fmtKm(a.distance)}`} /><Stat label="Points" value={b.points} sub={`was ${a.points}`} /><Stat label="Moving time" value={fmtDur(b.moving)} sub={`was ${fmtDur(a.moving)}`} /><Stat label="Starts" value={<span className="text-sm">{out[0]?.time ? new Date(out[0].time).toLocaleString() : 'no time'}</span>} /></Stats>
        </>}
      </div>
      <Card className="space-y-4 self-start">
        {t.tracks.length > 1 && <div><Label>Track</Label><select aria-label="Track" className="of-field h-10 w-full rounded-xl border border-border bg-surface-2/60 px-2 text-sm" value={t.sel} onChange={(e) => t.setSel(+e.target.value)}>{t.tracks.map((x, i) => <option key={i} value={i}>{x.name}</option>)}</select></div>}
        <Slider label="Cut from the start" value={trimS} onChange={setTrimS} min={0} max={Math.max(0, Math.floor(total / 2))} step={10} suffix=" m" />
        <Slider label="Cut from the end" value={trimE} onChange={setTrimE} min={0} max={Math.max(0, Math.floor(total / 2))} step={10} suffix=" m" />
        <Switch checked={stops} onChange={setStops} label="Remove stops (and close the time gap)" />
        {stops && <Slider label="Stopped below" value={stopKmh} onChange={setStopKmh} min={0.5} max={5} step={0.5} suffix=" km/h" />}
        <Switch checked={rev} onChange={setRev} label="Reverse direction" />
        {rev && <Switch checked={keepTimes} onChange={setKeepTimes} label="Keep times running forward" />}
        <div><Label>Times</Label><Segmented value={shiftMode} onChange={setShiftMode} options={[{ value: 'none', label: 'Keep' }, { value: 'shift', label: 'Shift' }, { value: 'start', label: 'New start' }, { value: 'pace', label: 'Set speed' }]} /></div>
        {shiftMode === 'shift' && <Slider label="Shift by" value={shiftMin} onChange={setShiftMin} min={-720} max={720} suffix=" min" />}
        {(shiftMode === 'start' || shiftMode === 'pace') && <div><Label>Start time</Label><Input aria-label="Start time" type="datetime-local" value={start || (src[0]?.time ? toLocal(src[0].time) : '')} onChange={(e) => setStart(e.target.value)} /></div>}
        {shiftMode === 'pace' && <Slider label="Even speed (for planned routes)" value={kmh} onChange={setKmh} min={2} max={60} suffix=" km/h" />}
        <div><Label>Track name</Label><Input aria-label="Track name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.track?.name} /></div>
        <Button className="w-full" icon={<Download className="size-4" />} disabled={out.length < 2} onClick={() => downloadBlob(new Blob([writeGpx([{ name: nm, points: out }], t.waypoints)], { type: 'application/gpx+xml' }), `${nm.replace(/[^\w-]+/g, '-')}-edited.gpx`)}>Download GPX</Button>
      </Card>
    </div>
  )
}
