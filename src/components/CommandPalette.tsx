import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, CornerDownLeft } from 'lucide-react'
import { TOOLS, CATEGORIES } from '@/tools/registry'
import { getIcon } from './icons'
import { cn } from './ui'

export function searchTools(q: string) {
  const s = q.trim().toLowerCase()
  if (!s) return TOOLS
  const terms = s.split(/\s+/)
  return TOOLS.map((t) => {
    const hay = `${t.name} ${t.desc} ${t.category} ${(t.tags || []).join(' ')}`.toLowerCase()
    if (!terms.every((x) => hay.includes(x))) return null
    const score = (t.name.toLowerCase().startsWith(s) ? 10 : 0) + (t.name.toLowerCase().includes(s) ? 5 : 0) + (t.popular ? 1 : 0)
    return { t, score }
  }).filter(Boolean).sort((a, b) => b!.score - a!.score).map((x) => x!.t)
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const nav = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const pages = [{ name: 'Workspace — batch pipelines', path: '/workspace' }, { name: 'All tools', path: '/tools' }, { name: 'About OpenFile', path: '/about' }, { name: 'Privacy', path: '/privacy' }]
  const results = useMemo(() => {
    const t = searchTools(q).slice(0, 12).map((t) => ({ key: t.slug, name: t.name, sub: t.desc, path: `/${t.slug}`, icon: t.icon, cat: t.category }))
    const p = pages.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())).map((p) => ({ key: p.path, name: p.name, sub: 'Page', path: p.path, icon: 'LayoutGrid', cat: '' as string }))
    return [...t, ...p]
  }, [q])
  useEffect(() => { if (open) { setQ(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 10) } }, [open])
  useEffect(() => setIdx(0), [q])
  if (!open) return null
  const go = (path: string) => { nav(path); onClose() }
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-5 text-muted" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${TOOLS.length} tools…`} className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(results.length - 1, i + 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)) }
              if (e.key === 'Enter' && results[idx]) go(results[idx].path)
              if (e.key === 'Escape') onClose()
            }} />
          <kbd className="rounded border border-border px-1.5 text-[10px] text-muted">ESC</kbd>
        </div>
        <div className="max-h-[50vh] overflow-auto p-2 scrollbar-thin">
          {results.length === 0 && <div className="p-6 text-center text-sm text-muted">No tools match “{q}”.</div>}
          {results.map((r, i) => {
            const Icon = getIcon(r.icon); const color = CATEGORIES.find((c) => c.id === r.cat)?.color ?? 'var(--accent)'
            return (
              <button key={r.key} onMouseEnter={() => setIdx(i)} onClick={() => go(r.path)} className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left cursor-pointer', i === idx ? 'bg-surface-2' : '')}>
                <div className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: color + '1f', color }}><Icon className="size-4.5" /></div>
                <div className="min-w-0 flex-1"><div className="text-sm font-medium">{r.name}</div><div className="truncate text-xs text-muted">{r.sub}</div></div>
                {i === idx && <CornerDownLeft className="size-4 text-muted" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
