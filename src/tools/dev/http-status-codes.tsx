import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Input, Badge, CopyButton, Switch, cn } from '@/components/ui'
import { Chip } from './_b5/shell'
import { STATUSES, CLASSES } from '@/lib/b5/http-status'

export default function HttpStatusCodes() {
  const [q, setQ] = useState('')
  const [cls, setCls] = useState<number | null>(null)
  const [stdOnly, setStdOnly] = useState(false)
  const list = useMemo(() => {
    const ql = q.toLowerCase().trim()
    return STATUSES.filter((s) => (!cls || Math.floor(s.code / 100) === cls) && (!stdOnly || s.std) && (!ql || String(s.code).startsWith(ql) || s.name.toLowerCase().includes(ql) || s.desc.toLowerCase().includes(ql) || s.use?.toLowerCase().includes(ql)))
  }, [q, cls, stdOnly])
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-80"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by code, name or meaning" className="h-10 pl-9" aria-label="Search status codes" autoFocus /></div>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={cls === null} onClick={() => setCls(null)}>All</Chip>
          {Object.entries(CLASSES).map(([k, c]) => <Chip key={k} active={cls === Number(k)} onClick={() => setCls(Number(k))}>{k}xx {c.name}</Chip>)}
        </div>
        <Switch checked={stdOnly} onChange={setStdOnly} label="Standard codes only" />
      </div>
      {list.length === 0 && <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">No status code matches “{q}”.</div>}
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((s) => {
          const c = CLASSES[Math.floor(s.code / 100)]
          return (
            <div key={s.code} className="group rounded-2xl border border-border bg-surface p-4 transition hover:border-accent/40">
              <div className="flex items-center gap-3">
                <span className="font-display text-3xl font-semibold tabular-nums" style={{ color: c.color }}>{s.code}</span>
                <div className="min-w-0 flex-1"><div className="font-semibold">{s.name}</div><div className="flex gap-1.5"><Badge color={c.color}>{c.name.toUpperCase()}</Badge>{!s.std && <Badge color="#A3A3A3">NON-STANDARD</Badge>}</div></div>
                <span className={cn('opacity-0 transition group-hover:opacity-100 focus-within:opacity-100')}><CopyButton text={`${s.code} ${s.name}`} label="" variant="ghost" /></span>
              </div>
              <p className="mt-2 text-sm">{s.desc}</p>
              {s.use && <p className="mt-1 text-xs text-muted">When to use: {s.use}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
