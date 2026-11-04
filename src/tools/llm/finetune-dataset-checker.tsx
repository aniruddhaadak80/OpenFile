import { useMemo, useState } from 'react'
import { Button, Label, Select, Textarea, ToolGrid, Dropzone, Slider, Segmented, Empty } from '@/components/ui'
import { NumBox, Stat, Stats } from '@/lib/cf/ui'
import { checkDataset, splitTrainVal, estimateTokens, convText, type DsReport } from '@/lib/r15/llm'
import { TOKENIZERS, QUICK, useTokenizer, TokProgress, fmtNum, Panel } from '@/lib/r15/ui'
import { DlButton } from '@/lib/bcat/kit'
import { ShieldCheck } from 'lucide-react'

const SAMPLE = [
  { messages: [{ role: 'system', content: 'You answer questions about our app in one or two sentences.' }, { role: 'user', content: 'How do I reset my password?' }, { role: 'assistant', content: 'Open Settings, tap Account, then Reset password. We email you a link.' }] },
  { messages: [{ role: 'system', content: 'You answer questions about our app in one or two sentences.' }, { role: 'user', content: 'Can I export my notes?' }, { role: 'assistant', content: 'Yes. Open a notebook, tap the three dots and choose Export as Markdown or PDF.' }] },
  { messages: [{ role: 'user', content: 'Is there a dark mode?' }] },
  { messages: [{ role: 'system', content: 'You answer questions about our app in one or two sentences.' }, { role: 'user', content: 'How do I reset my password?' }, { role: 'assistant', content: 'Open Settings, tap Account, then Reset password. We email you a link.' }] },
].map((r) => JSON.stringify(r)).join('\n') + '\n{"messages": [{"role": "user", "content": "Broken line"'

const FMT: Record<string, string> = { chat: 'Chat messages (OpenAI, Mistral, Llama)', prompt: 'Prompt and completion', alpaca: 'Alpaca (instruction, input, output)', sharegpt: 'ShareGPT conversations', dpo: 'Preference pairs (DPO)', unknown: 'Unknown' }
export default function FinetuneDatasetChecker() {
  const tk = useTokenizer(QUICK)
  const [text, setText] = useState(SAMPLE), [name, setName] = useState('dataset')
  const [rep, setRep] = useState<DsReport | null>(null)
  const [max, setMax] = useState<number | null>(16384), [epochs, setEpochs] = useState<number | null>(3), [val, setVal] = useState(10), [seed, setSeed] = useState<number | null>(42)
  const [show, setShow] = useState<'error' | 'warn' | 'all'>('all')
  const run = async () => {
    if (tk.quick) { setRep(checkDataset(text, estimateTokens, max ?? 0)); return }
    const r = checkDataset(text, estimateTokens, 0)
    const parts = r.records.map((x) => (x.value ? convText(x.value) : null))
    try {
      const counts = await tk.call<number[]>('counts', { texts: parts.map((p) => p?.text ?? '') })
      r.records.forEach((x, i) => { if (parts[i]) x.tokens = counts[i] + parts[i]!.turns * 4 })
      finalize(r)
    } catch { /* the error is shown under the text box */ }
  }
  const finalize = (r: DsReport) => {
    // apply the token limit with the real counts
    if (max) for (const x of r.records) if (x.value && x.tokens > max) { x.ok = false; r.issues.push({ line: x.line, level: 'error', msg: `${x.tokens} tokens, over the ${max} limit.` }) }
    r.issues.sort((a, b) => a.line - b.line)
    const toks = r.records.filter((x) => x.value).map((x) => x.tokens).sort((a, b) => a - b), total = toks.reduce((a, b) => a + b, 0)
    r.tokens = { total, min: toks[0] ?? 0, max: toks[toks.length - 1] ?? 0, mean: toks.length ? Math.round(total / toks.length) : 0, p95: toks[Math.min(toks.length - 1, Math.floor(toks.length * 0.95))] ?? 0 }
    r.valid = r.records.filter((x) => x.ok).length
    setRep({ ...r })
  }
  const good = useMemo(() => rep?.records.filter((r) => r.ok && !r.dup).map((r) => r.value) ?? [], [rep])
  const split = useMemo(() => splitTrainVal(good, val / 100, seed ?? 42), [good, val, seed])
  const issues = rep?.issues.filter((i) => show === 'all' || i.level === show) ?? []
  const jl = (a: any[]) => a.map((v) => JSON.stringify(v)).join('\n') + '\n'
  return (
    <ToolGrid
      main={<>
        <div><Label hint="One JSON object per line">Dataset (JSONL)</Label><Textarea aria-label="Dataset JSONL" value={text} onChange={(e) => { setText(e.target.value); setRep(null) }} className="min-h-44 font-mono text-[12px]" spellCheck={false} /></div>
        <Dropzone compact accept=".jsonl,.json,.ndjson,.txt" onFiles={async (f) => { if (!f[0]) return; setText(await f[0].text()); setName(f[0].name.replace(/\.[^.]+$/, '')); setRep(null) }} label="Or drop a .jsonl file" sub="Chat, prompt and completion, Alpaca, ShareGPT or DPO rows. Read on your device." />
        <TokProgress tk={tk} />
        {rep ? <>
          <Stats cols={4}>
            <Stat label="Rows" value={fmtNum(rep.rows)} sub={FMT[rep.format]} />
            <Stat label="Ready to train" value={fmtNum(rep.valid)} tone={rep.valid === rep.rows ? 'good' : 'warn'} sub={`${rep.rows - rep.valid} with errors`} />
            <Stat label="Duplicates" value={fmtNum(rep.duplicates)} tone={rep.duplicates ? 'warn' : undefined} />
            <Stat label="Tokens per row" value={fmtNum(rep.tokens.mean)} sub={`max ${fmtNum(rep.tokens.max)}, 95% under ${fmtNum(rep.tokens.p95)}`} />
          </Stats>
          <Stats cols={2}>
            <Stat label={tk.quick ? 'Tokens in dataset (estimate)' : 'Tokens in dataset'} value={fmtNum(rep.tokens.total)} />
            <Stat label={`Training tokens for ${epochs ?? 1} epochs`} value={fmtNum(rep.tokens.total * (epochs ?? 1))} sub="Multiply by your provider's training price per 1M" />
          </Stats>
          <Panel title="Problems" hint={`${rep.issues.filter((i) => i.level === 'error').length} errors, ${rep.issues.filter((i) => i.level === 'warn').length} warnings`}>
            <Segmented className="mb-2" value={show} onChange={setShow} options={[{ value: 'all', label: 'All' }, { value: 'error', label: 'Errors' }, { value: 'warn', label: 'Warnings' }]} />
            {issues.length ? <ul className="max-h-80 divide-y divide-border overflow-auto text-sm scrollbar-thin">{issues.slice(0, 500).map((i, k) => <li key={k} className="flex gap-3 py-1.5"><span className="w-16 shrink-0 font-mono text-xs text-muted">line {i.line}</span><span className={i.level === 'error' ? 'text-danger' : 'text-warn'}>{i.msg}</span></li>)}</ul> : <p className="text-sm text-success">No problems found.</p>}
          </Panel>
        </> : <Empty>Press Check dataset to validate every row.</Empty>}
      </>}
      side={<>
        <div><Label>Count tokens with</Label><Select aria-label="Count tokens with" value={tk.model} onChange={tk.setModel} options={[{ value: QUICK, label: 'Quick estimate (no download)' }, ...TOKENIZERS.map((t) => ({ value: t.value as string, label: t.label }))]} /></div>
        <NumBox label="Token limit per row" unit="0 for none" value={max} onChange={setMax} />
        <NumBox label="Epochs" value={epochs} onChange={setEpochs} />
        <Button className="w-full" icon={<ShieldCheck className="size-4" />} loading={tk.busy} onClick={run}>Check dataset</Button>
        {rep && good.length > 0 && <div className="space-y-3 rounded-xl border border-border p-3">
          <div className="text-sm font-semibold">Clean rows and split</div>
          <Slider label="Validation share" value={val} min={0} max={30} suffix="%" onChange={setVal} />
          <NumBox label="Shuffle seed" value={seed} onChange={setSeed} />
          <p className="text-xs text-muted">{fmtNum(split.train.length)} train rows, {fmtNum(split.val.length)} validation rows. Rows with errors and repeated rows after the first are left out.</p>
          <div className="grid gap-2">
            <DlButton name={`${name}-clean.jsonl`} mime="application/jsonl" data={() => jl(good)}>All clean rows</DlButton>
            <DlButton name={`${name}-train.jsonl`} mime="application/jsonl" data={() => jl(split.train)}>train.jsonl</DlButton>
            {split.val.length > 0 && <DlButton name={`${name}-validation.jsonl`} mime="application/jsonl" data={() => jl(split.val)}>validation.jsonl</DlButton>}
          </div>
        </div>}
      </>}
    />
  )
}
