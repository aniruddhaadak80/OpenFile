import { Link } from 'react-router-dom'
import { Star, ArrowUpRight } from 'lucide-react'
import { CATEGORIES, type ToolMeta } from '@/tools/registry'
import { getIcon } from './icons'
import { useFavorites } from '@/lib/store'
import { Badge, cn } from './ui'

export function ToolCard({ tool, compact }: { tool: ToolMeta; compact?: boolean }) {
  const Icon = getIcon(tool.icon)
  const cat = CATEGORIES.find((c) => c.id === tool.category)!
  const { isFav, toggle } = useFavorites()
  const fav = isFav(tool.slug)
  return (
    <Link to={`/${tool.slug}`} className="group relative flex flex-col rounded-2xl border border-border bg-surface p-5 transition-all hover:-translate-y-1 hover:border-transparent hover:shadow-2xl"
      style={{ ['--c' as any]: cat.color }}>
      <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 ring-1 transition group-hover:opacity-100" style={{ boxShadow: `0 0 0 1px ${cat.color}66, 0 20px 50px -20px ${cat.color}55` }} />
      <div className="flex items-start justify-between">
        <div className="grid size-11 place-items-center rounded-xl transition group-hover:scale-110" style={{ background: cat.color + '1a', color: cat.color }}><Icon className="size-5" /></div>
        <div className="flex items-center gap-1.5">
          {tool.badge && <Badge color={tool.badge === 'AI' ? '#a855f7' : tool.badge === 'HOT' ? '#f97316' : '#22c55e'}>{tool.badge}</Badge>}
          <button onClick={(e) => { e.preventDefault(); toggle(tool.slug) }} className={cn('rounded-md p-1 transition cursor-pointer', fav ? 'text-warn' : 'text-muted opacity-0 group-hover:opacity-100 hover:text-warn')} aria-label="Favorite"><Star className={cn('size-4', fav && 'fill-current')} /></button>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-1 font-semibold">{tool.name}<ArrowUpRight className="size-3.5 opacity-0 transition group-hover:opacity-100" /></div>
      {!compact && <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">{tool.desc}</p>}
      <div className="mt-auto pt-4 font-mono text-[11px] text-muted/70">/{tool.slug}</div>
    </Link>
  )
}
