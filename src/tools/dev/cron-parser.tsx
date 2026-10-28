import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CalendarClock, AlertTriangle, Globe, Clock3 } from 'lucide-react'
import { Card, Segmented, Switch, CopyButton, cn } from '@/components/ui'
import { Chip, useLib } from './_dev/kit'
import { parseCron, nextRuns, MACROS, type Field } from './_dev/cron'

const PRESETS: [string, string][] = [
  ['* * * * *', 'Every minute'], ['*/5 * * * *', 'Every 5 minutes'], ['0 * * * *', 'Hourly'], ['0 9 * * *', 'Daily at 9:00'], ['0 9 * * 1-5', 'Weekdays 9:00'],
  ['30 18 * * FRI', 'Fridays 18:30'], ['0 0 * * 0', 'Weekly (Sun midnight)'], ['0 0 1 * *', 'Monthly (1st)'], ['0 12 L * *', 'Last day of month'], ['0 10 * * 1#1', 'First Monday 10:00'],
  ['0 0 1 1 *', 'Yearly'], ['*/30 * * * * *', 'Every 30 s (6-field)'], ['0 */6 * * *', 'Every 6 hours'], ['15 2 * * SAT,SUN', 'Weekends 02:15'],
]
const COLORS = ['#f472b6', '#8b6cff', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444']

function describeField(f: Field) {
  if (f.any) return 'every ' + f.name
  const parts: string[] = []
  if (f.values.length) parts.push(f.values.length > 12 ? `${f.values.length} values` : f.values.map((v) => f.name === 'month' ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][v - 1] : f.name === 'day of week' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][v] : String(v)).join(', '))
  if (f.lastDay) parts.push('last day')
  f.nth?.forEach(([d, n]) => parts.push(`${['1st', '2nd', '3rd', '4th', '5th'][n - 1]} ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]}`))
  f.lastDow?.forEach((d) => parts.push(`last ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]}`))
  return parts.join(' + ')
}

export default function CronParser() {
  const cronstrue = useLib('cronstrue', () => import('cronstrue').then((m: any) => m.default ?? m))
  const [expr, setExpr] = useState('*/15 9-17 * * MON-FRI')
  const [utc, setUtc] = useState(false)
  const [h24, setH24] = useState(true)
  const [count, setCount] = useState<'10' | '25'>('10')
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t) }, [])

  const res = useMemo(() => {
    if (!expr.trim()) return null
    try {
      const c = parseCron(expr)
      const expanded = MACROS[expr.trim().toLowerCase()] ?? expr.trim()
      let desc = ''
      try { desc = cronstrue ? cronstrue.toString(expanded, { use24HourTimeFormat: h24, verbose: true }) : '' } catch (e: any) { desc = '' }
      return { c, desc, runs: nextRuns(c, now, Number(count), utc), expanded }
    } catch (e: any) { return { err: e.message as string } }
  }, [expr, cronstrue, h24, utc, count, now])

  const parts = expr.trim().replace(/\s+/g, ' ').split(' ')
  const names = parts.length === 6 ? ['second', 'minute', 'hour', 'day (month)', 'month', 'day (week)'] : ['minute', 'hour', 'day (month)', 'month', 'day (week)']
  const fmt = (d: Date) => new Intl.DateTimeFormat(undefined, { timeZone: utc ? 'UTC' : undefined, weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: res && 'c' in res && res.c!.hasSeconds ? '2-digit' : undefined, hour12: !h24 }).format(d)
  const rel = (d: Date) => { const s = (+d - now) / 1000; if (s < 60) return `in ${Math.round(s)}s`; if (s < 3600) return `in ${Math.round(s / 60)} min`; if (s < 86400) return `in ${(s / 3600).toFixed(1)} h`; return `in ${Math.round(s / 86400)} days` }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        <Card className="space-y-4">
          <div className={cn('flex items-center gap-2 rounded-xl border bg-surface-2/60 px-3 transition focus-within:ring-2', res && 'err' in res ? 'border-danger/60 focus-within:ring-danger/20' : 'border-border focus-within:border-accent focus-within:ring-accent/20')}>
            <CalendarClock className="size-5 text-muted" />
            <input value={expr} onChange={(e) => setExpr(e.target.value)} spellCheck={false} className="h-14 min-w-0 flex-1 bg-transparent font-mono text-xl tracking-wider outline-none sm:text-2xl" placeholder="* * * * *" />
            <CopyButton text={expr} label="" variant="ghost" />
          </div>
          {parts.length >= 5 && parts.length <= 6 && (
            <div className="flex flex-wrap gap-2">
              {parts.map((p, i) => (
                <div key={i} className="min-w-16 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-center" style={{ borderTop: `3px solid ${COLORS[i + (parts.length === 5 ? 1 : 0)]}` }}>
                  <div className="font-mono text-sm font-semibold">{p}</div><div className="text-[10px] uppercase tracking-wide text-muted">{names[i]}</div>
                </div>
              ))}
            </div>
          )}
          <AnimatePresence mode="wait">
            {res && 'err' in res ? (
              <motion.div key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-sm text-danger"><AlertTriangle className="size-4" />{res.err}</motion.div>
            ) : res && 'c' in res ? (
              <motion.p key={res.desc} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="font-display text-xl font-semibold leading-snug sm:text-2xl">“{res.desc || (cronstrue ? 'Custom schedule — see the breakdown below' : '…')}”</motion.p>
            ) : null}
          </AnimatePresence>
        </Card>

        {res && 'c' in res && (
          <>
            <Card className="p-0">
              <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">Field breakdown</div>
              <div className="divide-y divide-border">
                {([res.c!.hasSeconds && res.c!.seconds, res.c!.minutes, res.c!.hours, res.c!.dom, res.c!.months, res.c!.dow].filter(Boolean) as Field[]).map((f) => (
                  <div key={f.name} className="grid grid-cols-[110px_80px_1fr] items-center gap-3 px-4 py-2 text-sm">
                    <span className="capitalize text-muted">{f.name}</span><code className="font-mono text-accent">{f.raw}</code><span className="min-w-0 break-words">{describeField(f)}</span>
                  </div>
                ))}
              </div>
              {!res.c!.dom.any && !res.c!.dow.any && <div className="border-t border-border px-4 py-2 text-xs text-warn">Both day-of-month and day-of-week are set — standard cron runs when <b>either</b> matches.</div>}
            </Card>

            <Card className="p-0">
              <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2">
                <div className="mr-auto text-xs font-semibold uppercase tracking-wide text-muted">Next runs ({utc ? 'UTC' : Intl.DateTimeFormat().resolvedOptions().timeZone})</div>
                <Segmented value={count} onChange={setCount} options={[{ value: '10', label: '10' }, { value: '25', label: '25' }]} />
              </div>
              {res.runs!.length === 0 ? <div className="p-6 text-center text-sm text-muted">This schedule never fires in the next 8 years (e.g. Feb 30).</div> : (
                <ol className="divide-y divide-border">
                  {res.runs!.map((d, i) => (
                    <motion.li key={+d} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }} className="flex items-center gap-3 px-4 py-2 text-sm">
                      <span className="w-6 text-right font-mono text-xs text-muted">{i + 1}</span>
                      <span className="flex-1 font-mono text-[13px]">{fmt(d)}</span>
                      <span className="text-xs text-muted">{rel(d)}</span>
                    </motion.li>
                  ))}
                </ol>
              )}
            </Card>
          </>
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card className="space-y-4">
          <Switch checked={utc} onChange={setUtc} label={<span className="flex items-center gap-1.5"><Globe className="size-4 text-muted" />Show times in UTC</span>} />
          <Switch checked={h24} onChange={setH24} label={<span className="flex items-center gap-1.5"><Clock3 className="size-4 text-muted" />24-hour clock</span>} />
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Presets</div>
            <div className="flex flex-wrap gap-1.5">{PRESETS.map(([e, l]) => <Chip key={e} active={expr === e} onClick={() => setExpr(e)} title={e}>{l}</Chip>)}</div>
          </div>
          <div className="space-y-1 rounded-xl bg-surface-2/50 p-3 text-xs text-muted">
            <div className="font-semibold text-fg">Syntax</div>
            <div><code className="text-accent">*</code> any · <code className="text-accent">,</code> list · <code className="text-accent">-</code> range · <code className="text-accent">/</code> step</div>
            <div><code className="text-accent">L</code> last day of month · <code className="text-accent">MON#2</code> 2nd Monday · <code className="text-accent">FRIL</code> last Friday</div>
            <div>Names: JAN–DEC, SUN–SAT · 6 fields = seconds first · @daily @weekly @monthly @yearly @hourly</div>
          </div>
        </Card>
      </aside>
    </div>
  )
}
