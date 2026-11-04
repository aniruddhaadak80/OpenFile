import { useEffect, useMemo, useState } from 'react'
import { Input, Label, ToolGrid, Empty, Switch } from '@/components/ui'
import { Stat, Stats } from '@/lib/cf/ui'
import { parseYouTubeJson, parseYouTubeHtml, watchStats, WEEKDAYS, type Watch } from '@/lib/r15/exports'
import { useExport, ExportDrop, Columns, hourData, Panel, fmtDate, fmtNum, LocalNote } from '@/lib/r15/ui'
import { Bars, DlButton, toCsv } from '@/lib/bcat/kit'

const pick = (p: string) => /watch-history\.(json|html)$/i.test(p) || (!p.includes('/') && /\.(json|html)$/i.test(p))
export default function YouTubeHistoryStats() {
  const ex = useExport(pick)
  const [all, setAll] = useState<Watch[]>([]), [err, setErr] = useState<string | null>(null)
  const [music, setMusic] = useState(true), [from, setFrom] = useState(''), [to, setTo] = useState('')
  useEffect(() => { (async () => {
    setErr(null); setAll([])
    const out: Watch[] = []
    for (const e of ex.entries) { const t = await e.read(); try { out.push(...(/^\s*\[/.test(t) ? parseYouTubeJson(JSON.parse(t)) : parseYouTubeHtml(t))) } catch { /* not a history file */ } }
    if (ex.entries.length && !out.length) setErr('No watched videos were found. Use watch-history.json or watch-history.html from Google Takeout (YouTube and YouTube Music, history).')
    setAll(out.sort((a, b) => a.t.getTime() - b.t.getTime()))
  })() }, [ex.entries])
  const ws = useMemo(() => { const a = from ? new Date(from + 'T00:00:00') : null, b = to ? new Date(to + 'T23:59:59') : null; return all.filter((w) => (music || !w.music) && (!a || w.t >= a) && (!b || w.t <= b)) }, [all, music, from, to])
  const s = useMemo(() => (ws.length ? watchStats(ws) : null), [ws])
  return (
    <ToolGrid
      main={<>
        <ExportDrop st={{ ...ex, error: ex.error ?? err }} accept=".zip,.json,.html" label="Drop your YouTube watch history" sub="watch-history.json or .html from Google Takeout, or the whole Takeout ZIP. Read in your browser." />
        {s ? <>
          <Stats cols={4}>
            <Stat label="Videos watched" value={fmtNum(s.total)} sub={`${fmtNum(s.uniqueChannels)} channels`} />
            <Stat label="Per active day" value={s.perDay} sub={`${fmtNum(s.days)} days`} />
            <Stat label="From" value={<span className="text-base">{fmtDate(s.first)}</span>} sub={`to ${fmtDate(s.last)}`} />
            <Stat label="Top channel" value={<span className="text-base">{s.channels[0]?.label ?? '-'}</span>} sub={s.channels[0] ? `${s.channels[0].value} videos` : undefined} />
          </Stats>
          <Columns label="Videos per month" data={s.months.map((m) => ({ label: m.label.slice(2), value: m.value }))} color="#6EE7B7" />
          <div className="grid gap-4 md:grid-cols-2">
            <Columns label="By hour of day" data={hourData(s.hourOfDay)} color="#F5A524" />
            <Columns label="By day of week" data={s.weekdays.map((value, i) => ({ label: WEEKDAYS[i], value }))} color="#22D3EE" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Top channels"><Bars items={s.channels.slice(0, 20)} color="#6EE7B7" /></Panel>
            <Panel title="Watched more than once">{s.rewatched.length ? <Bars items={s.rewatched} color="#F5A524" /> : <p className="text-sm text-muted">No video was watched twice.</p>}</Panel>
          </div>
        </> : ex.entries.length > 0 && !err ? <Empty>Reading your history...</Empty> : null}
      </>}
      side={<>
        <Switch checked={music} onChange={setMusic} label="Include YouTube Music" />
        <div className="grid grid-cols-2 gap-2"><div><Label>From</Label><Input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div><div><Label>To</Label><Input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div></div>
        {s && <div className="grid gap-2">
          <DlButton name="youtube-history.csv" mime="text/csv" data={() => toCsv([['time', 'title', 'channel', 'url', 'music'], ...ws.map((w) => [w.t.toISOString(), w.title, w.channel, w.url ?? '', w.music ? 'yes' : ''])])}>Watch history CSV</DlButton>
          <DlButton name="youtube-channels.csv" mime="text/csv" data={() => toCsv([['channel', 'videos'], ...s.channels.map((c) => [c.label, c.value])])}>Top channels CSV</DlButton>
        </div>}
        <p className="text-xs text-muted">In Google Takeout pick only YouTube and YouTube Music, then under All YouTube data included keep history. Choose JSON for the history format if you can; HTML works too. Ads are left out.</p>
        <LocalNote />
      </>}
    />
  )
}
