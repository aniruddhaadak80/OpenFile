import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Button, Card, CopyButton, Input, Label, Select, Switch, Textarea } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { buildIcs, parseYmd, type CalEvent } from '@/lib/cf/time'
import { today } from '@/lib/cf/ui'

const gd = (d: Date, allDay: boolean) => (allDay ? d.toISOString().slice(0, 10).replace(/-/g, '') : d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''))

export default function IcsCreator() {
  const [title, setTitle] = useState('Project kickoff'), [date, setDate] = useState(today()), [start, setStart] = useState('10:00'), [end, setEnd] = useState('11:00'), [allDay, setAllDay] = useState(false)
  const [loc, setLoc] = useState('Room 4 or https://meet.example.com/abc'), [desc, setDesc] = useState('Agenda: goals, owners, dates.'), [url, setUrl] = useState(''), [alarm, setAlarm] = useState('15'), [repeat, setRepeat] = useState('')
  const ev = useMemo((): CalEvent | null => {
    const d = parseYmd(date); if (!d) return null
    const [sh, sm] = start.split(':').map(Number), [eh, em] = end.split(':').map(Number)
    const s = new Date(d); const e = new Date(d)
    if (!allDay) { s.setHours(sh || 0, sm || 0); e.setHours(eh || 0, em || 0); if (e <= s) e.setDate(e.getDate() + 1) }
    return { summary: title || 'Event', start: s, end: allDay ? undefined : e, allDay, location: loc, description: desc, url: url || undefined, alarmMin: alarm ? +alarm : undefined, rrule: repeat || undefined }
  }, [title, date, start, end, allDay, loc, desc, url, alarm, repeat])
  const ics = ev ? buildIcs([ev], { name: title }) : ''
  const endD = ev ? (ev.end ?? new Date(+ev.start + 864e5)) : null
  const gcal = ev ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(ev.summary)}&dates=${gd(ev.start, allDay)}/${gd(endD!, allDay)}&details=${encodeURIComponent(desc)}&location=${encodeURIComponent(loc)}${repeat ? `&recur=${encodeURIComponent('RRULE:' + repeat)}` : ''}` : ''
  const outlook = ev ? `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(ev.summary)}&startdt=${ev.start.toISOString()}&enddt=${endD!.toISOString()}&body=${encodeURIComponent(desc)}&location=${encodeURIComponent(loc)}${allDay ? '&allday=true' : ''}` : ''
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3">
        <div><Label>Title</Label><Input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="grid grid-cols-3 gap-2"><div className="col-span-3 sm:col-span-1"><Label>Date</Label><Input aria-label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>{!allDay && <><div><Label>Starts</Label><Input aria-label="Starts" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></div><div><Label>Ends</Label><Input aria-label="Ends" type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></div></>}</div>
        <Switch checked={allDay} onChange={setAllDay} label="All day" />
        <div><Label>Place or meeting link</Label><Input aria-label="Place or meeting link" value={loc} onChange={(e) => setLoc(e.target.value)} /></div>
        <div><Label>Details</Label><Textarea aria-label="Details" value={desc} onChange={(e) => setDesc(e.target.value)} className="min-h-20 font-sans" /></div>
        <div className="grid grid-cols-2 gap-2"><label className="block"><Label>Reminder</Label><Select value={alarm} onChange={setAlarm} options={[{ value: '', label: 'None' }, { value: '10', label: '10 minutes before' }, { value: '15', label: '15 minutes before' }, { value: '60', label: '1 hour before' }, { value: '1440', label: '1 day before' }]} /></label>
          <label className="block"><Label>Repeats</Label><Select value={repeat} onChange={setRepeat} options={[{ value: '', label: 'Does not repeat' }, { value: 'FREQ=DAILY', label: 'Every day' }, { value: 'FREQ=WEEKLY', label: 'Every week' }, { value: 'FREQ=WEEKLY;INTERVAL=2', label: 'Every 2 weeks' }, { value: 'FREQ=MONTHLY', label: 'Every month' }, { value: 'FREQ=YEARLY', label: 'Every year' }]} /></label></div>
        <div><Label>Web link (optional)</Label><Input aria-label="Web link (optional)" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
      </Card>
      <div className="space-y-3">
        <Card className="space-y-3"><div className="text-xs text-muted">Times use your device time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}) and are saved in UTC, so everyone sees their own local time.</div>
          <Button className="w-full" icon={<Download className="size-4" />} disabled={!ev} onClick={() => downloadBlob(new Blob([ics], { type: 'text/calendar' }), `${(title || 'event').replace(/\W+/g, '-').toLowerCase()}.ics`)}>Download .ics (Apple, Outlook, Google)</Button>
          <div className="grid gap-2 sm:grid-cols-2"><div className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm"><span>Google link</span><CopyButton text={gcal} /></div><div className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm"><span>Outlook link</span><CopyButton text={outlook} /></div></div>
          <p className="text-xs text-muted">Paste the links into an email or page as "Add to calendar" buttons. Nothing goes through our servers.</p></Card>
        <pre className="max-h-72 overflow-auto rounded-xl border border-border bg-surface-2/60 p-3 font-mono text-[11px]">{ics}</pre>
      </div>
    </div>
  )
}
