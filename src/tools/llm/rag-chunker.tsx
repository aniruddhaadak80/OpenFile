import { useState } from 'react'
import { Button, Label, Select, Textarea, ToolGrid, Dropzone, Slider, Switch } from '@/components/ui'
import { Stat, Stats } from '@/lib/cf/ui'
import { chunkText, estimateTokens, countWords, SPLITTERS, type Chunk } from '@/lib/r15/llm'
import { TOKENIZERS, QUICK, useTokenizer, TokProgress, fmtNum, Panel } from '@/lib/r15/ui'
import { DlButton, toCsv, pal } from '@/lib/bcat/kit'
import { Scissors } from 'lucide-react'

const SAMPLE = `# Returns policy

You can return most items within 30 days of delivery. Items must be unused and in the original box.

## How to start a return

Open your order, pick the items and choose a reason. We email a label within one working day. Drop the parcel at any partner shop.

## Refunds

Refunds go back to the card you paid with. Banks take 3 to 5 working days to show the money. Gift cards are refunded as store credit.

## Items we cannot take back

Opened software, custom printed goods, gift cards and perishable food cannot be returned unless they arrive damaged.`

type Unit = 'chars' | 'words' | 'tokens'
export default function RagChunker() {
  const tk = useTokenizer(QUICK)
  const [text, setText] = useState(SAMPLE), [name, setName] = useState('document')
  const [unit, setUnit] = useState<Unit>('chars'), [size, setSize] = useState(300), [overlap, setOverlap] = useState(40)
  const [mode, setMode] = useState<keyof typeof SPLITTERS>('markdown'), [meta, setMeta] = useState(true)
  const [chunks, setChunks] = useState<Chunk[] | null>(null)
  const max = unit === 'chars' ? 4000 : unit === 'words' ? 800 : 2000
  const go = async () => {
    const opts = { size, overlap, separators: SPLITTERS[mode] }
    if (unit === 'tokens' && !tk.quick) { try { setChunks(await tk.call<Chunk[]>('chunk', { text, opts })) } catch { /* error shown */ } }
    else setChunks(chunkText(text, { ...opts, measure: unit === 'chars' ? undefined : unit === 'words' ? countWords : estimateTokens }))
  }
  const rows = (chunks ?? []).map((c) => ({ id: `${name}-${c.i}`, text: c.text, ...(meta ? { source: name, chunk: c.i, start: c.start, end: c.end, [unit]: c.size } : {}) }))
  const sizes = (chunks ?? []).map((c) => c.size)
  return (
    <ToolGrid
      main={<>
        <div><Label hint={`${fmtNum(text.length)} characters`}>Document</Label><Textarea aria-label="Document" value={text} onChange={(e) => { setText(e.target.value); setChunks(null) }} className="min-h-48 font-mono text-[13px]" /></div>
        <Dropzone compact accept=".txt,.md,.markdown,.html,.csv,.json,.py,.js,.ts" onFiles={async (f) => { if (!f[0]) return; setText(await f[0].text()); setName(f[0].name.replace(/\.[^.]+$/, '')); setChunks(null) }} label="Or drop a text or Markdown file" sub="TXT, MD, HTML, code. Read on your device." />
        <TokProgress tk={tk} />
        {chunks && <>
          <Stats cols={4}><Stat label="Chunks" value={fmtNum(chunks.length)} /><Stat label={`Average ${unit}`} value={sizes.length ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length) : 0} /><Stat label="Smallest" value={sizes.length ? Math.min(...sizes) : 0} /><Stat label="Largest" value={sizes.length ? Math.max(...sizes) : 0} tone={sizes.some((s) => s > size) ? 'bad' : undefined} /></Stats>
          <Panel title="Chunks" hint="Shaded text at the start of a chunk is the overlap with the one before.">
            <ol className="max-h-[32rem] space-y-2 overflow-auto pr-1 scrollbar-thin">
              {chunks.map((c, i) => { const prevEnd = i ? chunks[i - 1].end : 0; const ov = i && c.start < prevEnd ? Math.min(c.text.length, prevEnd - c.start) : 0; return (
                <li key={i} className="rounded-xl border border-border p-2.5" style={{ borderLeft: `4px solid ${pal(i)}` }}>
                  <div className="mb-1 flex flex-wrap gap-3 text-[11px] text-muted"><b className="text-fg">#{i}</b><span>{c.size} {unit}</span><span>characters {c.start} to {c.end}</span>{ov > 0 && <span>{ov} characters overlap</span>}</div>
                  <div className="font-mono text-[12.5px] whitespace-pre-wrap break-words"><mark className="rounded-sm bg-accent/20 text-fg">{c.text.slice(0, ov)}</mark>{c.text.slice(ov)}</div>
                </li>) })}
            </ol>
          </Panel>
        </>}
      </>}
      side={<>
        <div><Label>Split by</Label><Select aria-label="Split by" value={mode} onChange={(v) => setMode(v as keyof typeof SPLITTERS)} options={[{ value: 'markdown', label: 'Markdown headings, then paragraphs' }, { value: 'text', label: 'Paragraphs, lines, sentences' }, { value: 'code', label: 'Code blocks and functions' }]} /></div>
        <div><Label>Measure size in</Label><Select aria-label="Measure size in" value={unit} onChange={(v) => { const u = v as Unit; setUnit(u); setSize(u === 'chars' ? 1000 : u === 'words' ? 200 : 256); setOverlap(u === 'chars' ? 150 : u === 'words' ? 30 : 32) }} options={[{ value: 'chars', label: 'Characters' }, { value: 'words', label: 'Words' }, { value: 'tokens', label: 'Tokens' }]} /></div>
        {unit === 'tokens' && <div><Label>Tokenizer</Label><Select aria-label="Tokenizer" value={tk.model} onChange={tk.setModel} options={[{ value: QUICK, label: 'Quick estimate (no download)' }, ...TOKENIZERS.map((t) => ({ value: t.value as string, label: t.label }))]} /></div>}
        <Slider label="Chunk size" value={Math.min(size, max)} min={unit === 'chars' ? 100 : 20} max={max} step={unit === 'chars' ? 50 : 8} suffix={` ${unit}`} onChange={(v) => { setSize(v); if (overlap >= v) setOverlap(Math.floor(v / 4)) }} />
        <Slider label="Overlap" value={overlap} min={0} max={Math.floor(size / 2)} step={unit === 'chars' ? 10 : 2} suffix={` ${unit}`} onChange={setOverlap} />
        <Switch checked={meta} onChange={setMeta} label="Add source, position and size to each row" />
        <Button className="w-full" icon={<Scissors className="size-4" />} loading={tk.busy} onClick={go}>Split into chunks</Button>
        {chunks && chunks.length > 0 && <div className="grid gap-2">
          <DlButton name={`${name}-chunks.jsonl`} mime="application/jsonl" data={() => rows.map((r) => JSON.stringify(r)).join('\n') + '\n'}>JSONL</DlButton>
          <DlButton name={`${name}-chunks.json`} mime="application/json" data={() => JSON.stringify(rows, null, 2)}>JSON</DlButton>
          <DlButton name={`${name}-chunks.csv`} mime="text/csv" data={() => toCsv([Object.keys(rows[0]), ...rows.map((r) => Object.values(r))])}>CSV</DlButton>
        </div>}
        <p className="text-xs text-muted">Chunks break at the largest natural boundary that fits: headings, then paragraphs, lines, sentences and words. Each chunk is an exact slice of your text, so you can map answers back to the source.</p>
      </>}
    />
  )
}
