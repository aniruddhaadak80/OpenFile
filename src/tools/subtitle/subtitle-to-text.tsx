import { useMemo, useState } from 'react'
import { FileText } from 'lucide-react'
import { Dropzone, Field, Input, Segmented, Switch, ToolGrid, CopyButton } from '@/components/ui'
import { baseName } from '@/lib/files'
import { SUB_ACCEPT, type SubDoc } from '@/lib/b4/subtitles'
import { TopBar } from '@/lib/b4/ui'
import { transcript } from '@/lib/b14/subs'
import { readSubs, attempt } from '@/lib/b14/ui'
import { DlButton } from '@/lib/bcat/kit'

export default function SubtitleToText() {
  const [file, setFile] = useState<File | null>(null)
  const [doc, setDoc] = useState<SubDoc | null>(null)
  const [stamps, setStamps] = useState<'none' | 'paragraph' | 'line'>('paragraph')
  const [gap, setGap] = useState(2)
  const [join, setJoin] = useState(true)
  const [md, setMd] = useState(false)
  const open = async (f: File) => { const d = await attempt(() => readSubs(f), 'Could not read this subtitle file.'); if (d) { setFile(f); setDoc(d) } }
  const text = useMemo(() => (doc ? transcript(doc.cues, { gap, stamps, joinLines: join, markdown: md }) : ''), [doc, gap, stamps, join, md])
  if (!file || !doc) return <Dropzone accept={SUB_ACCEPT} onFiles={(f) => open(f[0])} label="Drop a subtitle file" sub="Turn SRT, VTT, ASS or YouTube captions into a clean transcript you can read, quote or paste into notes." />
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => { setFile(null); setDoc(null) }} />
        <pre className="scrollbar-thin max-h-[560px] min-h-60 overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-border bg-surface p-4 text-sm leading-6">{text}</pre>
        <p className="text-xs text-muted">{words.toLocaleString()} words from {doc.cues.length} subtitle lines. Repeated rolling caption lines are removed.</p>
      </>}
      side={<>
        <Field label="Timestamps"><Segmented value={stamps} onChange={setStamps} options={[{ value: 'none', label: 'None' }, { value: 'paragraph', label: 'Per paragraph' }, { value: 'line', label: 'Every line' }]} /></Field>
        {stamps !== 'line' && <Field label="New paragraph after a pause of (seconds)"><Input type="number" min={0.2} step={0.5} value={gap} onChange={(e) => setGap(Math.max(0.2, +e.target.value || 2))} /></Field>}
        {stamps !== 'line' && <Switch checked={join} onChange={setJoin} label="Join lines into sentences" />}
        <Switch checked={md} onChange={setMd} label="Markdown (bold timestamps)" />
        <div className="flex flex-wrap gap-2">
          <CopyButton text={text} />
          <DlButton name={`${baseName(file.name)}-transcript.${md ? 'md' : 'txt'}`} mime={md ? 'text/markdown' : 'text/plain'} data={() => text}>Download</DlButton>
        </div>
        <p className="flex gap-1.5 text-xs text-muted"><FileText className="size-4 shrink-0" />Tags like italics and positions are removed.</p>
      </>}
    />
  )
}
