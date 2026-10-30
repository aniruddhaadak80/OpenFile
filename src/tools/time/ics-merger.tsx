import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { Button, Card, Dropzone, Input, Label, Segmented, Switch } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { blockStart, blockSummary, mergeIcs } from '@/lib/cf/time'
import { FileBar, Stat, Stats } from '@/lib/cf/ui'

export default function IcsMerger() {
  const [files, setFiles] = useState<{ name: string; size: number; text: string }[]>([])
  const [dedupe, setDedupe] = useState<'uid' | 'title-time' | 'none'>('uid'), [from, setFrom] = useState(''), [to, setTo] = useState(''), [kw, setKw] = useState(''), [prefix, setPrefix] = useState(false)
  const [r, setR] = useState<ReturnType<typeof mergeIcs> | null>(null)
  useEffect(() => { setR(files.length ? mergeIcs(files, { dedupe, from, to, keyword: kw, prefixSource: prefix }) : null) }, [files, dedupe, from, to, kw, prefix])
  const add = async (fs: File[]) => { const n = await Promise.all(fs.map(async (f) => ({ name: f.name, size: f.size, text: await f.text() }))); setFiles((o) => [...o, ...n]) }
  if (!files.length) return <Dropzone multiple accept=".ics,.ical,.ifb,text/calendar" onFiles={add} label="Drop two or more calendar files (.ics)" sub="Merge exports from Google, Outlook and Apple into one calendar, removing duplicates. Filter by dates or a word." />
  const fmt = (s: string) => { const m = s.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/); return m ? `${m[1]}-${m[2]}-${m[3]}${m[4] ? ` ${m[4]}:${m[5]}` : ''}` : s }
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-3">
        {files.map((f, i) => <FileBar key={i} name={f.name} size={f.size} onReset={() => setFiles(files.filter((_, k) => k !== i))} />)}
        <Dropzone compact multiple accept=".ics,.ical,text/calendar" onFiles={add} label="Add more calendars" />
        {r && <><Stats><Stat label="Events in result" value={r.count} tone="good" /><Stat label="Duplicates removed" value={r.dupes} /><Stat label="Filtered out" value={r.filtered} /></Stats>
          <Card className="max-h-96 divide-y divide-border overflow-auto p-0">{r.events.slice(0, 300).map((e, i) => <div key={i} className="grid grid-cols-[9rem_1fr_auto] gap-2 px-3 py-1.5 text-xs"><span className="font-mono text-muted">{fmt(blockStart(e.block))}</span><span className="truncate">{blockSummary(e.block)}</span><span className="truncate text-muted">{e.source}</span></div>)}</Card></>}
      </div>
      <Card className="space-y-4 self-start">
        <div><Label>Remove duplicates by</Label><Segmented value={dedupe} onChange={setDedupe} options={[{ value: 'uid', label: 'Event ID' }, { value: 'title-time', label: 'Title and time' }, { value: 'none', label: 'Keep all' }]} /></div>
        <div className="grid grid-cols-2 gap-2"><div><Label>From</Label><Input aria-label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div><div><Label>To</Label><Input aria-label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div></div>
        <div><Label>Only events containing</Label><Input aria-label="Only events containing" value={kw} onChange={(e) => setKw(e.target.value)} placeholder="any word" /></div>
        <Switch checked={prefix} onChange={setPrefix} label="Put the source file name in each title" />
        <Button className="w-full" icon={<Download className="size-4" />} disabled={!r?.count} onClick={() => downloadBlob(new Blob([r!.ics], { type: 'text/calendar' }), 'merged-calendar.ics')}>Download merged .ics</Button>
        <p className="text-xs text-muted">Repeating events are kept whole. Time zone definitions from every file are carried over.</p>
      </Card>
    </div>
  )
}
