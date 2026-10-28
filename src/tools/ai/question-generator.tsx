import { useState } from 'react'
import { BrainCircuit, Download, RotateCcw, Check, X } from 'lucide-react'
import { Button, Label, Segmented, Slider, ToolGrid, cn } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { aiRun, chunkText, extractJson, MODELS } from '@/lib/b4/ai'
import { useAiState, ModelPanel, AiProgress, useDocInput, DocInput } from '@/lib/b4/aiui'

type Kind = 'cards' | 'mcq'
interface Card { q: string; a: string }
interface Mcq { q: string; options: string[]; answer: number; explain?: string }

/** Parse "Q: ... A: ..." text when the model does not return JSON. Pure. */
export function parseQa(s: string): Card[] {
  const out: Card[] = []
  const re = /(?:^|\n)\s*(?:\d+[.)]\s*)?(?:Q(?:uestion)?\s*[:.-])\s*(.+?)\s*\n\s*(?:A(?:nswer)?\s*[:.-])\s*(.+?)(?=\n\s*(?:\d+[.)]\s*)?Q|\n\n|$)/gis
  for (const m of s.matchAll(re)) out.push({ q: m[1].trim(), a: m[2].trim() })
  return out
}
function normCards(x: any): Card[] { return (Array.isArray(x) ? x : x?.cards ?? x?.flashcards ?? []).map((c: any) => ({ q: String(c.q ?? c.question ?? c.front ?? '').trim(), a: String(c.a ?? c.answer ?? c.back ?? '').trim() })).filter((c: Card) => c.q && c.a) }
function normMcq(x: any): Mcq[] {
  return (Array.isArray(x) ? x : x?.questions ?? []).map((c: any) => {
    const options: string[] = (c.options ?? c.choices ?? []).map((o: any) => String(o).replace(/^[A-D][.)]\s*/, '').trim())
    let answer = typeof c.answer === 'number' ? c.answer : typeof c.correct === 'number' ? c.correct : -1
    if (answer < 0 && typeof (c.answer ?? c.correct) === 'string') { const s = String(c.answer ?? c.correct).trim(); answer = /^[A-D]$/i.test(s) ? s.toUpperCase().charCodeAt(0) - 65 : options.findIndex((o) => o.toLowerCase() === s.replace(/^[A-D][.)]\s*/, '').toLowerCase()) }
    return { q: String(c.q ?? c.question ?? '').trim(), options, answer, explain: c.explain ?? c.explanation }
  }).filter((c: Mcq) => c.q && c.options.length >= 2 && c.answer >= 0 && c.answer < c.options.length)
}

export default function QuestionGenerator() {
  const doc = useDocInput()
  const [kind, setKind] = useState<Kind>('cards')
  const [count, setCount] = useState(10)
  const [cards, setCards] = useState<Card[]>([])
  const [mcqs, setMcqs] = useState<Mcq[]>([])
  const [flipped, setFlipped] = useState<Set<number>>(new Set())
  const [picked, setPicked] = useState<Record<number, number>>({})
  const [stream, setStream] = useState('')
  const ai = useAiState(MODELS.chat)

  const go = () => ai.run(async () => {
    setCards([]); setMcqs([]); setFlipped(new Set()); setPicked({})
    let chunks = chunkText(doc.text, 3500)
    const per = Math.max(2, Math.ceil(count / Math.min(chunks.length, count)))
    if (chunks.length > count) chunks = chunks.filter((_, i) => i % Math.ceil(chunks.length / Math.ceil(count / 2)) === 0)
    const allC: Card[] = [], allM: Mcq[] = []
    for (let i = 0; i < chunks.length && (kind === 'cards' ? allC.length : allM.length) < count; i++) {
      ai.setStatus(`Writing questions from part ${i + 1} of ${chunks.length}`); ai.setProgress(i / chunks.length)
      const want = Math.min(per, count - (kind === 'cards' ? allC.length : allM.length))
      const prompt = kind === 'cards'
        ? `Create ${want} flashcards that test the most important facts in the text below. Reply with only a JSON array like [{"q":"question","a":"short answer"}].\n\nText:\n${chunks[i]}`
        : `Create ${want} multiple-choice questions about the most important facts in the text below. Each has 4 options and exactly one correct answer. Reply with only a JSON array like [{"q":"question","options":["A","B","C","D"],"answer":0,"explain":"why"}] where answer is the index of the correct option.\n\nText:\n${chunks[i]}`
      let txt = ''; setStream('')
      const r: string = await aiRun('text-generation', ai.info, ai.device, [{ role: 'system', content: 'You are a teacher who writes clear, factual quiz questions. Only use facts from the given text. Output valid JSON only.' }, { role: 'user', content: prompt }], { max: want * 90 + 60 }, ai.callbacks({ onToken: (t) => { txt += t; setStream(txt.slice(-300)) } }))
      const j = extractJson(r)
      if (kind === 'cards') { const c = j ? normCards(j) : parseQa(r); allC.push(...c); setCards([...allC]) }
      else { const m = j ? normMcq(j) : []; allM.push(...m); setMcqs([...allM]) }
    }
    setStream('')
    if (!(kind === 'cards' ? allC.length : allM.length)) throw new Error('The model did not return usable questions. Try the larger model, or a shorter, clearer text.')
  })

  const exportAs = (f: 'anki' | 'json' | 'txt') => {
    const name = `${doc.name}-${kind === 'cards' ? 'flashcards' : 'quiz'}`
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`
    if (f === 'json') return downloadBlob(new Blob([JSON.stringify(kind === 'cards' ? cards : mcqs, null, 2)], { type: 'application/json' }), name + '.json')
    if (f === 'anki') return downloadBlob(new Blob([kind === 'cards' ? cards.map((c) => `${q(c.q)};${q(c.a)}`).join('\n') : mcqs.map((m) => `${q(m.q + '\n' + m.options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join('\n'))};${q(String.fromCharCode(65 + m.answer) + ') ' + m.options[m.answer] + (m.explain ? '\n' + m.explain : ''))}`).join('\n')], { type: 'text/csv' }), name + '.csv')
    downloadBlob(new Blob([kind === 'cards' ? cards.map((c, i) => `${i + 1}. ${c.q}\n   Answer: ${c.a}`).join('\n\n') : mcqs.map((m, i) => `${i + 1}. ${m.q}\n${m.options.map((o, j) => `   ${String.fromCharCode(65 + j)}) ${o}`).join('\n')}\n   Answer: ${String.fromCharCode(65 + m.answer)}${m.explain ? ' (' + m.explain + ')' : ''}`).join('\n\n')], { type: 'text/plain' }), name + '.txt')
  }
  const score = Object.entries(picked).filter(([i, p]) => mcqs[+i]?.answer === p).length
  const has = kind === 'cards' ? cards.length : mcqs.length

  return (
    <ToolGrid
      main={<>
        <DocInput doc={doc} label="Drop your notes, a chapter or an article" sub="PDF, DOCX, EPUB, TXT, Markdown or HTML. Questions are written on your device by a small AI model." />
        {stream && <pre className="max-h-24 overflow-hidden whitespace-pre-wrap rounded-xl border border-border bg-surface-2/50 p-2 font-mono text-[11px] text-muted">{stream}</pre>}
        {kind === 'cards' && cards.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{cards.map((c, i) => (
          <button key={i} onClick={() => setFlipped((s) => { const x = new Set(s); x.has(i) ? x.delete(i) : x.add(i); return x })} className={cn('min-h-32 cursor-pointer rounded-2xl border p-4 text-left transition', flipped.has(i) ? 'border-success/40 bg-success/5' : 'border-border bg-surface hover:border-accent/60')} aria-label={`Flashcard ${i + 1}`}>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted">{flipped.has(i) ? 'Answer' : `Question ${i + 1}`}</div>
            <div className="text-sm">{flipped.has(i) ? c.a : c.q}</div>
          </button>))}</div>}
        {kind === 'mcq' && mcqs.length > 0 && <div className="space-y-3">{mcqs.map((m, i) => (
          <div key={i} className="rounded-2xl border border-border bg-surface p-4">
            <div className="mb-2 text-sm font-medium">{i + 1}. {m.q}</div>
            <div className="grid gap-1.5">{m.options.map((o, j) => {
              const chosen = picked[i] === j, show = picked[i] != null, right = j === m.answer
              return <button key={j} disabled={show} onClick={() => setPicked((p) => ({ ...p, [i]: j }))} className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition cursor-pointer disabled:cursor-default', show && right ? 'border-success/50 bg-success/10' : show && chosen ? 'border-danger/50 bg-danger/10' : 'border-border hover:border-accent/60')}>
                <span className="font-mono text-xs text-muted">{String.fromCharCode(65 + j)}</span><span className="flex-1">{o}</span>{show && right && <Check className="size-4 text-success" />}{show && chosen && !right && <X className="size-4 text-danger" />}
              </button>
            })}</div>
            {picked[i] != null && m.explain && <p className="mt-2 text-xs text-muted">{m.explain}</p>}
          </div>))}</div>}
      </>}
      side={<>
        <div><Label>Make</Label><Segmented value={kind} onChange={setKind} options={[{ value: 'cards', label: 'Flashcards' }, { value: 'mcq', label: 'Multiple choice' }]} /></div>
        <Slider label="How many" value={count} onChange={setCount} min={3} max={30} />
        <ModelPanel ai={ai} models={MODELS.chat} />
        <Button size="lg" className="w-full" icon={<BrainCircuit className="size-5" />} onClick={go} loading={ai.busy} disabled={!doc.ready}>Generate</Button>
        <AiProgress ai={ai} />
        {kind === 'mcq' && Object.keys(picked).length > 0 && <div className="flex items-center justify-between rounded-xl bg-surface-2/60 px-3 py-2 text-sm"><span>Score <b>{score}</b> of {Object.keys(picked).length}</span><Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => setPicked({})}>Reset</Button></div>}
        {has > 0 && !ai.busy && <div className="grid grid-cols-3 gap-2">
          <Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={() => exportAs('anki')}>Anki CSV</Button>
          <Button size="sm" variant="outline" onClick={() => exportAs('txt')}>TXT</Button>
          <Button size="sm" variant="outline" onClick={() => exportAs('json')}>JSON</Button>
        </div>}
        <p className="text-xs text-muted">Small models make mistakes. Review the questions before you study with them or share them.</p>
      </>}
    />
  )
}
