// The explainer film behind a post's cover: the cover (with its loop) shows first with a play button; pressing it swaps in
// the full video with captions, then chapter buttons let you jump around.
import { useRef, useState } from 'react'
import { Play, Subtitles } from 'lucide-react'
import { cn } from '@/components/ui'
import type { CoverKind } from '../meta'
import { CoverMedia } from './CoverMedia'
import { fmtTime, mediaFor, pub, videoSources } from './media'

export function PostVideo({ slug, kind, title, className }: { slug: string; kind: CoverKind; title: string; className?: string }) {
  const v = mediaFor(slug).video
  const [on, setOn] = useState(false)
  const [t, setT] = useState(0)
  const ref = useRef<HTMLVideoElement>(null)
  if (!v) return <CoverMedia slug={slug} kind={kind} title={title} className={cn('aspect-[2/1]', className)} />
  const jump = (s: number) => { const el = ref.current; if (!el) return; el.currentTime = s; el.play().catch(() => {}) }
  return (
    <div className={className}>
      {!on ? (
        <button onClick={() => setOn(true)} className="group relative block w-full cursor-pointer" aria-label={`Watch the explainer video, ${fmtTime(v.dur)}`}>
          <CoverMedia slug={slug} kind={kind} title={title} className="aspect-[2/1]" active />
          <span className="absolute inset-0 grid place-items-center bg-black/10 transition group-hover:bg-black/25">
            <span className="flex items-center gap-3 rounded-full border border-white/15 bg-black/70 py-2 pl-2 pr-5 text-sm font-medium text-white backdrop-blur transition group-hover:scale-105 group-hover:border-accent">
              <span className="grid size-10 place-items-center rounded-full bg-accent text-on-accent shadow-glow"><Play className="size-5 translate-x-px" /></span>
              Watch the explainer, {fmtTime(v.dur)}
            </span>
          </span>
        </button>
      ) : (
        <video ref={ref} controls autoPlay playsInline preload="metadata" poster={pub(slug, 'video-poster.webp')} className="aspect-video w-full bg-black"
          onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} aria-label={`Explainer video: ${title}`}>
          {videoSources(slug).map((s) => <source key={s.src} src={s.src} type={s.type} />)}
          <track kind="captions" src={pub(slug, 'captions.vtt')} srcLang="en" label="English" default />
        </video>
      )}
      {on && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border bg-surface px-3 py-2 text-xs">
          <span className="mr-1 flex items-center gap-1 text-muted"><Subtitles className="size-3.5" /> Chapters</span>
          {v.chapters.map((c, i) => { const next = v.chapters[i + 1]?.t ?? v.dur; const act = t >= c.t && t < next; return (
            <button key={i} onClick={() => jump(c.t)} className={cn('rounded-full border px-2.5 py-1 transition cursor-pointer', act ? 'border-accent bg-accent/15 text-fg' : 'border-border text-muted hover:text-fg')}>
              <span className="tabular-nums text-muted">{fmtTime(c.t)}</span> {c.label}
            </button>) })}
        </div>
      )}
    </div>
  )
}
