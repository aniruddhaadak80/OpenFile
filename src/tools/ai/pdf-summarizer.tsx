import { useState } from 'react'
import { Sparkles, Download, FileText } from 'lucide-react'
import { Button, Label, Segmented, ToolGrid, CopyButton, Empty } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { aiRun, chunkText, MODELS } from '@/lib/b4/ai'
import { useAiState, ModelPanel, AiProgress, useDocInput, DocInput } from '@/lib/b4/aiui'

type Engine = 'quick' | 'smart'
type Len = 'short' | 'medium' | 'long'
const LEN = { short: { max: 80, min: 20, bullets: 4 }, medium: { max: 140, min: 40, bullets: 7 }, long: { max: 220, min: 80, bullets: 12 } }

export default function PdfSummarizer() {
  const doc = useDocInput()
  const [engine, setEngine] = useState<Engine>('quick')
  const [len, setLen] = useState<Len>('medium')
  const [summary, setSummary] = useState('')
  const models = engine === 'quick' ? MODELS.summarize : MODELS.chat
  const ai = useAiState(models)
  const live = ai.busy

  const go = () => ai.run(async () => {
    setSummary('')
    const L = LEN[len]
    if (engine === 'quick') {
      let chunks = chunkText(doc.text, 3200)
      if (chunks.length > 40) chunks = chunks.filter((_, i) => i % Math.ceil(chunks.length / 40) === 0)
      ai.setStatus(`Summarizing ${chunks.length} part${chunks.length > 1 ? 's' : ''}`)
      let parts: string[] = await aiRun('summarization', ai.info, ai.device, chunks, { max: L.max, min: L.min }, ai.callbacks({ onProgress: (d, t, partial) => { ai.setProgress(d / t); ai.setStatus(`Summarized part ${d} of ${t}`); if (partial) setSummary((s) => (s ? s + '\n\n' : '') + partial) } }))
      if (parts.length > 3 && len !== 'long') {
        ai.setStatus('Combining the parts'); ai.setProgress(null)
        const joined = chunkText(parts.join(' '), 3200)
        parts = await aiRun('summarization', ai.info, ai.device, joined, { max: L.max * 1.5, min: L.min }, ai.callbacks())
      }
      setSummary(parts.join('\n\n'))
      return
    }
    const chunks = chunkText(doc.text, 5000)
    const notes: string[] = []
    if (chunks.length > 1) {
      for (let i = 0; i < Math.min(chunks.length, 24); i++) {
        ai.setStatus(`Reading part ${i + 1} of ${Math.min(chunks.length, 24)}`); ai.setProgress(i / Math.min(chunks.length, 24))
        const r: string = await aiRun('text-generation', ai.info, ai.device, [{ role: 'system', content: 'You write short, accurate notes. Only use facts from the text.' }, { role: 'user', content: `List the key points of this text as 3 to 5 short bullet points.\n\nText:\n${chunks[i]}` }], { max: 200 }, ai.callbacks())
        notes.push(r.trim())
      }
    }
    const source = chunks.length > 1 ? notes.join('\n') : chunks[0]
    ai.setStatus('Writing the summary'); ai.setProgress(null)
    let out = ''
    await aiRun('text-generation', ai.info, ai.device, [
      { role: 'system', content: 'You are a careful assistant that summarizes documents. Use plain, simple words. Do not invent facts.' },
      { role: 'user', content: `Summarize the following ${chunks.length > 1 ? 'notes about a document' : 'document'}. Start with one sentence that says what it is about, then give ${L.bullets} bullet points with the most important facts.\n\n${source}` },
    ], { max: L.bullets * 50 + 80 }, ai.callbacks({ onToken: (t) => { out += t; setSummary(out) } }))
  })

  const words = summary.split(/\s+/).filter(Boolean).length
  return (
    <ToolGrid
      main={<>
        <DocInput doc={doc} label="Drop a PDF, Word file or e-book" sub="PDF, DOCX, EPUB, TXT, Markdown, HTML, RTF or ODT. The AI runs on your device, nothing is uploaded." />
        {summary ? (
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="mb-2 flex items-center justify-between"><Label className="mb-0">Summary · {words} words</Label><div className="flex gap-2"><CopyButton text={summary} /><Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([summary], { type: 'text/plain' }), `${doc.name}-summary.txt`)}>TXT</Button></div></div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{summary}{live && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-accent align-middle" />}</div>
          </div>
        ) : doc.ready && !live ? <Empty><FileText className="mx-auto mb-2 size-6" />Pick the summary style on the right, then press Summarize.</Empty> : null}
      </>}
      side={<>
        <div><Label>Style</Label><Segmented value={engine} onChange={(v) => { setEngine(v); ai.setModel((v === 'quick' ? MODELS.summarize : MODELS.chat)[0].id) }} options={[{ value: 'quick', label: 'Quick summary' }, { value: 'smart', label: 'Key points' }]} /><p className="mt-1 text-xs text-muted">{engine === 'quick' ? 'A trained summarizer. Fast, writes flowing paragraphs. Best for English.' : 'A small chat model writes an overview and bullet points. Slower, more flexible, handles many languages.'}</p></div>
        <div><Label>Length</Label><Segmented value={len} onChange={setLen} options={[{ value: 'short', label: 'Short' }, { value: 'medium', label: 'Medium' }, { value: 'long', label: 'Detailed' }]} /></div>
        <ModelPanel ai={ai} models={models} />
        <Button size="lg" className="w-full" icon={<Sparkles className="size-5" />} onClick={go} loading={live} disabled={!doc.ready}>Summarize</Button>
        <AiProgress ai={ai} />
        <p className="text-xs text-muted">AI summaries can miss or mix up details. Check important facts against the original.</p>
      </>}
    />
  )
}
