import { useMemo, useState } from 'react'
import { Label, Select, Textarea, ToolGrid, Dropzone, Input, Empty } from '@/components/ui'
import { Stat, Stats } from '@/lib/cf/ui'
import { parseJsonl, detectRow, toConv, fromConv, csvToConvs, type Conv, type OutFormat } from '@/lib/r15/llm'
import { fmtNum, Panel } from '@/lib/r15/ui'
import { DlButton, toCsv } from '@/lib/bcat/kit'

const SAMPLE = [
  { instruction: 'Translate to French', input: 'Good morning', output: 'Bonjour' },
  { instruction: 'Give a synonym for happy', input: '', output: 'Cheerful' },
  { instruction: 'Summarise in five words', input: 'The meeting moved from Monday to Wednesday because the client is travelling.', output: 'Meeting moved to Wednesday, client travelling.' },
].map((r) => JSON.stringify(r)).join('\n')

const OUT: { value: OutFormat | 'csv'; label: string }[] = [
  { value: 'chat', label: 'Chat messages JSONL (OpenAI, Mistral, Llama, Together)' },
  { value: 'sharegpt', label: 'ShareGPT JSONL (Axolotl, LLaMA-Factory)' },
  { value: 'alpaca', label: 'Alpaca JSONL (instruction, input, output)' },
  { value: 'prompt', label: 'Prompt and completion JSONL' },
  { value: 'csv', label: 'CSV (system, user, assistant)' },
]
const NAMES: Record<string, string> = { chat: 'chat messages', prompt: 'prompt and completion', alpaca: 'Alpaca', sharegpt: 'ShareGPT', dpo: 'preference pairs (the preferred reply is kept)', unknown: 'unknown' }

export default function DatasetConverter() {
  const [text, setText] = useState(SAMPLE), [name, setName] = useState('dataset'), [isCsv, setIsCsv] = useState(false)
  const [csv, setCsv] = useState<string[][] | null>(null), [cols, setCols] = useState({ user: 0, assistant: 1, system: -1, input: -1 })
  const [to, setTo] = useState<OutFormat | 'csv'>('chat'), [system, setSystem] = useState('')
  const parsed = useMemo(() => {
    if (isCsv && csv) return { convs: csvToConvs(csv, cols), bad: 0, from: 'CSV' }
    const rows = parseJsonl(text)
    const convs: Conv[] = []
    let bad = 0
    const kinds = new Map<string, number>()
    for (const r of rows) { if (!r.value) { bad++; continue } const f = detectRow(r.value); kinds.set(f, (kinds.get(f) ?? 0) + 1); const c = toConv(r.value, f); if (c && c.turns.some((t) => t.content.trim())) convs.push(c); else bad++ }
    const from = [...kinds.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${NAMES[k]} (${n})`).join(', ')
    return { convs, bad, from }
  }, [text, isCsv, csv, cols])
  const out = useMemo(() => {
    if (to === 'csv') return toCsv([['system', 'user', 'assistant'], ...parsed.convs.map((c) => { const s = c.turns.filter((t) => t.role === 'system').map((t) => t.content).join('\n') || system; const u = c.turns.filter((t) => t.role === 'user').map((t) => t.content).join('\n\n'); const a = c.turns.filter((t) => t.role === 'assistant').map((t) => t.content).pop() ?? ''; return [s, u, a] })])
    return parsed.convs.map((c) => JSON.stringify(fromConv(c, to, system.trim() || undefined))).join('\n') + (parsed.convs.length ? '\n' : '')
  }, [parsed, to, system])
  const head = csv?.[0] ?? []
  const colOpts = [{ value: '-1', label: 'None' }, ...head.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` }))]
  const load = async (f: File) => {
    const t = await f.text(); setName(f.name.replace(/\.[^.]+$/, ''))
    if (/\.(csv|tsv)$/i.test(f.name)) {
      const Papa = (await import('papaparse')).default
      const rows = Papa.parse<string[]>(t, { skipEmptyLines: true }).data
      const h = rows[0]?.map((x) => x.toLowerCase()) ?? []
      const find = (re: RegExp, d: number) => { const i = h.findIndex((x) => re.test(x)); return i >= 0 ? i : d }
      setCols({ user: find(/^(user|question|prompt|instruction|input|query)/, 0), assistant: find(/^(assistant|answer|response|output|completion|reply)/, 1), system: find(/^system/, -1), input: find(/^(context|input)$/, -1) })
      setCsv(rows); setIsCsv(true)
    } else { setText(t); setIsCsv(false); setCsv(null) }
  }
  return (
    <ToolGrid
      main={<>
        {!isCsv ? <div><Label hint="JSONL, a JSON array, or drop a CSV">Source dataset</Label><Textarea aria-label="Source dataset" value={text} onChange={(e) => setText(e.target.value)} className="min-h-40 font-mono text-[12px]" spellCheck={false} /></div>
          : <Panel title={`${name}.csv`} hint={`${fmtNum((csv?.length ?? 1) - 1)} rows`}><button type="button" className="text-xs text-accent underline" onClick={() => { setIsCsv(false); setCsv(null) }}>Use pasted JSONL instead</button></Panel>}
        <Dropzone compact accept=".jsonl,.json,.ndjson,.csv,.tsv,.txt" onFiles={(f) => f[0] && load(f[0])} label="Drop a dataset file" sub="JSONL, JSON or CSV. Read on your device." />
        <Stats cols={3}><Stat label="Rows read" value={fmtNum(parsed.convs.length)} /><Stat label="Skipped" value={fmtNum(parsed.bad)} tone={parsed.bad ? 'warn' : undefined} /><Stat label="Source format" value={<span className="text-sm">{parsed.from || '-'}</span>} /></Stats>
        {parsed.convs.length ? <Panel title="Result" hint="First 50 rows"><pre className="max-h-96 overflow-auto rounded-xl bg-surface-2/50 p-3 font-mono text-[12px] whitespace-pre-wrap break-all scrollbar-thin" tabIndex={0}>{out.split('\n').slice(0, 50).join('\n')}</pre></Panel> : <Empty>No rows to convert yet.</Empty>}
      </>}
      side={<>
        <div><Label>Convert to</Label><Select aria-label="Convert to" value={to} onChange={(v) => setTo(v as OutFormat | 'csv')} options={OUT} /></div>
        <div><Label hint="Added to rows that have none">System prompt</Label><Input aria-label="System prompt" value={system} onChange={(e) => setSystem(e.target.value)} placeholder="You are a helpful assistant." /></div>
        {isCsv && <div className="grid gap-2">
          {(['user', 'assistant', 'input', 'system'] as const).map((k) => <div key={k}><Label>{k === 'user' ? 'User or question column' : k === 'assistant' ? 'Answer column' : k === 'input' ? 'Extra input column' : 'System column'}</Label><Select aria-label={`${k} column`} value={String(cols[k])} onChange={(v) => setCols({ ...cols, [k]: +v })} options={k === 'user' || k === 'assistant' ? colOpts.slice(1) : colOpts} /></div>)}
        </div>}
        <DlButton variant="primary" className="w-full" disabled={!parsed.convs.length} name={`${name}-${to}.${to === 'csv' ? 'csv' : 'jsonl'}`} mime={to === 'csv' ? 'text/csv' : 'application/jsonl'} data={() => out}>Download</DlButton>
        <p className="text-xs text-muted">Multi-turn chats keep every turn in chat and ShareGPT. Alpaca and prompt formats hold one answer, so earlier turns go into the prompt as "User:" and "Assistant:" lines.</p>
      </>}
    />
  )
}
