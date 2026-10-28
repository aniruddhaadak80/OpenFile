// The live window inside the hero core. It cycles real tool previews (poster first, then the muted preview
// video) with a soft cross-fade and a slow drift. Timing is driven by a CSS progress arc, so hovering the
// ring (which pauses every CSS animation in it) also freezes the showcase exactly where it is.
import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../ui'
import { lightData, posterUrl, videoUrl } from './pool'

function Slide({ slug, on, video, paused, kb }: { slug: string; on: boolean; video: boolean; paused: boolean; kb: number }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const v = ref.current
    if (!v) return
    if (paused || !on) v.pause(); else void v.play().catch(() => {})
  }, [paused, on, ready])
  return (
    <div className={cn('hr-sc-slide absolute inset-0', on ? 'hr-sc-on' : 'hr-sc-off')} aria-hidden="true">
      <div className={cn('absolute inset-0', `hr-kb hr-kb-${kb}`)}>
        <img src={posterUrl(slug)} alt="" decoding="async" className="absolute inset-0 size-full object-cover" />
        {video && on && (
          <video ref={ref} src={videoUrl(slug)} muted loop playsInline autoPlay preload="none" tabIndex={-1}
            onCanPlay={() => setReady(true)} className={cn('absolute inset-0 size-full object-cover transition-opacity duration-500', ready ? 'opacity-100' : 'opacity-0')} />
        )}
      </div>
    </div>
  )
}

export function Showcase({ slugs, paused, active, reduce, onChange }: { slugs: string[]; paused: boolean; active: boolean; reduce: boolean; onChange: (slug: string) => void }) {
  const [i, setI] = useState(0)
  const [prev, setPrev] = useState<number | null>(null)
  const [warm, setWarm] = useState(false)
  // per slide: a slightly different length and drift direction, so the rhythm never feels like a metronome
  const plan = useMemo(() => slugs.map(() => ({ dur: 5.6 + Math.random() * 2.6, kb: Math.floor(Math.random() * 4) })), [slugs])
  useEffect(() => { if (slugs[i]) onChange(slugs[i]) }, [i, slugs, onChange])
  // the first video waits a moment after the ring comes into view, so it never competes with page load
  useEffect(() => { if (!active || warm) return; const t = setTimeout(() => setWarm(true), 1400); return () => clearTimeout(t) }, [active, warm])
  if (!slugs.length) return null
  const video = warm && active && !reduce && !lightData()
  const next = () => { setPrev(i); setI((x) => (x + 1) % slugs.length) }
  const shown = prev !== null && prev !== i ? [prev, i] : [i]
  return (
    <div className="hr-sc absolute inset-0">
      <div className="absolute inset-[5%] overflow-hidden rounded-full bg-black">
        {shown.map((k) => <Slide key={slugs[k]} slug={slugs[k]} on={k === i} video={video} paused={paused} kb={reduce ? 0 : plan[k].kb} />)}
        <div className="pointer-events-none absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, transparent 52%, rgba(0,0,0,.55) 100%)' }} />
      </div>
      <div className="pointer-events-none absolute inset-0 rounded-full border border-accent/20" aria-hidden="true" />
      {!reduce && (
        // a small light runs once around the window per slide; when it finishes, the next tool fades in
        <div key={i} className="hr-sc-prog pointer-events-none absolute inset-0" style={{ animationDuration: `${plan[i].dur}s` }} onAnimationEnd={(e) => { if (e.target === e.currentTarget) next() }} aria-hidden="true">
          <span className="absolute left-1/2 top-0 -ml-[3px] -mt-[3px] size-1.5 rounded-full bg-glow shadow-[0_0_10px_2px_var(--accent-glow)]" />
        </div>
      )}
    </div>
  )
}
