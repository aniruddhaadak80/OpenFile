import { useEffect, useMemo, useState } from 'react'
import { Plus, X, Clock, CalendarClock, Globe2, RotateCcw } from 'lucide-react'
import { Button, Input, Segmented, Select, Label, CopyButton, cn } from '@/components/ui'
import { useStored } from '../dev/_b5/shell'
import { allZones, fmtOffset, tzOffsetMinutes, wallParts, zonedToDate, zoneCity } from '@/lib/b5/tz'

const LOCAL = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
const DEFAULTS = [LOCAL, 'UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'].filter((z, i, a) => a.indexOf(z) === i)
const pad = (n: number) => String(n).padStart(2, '0')

export default function TimeZoneConverter() {
  const zones = useMemo(allZones, [])
  const [list, setList] = useStored<string[]>('b5:tz:list', DEFAULTS)
  const [mode, setMode] = useState<'convert' | 'clock' | 'planner'>('convert')
  const [src, setSrc] = useState(LOCAL)
  const now0 = wallParts(LOCAL, new Date())
  const [date, setDate] = useState(`${now0.y}-${pad(now0.mo)}-${pad(now0.d)}`)
  const [time, setTime] = useState(`${pad(now0.h)}:${pad(now0.mi)}`)
  const [h24, setH24] = useStored('b5:tz:h24', true)
  const [add, setAdd] = useState('')
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])

  const instant = useMemo(() => {
    const [y, mo, d] = date.split('-').map(Number); const [h, mi] = time.split(':').map(Number)
    if (!y || isNaN(h)) return null
    return zonedToDate(y, mo, d, h, mi || 0, src)
  }, [date, time, src])

  const fmt = (tz: string, at: Date, opts: Intl.DateTimeFormatOptions = {}) => new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: !h24, ...opts }).format(at)
  const addZone = (z: string) => { if (z && zones.includes(z) && !list.includes(z)) setList([...list, z]); setAdd('') }
  const matches = add ? zones.filter((z) => z.toLowerCase().includes(add.toLowerCase().replace(/ /g, '_'))).slice(0, 8) : []

  const refDay = instant ?? now
  const srcDay = wallParts(src, refDay)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'convert', label: <span className="inline-flex items-center gap-1.5"><CalendarClock className="size-3.5" />Convert</span> }, { value: 'clock', label: <span className="inline-flex items-center gap-1.5"><Clock className="size-3.5" />World clock</span> }, { value: 'planner', label: <span className="inline-flex items-center gap-1.5"><Globe2 className="size-3.5" />Meeting planner</span> }]} />
        <Segmented value={h24 ? '24' : '12'} onChange={(v) => setH24(v === '24')} options={[{ value: '24', label: '24 h' }, { value: '12', label: '12 h' }]} />
        <div className="relative ml-auto w-full sm:w-72">
          <Input value={add} onChange={(e) => setAdd(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) addZone(matches[0]) }} placeholder="Add a city or zone, e.g. Berlin" aria-label="Add time zone" />
          {matches.length > 0 && (
            <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
              {matches.map((z) => <button key={z} onClick={() => addZone(z)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-2"><span>{zoneCity(z)}</span><span className="text-xs text-muted">{z}</span></button>)}
            </div>
          )}
        </div>
      </div>

      {mode === 'convert' && (
        <div className="grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[1fr_auto_auto_auto]">
          <label className="block"><Label>From zone</Label><Select value={src} onChange={setSrc} options={zones} /></label>
          <div><Label>Date</Label><Input aria-label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><Label>Time</Label><Input aria-label="Time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          <div className="flex items-end"><Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => { const p = wallParts(src, new Date()); setDate(`${p.y}-${pad(p.mo)}-${pad(p.d)}`); setTime(`${pad(p.h)}:${pad(p.mi)}`) }}>Now</Button></div>
        </div>
      )}

      {(mode === 'convert' || mode === 'clock') && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((z) => {
            const at = mode === 'clock' ? now : instant ?? now
            const p = wallParts(z, at)
            const off = tzOffsetMinutes(z, at)
            const dayDiff = Date.UTC(p.y, p.mo - 1, p.d) - Date.UTC(srcDay.y, srcDay.mo - 1, srcDay.d)
            const label = `${fmt(z, at)} ${fmt(z, at, { hour: undefined, minute: undefined, weekday: 'short', day: 'numeric', month: 'short' })}`
            const night = p.h < 7 || p.h >= 21
            return (
              <div key={z} className={cn('relative rounded-2xl border bg-surface p-4', z === src && mode === 'convert' ? 'border-accent' : 'border-border')}>
                <button onClick={() => setList(list.filter((x) => x !== z))} className="absolute right-2 top-2 rounded p-1 text-muted hover:text-danger" aria-label={`Remove ${z}`}><X className="size-4" /></button>
                <div className="text-sm font-semibold">{zoneCity(z)}{z === LOCAL && <span className="ml-2 text-xs font-normal text-accent">your zone</span>}</div>
                <div className="text-[11px] text-muted">{z} · {fmtOffset(off)}</div>
                <div className={cn('mt-2 font-display text-3xl font-semibold tabular-nums', night && 'text-muted')}>{fmt(z, at, mode === 'clock' ? { second: '2-digit' } : {})}</div>
                <div className="flex items-center gap-2 text-xs text-muted">
                  {fmt(z, at, { hour: undefined, minute: undefined, weekday: 'long', day: 'numeric', month: 'long' })}
                  {mode === 'convert' && dayDiff !== 0 && <span className="rounded bg-warn/15 px-1.5 text-warn">{dayDiff > 0 ? '+1 day' : '-1 day'}</span>}
                  <span className="ml-auto"><CopyButton text={`${label} (${z})`} label="" variant="ghost" /></span>
                </div>
                {mode === 'convert' && z !== src && <button className="mt-1 text-[11px] text-accent hover:underline" onClick={() => { const pp = wallParts(z, at); setSrc(z); setDate(`${pp.y}-${pad(pp.mo)}-${pad(pp.d)}`); setTime(`${pad(pp.h)}:${pad(pp.mi)}`) }}>Use as source</button>}
              </div>
            )
          })}
          <button onClick={() => document.querySelector<HTMLInputElement>('input[aria-label="Add time zone"]')?.focus()} className="grid min-h-32 place-items-center rounded-2xl border border-dashed border-border text-sm text-muted hover:border-accent hover:text-fg"><span className="inline-flex items-center gap-2"><Plus className="size-4" />Add a zone</span></button>
        </div>
      )}

      {mode === 'planner' && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted">Day in</span><Select aria-label="Day in time zone" value={src} onChange={setSrc} options={list} className="w-56" />
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
            <span className="flex items-center gap-3 text-xs text-muted"><span className="inline-block size-3 rounded bg-success/40" />work hours 9 to 17<span className="inline-block size-3 rounded bg-warn/30" />early or late<span className="inline-block size-3 rounded bg-surface-2" />night</span>
          </div>
          <div className="scrollbar-thin overflow-x-auto rounded-2xl border border-border bg-surface p-3">
            <table className="border-separate border-spacing-0.5 text-[11px]">
              <tbody>
                {list.map((z) => {
                  const [y, mo, d] = date.split('-').map(Number)
                  return (
                    <tr key={z}>
                      <th className="sticky left-0 z-10 min-w-32 bg-surface pr-2 text-left font-medium"><div>{zoneCity(z)}</div><div className="font-normal text-muted">{fmtOffset(tzOffsetMinutes(z, zonedToDate(y, mo, d, 12, 0, src)))}</div></th>
                      {Array.from({ length: 24 }, (_, h) => {
                        const at = zonedToDate(y, mo, d, h, 0, src)
                        const p = wallParts(z, at)
                        const bg = p.h >= 9 && p.h < 17 ? 'bg-success/40' : p.h >= 7 && p.h < 21 ? 'bg-warn/25' : 'bg-surface-2 text-muted'
                        return <td key={h} className={cn('h-10 w-11 rounded text-center font-mono', bg)} title={`${zoneCity(z)}: ${fmt(z, at, { weekday: 'short' })}`}>{h24 ? pad(p.h) : `${p.h % 12 || 12}${p.h < 12 ? 'a' : 'p'}`}{p.mi ? <sup>{p.mi}</sup> : null}</td>
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">Each column is one hour of the day in {zoneCity(src)}. Columns that are green in every row are the best meeting slots.</p>
        </div>
      )}
    </div>
  )
}
