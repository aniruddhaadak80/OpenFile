import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button, Card, CopyButton, Input, Label, Textarea } from '@/components/ui'
import { useVision, EnginePanel, VisionProgress } from '@/lib/bcat/aiui'
import { VMODELS } from '@/lib/bcat/vision'
import { dot } from '@/lib/bcat/quick'
import { fitDescription, sentences, truncatePx } from '@/lib/cf/web'
import { rankSentencesQuick } from '@/lib/cf/study'

const SAMPLE = `OpenFile is a set of free tools for PDFs, images, video and documents. Every tool runs inside your browser, so your files never leave your device. You can merge and split PDFs, compress images, convert Word to PDF and much more. There is no account and no watermark. The tools keep working offline once the page has loaded, which helps on slow or patchy connections. New tools are added every week based on what people ask for.`

export default function MetaDescriptionWriter() {
  const ai = useVision(VMODELS.embed, { quick: true })
  const [text, setText] = useState(SAMPLE), [kw, setKw] = useState('free PDF tools'), [title, setTitle] = useState('Free PDF and File Tools That Run in Your Browser')
  const [opts, setOpts] = useState<string[]>([])
  const go = () => ai.run(async () => {
    const ss = sentences(text)
    if (ss.length < 2) throw new Error('Paste at least two full sentences of page text.')
    let ranked: number[]
    if (ai.engine === 'ai') {
      const query = `${title}. ${kw}`
      const vecs = await ai.infer<number[][]>([query, text.slice(0, 2000), ...ss], {}, { onProgress: (d, t) => { ai.setProgress(d / t); ai.setStatus(`Reading sentence ${d} of ${t}`) } })
      ranked = ss.map((_, i) => ({ i, s: dot(vecs[0], vecs[2 + i]) * 0.55 + dot(vecs[1], vecs[2 + i]) * 0.45 + (i === 0 ? 0.03 : 0) })).sort((a, b) => b.s - a.s).map((x) => x.i)
    } else ranked = rankSentencesQuick(ss, kw).map((x) => x.i)
    const k = kw.toLowerCase().split(/\s+/).filter(Boolean)
    const cands = new Set<string>()
    for (let a = 0; a < Math.min(4, ranked.length); a++) { cands.add(fitDescription([ss[ranked[a]]])); for (let b = 0; b < Math.min(5, ranked.length); b++) if (a !== b) { const pair = [ss[ranked[a]], ss[ranked[b]]].sort((x, y) => ss.indexOf(x) - ss.indexOf(y)); cands.add(fitDescription(pair)) } }
    const scored = [...cands].map((c) => ({ c, s: Math.min(c.length, 155) / 155 + k.filter((w) => c.toLowerCase().includes(w)).length * 0.3 - (c.endsWith('...') ? 0.4 : 0) })).sort((x, y) => y.s - x.s)
    setOpts(scored.slice(0, 5).map((x) => x.c))
  })
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        <div><Label>Page text</Label><Textarea aria-label="Page text" value={text} onChange={(e) => setText(e.target.value)} className="min-h-44 font-sans text-sm" /></div>
        <div className="grid gap-3 sm:grid-cols-2"><div><Label>Page title</Label><Input aria-label="Page title" value={title} onChange={(e) => setTitle(e.target.value)} /></div><div><Label>Main keyword</Label><Input aria-label="Main keyword" value={kw} onChange={(e) => setKw(e.target.value)} /></div></div>
        <VisionProgress ai={ai} />
        {opts.map((o, i) => { const px = truncatePx(o, 920, 14); return (
          <Card key={i} className="space-y-2"><div className="text-xs text-muted">example.com</div><div className="text-lg text-sky-400">{title}</div><div className="text-sm">{o}</div>
            <div className="flex items-center gap-3 text-xs"><span className={o.length > 160 || o.length < 110 ? 'text-warn' : 'text-success'}>{o.length} characters</span>{px.cut && <span className="text-warn">may be cut on desktop</span>}<span className="ml-auto"><CopyButton text={o} /></span></div>
            <details className="text-xs text-muted"><summary className="cursor-pointer">HTML tag</summary><code className="break-all">{`<meta name="description" content="${o.replace(/"/g, '&quot;')}">`}</code></details>
          </Card>) })}
      </div>
      <Card className="space-y-4 self-start">
        <EnginePanel ai={ai} quickLabel="Keywords" quickNote="Keyword mode picks the sentences that share the most words with your keyword. Instant, no download." />
        <Button className="w-full" icon={<Sparkles className="size-4" />} loading={ai.busy} onClick={go}>Write descriptions</Button>
        <p className="text-xs text-muted">The AI reads your page on your device and picks the sentences that best match the title and keyword, then fits them into 120 to 155 characters. Nothing is sent anywhere.</p>
      </Card>
    </div>
  )
}
