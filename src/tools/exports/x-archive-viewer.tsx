import { useEffect, useMemo, useState } from 'react'
import { Input, Label, ToolGrid, Empty, Segmented } from '@/components/ui'
import { Stat, Stats } from '@/lib/cf/ui'
import { parseXArchive, xStats, WEEKDAYS, type Post } from '@/lib/r15/exports'
import { useExport, ExportDrop, plainError, Columns, hourData, Panel, fmtDate, fmtNum, LocalNote } from '@/lib/r15/ui'
import { Bars, DlButton, toCsv } from '@/lib/bcat/kit'

const pick = (p: string) => /(^|\/)(data\/)?tweets?(-part\d+)?\.js$/i.test(p) || (!p.includes('/') && /\.(js|json)$/i.test(p))
export default function XArchiveViewer() {
  const ex = useExport(pick)
  const [posts, setPosts] = useState<Post[]>([]), [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState(''), [kind, setKind] = useState<'all' | 'own' | 'replies' | 'reposts'>('own')
  useEffect(() => { (async () => {
    setErr(null); setPosts([])
    const all: Post[] = []
    for (const e of ex.entries) { try { all.push(...parseXArchive(await e.read())) } catch (x: any) { if (ex.entries.length === 1) setErr(plainError(x)) } }
    if (ex.entries.length && !all.length) setErr((m) => m ?? 'No posts were found. Drop data/tweets.js from your X archive, or the whole ZIP.')
    const seen = new Set<string>(); setPosts(all.filter((p) => (p.id && seen.has(p.id) ? false : (seen.add(p.id), true))).sort((a, b) => a.t.getTime() - b.t.getTime()))
  })() }, [ex.entries])
  const s = useMemo(() => (posts.length ? xStats(posts) : null), [posts])
  const ql = q.trim().toLowerCase()
  const list = useMemo(() => posts.filter((p) => (kind === 'all' || (kind === 'own' && !p.repost && !p.reply) || (kind === 'replies' && p.reply) || (kind === 'reposts' && p.repost)) && (!ql || p.text.toLowerCase().includes(ql))).slice().reverse(), [posts, kind, ql])
  const md = () => list.slice().reverse().map((p) => `## ${p.t.toISOString().slice(0, 16).replace('T', ' ')}\n\n${p.text}\n\n${p.likes} likes, ${p.reposts} reposts\n`).join('\n')
  return (
    <ToolGrid
      main={<>
        <ExportDrop st={{ ...ex, error: ex.error ?? err }} accept=".zip,.js,.json" label="Drop your X (Twitter) archive" sub="The archive ZIP or data/tweets.js. Read in your browser, never uploaded." />
        {s ? <>
          <Stats cols={4}>
            <Stat label="Posts" value={fmtNum(s.total)} sub={`${fmtNum(s.original)} original`} />
            <Stat label="Replies" value={fmtNum(s.replies)} sub={`${fmtNum(s.reposts)} reposts`} />
            <Stat label="Likes received" value={fmtNum(s.likes)} sub="on your own posts" />
            <Stat label="Period" value={<span className="text-base">{fmtDate(s.first)}</span>} sub={`to ${fmtDate(s.last)}`} />
          </Stats>
          <Columns label="Posts per month" data={s.months.map((m) => ({ label: m.label.slice(2), value: m.value }))} color="#6EE7B7" />
          <div className="grid gap-4 md:grid-cols-2">
            <Columns label="By hour of day" data={hourData(s.hourOfDay)} color="#F5A524" />
            <Columns label="By day of week" data={s.weekdays.map((value, i) => ({ label: WEEKDAYS[i], value }))} color="#22D3EE" />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Panel title="Words you use most"><Bars items={s.words.slice(0, 12)} color="#6EE7B7" /></Panel>
            <Panel title="People you mention">{s.mentions.length ? <Bars items={s.mentions.slice(0, 12)} color="#F5A524" /> : <p className="text-sm text-muted">None</p>}</Panel>
            <Panel title="Hashtags and sites">{s.tags.length || s.domains.length ? <Bars items={[...s.tags.slice(0, 6), ...s.domains.slice(0, 6)]} color="#22D3EE" /> : <p className="text-sm text-muted">None</p>}</Panel>
          </div>
          <Panel title="Your posts" hint={`${fmtNum(list.length)} shown, newest first`}>
            <div className="mb-2 flex flex-wrap gap-2"><Segmented value={kind} onChange={setKind} options={[{ value: 'own', label: 'Posts' }, { value: 'replies', label: 'Replies' }, { value: 'reposts', label: 'Reposts' }, { value: 'all', label: 'All' }]} /><Input aria-label="Search posts" className="max-w-xs" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <ul className="max-h-[30rem] space-y-2 overflow-auto scrollbar-thin">{list.slice(0, 300).map((p) => <li key={p.id || p.t.getTime()} className="rounded-xl border border-border/60 p-2.5 text-sm"><div className="mb-1 text-[11px] text-muted">{p.t.toLocaleString()}{p.reply ? ` · reply to @${p.reply}` : ''} · {p.likes} likes · {p.reposts} reposts</div><div className="whitespace-pre-wrap break-words">{p.text}</div></li>)}</ul>
          </Panel>
        </> : null}
        {!ex.entries.length && <Empty>Your archive stays on this device.</Empty>}
      </>}
      side={<>
        {s && <div className="grid gap-2">
          <DlButton name="x-posts.csv" mime="text/csv" data={() => toCsv([['id', 'time', 'text', 'likes', 'reposts', 'reply_to', 'is_repost', 'hashtags', 'links'], ...posts.map((p) => [p.id, p.t.toISOString(), p.text, p.likes, p.reposts, p.reply ?? '', p.repost ? 'yes' : '', p.tags.join(' '), p.urls.join(' ')])])}>Every post CSV</DlButton>
          <DlButton name="x-posts.md" mime="text/markdown" data={md}>Shown posts as Markdown</DlButton>
          <DlButton name="x-best-posts.csv" mime="text/csv" data={() => toCsv([['time', 'text', 'likes', 'reposts'], ...s.best.map((p) => [p.t.toISOString(), p.text, p.likes, p.reposts])])}>Top 10 posts CSV</DlButton>
        </div>}
        {s?.best[0] && <div><Label>Your most liked post</Label><p className="rounded-xl bg-surface-2/50 p-2 text-sm">{s.best[0].text}</p><p className="mt-1 text-xs text-muted">{s.best[0].likes} likes, {s.best[0].reposts} reposts</p></div>}
        <p className="text-xs text-muted">Get it at Settings, Your account, Download an archive of your data. Links in posts show as t.co short links, the same as in the archive.</p>
        <LocalNote />
      </>}
    />
  )
}
