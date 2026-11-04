import { useEffect, useMemo, useState } from 'react'
import { Label, Select, ToolGrid, Empty, Segmented } from '@/components/ui'
import { Stat, Stats } from '@/lib/cf/ui'
import { parseNetflix, netflixOrder, netflixStats, WEEKDAYS } from '@/lib/r15/exports'
import { useExport, ExportDrop, Columns, hourData, Panel, fmtDate, fmtNum, LocalNote } from '@/lib/r15/ui'
import { Bars, DlButton, toCsv } from '@/lib/bcat/kit'

const pick = (p: string) => /(viewingactivity|netflixviewinghistory|viewing_activity)[^/]*\.csv$/i.test(p) || (!p.includes('/') && /\.csv$/i.test(p))
export default function NetflixHistoryStats() {
  const ex = useExport(pick)
  const [rows, setRows] = useState<string[][] | null>(null), [order, setOrder] = useState<'auto' | 'mdy' | 'dmy'>('auto'), [profile, setProfile] = useState('all'), [rank, setRank] = useState<'hours' | 'episodes'>('hours')
  useEffect(() => { (async () => {
    setProfile('all')
    if (!ex.entries.length) { setRows(null); return }
    const e = ex.entries.find((x) => /viewingactivity/i.test(x.path)) ?? ex.entries[0]
    const Papa = (await import('papaparse')).default
    setRows(Papa.parse<string[]>(await e.read(), { skipEmptyLines: true }).data)
  })() }, [ex.entries])
  const res = useMemo(() => { if (!rows) return null; try { return { ...parseNetflix(rows, order === 'auto' ? netflixOrder(rows) : order), error: null } } catch (e: any) { return { views: [], format: '', error: e?.message as string } } }, [rows, order])
  const profiles = useMemo(() => [...new Set((res?.views ?? []).map((v) => v.profile).filter(Boolean))] as string[], [res])
  const views = useMemo(() => (res?.views ?? []).filter((v) => profile === 'all' || !profiles.includes(profile) || v.profile === profile), [res, profile, profiles])
  const s = useMemo(() => (views.length ? netflixStats(views) : null), [views])
  const top = s ? (rank === 'hours' && s.hasTime ? s.showHours : s.shows) : []
  return (
    <ToolGrid
      main={<>
        <ExportDrop st={{ ...ex, error: ex.error ?? res?.error ?? null }} accept=".zip,.csv" label="Drop your Netflix viewing history" sub="NetflixViewingHistory.csv from your profile page, or ViewingActivity.csv from a full data request. Read in your browser." />
        {s ? <>
          <Stats cols={4}>
            <Stat label={s.hasTime ? 'Hours watched' : 'Titles watched'} value={s.hasTime ? fmtNum(s.hours ?? 0) : fmtNum(s.total)} sub={s.hasTime ? `${fmtNum(Math.round((s.hours ?? 0) / 24))} days` : res?.format} />
            <Stat label="Episodes" value={fmtNum(s.episodes)} sub={`${fmtNum(s.shows.length)}${s.shows.length >= 25 ? '+' : ''} shows`} />
            <Stat label="Films" value={fmtNum(s.films)} />
            <Stat label="Period" value={<span className="text-base">{fmtDate(s.first)}</span>} sub={`to ${fmtDate(s.last)}`} />
          </Stats>
          <Columns label={s.hasTime ? 'Hours per month' : 'Titles per month'} data={s.months.map((m) => ({ label: m.label.slice(2), value: m.value }))} color="#6EE7B7" unit={s.hasTime ? ' h' : ''} />
          <Panel title="Top shows" hint={rank === 'hours' && s.hasTime ? 'by hours' : 'by episodes'}>{s.hasTime && <Segmented className="mb-3" value={rank} onChange={setRank} options={[{ value: 'hours', label: 'Hours' }, { value: 'episodes', label: 'Episodes' }]} />}<Bars items={top} unit={rank === 'hours' && s.hasTime ? ' h' : ''} color="#F5A524" /></Panel>
          <div className="grid gap-4 md:grid-cols-2">
            {s.hourOfDay ? <Columns label="Start time of day" data={hourData(s.hourOfDay)} color="#22D3EE" /> : null}
            <Columns label="By day of week" data={s.weekdays.map((value, i) => ({ label: WEEKDAYS[i], value }))} color="#14B8A6" />
          </div>
          {s.binge.length > 0 && <Panel title="Biggest binges" hint="3 or more episodes of one show in a day"><Bars items={s.binge} color="#6EE7B7" /></Panel>}
          {s.devices.length > 1 && <Panel title="Devices"><Bars items={s.devices} color="#22D3EE" /></Panel>}
        </> : rows && !res?.error && <Empty>No views were found in this file.</Empty>}
        {!ex.entries.length && <Empty>Your viewing history stays on this device.</Empty>}
      </>}
      side={<>
        {profiles.length > 1 && <div><Label>Profile</Label><Select aria-label="Profile" value={profile} onChange={setProfile} options={[{ value: 'all', label: 'Everyone' }, ...profiles.map((p) => ({ value: p, label: p }))]} /></div>}
        {res?.format.startsWith('Netflix') && <div><Label>Date order in the file</Label><Select aria-label="Date order" value={order} onChange={(v) => setOrder(v as typeof order)} options={[{ value: 'auto', label: 'Detect' }, { value: 'mdy', label: 'Month first (1/31/25)' }, { value: 'dmy', label: 'Day first (31/1/25)' }]} /></div>}
        {s && <div className="grid gap-2">
          <DlButton name="netflix-shows.csv" mime="text/csv" data={() => toCsv([['show', 'episodes', 'hours'], ...s.shows.map((x) => [x.label, x.value, s.showHours.find((h) => h.label === x.label)?.value ?? ''])])}>Shows CSV</DlButton>
          <DlButton name="netflix-history.csv" mime="text/csv" data={() => toCsv([['date', 'title', 'show', 'type', 'minutes', 'profile', 'device'], ...views.map((v) => [v.t.toISOString().slice(0, 16), v.title, v.show, v.kind, v.sec != null ? Math.round(v.sec / 60) : '', v.profile ?? '', v.device ?? ''])])}>Clean history CSV</DlButton>
        </div>}
        <p className="text-xs text-muted">Quick file: Account, Profiles, pick a profile, Viewing activity, Download all. It has titles and dates. For hours and devices, ask for your personal information at netflix.com/account/getmyinfo and drop ViewingActivity.csv. Trailers and previews are left out.</p>
        <LocalNote />
      </>}
    />
  )
}
