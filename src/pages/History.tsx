import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { History as HistoryIcon, Trash2, Search, Download, MousePointerClick, Star, Layers, HardDriveDownload, Settings as SettingsIcon, X, Clock, PauseCircle, Workflow, FileDown } from 'lucide-react'
import { CATEGORIES, TOOLS, toolBySlug } from '@/tools/registry'
import { getIcon } from '@/components/icons'
import { ToolCard } from '@/components/ToolCard'
import { Button, Segmented, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { formatBytes, downloadBlob } from '@/lib/files'
import { useFavorites, useHistory, useRecent, useSettings, clearHistory, clearRecents, deleteHistoryEntry } from '@/lib/store'
import type { HistoryRow } from '@/lib/db'
import { setPageMeta } from '@/lib/seo'

type Filter = 'all' | 'open' | 'download'
const PAGE = 120

const label = (slug: string) => toolBySlug(slug)?.name ?? (slug === 'workspace' ? 'Workspace' : slug)
const colorOf = (slug: string) => { const t = toolBySlug(slug); return t ? CATEGORIES.find((c) => c.id === t.category)!.color : 'var(--accent)' }
const iconOf = (slug: string) => { const t = toolBySlug(slug); return t ? getIcon(t.icon) : slug === 'workspace' ? Workflow : FileDown }
function dayLabel(ts: number) {
  const d = new Date(ts); const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (same(d, today)) return 'Today'
  if (same(d, y)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

export default function History() {
  useEffect(() => { setPageMeta('History | OpenFile', 'Your recent tools, favorites and activity, stored only in this browser.') }, [])
  const rows = useHistory()
  const { rows: recents } = useRecent()
  const { fav } = useFavorites()
  const { prefs, update } = useSettings()
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [confirm, setConfirm] = useState(false)

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return rows.filter((r) => (filter === 'all' || r.kind === filter) && (!s || label(r.slug).toLowerCase().includes(s) || (r.detail ?? '').toLowerCase().includes(s)))
  }, [rows, filter, q])
  const groups = useMemo(() => {
    const g: { day: string; items: HistoryRow[] }[] = []
    for (const r of filtered.slice(0, limit)) { const d = dayLabel(r.at); const last = g[g.length - 1]; if (last?.day === d) last.items.push(r); else g.push({ day: d, items: [r] }) }
    return g
  }, [filtered, limit])

  const opens = rows.filter((r) => r.kind === 'open').length
  const downloads = rows.filter((r) => r.kind === 'download')
  const bytes = downloads.reduce((a, r) => a + (r.size ?? 0), 0)
  const distinct = new Set(rows.map((r) => r.slug)).size
  const top = [...recents].sort((a, b) => b.count - a.count).filter((r) => toolBySlug(r.slug)).slice(0, 6)
  const maxCount = Math.max(1, ...top.map((t) => t.count))
  const favTools = fav.map(toolBySlug).filter((t): t is NonNullable<typeof t> => !!t)

  const exportCsv = () => {
    const lines = [['time', 'action', 'tool', 'file', 'bytes'].join(','), ...rows.map((r) => [new Date(r.at).toISOString(), r.kind, label(r.slug), r.detail ?? '', r.size ?? ''].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))]
    downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv' }), `openfile-history-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 opacity-60" style={{ background: 'radial-gradient(600px 220px at 20% 0%, color-mix(in oklab, var(--accent) 16%, transparent), transparent)' }} />
      <div className="relative mx-auto max-w-7xl px-4 pt-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid size-14 place-items-center rounded-2xl bg-gradient-brand text-white shadow-lg shadow-accent/25"><HistoryIcon className="size-7" /></motion.div>
            <h1 className="mt-4 font-display text-4xl font-bold tracking-tight">History</h1>
            <p className="mt-1.5 max-w-xl text-muted">Tools you opened and files you downloaded. Stored only in this browser’s local database and never uploaded.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/settings"><Button variant="outline" icon={<SettingsIcon className="size-4" />}>Settings</Button></Link>
            <Button variant="outline" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>
            <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirm(true)} disabled={!rows.length && !recents.length}>Clear all</Button>
          </div>
        </div>

        {!prefs.historyEnabled && (
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm">
            <PauseCircle className="size-5 text-warn" /><span className="flex-1">Activity recording is paused. Recent tools and favorites still work.</span>
            <Button size="sm" variant="outline" onClick={() => { void update({ historyEnabled: true }); toast('Activity recording turned on') }}>Resume recording</Button>
          </div>
        )}

        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {([[MousePointerClick, opens, 'Tools opened'], [HardDriveDownload, downloads.length, 'Files downloaded'], [Layers, distinct, 'Different tools'], [Download, formatBytes(bytes), 'Saved to your device']] as const).map(([I, v, l], i) => (
            <motion.div key={l} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="rounded-2xl border border-border bg-surface p-5">
              <I className="size-5 text-accent" /><div className="mt-3 font-display text-2xl font-bold">{v}</div><div className="text-xs text-muted">{l}</div>
            </motion.div>
          ))}
        </div>

        <section className="mt-12">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><Star className="size-4 text-warn" /> Favorites <span className="text-sm font-normal text-muted">{favTools.length}</span></h2>
          {favTools.length ? <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{favTools.map((t) => <ToolCard key={t.slug} tool={t} compact />)}</div>
            : <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">Star a tool (hover a card, or use <span className="text-fg">Save</span> on a tool page) to pin it here and on the home page.</div>}
        </section>

        <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <h2 className="flex items-center gap-2 font-semibold"><Clock className="size-4 text-accent" /> Activity</h2>
              <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
                <Segmented value={filter} onChange={(v) => { setFilter(v); setLimit(PAGE) }} options={[{ value: 'all', label: 'All' }, { value: 'open', label: 'Opened' }, { value: 'download', label: 'Downloaded' }]} />
                <div className="flex h-9 w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-accent sm:w-56"><Search className="size-4 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter activity…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div>
              </div>
            </div>
            {!filtered.length ? (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center">
                <HistoryIcon className="mx-auto size-8 text-muted" />
                <div className="mt-3 font-medium">{rows.length ? 'No activity matches your filter.' : 'No activity yet'}</div>
                <p className="mt-1 text-sm text-muted">{rows.length ? 'Try a different search or filter.' : 'Open a tool and it will show up here.'}</p>
                {!rows.length && <Link to="/tools" className="mt-5 inline-flex rounded-xl bg-gradient-brand px-4 py-2 text-sm font-medium text-white">Browse tools</Link>}
              </div>
            ) : (
              <div className="space-y-7">
                {groups.map((g) => (
                  <div key={g.day}>
                    <div className="sticky top-16 z-10 -mx-1 mb-2 bg-bg/80 px-1 py-1 text-xs font-bold uppercase tracking-widest text-muted backdrop-blur">{g.day}</div>
                    <ul className="overflow-hidden rounded-2xl border border-border bg-surface">
                      <AnimatePresence initial={false}>
                        {g.items.map((r) => {
                          const I = iconOf(r.slug); const c = colorOf(r.slug); const known = !!toolBySlug(r.slug) || r.slug === 'workspace'
                          return (
                            <motion.li key={r.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="group flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
                              <div className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in oklab, ${c} 14%, transparent)`, color: c }}><I className="size-4" /></div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm">
                                  {r.kind === 'open' ? <>Opened {known ? <Link to={`/${r.slug}`} className="font-medium hover:text-accent">{label(r.slug)}</Link> : <span className="font-medium">{label(r.slug)}</span>}</>
                                    : <>Downloaded <span className="font-medium">{r.detail ?? 'a file'}</span></>}
                                </div>
                                <div className="truncate text-xs text-muted">
                                  {r.kind === 'download' ? <>{known ? <Link to={`/${r.slug}`} className="hover:text-fg">{label(r.slug)}</Link> : label(r.slug)}{r.size ? ` · ${formatBytes(r.size)}` : ''}</> : (toolBySlug(r.slug)?.desc ?? '')}
                                </div>
                              </div>
                              <span className={cn('hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider sm:inline', r.kind === 'download' ? 'bg-success/10 text-success' : 'bg-accent/10 text-accent')}>{r.kind === 'download' ? 'Saved' : 'Opened'}</span>
                              <time className="shrink-0 font-mono text-xs text-muted" dateTime={new Date(r.at).toISOString()}>{new Date(r.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</time>
                              <button onClick={() => r.id != null && void deleteHistoryEntry(r.id)} className="rounded-md p-1 text-muted opacity-0 transition hover:text-danger focus:opacity-100 group-hover:opacity-100 cursor-pointer" aria-label="Delete entry"><X className="size-4" /></button>
                            </motion.li>
                          )
                        })}
                      </AnimatePresence>
                    </ul>
                  </div>
                ))}
                {filtered.length > limit && <div className="text-center"><Button variant="outline" onClick={() => setLimit((l) => l + PAGE)}>Show more ({filtered.length - limit} older)</Button></div>}
              </div>
            )}
          </section>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-border bg-surface p-5">
              <h3 className="font-semibold">Most used</h3>
              {top.length ? (
                <ul className="mt-4 space-y-3">
                  {top.map((r, i) => { const t = toolBySlug(r.slug)!; const c = colorOf(r.slug); return (
                    <li key={r.slug}>
                      <Link to={`/${r.slug}`} className="flex items-center justify-between gap-2 text-sm hover:text-accent"><span className="truncate">{t.name}</span><span className="font-mono text-xs text-muted">{r.count}×</span></Link>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"><motion.div initial={{ width: 0 }} animate={{ width: `${(r.count / maxCount) * 100}%` }} transition={{ delay: 0.1 + i * 0.05, duration: 0.5 }} className="h-full rounded-full" style={{ background: c }} /></div>
                    </li>) })}
                </ul>
              ) : <p className="mt-2 text-sm text-muted">Use a few tools to see your top picks.</p>}
            </div>
            <div className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-center justify-between"><h3 className="font-semibold">Recently used</h3>{recents.length > 0 && <button onClick={() => { void clearRecents(); toast('Recent tools cleared') }} className="text-xs text-muted hover:text-danger cursor-pointer">Clear</button>}</div>
              {recents.length ? (
                <ul className="mt-3 space-y-1">
                  {recents.filter((r) => toolBySlug(r.slug)).slice(0, 10).map((r) => { const t = toolBySlug(r.slug)!; const I = getIcon(t.icon); return (
                    <li key={r.slug}><Link to={`/${r.slug}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg"><I className="size-4" style={{ color: colorOf(r.slug) }} /><span className="flex-1 truncate">{t.name}</span><span className="text-[11px]">{timeAgo(r.lastUsed)}</span></Link></li>) })}
                </ul>
              ) : <p className="mt-2 text-sm text-muted">Nothing yet.</p>}
            </div>
            <p className="px-1 text-xs leading-relaxed text-muted">Keeps the latest 2,000 entries. File contents are never stored, only names and sizes. {TOOLS.length} tools available. <Link to="/docs/local-data" className="text-accent hover:underline">How local data works</Link></p>
          </aside>
        </div>
      </div>

      <AnimatePresence>
        {confirm && (
          <motion.div className="fixed inset-0 z-[90] grid place-items-center bg-black/50 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setConfirm(false)}>
            <motion.div initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
              <div className="grid size-11 place-items-center rounded-xl bg-danger/15 text-danger"><Trash2 className="size-5" /></div>
              <h3 className="mt-4 font-display text-lg font-semibold">Clear all history?</h3>
              <p className="mt-1.5 text-sm text-muted">This deletes your activity log ({rows.length} entries) and recently used tools from this browser. Favorites and settings are kept. This cannot be undone.</p>
              <div className="mt-6 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setConfirm(false)} autoFocus>Cancel</Button>
                <Button variant="danger" onClick={async () => { await Promise.all([clearHistory(), clearRecents()]); setConfirm(false); toast('History cleared') }}>Clear everything</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function timeAgo(ts: number) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24); return d < 30 ? `${d}d ago` : new Date(ts).toLocaleDateString()
}
