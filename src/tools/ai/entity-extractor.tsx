import { useMemo, useState } from 'react'
import { ScanText } from 'lucide-react'
import { Button, Label, ToolGrid, Switch, CopyButton } from '@/components/ui'
import { chunkText } from '@/lib/b4/ai'
import { VMODELS } from '@/lib/bcat/vision'
import { useVision, EnginePanel, VisionProgress } from '@/lib/bcat/aiui'
import { mergeNer, nerName, ruleEntities, type Entity } from '@/lib/bcat/quick'
import { useTextInput, TextInput } from '@/lib/bcat/textin'
import { toCsv, DlButton, Pill, pal } from '@/lib/bcat/kit'

const SAMPLE = `On 12 March 2026 Priya Sharma from Tata Consultancy Services met Daniel Weber in Berlin to sign a deal worth €2,500,000.
Contact the team at partners@example.com or +91 98765 43210. Details: https://example.com/deal (up 14% on last year).`

export default function EntityExtractor() {
  const s = useTextInput(SAMPLE, 'whole')
  const [ents, setEnts] = useState<(Entity & { n: number })[] | null>(null)
  const [rules, setRules] = useState(true)
  const [off, setOff] = useState<Set<string>>(new Set())
  const ai = useVision(VMODELS.ner, { quick: true })

  const go = () => ai.run(async () => {
    const text = s.items.join('\n\n')
    if (!text.trim()) throw new Error('Type or open some text first.')
    let found: Entity[] = []
    if (ai.engine === 'ai') {
      const chunks = chunkText(text, 1200)
      const r = await ai.infer<any[][]>(chunks)
      found = r.flatMap((t) => mergeNer(t)).map((e) => ({ ...e, type: nerName(e.type) })).filter((e) => e.text.length > 1 && (e.score ?? 1) > 0.6)
    }
    if (rules || ai.engine === 'quick') found.push(...ruleEntities(text).filter((e) => ai.engine === 'quick' || e.type !== 'Name'))
    const map = new Map<string, Entity & { n: number }>()
    for (const e of found) { const k = e.type + '|' + e.text.toLowerCase(); const m = map.get(k); if (m) m.n++; else map.set(k, { ...e, n: 1 }) }
    setEnts([...map.values()].sort((a, b) => a.type.localeCompare(b.type) || b.n - a.n))
  })

  const types = useMemo(() => [...new Set((ents ?? []).map((e) => e.type))], [ents])
  const shown = (ents ?? []).filter((e) => !off.has(e.type))
  const color = (t: string) => pal(types.indexOf(t))

  return (
    <ToolGrid
      main={
        <div className="space-y-4">
          <TextInput s={s} splits={['whole']} placeholder="Paste an article, email or contract" />
          {ents && (
            <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap gap-1.5">{types.map((t) => <Pill key={t} color={color(t)} active={!off.has(t)} onClick={() => setOff((p) => { const n = new Set(p); if (n.has(t)) n.delete(t); else n.add(t); return n })}>{t} {ents.filter((e) => e.type === t).length}</Pill>)}</div>
              {types.filter((t) => !off.has(t)).map((t) => (
                <div key={t}><Label>{t}</Label>
                  <div className="flex flex-wrap gap-1.5">{shown.filter((e) => e.type === t).map((e) => <span key={e.text} className="rounded-lg border px-2 py-1 text-sm" style={{ borderColor: color(t) }}>{e.text}{e.n > 1 && <span className="ml-1 text-xs text-muted">×{e.n}</span>}</span>)}</div>
                </div>
              ))}
              {!ents.length && <p className="text-sm text-muted">Nothing found.</p>}
            </div>
          )}
        </div>
      }
      side={
        <>
          <EnginePanel ai={ai} quickLabel="Patterns only" quickNote="Patterns only finds emails, links, dates, money, phone numbers, percentages and capitalised names with rules. Instant, no download." />
          {ai.engine === 'ai' && <Switch checked={rules} onChange={setRules} label="Also find emails, links, dates, money and phones" />}
          <VisionProgress ai={ai} />
          <Button className="w-full" icon={<ScanText className="size-4" />} loading={ai.busy} onClick={go}>Find names and details</Button>
          {ents && ents.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <CopyButton text={() => shown.map((e) => `${e.type}: ${e.text}`).join('\n')} />
              <DlButton name="entities.csv" mime="text/csv" data={() => toCsv([['type', 'text', 'count', 'confidence'], ...shown.map((e) => [e.type, e.text, e.n, e.score != null ? e.score.toFixed(3) : ''])])}>CSV</DlButton>
              <DlButton name="entities.json" mime="application/json" data={() => JSON.stringify(shown.map(({ type, text, n, score }) => ({ type, text, count: n, score })), null, 2)}>JSON</DlButton>
            </div>
          )}
          <p className="text-xs text-muted">The AI model finds people, places, organisations and other names in English text.</p>
        </>
      }
    />
  )
}
