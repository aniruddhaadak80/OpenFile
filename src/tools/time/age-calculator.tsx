import { useMemo, useState } from 'react'
import { Card, Input, Label } from '@/components/ui'
import { ageBetween, parseYmd, MONTHS } from '@/lib/cf/time'
import { Stat, Stats, today } from '@/lib/cf/ui'

const ZODIAC: [number, number, string][] = [[1, 20, 'Capricorn'], [2, 19, 'Aquarius'], [3, 21, 'Pisces'], [4, 20, 'Aries'], [5, 21, 'Taurus'], [6, 21, 'Gemini'], [7, 23, 'Cancer'], [8, 23, 'Leo'], [9, 23, 'Virgo'], [10, 23, 'Libra'], [11, 22, 'Scorpio'], [12, 22, 'Sagittarius'], [12, 32, 'Capricorn']]
const CHINESE = ['Monkey', 'Rooster', 'Dog', 'Pig', 'Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat']
const n = (x: number) => x.toLocaleString()

export default function AgeCalculator() {
  const [dob, setDob] = useState('2000-01-15'), [on, setOn] = useState(today())
  const r = useMemo(() => { const b = parseYmd(dob), d = parseYmd(on); if (!b || !d) return null; if (b > d) return 'later'; return ageBetween(b, d) }, [dob, on])
  const b = parseYmd(dob)
  const z = b ? ZODIAC.find(([m, d]) => b.getMonth() + 1 < m || (b.getMonth() + 1 === m && b.getDate() < d))![2] : ''
  const miles = b && r && typeof r !== 'string' ? [10000, 15000, 20000, 25000, 30000].map((days) => ({ days, date: new Date(+b + days * 864e5) })).filter((x) => x.date > new Date(+new Date(on) - 365 * 864e5)).slice(0, 3) : []
  return (
    <div className="space-y-4">
      <Card className="grid gap-3 sm:grid-cols-2"><div><Label>Date of birth</Label><Input aria-label="Date of birth" type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></div><div><Label>Age on</Label><Input aria-label="Age on" type="date" value={on} onChange={(e) => setOn(e.target.value)} /></div></Card>
      {r === 'later' && <p className="text-sm text-danger">The birth date is after the second date.</p>}
      {r && typeof r !== 'string' && <>
        <Card className="text-center"><div className="font-display text-4xl font-bold">{r.years} years, {r.months} months, {r.days} days</div><div className="mt-1 text-sm text-muted">Born on a {r.weekday}</div></Card>
        <Stats cols={4}><Stat label="Total months" value={n(r.totalMonths)} /><Stat label="Total weeks" value={n(r.totalWeeks)} /><Stat label="Total days" value={n(r.totalDays)} /><Stat label="About hours" value={n(r.hours)} /></Stats>
        <Stats cols={4}><Stat label="Next birthday" value={<span className="text-base">{r.nextBirthday.getDate()} {MONTHS[r.nextBirthday.getMonth()]}</span>} sub={r.daysToBirthday === 0 ? 'today, happy birthday' : `in ${r.daysToBirthday} days, turning ${r.years + 1}`} tone="good" /><Stat label="Star sign" value={<span className="text-base">{z}</span>} /><Stat label="Chinese zodiac" value={<span className="text-base">{CHINESE[b!.getFullYear() % 12]}</span>} sub="by calendar year" /><Stat label="Generation" value={<span className="text-base">{b!.getFullYear() >= 2013 ? 'Gen Alpha' : b!.getFullYear() >= 1997 ? 'Gen Z' : b!.getFullYear() >= 1981 ? 'Millennial' : b!.getFullYear() >= 1965 ? 'Gen X' : 'Boomer or older'}</span>} /></Stats>
        {miles.length > 0 && <Card className="text-sm"><div className="mb-1 font-semibold">Day milestones</div>{miles.map((m) => <div key={m.days} className="flex justify-between"><span>{n(m.days)} days old</span><span className="text-muted">{m.date.toDateString()}</span></div>)}</Card>}
      </>}
    </div>
  )
}
