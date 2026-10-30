import { useMemo, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { Button, Field, Segmented, Slider, Textarea, ToolGrid, Label, cn } from '@/components/ui'
import { useVision, EnginePanel, VisionProgress } from '@/lib/bcat/aiui'
import { visionRun, type VModel } from '@/lib/bcat/vision'
import { splitItems, withCpuFallback } from '@/lib/b14/ai'
import { DlButton, toCsv } from '@/lib/bcat/kit'
import { Tile } from '@/lib/b14/ui'

const MODEL: VModel = { id: 'Xenova/toxic-bert', task: 'text-classification', label: 'Toxic BERT (English, 6 kinds of harm)', size: 'about 110 MB', dtype: { wasm: 'q8', webgpu: 'fp32' } }
const NICE: Record<string, string> = { toxic: 'Toxic', severe_toxic: 'Severe', obscene: 'Obscene', threat: 'Threat', insult: 'Insult', identity_hate: 'Identity hate' }
const SAMPLE = `Thanks for the quick reply, this fixed it.
Honestly this is the dumbest idea I have ever read, you clearly have no clue.
Could you share the steps you used?
If you post that again I will find you.
Great work on the new release, the docs are much clearer.`

export default function ToxicityChecker() {
  const [text, setText] = useState(SAMPLE)
  const [by, setBy] = useState<'line' | 'sentence' | 'paragraph'>('line')
  const [min, setMin] = useState(50)
  const [rows, setRows] = useState<{ text: string; scores: Record<string, number> }[] | null>(null)
  const ai = useVision(MODEL)
  const items = useMemo(() => splitItems(text, by), [text, by])
  const go = () => ai.run(async () => {
    setRows(null)
    if (!items.length) throw new Error('Paste some text to check.')
    const out = await withCpuFallback(ai.device, (d) => visionRun<any[]>(MODEL, d, items, { top_k: 6 }, { onLoad: (l, t) => ai.setStatus(`Downloading model ${Math.round((l / Math.max(1, t)) * 100)}%`), onReady: () => ai.setStatus('Reading'), onProgress: (dn, t) => { ai.setProgress(dn / t); ai.setStatus(`Checked ${dn} of ${t}`) } }), (m) => ai.setStatus(m))
    setRows(items.map((t, i) => ({ text: t, scores: Object.fromEntries((Array.isArray(out[i]) ? out[i] : [out[i]]).map((x: any) => [x.label, x.score])) })))
  })
  const flagged = rows?.filter((r) => Math.max(...Object.values(r.scores)) >= min / 100) ?? []
  return (
    <ToolGrid
      main={<>
        <Textarea value={text} onChange={(e) => { setText(e.target.value); setRows(null) }} className="min-h-44 text-sm" aria-label="Comments to check" />
        <VisionProgress ai={ai} />
        {rows && <>
          <div className="grid grid-cols-3 gap-2"><Tile label="Checked" value={rows.length} /><Tile label="Flagged" value={flagged.length} /><Tile label="Clean" value={rows.length - flagged.length} /></div>
          <div className="space-y-2">{rows.map((r, i) => { const top = Object.entries(r.scores).sort((a, b) => b[1] - a[1]); const bad = top[0]?.[1] >= min / 100; return (
            <div key={i} className={cn('rounded-xl border p-3', bad ? 'border-danger/40 bg-danger/5' : 'border-border bg-surface')}>
              <p className="text-sm">{r.text}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{top.filter(([, s]) => s >= 0.1).map(([l, s]) => <span key={l} className={cn('rounded-md px-1.5 py-0.5 text-[11px]', s >= min / 100 ? 'bg-danger/15 text-danger' : 'bg-surface-2 text-muted')}>{NICE[l] ?? l} {Math.round(s * 100)}%</span>)}{!top.some(([, s]) => s >= 0.1) && <span className="text-[11px] text-success">Looks fine</span>}</div>
            </div>) })}</div>
        </>}
      </>}
      side={<>
        <EnginePanel ai={ai} />
        <Field label="Check each"><Segmented value={by} onChange={(v) => { setBy(v); setRows(null) }} options={[{ value: 'line', label: 'Line' }, { value: 'sentence', label: 'Sentence' }, { value: 'paragraph', label: 'Paragraph' }]} /></Field>
        <Slider label="Flag above" value={min} onChange={setMin} min={10} max={95} suffix="%" />
        <Button className="w-full" size="lg" icon={<ShieldAlert className="size-5" />} loading={ai.busy} onClick={go}>Check {items.length} items</Button>
        {rows && <DlButton className="w-full" name="toxicity.csv" mime="text/csv" data={() => toCsv([['text', ...Object.keys(NICE)], ...rows.map((r) => [r.text, ...Object.keys(NICE).map((k) => (r.scores[k] ?? 0).toFixed(3))])])}>Download scores (CSV)</DlButton>}
        <p className="text-xs text-muted">For moderating comments, reviews or chat logs in English. The model can be wrong, so treat scores as a hint and have a person decide. Text never leaves your device.</p>
      </>}
    />
  )
}
