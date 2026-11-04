import { useEffect, useMemo, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Input, Label, ToolGrid, Segmented, Empty } from '@/components/ui'
import { Stat, Stats } from '@/lib/cf/ui'
import { igUsers, igKind, compareFollows, type IgUser } from '@/lib/r15/exports'
import { useExport, ExportDrop, Panel, fmtDate, fmtNum, LocalNote } from '@/lib/r15/ui'
import { DlButton, toCsv } from '@/lib/bcat/kit'

const pick = (p: string) => igKind(p) != null
export default function InstagramFollowersChecker() {
  const ex = useExport(pick)
  const [fr, setFr] = useState<IgUser[] | null>(null), [fg, setFg] = useState<IgUser[] | null>(null), [err, setErr] = useState<string | null>(null)
  const [tab, setTab] = useState<'notBack' | 'fans' | 'mutual'>('notBack'), [q, setQ] = useState('')
  useEffect(() => { (async () => {
    setErr(null); setFr(null); setFg(null)
    if (!ex.entries.length) return
    const a: IgUser[] = [], b: IgUser[] = []
    try { for (const e of ex.entries) { const k = igKind(e.path); const u = igUsers(await e.read()); (k === 'followers' ? a : b).push(...u) } } catch (e: any) { setErr(`Could not read this file: ${e?.message || e}`); return }
    const kinds = new Set(ex.entries.map((e) => igKind(e.path)))
    if (!kinds.has('followers') || !kinds.has('following')) setErr(`Found only your ${kinds.has('followers') ? 'followers' : 'following'} list. Drop both followers_1.json and following.json, or the whole ZIP.`)
    setFr(a); setFg(b)
  })() }, [ex.entries])
  const c = useMemo(() => (fr && fg ? compareFollows(fr, fg) : null), [fr, fg])
  const list = (c?.[tab] ?? []).filter((u) => !q || u.user.toLowerCase().includes(q.toLowerCase()))
  const label = { notBack: 'Do not follow you back', fans: 'You do not follow back', mutual: 'Follow each other' }
  return (
    <ToolGrid
      main={<>
        <ExportDrop st={{ ...ex, error: ex.error ?? err }} accept=".zip,.json,.html" label="Drop your Instagram export ZIP, or followers_1.json and following.json" sub="JSON or HTML from Download your information. Read in your browser, never uploaded, no login." />
        {c ? <>
          <Stats cols={4}>
            <Stat label="Followers" value={fmtNum(fr!.length)} />
            <Stat label="Following" value={fmtNum(fg!.length)} />
            <Stat label="Not following back" value={fmtNum(c.notBack.length)} tone={c.notBack.length ? 'warn' : 'good'} />
            <Stat label="Mutual" value={fmtNum(c.mutual.length)} />
          </Stats>
          <Panel title={label[tab]} hint={`${list.length} accounts`}>
            <div className="mb-3 flex flex-wrap items-center gap-2"><Segmented value={tab} onChange={setTab} options={[{ value: 'notBack', label: `Not back (${c.notBack.length})` }, { value: 'fans', label: `Fans (${c.fans.length})` }, { value: 'mutual', label: `Mutual (${c.mutual.length})` }]} /><Input aria-label="Filter accounts" className="max-w-xs" placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            {list.length ? <ul className="grid max-h-[30rem] gap-1 overflow-auto sm:grid-cols-2 scrollbar-thin">{list.map((u) => <li key={u.user} className="flex items-center gap-2 rounded-lg border border-border/60 px-2 py-1.5 text-sm"><span className="min-w-0 flex-1 truncate font-medium">@{u.user}</span>{u.t && <span className="text-[11px] text-muted">{fmtDate(u.t)}</span>}<a className="text-muted hover:text-fg" href={`https://www.instagram.com/${encodeURIComponent(u.user)}/`} target="_blank" rel="noopener noreferrer" aria-label={`Open @${u.user} on Instagram`}><ExternalLink className="size-3.5" /></a></li>)}</ul> : <p className="text-sm text-muted">No accounts in this list.</p>}
          </Panel>
        </> : !ex.entries.length && <Empty>Your lists stay on this device. Nothing signs in to Instagram.</Empty>}
      </>}
      side={<>
        {c && <div className="grid gap-2">
          <DlButton name="instagram-not-following-back.csv" mime="text/csv" data={() => toCsv([['username', 'profile', 'followed_on'], ...c.notBack.map((u) => [u.user, `https://www.instagram.com/${u.user}/`, u.t ? u.t.toISOString().slice(0, 10) : ''])])}>Not following back CSV</DlButton>
          <DlButton name="instagram-fans.csv" mime="text/csv" data={() => toCsv([['username', 'profile', 'since'], ...c.fans.map((u) => [u.user, `https://www.instagram.com/${u.user}/`, u.t ? u.t.toISOString().slice(0, 10) : ''])])}>Fans CSV</DlButton>
          <DlButton name="instagram-mutual.csv" mime="text/csv" data={() => toCsv([['username'], ...c.mutual.map((u) => [u.user])])}>Mutual CSV</DlButton>
        </div>}
        <div><Label>How to get the files</Label>
          <ol className="list-decimal space-y-1 pl-4 text-xs text-muted"><li>In Instagram open Accounts Center, Your information and permissions, Download your information.</li><li>Pick Some of your information, then Followers and following.</li><li>Choose Download to device, format JSON (HTML also works), date range All time.</li><li>When the email arrives, download the ZIP and drop it here.</li></ol></div>
        <p className="text-xs text-muted">This tool never signs in or calls Instagram, so it cannot get your account blocked. Lists are as old as your export.</p>
        <LocalNote />
      </>}
    />
  )
}
