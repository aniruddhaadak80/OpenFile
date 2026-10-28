import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Input, CopyButton, cn } from '@/components/ui'
import { useStored } from './_b5/shell'
import { SHEETS } from '@/lib/b5/cheats'

export default function CheatSheets() {
  const [id, setId] = useStored('b5:cheat:id', 'git')
  const [q, setQ] = useState('')
  const ql = q.trim().toLowerCase()
  const results = useMemo(() => {
    const sheets = ql ? SHEETS : SHEETS.filter((s) => s.id === id)
    return sheets.map((s) => ({ ...s, sections: s.sections.map((sec) => ({ ...sec, items: sec.items.filter(([c, d]) => !ql || c.toLowerCase().includes(ql) || d.toLowerCase().includes(ql)) })).filter((sec) => sec.items.length) })).filter((s) => s.sections.length)
  }, [id, ql])
  const total = results.reduce((a, s) => a + s.sections.reduce((b, x) => b + x.items.length, 0), 0)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-80"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search every sheet, e.g. undo, port, lookahead" className="h-10 pl-9" aria-label="Search cheat sheets" /></div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface-2/60 p-1" role="tablist">
          {SHEETS.map((s) => <button key={s.id} role="tab" aria-selected={!ql && id === s.id} onClick={() => { setId(s.id); setQ('') }} className={cn('rounded-lg px-3 py-1.5 text-xs font-medium transition', !ql && id === s.id ? 'bg-surface text-fg shadow-sm ring-1 ring-border' : 'text-muted hover:text-fg')}>{s.name}</button>)}
        </div>
        {ql && <span className="text-xs text-muted">{total} result{total === 1 ? '' : 's'}</span>}
      </div>
      {results.length === 0 && <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">Nothing found for “{q}”.</div>}
      {results.map((s) => (
        <div key={s.id} className="space-y-3">
          {ql && <h3 className="font-display text-lg font-semibold">{s.name}</h3>}
          <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
            {s.sections.map((sec) => (
              <div key={sec.title} className="mb-4 break-inside-avoid rounded-2xl border border-border bg-surface p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent">{sec.title}</div>
                <div className="space-y-2">
                  {sec.items.map(([c, d]) => (
                    <div key={c} className="group">
                      <div className="flex items-start gap-1"><code className="min-w-0 flex-1 whitespace-pre-wrap break-all rounded-md bg-surface-2/70 px-2 py-1 font-mono text-[12px]">{c}</code><span className="opacity-60 transition group-hover:opacity-100"><CopyButton text={c} label="" variant="ghost" /></span></div>
                      <div className="mt-0.5 px-1 text-xs text-muted">{d}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
