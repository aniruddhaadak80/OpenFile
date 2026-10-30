import { useMemo, useState } from 'react'
import { Card, Dropzone, Label } from '@/components/ui'
import { TrackMap, TRACK_ACCEPT, loadTracks } from '@/lib/bcat/geoui'
import { trackStats, fmtKm, fmtDur, type Track } from '@/lib/bcat/geo2'
import { compareTracks, timeGapByDistance } from '@/lib/cf/geo'
import { FileBar } from '@/lib/cf/ui'

const COL = ['#F5A524', '#22D3EE']
const pace = (s?: number) => (s ? `${Math.floor(1000 / s / 60)}:${String(Math.round((1000 / s) % 60)).padStart(2, '0')} /km` : '-')

export default function GpxCompare() {
  const [tracks, setTracks] = useState<(Track & { file: string })[]>([])
  const [err, setErr] = useState<string | null>(null)
  const add = async (fs: File[]) => { setErr(null); const out = [...tracks]; for (const f of fs) { try { const r = await loadTracks(f); if (r.tracks[0]) out.push({ ...r.tracks[0], file: f.name }) } catch (e: any) { setErr(`${f.name}: ${e.message}`) } } setTracks(out.slice(-2)) }
  const st = tracks.map((t) => trackStats(t.points))
  const cmp = useMemo(() => (tracks.length === 2 ? compareTracks(tracks[0].points, tracks[1].points, Math.max(1, Math.floor(tracks[1].points.length / 3000))) : null), [tracks])
  const gaps = useMemo(() => (tracks.length === 2 ? timeGapByDistance(tracks[0].points, tracks[1].points) : []), [tracks])
  if (tracks.length < 2) return <div className="space-y-3">{tracks.map((t, i) => <FileBar key={i} name={t.file} onReset={() => setTracks([])} />)}<Dropzone multiple accept={TRACK_ACCEPT} onFiles={add} label={tracks.length ? 'Now drop the second track' : 'Drop two tracks to compare'} sub="Two runs of the same route, a plan against what you did, or yesterday against today." />{err && <p className="text-sm text-danger">{err}</p>}</div>
  const rows: [string, (i: number) => string][] = [['Distance', (i) => fmtKm(st[i].distance)], ['Moving time', (i) => fmtDur(st[i].moving)], ['Total time', (i) => fmtDur(st[i].duration)], ['Average pace', (i) => pace(st[i].avgSpeed)], ['Climb', (i) => `${Math.round(st[i].ascent)} m`], ['Max speed', (i) => (st[i].maxSpeed ? `${(st[i].maxSpeed! * 3.6).toFixed(1)} km/h` : '-')], ['Avg heart rate', (i) => (st[i].avgHr ? `${Math.round(st[i].avgHr!)} bpm` : '-')], ['Date', (i) => (tracks[i].points[0]?.time ? new Date(tracks[i].points[0].time!).toLocaleDateString() : '-')]]
  const maxGap = Math.max(1, ...gaps.map((g) => Math.abs(g.gap)))
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">{tracks.map((t, i) => <span key={i} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-sm"><span className="size-3 rounded-full" style={{ background: COL[i] }} />{t.file}</span>)}<button className="text-sm text-muted hover:text-fg cursor-pointer" onClick={() => setTracks([])}>Start over</button></div>
      <TrackMap layers={tracks.map((t, i) => ({ points: t.points, color: COL[i], width: 3 }))} height={380} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-0"><table className="w-full text-sm"><thead><tr className="border-b border-border text-xs uppercase text-muted"><th className="px-4 py-2 text-left">Measure</th>{tracks.map((t, i) => <th key={i} className="px-4 py-2 text-right" style={{ color: COL[i] }}>{t.name.slice(0, 18)}</th>)}</tr></thead>
          <tbody>{rows.map(([k, f]) => <tr key={k} className="border-b border-border/60"><td className="px-4 py-1.5 text-muted">{k}</td>{[0, 1].map((i) => <td key={i} className="px-4 py-1.5 text-right font-mono">{f(i)}</td>)}</tr>)}</tbody></table></Card>
        <Card className="space-y-2">
          <Label>How closely the routes match</Label>
          {cmp && <div className="grid grid-cols-3 gap-2 text-center"><div><div className="font-display text-2xl font-bold">{Math.round(cmp.overlap25 * 100)}%</div><div className="text-xs text-muted">within 25 m</div></div><div><div className="font-display text-2xl font-bold">{Math.round(cmp.median)} m</div><div className="text-xs text-muted">typical gap</div></div><div><div className="font-display text-2xl font-bold">{Math.round(cmp.max)} m</div><div className="text-xs text-muted">widest gap</div></div></div>}
          {gaps.length > 0 && <><Label className="pt-2">Ahead or behind at each km (orange track minus cyan)</Label>
            <div className="space-y-1">{gaps.slice(0, 60).map((g) => <div key={g.km} className="grid grid-cols-[3rem_1fr_4.5rem] items-center gap-2 text-xs"><span className="text-muted">{g.km} km</span><div className="relative h-2 rounded bg-surface-2"><div className="absolute top-0 h-2 rounded" style={{ left: g.gap < 0 ? `${50 - (Math.abs(g.gap) / maxGap) * 50}%` : '50%', width: `${(Math.abs(g.gap) / maxGap) * 50}%`, background: g.gap < 0 ? '#10B981' : '#F97316' }} /></div><span className="text-right font-mono">{g.gap < 0 ? '-' : '+'}{fmtDur(Math.abs(g.gap))}</span></div>)}</div>
            <p className="text-xs text-muted">Green means the orange track reached that km sooner.</p></>}
          {!gaps.length && <p className="text-xs text-muted">Time splits need timestamps in both files.</p>}
        </Card>
      </div>
    </div>
  )
}
