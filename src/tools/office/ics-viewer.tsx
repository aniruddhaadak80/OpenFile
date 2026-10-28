import { useMemo, useState } from 'react'
import { CalendarDays, MapPin, Repeat } from 'lucide-react'
import { Dropzone, Input, Label, Segmented, ToolGrid, Empty } from '@/components/ui'
import { TopBar } from '@/lib/b4/ui'
import { parseIcs, describeRrule, type IcsEvent } from '@/lib/bcat/office'
import { DlButton, toCsv } from '@/lib/bcat/kit'
import { Stat } from '@/tools/dev/_b5/shell'

const day = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
const when = (e: IcsEvent) => !e.start ? 'No date' : e.allDay ? 'All day' : `${time(e.start)}${e.end ? ' to ' + time(e.end) : ''}`
const iso = (d?: Date) => (d ? d.toISOString() : '')

export default function IcsViewer() {
  const [file, setFile] = useState<File | null>(null)
  const [cal, setCal] = useState<{ name?: string; events: IcsEvent[] } | null>(null)
  const [q, setQ] = useState('')
  const [range, setRange] = useState<'all' | 'upcoming' | 'past'>('all')
  const [err, setErr] = useState<string | null>(null)
  const open = async (f: File) => { setFile(f); setErr(null); try { const c = parseIcs(await f.text()); if (!c.events.length) setErr('No events found in this file.'); setCal(c) } catch (e: any) { setErr(e?.message) } }

  const list = useMemo(() => {
    const now = Date.now(), t = q.toLowerCase()
    return (cal?.events ?? []).filter((e) => (range === 'all' || (range === 'upcoming' ? (e.end ?? e.start)?.getTime()! >= now : (e.end ?? e.start)?.getTime()! < now)) && (!t || [e.summary, e.location, e.description, e.organizer].some((x) => x?.toLowerCase().includes(t))))
  }, [cal, q, range])
  const groups = useMemo(() => { const m = new Map<string, IcsEvent[]>(); for (const e of list) { const k = e.start ? day(e.start) : 'No date'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(e) } return [...m.entries()] }, [list])

  if (!file) return <Dropzone accept=".ics,.ical,.ifb,.icalendar" onFiles={(f) => open(f[0])} label="Drop a calendar file (ICS)" sub="Read invites and exported calendars as an agenda, search them, and save as CSV or JSON." />
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <TopBar file={file} onReset={() => { setFile(null); setCal(null) }} />
          {err && <Empty>{err}</Empty>}
          {cal && cal.events.length > 0 && <div className="grid grid-cols-3 gap-2"><Stat label="Events" value={cal.events.length} /><Stat label="First" value={<span className="text-sm">{cal.events[0].start ? cal.events[0].start.toLocaleDateString() : '-'}</span>} /><Stat label="Last" value={<span className="text-sm">{cal.events.at(-1)?.start?.toLocaleDateString() ?? '-'}</span>} /></div>}
          {groups.map(([d, evs]) => (
            <div key={d}>
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted"><CalendarDays className="size-3.5 text-accent" />{d}</div>
              <div className="space-y-2">{evs.map((e, i) => (
                <div key={i} className="rounded-2xl border border-border bg-surface p-3">
                  <div className="flex flex-wrap items-baseline gap-2"><span className="font-medium">{e.summary || '(no title)'}</span><span className="text-xs text-muted">{when(e)}{e.tz && e.tz !== 'UTC' ? ` (${e.tz})` : ''}</span>{e.status && e.status !== 'CONFIRMED' && <span className="rounded-full bg-warn/15 px-2 text-[10px] text-warn">{e.status.toLowerCase()}</span>}</div>
                  {e.location && <div className="mt-1 flex items-center gap-1 text-xs text-muted"><MapPin className="size-3" />{e.location}</div>}
                  {e.rrule && <div className="mt-1 flex items-center gap-1 text-xs text-muted"><Repeat className="size-3" />{describeRrule(e.rrule)}</div>}
                  {e.organizer && <div className="mt-1 text-xs text-muted">Organiser: {e.organizer}{e.attendees.length ? ` · ${e.attendees.length} guests` : ''}</div>}
                  {e.description && <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap text-sm text-muted">{e.description}</p>}
                </div>
              ))}</div>
            </div>
          ))}
          {cal && !list.length && cal.events.length > 0 && <Empty>No events match.</Empty>}
        </div>
      }
      side={
        <>
          {cal?.name && <p className="font-medium">{cal.name}</p>}
          <div><Label>Search</Label><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title, place, people" /></div>
          <div><Label>Show</Label><Segmented value={range} onChange={setRange} options={[{ value: 'all', label: 'All' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }]} /></div>
          {list.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <DlButton variant="primary" name="calendar.csv" mime="text/csv" data={() => toCsv([['title', 'start', 'end', 'all_day', 'location', 'organizer', 'attendees', 'repeats', 'description'], ...list.map((e) => [e.summary, iso(e.start), iso(e.end), e.allDay ? 'yes' : 'no', e.location ?? '', e.organizer ?? '', e.attendees.join('; '), describeRrule(e.rrule), e.description ?? ''])])}>CSV</DlButton>
              <DlButton name="calendar.json" mime="application/json" data={() => JSON.stringify(list.map((e) => ({ ...e, start: iso(e.start), end: iso(e.end) })), null, 2)}>JSON</DlButton>
              <DlButton name="agenda.md" mime="text/markdown" data={() => groups.map(([d, evs]) => `## ${d}\n\n${evs.map((e) => `- **${e.summary}** ${when(e)}${e.location ? `, ${e.location}` : ''}`).join('\n')}`).join('\n\n')}>Agenda</DlButton>
            </div>
          )}
          <p className="text-xs text-muted">Times are shown in your device time zone. Repeating events are listed once with their rule.</p>
        </>
      }
    />
  )
}
