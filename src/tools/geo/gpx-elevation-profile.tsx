import { useEffect, useMemo, useRef, useState } from 'react'
import { Dropzone, Label, Segmented, Select, Slider, ToolGrid, ErrorNote, Empty } from '@/components/ui'
import { baseName, canvasToBlob } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { cumDist, trackStats, fmtKm } from '@/lib/bcat/geo2'
import { TrackMap, useTrackFile, TRACK_ACCEPT } from '@/lib/bcat/geoui'
import { DlButton, toCsv } from '@/lib/bcat/kit'
import { Stat } from '@/tools/dev/_b5/shell'

const gradeColor = (g: number) => { const a = Math.abs(g); return a < 3 ? '#10B981' : a < 6 ? '#84CC16' : a < 9 ? '#F5A524' : a < 12 ? '#F97316' : '#C2410C' }

export default function GpxElevationProfile() {
  const t = useTrackFile()
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric')
  const [smooth, setSmooth] = useState(5)
  const [hover, setHover] = useState<number | null>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const imp = units === 'imperial'

  const data = useMemo(() => {
    if (!t.track) return null
    const pts = t.track.points.filter((p) => p.ele != null)
    if (pts.length < 2) return { pts, d: [], e: [], g: [] }
    const d = cumDist(pts)
    const raw = pts.map((p) => p.ele!)
    const e = raw.map((_, i) => { let s = 0, n = 0; for (let k = Math.max(0, i - smooth); k <= Math.min(raw.length - 1, i + smooth); k++) { s += raw[k]; n++ } return s / n })
    const g = e.map((v, i) => { const j = Math.max(0, i - 3), k = Math.min(e.length - 1, i + 3), dd = d[k] - d[j]; return dd > 5 ? ((e[k] - e[j]) / dd) * 100 : 0 })
    return { pts, d, e, g }
  }, [t.track, smooth])
  const stats = useMemo(() => (t.track ? trackStats(t.track.points) : null), [t.track])
  const climbs = useMemo(() => {
    if (!data || data.e.length < 2) return []
    const out: { from: number; to: number; gain: number; len: number; avg: number }[] = []
    let s = 0, low = 0
    for (let i = 1; i < data.e.length; i++) {
      if (data.e[i] < data.e[low]) low = i
      if (data.e[i] < data.e[s] - 10 || i === data.e.length - 1) {
        const top = data.e.slice(s, i + 1).reduce((m, v, k) => (v > data.e[m] ? s + k : m), s)
        const gain = data.e[top] - data.e[s], len = data.d[top] - data.d[s]
        if (gain >= 25 && len > 200) out.push({ from: data.d[s], to: data.d[top], gain, len, avg: (gain / len) * 100 })
        s = i; low = i
      }
    }
    return out.sort((a, b) => b.gain - a.gain).slice(0, 8)
  }, [data])

  const draw = (c: HTMLCanvasElement, W: number, H: number, dpr: number, hv: number | null) => {
    if (!data || data.e.length < 2) return
    c.width = W * dpr; c.height = H * dpr
    const ctx = c.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H)
    const L = 48, B = 26, T = 10, Rr = 10, w = W - L - Rr, h = H - B - T
    const min = Math.min(...data.e), max = Math.max(...data.e), span = Math.max(10, max - min), lo = min - span * 0.08, hi = max + span * 0.08
    const total = data.d[data.d.length - 1]
    const X = (d: number) => L + (d / total) * w, Y = (v: number) => T + h - ((v - lo) / (hi - lo)) * h
    ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = 'rgba(160,160,160,.9)'; ctx.strokeStyle = 'rgba(128,128,128,.2)'
    for (let i = 0; i <= 4; i++) { const v = lo + ((hi - lo) * i) / 4, y = Y(v); ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + w, y); ctx.stroke(); ctx.fillText(`${Math.round(imp ? v * 3.28084 : v)}${imp ? 'ft' : 'm'}`, 4, y + 4) }
    for (let i = 0; i <= 5; i++) { const d = (total * i) / 5; ctx.fillText(fmtKm(d, imp), Math.min(W - 50, X(d) - 10), H - 8) }
    for (let i = 1; i < data.e.length; i++) {
      ctx.fillStyle = gradeColor(data.g[i]); ctx.globalAlpha = 0.55
      ctx.beginPath(); ctx.moveTo(X(data.d[i - 1]), Y(data.e[i - 1])); ctx.lineTo(X(data.d[i]), Y(data.e[i])); ctx.lineTo(X(data.d[i]), T + h); ctx.lineTo(X(data.d[i - 1]), T + h); ctx.closePath(); ctx.fill()
    }
    ctx.globalAlpha = 1; ctx.strokeStyle = '#F5A524'; ctx.lineWidth = 2; ctx.beginPath(); data.e.forEach((v, i) => (i ? ctx.lineTo(X(data.d[i]), Y(v)) : ctx.moveTo(X(data.d[i]), Y(v)))); ctx.stroke()
    if (hv != null) { const x = X(data.d[hv]); ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + h); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#FDE68A'; ctx.beginPath(); ctx.arc(x, Y(data.e[hv]), 4, 0, 7); ctx.fill() }
  }
  useEffect(() => { const c = cv.current; if (c) draw(c, c.clientWidth || 800, 260, window.devicePixelRatio || 1, hover) }, [data, hover, units])

  const png = async () => { const c = document.createElement('canvas'); c.style.background = '#000'; draw(c, 1600, 500, 1, null); const o = document.createElement('canvas'); o.width = c.width; o.height = c.height; const x = o.getContext('2d')!; x.fillStyle = '#0a0a0a'; x.fillRect(0, 0, o.width, o.height); x.drawImage(c, 0, 0); return canvasToBlob(o, 'image/png') }

  if (!t.file) return <Dropzone accept={TRACK_ACCEPT} onFiles={(f) => t.open(f[0])} label="Drop a GPX, TCX, KML or GeoJSON track" sub="See the climbs, steep parts and total ascent of your route." />
  const hv = hover != null && data ? { d: data.d[hover], e: data.e[hover], g: data.g[hover], p: data.pts[hover] } : null
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <TopBar file={t.file} onReset={t.reset} />
          <ErrorNote error={t.error} />
          {stats && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Distance" value={fmtKm(stats.distance, imp)} /><Stat label="Ascent" value={imp ? `${Math.round(stats.ascent * 3.28084)} ft` : `${Math.round(stats.ascent)} m`} /><Stat label="Descent" value={imp ? `${Math.round(stats.descent * 3.28084)} ft` : `${Math.round(stats.descent)} m`} /><Stat label="Highest" value={stats.maxEle != null ? (imp ? `${Math.round(stats.maxEle * 3.28084)} ft` : `${Math.round(stats.maxEle)} m`) : '-'} sub={stats.minEle != null ? `lowest ${Math.round(imp ? stats.minEle * 3.28084 : stats.minEle)}` : undefined} /></div>}
          {data && data.e.length >= 2 ? (
            <div className="rounded-2xl border border-border bg-surface p-3">
              <div className="mb-1 h-4 text-xs text-muted">{hv ? `${fmtKm(hv.d, imp)} · ${Math.round(imp ? hv.e * 3.28084 : hv.e)} ${imp ? 'ft' : 'm'} · grade ${hv.g.toFixed(1)}%` : 'Hover the profile for details'}</div>
              <canvas ref={cv} className="h-[260px] w-full" aria-label="Elevation profile" onMouseLeave={() => setHover(null)} onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(), total = data.d[data.d.length - 1], dd = ((e.clientX - r.left - 48) / (r.width - 58)) * total; let i = data.d.findIndex((x) => x >= dd); if (i < 0) i = data.d.length - 1; setHover(Math.max(0, i)) }} />
              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted">{[['#10B981', 'under 3%'], ['#84CC16', '3 to 6%'], ['#F5A524', '6 to 9%'], ['#F97316', '9 to 12%'], ['#C2410C', 'over 12%']].map(([c, l]) => <span key={l} className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: c }} />{l}</span>)}</div>
            </div>
          ) : t.track && <Empty>This track has no elevation data.</Empty>}
          {t.track && <TrackMap layers={[{ points: t.track.points, color: '#F5A524' }]} marker={hv?.p ?? null} height={300} />}
        </div>
      }
      side={
        <>
          {t.tracks.length > 1 && <label className="block"><Label>Track</Label><Select value={String(t.sel)} onChange={(v) => t.setSel(+v)} options={t.tracks.map((x, i) => ({ value: String(i), label: `${x.name} (${x.points.length} points)` }))} /></label>}
          <div><Label>Units</Label><Segmented value={units} onChange={setUnits} options={[{ value: 'metric', label: 'km, m' }, { value: 'imperial', label: 'mi, ft' }]} /></div>
          <Slider label="Smoothing" value={smooth} onChange={setSmooth} min={0} max={20} />
          {climbs.length > 0 && <div><Label>Biggest climbs</Label><div className="space-y-1 text-xs">{climbs.map((c, i) => <div key={i} className="flex justify-between gap-2 rounded-lg bg-surface-2/50 px-2 py-1"><span>{fmtKm(c.from, imp)} to {fmtKm(c.to, imp)}</span><span className="font-mono">+{Math.round(imp ? c.gain * 3.28084 : c.gain)}{imp ? 'ft' : 'm'} · {c.avg.toFixed(1)}%</span></div>)}</div></div>}
          {data && data.e.length >= 2 && (
            <div className="flex flex-wrap gap-2">
              <DlButton variant="primary" name={baseName(t.file.name) + '-elevation.png'} data={png}>Profile PNG</DlButton>
              <DlButton name={baseName(t.file.name) + '-elevation.csv'} mime="text/csv" data={() => toCsv([['distance_m', 'elevation_m', 'smoothed_m', 'grade_pct', 'lat', 'lon'], ...data.pts.map((p, i) => [data.d[i].toFixed(1), p.ele, data.e[i].toFixed(1), data.g[i].toFixed(2), p.lat, p.lon])])}>CSV</DlButton>
            </div>
          )}
        </>
      }
    />
  )
}
