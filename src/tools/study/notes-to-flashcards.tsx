import { useState } from 'react'
import { Download, Sparkles } from 'lucide-react'
import { Button, Card, Label, Slider, Textarea, Input } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { useVision, EnginePanel, VisionProgress } from '@/lib/bcat/aiui'
import { VMODELS } from '@/lib/bcat/vision'
import { useTextInput, TextInput } from '@/lib/bcat/textin'
import { cardsToAnki, cardsToCsv, clozeTarget, makeCloze, rankByEmbedding, rankSentencesQuick, sentenceSplit, wordFreq, type Card as FCard } from '@/lib/cf/study'
import { cardsPdf } from '@/lib/cf/print'

const SAMPLE = `The water cycle describes how water moves between the land, the oceans and the air. Evaporation happens when the Sun heats water in oceans and lakes and turns it into water vapour. Plants also release water vapour from their leaves in a process called transpiration. As warm air rises it cools, and the vapour condenses into tiny droplets that form clouds. When the droplets join and grow heavy, they fall as precipitation such as rain, snow or hail. About 97 percent of the water on Earth is salt water in the oceans. Only around 3 percent is fresh water, and most of that is frozen in glaciers and ice caps. Water that soaks into the ground becomes groundwater and can stay underground for thousands of years. Rivers carry runoff back to the sea, which completes the cycle.`

export default function NotesToFlashcards() {
  const ai = useVision(VMODELS.embed, { quick: true })
  const s = useTextInput(SAMPLE, 'whole')
  const [n, setN] = useState(8)
  const [cards, setCards] = useState<FCard[]>([])
  const make = () => ai.run(async () => {
    const text = s.text.trim()
    const sents = sentenceSplit(text)
    if (sents.length < 2) throw new Error('Paste a few full sentences of notes (at least two).')
    let order: number[]
    if (ai.engine === 'ai') {
      ai.setStatus('Reading your notes')
      const vecs = await ai.infer<number[][]>(sents, {}, { onProgress: (d, t) => { ai.setProgress(d / t); ai.setStatus(`Understanding sentence ${d} of ${t}`) } })
      order = rankByEmbedding(vecs, Math.min(n * 2, sents.length))
    } else order = rankSentencesQuick(sents).map((x) => x.i)
    const freq = wordFreq(text), out: FCard[] = [], used = new Set<string>()
    for (const i of order) { const t = clozeTarget(sents[i], freq); if (!t || used.has(t.toLowerCase())) continue; used.add(t.toLowerCase()); out.push(makeCloze(sents[i], t)); if (out.length >= n) break }
    if (!out.length) throw new Error('Could not find key terms. Try longer notes.')
    setCards(out)
  })
  const upd = (i: number, k: 'front' | 'back', v: string) => setCards((c) => c.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        <TextInput s={s} splits={['whole']} placeholder="Paste lecture notes, a chapter or an article" />
        <VisionProgress ai={ai} />
        {cards.length > 0 && <Card className="space-y-2 p-3">
          <div className="flex items-center justify-between"><Label className="mb-0">{cards.length} cards (edit any of them)</Label><button className="text-xs text-muted hover:text-fg cursor-pointer" onClick={() => setCards([])}>Clear</button></div>
          {cards.map((c, i) => <div key={i} className="grid gap-1.5 rounded-xl border border-border p-2 sm:grid-cols-[1fr_12rem_auto]"><Textarea value={c.front} onChange={(e) => upd(i, 'front', e.target.value)} className="min-h-14 font-sans text-sm" aria-label={`Card ${i + 1} question`} /><Input value={c.back} onChange={(e) => upd(i, 'back', e.target.value)} aria-label={`Card ${i + 1} answer`} /><button aria-label="Remove card" className="text-xs text-muted hover:text-danger cursor-pointer" onClick={() => setCards(cards.filter((_, k) => k !== i))}>Remove</button></div>)}
        </Card>}
      </div>
      <Card className="space-y-4 self-start">
        <EnginePanel ai={ai} quickLabel="Word counts" quickNote="Quick mode picks sentences that share the most important words. Instant and needs no download, but less smart about meaning." />
        <Slider label="How many cards" value={n} onChange={setN} min={3} max={40} />
        <Button className="w-full" icon={<Sparkles className="size-4" />} loading={ai.busy} onClick={make}>Make flashcards</Button>
        {cards.length > 0 && <div className="grid gap-2">
          <Button variant="outline" size="sm" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([cardsToAnki(cards)], { type: 'text/plain' }), 'cards-anki.txt')}>Anki import file</Button>
          <Button variant="outline" size="sm" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob(['\ufeff' + cardsToCsv(cards)], { type: 'text/csv' }), 'cards.csv')}>CSV</Button>
          <Button variant="outline" size="sm" icon={<Download className="size-4" />} onClick={async () => downloadBlob(await cardsPdf(cards, { cols: 2, rows: 4, title: 'Flashcards' }), 'cards-print.pdf')}>Printable PDF</Button>
        </div>}
        <p className="text-xs text-muted">The AI picks the sentences that best cover your notes and blanks out a key term in each (fill in the blank cards). It runs on your device; your notes are never uploaded.</p>
      </Card>
    </div>
  )
}
