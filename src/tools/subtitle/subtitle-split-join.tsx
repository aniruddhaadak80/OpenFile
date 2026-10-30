import { useMemo, useState } from 'react'
import { Scissors, Combine, Download, ArrowUp, ArrowDown, X } from 'lucide-react'
import { Button, Dropzone, Field, Input, Segmented, Switch, Tabs, ToolGrid, Select, Label } from '@/components/ui'
import { baseName, downloadBlob, zipFiles } from '@/lib/files'
import { writeSubtitles, fmtClock, parseClock, SUB_ACCEPT, SUB_FORMATS, subExt, subMime, type SubDoc, type SubFormat } from '@/lib/b4/subtitles'
import { TopBar } from '@/lib/b4/ui'
import { splitAt, splitCount, joinTracks } from '@/lib/b14/subs'
import { CueList, readSubs, attempt, OpenButton } from '@/lib/b14/ui'

type Item = { f: File; d: SubDoc; offset: string }

export default function SubtitleSplitJoin() {
  const [tab, setTab] = useState<'split' | 'join'>('split')
  return (
    <div className="space-y-4">
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'split', label: <span className="inline-flex items-center gap-1.5"><Scissors className="size-4" />Split</span> }, { value: 'join', label: <span className="inline-flex items-center gap-1.5"><Combine className="size-4" />Join</span> }]} />
      {tab === 'split' ? <Split /> : <Join />}
    </div>
  )
}

function Split() {
  const [file, setFile] = useState<File | null>(null)
  const [doc, setDoc] = useState<SubDoc | null>(null)
  const [mode, setMode] = useState<'time' | 'parts'>('time')
  const [times, setTimes] = useState('00:45:00')
  const [parts, setParts] = useState(2)
  const [rebase, setRebase] = useState(true)
  const [out, setOut] = useState<SubFormat>('srt')
  const open = async (f: File) => { const d = await attempt(() => readSubs(f), 'Could not read this subtitle file.'); if (d) { setFile(f); setDoc(d); setOut(d.format === 'txt' ? 'srt' : d.format) } }
  const pieces = useMemo(() => {
    if (!doc) return []
    if (mode === 'parts') return splitCount(doc.cues, parts, rebase)
    const ts = times.split(/[,;\n]+/).map((s) => parseClock(s.trim())).filter((n) => Number.isFinite(n) && n > 0)
    return splitAt(doc.cues, ts, rebase)
  }, [doc, mode, times, parts, rebase])
  if (!file || !doc) return <Dropzone accept={SUB_ACCEPT} onFiles={(f) => open(f[0])} label="Drop a subtitle file to split" sub="Cut one file at times you choose, or into equal parts, for split movies (CD1, CD2) or clips." />
  const save = async () => {
    const files = pieces.map((p, i) => ({ name: `${baseName(file.name)}-part${i + 1}.${subExt(out)}`, data: writeSubtitles(p, out, { assHeader: doc.assHeader }) }))
    if (files.length === 1) downloadBlob(new Blob([files[0].data], { type: subMime(out) }), files[0].name)
    else downloadBlob(await zipFiles(files), `${baseName(file.name)}-parts.zip`)
  }
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => { setFile(null); setDoc(null) }} />
        <div className="grid gap-3 md:grid-cols-2">{pieces.map((p, i) => <div key={i}><Label hint={`${p.length} lines${p.length ? `, ${fmtClock(p[0].start, '.')} to ${fmtClock(p[p.length - 1].end, '.')}` : ''}`}>Part {i + 1}</Label><CueList cues={p} className="max-h-60" max={60} /></div>)}</div>
      </>}
      side={<>
        <Field label="Split by"><Segmented value={mode} onChange={setMode} options={[{ value: 'time', label: 'At times' }, { value: 'parts', label: 'Equal parts' }]} /></Field>
        {mode === 'time' ? <Field label="Cut times (comma separated)" hint="hh:mm:ss"><Input value={times} onChange={(e) => setTimes(e.target.value)} className="font-mono" /></Field>
          : <Field label="Number of parts"><Input type="number" min={2} max={50} value={parts} onChange={(e) => setParts(Math.min(50, Math.max(2, Math.round(+e.target.value || 2))))} /></Field>}
        <Switch checked={rebase} onChange={setRebase} label="Each part starts at 00:00:00" />
        <Field label="Save as"><Select value={out} onChange={setOut} options={SUB_FORMATS.map((f) => ({ value: f.id, label: f.label }))} /></Field>
        <Button className="w-full" icon={<Download className="size-4" />} onClick={save}>Download {pieces.length} parts</Button>
      </>}
    />
  )
}

function Join() {
  const [items, setItems] = useState<Item[]>([])
  const [gap, setGap] = useState(1)
  const [out, setOut] = useState<SubFormat>('srt')
  const add = async (fs: File[]) => { const next: Item[] = []; for (const f of fs) { const d = await attempt(() => readSubs(f), `Could not read ${f.name}`); if (d) next.push({ f, d, offset: '' }) } setItems((p) => [...p, ...next].sort((a, b) => a.f.name.localeCompare(b.f.name, undefined, { numeric: true }))) }
  const joined = useMemo(() => joinTracks(items.map((i) => i.d.cues), items.map((i) => { const v = i.offset.trim(); if (!v) return null; const n = parseClock(v); return Number.isFinite(n) ? n : null }), gap), [items, gap])
  const move = (i: number, d: number) => setItems((p) => { const n = [...p]; const j = i + d; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j], n[i]]; return n })
  if (!items.length) return <Dropzone multiple accept={SUB_ACCEPT} onFiles={add} label="Drop two or more subtitle files to join" sub="For example part1.srt and part2.srt. Each file can start at a time you set, or right after the previous one." />
  return (
    <ToolGrid
      main={<>
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">{i + 1}. {it.f.name} <span className="text-xs text-muted">({it.d.cues.length} lines)</span></span>
              <Input aria-label={`Start time of ${it.f.name}`} placeholder={i === 0 ? '00:00:00' : 'auto'} value={it.offset} onChange={(e) => setItems((p) => p.map((x, k) => (k === i ? { ...x, offset: e.target.value } : x)))} className="h-8 w-32 font-mono text-xs" />
              <Button size="sm" variant="ghost" aria-label="Move up" onClick={() => move(i, -1)}><ArrowUp className="size-4" /></Button>
              <Button size="sm" variant="ghost" aria-label="Move down" onClick={() => move(i, 1)}><ArrowDown className="size-4" /></Button>
              <Button size="sm" variant="ghost" aria-label="Remove" onClick={() => setItems((p) => p.filter((_, k) => k !== i))}><X className="size-4" /></Button>
            </div>
          ))}
          <OpenButton multiple accept={SUB_ACCEPT} onFiles={add} label="Add files" />
        </div>
        <Label hint={`${joined.length} lines`}>Joined preview</Label>
        <CueList cues={joined} />
      </>}
      side={<>
        <p className="text-xs text-muted">Leave a start time empty to place the file right after the previous file's last line. For movie parts, type the exact time the second part starts in the full video.</p>
        <Field label="Gap after previous file (seconds)"><Input type="number" min={0} step={0.5} value={gap} onChange={(e) => setGap(Math.max(0, +e.target.value || 0))} /></Field>
        <Field label="Save as"><Select value={out} onChange={setOut} options={SUB_FORMATS.map((f) => ({ value: f.id, label: f.label }))} /></Field>
        <Button className="w-full" icon={<Download className="size-4" />} disabled={items.length < 2} onClick={() => downloadBlob(new Blob([writeSubtitles(joined, out, { assHeader: items[0].d.assHeader })], { type: subMime(out) }), `${baseName(items[0].f.name)}-joined.${subExt(out)}`)}>Download joined file</Button>
        <Button variant="ghost" className="w-full" onClick={() => setItems([])}>Start over</Button>
      </>}
    />
  )
}
