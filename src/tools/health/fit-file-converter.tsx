import { useMemo, useState } from 'react'
import { Dropzone, Label, Segmented, ToolGrid, ErrorNote } from '@/components/ui'
import { baseName, formatBytes } from '@/lib/files'
import { activityStats, toCsvRows, toGpx, withDistance, fmtDuration } from '@/lib/r13/health'
import { useActivity, ACTIVITY_ACCEPT, Lines } from '@/lib/r13/ui'
import { toCsv, DlButton } from '@/lib/bcat/kit'
import { Stat } from '@/tools/dev/_b5/shell'

function Track({ pts }: { pts: { lat?: number; lon?: number }[] }) {
  const g = pts.filter((p) => p.lat != null && p.lon != null) as { lat: number; lon: number }[]
  if (g.length < 2) return null
  const minLat = Math.min(...g.map((p) => p.lat)), maxLat = Math.max(...g.map((p) => p.lat)), minLon = Math.min(...g.map((p) => p.lon)), maxLon = Math.max(...g.map((p) => p.lon))
  const k = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180)
  const w = (maxLon - minLon) * k || 1e-6, h = maxLat - minLat || 1e-6, s = 280 / Math.max(w, h)
  const step = Math.max(1, Math.floor(g.length / 1500))
  const d = g.filter((_, i) => i % step === 0).map((p, i) => `${i ? 'L' : 'M'}${(10 + (p.lon - minLon) * k * s).toFixed(1)},${(10 + (maxLat - p.lat) * s).toFixed(1)}`).join('')
  return <svg viewBox={`0 0 ${20 + w * s} ${20 + h * s}`} className="mx-auto h-56 w-full rounded-2xl border border-border bg-black/40" role="img" aria-label="Route shape"><path d={d} fill="none" stroke="#F5A524" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /></svg>
}

export default function FitFileConverter() {
  const a = useActivity()
  const [chart, setChart] = useState<'hr' | 'ele' | 'speed' | 'power'>('hr')
  const pts = useMemo(() => (a.act ? withDistance(a.act.points) : []), [a.act])
  const s = a.act ? activityStats(a.act) : null
  const step = Math.max(1, Math.floor(pts.length / 400))
  const series = { hr: { name: 'Heart rate', color: '#F97316', key: 'hr' }, ele: { name: 'Elevation (m)', color: '#14B8A6', key: 'ele' }, speed: { name: 'Speed (km/h)', color: '#38BDF8', key: 'speed' }, power: { name: 'Power (W)', color: '#F5A524', key: 'power' } } as const
  const has = (k: 'hr' | 'ele' | 'speed' | 'power') => pts.some((p) => p[k] != null)
  if (!a.file) return <Dropzone accept={ACTIVITY_ACCEPT} onFiles={(f) => f[0] && a.load(f[0])} label="Drop a FIT, TCX or GPX activity" sub="FIT files come from Garmin, Wahoo, Coros, Suunto, Zwift and most bike computers. Read on your device, never uploaded." />
  const name = baseName(a.file.name)
  return (
    <ToolGrid
      main={<>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm"><span className="min-w-0 flex-1 truncate font-medium">{a.file.name}</span><span className="text-xs text-muted">{formatBytes(a.file.size)}{a.act?.device ? ` · ${a.act.device}` : ''}</span></div>
        <ErrorNote error={a.error} />
        {a.act?.warnings.map((w) => <p key={w} className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">{w}</p>)}
        {s && <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Sport" value={<span className="capitalize">{s.sport ?? 'activity'}</span>} sub={s.start ? new Date(s.start).toLocaleString() : undefined} />
            <Stat label="Distance" value={`${(s.distance / 1000).toFixed(2)} km`} />
            <Stat label="Time" value={fmtDuration(s.duration)} sub={s.distance > 0 && s.duration > 0 ? `${fmtDuration(s.duration / (s.distance / 1000))} per km` : undefined} />
            <Stat label="Heart rate" value={s.avgHr ? `${s.avgHr} avg` : '-'} sub={s.maxHr ? `${s.maxHr} max` : undefined} />
            <Stat label="Climb" value={`${s.ascent ?? 0} m`} />
            <Stat label="Power" value={s.avgPower ? `${s.avgPower} W` : '-'} sub={s.maxPower ? `${s.maxPower} W max` : undefined} />
            <Stat label="Calories" value={s.calories ?? '-'} />
            <Stat label="Samples" value={s.points} sub={`${a.act!.laps.length} laps`} />
          </div>
          <Track pts={pts} />
          {(['hr', 'ele', 'speed', 'power'] as const).some(has) && <>
            <Segmented value={chart} onChange={setChart} options={(['hr', 'ele', 'speed', 'power'] as const).filter(has).map((k) => ({ value: k, label: series[k].name }))} />
            {has(chart) && <Lines label={series[chart].name} series={[{ name: series[chart].name, color: series[chart].color, values: pts.filter((_, i) => i % step === 0).map((p) => (chart === 'speed' ? (p.speed ?? NaN) * 3.6 : (p[chart] as number) ?? NaN)) }]} />}
          </>}
          <details className="rounded-xl border border-border bg-surface p-3 text-xs"><summary className="cursor-pointer text-muted">Messages in the file</summary><ul className="mt-2 grid grid-cols-2 gap-1 font-mono sm:grid-cols-3">{Object.entries(a.act!.messages).map(([k, v]) => <li key={k}>{k}: {v}</li>)}</ul></details>
        </>}
      </>}
      side={<>
        <Label>Convert to</Label>
        <div className="grid grid-cols-2 gap-2">
          <DlButton variant="primary" disabled={!pts.length} name={`${name}.csv`} mime="text/csv" data={() => toCsv(toCsvRows(pts))}>CSV</DlButton>
          <DlButton variant="primary" disabled={!pts.some((p) => p.lat != null)} name={`${name}.gpx`} mime="application/gpx+xml" data={() => toGpx(pts, name)}>GPX</DlButton>
          <DlButton disabled={!pts.length} name={`${name}.xlsx`} data={async () => { const XLSX = await import('xlsx'); const ws = XLSX.utils.aoa_to_sheet(toCsvRows(pts)); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Samples'); if (a.act?.laps.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(a.act.laps.map((l, i) => ({ lap: i + 1, start: new Date(l.start).toISOString(), seconds: l.elapsed, metres: l.distance, avg_hr: l.avgHr, max_hr: l.maxHr }))), 'Laps'); return new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })]) }}>Excel</DlButton>
          <DlButton disabled={!a.act} name={`${name}.json`} mime="application/json" data={() => JSON.stringify({ stats: s, laps: a.act?.laps, sessions: a.act?.sessions, points: pts }, null, 1)}>JSON</DlButton>
        </div>
        <DlButton className="w-full" disabled={!a.act?.laps.length} name={`${name}-laps.csv`} mime="text/csv" data={() => toCsv([['lap', 'start', 'seconds', 'metres', 'avg_hr', 'max_hr'], ...(a.act?.laps ?? []).map((l, i) => [i + 1, new Date(l.start).toISOString(), l.elapsed, l.distance ?? '', l.avgHr ?? '', l.maxHr ?? ''])])}>Laps CSV</DlButton>
        <button type="button" className="w-full rounded-xl border border-border py-2 text-sm hover:border-accent cursor-pointer" onClick={a.reset}>Open another file</button>
        <p className="text-xs text-muted">The FIT reader is written for OpenFile and handles compressed timestamps, laps, sessions and developer fields. Unknown messages are counted and skipped.</p>
      </>}
    />
  )
}
