import { useMemo, useState } from 'react'
import { ArrowUp, ArrowDown, Trash2, Combine, Split as SplitIcon } from 'lucide-react'
import { Button, Dropzone, Label, Segmented, Slider, Switch, Tabs, ToolGrid, ErrorNote } from '@/components/ui'
import { zipFiles, downloadBlob, baseName } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { mergeTracks, splitTrack, writeGpx, trackStats, fmtKm, fmtDur, type Track } from '@/lib/bcat/geo2'
import { loadTracks, TrackMap, TRACK_ACCEPT, useTrackFile } from '@/lib/bcat/geoui'
import { pal } from '@/lib/bcat/kit'

function Merge() {
  const [tracks, setTracks] = useState<(Track & { from: string })[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [byTime, setByTime] = useState(true)
  const [how, setHow] = useState<'one' | 'segments' | 'tracks'>('one')
  const add = async (fs: File[]) => {
    setErr(null)
    for (const f of fs) { try { const r = await loadTracks(f); setTracks((p) => [...p, ...r.tracks.map((t) => ({ ...t, from: f.name }))]) } catch (e: any) { setErr(`${f.name}: ${e?.message}`) } }
  }
  const ordered = useMemo(() => (byTime ? [...tracks].sort((a, b) => (a.points[0]?.time ?? 0) - (b.points[0]?.time ?? 0)) : tracks), [tracks, byTime])
  const move = (i: number, d: number) => setTracks((p) => { const n = [...p]; const j = i + d; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j], n[i]]; return n })
  const save = () => {
    const gpx = how === 'one' ? writeGpx([mergeTracks(ordered, 'Merged track', false)]) : how === 'segments' ? writeGpx(ordered.map((t) => ({ ...t, name: 'Merged track' })), [], 'OpenFile', true) : writeGpx(ordered)
    downloadBlob(new Blob([gpx], { type: 'application/gpx+xml' }), 'merged.gpx')
  }
  if (!tracks.length) return <><Dropzone multiple accept={TRACK_ACCEPT} onFiles={add} label="Drop two or more GPX, TCX, KML or GeoJSON files" sub="They are joined into one GPX you can load into any app or watch." /><ErrorNote error={err} /></>
  const total = mergeTracks(ordered, '', false)
  const st = trackStats(total.points)
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <TrackMap layers={ordered.map((t, i) => ({ points: t.points, color: pal(i) }))} height={340} />
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {ordered.map((t) => { const i = tracks.indexOf(t); const s = trackStats(t.points); return (
              <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="size-3 rounded-full" style={{ background: pal(ordered.indexOf(t)) }} />
                <span className="min-w-0 flex-1 truncate">{t.name} <span className="text-xs text-muted">({t.from})</span></span>
                <span className="text-xs text-muted">{fmtKm(s.distance)}{s.start ? ` · ${new Date(s.start).toLocaleDateString()}` : ''}</span>
                {!byTime && <><button aria-label="Move up" className="text-muted hover:text-fg cursor-pointer" onClick={() => move(i, -1)}><ArrowUp className="size-4" /></button><button aria-label="Move down" className="text-muted hover:text-fg cursor-pointer" onClick={() => move(i, 1)}><ArrowDown className="size-4" /></button></>}
                <button aria-label="Remove" className="text-muted hover:text-danger cursor-pointer" onClick={() => setTracks((p) => p.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
              </div>
            ) })}
          </div>
          <Dropzone compact multiple accept={TRACK_ACCEPT} onFiles={add} label="Add more tracks" />
          <ErrorNote error={err} />
        </div>
      }
      side={
        <>
          <p className="text-sm">{tracks.length} tracks · {fmtKm(st.distance)}{st.duration ? ` · ${fmtDur(st.duration)}` : ''}</p>
          <Switch checked={byTime} onChange={setByTime} label="Order by start time" />
          <div><Label>Output</Label><Segmented value={how} onChange={setHow} options={[{ value: 'one', label: 'One line' }, { value: 'segments', label: 'Segments' }, { value: 'tracks', label: 'Separate tracks' }]} /></div>
          <Button className="w-full" icon={<Combine className="size-4" />} disabled={tracks.length < 1} onClick={save}>Download merged GPX</Button>
          <Button variant="ghost" className="w-full" onClick={() => setTracks([])}>Start over</Button>
        </>
      }
    />
  )
}

function SplitT() {
  const t = useTrackFile()
  const [mode, setMode] = useState<'gap' | 'parts' | 'points' | 'jump'>('gap')
  const [gap, setGap] = useState(10)
  const [parts, setParts] = useState(2)
  const [every, setEvery] = useState(1000)
  const [jump, setJump] = useState(500)
  const pieces = useMemo(() => {
    if (!t.track) return []
    const n = t.track.points.length
    if (mode === 'gap') return splitTrack(t.track, { gapSec: gap * 60 })
    if (mode === 'jump') return splitTrack(t.track, { jumpM: jump })
    if (mode === 'points') return splitTrack(t.track, { every })
    return splitTrack(t.track, { atIndex: Array.from({ length: parts - 1 }, (_, i) => Math.round(((i + 1) * n) / parts)) })
  }, [t.track, mode, gap, parts, every, jump])
  if (!t.file) return <Dropzone accept={TRACK_ACCEPT} onFiles={(f) => t.open(f[0])} label="Drop a long GPX track to split" sub="Split at breaks, GPS jumps, by point count or into equal parts." />
  const name = baseName(t.file.name)
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <TopBar file={t.file} onReset={t.reset} />
          <ErrorNote error={t.error} />
          <TrackMap layers={pieces.map((p, i) => ({ points: p.points, color: pal(i) }))} height={360} />
          <div className="flex flex-wrap gap-2 text-xs">{pieces.map((p, i) => { const s = trackStats(p.points); return <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1"><span className="size-2 rounded-full" style={{ background: pal(i) }} />Part {i + 1}: {fmtKm(s.distance)}, {p.points.length} pts</span> })}</div>
        </div>
      }
      side={
        <>
          <div><Label>Split by</Label><Segmented value={mode} onChange={setMode} options={[{ value: 'gap', label: 'Breaks' }, { value: 'parts', label: 'Equal parts' }, { value: 'points', label: 'Points' }, { value: 'jump', label: 'GPS jumps' }]} /></div>
          {mode === 'gap' && <Slider label="Pause longer than" value={gap} onChange={setGap} min={1} max={240} suffix=" min" />}
          {mode === 'parts' && <Slider label="Parts" value={parts} onChange={setParts} min={2} max={20} />}
          {mode === 'points' && <Slider label="Points per part" value={every} onChange={setEvery} min={50} max={10000} step={50} />}
          {mode === 'jump' && <Slider label="Jump longer than" value={jump} onChange={setJump} min={50} max={5000} step={50} suffix=" m" />}
          <p className="text-sm">{pieces.length} part{pieces.length > 1 ? 's' : ''}</p>
          <Button className="w-full" icon={<SplitIcon className="size-4" />} disabled={pieces.length < 2} onClick={async () => downloadBlob(await zipFiles(pieces.map((p, i) => ({ name: `${name}-part-${i + 1}.gpx`, data: writeGpx([p]) }))), `${name}-parts.zip`)}>Download parts (ZIP)</Button>
          <Button variant="outline" className="w-full" disabled={pieces.length < 2} onClick={() => downloadBlob(new Blob([writeGpx(pieces)], { type: 'application/gpx+xml' }), `${name}-split.gpx`)}>One GPX with {pieces.length} tracks</Button>
        </>
      }
    />
  )
}

export default function GpxMergeSplit() {
  const [tab, setTab] = useState<'merge' | 'split'>('merge')
  return <div className="space-y-4"><Tabs value={tab} onChange={setTab} tabs={[{ value: 'merge', label: 'Merge tracks' }, { value: 'split', label: 'Split a track' }]} />{tab === 'merge' ? <Merge /> : <SplitT />}</div>
}
