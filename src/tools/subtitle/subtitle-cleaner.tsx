import { useMemo, useState } from 'react'
import { Sparkles, Download } from 'lucide-react'
import { Button, Dropzone, Field, Input, Select, Switch, ToolGrid, Label } from '@/components/ui'
import { baseName, downloadBlob } from '@/lib/files'
import { writeSubtitles, SUB_ACCEPT, SUB_FORMATS, subExt, subMime, type SubDoc, type SubFormat } from '@/lib/b4/subtitles'
import { TopBar } from '@/lib/b4/ui'
import { cleanCues, CLEAN_DEFAULTS, type CleanOpts } from '@/lib/b14/subs'
import { CueList, readSubs, attempt, Tile } from '@/lib/b14/ui'

export default function SubtitleCleaner() {
  const [file, setFile] = useState<File | null>(null)
  const [doc, setDoc] = useState<SubDoc | null>(null)
  const [o, setO] = useState<CleanOpts>(CLEAN_DEFAULTS)
  const [out, setOut] = useState<SubFormat>('srt')
  const set = <K extends keyof CleanOpts>(k: K, v: CleanOpts[K]) => setO((p) => ({ ...p, [k]: v }))
  const open = async (f: File) => { const d = await attempt(() => readSubs(f), 'Could not read this subtitle file.'); if (d) { setFile(f); setDoc(d); setOut(d.format === 'txt' ? 'srt' : d.format) } }
  const res = useMemo(() => (doc ? cleanCues(doc.cues, o) : null), [doc, o])
  if (!file || !doc || !res) return <Dropzone accept={SUB_ACCEPT} onFiles={(f) => open(f[0])} label="Drop a subtitle file to clean" sub="SRT, VTT, ASS, SBV, SUB, LRC, TTML. Removes [sound] tags, speaker names and music lines, and fixes timing." />
  const r = res.report
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => { setFile(null); setDoc(null) }} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Lines" value={`${res.cues.length}`} sub={`was ${doc.cues.length}`} />
          <Tile label="Tags removed" value={r.hi} sub={`${r.speakers} speaker names`} />
          <Tile label="Timing fixes" value={r.overlaps + r.extended} sub={`${r.overlaps} overlaps, ${r.extended} too short`} />
          <Tile label="Merged / rewrapped" value={r.merged + r.rewrapped} sub={`${r.music} music lines dropped`} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div><Label>Before</Label><CueList cues={doc.cues} /></div>
          <div><Label>After</Label><CueList cues={res.cues} /></div>
        </div>
      </>}
      side={<>
        <Label>Remove</Label>
        <div className="space-y-2">
          <Switch checked={o.hearingImpaired} onChange={(v) => set('hearingImpaired', v)} label="Sound tags like [door slams] (laughs)" />
          <Switch checked={o.speakers} onChange={(v) => set('speakers', v)} label="Speaker names like JOHN:" />
          <Switch checked={o.music} onChange={(v) => set('music', v)} label="Music only lines (♪)" />
          <Switch checked={o.tags} onChange={(v) => set('tags', v)} label="Formatting tags (<i>, {\an8})" />
          <Switch checked={o.dashes} onChange={(v) => set('dashes', v)} label="Leading dash on single lines" />
          <Switch checked={o.dedupe} onChange={(v) => set('dedupe', v)} label="Repeated lines in a row" />
        </div>
        <Label>Fix</Label>
        <div className="space-y-2">
          <Switch checked={o.caps} onChange={(v) => set('caps', v)} label="ALL CAPS lines to normal case" />
          <Switch checked={o.fixOverlap} onChange={(v) => set('fixOverlap', v)} label="Overlapping times" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min seconds"><Input type="number" step={0.1} min={0} value={o.minDuration} onChange={(e) => set('minDuration', Math.max(0, +e.target.value || 0))} /></Field>
            <Field label="Max line length"><Input type="number" min={0} value={o.maxLine} onChange={(e) => set('maxLine', Math.max(0, Math.round(+e.target.value || 0)))} /></Field>
          </div>
        </div>
        <Field label="Save as"><Select value={out} onChange={setOut} options={SUB_FORMATS.map((f) => ({ value: f.id, label: f.label }))} /></Field>
        <Button className="w-full" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([writeSubtitles(res.cues, out, { assHeader: doc.assHeader })], { type: subMime(out) }), `${baseName(file.name)}-clean.${subExt(out)}`)}>Download clean file</Button>
        <p className="flex gap-1.5 text-xs text-muted"><Sparkles className="size-4 shrink-0" />Set max line length to 0 to keep the original line breaks.</p>
      </>}
    />
  )
}
