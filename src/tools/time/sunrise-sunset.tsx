import { useMemo, useState } from 'react'
import { Download, LocateFixed } from 'lucide-react'
import { Button, Card, Input, Label } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { addDays, parseYmd, sunTimes, ymd } from '@/lib/cf/time'
import { parseLatLon } from '@/lib/cf/geo'
import { toCsvText } from '@/lib/cf/sheet'
import { Stat, Stats, today } from '@/lib/cf/ui'

const CITIES: [string, string][] = [['Kolkata', '22.5726, 88.3639'], ['Delhi', '28.6139, 77.2090'], ['Mumbai', '19.0760, 72.8777'], ['London', '51.5074, -0.1278'], ['New York', '40.7128, -74.0060'], ['Sydney', '-33.8688, 151.2093'], ['Tokyo', '35.6762, 139.6503'], ['Reykjavik', '64.1466, -21.9426']]
const hm = (d: Date | null) => (d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-')
const dur = (s: number) => `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`

export default function SunriseSunset() {
  const [pos, setPos] = useState('22.5726, 88.3639'), [date, setDate] = useState(today()), [err, setErr] = useState('')
  const P = parseLatLon(pos), D = parseYmd(date)
  const t = P && D ? sunTimes(D, P.lat, P.lon) : null
  const civ = P && D ? sunTimes(D, P.lat, P.lon, 96) : null
  const gold = P && D ? sunTimes(D, P.lat, P.lon, 84) : null
  const year = useMemo(() => (P && D ? Array.from({ length: 365 }, (_, i) => { const d = addDays(new Date(D.getFullYear(), 0, 1), i); return { d, ...sunTimes(d, P.lat, P.lon) } }) : []), [pos, D?.getFullYear()])
  const locate = () => navigator.geolocation?.getCurrentPosition((p) => setPos(`${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)}`), () => setErr('Location permission was refused. Type the coordinates instead.'))
  const maxLen = Math.max(1, ...year.map((y) => y.dayLength))
  return (
    <div className="space-y-4">
      <Card className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <div><Label>Place (latitude, longitude)</Label><Input value={pos} onChange={(e) => setPos(e.target.value)} className="font-mono" /></div>
        <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <Button variant="outline" icon={<LocateFixed className="size-4" />} onClick={locate}>Use my location</Button>
        <div className="flex flex-wrap gap-1.5 sm:col-span-3">{CITIES.map(([n, c]) => <button key={n} onClick={() => setPos(c)} className="rounded-lg border border-border px-2 py-0.5 text-xs text-muted hover:text-fg cursor-pointer">{n}</button>)}</div>
        {err && <p className="text-sm text-warn sm:col-span-3">{err}</p>}
      </Card>
      {t && <>
        <Stats cols={4}><Stat label="Sunrise" value={hm(t.rise)} tone="good" /><Stat label="Sunset" value={hm(t.set)} /><Stat label="Day length" value={<span className="text-base">{t.polar === 'day' ? 'Sun up all day' : t.polar === 'night' ? 'Sun down all day' : dur(t.dayLength)}</span>} /><Stat label="Solar noon" value={hm(t.noon)} /></Stats>
        <Stats cols={4}><Stat label="First light" value={hm(civ!.rise)} sub="civil dawn" /><Stat label="Last light" value={hm(civ!.set)} sub="civil dusk" /><Stat label="Morning golden hour ends" value={hm(gold!.rise)} /><Stat label="Evening golden hour starts" value={hm(gold!.set)} /></Stats>
        <Card className="space-y-2"><div className="flex items-center justify-between"><Label className="mb-0">Day length through {D!.getFullYear()}</Label><Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([toCsvText([['date', 'sunrise', 'sunset', 'day_length_min'], ...year.map((y) => [ymd(y.d), hm(y.rise), hm(y.set), Math.round(y.dayLength / 60)])])], { type: 'text/csv' }), `sun-times-${D!.getFullYear()}.csv`)}>Year as CSV</Button></div>
          <svg viewBox="0 0 365 100" className="h-32 w-full" preserveAspectRatio="none" role="img" aria-label="Day length chart"><polyline fill="none" stroke="#F5A524" strokeWidth="1.5" points={year.map((y, i) => `${i},${100 - (y.dayLength / maxLen) * 95}`).join(' ')} /><line x1={dayIndex(D!)} x2={dayIndex(D!)} y1="0" y2="100" stroke="#22D3EE" strokeWidth="1" /></svg>
        </Card>
        <p className="text-xs text-muted">Times are shown in your device's time zone and are accurate to about a minute. Hills and buildings can hide the sun for longer.</p>
      </>}
    </div>
  )
}
function dayIndex(d: Date) { return Math.round((+d - +new Date(d.getFullYear(), 0, 1)) / 864e5) }
