import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CalendarClock, AlertTriangle, Globe, Clock3, SlidersHorizontal, ChevronDown } from 'lucide-react'
import { Card, Segmented, Switch, CopyButton, Select, cn } from '@/components/ui'
import { Chip, useLib } from './_dev/kit'
import { parseCron, nextRuns, MACROS, type Field } from './_dev/cron'
import { FIELD_SPECS, builderToCron, cronToBuilder, defaultBuilder, type CronFieldKey, type FieldMode, type FieldState, type BuilderState } from '@/lib/b5/cronbuild'

const PRESETS: [string, string][] = [
  ['* * * * *', 'Every minute'], ['*/5 * * * *', 'Every 5 minutes'], ['0 * * * *', 'Hourly'], ['0 9 * * *', 'Daily at 9:00'], ['0 9 * * 1-5', 'Weekdays 9:00'],
  ['30 18 * * FRI', 'Fridays 18:30'], ['0 0 * * 0', 'Weekly, Sunday midnight'], ['0 0 1 * *', 'Monthly, on the 1st'], ['0 12 L * *', 'Last day of month'], ['0 10 * * 1#1', 'First Monday 10:00'],
  ['0 0 1 1 *', 'Yearly'], ['*/30 * * * * *', 'Every 30 s (6 fields)'], ['0 */6 * * *', 'Every 6 hours'], ['15 2 * * SAT,SUN', 'Weekends 02:15'],
]
const COLORS = ['#84cc16', '#f5a524', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444']

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
              <motion.p key={res.desc} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="font-display text-xl font-semibold leading-snug sm:text-2xl">“{res.desc || (cronstrue ? 'Custom schedule, see the breakdown below' : '...')}”</motion.p>
            ) : null}
          </AnimatePresence>
        </Card>

        <CronBuilder expr={expr} onChange={setExpr} />

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
              {!res.c!.dom.any && !res.c!.dow.any && <div className="border-t border-border px-4 py-2 text-xs text-warn">Both day-of-month and day-of-week are set, standard cron runs when <b>either</b> matches.</div>}
            </Card>

            <Card className="p-0">
              <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2">
                <div className="mr-auto text-xs font-semibold uppercase tracking-wide text-muted">Next runs ({utc ? 'UTC' : Intl.DateTimeFormat().resolvedOptions().timeZone})</div>
                <Segmented value={count} onChange={setCount} options={[{ value: '10', label: '10' }, { value: '25', label: '25' }]} />
              </div>
              {res.runs!.length === 0 ? <div className="p-6 text-center text-sm text-muted">This schedule never fires in the next 8 years (for example Feb 30).</div> : (
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
            <div>Names: JAN to DEC, SUN to SAT · 6 fields = seconds first · @daily @weekly @monthly @yearly @hourly</div>
          </div>
        </Card>
      </aside>
    </div>
  )
}

const UNIT: Record<CronFieldKey, string> = { second: 'seconds', minute: 'minutes', hour: 'hours', dom: 'days', month: 'months', dow: 'days of the week' }
const MODE_LABEL: Record<FieldMode, string> = { every: 'Every', step: 'Every N', specific: 'Pick', range: 'Range' }

function CronBuilder({ expr, onChange }: { expr: string; onChange: (s: string) => void }) {
  const [open, setOpen] = useState(true)
  const [tab, setTab] = useState<CronFieldKey>('minute')
  const parsed = useMemo(() => cronToBuilder(MACROS[expr.trim().toLowerCase()] ?? expr), [expr])
  const [local, setLocal] = useState<{ state: BuilderState; withSeconds: boolean }>(() => parsed ?? { state: defaultBuilder(), withSeconds: false })
  const emitted = useRef<string | null>(null)
  useEffect(() => { if (parsed && expr !== emitted.current) setLocal(parsed) }, [parsed])
  const { state, withSeconds } = local
  const update = (next: BuilderState, sec = withSeconds) => { setLocal({ state: next, withSeconds: sec }); const e = builderToCron(next, sec); emitted.current = e; onChange(e) }
  const setField = (k: CronFieldKey, patch: Partial<FieldState>) => update({ ...state, [k]: { ...state[k], ...patch } })
  const specs = FIELD_SPECS.filter((f) => withSeconds || f.key !== 'second')
  const spec = specs.find((f) => f.key === tab) ?? specs[0]
  const f = state[spec.key]
  const label = (n: number) => spec.names ? spec.names[spec.key === 'month' ? n - 1 : n] : String(n)
  const nums = Array.from({ length: spec.max - spec.min + 1 }, (_, i) => spec.min + i)
  const opts = nums.map((n) => ({ value: String(n), label: label(n) }))

  return (
    <Card className="p-0">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold">
        <SlidersHorizontal className="size-4 text-accent" />Visual builder
        {!parsed && expr.trim() && <span className="text-xs font-normal text-warn">Uses syntax the builder cannot show (L, #, W). Editing here replaces it.</span>}
        <ChevronDown className={cn('ml-auto size-4 text-muted transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" className="flex flex-wrap gap-1.5">
              {specs.map((s) => (
                <button key={s.key} role="tab" aria-selected={s.key === spec.key} onClick={() => setTab(s.key)} className={cn('rounded-lg border px-2.5 py-1 text-xs transition', s.key === spec.key ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-fg')}>
                  {s.label}<span className="ml-1.5 font-mono opacity-70">{builderToCron({ ...state }, true).split(' ')[FIELD_SPECS.indexOf(s)]}</span>
                </button>
              ))}
            </div>
            <div className="ml-auto"><Switch checked={withSeconds} onChange={(v) => { if (!v && tab === 'second') setTab('minute'); update(state, v) }} label="Seconds field" /></div>
          </div>
          <Segmented value={f.mode} onChange={(mode) => setField(spec.key, { mode })} options={(['every', 'step', 'specific', 'range'] as FieldMode[]).map((m) => ({ value: m, label: MODE_LABEL[m] }))} />
          {f.mode === 'every' && <p className="text-sm text-muted">Runs at every {spec.label.toLowerCase()}.</p>}
          {f.mode === 'step' && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              Every
              <input type="number" min={1} max={spec.max} value={f.step} onChange={(e) => setField(spec.key, { step: Math.max(1, Math.min(spec.max, Number(e.target.value) || 1)) })} aria-label="Step" className="h-9 w-20 rounded-lg border border-border bg-surface-2 px-2 font-mono" />
              {UNIT[spec.key]}, starting at
              <Select value={String(f.from)} onChange={(v) => setField(spec.key, { from: Number(v) })} options={opts} className="w-28" />
            </div>
          )}
          {f.mode === 'range' && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              From <Select value={String(f.from)} onChange={(v) => setField(spec.key, { from: Number(v) })} options={opts} className="w-28" />
              to <Select value={String(f.to)} onChange={(v) => setField(spec.key, { to: Number(v) })} options={opts} className="w-28" />
            </div>
          )}
          {f.mode === 'specific' && (
            <div className="space-y-2">
              <div className={cn('grid gap-1', spec.names ? 'grid-cols-4 sm:grid-cols-7' : 'grid-cols-6 sm:grid-cols-10 lg:grid-cols-12')}>
                {nums.map((n) => {
                  const on = f.values.includes(n)
                  return <button key={n} aria-pressed={on} onClick={() => setField(spec.key, { values: on ? f.values.filter((x) => x !== n) : [...f.values, n] })} className={cn('rounded-md border py-1 font-mono text-xs transition', on ? 'border-accent bg-accent text-on-accent' : 'border-border text-muted hover:text-fg')}>{label(n)}</button>
                })}
              </div>
              <div className="flex gap-2 text-xs">
                <button className="text-accent hover:underline" onClick={() => setField(spec.key, { values: [] })}>Clear</button>
                {spec.key === 'dow' && <button className="text-accent hover:underline" onClick={() => setField('dow', { values: [1, 2, 3, 4, 5] })}>Weekdays</button>}
                {spec.key === 'dow' && <button className="text-accent hover:underline" onClick={() => setField('dow', { values: [0, 6] })}>Weekends</button>}
                {spec.key === 'hour' && <button className="text-accent hover:underline" onClick={() => setField('hour', { values: [9, 10, 11, 12, 13, 14, 15, 16, 17] })}>Work hours</button>}
              </div>
              {!f.values.length && <p className="text-xs text-muted">Nothing picked yet, so this field means every {spec.label.toLowerCase()}.</p>}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
