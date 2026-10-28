import { useMemo, useState } from 'react'
import { Dropzone, Label, Segmented, Select, ToolGrid, ErrorNote, Empty, cn } from '@/components/ui'
import { baseName } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { splits, trackStats, fmtDur, fmtKm } from '@/lib/bcat/geo2'
import { useTrackFile, TRACK_ACCEPT, TrackMap } from '@/lib/bcat/geoui'
import { DlButton, toCsv } from '@/lib/bcat/kit'
import { Stat } from '@/tools/dev/_b5/shell'

export default function GpxSplits() {
  const t = useTrackFile()
  const [unit, setUnit] = useState<'km' | 'mi'>('km')
  const [sport, setSport] = useState<'run' | 'ride'>('run')
  const every = unit === 'km' ? 1000 : 1609.344
  const st = useMemo(() => (t.track ? trackStats(t.track.points) : null), [t.track])
  const sp = useMemo(() => (t.track ? splits(t.track.points, every) : []), [t.track, every])
  const hasTime = sp.some((s) => s.time != null)
  const paces = sp.filter((s) => s.pace != null && s.distance > every * 0.5).map((s) => s.pace!)
  const best = paces.length ? Math.min(...paces) : 0, worst = paces.length ? Math.max(...paces) : 0
  const speed = (s: { distance: number; time?: number }) => (s.time ? (s.distance / s.time) * (unit === 'km' ? 3.6 : 2.236936) : 0)
  const paceText = (p?: number) => (p == null ? '-' : `${fmtDur(p)} /${unit}`)

  if (!t.file) return <Dropzone accept={TRACK_ACCEPT} onFiles={(f) => t.open(f[0])} label="Drop a GPX or TCX activity" sub="Splits per kilometre or mile with pace, speed, climbing and heart rate." />
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <TopBar file={t.file} onReset={t.reset} />
          <ErrorNote error={t.error} />
          {st && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Distance" value={fmtKm(st.distance, unit === 'mi')} />
            <Stat label="Moving time" value={fmtDur(st.moving)} sub={st.duration ? `elapsed ${fmtDur(st.duration)}` : undefined} />
            <Stat label={sport === 'run' ? 'Avg pace' : 'Avg speed'} value={st.avgSpeed ? (sport === 'run' ? paceText(every / st.avgSpeed) : `${(st.avgSpeed * (unit === 'km' ? 3.6 : 2.236936)).toFixed(1)} ${unit === 'km' ? 'km/h' : 'mph'}`) : '-'} />
            <Stat label="Avg heart rate" value={st.avgHr ? `${Math.round(st.avgHr)} bpm` : '-'} sub={st.maxHr ? `max ${st.maxHr}` : undefined} />
          </div>}
          {t.track && !hasTime && <Empty>This file has no timestamps, so pace cannot be worked out. Distance and climbing per split are still shown.</Empty>}
          {sp.length > 0 && (
            <div className="overflow-auto rounded-2xl border border-border bg-surface">
              <table className="w-full text-sm">
                <thead className="bg-surface-2/60 text-left text-xs text-muted"><tr><th className="px-3 py-2">{unit === 'km' ? 'Km' : 'Mile'}</th><th className="px-3 py-2">{sport === 'run' ? 'Pace' : 'Speed'}</th><th className="px-3 py-2 w-1/3" /><th className="px-3 py-2">Time</th><th className="px-3 py-2">Up / down</th><th className="px-3 py-2">HR</th></tr></thead>
                <tbody>{sp.map((s) => {
                  const full = s.distance > every * 0.5
                  const w = s.pace && worst > best ? 1 - (s.pace - best) / (worst - best) * 0.8 : 1
                  return (
                    <tr key={s.index} className="border-t border-border">
                      <td className="px-3 py-1.5 font-mono">{full ? s.index : (s.distance / every).toFixed(2)}</td>
                      <td className={cn('px-3 py-1.5 font-mono', s.pace === best && full && 'text-success font-semibold')}>{sport === 'run' ? paceText(s.pace) : s.time ? `${speed(s).toFixed(1)}` : '-'}</td>
                      <td className="px-3 py-1.5"><span className="block h-2 rounded-full bg-gradient-brand" style={{ width: `${Math.max(6, w * 100)}%` }} /></td>
                      <td className="px-3 py-1.5 font-mono">{fmtDur(s.time)}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">+{Math.round(s.gain)} / -{Math.round(s.loss)}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">{s.avgHr ? Math.round(s.avgHr) : '-'}</td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>
          )}
          {t.track && <TrackMap layers={[{ points: t.track.points, color: '#F5A524' }]} height={260} />}
        </div>
      }
      side={
        <>
          {t.tracks.length > 1 && <div><Label>Track</Label><Select value={String(t.sel)} onChange={(v) => t.setSel(+v)} options={t.tracks.map((x, i) => ({ value: String(i), label: x.name }))} /></div>}
          <div><Label>Split every</Label><Segmented value={unit} onChange={setUnit} options={[{ value: 'km', label: 'Kilometre' }, { value: 'mi', label: 'Mile' }]} /></div>
          <div><Label>Show</Label><Segmented value={sport} onChange={setSport} options={[{ value: 'run', label: 'Pace (run, walk)' }, { value: 'ride', label: 'Speed (ride)' }]} /></div>
          {st?.start && <p className="text-xs text-muted">Started {new Date(st.start).toLocaleString()}</p>}
          {sp.length > 0 && <DlButton className="w-full" name={baseName(t.file.name) + '-splits.csv'} mime="text/csv" data={() => toCsv([['split', 'distance_m', 'time_s', `pace_s_per_${unit}`, `speed_${unit === 'km' ? 'kmh' : 'mph'}`, 'gain_m', 'loss_m', 'avg_hr'], ...sp.map((s) => [s.index, s.distance.toFixed(1), s.time ?? '', s.pace?.toFixed(1) ?? '', s.time ? speed(s).toFixed(2) : '', s.gain.toFixed(1), s.loss.toFixed(1), s.avgHr?.toFixed(0) ?? ''])])}>Download splits (CSV)</DlButton>}
          <p className="text-xs text-muted">Moving time skips stops longer than a few seconds, so it is closer to what sport watches show than elapsed time.</p>
        </>
      }
    />
  )
}
