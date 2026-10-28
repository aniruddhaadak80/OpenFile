import { useState } from 'react'
import { Smile } from 'lucide-react'
import { Button, ToolGrid, Empty, cn } from '@/components/ui'
import { VMODELS } from '@/lib/bcat/vision'
import { useVision, EnginePanel, VisionProgress } from '@/lib/bcat/aiui'
import { lexiconSentiment } from '@/lib/bcat/quick'
import { useTextInput, TextInput } from '@/lib/bcat/textin'
import { toCsv, DlButton } from '@/lib/bcat/kit'
import { Stat } from '@/tools/dev/_b5/shell'

const SAMPLE = `The checkout was quick and the support team was really helpful.
Delivery took three weeks and nobody answered my emails.
It is fine, does what it says.
I love the new design, much easier to use.
The app keeps crashing when I open the camera.`

interface Row { text: string; label: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'; score: number }
const COLORS = { POSITIVE: '#10B981', NEUTRAL: '#A3A3A3', NEGATIVE: '#F97316' }
const NAMES = { POSITIVE: 'Positive', NEUTRAL: 'Neutral', NEGATIVE: 'Negative' }

export default function SentimentAnalyzer() {
  const s = useTextInput(SAMPLE, 'lines')
  const [rows, setRows] = useState<Row[] | null>(null)
  const ai = useVision(VMODELS.sentiment, { quick: true })

  const go = () => ai.run(async () => {
    if (!s.items.length) throw new Error('Type or open some text first.')
    if (ai.engine === 'quick') { setRows(s.items.map((t) => { const r = lexiconSentiment(t); return { text: t, label: r.label as Row['label'], score: Math.abs(r.score) } })); return }
    const r = await ai.infer<{ label: string; score: number }[][]>(s.items, { top_k: 2 })
    setRows(s.items.map((t, i) => {
      const pos = r[i].find((x) => x.label === 'POSITIVE')?.score ?? 0
      const label: Row['label'] = pos > 0.65 ? 'POSITIVE' : pos < 0.35 ? 'NEGATIVE' : 'NEUTRAL'
      return { text: t, label, score: label === 'POSITIVE' ? pos : label === 'NEGATIVE' ? 1 - pos : 1 - Math.abs(pos - 0.5) * 2 }
    }))
  })

  const count = (l: Row['label']) => rows?.filter((r) => r.label === l).length ?? 0
  return (
    <ToolGrid
      main={
        <div className="space-y-4">
          <TextInput s={s} placeholder="Paste reviews, comments or messages, one per line" />
          {rows && (
            <>
              <div className="grid grid-cols-3 gap-2">{(['POSITIVE', 'NEUTRAL', 'NEGATIVE'] as const).map((l) => <Stat key={l} label={NAMES[l]} value={count(l)} sub={`${Math.round((count(l) / rows.length) * 100)}%`} />)}</div>
              <div className="flex h-3 overflow-hidden rounded-full" aria-hidden>{(['POSITIVE', 'NEUTRAL', 'NEGATIVE'] as const).map((l) => <span key={l} style={{ width: `${(count(l) / rows.length) * 100}%`, background: COLORS[l] }} />)}</div>
              <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-start gap-3 px-3 py-2 text-sm">
                    <span className={cn('mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-black')} style={{ background: COLORS[r.label] }}>{NAMES[r.label]}</span>
                    <span className="min-w-0 flex-1">{r.text}</span>
                    <span className="shrink-0 font-mono text-xs text-muted">{Math.round(r.score * 100)}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {!rows && !s.items.length && <Empty>Add some text to analyse.</Empty>}
        </div>
      }
      side={
        <>
          <EnginePanel ai={ai} quickLabel="Word list" quickNote="Word list mode scores known positive and negative words and handles simple negation like not good. Instant, no download, English only." />
          <VisionProgress ai={ai} />
          <Button className="w-full" icon={<Smile className="size-4" />} loading={ai.busy} onClick={go}>Analyse {s.items.length || ''} {s.items.length === 1 ? 'item' : 'items'}</Button>
          {rows && <DlButton className="w-full" name="sentiment.csv" mime="text/csv" data={() => toCsv([['text', 'sentiment', 'confidence'], ...rows.map((r) => [r.text, NAMES[r.label], r.score.toFixed(3)])])}>Download results (CSV)</DlButton>}
          <p className="text-xs text-muted">The AI model reads English best. A score near 50% between positive and negative is shown as neutral.</p>
        </>
      }
    />
  )
}
