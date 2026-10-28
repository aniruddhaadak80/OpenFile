import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Fingerprint, Hash } from 'lucide-react'
import { Badge } from '@/components/ui'
import { Pane, CodeArea, useStored, useDebounced, Status, KV } from './_b5/shell'
import { identifyHash, analyzeId } from '@/lib/b10/dev'

const SAMPLE = `5d41402abc4b2a76b9719d911017c592
$2b$12$KIXQJ1tS7aZ1Zz0yYzR5UuHk2r4Yb5bQ1sWwq0FvKXo8n0H6yYb1e
2fd4e1c67a2d28fced849ee1bb76e7391b93eb12
01ARZ3NDEKTSV4RRFFQ69G5FAV
017f22e2-79b0-7cc3-98c4-dc0c0c07398f
507f1f77bcf86cd799439011
175928847299117063`

export default function HashIdentifier() {
  const [text, setText] = useStored('b10:hashid:text', SAMPLE)
  const t = useDebounced(text, 150)
  const lines = useMemo(() => t.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 200), [t])
  const results = useMemo(() => lines.map((l) => ({ value: l, id: analyzeId(l), hash: identifyHash(l) })), [lines])
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
      <Pane title="One hash or ID per line" className="h-[560px]"><CodeArea value={text} onChange={setText} placeholder="Paste hashes, UUIDs, ULIDs, ObjectIds or Snowflake IDs" /></Pane>
      <div className="scrollbar-thin max-h-[560px] space-y-3 overflow-auto pr-1">
        {!results.length && <Status kind="info">Paste a hash or an ID on the left.</Status>}
        {results.map((r, i) => (
          <motion.div key={r.value + i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }} className="rounded-2xl border border-border bg-surface p-4">
            <div className="mb-2 flex items-center gap-2">
              {r.id ? <Fingerprint className="size-4 text-accent" /> : <Hash className="size-4 text-accent" />}
              <code className="min-w-0 flex-1 truncate text-xs text-muted" title={r.value}>{r.value}</code>
              {r.hash.bits ? <Badge>{r.hash.bits} bits</Badge> : null}
            </div>
            {r.id ? (
              <>
                <div className="mb-2 font-display text-lg font-semibold">{r.id.kind}</div>
                <div className="grid gap-2 sm:grid-cols-2">{r.id.fields.map(([k, v]) => <KV key={k} label={k} value={v} />)}</div>
              </>
            ) : null}
            {r.hash.guesses.length ? (
              <div className={r.id ? 'mt-3' : ''}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">{r.id ? 'Could also be a hash' : `Likely hash (${r.hash.encoding})`}</div>
                <ul className="space-y-1">
                  {r.hash.guesses.map((g, j) => (
                    <li key={g.name} className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${j === 0 ? 'bg-accent/10 font-semibold' : 'bg-surface-2/40'}`}>
                      <span className="flex-1">{g.name}</span>
                      {g.hashcat !== undefined && <span className="font-mono text-xs text-muted">hashcat -m {g.hashcat}</span>}
                      {g.john && <span className="font-mono text-xs text-muted">john {g.john}</span>}
                      {g.note && <span className="text-xs text-muted">{g.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ) : !r.id ? <p className="text-sm text-muted">Not a known hash or ID format. Check for missing characters or extra spaces.</p> : null}
          </motion.div>
        ))}
      </div>
    </div>
  )
}
