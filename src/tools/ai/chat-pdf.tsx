import { useEffect, useRef, useState } from 'react'
import { MessageSquareText, Send, BookMarked, Trash2, Gauge, Sparkles } from 'lucide-react'
import { Button, Input, Label, ToolGrid, Empty, Segmented, cn } from '@/components/ui'
import { aiRun, chunkText, cosine, MODELS } from '@/lib/b4/ai'
import { useAiState, ModelPanel, AiProgress, useDocInput, DocInput } from '@/lib/b4/aiui'
import { answer as quickAnswer, bm25 } from '@/lib/r13/extractive'

interface Chunk { page: number; text: string; vec?: number[] }
interface Msg { role: 'user' | 'assistant'; content: string; sources?: Chunk[] }

/** Rank chunks by cosine similarity. Pure. */
export function topK(chunks: Chunk[], q: number[], k: number) { return chunks.map((c) => ({ c, s: c.vec ? cosine(c.vec, q) : -1 })).sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.c) }

export default function ChatPdf() {
  const doc = useDocInput()
  const [index, setIndex] = useState<Chunk[] | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const ai = useAiState(MODELS.chat)
  const [engine, setEngine] = useState<'quick' | 'ai'>('ai')
  const picked = useRef(false)
  // No WebGPU: start with Instant answers (keyword search, no download) so the tab never has to load a 500 MB model on the CPU.
  useEffect(() => { const id = setTimeout(() => { if (!picked.current && !ai.gpuOk) setEngine('quick') }, 400); return () => clearTimeout(id) }, [ai.gpuOk])
  const end = useRef<HTMLDivElement>(null)
  const pdf = !!doc.file?.name.toLowerCase().endsWith('.pdf')

  useEffect(() => { setIndex(null); setMsgs([]) }, [doc.file, doc.mode])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs])

  const build = async (): Promise<Chunk[]> => {
    const chunks: Chunk[] = []
    for (const p of doc.pages) for (const t of chunkText(p.text, 900, 120)) chunks.push({ page: p.page, text: t })
    ai.setStatus(`Indexing ${chunks.length} passages`)
    const vecs: number[][] = await aiRun('feature-extraction', MODELS.embed[0], ai.device, chunks.map((c) => c.text), {}, ai.callbacks({ onProgress: (d, t) => { ai.setProgress(d / t); ai.setStatus(`Indexing passage ${d} of ${t}`) } }))
    const idx = chunks.map((c, i) => ({ ...c, vec: vecs[i] }))
    setIndex(idx); ai.setProgress(null)
    return idx
  }

  const passages = (): Chunk[] => { const out: Chunk[] = []; for (const p of doc.pages) for (const t of chunkText(p.text, 900, 120)) out.push({ page: p.page, text: t }); return out }
  const askQuick = (question: string) => {
    const all = passages()
    const lines = quickAnswer(all, question, 3)
    const hits = bm25(all, question, 4).map((h) => h.p)
    const label = pdf ? 'page' : 'part'
    const content = lines.length ? lines.map((l) => `${l.text} [${label} ${l.page}]`).join('\n\n') : 'I could not find words from your question in the document. Try other words, or switch to the AI model for a written answer.'
    setMsgs((m) => [...m, { role: 'user', content: question }, { role: 'assistant', content, sources: hits.length ? hits : undefined }])
  }

  const ask = (question = q) => {
    if (!question.trim()) return
    setQ('')
    if (engine === 'quick') { askQuick(question); return }
    const history = msgs
    setMsgs((m) => [...m, { role: 'user', content: question }, { role: 'assistant', content: '' }])
    ai.run(async () => {
      const idx = index ?? (await build())
      ai.setStatus('Finding the relevant parts')
      const [qv]: number[][] = await aiRun('feature-extraction', MODELS.embed[0], ai.device, [question], {}, ai.callbacks())
      const hits = topK(idx, qv, 4)
      const context = hits.map((h) => `[${pdf ? 'page' : 'part'} ${h.page}]\n${h.text}`).join('\n\n')
      ai.setStatus('Writing the answer')
      let out = ''
      const prior = history.slice(-4).map((m) => ({ role: m.role, content: m.content }))
      await aiRun('text-generation', ai.info, ai.device, [
        { role: 'system', content: `You answer questions about a document using only the excerpts given. Cite the ${pdf ? 'page' : 'part'} numbers like [${pdf ? 'page' : 'part'} 3]. If the excerpts do not contain the answer, say you could not find it in the document. Keep answers short and plain.` },
        ...prior,
        { role: 'user', content: `Excerpts:\n${context}\n\nQuestion: ${question}` },
      ], { max: 400 }, ai.callbacks({ onToken: (t) => { out += t; setMsgs((m) => { const n = [...m]; n[n.length - 1] = { role: 'assistant', content: out, sources: hits }; return n }) } }))
    }).then((r) => { if (r === undefined) setMsgs((m) => (m.at(-1)?.content ? m : m.slice(0, -2))) })
  }

  const suggestions = ['What is this document about?', 'List the main points.', 'What are the key dates and numbers?']
  return (
    <ToolGrid
      main={<>
        <DocInput doc={doc} label="Drop a PDF or document to chat with" sub="PDF, DOCX, EPUB, TXT, Markdown or HTML. Everything, including the AI, runs on your device." />
        {doc.ready && (
          <div className="flex h-[60vh] flex-col rounded-2xl border border-border bg-surface">
            <div className="flex-1 space-y-3 overflow-auto p-4 scrollbar-thin">
              {!msgs.length && <Empty>Ask anything about the document. Answers come with {pdf ? 'page' : 'part'} numbers you can check.
                <div className="mt-3 flex flex-wrap justify-center gap-2">{suggestions.map((s) => <Button key={s} size="sm" variant="outline" onClick={() => ask(s)} disabled={ai.busy}>{s}</Button>)}</div></Empty>}
              {msgs.map((m, i) => (
                <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm', m.role === 'user' ? 'bg-accent/15' : 'border border-border bg-surface-2/50')}>
                    <div className="whitespace-pre-wrap leading-relaxed">{m.content || <span className="text-muted">Thinking...</span>}</div>
                    {m.sources && m.content && <div className="mt-2 border-t border-border pt-2">
                      <button className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted hover:text-accent" onClick={() => setOpen(open === i ? null : i)}><BookMarked className="size-3.5" />Sources: {[...new Set(m.sources.map((s) => s.page))].map((p) => `${pdf ? 'p.' : 'part '}${p}`).join(', ')}</button>
                      {open === i && <div className="mt-2 space-y-2">{m.sources.map((s, j) => <div key={j} className="rounded-lg bg-surface p-2 text-xs text-muted"><b className="text-fg">{pdf ? 'Page' : 'Part'} {s.page}:</b> {s.text.slice(0, 400)}{s.text.length > 400 ? '...' : ''}</div>)}</div>}
                    </div>}
                  </div>
                </div>
              ))}
              <div ref={end} />
            </div>
            <form className="flex gap-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); if (!ai.busy) ask() }}>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question about the document" aria-label="Question" disabled={ai.busy} />
              <Button type="submit" icon={<Send className="size-4" />} disabled={!q.trim() || ai.busy} aria-label="Send" />
            </form>
          </div>
        )}
      </>}
      side={<>
        <div><Label>Engine</Label><Segmented value={engine} onChange={(v) => { picked.current = true; setEngine(v) }} options={[{ value: 'quick', label: <span className="inline-flex items-center gap-1.5"><Gauge className="size-3.5" />Instant answers</span> }, { value: 'ai', label: <span className="inline-flex items-center gap-1.5"><Sparkles className="size-3.5" />AI model</span> }]} />
          <p className="mt-1 text-xs text-muted">{engine === 'quick' ? 'Finds the sentences that best match your question with keyword search. Instant, no download, works on any device.' : 'A small chat model writes the answer from the best passages.'}</p></div>
        {engine === 'ai' && <><ModelPanel ai={ai} models={MODELS.chat} title="Answer model" />
        <p className="-mt-2 text-xs text-muted">A small search model (about 25 MB) also downloads to find the right passages.</p></>}
        {index && <div className="rounded-xl bg-surface-2/60 px-3 py-2 text-xs text-muted"><Label className="mb-0">Index ready</Label>{index.length} passages from {doc.pages.length} {pdf ? 'pages' : 'parts'}</div>}
        {engine === 'ai' && !index && doc.ready && <Button variant="secondary" className="w-full" icon={<MessageSquareText className="size-4" />} onClick={() => ai.run(build)} loading={ai.busy}>Prepare document</Button>}
        <AiProgress ai={ai} />
        {msgs.length > 0 && !ai.busy && <Button variant="ghost" size="sm" className="w-full" icon={<Trash2 className="size-4" />} onClick={() => setMsgs([])}>Clear chat</Button>}
        <p className="text-xs text-muted">Small local models can be wrong. Use the page numbers to check answers that matter.</p>
      </>}
    />
  )
}
