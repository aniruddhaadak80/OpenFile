import { useEffect, useMemo, useState } from 'react'
import { Label, Select, Textarea, ToolGrid, Segmented, Dropzone } from '@/components/ui'
import { NumBox, Stat, Stats } from '@/lib/cf/ui'
import { estimateTokens, countWords } from '@/lib/r15/llm'
import { TOKENIZERS, QUICK, useTokenizer, TokProgress, useDebounced, fmtNum } from '@/lib/r15/ui'
import { pal } from '@/lib/bcat/kit'

const SAMPLE = `You are a helpful support agent for a small bike shop. Answer in two short paragraphs.

Customer: My rear brake squeaks when it rains, and the lever feels soft. Is it safe to ride to work tomorrow? I ride about 12 km each way.`

export default function TokenCounter() {
  const tk = useTokenizer(TOKENIZERS[0].value)
  const [text, setText] = useState(SAMPLE)
  const [view, setView] = useState<'count' | 'tokens'>('tokens')
  const [res, setRes] = useState<{ count: number; pieces: string[]; ids: number[] } | null>(null)
  const [ctx, setCtx] = useState<number | null>(TOKENIZERS[0].ctx)
  const [priceIn, setPriceIn] = useState<number | null>(null), [priceOut, setPriceOut] = useState<number | null>(null), [outTok, setOutTok] = useState<number | null>(500), [calls, setCalls] = useState<number | null>(1000)
  const d = useDebounced(text, 350)
  useEffect(() => {
    if (tk.quick) { setRes({ count: estimateTokens(d), pieces: [], ids: [] }); return }
    let live = true
    tk.call<{ count: number; pieces: string[]; ids: number[] }>('count', { text: d, detail: 4000 }).then((r) => live && setRes(r)).catch(() => live && setRes(null))
    return () => { live = false }
  }, [d, tk.model])
  const count = res?.count ?? 0
  const cost = (p: number | null, n: number) => (p != null ? (p * n) / 1e6 : null)
  const perCall = priceIn != null || priceOut != null ? (cost(priceIn, count) ?? 0) + (cost(priceOut, outTok ?? 0) ?? 0) : null
  const money = (v: number) => v < 0.01 ? `$${v.toFixed(5)}` : `$${v.toFixed(2)}`
  const chars = text.length, words = countWords(text)
  const pieces = useMemo(() => res?.pieces ?? [], [res])
  return (
    <ToolGrid
      main={<>
        <div><Label hint={`${fmtNum(chars)} characters`}>Text or prompt</Label><Textarea aria-label="Text or prompt" value={text} onChange={(e) => setText(e.target.value)} className="min-h-48 font-mono text-[13px]" /></div>
        <Dropzone compact accept=".txt,.md,.json,.jsonl,.csv,.html,.xml,.py,.js,.ts" onFiles={async (f) => f[0] && setText(await f[0].text())} label="Or drop a text file" sub="TXT, MD, JSON, CSV, code. Read on your device." />
        <TokProgress tk={tk} />
        <Stats cols={4}>
          <Stat label={tk.quick ? 'Tokens (estimate)' : 'Tokens'} value={fmtNum(count)} />
          <Stat label="Words" value={fmtNum(words)} sub={words ? `${(count / words).toFixed(2)} tokens per word` : undefined} />
          <Stat label="Characters per token" value={count ? (chars / count).toFixed(2) : '-'} />
          <Stat label="Context used" value={ctx ? `${((count / ctx) * 100).toFixed(count / ctx < 0.01 ? 2 : 1)}%` : '-'} tone={ctx && count > ctx ? 'bad' : ctx && count > ctx * 0.8 ? 'warn' : undefined} sub={ctx ? `of ${fmtNum(ctx)}` : undefined} />
        </Stats>
        {!tk.quick && <div className="space-y-2">
          <Segmented value={view} onChange={setView} options={[{ value: 'tokens', label: 'Show tokens' }, { value: 'count', label: 'Hide tokens' }]} />
          {view === 'tokens' && pieces.length > 0 && (
            <div className="max-h-[22rem] overflow-auto rounded-xl border border-border bg-surface-2/40 p-3 font-mono text-[13px] leading-7 whitespace-pre-wrap break-words scrollbar-thin" tabIndex={0} aria-label="Text split into tokens">
              {pieces.map((p, i) => <span key={i} title={`Token ${i + 1}, id ${res!.ids[i]}`} className="rounded-sm px-[1px]" style={{ background: pal(i % 6) + '33', boxShadow: `inset 0 -2px 0 ${pal(i % 6)}88` }}>{p.replace(/\n/g, '\u21b5\n') || ' '}</span>)}
              {count > pieces.length && <div className="mt-2 text-xs text-muted">Showing the first {fmtNum(pieces.length)} of {fmtNum(count)} tokens.</div>}
            </div>)}
        </div>}
      </>}
      side={<>
        <div><Label>Tokenizer</Label><Select aria-label="Tokenizer" value={tk.model} onChange={(v) => { tk.setModel(v); const m = TOKENIZERS.find((x) => x.value === v); if (m) setCtx(m.ctx) }} options={[...TOKENIZERS.map((t) => ({ value: t.value as string, label: t.label })), { value: QUICK, label: 'Quick estimate (no download)' }]} /></div>
        <p className="text-xs text-muted">{tk.quick ? 'Quick estimate uses about 4 characters per token. Pick a tokenizer for the exact count.' : 'The real tokenizer file (1 to 8 MB) downloads once and then runs on your device. Your text is never sent anywhere.'}</p>
        <NumBox label="Context window" unit="tokens" value={ctx} onChange={setCtx} />
        <div className="space-y-3 rounded-xl border border-border p-3">
          <div className="text-sm font-semibold">Cost (your own prices)</div>
          <div className="grid grid-cols-2 gap-2"><NumBox label="Input $ per 1M" value={priceIn} onChange={setPriceIn} placeholder="2.50" /><NumBox label="Output $ per 1M" value={priceOut} onChange={setPriceOut} placeholder="10" /></div>
          <div className="grid grid-cols-2 gap-2"><NumBox label="Reply tokens" value={outTok} onChange={setOutTok} /><NumBox label="Calls" value={calls} onChange={setCalls} /></div>
          {perCall != null ? <div className="text-sm"><div>Per call: <b className="font-mono">{money(perCall)}</b></div><div>{fmtNum(calls ?? 0)} calls: <b className="font-mono">{money(perCall * (calls ?? 0))}</b></div></div> : <p className="text-xs text-muted">Enter the prices from your provider's pricing page. Prices change often, so none are built in.</p>}
        </div>
      </>}
    />
  )
}
