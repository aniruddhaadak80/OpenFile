import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Download, Film, FileText, ArrowDownToLine, ArrowUpToLine, Wand2, Keyboard } from 'lucide-react'
import { Button, Dropzone, Label, Select, Textarea, ErrorNote, Switch, cn } from '@/components/ui'
import { downloadBlob, baseName } from '@/lib/files'
import { parseSubtitles, writeSubtitles, fixOverlaps, fmtClock, parseClock, plainText, cps, SUB_FORMATS, SUB_ACCEPT, subExt, subMime, type Cue, type SubFormat } from '@/lib/b4/subtitles'
import { readTextFile } from '@/lib/b4/text'

type Row = Cue & { id: string }
const rid = () => Math.random().toString(36).slice(2, 9)

function ClockInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const [t, setT] = useState<string | null>(null)
  return <input aria-label={label} value={t ?? fmtClock(value, '.')} onFocus={() => setT(fmtClock(value, '.'))} onChange={(e) => setT(e.target.value)}
    onBlur={() => { if (t != null) { const v = parseClock(t); if (Number.isFinite(v)) onChange(Math.max(0, v)) } setT(null) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
    className="h-8 w-[7.5rem] rounded-lg border border-border bg-surface-2/60 px-2 font-mono text-xs outline-none focus:border-accent" />
}

export default function SubtitleEditor() {
  const [video, setVideo] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [name, setName] = useState('subtitles')
  const [assHeader, setAssHeader] = useState<string | undefined>()
  const [now, setNow] = useState(0)
  const [sel, setSel] = useState<string | null>(null)
  const [follow, setFollow] = useState(true)
  const [out, setOut] = useState<SubFormat>('srt')
  const [error, setError] = useState<string | null>(null)
  const v = useRef<HTMLVideoElement>(null)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => { if (!video) { setVideoUrl(null); return } const u = URL.createObjectURL(video); setVideoUrl(u); return () => URL.revokeObjectURL(u) }, [video])
  const openSubs = async (f: File) => {
    setError(null)
    try { const d = parseSubtitles((await readTextFile(f)).text, { name: f.name }); setRows(d.cues.map((c) => ({ ...c, id: rid() }))); setName(baseName(f.name)); setAssHeader(d.assHeader); if (d.format !== 'txt') setOut(d.format) }
    catch (e: any) { setError(e?.message || 'Could not read this subtitle file.') }
  }
  const onFiles = (files: File[]) => { for (const f of files) { if (/^(video|audio)\//.test(f.type) || /\.(mp4|webm|mkv|mov|m4v|mp3|wav|m4a|ogg)$/i.test(f.name)) setVideo(f); else openSubs(f) } }
  const sorted = useMemo(() => (rows ? [...rows].sort((a, b) => a.start - b.start) : []), [rows])
  const active = sorted.find((r) => now >= r.start && now < r.end)
  useEffect(() => {
    if (!follow || !active || !list.current) return
    list.current.querySelector(`[data-id="${active.id}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active?.id, follow]) // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (id: string, p: Partial<Row>) => setRows((l) => l!.map((r) => (r.id === id ? { ...r, ...p } : r)))
  const add = () => {
    const t = v.current?.currentTime ?? (sorted.at(-1)?.end ?? 0) + 0.5
    const next = sorted.find((r) => r.start > t)
    const row: Row = { id: rid(), start: t, end: Math.min(t + 2.5, next ? next.start - 0.05 : t + 2.5), text: '' }
    setRows((l) => [...(l ?? []), row]); setSel(row.id)
    setTimeout(() => list.current?.querySelector<HTMLTextAreaElement>(`[data-id="${row.id}"] textarea`)?.focus(), 50)
  }
  const seek = (t: number) => { if (v.current) { v.current.currentTime = t; setNow(t) } }
  const selRow = rows?.find((r) => r.id === sel)
  const split = (r: Row) => {
    const mid = v.current && v.current.currentTime > r.start && v.current.currentTime < r.end ? v.current.currentTime : (r.start + r.end) / 2
    const words = plainText(r.text).split(/\s+/); const half = Math.ceil(words.length / 2)
    setRows((l) => l!.flatMap((x) => (x.id === r.id ? [{ ...x, end: mid, text: words.slice(0, half).join(' ') }, { id: rid(), start: mid, end: r.end, text: words.slice(half).join(' ') }] : [x])))
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (!(e.altKey || (tag !== 'TEXTAREA' && tag !== 'INPUT'))) return
      const t = v.current?.currentTime ?? 0
      if (e.key === '[' && selRow) { e.preventDefault(); patch(selRow.id, { start: t }) }
      else if (e.key === ']' && selRow) { e.preventDefault(); patch(selRow.id, { end: t }) }
      else if ((e.key === 'n' || e.key === 'N') && e.altKey) { e.preventDefault(); add() }
      else if (e.key === ' ' && tag !== 'TEXTAREA' && tag !== 'INPUT' && tag !== 'BUTTON' && v.current) { e.preventDefault(); v.current.paused ? v.current.play() : v.current.pause() }
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })
  const save = () => downloadBlob(new Blob([writeSubtitles(sorted, out, { assHeader })], { type: subMime(out) }), `${name}.${subExt(out)}`)

  if (!rows && !video) return (
    <div className="space-y-3">
      <Dropzone multiple accept={SUB_ACCEPT + ',video/*,audio/*,.mkv'} onFiles={onFiles} label="Drop a video and its subtitles" sub="Drop a video, a subtitle file, or both. You can also start a new file from scratch below." />
      <ErrorNote error={error} />
      <div className="text-center"><Button variant="outline" icon={<Plus className="size-4" />} onClick={() => setRows([])}>Start empty subtitles</Button></div>
    </div>
  )

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
        {videoUrl ? (
          <div className="relative overflow-hidden rounded-2xl border border-border bg-black">
            <video ref={v} src={videoUrl} controls playsInline className="max-h-[50vh] w-full" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} onSeeked={(e) => setNow(e.currentTarget.currentTime)} />
            {active && <div className="pointer-events-none absolute inset-x-0 bottom-12 flex justify-center px-4"><div className="whitespace-pre-line rounded bg-black/70 px-3 py-1 text-center text-base text-white sm:text-lg" dangerouslySetInnerHTML={{ __html: active.text.replace(/</g, '&lt;').replace(/&lt;(\/?)(i|b|u)>/g, '<$1$2>').replace(/\n/g, '<br/>') }} /></div>}
          </div>
        ) : (
          <Dropzone compact accept="video/*,audio/*,.mkv" onFiles={(f) => setVideo(f[0])} label={<span className="inline-flex items-center gap-1.5"><Film className="size-4" />Add a video to preview timing</span>} />
        )}
        {!rows && <Dropzone compact accept={SUB_ACCEPT} onFiles={(f) => openSubs(f[0])} label={<span className="inline-flex items-center gap-1.5"><FileText className="size-4" />Add a subtitle file</span>} />}
        <ErrorNote error={error} />
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3">
          <div className="font-mono text-sm">{fmtClock(now, '.')}</div>
          <div className="flex-1" />
          <Button size="sm" icon={<Plus className="size-4" />} onClick={add}>Add line here</Button>
          {selRow && <><Button size="sm" variant="outline" icon={<ArrowDownToLine className="size-4" />} onClick={() => patch(selRow.id, { start: v.current?.currentTime ?? selRow.start })}>Set start</Button><Button size="sm" variant="outline" icon={<ArrowUpToLine className="size-4" />} onClick={() => patch(selRow.id, { end: v.current?.currentTime ?? selRow.end })}>Set end</Button></>}
        </div>
        <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
          <div className="flex items-end gap-2">
            <div className="flex-1"><Label>Save as</Label><Select value={out} onChange={setOut} options={SUB_FORMATS.filter((f) => f.id !== 'txt').map((f) => ({ value: f.id, label: f.label }))} /></div>
            <Button icon={<Download className="size-4" />} onClick={save} disabled={!sorted.length}>Download</Button>
          </div>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" icon={<Wand2 className="size-4" />} onClick={() => setRows((l) => fixOverlaps(l ?? []).map((c) => ({ ...c, id: (c as Row).id ?? rid() })))}>Fix overlaps</Button><Switch checked={follow} onChange={setFollow} label="Follow playback" /></div>
          <p className="flex gap-1.5 text-xs text-muted"><Keyboard className="size-4 shrink-0" />Space plays or pauses. [ and ] set the start and end of the selected line to the current time (hold Alt while typing). Alt+N adds a line.</p>
        </div>
      </div>
      <div ref={list} className="max-h-[80vh] space-y-2 overflow-auto pr-1 scrollbar-thin">
        {!sorted.length && <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">No lines yet. Play the video and press Add line here.</div>}
        {sorted.map((r, i) => {
          const rate = cps(r); const bad = rate > 21 || r.end <= r.start || (sorted[i + 1] && r.end > sorted[i + 1].start)
          return (
            <div key={r.id} data-id={r.id} onClick={() => setSel(r.id)} className={cn('rounded-xl border bg-surface p-2.5 transition', sel === r.id ? 'border-accent' : active?.id === r.id ? 'border-accent/50 bg-accent/5' : 'border-border')}>
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <button className="w-8 cursor-pointer text-left font-mono text-xs text-muted hover:text-accent" onClick={() => seek(r.start)} aria-label={`Play line ${i + 1}`}>{i + 1}</button>
                <ClockInput label="Start" value={r.start} onChange={(x) => patch(r.id, { start: x })} />
                <span className="text-muted">to</span>
                <ClockInput label="End" value={r.end} onChange={(x) => patch(r.id, { end: x })} />
                <span className={cn('ml-auto font-mono text-[10px]', bad ? 'text-warn' : 'text-muted')} title="Characters per second">{(r.end - r.start).toFixed(1)}s · {rate.toFixed(0)} cps</span>
                <button className="cursor-pointer rounded px-1.5 py-0.5 text-xs text-muted hover:bg-surface-2 hover:text-fg" onClick={() => split(r)} aria-label="Split line">Split</button>
                <button className="cursor-pointer rounded p-1 text-muted hover:text-danger" onClick={() => setRows((l) => l!.filter((x) => x.id !== r.id))} aria-label="Delete line"><Trash2 className="size-3.5" /></button>
              </div>
              <Textarea value={r.text} onChange={(e) => patch(r.id, { text: e.target.value })} onFocus={() => setSel(r.id)} rows={2} className="min-h-0 font-sans text-sm" aria-label={`Text of line ${i + 1}`} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
