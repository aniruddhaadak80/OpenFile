import { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button, Card, Input, Label, Textarea } from '@/components/ui'
import { useVision, EnginePanel, VisionProgress } from '@/lib/bcat/aiui'
import { VMODELS } from '@/lib/bcat/vision'
import { simMatrix, pca2, topPairs, cosine } from '@/lib/r15/llm'
import { Panel } from '@/lib/r15/ui'
import { DlButton, toCsv, pal } from '@/lib/bcat/kit'

const SAMPLE = `How do I reset my password?
I forgot my login details.
Where is my parcel?
My order has not arrived yet.
Can I pay with a credit card?
Which payment methods do you accept?
The app crashes when I open the camera.`

const heat = (s: number) => { const t = Math.max(0, Math.min(1, (s - 0.1) / 0.8)); return `rgba(245,165,36,${(0.08 + t * 0.85).toFixed(2)})` }
export default function EmbeddingPlayground() {
  const ai = useVision(VMODELS.embed)
  const [text, setText] = useState(SAMPLE), [q, setQ] = useState('package is late')
  const [res, setRes] = useState<{ texts: string[]; vecs: number[][] } | null>(null)
  const [hits, setHits] = useState<{ i: number; s: number }[] | null>(null)
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean)
  const go = () => ai.run(async () => {
    if (lines.length < 2) throw new Error('Add at least two lines of text, one per line.')
    if (lines.length > 300) throw new Error('Use 300 lines or fewer.')
    const vecs = await ai.infer<number[][]>(lines, {}, { onProgress: (d, t) => { ai.setProgress(d / t); ai.setStatus(`Embedding line ${d} of ${t}`) } })
    setRes({ texts: lines, vecs }); setHits(null)
  })
  const search = () => ai.run(async () => { if (!res || !q.trim()) return; const [v] = await ai.infer<number[][]>([q.trim()]); setHits(res.vecs.map((x, i) => ({ i, s: cosine(v, x) })).sort((a, b) => b.s - a.s).slice(0, 5)) })
  const m = useMemo(() => (res ? simMatrix(res.vecs) : null), [res])
  const pts = useMemo(() => (res ? pca2(res.vecs) : []), [res])
  const box = useMemo(() => { if (!pts.length) return null; const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } }, [pts])
  const n = res?.texts.length ?? 0
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        <div><Label hint={`${lines.length} lines`}>Sentences, one per line</Label><Textarea aria-label="Sentences, one per line" value={text} onChange={(e) => setText(e.target.value)} className="min-h-40 text-sm" /></div>
        <VisionProgress ai={ai} />
        {res && m && <>
          <Panel title="Most alike" hint="cosine similarity, 1 is the same meaning">
            <ul className="space-y-1 text-sm">{topPairs(res.texts, m, 5).map((p) => <li key={`${p.a}-${p.b}`} className="flex gap-3"><b className="w-12 shrink-0 font-mono">{p.s.toFixed(2)}</b><span className="min-w-0">{res.texts[p.a]} <span className="text-muted">and</span> {res.texts[p.b]}</span></li>)}</ul>
          </Panel>
          {n <= 40 && <Panel title="Similarity grid" hint="darker is closer">
            <div className="overflow-auto scrollbar-thin"><table className="border-separate border-spacing-0.5 text-[10px]"><thead><tr><th />{res.texts.map((_, j) => <th key={j} className="px-1 font-mono text-muted">{j + 1}</th>)}</tr></thead><tbody>{res.texts.map((t, i) => <tr key={i}><th className="max-w-[14rem] truncate pr-2 text-left font-normal" title={t}><span className="font-mono text-muted">{i + 1}</span> {t}</th>{m[i].map((s, j) => <td key={j} title={`${s.toFixed(3)}`} className="size-7 rounded text-center font-mono" style={{ background: heat(s) }}>{i === j ? '' : s.toFixed(2).slice(1)}</td>)}</tr>)}</tbody></table></div>
          </Panel>}
          {box && <Panel title="Meaning map" hint="the two main directions in the vectors (PCA); close dots mean close meaning">
            <svg viewBox="0 0 600 340" className="h-auto w-full" role="img" aria-label="2D map of sentence meanings">
              {pts.map((p, i) => { const x = 30 + ((p[0] - box.x0) / Math.max(1e-9, box.x1 - box.x0)) * 540, y = 20 + ((p[1] - box.y0) / Math.max(1e-9, box.y1 - box.y0)) * 300; return <g key={i}><circle cx={x} cy={y} r="6" fill={pal(i)} /><text x={x + 9} y={y + 4} fontSize="11" fill="currentColor">{res.texts[i].length > 34 ? res.texts[i].slice(0, 33) + '...' : res.texts[i]}</text></g> })}
            </svg>
          </Panel>}
          {hits && <Panel title={`Closest to "${q}"`}><ol className="space-y-1 text-sm">{hits.map((h) => <li key={h.i} className="flex gap-3"><b className="w-12 shrink-0 font-mono">{h.s.toFixed(2)}</b>{res.texts[h.i]}</li>)}</ol></Panel>}
        </>}
      </div>
      <Card className="space-y-4 self-start">
        <EnginePanel ai={ai} />
        <Button className="w-full" icon={<Sparkles className="size-4" />} loading={ai.busy} onClick={go}>Compare meanings</Button>
        {res && <div className="space-y-2"><Label>Search by meaning</Label><Input aria-label="Search by meaning" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} /><Button size="sm" variant="outline" className="w-full" disabled={ai.busy || !q.trim()} onClick={search}>Find closest lines</Button></div>}
        {res && m && <div className="grid gap-2">
          <DlButton name="similarity.csv" mime="text/csv" data={() => toCsv([['', ...res.texts], ...res.texts.map((t, i) => [t, ...m[i].map((s) => s.toFixed(4))])])}>Similarity CSV</DlButton>
          <DlButton name="embeddings.jsonl" mime="application/jsonl" data={() => res.texts.map((t, i) => JSON.stringify({ text: t, embedding: res.vecs[i].map((x) => Math.round(x * 1e6) / 1e6) })).join('\n') + '\n'}>Vectors JSONL</DlButton>
        </div>}
        <p className="text-xs text-muted">MiniLM turns each line into 384 numbers that describe its meaning, on your device. This is how search and RAG systems find related text even when the words differ.</p>
      </Card>
    </div>
  )
}
