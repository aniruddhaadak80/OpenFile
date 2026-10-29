// Cover art with a short muted loop on top: SVG cover first (instant), the loop video loads lazily when the card is in
// view (or hovered on devices with a mouse) and fades in once it can play. Respects prefers-reduced-motion and data saver.
import { useEffect, useRef, useState } from 'react'
import { Cover } from '../Cover'
import type { CoverKind } from '../meta'
import { cn } from '@/components/ui'
import { loopSources, mediaFor, prefersReducedMotion, pub } from './media'

type Mode = 'inview' | 'hover'
export function CoverMedia({ slug, kind, title, className, mode = 'inview', active }: { slug: string; kind: CoverKind; title: string; className?: string; mode?: Mode; active?: boolean }) {
  const has = !!mediaFor(slug).loop
  const box = useRef<HTMLDivElement>(null)
  const vid = useRef<HTMLVideoElement>(null)
  const [load, setLoad] = useState(false)
  const [ready, setReady] = useState(false)
  const [visible, setVisible] = useState(false)
  const [hover, setHover] = useState(false)
  const still = typeof window !== 'undefined' && (prefersReducedMotion() || (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData)
  const coarse = typeof window !== 'undefined' && matchMedia('(hover: none)').matches
  const effMode: Mode = coarse ? 'inview' : mode

  useEffect(() => {
    if (!has || still || !box.current) return
    const io = new IntersectionObserver(([e]) => { setVisible(e.isIntersecting); if (e.isIntersecting && effMode === 'inview') setLoad(true) }, { rootMargin: '120px' })
    io.observe(box.current)
    return () => io.disconnect()
  }, [has, still, effMode])

  const shouldPlay = !!(load && visible && (effMode === 'inview' || hover || active))
  useEffect(() => {
    const v = vid.current
    if (!v) return
    if (shouldPlay) v.play().catch(() => {})
    else v.pause()
  }, [shouldPlay, ready])

  return (
    <div ref={box} className={cn('relative overflow-hidden', className)} onMouseEnter={() => { setHover(true); setLoad(true) }} onMouseLeave={() => setHover(false)}>
      <Cover kind={kind} title={title} className="h-full w-full" />
      {has && load && !still && (
        <video ref={vid} muted loop playsInline preload="metadata" poster={pub(slug, 'cover.webp')} aria-hidden="true" tabIndex={-1}
          onCanPlay={() => setReady(true)}
          className={cn('pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-700', ready && shouldPlay ? 'opacity-100' : 'opacity-0')}>
          {loopSources(slug).map((s) => <source key={s.src} src={s.src} type={s.type} />)}
        </video>
      )}
    </div>
  )
}
