// Interactive demos for the AI Builder and Data Exports posts (round 15).
import { useMemo, useState } from 'react'
import { chunkText, estimateTokens, SPLITTERS, checkRow } from '@/lib/r15/llm'
import { parseWhatsApp, waStats, compareFollows } from '@/lib/r15/exports'

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

const ROWS = `{"messages":[{"role":"system","content":"You answer in one short line."},{"role":"user","content":"Capital of France?"},{"role":"assistant","content":"Paris."}]}
{"messages":[{"role":"user","content":"Say hi"},{"role":"user","content":"Please"}]}
{"instruction":"Translate to Hindi","input":"Thank you","output":""}
{"prompt":"2 + 2 =","completion":" 4"}
{"messages":[{"role":"user","content":"Capital of France?"},{"role":"assistant","content":"Paris."}],}`

export function DatasetDemo() {
  const [text, setText] = useState(ROWS)
  const rows = useMemo(() => text.split(/\r?\n/).map((ln, i) => ({ ln, i })).filter((r) => r.ln.trim()).map(({ ln, i }) => {
    try { const c = checkRow(JSON.parse(ln)); return { line: i + 1, fmt: c.fmt, errors: c.errors, warns: c.warns } } catch { return { line: i + 1, fmt: 'not JSON', errors: ['This line is not valid JSON.'], warns: [] as string[] } }
  }), [text])
  return (
    <div className={box}>
      <textarea aria-label="JSONL rows" value={text} onChange={(e) => setText(e.target.value)} className="h-36 w-full rounded-xl border border-border bg-bg p-2 font-mono text-[11px]" spellCheck={false} />
      <ul className="mt-2 space-y-1 text-sm">{rows.map((r) => (
        <li key={r.line} className="flex flex-wrap items-baseline gap-2"><span className="w-14 shrink-0 font-mono text-xs text-muted">line {r.line}</span><span className="rounded-md bg-surface-2 px-1.5 text-xs">{r.fmt}</span>
          {!r.errors.length && !r.warns.length ? <span className="text-success">fine</span> : <span><span className="text-danger">{r.errors.join(' ')}</span> <span className="text-warn">{r.warns.join(' ')}</span></span>}</li>
      ))}</ul>
      <p className="mt-2 text-xs text-muted">These are the same rules the Fine-tune Dataset Checker runs on every line. Fix a line and watch its note change.</p>
    </div>
  )
}

const FOLLOWERS = 'asha.clicks\nravi_runs\nmeera.codes\ntara_reads\nneel.bakes'
const FOLLOWING = 'asha.clicks\nRavi_Runs\nkabir.art\nzoya_travels\nneel.bakes'
export function FollowDemo() {
  const [a, setA] = useState(FOLLOWERS), [b, setB] = useState(FOLLOWING)
  const r = useMemo(() => {
    const list = (s: string) => s.split(/[\s,]+/).map((x) => x.trim().replace(/^@/, '')).filter(Boolean).map((user) => ({ user }))
    return compareFollows(list(a), list(b))
  }, [a, b])
  const col = (title: string, xs: { user: string }[], tone: string) => <div><div className={`text-xs font-semibold ${tone}`}>{title} ({xs.length})</div><ul className="mt-1 font-mono text-[12px]">{xs.map((u) => <li key={u.user}>{u.user}</li>)}</ul></div>
  return (
    <div className={box}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted">Your followers<textarea aria-label="Followers" value={a} onChange={(e) => setA(e.target.value)} className="mt-1 h-28 w-full rounded-xl border border-border bg-bg p-2 font-mono text-[12px]" spellCheck={false} /></label>
        <label className="text-xs text-muted">People you follow<textarea aria-label="Following" value={b} onChange={(e) => setB(e.target.value)} className="mt-1 h-28 w-full rounded-xl border border-border bg-bg p-2 font-mono text-[12px]" spellCheck={false} /></label>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">{col('Not following you back', r.notBack, 'text-warn')}{col('Fans you do not follow', r.fans, 'text-accent')}{col('Mutual', r.mutual, 'text-success')}</div>
      <p className="mt-2 text-xs text-muted">Names are compared without case, the same way the Instagram Followers Checker does it. Nothing here signs in anywhere.</p>
    </div>
  )
}
