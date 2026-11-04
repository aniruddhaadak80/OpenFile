import { useEffect, useMemo, useState } from 'react'
import { Label, Select, ToolGrid, Empty, Input } from '@/components/ui'
import { Stat, Stats } from '@/lib/cf/ui'
import { parseWhatsApp, waStats, WEEKDAYS, type WaChat } from '@/lib/r15/exports'
import { useExport, ExportDrop, Columns, hourData, Panel, fmtDate, fmtNum, LocalNote } from '@/lib/r15/ui'
import { Bars, DlButton, toCsv } from '@/lib/bcat/kit'

const pick = (p: string) => /\.txt$/i.test(p)
export default function WhatsAppChatAnalyzer() {
  const ex = useExport(pick)
  const [raw, setRaw] = useState(''), [order, setOrder] = useState<'auto' | 'dmy' | 'mdy' | 'ymd'>('auto'), [q, setQ] = useState('')
  useEffect(() => { (async () => { if (!ex.entries.length) { setRaw(''); return } const main = ex.entries.find((e) => /_chat\.txt$|whatsapp chat/i.test(e.path)) ?? ex.entries.sort((a, b) => b.size - a.size)[0]; setRaw(await main.read()) })() }, [ex.entries])
  const chat: WaChat | null = useMemo(() => (raw ? parseWhatsApp(raw, order === 'auto' ? undefined : order) : null), [raw, order])
  const s = useMemo(() => (chat?.messages.length ? waStats(chat) : null), [chat])
  const found = useMemo(() => (q.trim() && chat ? chat.messages.filter((m) => m.text.toLowerCase().includes(q.toLowerCase())).slice(-200) : []), [q, chat])
  return (
    <ToolGrid
      main={<>
        <ExportDrop sample="whatsapp" st={ex} accept=".txt,.zip" label="Drop a WhatsApp chat export" sub="The .txt or .zip from Export chat on Android or iPhone. Read in your browser, never uploaded." />
        {chat && !s && <Empty>No messages could be read. Check the date order on the right.</Empty>}
        {s && chat && <>
          <Stats cols={4}>
            <Stat label="Messages" value={fmtNum(s.total)} sub={`${s.people.length} people`} />
            <Stat label="Time span" value={<span className="text-base">{fmtDate(s.first)}</span>} sub={`to ${fmtDate(s.last)}, ${fmtNum(s.days)} days`} />
            <Stat label="Active days" value={fmtNum(s.activeDays)} sub={`longest streak ${s.streak} days`} />
            <Stat label="Busiest day" value={<span className="text-base">{s.busiestDay?.label ?? '-'}</span>} sub={s.busiestDay ? `${s.busiestDay.value} messages` : undefined} />
          </Stats>
          <Panel title="People">
            <div className="overflow-auto scrollbar-thin"><table className="w-full text-left text-xs"><thead><tr className="text-muted"><th className="py-1 pr-3">Name</th><th className="pr-3 text-right">Messages</th><th className="pr-3 text-right">Share</th><th className="pr-3 text-right">Words</th><th className="pr-3 text-right">Words per message</th><th className="pr-3 text-right">Media</th><th className="pr-3 text-right">Emoji</th><th className="pr-3 text-right">Starts chats</th><th className="text-right">Typical reply</th></tr></thead>
              <tbody>{s.people.map((p) => <tr key={p.who} className="border-t border-border/60"><td className="max-w-[12rem] truncate py-1 pr-3 font-medium" title={p.who}>{p.who}</td><td className="pr-3 text-right font-mono">{fmtNum(p.messages)}</td><td className="pr-3 text-right font-mono">{Math.round((p.messages / s.total) * 100)}%</td><td className="pr-3 text-right font-mono">{fmtNum(p.words)}</td><td className="pr-3 text-right font-mono">{p.avgWords}</td><td className="pr-3 text-right font-mono">{fmtNum(p.media)}</td><td className="pr-3 text-right font-mono">{fmtNum(p.emoji)}</td><td className="pr-3 text-right font-mono">{p.starts}</td><td className="text-right font-mono">{p.medianReplyMin == null ? '-' : p.medianReplyMin < 60 ? `${p.medianReplyMin} min` : `${(p.medianReplyMin / 60).toFixed(1)} h`}</td></tr>)}</tbody></table></div>
          </Panel>
          <Columns label="Messages per month" data={s.months.map((m) => ({ label: m.label.slice(2), value: m.value }))} color="#6EE7B7" />
          <div className="grid gap-4 md:grid-cols-2">
            <Columns label="By hour of day" data={hourData(s.hours)} color="#F5A524" />
            <Columns label="By day of week" data={s.weekdays.map((value, i) => ({ label: WEEKDAYS[i], value }))} color="#22D3EE" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Most used words"><Bars items={s.topWords.slice(0, 15)} color="#6EE7B7" /></Panel>
            <Panel title="Most used emoji">{s.topEmoji.length ? <div className="flex flex-wrap gap-2">{s.topEmoji.map((e) => <span key={e.label} className="rounded-lg border border-border px-2 py-1 text-sm"><span className="text-lg">{e.label}</span> <span className="font-mono text-xs text-muted">{e.value}</span></span>)}</div> : <p className="text-sm text-muted">No emoji in this chat.</p>}</Panel>
          </div>
          <Panel title="Search messages"><Input aria-label="Search messages" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a word" />{q.trim() && <ul className="mt-2 max-h-72 space-y-1 overflow-auto text-sm scrollbar-thin">{found.length ? found.map((m, i) => <li key={i} className="rounded-lg bg-surface-2/40 px-2 py-1"><span className="text-xs text-muted">{m.t.toLocaleString()} · {m.who}</span><div className="whitespace-pre-wrap">{m.text}</div></li>) : <li className="text-muted">No matches.</li>}</ul>}</Panel>
        </>}
      </>}
      side={<>
        <div><Label>Date order</Label><Select aria-label="Date order" value={order} onChange={(v) => setOrder(v as typeof order)} options={[{ value: 'auto', label: `Detect (now ${chat?.order === 'mdy' ? 'month first' : chat?.order === 'ymd' ? 'year first' : 'day first'})` }, { value: 'dmy', label: 'Day first (31/12/2025)' }, { value: 'mdy', label: 'Month first (12/31/25)' }, { value: 'ymd', label: 'Year first (2025-12-31)' }]} /></div>
        {s && chat && <div className="grid gap-2">
          <DlButton name="whatsapp-messages.csv" mime="text/csv" data={() => toCsv([['date', 'time', 'sender', 'message', 'media'], ...chat.messages.map((m) => [m.t.toISOString().slice(0, 10), m.t.toTimeString().slice(0, 8), m.who, m.text, m.media ? 'yes' : ''])])}>All messages CSV</DlButton>
          <DlButton name="whatsapp-people.csv" mime="text/csv" data={() => toCsv([['name', 'messages', 'words', 'media', 'emoji', 'deleted', 'starts', 'median_reply_minutes'], ...s.people.map((p) => [p.who, p.messages, p.words, p.media, p.emoji, p.deleted, p.starts, p.medianReplyMin ?? ''])])}>People summary CSV</DlButton>
          <DlButton name="whatsapp-chat.json" mime="application/json" data={() => JSON.stringify(chat.messages.map((m) => ({ time: m.t.toISOString(), sender: m.who, text: m.text, media: m.media })), null, 1)}>Messages JSON</DlButton>
        </div>}
        <p className="text-xs text-muted">To export: open the chat in WhatsApp, tap the name or the three dots, then Export chat and Without media. Group chats work too.</p>
        <LocalNote />
      </>}
    />
  )
}
