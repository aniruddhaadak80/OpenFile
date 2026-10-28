import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, CornerDownLeft } from 'lucide-react'
import { TOOLS, CATEGORIES } from '@/tools/registry'
import { getIcon } from './icons'
import { DOC_NAV } from '@/docs/nav'
import { Newspaper, BookOpen, History, Settings, ScrollText, Workflow, LayoutGrid, Info, ShieldCheck, Activity, type LucideIcon } from 'lucide-react'
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

const PAGES: { name: string; sub: string; path: string; icon: LucideIcon; keywords: string }[] = [
  { name: 'Docs', sub: 'Guides, API reference and self-hosting', path: '/docs', icon: BookOpen, keywords: 'documentation help guide manual' },
  { name: 'Blog', sub: 'Guides, tips and how OpenFile works', path: '/blog', icon: Newspaper, keywords: 'blog posts articles tips guides news rss' },
  { name: 'History', sub: 'Recent tools, favorites and activity', path: '/history', icon: History, keywords: 'recent activity log favorites starred' },
  { name: 'Settings', sub: 'Theme, accent, motion, image quality, file names, backup', path: '/settings', icon: Settings, keywords: 'preferences dark light black amoled sun accent font density radius theme export import reduced motion quality naming' },
  { name: 'Changelog', sub: 'What’s new in OpenFile', path: '/changelog', icon: ScrollText, keywords: 'release notes new version updates' },
  { name: 'Workspace', sub: 'Batch pipelines for images and PDFs', path: '/workspace', icon: Workflow, keywords: 'batch pipeline recipe automate' },
  { name: 'All tools', sub: 'Browse every tool', path: '/tools', icon: LayoutGrid, keywords: 'catalog browse' },
  { name: 'About OpenFile', sub: 'The project, its stack and its author', path: '/about', icon: Info, keywords: 'about project' },
  { name: 'Privacy', sub: 'How your files stay on your device', path: '/privacy', icon: ShieldCheck, keywords: 'privacy policy' },
  { name: 'Status', sub: 'API status and browser capabilities', path: '/status', icon: Activity, keywords: 'status health capabilities webgpu' },
]

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const nav = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    const match = (hay: string) => !s || s.split(/\s+/).every((x) => hay.toLowerCase().includes(x))
    const t = searchTools(q).slice(0, s ? 12 : 8).map((t) => ({ key: t.slug, name: t.name, sub: t.desc, path: `/${t.slug}`, icon: t.icon as string | LucideIcon, cat: t.category as string, kind: 'Tool' }))
    const p = PAGES.filter((p) => match(`${p.name} ${p.sub} ${p.keywords}`)).map((p) => ({ key: p.path, name: p.name, sub: p.sub, path: p.path, icon: p.icon as string | LucideIcon, cat: '', kind: 'Page' }))
    const d = s ? DOC_NAV.filter((d) => d.id !== 'changelog' && match(`${d.title} ${d.description} docs guide`)).slice(0, 6).map((d) => ({ key: 'doc:' + d.id, name: `${d.title}`, sub: `Docs · ${d.description}`, path: d.path, icon: BookOpen as string | LucideIcon, cat: '', kind: 'Docs' })) : []
    return [...t, ...p, ...d]
  }, [q])
  useEffect(() => { if (open) { setQ(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 10) } }, [open])
  useEffect(() => setIdx(0), [q])
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-idx="${idx}"]`)?.scrollIntoView({ block: 'nearest' }) }, [idx])
  if (!open) return null
  const go = (path: string) => { nav(path); onClose() }
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-5 text-muted" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${TOOLS.length} tools, pages and docs…`} className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(results.length - 1, i + 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)) }
              if (e.key === 'Enter' && results[idx]) go(results[idx].path)
              if (e.key === 'Escape') onClose()
            }} />
          <kbd className="rounded border border-border px-1.5 text-[10px] text-muted">ESC</kbd>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-auto p-2 scrollbar-thin">
          {results.length === 0 && <div className="p-6 text-center text-sm text-muted">Nothing matches “{q}”.</div>}
          {results.map((r, i) => {
            const Icon = typeof r.icon === 'string' ? getIcon(r.icon) : r.icon; const color = CATEGORIES.find((c) => c.id === r.cat)?.color ?? 'var(--accent)'
            const showHead = i === 0 || results[i - 1].kind !== r.kind
            return (
              <div key={r.key}>
              {showHead && <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-muted">{r.kind === 'Tool' ? 'Tools' : r.kind === 'Page' ? 'Pages' : 'Documentation'}</div>}
              <button data-idx={i} onMouseEnter={() => setIdx(i)} onClick={() => go(r.path)} className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left cursor-pointer', i === idx ? 'bg-surface-2' : '')}>
                <div className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in oklab, ${color} 12%, transparent)`, color }}><Icon className="size-4.5" /></div>
                <div className="min-w-0 flex-1"><div className="text-sm font-medium">{r.name}</div><div className="truncate text-xs text-muted">{r.sub}</div></div>
                {i === idx && <CornerDownLeft className="size-4 text-muted" />}
              </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
