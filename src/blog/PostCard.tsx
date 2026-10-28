import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Clock, Tag } from 'lucide-react'
import { formatDate, type PostMeta } from './meta'
import { Cover } from './Cover'
import { useTilt } from '@/components/motion'

export function Meta({ p }: { p: PostMeta }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      <time dateTime={p.date}>{formatDate(p.date)}</time>
      <span className="flex items-center gap-1"><Clock className="size-3" />{p.minutes} min read</span>
      <span className="flex items-center gap-1"><Tag className="size-3" />{p.tags.join(', ')}</span>
    </div>
  )
}

export function PostCard({ p, i = 0 }: { p: PostMeta; i?: number }) {
  const tilt = useTilt(4)
  return (
    <motion.div layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.35, delay: Math.min(i, 8) * 0.04 }}>
      <Link to={`/blog/${p.slug}`} {...tilt} className="spotlight tilt group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="overflow-hidden"><Cover kind={p.cover} title={p.title} className="aspect-[16/10] transition duration-700 group-hover:scale-[1.05]" /></div>
        <div className="flex flex-1 flex-col p-5">
          <Meta p={p} />
          <h3 className="mt-2 font-display text-lg font-semibold leading-snug transition group-hover:text-accent">{p.title}</h3>
          <p className="mt-2 line-clamp-3 text-sm text-muted">{p.description}</p>
        </div>
      </Link>
    </motion.div>
  )
}
