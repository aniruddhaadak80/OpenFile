import { useMemo, useState } from 'react'
import { CopyMinus } from 'lucide-react'
import { Button, Dropzone, Field, Segmented, Slider, Textarea, ToolGrid, Label } from '@/components/ui'
import { useVision, EnginePanel, VisionProgress } from '@/lib/bcat/aiui'
import { VMODELS } from '@/lib/bcat/vision'
import { shingles, jaccard, cosineSim, clusterPairs, splitItems, withCpuFallback } from '@/lib/b14/ai'
import { visionRun } from '@/lib/bcat/vision'
import { DlButton, toCsv } from '@/lib/bcat/kit'
import { Tile } from '@/lib/b14/ui'

const SAMPLE = `How do I reset my password?
I forgot my password, how can I reset it?
Where can I download my invoice?
How can I get a copy of my invoice?
Can I change the email on my account?
How do I reset my password
What payment methods do you accept?
Do you take PayPal or credit cards?`

export default function NearDuplicateText() {
  const [text, setText] = useState(SAMPLE)
  const [by, setBy] = useState<'line' | 'paragraph' | 'sentence'>('line')
  const [min, setMin] = useState(80)
  const [result, setResult] = useState<{ items: string[]; groups: number[][]; score: (i: number, j: number) => number } | null>(null)
  const ai = useVision(VMODELS.embed, { quick: true })
  const items = useMemo(() => splitItems(text, by), [text, by])
  const go = () => ai.run(async () => {
    setResult(null)
    if (items.length < 2) throw new Error('Add at least two items to compare.')
    if (items.length > 5000) throw new Error('Up to 5,000 items at a time.')
    let score: (i: number, j: number) => number
    if (ai.engine === 'quick') { const sets = items.map((x) => shingles(x, 2)); score = (i, j) => jaccard(sets[i], sets[j]); ai.setStatus('Comparing word overlap') }
    else {
      const vecs = await withCpuFallback(ai.device, (d) => visionRun<number[][]>(VMODELS.embed, d, items, {}, { onLoad: (l, t) => ai.setStatus(`Downloading model ${Math.round((l / Math.max(1, t)) * 100)}%`), onReady: () => ai.setStatus('Reading meaning'), onProgress: (dn, t) => { ai.setProgress(dn / t); ai.setStatus(`Embedding ${dn} of ${t}`) } }), (m) => ai.setStatus(m))
      score = (i, j) => cosineSim(vecs[i], vecs[j])
    }
    ai.setStatus('Grouping')
    await new Promise((r) => setTimeout(r, 0))
    const { groups } = clusterPairs(items.length, score, min / 100)
    setResult({ items, groups, score })
  })
  const dupIdx = new Set(result?.groups.flatMap((g) => g.slice(1)) ?? [])
  const kept = result ? result.items.filter((_, i) => !dupIdx.has(i)) : []
  return (
    <ToolGrid
      main={<>
        <Dropzone compact accept=".txt,.csv,.md" onFiles={async (f) => setText(await f[0].text())} label="Open a text file" sub="Or paste below" />
        <Textarea value={text} onChange={(e) => { setText(e.target.value); setResult(null) }} className="min-h-48 text-sm" aria-label="Text to check" />
        <VisionProgress ai={ai} />
        {result && <>
          <div className="grid grid-cols-3 gap-2"><Tile label="Items" value={result.items.length} /><Tile label="Groups of near duplicates" value={result.groups.length} /><Tile label="Left after removing" value={kept.length} /></div>
          {result.groups.map((g, k) => <div key={k} className="space-y-1 rounded-xl border border-border bg-surface p-3"><Label hint={`${g.length} items`}>Group {k + 1}</Label>{g.map((i, n) => <div key={i} className="flex gap-2 text-sm"><span className={n ? 'text-muted line-through decoration-warn/60' : 'font-medium'}>{result.items[i]}</span>{n > 0 && <span className="ml-auto shrink-0 font-mono text-xs text-muted">{Math.round(result.score(g[0], i) * 100)}%</span>}</div>)}</div>)}
          {!result.groups.length && <p className="text-sm text-success">No near duplicates at this similarity level.</p>}
        </>}
      </>}
      side={<>
        <EnginePanel ai={ai} quickLabel="Word overlap" quickNote="Word overlap needs no download and catches copies with small edits. The AI model also finds the same meaning in different words." />
        <Field label="Compare by"><Segmented value={by} onChange={(v) => { setBy(v); setResult(null) }} options={[{ value: 'line', label: 'Line' }, { value: 'paragraph', label: 'Paragraph' }, { value: 'sentence', label: 'Sentence' }]} /></Field>
        <Slider label="How similar" value={min} onChange={(v) => { setMin(v); setResult(null) }} min={50} max={99} suffix="%" />
        <Button className="w-full" size="lg" icon={<CopyMinus className="size-5" />} loading={ai.busy} onClick={go}>Find near duplicates ({items.length})</Button>
        {result && <><DlButton className="w-full" name="deduplicated.txt" data={() => kept.join(by === 'paragraph' ? '\n\n' : '\n') + '\n'}>Download without duplicates</DlButton><DlButton className="w-full" name="duplicate-groups.csv" mime="text/csv" data={() => toCsv([['group', 'keep', 'text'], ...result.groups.flatMap((g, k) => g.map((i, n) => [k + 1, n ? 'no' : 'yes', result.items[i]]))])}>Groups as CSV</DlButton></>}
      </>}
    />
  )
}
