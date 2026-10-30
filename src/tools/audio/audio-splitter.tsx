import { useEffect, useMemo, useRef, useState } from 'react'
import { Scissors, Archive, Download, Play } from 'lucide-react'
import { Button, Dropzone, Label, Select, Segmented, Slider, ToolGrid, Textarea, ErrorNote, Progress, Input } from '@/components/ui'
import { baseName, downloadBlob, formatBytes, zipFiles } from '@/lib/files'
import { decodeAudioFile, encodeBuffer, trimBuffer, audioCtx, cssVar, peaks } from '@/tools/video/_media/audio'
import { fmtTime, parseTimeInput } from '@/tools/video/_media/media'
import { FileBar } from '@/tools/video/_media/ui'
import { AV_ACCEPT } from './_b4/FxShell'
import { findSilenceSplits, partsFromSplits } from './_b4/silence'

type Mode = 'parts' | 'every' | 'times' | 'silence'
type Fmt = 'mp3' | 'wav' | 'm4a' | 'ogg' | 'flac'

function Overview({ buffer, splits }: { buffer: AudioBuffer; splits: number[] }) {
  const c = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = c.current; if (!cv) return
    const w = cv.clientWidth || 800, h = 96, dpr = window.devicePixelRatio || 1
    cv.width = w * dpr; cv.height = h * dpr
    const ctx = cv.getContext('2d')!; ctx.scale(dpr, dpr)
    const pk = peaks(buffer, 0, buffer.duration, w)
    ctx.fillStyle = cssVar('--accent', '#F5A524')
    for (let x = 0; x < w; x++) { const v = Math.max(pk[x * 2 + 1] ?? 0, -(pk[x * 2] ?? 0)) * (h / 2 - 2); ctx.fillRect(x, h / 2 - v, 1, Math.max(1, v * 2)) }
    ctx.fillStyle = cssVar('--fg', '#fff')
    for (const s of splits) ctx.fillRect(Math.round((s / buffer.duration) * w), 0, 2, h)
  }, [buffer, splits])
  return <canvas ref={c} className="h-24 w-full rounded-xl bg-surface-2/60" />
}

export default function AudioSplitter() {
  const [file, setFile] = useState<File | null>(null)
  const [buf, setBuf] = useState<AudioBuffer | null>(null)
  const [mode, setMode] = useState<Mode>('parts')
  const [parts, setParts] = useState(3)
  const [every, setEvery] = useState('60')
  const [times, setTimes] = useState('1:00\n2:30')
  const [thr, setThr] = useState(-40)
  const [minSil, setMinSil] = useState(1.5)
  const [fmt, setFmt] = useState<Fmt>('mp3')
  const [busy, setBusy] = useState(false)
  const [p, setP] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [outs, setOuts] = useState<{ name: string; blob: Blob }[]>([])

  const open = async (f: File) => {
    setFile(f); setBuf(null); setOuts([]); setError(null); setBusy(true)
    try { setBuf(await decodeAudioFile(f)) } catch (e: any) { setError(e?.message || 'Could not decode this file.') } finally { setBusy(false) }
  }
  const splits = useMemo(() => {
    if (!buf) return []
    const d = buf.duration
    if (mode === 'parts') return Array.from({ length: Math.max(0, parts - 1) }, (_, i) => (d * (i + 1)) / parts)
    if (mode === 'every') { const s = parseTimeInput(every); if (!Number.isFinite(s) || s < 1) return []; const r: number[] = []; for (let t = s; t < d - 0.2; t += s) r.push(t); return r.slice(0, 500) }
    if (mode === 'times') return times.split(/[\n,;]+/).map(parseTimeInput).filter((t) => Number.isFinite(t) && t > 0 && t < d)
    const mono = buf.getChannelData(0)
    return findSilenceSplits(mono, buf.sampleRate, thr, minSil)
  }, [buf, mode, parts, every, times, thr, minSil])
  const segs = buf ? partsFromSplits(splits, buf.duration) : []

  const run = async () => {
    if (!buf || !file) return
    setBusy(true); setOuts([]); setError(null); setP(0)
    try {
      const res: { name: string; blob: Blob }[] = []
      const pad = String(segs.length).length
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i]
        const blob = await encodeBuffer(trimBuffer(buf, s.start, s.end), fmt, 192, (x) => setP((i + x) / segs.length))
        res.push({ name: `${baseName(file.name)}-${String(i + 1).padStart(Math.max(2, pad), '0')}.${fmt}`, blob }); setOuts([...res])
      }
    } catch (e: any) { setError(e?.message || 'Splitting failed.') } finally { setBusy(false) }
  }
  const preview = async (i: number) => { const ctx = audioCtx(); await ctx.resume(); const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start(0, segs[i].start, Math.min(6, segs[i].end - segs[i].start)) }

  if (!file) return <Dropzone accept={AV_ACCEPT} onFiles={(f) => open(f[0])} label="Drop an audio file to split" sub="Cut into equal parts, every few minutes, at times you choose, or wherever there is silence." />
  return (
    <ToolGrid
      main={<>
        <FileBar file={file} onReset={() => { setFile(null); setBuf(null); setOuts([]) }} />
        <ErrorNote error={error} />
        {buf ? <Overview buffer={buf} splits={splits} /> : busy && <Progress value={0.5} label="Decoding audio" />}
        {buf && <div className="max-h-80 overflow-auto rounded-xl border border-border bg-surface scrollbar-thin">
          {segs.map((s, i) => { const o = outs[i]; return (
            <div key={i} className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm last:border-0">
              <span className="w-8 font-mono text-xs text-muted">{i + 1}</span>
              <span className="flex-1 font-mono text-xs">{fmtTime(s.start, 1)} to {fmtTime(s.end, 1)} <span className="text-muted">({fmtTime(s.end - s.start, 1)})</span></span>
              <button className="cursor-pointer rounded p-1 text-muted hover:text-accent" onClick={() => preview(i)} aria-label={`Preview part ${i + 1}`}><Play className="size-3.5" /></button>
              {o && <Button size="sm" variant="outline" icon={<Download className="size-3.5" />} onClick={() => downloadBlob(o.blob, o.name)}>{formatBytes(o.blob.size)}</Button>}
            </div>) })}
        </div>}
      </>}
      side={<>
        <div><Label>Split by</Label><Segmented value={mode} onChange={setMode} options={[{ value: 'parts', label: 'Parts' }, { value: 'every', label: 'Length' }, { value: 'times', label: 'Times' }, { value: 'silence', label: 'Silence' }]} /></div>
        {mode === 'parts' && <Slider label="Number of parts" value={parts} onChange={setParts} min={2} max={20} />}
        {mode === 'every' && <div><Label>Each part is</Label><Input value={every} onChange={(e) => setEvery(e.target.value)} aria-label="Part length" className="font-mono" /><p className="mt-1 text-xs text-muted">Seconds, or minutes like 5:00.</p></div>}
        {mode === 'times' && <div><Label>Cut at</Label><Textarea value={times} onChange={(e) => setTimes(e.target.value)} className="min-h-24" aria-label="Cut times" /><p className="mt-1 text-xs text-muted">One time per line, like 1:30 or 90.</p></div>}
        {mode === 'silence' && <><Slider label="Silence threshold" value={thr} onChange={setThr} min={-70} max={-20} suffix=" dB" /><Slider label="Shortest gap" value={minSil} onChange={setMinSil} min={0.3} max={5} step={0.1} suffix=" s" /><p className="text-xs text-muted">Good for splitting an album rip into songs or a recording into sentences.</p></>}
        <div><Label>Format</Label><Select aria-label="Format" value={fmt} onChange={setFmt} options={[{ value: 'mp3', label: 'MP3' }, { value: 'm4a', label: 'M4A' }, { value: 'ogg', label: 'OGG' }, { value: 'wav', label: 'WAV' }, { value: 'flac', label: 'FLAC' }]} /></div>
        <Button size="lg" className="w-full" icon={<Scissors className="size-5" />} onClick={run} loading={busy && !!buf} disabled={!buf || segs.length < 2}>Split into {segs.length} parts</Button>
        {busy && buf && <Progress value={p} />}
        {outs.length > 1 && !busy && <Button variant="outline" className="w-full" icon={<Archive className="size-4" />} onClick={async () => downloadBlob(await zipFiles(outs.map((o) => ({ name: o.name, data: o.blob }))), `${baseName(file.name)}-parts.zip`)}>Download all as ZIP</Button>}
      </>}
    />
  )
}
