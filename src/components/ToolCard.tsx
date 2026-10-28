import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Star, ArrowUpRight, PlayCircle } from 'lucide-react'
import { CATEGORIES, type ToolMeta } from '@/tools/registry'
import { getIcon } from './icons'
import { useFavorites } from '@/lib/store'
import { useTilt } from './motion'
import { HoverPreview, canHover, useToolMedia } from './ToolPreview'
import { Badge, cn } from './ui'

export const BADGE_COLORS: Record<string, string> = { AI: '#14B8A6', HOT: '#F97316', NEW: '#10B981', PRO: '#F5A524' }

export function ToolCard({ tool, compact, view = 'grid' }: { tool: ToolMeta; compact?: boolean; view?: 'grid' | 'list' }) {
  const Icon = getIcon(tool.icon)
  const cat = CATEGORIES.find((c) => c.id === tool.category) ?? CATEGORIES[0]
  const { isFav, toggle } = useFavorites()
  const fav = isFav(tool.slug)
  const tilt = useTilt(view === 'list' ? 0 : 5)
  const [hover, setHover] = useState(false)
  const hoverable = !compact && view === 'grid'
  const media = useToolMedia(hoverable && hover ? tool.slug : undefined)
  const star = (
    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(tool.slug) }} className={cn('relative z-10 rounded-md p-1 transition cursor-pointer', fav ? 'text-warn' : 'text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-warn')} aria-label={fav ? `Remove ${tool.name} from favorites` : `Add ${tool.name} to favorites`} aria-pressed={fav}><Star className={cn('size-4', fav && 'fill-current')} /></button>
  )
  if (view === 'list') {
    return (
      <Link to={`/${tool.slug}`} onPointerMove={tilt.onPointerMove} className="spotlight group flex items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-transparent" style={{ ['--c' as string]: cat.color }}>
        <div className="grid size-10 shrink-0 place-items-center rounded-lg" style={{ background: cat.color + '1a', color: cat.color }}><Icon className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-medium">{tool.name}{tool.badge && <Badge color={BADGE_COLORS[tool.badge]}>{tool.badge}</Badge>}</div>
          <p className="truncate text-sm text-muted">{tool.desc}</p>
        </div>
        <span className="hidden shrink-0 text-xs text-muted sm:inline" style={{ color: cat.color }}>{cat.name}</span>
        {star}
        <ArrowUpRight className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-fg" />
      </Link>
    )
  }
  return (
    <Link to={`/${tool.slug}`}
      onPointerMove={tilt.onPointerMove}
      onPointerEnter={() => hoverable && canHover() && setHover(true)}
      onPointerLeave={(e) => { tilt.onPointerLeave(e); setHover(false) }}
      className="spotlight tilt group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface p-5 transition-[border-color,box-shadow,transform] duration-300 hover:border-transparent hover:shadow-2xl"
      style={{ ['--c' as string]: cat.color }}>
      {hoverable && <HoverPreview slug={tool.slug} active={hover} />}
      <div className="relative z-10 flex items-start justify-between">
        <div className="grid size-11 place-items-center rounded-xl transition duration-300 group-hover:scale-110 group-hover:rotate-[-4deg]" style={{ background: cat.color + '1a', color: cat.color, boxShadow: `inset 0 0 0 1px ${cat.color}22` }}><Icon className="size-5" /></div>
        <div className="flex items-center gap-1.5">
          {media && <span className="flex items-center gap-1 rounded-md bg-bg/70 px-1.5 py-0.5 text-[10px] font-medium text-muted backdrop-blur"><PlayCircle className="size-3" /> Preview</span>}
          {tool.badge && <Badge color={BADGE_COLORS[tool.badge]}>{tool.badge}</Badge>}
          {star}
        </div>
      </div>
      <div className="relative z-10 mt-4 flex items-center gap-1 font-semibold">{tool.name}<ArrowUpRight className="size-3.5 -translate-x-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" /></div>
      {!compact && <p className="relative z-10 mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">{tool.desc}</p>}
      <div className="relative z-10 mt-auto flex items-center justify-between pt-4 font-mono text-[11px] text-muted/70"><span>/{tool.slug}</span><span className="size-1.5 rounded-full opacity-60" style={{ background: cat.color }} /></div>
    </Link>
  )
}
