import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { AUTHOR, type AuthorLinkId } from '@/lib/author'
import { cn } from './ui'

/** Monochrome brand marks (currentColor) for the author links. */
export function SocialIcon({ id, className }: { id: AuthorLinkId; className?: string }) {
  const p = { className, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true as const }
  switch (id) {
    case 'github': return <svg {...p}><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" /></svg>
    case 'dev': return <svg {...p}><path d="M3 4h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm3.2 4H4.5v8h1.7c1.6 0 2.6-.9 2.6-2.6v-2.8C8.8 8.9 7.8 8 6.2 8Zm-.1 1.4c.6 0 1 .3 1 1v3.2c0 .7-.4 1-1 1h-.3V9.4h.3ZM13.6 8h-3.3v8h3.3v-1.4h-2v-1.9h1.8v-1.4h-1.8V9.4h2V8Zm1.6 0 1.8 8h1.2l1.8-8h-1.4l-1 4.9L16.6 8h-1.4Z" /></svg>
    case 'linkedin': return <svg {...p}><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" /></svg>
    case 'x': return <svg {...p}><path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z" /></svg>
    case 'youtube': return <svg {...p}><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z" /></svg>
    case 'devpost': return <svg {...p}><path d="M6.002 1.61 0 12.004 6.002 22.39h11.996L24 12.004 17.998 1.61zm1.593 4.084h3.947c3.605 0 6.276 1.695 6.276 6.31 0 4.436-3.21 6.302-6.456 6.302H7.595zm2.517 2.449v7.714h1.241c2.646 0 3.862-1.55 3.862-3.861.009-2.569-1.096-3.853-3.767-3.853z" /></svg>
  }
}

export function AuthorAvatar({ size = 64, className }: { size?: number; className?: string }) {
  const [ok, setOk] = useState(true)
  return (
    <span className={cn('avatar-glow relative inline-grid shrink-0 place-items-center overflow-hidden bg-black', className)} style={{ width: size, height: size }}>
      {ok ? <img src={AUTHOR.photo} alt={AUTHOR.name} width={size} height={size} loading="lazy" decoding="async" onError={() => setOk(false)} className="size-full object-cover" />
        : <span className="font-display font-bold text-accent" style={{ fontSize: size * 0.36 }}>AA</span>}
    </span>
  )
}

export function SocialLinks({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {AUTHOR.links.map((l) => (
        <a key={l.id} href={l.url} target="_blank" rel="noreferrer me" aria-label={`${AUTHOR.name} on ${l.label}`} title={l.label}
          className={cn('grid place-items-center rounded-xl border border-border bg-surface-2/50 text-muted transition hover:-translate-y-0.5 hover:border-accent hover:text-accent', size === 'sm' ? 'size-8' : 'size-10')}>
          <SocialIcon id={l.id} className={size === 'sm' ? 'size-3.5' : 'size-4'} />
        </a>
      ))}
    </div>
  )
}

/** Compact "Made by" card used in the footer of every page. The name never wraps; the socials get their own full-width row. */
export function MadeByCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-border bg-surface p-4', className)}>
      <div className="flex items-center gap-3.5">
        <AuthorAvatar size={48} />
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted">Made by</div>
          <Link to="/about#author" className="group inline-flex items-center gap-1 whitespace-nowrap font-display text-base font-semibold hover:text-accent">{AUTHOR.name}<ArrowUpRight className="size-3.5 shrink-0 opacity-60 transition group-hover:opacity-100" /></Link>
          <div className="truncate text-xs text-muted">{AUTHOR.tagline}</div>
        </div>
      </div>
      <SocialLinks size="sm" className="mt-3.5" />
    </div>
  )
}
