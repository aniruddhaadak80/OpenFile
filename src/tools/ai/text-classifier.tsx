import { useState } from 'react'
import { Tags } from 'lucide-react'
import { Button, Input, Label, Switch, ToolGrid } from '@/components/ui'
import { VMODELS } from '@/lib/bcat/vision'
import { useVision, EnginePanel, VisionProgress } from '@/lib/bcat/aiui'
import { useTextInput, TextInput } from '@/lib/bcat/textin'
import { toCsv, DlButton, Bars, pal } from '@/lib/bcat/kit'

const SAMPLE = `My card was charged twice for the same order.
How do I change the email on my account?
The app crashes every time I upload a photo.
Do you ship to Canada?
I would like a refund for my last purchase.`
interface Res { labels: string[]; scores: number[] }

export default function TextClassifier() {
  const s = useTextInput(SAMPLE, 'lines')
  const [labels, setLabels] = useState('billing, account, bug report, shipping, refund')
  const [multi, setMulti] = useState(false)
  const [res, setRes] = useState<{ items: string[]; out: Res[] } | null>(null)
  const ai = useVision(VMODELS.zeroShot)
  const ls = labels.split(',').map((x) => x.trim()).filter(Boolean)

  const go = () => ai.run(async () => {
    if (ls.length < 2) throw new Error('Add at least two labels, separated by commas.')
    if (!s.items.length) throw new Error('Type or open some text first.')
    const out = await ai.infer<Res[]>(s.items, { labels: ls, multi })
    setRes({ items: s.items, out })
  })
  const totals = res ? ls.map((l) => ({ label: l, value: res.out.filter((o) => o.labels[0] === l).length })) : []

  return (
    <ToolGrid
      main={
        <div className="space-y-4">
          <TextInput s={s} placeholder="Paste messages, tickets or headlines, one per line" />
          {res && (
            <>
              <div className="rounded-2xl border border-border bg-surface p-4"><Label>Top label count</Label><Bars items={totals} /></div>
              <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {res.items.map((t, i) => (
                  <div key={i} className="space-y-1 px-3 py-2 text-sm">
                    <div>{t}</div>
                    <div className="flex flex-wrap gap-1">{res.out[i].labels.slice(0, multi ? 4 : 2).map((l, k) => <span key={l} className="rounded-full px-2 py-0.5 text-[11px] font-medium text-black" style={{ background: pal(ls.indexOf(l)), opacity: k ? 0.6 : 1 }}>{l} {Math.round(res.out[i].scores[k] * 100)}%</span>)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      }
      side={
        <>
          <EnginePanel ai={ai} />
          <div><Label hint={`${ls.length}`}>Your labels</Label><Input value={labels} onChange={(e) => setLabels(e.target.value)} aria-label="Labels" placeholder="sports, politics, tech" /></div>
          <Switch checked={multi} onChange={setMulti} label="Allow more than one label per item" />
          <VisionProgress ai={ai} />
          <Button className="w-full" icon={<Tags className="size-4" />} loading={ai.busy} onClick={go}>Sort {s.items.length} items</Button>
          {res && <DlButton className="w-full" name="classified.csv" mime="text/csv" data={() => toCsv([['text', 'label', 'score', ...(multi ? ['all labels'] : [])], ...res.items.map((t, i) => [t, res.out[i].labels[0], res.out[i].scores[0].toFixed(3), ...(multi ? [res.out[i].labels.map((l, k) => `${l} ${res.out[i].scores[k].toFixed(2)}`).join('; ')] : [])])])}>Download results (CSV)</DlButton>}
          <p className="text-xs text-muted">No training needed: the model checks how well each label describes each item. Clear, distinct labels work best.</p>
        </>
      }
    />
  )
}
