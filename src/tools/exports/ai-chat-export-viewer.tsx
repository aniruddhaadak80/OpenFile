import { useEffect, useMemo, useState } from 'react'
import { Input, Label, ToolGrid, Empty, Segmented } from '@/components/ui'
import { Stat, Stats, OutBox } from '@/lib/cf/ui'
import { parseChats, chatToMarkdown, safeName, type Conversation } from '@/lib/r15/exports'
import { useExport, ExportDrop, plainError, Columns, Panel, fmtDate, fmtNum, LocalNote } from '@/lib/r15/ui'
import { DlButton } from '@/lib/bcat/kit'
import { downloadBlob } from '@/lib/files'
import { Button } from '@/components/ui'
import { Download } from 'lucide-react'

const pick = (p: string) => /(^|\/)conversations\.json$/i.test(p) || (/\.json$/i.test(p) && !p.includes('/'))
export default function AiChatExportViewer() {
  const ex = useExport(pick)
  const [chats, setChats] = useState<Conversation[]>([]), [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState(''), [sel, setSel] = useState<string | null>(null), [view, setView] = useState<'read' | 'md'>('read'), [zipping, setZipping] = useState(false)
  useEffect(() => { (async () => {
    setErr(null); setChats([]); setSel(null)
    const all: Conversation[] = []
    for (const e of ex.entries) { try { all.push(...parseChats(await e.read())) } catch (x: any) { if (ex.entries.length === 1) setErr(plainError(x)) } }
    if (ex.entries.length && !all.length) setErr((m) => m ?? 'No conversations were found. Drop conversations.json from a ChatGPT or Claude export, or the whole ZIP.')
    setChats(all); setSel(all[0]?.id ?? null)
  })() }, [ex.entries])
  const ql = q.trim().toLowerCase()
  const shown = useMemo(() => (ql ? chats.filter((c) => c.title.toLowerCase().includes(ql) || c.messages.some((m) => m.text.toLowerCase().includes(ql))) : chats), [chats, ql])
  const cur = chats.find((c) => c.id === sel) ?? null
  const months = useMemo(() => { const m = new Map<string, number>(); for (const c of chats) if (c.created) { const k = c.created.toISOString().slice(2, 7); m.set(k, (m.get(k) ?? 0) + 1) } return [...m.entries()].sort().map(([label, value]) => ({ label, value })) }, [chats])
  const words = useMemo(() => chats.reduce((a, c) => a + c.messages.reduce((b, m) => b + (m.text.match(/\S+/g)?.length ?? 0), 0), 0), [chats])
  const zipAll = async () => {
    setZipping(true)
    try {
      const JSZip = (await import('jszip')).default
      const z = new JSZip(), used = new Set<string>()
      for (const c of shown) { let n = `${c.created ? c.created.toISOString().slice(0, 10) + ' ' : ''}${safeName(c.title)}`, k = 2; while (used.has(n)) n = `${n} ${k++}`; used.add(n); z.file(`${n}.md`, chatToMarkdown(c)) }
      downloadBlob(await z.generateAsync({ type: 'blob', compression: 'DEFLATE' }), ql ? 'chats-search.zip' : 'chats-markdown.zip')
    } finally { setZipping(false) }
  }
  const hl = (t: string) => { if (!ql) return t; const parts = t.split(new RegExp(`(${ql.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')); return parts.map((p, i) => (i % 2 ? <mark key={i} className="rounded bg-accent/30 text-fg">{p}</mark> : p)) }
  return (
    <ToolGrid
      main={<>
        <ExportDrop st={{ ...ex, error: ex.error ?? err }} accept=".zip,.json" label="Drop a ChatGPT or Claude data export" sub="The export ZIP or conversations.json. Read in your browser, never uploaded." />
        {chats.length > 0 && <>
          <Stats cols={4}><Stat label="Chats" value={fmtNum(chats.length)} sub={[...new Set(chats.map((c) => c.source))].join(' and ')} /><Stat label="Messages" value={fmtNum(chats.reduce((a, c) => a + c.messages.length, 0))} /><Stat label="Words" value={fmtNum(words)} /><Stat label="First chat" value={<span className="text-base">{fmtDate(chats.reduce<Date | undefined>((a, c) => (c.created && (!a || c.created < a) ? c.created : a), undefined))}</span>} /></Stats>
          {months.length > 1 && <Columns label="New chats per month" data={months} color="#6EE7B7" />}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
            <Panel title="Chats" hint={ql ? `${shown.length} match` : undefined}>
              <ul className="max-h-[34rem] space-y-0.5 overflow-auto scrollbar-thin">{shown.map((c) => <li key={c.id}><button type="button" onClick={() => setSel(c.id)} className={`w-full rounded-lg px-2 py-1.5 text-left text-sm ${c.id === sel ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface-2/60 hover:text-fg'}`}><span className="line-clamp-2">{c.title}</span><span className="text-[11px] opacity-70">{fmtDate(c.created)} · {c.messages.length} messages</span></button></li>)}</ul>
            </Panel>
            {cur ? <Panel title={cur.title} hint={`${cur.source}${cur.model ? ` · ${cur.model}` : ''} · ${fmtDate(cur.created)}`}>
              <Segmented className="mb-3" value={view} onChange={setView} options={[{ value: 'read', label: 'Read' }, { value: 'md', label: 'Markdown' }]} />
              {view === 'read' ? <ol className="max-h-[34rem] space-y-3 overflow-auto pr-1 scrollbar-thin">{cur.messages.map((m, i) => <li key={i} className={`rounded-xl p-3 text-sm whitespace-pre-wrap break-words ${m.role === 'user' ? 'ml-6 bg-accent/10' : 'mr-6 bg-surface-2/60'}`}><div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{m.role === 'user' ? 'You' : m.role === 'tool' ? 'Tool' : cur.source}</div>{hl(m.text)}</li>)}</ol>
                : <OutBox text={chatToMarkdown(cur)} filename={`${safeName(cur.title)}.md`} mime="text/markdown" />}
            </Panel> : <Empty>Pick a chat.</Empty>}
          </div>
        </>}
      </>}
      side={<>
        <div><Label>Search every chat</Label><Input aria-label="Search every chat" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Words in titles or messages" /></div>
        {chats.length > 0 && <div className="grid gap-2">
          <Button icon={<Download className="size-4" />} loading={zipping} onClick={zipAll}>{ql ? `${shown.length} found chats` : 'All chats'} as Markdown ZIP</Button>
          {cur && <DlButton name={`${safeName(cur.title)}.md`} mime="text/markdown" data={() => chatToMarkdown(cur)}>This chat as Markdown</DlButton>}
          <DlButton name="chats.json" mime="application/json" data={() => JSON.stringify(shown.map((c) => ({ title: c.title, source: c.source, model: c.model, created: c.created, messages: c.messages.map((m) => ({ role: m.role, text: m.text })) })), null, 1)}>Clean JSON</DlButton>
        </div>}
        <p className="text-xs text-muted">ChatGPT: Settings, Data controls, Export data. Claude: Settings, Privacy, Export data. Only the visible branch of each chat is shown, the same one you saw last.</p>
        <LocalNote />
      </>}
    />
  )
}
