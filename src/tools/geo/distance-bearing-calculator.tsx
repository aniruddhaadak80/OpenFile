import { useMemo, useState } from 'react'
import { Card, Input, Label, Segmented, ErrorNote } from '@/components/ui'
import { TrackMap } from '@/lib/bcat/geoui'
import { bearing, compass, destination, dist, greatCircle, midpoint, parseLatLon } from '@/lib/cf/geo'
import { NumBox, Stat, Stats } from '@/lib/cf/ui'

const fmtD = (m: number, imp: boolean) => imp ? (m >= 1609.344 ? `${(m / 1609.344).toFixed(2)} mi` : `${Math.round(m * 3.28084)} ft`) : m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(1)} m`
const ll = (p: { lat: number; lon: number }) => `${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`

export default function DistanceBearingCalculator() {
  const [mode, setMode] = useState<'between' | 'destination' | 'route'>('between')
  const [a, setA] = useState('28.6139, 77.2090'), [b, setB] = useState('19.0760, 72.8777')
  const [brg, setBrg] = useState<number | null>(45), [km, setKm] = useState<number | null>(10)
  const [route, setRoute] = useState('51.5007, -0.1246\n48.8584, 2.2945\n41.8902, 12.4922\n40.4168, -3.7038')
  const [imp, setImp] = useState<'metric' | 'imperial'>('metric')
  const A = parseLatLon(a), B = parseLatLon(b)
  const res = useMemo(() => {
    if (mode === 'between') { if (!A || !B) return { e: 'Type two points as "latitude, longitude" (decimal or degrees like 48°51\'N 2°21\'E).' }; return { d: dist(A, B), b1: bearing(A, B), b2: (bearing(B, A) + 180) % 360, mid: midpoint(A, B), path: greatCircle(A, B) } }
    if (mode === 'destination') { if (!A || brg == null || km == null) return { e: 'Type a start point, a bearing and a distance.' }; const D = destination(A, brg, km * (imp === 'imperial' ? 1609.344 : 1000)); return { dest: D, path: greatCircle(A, D) } }
    const pts = route.split(/\n+/).map(parseLatLon).filter(Boolean) as { lat: number; lon: number }[]
    if (pts.length < 2) return { e: 'Type at least two points, one per line.' }
    const legs = pts.slice(1).map((p, i) => ({ d: dist(pts[i], p), b: bearing(pts[i], p) }))
    return { pts, legs, total: legs.reduce((s, l) => s + l.d, 0), path: pts.flatMap((p, i) => (i ? greatCircle(pts[i - 1], p, 24) : [p])) }
  }, [mode, a, b, brg, km, route, imp])
  const I = imp === 'imperial'
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-3">
        {'path' in res && res.path && <TrackMap layers={[{ points: res.path, color: '#F5A524', width: 3 }, ...('pts' in res && res.pts ? [{ points: res.pts, color: '#22D3EE', width: 0, dots: true }] : [])]} marker={'mid' in res ? res.mid : 'dest' in res ? res.dest : null} height={360} />}
        <ErrorNote error={'e' in res ? (res.e as string) : null} />
        {'d' in res && res.d != null && <Stats cols={4}><Stat label="Distance" value={fmtD(res.d, I)} sub="great circle" /><Stat label="Start bearing" value={`${res.b1!.toFixed(1)}°`} sub={compass(res.b1!)} /><Stat label="Final bearing" value={`${res.b2!.toFixed(1)}°`} sub={compass(res.b2!)} /><Stat label="Midpoint" value={<span className="text-sm">{ll(res.mid!)}</span>} /></Stats>}
        {'dest' in res && res.dest && <Stats cols={2}><Stat label="Arrives at" value={<span className="text-base">{ll(res.dest)}</span>} /><Stat label="Back bearing" value={`${((bearing(res.dest, A!) + 360) % 360).toFixed(1)}°`} /></Stats>}
        {'legs' in res && res.legs && <Card className="p-0"><div className="flex justify-between border-b border-border px-4 py-2 text-sm font-semibold"><span>{res.legs.length} legs</span><span>Total {fmtD(res.total!, I)}</span></div>{res.legs.map((l, i) => <div key={i} className="flex justify-between px-4 py-1.5 text-sm"><span className="text-muted">Leg {i + 1}</span><span className="font-mono">{fmtD(l.d, I)} at {l.b.toFixed(0)}° {compass(l.b)}</span></div>)}</Card>}
      </div>
      <Card className="space-y-4 self-start">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'between', label: 'Two points' }, { value: 'destination', label: 'Go from a point' }, { value: 'route', label: 'Route' }]} />
        {mode !== 'route' && <div><Label>{mode === 'between' ? 'From' : 'Start'}</Label><Input value={a} onChange={(e) => setA(e.target.value)} className="font-mono" /></div>}
        {mode === 'between' && <div><Label>To</Label><Input aria-label="To" value={b} onChange={(e) => setB(e.target.value)} className="font-mono" /></div>}
        {mode === 'destination' && <div className="grid grid-cols-2 gap-2"><NumBox label="Bearing" unit="°" value={brg} onChange={setBrg} /><NumBox label="Distance" unit={I ? 'mi' : 'km'} value={km} onChange={setKm} /></div>}
        {mode === 'route' && <div><Label>Points, one per line</Label><textarea aria-label="Points, one per line" value={route} onChange={(e) => setRoute(e.target.value)} className="of-field min-h-40 w-full rounded-xl border border-border bg-surface-2/60 p-2 font-mono text-xs" /></div>}
        <Segmented value={imp} onChange={setImp} options={[{ value: 'metric', label: 'km' }, { value: 'imperial', label: 'miles' }]} />
        <p className="text-xs text-muted">Uses the haversine formula on a sphere of radius 6,371 km. Results are within about 0.5 percent of survey-grade distances.</p>
      </Card>
    </div>
  )
}
