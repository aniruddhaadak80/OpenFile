import { useEffect, useRef, useState } from 'react'
import { BrainCircuit, Download, RotateCcw, Check, X } from 'lucide-react'
import { Button, Label, Segmented, Slider, ToolGrid, cn } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { aiRun, chunkText, extractJson, jsonObjects, MODELS } from '@/lib/b4/ai'
import { useAiState, ModelPanel, AiProgress, useDocInput, DocInput } from '@/lib/b4/aiui'
import { parseQa, normCards, normMcq, parseMcqText, mcqFromCards, type Card, type Mcq } from '@/lib/b4/qparse'

type Kind = 'cards' | 'mcq'
export { parseQa }

export default function QuestionGenerator() {
  const doc = useDocInput()
  const [kind, setKind] = useState<Kind>('cards')
  const [count, setCountRaw] = useState(10)
  // a small model on a CPU writes about one card every 20 to 60 seconds, so start with 5 there until the user picks a number
  const touched = useRef(false)
  const setCount = (n: number) => { touched.current = true; setCountRaw(n) }
  const [cards, setCards] = useState<Card[]>([])
  const [mcqs, setMcqs] = useState<Mcq[]>([])
  const [flipped, setFlipped] = useState<Set<number>>(new Set())
  const [picked, setPicked] = useState<Record<number, number>>({})
  const ai = useAiState(MODELS.chat)
  useEffect(() => { if (!touched.current) setCountRaw(ai.device === 'webgpu' ? 10 : 5) }, [ai.device])

  const go = () => ai.run(async () => {
    setCards([]); setMcqs([]); setFlipped(new Set()); setPicked({})
    // shorter parts on a CPU: the model reads the whole part before it writes the first word
    let chunks = chunkText(doc.text, ai.device === 'webgpu' ? 3500 : 2000)
    const per = Math.max(2, Math.ceil(count / Math.min(chunks.length, count)))
    if (chunks.length > count) chunks = chunks.filter((_, i) => i % Math.ceil(chunks.length / Math.ceil(count / 2)) === 0)
    const allC: Card[] = [], allM: Mcq[] = []
    for (let i = 0; i < chunks.length && (kind === 'cards' ? allC.length : allM.length) < count; i++) {
      const before = kind === 'cards' ? allC.length : allM.length
      ai.setStatus(chunks.length > 1 ? `Writing questions from part ${i + 1} of ${chunks.length}` : 'Writing questions'); ai.setProgress(before / count)
      const want = Math.min(per, count - (kind === 'cards' ? allC.length : allM.length))
      // the text goes first and the example holds no placeholder words: with the instruction first and a
      // {"q":"question"} example, SmolLM2 on a CPU copied the example or replied with an empty [] (live, Oct 2026)
      const prompt = kind === 'cards'
        ? `Text:\n${chunks[i]}\n\nWrite ${want} flashcards that test the most important facts in the text above. Ask what, when, who, how many or why, not yes or no questions. Each flashcard is a JSON object with a question "q" and a short answer "a" taken from the text. Reply with only a JSON array of ${want} objects, like [{"q":"...","a":"..."}].`
        : `Text:\n${chunks[i]}\n\nWrite ${want} multiple-choice questions about the most important facts in the text above. Each is a JSON object with a question "q", 4 options in "options", the index of the one correct option in "answer" (0 to 3) and a short reason in "explain". Only use facts from the text. Reply with only a JSON array of ${want} objects, like [{"q":"...","options":["...","...","...","..."],"answer":0,"explain":"..."}].`
      // cards appear one by one while the model writes; the raw JSON is never shown
      let txt = '', shown = 0
      const have = () => (kind === 'cards' ? allC.length : allM.length)
      const onToken = (t: string) => {
        txt += t
        if (!t.includes('}')) return
        const objs = jsonObjects(txt)
        if (objs.length === shown) return
        shown = objs.length
        const got = kind === 'cards' ? normCards(objs) : normMcq(objs)
        if (kind === 'cards') setCards([...allC, ...(got as Card[])].slice(0, count)); else setMcqs([...allM, ...(got as Mcq[])].slice(0, count))
        const n = Math.min(count, have() + got.length)
        ai.setStatus(`Wrote ${n} of ${count} questions`); ai.setProgress(n / count)
      }
      const r: string = await aiRun('text-generation', ai.info, ai.device, [{ role: 'system', content: 'You are a teacher who writes clear, factual quiz questions. Only use facts from the given text. Output valid JSON only.' }, { role: 'user', content: prompt }], { max: want * 90 + 60 }, ai.callbacks({ onToken }))
      const j = extractJson(r), objs = jsonObjects(r)
      const pickBest = <T,>(a: T[], b: T[]) => (b.length > a.length ? b : a)
      if (kind === 'cards') {
        let c = pickBest(j ? normCards(j) : [], normCards(objs)); if (!c.length) c = parseQa(r)
        if (!c.length) {
          // one plain-text retry: small models that will not write JSON still follow "Q: / A:" lines
          ai.setStatus('Trying again in plain text')
          const r2: string = await aiRun('text-generation', ai.info, ai.device, [{ role: 'system', content: 'You are a teacher who writes clear, factual quiz questions. Only use facts from the given text.' }, { role: 'user', content: `Text:\n${chunks[i]}\n\nWrite ${want} questions about the text above, each with a short answer. Use this format:\nQ: question\nA: answer` }], { max: want * 70 + 40 }, ai.callbacks())
          c = parseQa(r2)
        }
        allC.push(...c.slice(0, count - allC.length)); setCards([...allC])
      }
      else {
        let m = pickBest(j ? normMcq(j) : [], normMcq(objs)); if (!m.length) m = parseMcqText(r)
        if (!m.length) {
          // retry with plain "Q: / A:" pairs and make the choices from the other answers: SmolLM2 on a CPU
          // writes no answer key for JSON or "A) B) C) D)" quizzes, but it does write question and answer pairs (live, Oct 2026)
          ai.setStatus('Trying again with questions and answers')
          const n2 = Math.max(want, 3)
          const r2: string = await aiRun('text-generation', ai.info, ai.device, [{ role: 'system', content: 'You are a teacher who writes clear, factual quiz questions. Only use facts from the given text.' }, { role: 'user', content: `Text:\n${chunks[i]}\n\nWrite ${n2} questions about the text above, each with a short answer. Use this format:\nQ: question\nA: answer` }], { max: n2 * 70 + 40 }, ai.callbacks())
          m = parseMcqText(r2); if (!m.length) m = mcqFromCards(parseQa(r2).length ? parseQa(r2) : normCards(jsonObjects(r2)), chunks[i])
        }
        allM.push(...m.slice(0, count - allM.length)); setMcqs([...allM])
      }
    }
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
