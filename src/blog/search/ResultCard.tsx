// A search result in the page grid: cover, highlighted title, the matching passage from the post and its meta.
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Clock, Film, Headphones, ArrowRight } from 'lucide-react'
import { CoverMedia } from '../media/CoverMedia'
import { formatDate, type PostMeta } from '../meta'
import { fmtTime, mediaFor } from '../media/media'
import { cn } from '@/components/ui'
import type { Hit } from './engine'
import { Hl } from './support'

export function ResultCard({ meta, hit, i, activeTags }: { meta: PostMeta; hit: Hit; i: number; activeTags: string[] }) {
  const v = mediaFor(meta.slug).video
  return (
    <motion.li layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.28, delay: Math.min(i, 8) * 0.035 }} className="list-none">
      <Link to={`/blog/${meta.slug}`} className="spotlight group flex h-full gap-4 overflow-hidden rounded-2xl border border-border bg-surface p-3 transition hover:border-accent/50 focus-visible:border-accent sm:flex-col sm:gap-0 sm:p-0">
        <div className="relative h-24 w-28 shrink-0 overflow-hidden rounded-xl sm:aspect-[16/9] sm:h-auto sm:w-full sm:rounded-none">
          <CoverMedia slug={meta.slug} kind={meta.cover} title={meta.title} mode="hover" className="h-full w-full transition duration-700 group-hover:scale-[1.04]" />
          {v && <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur"><Film className="size-3 text-sky-300" /><span className="hidden sm:inline">Video {fmtTime(v.dur)}</span></span>}
        </div>
        <div className="flex min-w-0 flex-1 flex-col sm:p-5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted">
            <time dateTime={meta.date} className="hidden sm:inline">{formatDate(meta.date)}</time>
            <span className="flex items-center gap-1"><Clock className="size-3" />{meta.minutes} min read</span>
            {hit.doc.listen && <span className="flex items-center gap-1 text-emerald-400/90"><Headphones className="size-3" />Listen</span>}
          </div>
          <h3 className="mt-1 font-display text-[15px] font-semibold leading-snug transition group-hover:text-accent sm:mt-2 sm:text-lg"><Hl text={meta.title} words={hit.words} phrases={hit.phrases} /></h3>
          <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted sm:text-sm">
            {hit.snippet?.h && <span className="mr-1.5 inline-flex items-center rounded-md bg-accent-2/15 px-1.5 py-px text-[10px] font-medium text-accent-2 sm:text-[11px]">{hit.snippet.h}</span>}
            <Hl text={hit.snippet?.text || meta.description} words={hit.words} phrases={hit.phrases} />
          </p>
          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
            {meta.tags.map((t) => <span key={t} className={cn('rounded-full px-2 py-0.5 text-[11px]', activeTags.includes(t) ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-muted')}>#{t}</span>)}
            <ArrowRight aria-hidden className="ml-auto hidden size-4 text-accent transition group-hover:translate-x-1 sm:block" />
          </div>
        </div>
      </Link>
    </motion.li>
  )
}
