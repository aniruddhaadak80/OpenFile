import { useMemo, useState } from 'react'
import { Hash, Sparkles } from 'lucide-react'
import { Button, Card, CopyButton, Label, Segmented, Select, Slider, Textarea } from '@/components/ui'
import { useVision, EnginePanel, VisionProgress } from '@/lib/bcat/aiui'
import { VMODELS } from '@/lib/bcat/vision'
import { dot } from '@/lib/bcat/quick'
import { candidatePhrases, existingTags, PLATFORM_TAG_LIMITS, toTag, topicGuess, TOPIC_TAGS } from '@/lib/cf/creator'

const SAMPLE = 'Spent the weekend hiking in the Western Ghats during the monsoon. Misty trails, waterfalls everywhere and the best roadside chai after a long climb. Packing tips and the full route are in the next post.'
interface Tag { tag: string; score: number; kind: 'from your text' | 'broad reach' }

export default function HashtagGenerator() {
  const ai = useVision(VMODELS.embed, { quick: true })
  const [text, setText] = useState(SAMPLE)
  const [platform, setPlatform] = useState('instagram')
  const [style, setStyle] = useState<'pascal' | 'lower' | 'camel'>('pascal')
  const [count, setCount] = useState(8)
  const [tags, setTags] = useState<Tag[] | null>(null)
  const [off, setOff] = useState<Set<string>>(new Set())
  const lim = PLATFORM_TAG_LIMITS[platform]

  const go = () => ai.run(async () => {
    if (text.trim().split(/\s+/).length < 3) throw new Error('Write a few words about your post first.')
    const cands = candidatePhrases(text, 30)
    const reach = Object.values(TOPIC_TAGS).flat()
    let out: Tag[]
    if (ai.engine === 'ai') {
      ai.setStatus('Reading your post')
      const inputs = [text, ...cands.map((c) => c.phrase), ...reach]
      const vecs = await ai.infer<number[][]>(inputs, {}, { onProgress: (d, t) => { ai.setProgress(d / t); ai.setStatus(`Comparing tags ${d} of ${t}`) } })
      const tv = vecs[0]
      const own = cands.map((c, i) => ({ tag: c.phrase, score: dot(tv, vecs[1 + i]) * 0.8 + Math.min(1, c.score / 4) * 0.2, kind: 'from your text' as const }))
      const broad = reach.map((r, i) => ({ tag: r, score: dot(tv, vecs[1 + cands.length + i]), kind: 'broad reach' as const }))
      out = [...own.sort((a, b) => b.score - a.score).slice(0, 12), ...broad.sort((a, b) => b.score - a.score).slice(0, 12)]
    } else {
      const topics = topicGuess(text).filter((t) => t.score > 0).slice(0, 2)
      out = [...cands.slice(0, 12).map((c) => ({ tag: c.phrase, score: c.score, kind: 'from your text' as const })), ...topics.flatMap((t) => TOPIC_TAGS[t.topic].map((r, i) => ({ tag: r, score: t.score - i * 0.1, kind: 'broad reach' as const })))]
    }
    const seen = new Set<string>(), have = new Set(existingTags(text))
    setTags(out.filter((t) => { const k = toTag(t.tag, 'lower'); if (seen.has(k) || have.has(k) || k.length < 3) return false; seen.add(k); return true }))
    setOff(new Set())
  })

  const picked = useMemo(() => {
    if (!tags) return []
    const own = tags.filter((t) => t.kind === 'from your text'), broad = tags.filter((t) => t.kind === 'broad reach')
    const nOwn = Math.ceil(count * 0.6), mix = [...own.slice(0, nOwn), ...broad.slice(0, count - Math.min(nOwn, own.length))]
    return mix.filter((t) => !off.has(t.tag)).slice(0, count).map((t) => toTag(t.tag, style))
  }, [tags, count, off, style])
  const line = picked.join(' ')
  const over = picked.length > lim.max

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <div><Label>Your caption, script or video description</Label><Textarea aria-label="Your caption, script or video description" value={text} onChange={(e) => setText(e.target.value)} className="min-h-40 font-sans text-sm" /></div>
        <VisionProgress ai={ai} />
        {tags && <Card className="space-y-4">
          <div className="flex flex-wrap items-center gap-2"><div className="mr-auto font-semibold">{picked.length} hashtags</div><CopyButton text={line} label="Copy tags" /><CopyButton text={text.trim() + '\n\n' + line} label="Copy caption with tags" /></div>
          <p className="rounded-xl bg-surface-2/60 p-3 font-mono text-sm break-words">{line || 'No tags picked.'}</p>
          {over && <p className="text-sm text-warn">{lim.label} allows {lim.max}. Remove {picked.length - lim.max}.</p>}
          {(['from your text', 'broad reach'] as const).map((k) => <div key={k}><div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">{k === 'from your text' ? 'Specific (from your words)' : 'Broad reach'}</div>
            <div className="flex flex-wrap gap-1.5">{tags.filter((t) => t.kind === k).map((t) => <button key={t.tag} aria-pressed={!off.has(t.tag)} onClick={() => setOff((o) => { const n = new Set(o); n.has(t.tag) ? n.delete(t.tag) : n.add(t.tag); return n })} className={`rounded-full border px-2.5 py-1 font-mono text-xs cursor-pointer ${off.has(t.tag) ? 'border-border text-muted line-through' : 'border-accent/60 text-fg'}`}>{toTag(t.tag, style)}</button>)}</div></div>)}
          <p className="text-xs text-muted">Tap a tag to leave it out. Specific tags help the right people find you, broad ones bring reach but more competition.</p>
        </Card>}
      </div>
      <Card className="space-y-4 self-start">
        <EnginePanel ai={ai} quickLabel="Word list" quickNote="Word list mode picks tags from your most used words and a built-in topic list. Instant and needs no download." />
        <div><Label>Platform</Label><Select value={platform} onChange={(v) => { setPlatform(v); setCount(Math.min(PLATFORM_TAG_LIMITS[v].max, Math.max(PLATFORM_TAG_LIMITS[v].best, 3))) }} options={Object.entries(PLATFORM_TAG_LIMITS).map(([k, v]) => ({ value: k, label: v.label }))} /><p className="mt-1 text-xs text-muted">{lim.note}</p></div>
        <Slider label="How many" value={count} onChange={setCount} min={1} max={Math.min(30, lim.max)} />
        <div><Label>Style</Label><Segmented value={style} onChange={setStyle} options={[{ value: 'pascal', label: '#HikingTips' }, { value: 'lower', label: '#hikingtips' }, { value: 'camel', label: '#hikingTips' }]} /></div>
        <p className="text-xs text-muted">Capitalised words are easier to read and work better with screen readers.</p>
        <Button className="w-full" icon={ai.engine === 'ai' ? <Sparkles className="size-4" /> : <Hash className="size-4" />} loading={ai.busy} onClick={go}>Suggest hashtags</Button>
      </Card>
    </div>
  )
}
