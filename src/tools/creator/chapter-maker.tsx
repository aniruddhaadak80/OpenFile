import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button, Input, Label, Textarea, ToolGrid, Tabs, CopyButton } from '@/components/ui'
import { parseChapters, checkYouTube, toYouTube, toVtt, toFfmetadata, toPodcastJson, fmtChapterTime, parseTime, type Chapter } from '@/lib/bcat/creator'
import { DlButton } from '@/lib/bcat/kit'

const SAMPLE = `0:00 Intro
0:45 What we are building
3:10 Setting up the project
9:52 The tricky part
15:30 Testing on a phone
21:04 Wrap up`

export default function ChapterMaker() {
  const [text, setText] = useState(SAMPLE)
  const [dur, setDur] = useState('25:00')
  const [tab, setTab] = useState<'youtube' | 'vtt' | 'ff' | 'json'>('youtube')
  const chapters = useMemo(() => parseChapters(text), [text])
  const issues = checkYouTube(chapters)
  const total = parseTime(dur) || (chapters.at(-1)?.start ?? 0) + 60
  const outs = { youtube: toYouTube(chapters), vtt: toVtt(chapters, total), ff: toFfmetadata(chapters, total), json: toPodcastJson(chapters) }
  const files = { youtube: ['chapters.txt', 'text/plain'], vtt: ['chapters.vtt', 'text/vtt'], ff: ['chapters.ffmetadata', 'text/plain'], json: ['chapters.json', 'application/json'] } as const
  const set = (cs: Chapter[]) => setText(toYouTube(cs))

  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <Label>Chapters (paste from notes, a description, SRT or VTT)</Label>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-40 font-mono text-sm" aria-label="Chapters" />
          <div className="overflow-hidden rounded-2xl border border-border">
            {chapters.map((c, i) => {
              const end = chapters[i + 1]?.start ?? total
              return (
                <div key={i} className="flex items-center gap-2 border-b border-border px-3 py-1.5 last:border-0">
                  <Input key={`${i}-${c.start}`} defaultValue={fmtChapterTime(c.start)} onBlur={(e) => { const t = parseTime(e.target.value); if (isFinite(t) && t !== c.start) set(chapters.map((x, j) => (j === i ? { ...x, start: t } : x))) }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} className="h-8 w-20 font-mono text-xs" aria-label="Start time" />
                  <Input value={c.title} onChange={(e) => set(chapters.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} className="h-8 text-sm" aria-label="Title" />
                  <span className="w-14 shrink-0 text-right font-mono text-[11px] text-muted">{fmtChapterTime(Math.max(0, end - c.start))}</span>
                  <Button variant="ghost" size="sm" aria-label="Remove" onClick={() => set(chapters.filter((_, j) => j !== i))} icon={<Trash2 className="size-3.5" />} />
                </div>
              )
            })}
          </div>
          <Button variant="outline" size="sm" icon={<Plus className="size-4" />} onClick={() => set([...chapters, { start: (chapters.at(-1)?.start ?? -60) + 60, title: 'New chapter' }])}>Add chapter</Button>
          {total > 0 && chapters.length > 0 && <div className="flex h-6 overflow-hidden rounded-lg" aria-hidden>{chapters.map((c, i) => <span key={i} title={c.title} className="border-r border-bg" style={{ width: `${(((chapters[i + 1]?.start ?? total) - c.start) / total) * 100}%`, background: ['#F5A524', '#14B8A6', '#22D3EE', '#10B981', '#38BDF8', '#F97316', '#84CC16'][i % 7] }} />)}</div>}
        </div>
      }
      side={
        <>
          <div><Label>Video length</Label><Input value={dur} onChange={(e) => setDur(e.target.value)} className="font-mono" placeholder="25:00" /></div>
          <div className="rounded-xl border border-border bg-surface-2/50 p-3 text-xs">
            {issues.length ? <><p className="mb-1 font-semibold text-warn">YouTube will not show these chapters yet:</p><ul className="list-disc space-y-0.5 pl-4">{issues.map((x) => <li key={x}>{x}</li>)}</ul></> : <p className="font-semibold text-success">Ready for YouTube: starts at 0:00, at least 3 chapters, each 10 seconds or longer.</p>}
          </div>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'youtube', label: 'YouTube' }, { value: 'vtt', label: 'WebVTT' }, { value: 'ff', label: 'FFmpeg' }, { value: 'json', label: 'Podcast' }]} />
          <Textarea readOnly value={outs[tab]} className="min-h-40 text-[11px]" aria-label="Output" />
          <div className="flex gap-2"><CopyButton text={outs[tab]} /><DlButton name={files[tab][0]} mime={files[tab][1]} data={() => outs[tab]}>Download</DlButton></div>
          <p className="text-xs text-muted">WebVTT chapters work with HTML5 players. The FFmpeg file adds chapters to MP4 or MKV with -i chapters.ffmetadata -map_metadata 1. Podcast JSON follows the Podcasting 2.0 chapters format.</p>
        </>
      }
    />
  )
}
