// Interactive pieces of the docs: stats, popular tools, accent picker, device check, format matrix,
// tools reference, the Workspace mini pipeline and tabs. All data comes from the registry and app code.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Check, AlertTriangle, Play, Download, ArrowRight, RotateCcw, Loader2, Cpu, ChevronRight } from 'lucide-react'
import { CATEGORIES, TOOLS, type ToolMeta } from '@/tools/registry'
import { toolFormats, FORMAT_GROUPS } from '@/lib/formats'
import { getIcon } from '@/components/icons'
import { cn } from '@/components/ui'
import { ACCENTS, type AccentPref } from '@/lib/prefs'
import { useSettings } from '@/lib/store'
import { STEPS, type Item } from '@/pages/workspace/steps'
import { formatBytes, downloadBlob, createCanvas } from '@/lib/files'
import { hasWebGPU } from '@/lib/b4/ai'
import { Markdown } from '@/components/Markdown'
import { AI_TOOL_SLUGS, isFormat, realFormats } from './data'

const catOf = (id: string) => CATEGORIES.find((c) => c.id === id)
const groupColor = (f: string) => FORMAT_GROUPS.find((g) => g.formats.includes(f))?.color ?? 'var(--muted)'

/* ---------------- stats ---------------- */
export function Stats() {
  const items: [number, string, string][] = [
    [TOOLS.length, 'tools', '/docs/tools'], [CATEGORIES.length, 'categories', '/docs/tools'],
    [realFormats().length, 'formats', '/docs/formats'], [AI_TOOL_SLUGS.length, 'on-device AI and OCR tools', '/docs/local-ai'],
  ]
  return (
    <div className="not-prose my-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(([n, label, to], i) => (
        <motion.div key={label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
          <Link to={to} className="group block rounded-2xl border border-border bg-surface p-4 transition hover:-translate-y-0.5 hover:border-accent/50">
            <div className="font-display text-3xl font-bold text-gradient tabular-nums">{n}</div>
            <div className="mt-0.5 text-xs text-muted group-hover:text-fg">{label}</div>
          </Link>
        </motion.div>
      ))}
    </div>
  )
}

/* ---------------- popular tools ---------------- */
export function PopularTools() {
  const list = TOOLS.filter((t) => t.popular).slice(0, 8)
  return (
    <div className="not-prose my-5 grid gap-2.5 sm:grid-cols-2">
      {list.map((t) => { const I = getIcon(t.icon); const c = catOf(t.category); return (
        <Link key={t.slug} to={`/${t.slug}`} className="group flex items-start gap-3 rounded-2xl border border-border bg-surface p-3.5 transition hover:-translate-y-0.5 hover:border-accent/50">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ background: `${c?.color}22`, color: c?.color }}><I className="size-4.5" /></span>
          <span className="min-w-0"><span className="block font-medium group-hover:text-accent">{t.name}</span><span className="line-clamp-2 text-xs text-muted">{t.desc}</span></span>
        </Link>
      ) })}
    </div>
  )
}

/* ---------------- accents ---------------- */
export function Accents() {
  const { prefs, update } = useSettings()
  return (
    <div className="not-prose my-5 rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 text-xs text-muted">Click one to try it. It is saved like any other setting, and you can switch back any time.</div>
      <div role="radiogroup" aria-label="Accent color" className="flex flex-wrap gap-2">
        {(Object.keys(ACCENTS) as AccentPref[]).map((k) => (
          <button key={k} role="radio" aria-checked={prefs.accent === k} onClick={() => void update({ accent: k })}
            className={cn('flex min-h-10 items-center gap-2 rounded-xl border px-3 py-1.5 text-sm transition cursor-pointer', prefs.accent === k ? 'border-accent bg-accent/10 font-medium' : 'border-border hover:border-accent/50')}>
            <span className="size-4 rounded-full" style={{ background: `linear-gradient(135deg, ${ACCENTS[k].glow}, ${ACCENTS[k].main})` }} />
            {ACCENTS[k].name}
            {prefs.accent === k && <Check className="size-3.5 text-accent" />}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ---------------- device check ---------------- */
type Check = { label: string; ok: boolean | null; detail: string }
export function DeviceCheck() {
  const [checks, setChecks] = useState<Check[] | null>(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const nav = navigator as any
      const gpu = await hasWebGPU()
      let storage = ''
      try { const e = await nav.storage?.estimate?.(); if (e?.usage != null) storage = `${formatBytes(e.usage)} used${e.quota ? ` of about ${formatBytes(e.quota)} available` : ''}` } catch { /* no estimate */ }
      let cacheInfo = ''
      try { const keys = (await caches.keys()).filter((k) => k.startsWith('openfile')); cacheInfo = keys.length ? keys.map((k) => k.replace(/^openfile-/, '').replace(/-[a-z0-9]{6,}-[a-z0-9]+$/, '')).join(', ') : 'none yet' } catch { cacheInfo = 'not available' }
      const standalone = matchMedia('(display-mode: standalone)').matches || nav.standalone === true
      const list: Check[] = [
        { label: 'WebAssembly', ok: typeof WebAssembly === 'object', detail: 'Needed by video, audio, OCR and AI tools' },
        { label: 'WebGPU', ok: gpu ? true : null, detail: gpu ? 'Available: AI tools can use your GPU' : 'Not available: AI runs on the CPU, slower but it works' },
        { label: 'Web Workers', ok: typeof Worker === 'function', detail: 'Heavy work runs off the main thread' },
        { label: 'Service worker', ok: navigator.serviceWorker?.controller ? true : 'serviceWorker' in navigator ? null : false, detail: navigator.serviceWorker?.controller ? 'Active: this page can work offline' : 'serviceWorker' in navigator ? 'Supported, not controlling this page yet (reload once)' : 'Not supported: no offline mode' },
        { label: 'Offline caches', ok: cacheInfo !== 'not available' ? true : null, detail: cacheInfo },
        { label: 'Storage', ok: storage ? true : null, detail: storage || 'This browser does not report usage' },
        { label: 'Installed as an app', ok: standalone ? true : null, detail: standalone ? 'Running in its own window' : 'Running in a browser tab' },
        { label: 'Open with (file handling)', ok: 'launchQueue' in window ? true : null, detail: 'launchQueue' in window ? 'Supported once installed' : 'Not supported in this browser' },
        { label: 'Screen capture', ok: !!navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices ? true : null, detail: 'Used by the screen recorder' },
        { label: 'CPU threads', ok: true, detail: `${navigator.hardwareConcurrency || 'unknown'}${nav.deviceMemory ? `, about ${nav.deviceMemory} GB memory reported` : ''}` },
        { label: 'Connection', ok: navigator.onLine ? true : null, detail: navigator.onLine ? 'Online' : 'Offline: cached tools still work' },
      ]
      if (alive) setChecks(list)
    })()
    return () => { alive = false }
  }, [])
  return (
    <div className="not-prose my-5 rounded-2xl border border-border bg-surface p-4" aria-live="polite">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Cpu className="size-4 text-accent" /> Live check of this browser <span className="ml-auto text-[11px] font-normal text-muted">runs locally, nothing is sent</span></div>
      {!checks ? <div className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" /> Checking</div> : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {checks.map((c) => (
            <li key={c.label} className="flex items-start gap-2.5 rounded-xl bg-surface-2/60 px-3 py-2">
              <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full', c.ok === true ? 'bg-emerald-500/15 text-emerald-500' : c.ok === false ? 'bg-orange-500/15 text-orange-500' : 'bg-sky-500/15 text-sky-500')}>
                {c.ok === true ? <Check className="size-3" /> : c.ok === false ? <X className="size-3" /> : <AlertTriangle className="size-3" />}
              </span>
              <span className="min-w-0"><span className="block text-sm font-medium">{c.label}</span><span className="block text-xs text-muted">{c.detail}</span></span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 text-xs text-muted">More detail on the <Link to="/status" className="text-accent hover:underline">Status page</Link>.</div>
    </div>
  )
}

/* ---------------- shared filter bits ---------------- */
function SearchBox({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <div className="of-field-wrap flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3">
      <Search className="size-4 shrink-0 text-muted" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} data-bare-input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted" />
      {value && <button onClick={() => onChange('')} className="text-muted hover:text-fg cursor-pointer" aria-label="Clear"><X className="size-4" /></button>}
    </div>
  )
}
function CategoryChips({ value, onChange, counts }: { value: string; onChange: (v: string) => void; counts: Record<string, number> }) {
  return (
    <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Category">
      {[{ id: 'all', name: 'All', color: 'var(--accent)' }, ...CATEGORIES].map((c) => (
        <button key={c.id} role="radio" aria-checked={value === c.id} onClick={() => onChange(c.id)}
          className={cn('flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs transition cursor-pointer', value === c.id ? 'border-accent bg-accent/10 font-medium text-fg' : 'border-border text-muted hover:text-fg')}>
          <span className="size-2 rounded-full" style={{ background: c.color }} />{c.name}<span className="tabular-nums opacity-60">{counts[c.id] ?? 0}</span>
        </button>
      ))}
    </div>
  )
}

/* ---------------- format matrix ---------------- */
export function FormatsMatrix() {
  const [cat, setCat] = useState('all')
  const [q, setQ] = useState(() => new URLSearchParams(location.search).get('f') ?? '')
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [pick, setPick] = useState<{ from: string; to: string | null } | null>(null)
  const pool = useMemo(() => TOOLS.filter((t) => cat === 'all' || t.category === cat), [cat])
  const counts = useMemo(() => Object.fromEntries([['all', TOOLS.length], ...CATEGORIES.map((c) => [c.id, TOOLS.filter((t) => t.category === c.id).length])]), [])
  const rows = useMemo(() => {
    const m = new Map<string, { input: string; outs: Map<string, ToolMeta[]>; works: ToolMeta[] }>()
    for (const t of pool) {
      const t0 = toolFormats(t)
      const f = { inputs: t0.inputs.filter(isFormat), outputs: t0.outputs.filter(isFormat) }
      for (const i of f.inputs) {
        const r = m.get(i) ?? { input: i, outs: new Map<string, ToolMeta[]>(), works: [] as ToolMeta[] }
        if (f.outputs.length) for (const o of f.outputs) { if (o !== i || f.outputs.length === 1) r.outs.set(o, [...(r.outs.get(o) ?? []), t]) }
        else r.works.push(t)
        m.set(i, r)
      }
    }
    const s = q.trim().toUpperCase().replace(/^\./, '')
    return [...m.values()]
      .filter((r) => !s || r.input.includes(s) || [...r.outs.keys()].some((o) => o.includes(s)))
      .sort((a, b) => (b.outs.size + b.works.length) - (a.outs.size + a.works.length) || a.input.localeCompare(b.input))
  }, [pool, q])
  const pairs = rows.reduce((n, r) => n + r.outs.size, 0)
  const toolsFor = (from: string, to: string | null) => { const r = rows.find((x) => x.input === from); if (!r) return []; return to ? r.outs.get(to) ?? [] : [...new Set([...r.works, ...[...r.outs.values()].flat()])] }
  const gridIn = rows.slice(0, 20).map((r) => r.input)
  const gridOut = [...new Set(rows.flatMap((r) => [...r.outs.entries()].map(([o, ts]) => [o, ts.length] as const)).sort((a, b) => b[1] - a[1]).map(([o]) => o))].slice(0, 16)

  return (
    <div className="not-prose my-6 space-y-3">
      <div className="flex flex-wrap gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Find a format, for example PDF, HEIC or SRT" label="Find a format" />
        <div className="flex h-11 rounded-xl border border-border bg-surface p-1" role="tablist" aria-label="View">
          {(['list', 'grid'] as const).map((v) => <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn('rounded-lg px-3 text-sm capitalize cursor-pointer', view === v ? 'bg-accent/15 font-medium text-fg' : 'text-muted hover:text-fg')}>{v}</button>)}
        </div>
      </div>
      <CategoryChips value={cat} onChange={(c) => { setCat(c); setPick(null) }} counts={counts} />
      <div className="text-xs text-muted" aria-live="polite"><b className="text-fg tabular-nums">{rows.length}</b> input formats, <b className="text-fg tabular-nums">{pairs}</b> input to output conversions, from <b className="text-fg tabular-nums">{pool.length}</b> tools</div>

      {view === 'list' ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {rows.length === 0 && <div className="p-8 text-center text-sm text-muted">No format matches “{q}”.</div>}
          <ul className="divide-y divide-border">
            {rows.slice(0, 120).map((r) => (
              <li key={r.input} className="grid gap-2 p-3 sm:grid-cols-[110px_minmax(0,1fr)] sm:items-start">
                <button onClick={() => setPick(pick?.from === r.input && !pick.to ? null : { from: r.input, to: null })} className="flex items-center gap-2 text-left cursor-pointer" aria-label={`Tools that open ${r.input}`}>
                  <span className="rounded-md px-2 py-0.5 font-mono text-xs font-semibold" style={{ background: `color-mix(in oklab, ${groupColor(r.input)} 18%, transparent)`, color: groupColor(r.input) }}>{r.input}</span>
                  <span className="text-[11px] text-muted tabular-nums">{toolsFor(r.input, null).length}</span>
                </button>
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.outs.size > 0 && <ArrowRight className="size-3.5 text-muted" aria-hidden />}
                  {[...r.outs.entries()].sort((a, b) => b[1].length - a[1].length).map(([o, ts]) => (
                    <button key={o} onClick={() => setPick(pick?.from === r.input && pick.to === o ? null : { from: r.input, to: o })}
                      className={cn('rounded-md border px-1.5 py-0.5 font-mono text-[11px] transition cursor-pointer', pick?.from === r.input && pick.to === o ? 'border-accent bg-accent/15 text-fg' : 'border-border text-muted hover:border-accent/60 hover:text-fg')}
                      aria-label={`${r.input} to ${o}, ${ts.length} tools`}>{o}<span className="ml-1 opacity-60">{ts.length}</span></button>
                  ))}
                  {r.works.length > 0 && <span className="text-[11px] text-muted">{r.outs.size ? '+ ' : ''}{r.works.length} tools work with it</span>}
                </div>
                <AnimatePresence>{pick?.from === r.input && <PickPanel from={r.input} to={pick.to} tools={toolsFor(r.input, pick.to)} />}</AnimatePresence>
              </li>
            ))}
          </ul>
          {rows.length > 120 && <div className="border-t border-border p-3 text-center text-xs text-muted">Showing the first 120 formats. Search to narrow it down.</div>}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface scrollbar-thin">
          <table className="text-xs">
            <thead><tr><th className="sticky left-0 z-10 bg-surface p-2 text-left font-medium text-muted">From \ To</th>{gridOut.map((o) => <th key={o} className="p-2 font-mono font-medium text-muted">{o}</th>)}</tr></thead>
            <tbody>
              {gridIn.map((i) => { const r = rows.find((x) => x.input === i)!; return (
                <tr key={i} className="border-t border-border">
                  <th className="sticky left-0 z-10 bg-surface p-2 text-left font-mono font-semibold" style={{ color: groupColor(i) }}>{i}</th>
                  {gridOut.map((o) => { const n = r.outs.get(o)?.length ?? 0; return (
                    <td key={o} className="p-1 text-center">
                      {n ? <button onClick={() => { setView('list'); setPick({ from: i, to: o }) }} title={`${i} to ${o}: ${n} tools`} aria-label={`${i} to ${o}: ${n} tools`} className="grid size-7 place-items-center rounded-md font-semibold tabular-nums text-on-accent cursor-pointer transition hover:scale-110" style={{ background: `color-mix(in oklab, var(--accent) ${Math.min(100, 35 + n * 15)}%, transparent)` }}>{n}</button> : <span className="text-border">·</span>}
                    </td>) })}
                </tr>) })}
            </tbody>
          </table>
          <div className="border-t border-border p-2 text-[11px] text-muted">The most common {gridIn.length} inputs and {gridOut.length} outputs. Click a number to see the tools.</div>
        </div>
      )}
    </div>
  )
}
function PickPanel({ from, to, tools }: { from: string; to: string | null; tools: ToolMeta[] }) {
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden sm:col-span-2">
      <div className="rounded-xl bg-surface-2/70 p-3">
        <div className="mb-2 text-xs text-muted">{to ? <>Tools that turn <b className="text-fg">{from}</b> into <b className="text-fg">{to}</b></> : <>Every tool that opens <b className="text-fg">{from}</b></>}</div>
        <div className="flex flex-wrap gap-1.5">{tools.map((t) => <Link key={t.slug} to={`/${t.slug}`} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs hover:border-accent/60 hover:text-accent">{t.name}<ChevronRight className="size-3" /></Link>)}</div>
      </div>
    </motion.div>
  )
}

/* ---------------- tools reference ---------------- */
export function ToolsReference() {
  const [q, setQ] = useState(() => new URLSearchParams(location.search).get('q') ?? '')
  const [cat, setCat] = useState(() => new URLSearchParams(location.search).get('category') ?? 'all')
  const [badge, setBadge] = useState<'any' | 'NEW' | 'AI' | 'HOT' | 'pipeline'>('any')
  const [limit, setLimit] = useState(60)
  const counts = useMemo(() => Object.fromEntries([['all', TOOLS.length], ...CATEGORIES.map((c) => [c.id, TOOLS.filter((t) => t.category === c.id).length])]), [])
  const list = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return TOOLS.filter((t) => (cat === 'all' || t.category === cat) && (badge === 'any' || (badge === 'pipeline' ? !!t.pipeline : badge === 'AI' ? t.badge === 'AI' || AI_TOOL_SLUGS.includes(t.slug) : t.badge === badge)))
      .map((t) => {
        if (!terms.length) return { t, s: 0 }
        const f = toolFormats(t)
        const hay = `${t.name} ${t.desc} ${t.slug} ${(t.tags ?? []).join(' ')} ${f.all.join(' ')}`.toLowerCase()
        if (!terms.every((x) => hay.includes(x))) return null
        const n = t.name.toLowerCase()
        return { t, s: terms.reduce((a, x) => a + (n.startsWith(x) ? 6 : n.includes(x) ? 3 : 1), 0) }
      })
      .filter((x): x is { t: ToolMeta; s: number } => !!x)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.t)
  }, [q, cat, badge])
  useEffect(() => setLimit(60), [q, cat, badge])
  return (
    <div className="not-prose my-6 space-y-3">
      <div className="flex flex-wrap gap-2">
        <SearchBox value={q} onChange={setQ} placeholder={`Search ${TOOLS.length} tools by name, task or format`} label="Search tools" />
        <select value={badge} onChange={(e) => setBadge(e.target.value as typeof badge)} aria-label="Filter" className="h-11 rounded-xl border border-border bg-surface px-3 text-sm cursor-pointer">
          <option value="any">Any tool</option><option value="NEW">New</option><option value="HOT">Popular</option><option value="AI">On-device AI</option><option value="pipeline">Workspace step</option>
        </select>
      </div>
      <CategoryChips value={cat} onChange={setCat} counts={counts} />
      <div className="text-xs text-muted" aria-live="polite">Showing <b className="text-fg tabular-nums">{Math.min(limit, list.length)}</b> of <b className="text-fg tabular-nums">{list.length}</b> matching tools (<span className="tabular-nums">{TOOLS.length}</span> in total)</div>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
        {list.slice(0, limit).map((t) => { const I = getIcon(t.icon); const c = catOf(t.category); const f = toolFormats(t); return (
          <li key={t.slug} className="docs-cv min-w-0">
            <Link to={`/${t.slug}`} className="group flex items-start gap-3 rounded-2xl border border-border bg-surface p-3 transition hover:border-accent/50">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ background: `${c?.color}22`, color: c?.color }}><I className="size-4.5" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="font-medium group-hover:text-accent">{t.name}</span>
                  <span className="text-[11px] text-muted">{c?.name}</span>
                  {t.badge && <span className="rounded-full border border-accent/40 px-1.5 text-[10px] font-semibold text-accent">{t.badge}</span>}
                  {t.pipeline && <span className="rounded-full border border-border px-1.5 text-[10px] text-muted">Workspace</span>}
                </span>
                <span className="mt-0.5 block text-sm text-muted">{t.desc}</span>
                {(f.inputs.length > 0 || f.outputs.length > 0) && <span className="mt-1.5 flex flex-wrap items-center gap-1 font-mono text-[10.5px] text-muted">
                  {f.inputs.slice(0, 8).map((x) => <span key={'i' + x} className="rounded border border-border px-1">{x}</span>)}
                  {f.outputs.length > 0 && <ArrowRight className="size-3" aria-label="to" />}
                  {f.outputs.slice(0, 8).map((x) => <span key={'o' + x} className="rounded border border-accent/30 px-1 text-fg/80">{x}</span>)}
                </span>}
              </span>
              <span className="hidden shrink-0 font-mono text-[11px] text-muted sm:block">/{t.slug}</span>
            </Link>
          </li>
        ) })}
      </ul>
      {list.length === 0 && <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">No tool matches that. Try fewer words.</div>}
      {list.length > limit && <button onClick={() => setLimit((n) => n + 120)} className="w-full rounded-xl border border-border bg-surface py-2.5 text-sm text-muted hover:border-accent/50 hover:text-fg cursor-pointer">Show more ({list.length - limit} left)</button>}
    </div>
  )
}

/* ---------------- Workspace mini pipeline ---------------- */
const DEMO_STEPS = ['img-resize', 'img-grayscale', 'img-rotate', 'img-round', 'img-watermark', 'img-convert'] as const
async function sampleImage(): Promise<Blob> {
  const { canvas, ctx } = createCanvas(1200, 800)
  const g = ctx.createLinearGradient(0, 0, 1200, 800)
  g.addColorStop(0, '#050505'); g.addColorStop(0.55, '#1a1205'); g.addColorStop(1, '#F5A524')
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1200, 800)
  const dots = ['#F5A524', '#14B8A6', '#22D3EE', '#10B981', '#38BDF8', '#F97316', '#84CC16']
  dots.forEach((c, i) => { ctx.beginPath(); ctx.arc(180 + i * 140, 560 + Math.sin(i) * 60, 46, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill() })
  ctx.lineWidth = 14; ctx.strokeStyle = '#F5A524'; ctx.beginPath(); ctx.arc(900, 260, 150, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = '#F5F5F4'; ctx.font = '700 92px Inter, sans-serif'; ctx.fillText('OpenFile', 90, 250)
  ctx.fillStyle = '#B6BCC5'; ctx.font = '400 38px Inter, sans-serif'; ctx.fillText('sample photo, drawn in your browser', 94, 320)
  return new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'))
}
export function PipelineDemo() {
  const defs = DEMO_STEPS.map((id) => STEPS.find((s) => s.id === id)).filter((s): s is (typeof STEPS)[number] => !!s)
  const [on, setOn] = useState<Record<string, boolean>>({ 'img-resize': true, 'img-watermark': true, 'img-convert': true })
  const [params, setParams] = useState<Record<string, Record<string, any>>>(() => Object.fromEntries(defs.map((d) => [d.id, Object.fromEntries(d.params.map((p) => [p.key, d.id === 'img-resize' && p.key !== 'upscale' ? 800 : d.id === 'img-watermark' && p.key === 'text' ? 'My photo' : p.default]))])))
  const [input, setInput] = useState<{ blob: Blob; url: string } | null>(null)
  const [out, setOut] = useState<{ blob: Blob; url: string; name: string } | null>(null)
  const [log, setLog] = useState<{ name: string; ms: number; p: number }[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const urls = useRef<string[]>([])
  useEffect(() => { sampleImage().then((b) => { const url = URL.createObjectURL(b); urls.current.push(url); setInput({ blob: b, url }) }); return () => urls.current.forEach((u) => URL.revokeObjectURL(u)) }, [])
  const active = defs.filter((d) => on[d.id])
  const run = async () => {
    if (!input || busy) return
    setBusy(true); setErr(''); setOut(null)
    setLog(active.map((d) => ({ name: d.name, ms: 0, p: 0 })))
    try {
      let items: Item[] = [{ name: 'sample.png', blob: input.blob }]
      for (let i = 0; i < active.length; i++) {
        const d = active[i], t0 = performance.now()
        items = await d.run(items, params[d.id], (r) => setLog((l) => l.map((x, k) => (k === i ? { ...x, p: r } : x))))
        const ms = Math.round(performance.now() - t0)
        setLog((l) => l.map((x, k) => (k === i ? { ...x, p: 1, ms } : x)))
      }
      const r = items[0]; const url = URL.createObjectURL(r.blob); urls.current.push(url)
      setOut({ blob: r.blob, url, name: r.name })
    } catch (e: any) { setErr(e?.message || 'The step failed in this browser.') }
    setBusy(false)
  }
  const set = (id: string, k: string, v: any) => setParams((p) => ({ ...p, [id]: { ...p[id], [k]: v } }))
  return (
    <div className="not-prose my-6 overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-2 border-b border-border p-4 md:border-b-0 md:border-r">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">Steps, run top to bottom</div>
          {defs.map((d, i) => { const main = d.params[0]; return (
            <div key={d.id} className={cn('rounded-xl border p-2.5 transition', on[d.id] ? 'border-accent/50 bg-accent/5' : 'border-border')}>
              <label className="flex cursor-pointer items-center gap-2.5">
                <input type="checkbox" checked={!!on[d.id]} onChange={(e) => setOn((o) => ({ ...o, [d.id]: e.target.checked }))} className="size-4 accent-[var(--accent)]" />
                <span className="grid size-5 place-items-center rounded-md bg-surface-2 font-mono text-[10px] text-muted">{i + 1}</span>
                <span className="text-sm font-medium">{d.name}</span>
                <span className="ml-auto truncate text-[11px] text-muted">{d.desc}</span>
              </label>
              {on[d.id] && main && (
                <div className="mt-2 flex items-center gap-2 pl-7 text-xs">
                  <span className="w-20 shrink-0 text-muted">{main.label}</span>
                  {main.type === 'select' ? <select value={params[d.id][main.key]} onChange={(e) => set(d.id, main.key, e.target.value)} aria-label={`${d.name} ${main.label}`} className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 cursor-pointer">{main.options!.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                    : main.type === 'number' ? <input type="range" min={main.min ?? 1} max={d.id === 'img-resize' ? 1600 : main.max ?? 100} value={params[d.id][main.key]} onChange={(e) => set(d.id, main.key, Number(e.target.value))} aria-label={`${d.name} ${main.label}`} className="min-w-0 flex-1 accent-[var(--accent)]" />
                    : <input value={params[d.id][main.key]} onChange={(e) => set(d.id, main.key, e.target.value)} aria-label={`${d.name} ${main.label}`} className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2" />}
                  {main.type === 'number' && <span className="w-10 text-right tabular-nums text-muted">{params[d.id][main.key]}</span>}
                </div>
              )}
            </div>
          ) })}
          <div className="flex gap-2 pt-1">
            <button onClick={run} disabled={busy || !input || !active.length} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-brand text-sm font-medium text-on-accent disabled:opacity-50 cursor-pointer">{busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}{busy ? 'Running' : `Run ${active.length} step${active.length === 1 ? '' : 's'}`}</button>
            <button onClick={() => { setOut(null); setLog([]) }} className="grid size-10 place-items-center rounded-xl border border-border text-muted hover:text-fg cursor-pointer" aria-label="Reset result"><RotateCcw className="size-4" /></button>
          </div>
        </div>
        <div className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-2">
            <figure><div className="checker grid aspect-[3/2] place-items-center overflow-hidden rounded-xl border border-border">{input && <img src={input.url} alt="Sample input" className="max-h-full max-w-full object-contain" />}</div><figcaption className="mt-1 text-[11px] text-muted">Input{input ? `, PNG, ${formatBytes(input.blob.size)}` : ''}</figcaption></figure>
            <figure><div className="checker grid aspect-[3/2] place-items-center overflow-hidden rounded-xl border border-border">{out ? <motion.img initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} src={out.url} alt="Pipeline output" className="max-h-full max-w-full object-contain" /> : <span className="text-[11px] text-muted">{busy ? 'Working' : 'Run to see the result'}</span>}</div>
              <figcaption className="mt-1 text-[11px] text-muted">{out ? `Output, ${out.blob.type.replace('image/', '').toUpperCase()}, ${formatBytes(out.blob.size)}` : 'Output'}</figcaption></figure>
          </div>
          {log.length > 0 && <ol className="space-y-1.5" aria-live="polite">{log.map((l, i) => (
            <li key={i} className="text-xs"><div className="flex justify-between"><span>{i + 1}. {l.name}</span><span className="tabular-nums text-muted">{l.p >= 1 ? `${l.ms} ms` : `${Math.round(l.p * 100)}%`}</span></div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${l.p * 100}%` }} /></div></li>))}</ol>}
          {err && <div className="rounded-xl border border-orange-500/40 bg-orange-500/10 p-2 text-xs">{err}</div>}
          {out && <div className="flex flex-wrap items-center gap-2"><button onClick={() => downloadBlob(out.blob, out.name)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs hover:border-accent/60 cursor-pointer"><Download className="size-3.5" /> Download</button><Link to="/workspace" className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs text-accent hover:underline">Open the full Workspace <ArrowRight className="size-3.5" /></Link></div>}
          <p className="text-[11px] text-muted">This is the real Workspace code running on your device. The full Workspace takes any number of your own files and adds saving, reordering and more steps.</p>
        </div>
      </div>
    </div>
  )
}

/* ---------------- tabs ---------------- */
function guess(group: string, labels: string[]): number {
  const ua = navigator.userAgent
  const find = (re: RegExp) => labels.findIndex((l) => re.test(l))
  let i = -1
  if (group === 'os') i = /Android/i.test(ua) ? find(/android/i) : /Mac/i.test(ua) ? find(/mac/i) : /Win/i.test(ua) ? find(/windows/i) : /Linux/i.test(ua) ? find(/linux/i) : -1
  if (group === 'browser') i = /iPhone|iPad/i.test(ua) ? find(/iphone|safari/i) : /Android/i.test(ua) ? find(/android|chrome/i) : /Firefox/i.test(ua) ? find(/firefox/i) : /Safari/i.test(ua) && !/Chrome/i.test(ua) ? find(/safari/i) : find(/chrome/i)
  return i
}
export function DocTabs({ group, tabs }: { group: string; tabs: { label: string; md: string }[] }) {
  const key = `of:docs-tab:${group}`
  const [i, setI] = useState(() => {
    try { const saved = localStorage.getItem(key); const k = tabs.findIndex((t) => t.label === saved); if (k >= 0) return k } catch { /* ignore */ }
    const g = guess(group, tabs.map((t) => t.label)); return g >= 0 ? g : 0
  })
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const id = useMemo(() => `tabs-${group}-${Math.random().toString(36).slice(2, 7)}`, [group])
  const choose = (k: number, focus = false) => {
    setI(k); try { localStorage.setItem(key, tabs[k].label) } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('of:docs-tab', { detail: { group, label: tabs[k].label } }))
    if (focus) refs.current[k]?.focus()
  }
  // keep every tab list of the same group in sync (choose macOS once, every OS tab list follows)
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent).detail; if (d.group === group) { const k = tabs.findIndex((t) => t.label === d.label); if (k >= 0) setI(k) } }
    window.addEventListener('of:docs-tab', on); return () => window.removeEventListener('of:docs-tab', on)
  }, [group, tabs])
  return (
    <div className="docs-tabs not-prose my-5 overflow-hidden rounded-2xl border border-border bg-surface">
      <div role="tablist" aria-label={group === 'os' ? 'Operating system' : group === 'browser' ? 'Browser' : 'Options'} className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-border px-2 pt-2"
        onKeyDown={(e) => { if (e.key === 'ArrowRight') { e.preventDefault(); choose((i + 1) % tabs.length, true) } if (e.key === 'ArrowLeft') { e.preventDefault(); choose((i - 1 + tabs.length) % tabs.length, true) } if (e.key === 'Home') { e.preventDefault(); choose(0, true) } if (e.key === 'End') { e.preventDefault(); choose(tabs.length - 1, true) } }}>
        {tabs.map((t, k) => (
          <button key={t.label} ref={(el) => { refs.current[k] = el }} role="tab" id={`${id}-t${k}`} aria-selected={i === k} aria-controls={`${id}-p${k}`} tabIndex={i === k ? 0 : -1} onClick={() => choose(k)}
            className={cn('relative shrink-0 rounded-t-lg px-3 py-2 text-sm transition cursor-pointer', i === k ? 'font-medium text-fg' : 'text-muted hover:text-fg')}>
            {t.label}
            {i === k && <motion.span layoutId={`${id}-bar`} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-p${i}`} aria-labelledby={`${id}-t${i}`} className="px-4 py-1">
        <Markdown md={tabs[i].md} className="docs-prose docs-tab-body" />
      </div>
    </div>
  )
}

export const COMPONENTS: Record<string, () => React.ReactElement> = {
  stats: Stats, 'popular-tools': PopularTools, accents: Accents, 'device-check': DeviceCheck,
  'formats-matrix': FormatsMatrix, 'tools-reference': ToolsReference, 'pipeline-demo': PipelineDemo,
}
