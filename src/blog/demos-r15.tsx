// Interactive demos for the AI Builder and Data Exports posts (round 15).
import { useMemo, useState } from 'react'
import { chunkText, estimateTokens, SPLITTERS } from '@/lib/r15/llm'
import { parseWhatsApp, waStats } from '@/lib/r15/exports'

const box = 'not-prose my-6 rounded-2xl border border-border bg-surface p-4'
const COLS = ['#F5A524', '#14B8A6', '#22D3EE', '#10B981', '#38BDF8', '#EAB308']

const DOC = `# Opening hours

The shop is open from 9 to 6 on weekdays and 10 to 4 on Saturdays. We close on Sundays and public holidays.

## Parking

There are six free spaces behind the building. Street parking is free after 6 pm.

## Returns

Bring the item and the receipt within 30 days. Opened software cannot be returned.`

export function ChunkDemo() {
  const [size, setSize] = useState(160), [overlap, setOverlap] = useState(30)
  const chunks = useMemo(() => chunkText(DOC, { size, overlap, separators: SPLITTERS.markdown }), [size, overlap])
  return (
    <div className={box}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted">Chunk size: {size} characters<input aria-label="Chunk size" type="range" min={60} max={400} step={10} value={size} onChange={(e) => { const v = +e.target.value; setSize(v); if (overlap >= v / 2) setOverlap(Math.floor(v / 4)) }} className="w-full" /></label>
        <label className="text-xs text-muted">Overlap: {overlap} characters<input aria-label="Overlap" type="range" min={0} max={Math.floor(size / 2)} step={5} value={overlap} onChange={(e) => setOverlap(+e.target.value)} className="w-full" /></label>
      </div>
      <p className="mt-2 text-xs text-muted">{chunks.length} chunks, about {chunks.reduce((a, c) => a + estimateTokens(c.text), 0)} tokens in total. Move the sliders and watch where the cuts land.</p>
      <ol className="mt-2 space-y-2">{chunks.map((c, i) => <li key={i} className="rounded-xl border border-border p-2 font-mono text-[12px] whitespace-pre-wrap" style={{ borderLeft: `4px solid ${COLS[i % COLS.length]}` }}><span className="text-muted">#{i} · {c.size} chars · </span>{c.text}</li>)}</ol>
    </div>
  )
}

const CHAT = `12/03/2026, 08:02 - Asha: Morning, are we still on for the trek? 🥾
12/03/2026, 08:05 - Ravi: Yes, leaving at 6 tomorrow
12/03/2026, 08:06 - Ravi: Bring water and a jacket
12/03/2026, 08:30 - Meera: Count me in 🙌
12/03/2026, 21:14 - Asha: Packed. See you at 6
13/03/2026, 05:58 - Ravi: Outside your gate 🚗`

export function ChatDemo() {
  const [text, setText] = useState(CHAT)
  const s = useMemo(() => { const c = parseWhatsApp(text); return c.messages.length ? waStats(c) : null }, [text])
  return (
    <div className={box}>
      <textarea aria-label="Chat export text" value={text} onChange={(e) => setText(e.target.value)} className="h-36 w-full rounded-xl border border-border bg-bg p-2 font-mono text-[11px]" spellCheck={false} />
      {s ? <table className="mt-2 w-full text-sm"><thead><tr className="text-left text-xs text-muted"><th>Name</th><th className="text-right">Messages</th><th className="text-right">Emoji</th><th className="text-right">Typical reply</th></tr></thead><tbody>{s.people.map((p) => <tr key={p.who} className="border-t border-border"><td className="py-1">{p.who}</td><td className="text-right font-mono">{p.messages}</td><td className="text-right font-mono">{p.emoji}</td><td className="text-right font-mono">{p.medianReplyMin == null ? '-' : `${p.medianReplyMin} min`}</td></tr>)}</tbody></table>
        : <p className="mt-2 text-sm text-warn">No messages found. Each line should start with a date and time, then a name and a colon.</p>}
      <p className="mt-2 text-xs text-muted">This is the same parser the WhatsApp Chat Analyzer uses. Edit a line, add a name, or change the times.</p>
    </div>
  )
}
