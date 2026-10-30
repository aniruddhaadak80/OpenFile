import { useState } from 'react'
import { WandSparkles } from 'lucide-react'
import { Button, Field, Select, Textarea, ToolGrid, CopyButton, Input, Label } from '@/components/ui'
import { aiRun, MODELS } from '@/lib/b4/ai'
import { useAiState, ModelPanel, AiProgress } from '@/lib/b4/aiui'
import { withCpuFallback } from '@/lib/b14/ai'

const TASKS = [
  { value: 'grammar', label: 'Fix spelling and grammar', prompt: 'Correct the spelling, grammar and punctuation of the text. Keep the meaning, tone and language. Return only the corrected text.' },
  { value: 'formal', label: 'Make it more formal', prompt: 'Rewrite the text in a polite, professional tone. Keep all facts. Return only the rewritten text.' },
  { value: 'friendly', label: 'Make it friendly', prompt: 'Rewrite the text in a warm, friendly and simple tone. Keep all facts. Return only the rewritten text.' },
  { value: 'simple', label: 'Simplify', prompt: 'Rewrite the text in plain, simple words that a 12 year old can follow. Use short sentences. Return only the rewritten text.' },
  { value: 'shorter', label: 'Make it shorter', prompt: 'Rewrite the text to about half the length. Keep the key points. Return only the rewritten text.' },
  { value: 'longer', label: 'Expand it', prompt: 'Expand the text with more detail and examples, staying on topic. Do not invent facts like names, numbers or dates. Return only the expanded text.' },
  { value: 'bullets', label: 'Turn into bullet points', prompt: 'Turn the text into a clear bulleted list of the main points. Return only the list, one point per line starting with "- ".' },
  { value: 'reply', label: 'Draft an email reply', prompt: 'Write a short, polite email reply to the message below. Answer what is asked, and use [placeholders] for anything you do not know. Return only the email.' },
  { value: 'titles', label: 'Suggest titles', prompt: 'Suggest 8 short, clear titles or subject lines for the text. Return only the list, one per line starting with "- ".' },
  { value: 'custom', label: 'Your own instruction', prompt: '' },
]

/** Small models often wrap the answer in quotes or the prompt's triple quotes, or add a "Here is..." line. Strip those. */
function cleanOut(raw: string, src: string): string {
  let o = raw.trim().replace(/^"""\s*|\s*"""$/g, '').trim()
  o = o.replace(/^(here is|here's|sure)[^\n]{0,80}:\s*\n+/i, '')
  if (/^["\u201c][\s\S]*["\u201d]$/.test(o) && !/^["\u201c]/.test(src.trim()) && !o.slice(1, -1).includes('"')) o = o.slice(1, -1).trim()
  return o
}

export default function AiWriter() {
  const [text, setText] = useState('hi team, the meeting tomorow is moved to 3pm becuase the client cant make it in the morning. pls update ur calenders and let me know if any problem')
  const [task, setTask] = useState('grammar')
  const [custom, setCustom] = useState('Rewrite this as a short announcement for a notice board.')
  const [out, setOut] = useState('')
  const ai = useAiState(MODELS.chat)
  const t = TASKS.find((x) => x.value === task)!
  const go = () => ai.run(async () => {
    setOut('')
    if (!text.trim()) throw new Error('Type or paste some text first.')
    const instruction = task === 'custom' ? custom.trim() || 'Improve the text.' : t.prompt
    const words = text.trim().split(/\s+/).length
    const max = Math.min(900, Math.max(160, Math.round(words * (task === 'longer' ? 3 : 1.8)) + 60))
    let acc = ''
    const msgs = [{ role: 'system', content: 'You are a careful writing assistant. Follow the instruction exactly and output only the requested text, with no preface or notes.' }, { role: 'user', content: `${instruction}\n\nText:\n"""\n${text.trim().slice(0, 6000)}\n"""` }]
    const r = await withCpuFallback(ai.device, (d) => { acc = ''; return aiRun<string>('text-generation', ai.info, d, msgs, { max }, ai.callbacks({ onReady: () => ai.setStatus('Writing'), onToken: (tok) => { acc += tok; setOut(acc) } })) }, (m) => ai.setStatus(m))
    setOut(cleanOut(String(r), text))
  })
  return (
    <ToolGrid
      main={<>
        <Label hint={`${text.trim() ? text.trim().split(/\s+/).length : 0} words`}>Your text</Label>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-40" aria-label="Your text" />
        <AiProgress ai={ai} />
        {(out || ai.busy) && <div className="space-y-2"><div className="flex items-center"><Label>Result</Label><span className="ml-auto" />{out && !ai.busy && <CopyButton text={out} />}</div><div className="min-h-32 whitespace-pre-wrap rounded-xl border border-accent/30 bg-surface p-3 text-sm">{out || '...'}</div>{out && !ai.busy && <Button size="sm" variant="ghost" onClick={() => setText(out)}>Use result as new input</Button>}</div>}
      </>}
      side={<>
        <Field label="What to do"><Select value={task} onChange={setTask} options={TASKS.map((x) => ({ value: x.value, label: x.label }))} /></Field>
        {task === 'custom' && <Field label="Instruction"><Input value={custom} onChange={(e) => setCustom(e.target.value)} /></Field>}
        <ModelPanel ai={ai} models={MODELS.chat} />
        <Button className="w-full" size="lg" icon={<WandSparkles className="size-5" />} loading={ai.busy} onClick={go}>Write</Button>
        <p className="text-xs text-muted">A small language model running in your browser. It is private and free, but less clever than big cloud models, so read the result before you send it.</p>
      </>}
    />
  )
}
