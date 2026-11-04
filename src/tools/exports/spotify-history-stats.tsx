import { useEffect, useMemo, useState } from 'react'
import { Label, Select, ToolGrid, Segmented, Input, Empty } from '@/components/ui'
import { Stat, Stats } from '@/lib/cf/ui'
import { parseSpotify, spotifyStats, WEEKDAYS, type Play } from '@/lib/r15/exports'
import { useExport, ExportDrop, readJson, Columns, hourData, Panel, fmtDate, fmtNum, LocalNote } from '@/lib/r15/ui'
import { Bars, DlButton, toCsv } from '@/lib/bcat/kit'

const pick = (p: string) => /(streaming_?history|streamhistory|endsong)[^/]*\.json$/i.test(p) || (/\.json$/i.test(p) && !p.includes('/'))
export default function SpotifyHistoryStats() {
  const ex = useExport(pick)
  const [plays, setPlays] = useState<Play[]>([]), [err, setErr] = useState<string | null>(null)
  const [by, setBy] = useState<'minutes' | 'plays'>('minutes'), [min, setMin] = useState('30'), [from, setFrom] = useState(''), [to, setTo] = useState(''), [tab, setTab] = useState<'artists' | 'tracks' | 'albums' | 'shows'>('artists')
  useEffect(() => { (async () => {
    setErr(null)
    const all: Play[] = []
    for (const e of ex.entries) { try { const j = await readJson(e); if (Array.isArray(j)) all.push(...parseSpotify(j)) } catch { /* skip files that are not history */ } }
    if (ex.entries.length && !all.length) setErr('No listening history was found. Use the StreamingHistory or Streaming_History_Audio JSON files from your Spotify data.')
    setPlays(all.sort((a, b) => a.t.getTime() - b.t.getTime()))
  })() }, [ex.entries])
  const s = useMemo(() => (plays.length ? spotifyStats(plays, { by, minMs: +min * 1000, from: from ? new Date(from + 'T00:00:00') : undefined, to: to ? new Date(to + 'T23:59:59') : undefined }) : null), [plays, by, min, from, to])
  const list = s ? (tab === 'artists' ? s.artists : tab === 'tracks' ? s.tracks : tab === 'albums' ? s.albums : s.shows) : []
  const unit = by === 'minutes' ? ' min' : ''
  return (
    <ToolGrid
      main={<>
        <ExportDrop st={{ ...ex, error: ex.error ?? err }} accept=".zip,.json" label="Drop your Spotify data ZIP or history JSON files" sub="Account data (StreamingHistory_music) or Extended streaming history (Streaming_History_Audio). Read in your browser." />
        {s ? <>
          <Stats cols={4}>
            <Stat label="Listening time" value={`${fmtNum(Math.round(s.hours))} h`} sub={`${fmtNum(Math.round(s.hours / 24))} days of sound`} />
            <Stat label="Plays" value={fmtNum(s.plays)} sub={`over ${min} s`} />
            <Stat label="Artists" value={fmtNum(s.uniqueArtists)} sub={`${fmtNum(s.uniqueTracks)} different tracks`} />
            <Stat label={s.skipRate != null ? 'Skipped' : 'Period'} value={s.skipRate != null ? `${s.skipRate}%` : <span className="text-base">{fmtDate(s.first)}</span>} sub={s.skipRate != null ? 'of tracks started' : `to ${fmtDate(s.last)}`} />
          </Stats>
          <Columns label="Hours per month" data={s.months.map((m) => ({ label: m.label.slice(2), value: m.value }))} color="#6EE7B7" unit=" h" />
          <Panel title="Top 50">
            <Segmented className="mb-3" value={tab} onChange={setTab} options={[{ value: 'artists', label: 'Artists' }, { value: 'tracks', label: 'Tracks' }, ...(s.albums.length ? [{ value: 'albums' as const, label: 'Albums' }] : []), ...(s.shows.length ? [{ value: 'shows' as const, label: 'Podcasts' }] : [])]} />
            {list.length ? <Bars items={list} unit={unit} color="#F5A524" /> : <p className="text-sm text-muted">Nothing here for this period.</p>}
          </Panel>
          <div className="grid gap-4 md:grid-cols-2">
            <Columns label="Hours by time of day" data={hourData(s.hourOfDay)} color="#22D3EE" unit=" h" />
            <Columns label="Hours by day of week" data={s.weekdays.map((value, i) => ({ label: WEEKDAYS[i], value }))} color="#14B8A6" unit=" h" />
          </div>
          {s.topDay && <p className="text-sm text-muted">Your biggest day was {s.topDay.label} with {fmtNum(Math.round(s.topDay.value))} minutes. {s.extended ? '' : 'Request the Extended streaming history to see your whole account life, skips and albums.'}</p>}
        </> : ex.entries.length > 0 && !err && <Empty>Reading your history...</Empty>}
      </>}
      side={<>
        <div><Label>Rank by</Label><Segmented value={by} onChange={setBy} options={[{ value: 'minutes', label: 'Minutes' }, { value: 'plays', label: 'Plays' }]} /></div>
        <div><Label>Count a play after</Label><Select aria-label="Count a play after" value={min} onChange={setMin} options={[{ value: '0', label: 'Any length' }, { value: '30', label: '30 seconds (like Spotify)' }, { value: '60', label: '1 minute' }]} /></div>
        <div className="grid grid-cols-2 gap-2"><div><Label>From</Label><Input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div><div><Label>To</Label><Input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div></div>
        {s && <div className="grid gap-2">
          <DlButton name="spotify-top-artists.csv" mime="text/csv" data={() => toCsv([['artist', by], ...s.artists.map((a) => [a.label, a.value])])}>Top artists CSV</DlButton>
          <DlButton name="spotify-top-tracks.csv" mime="text/csv" data={() => toCsv([['track', by], ...s.tracks.map((a) => [a.label, a.value])])}>Top tracks CSV</DlButton>
          <DlButton name="spotify-plays.csv" mime="text/csv" data={() => toCsv([['time', 'artist', 'track', 'album', 'seconds', 'skipped', 'type'], ...plays.map((p) => [p.t.toISOString(), p.artist, p.track, p.album ?? '', Math.round(p.ms / 1000), p.skipped == null ? '' : p.skipped ? 'yes' : 'no', p.kind])])}>Every play CSV</DlButton>
        </div>}
        <p className="text-xs text-muted">Ask for your data at Spotify, Account, Privacy settings. Account data arrives in a few days with the last year. Extended streaming history takes up to 30 days and covers your whole account.</p>
        <LocalNote />
      </>}
    />
  )
}
