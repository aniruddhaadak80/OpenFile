// The small card shown next to whatever is hovered, focused or tapped in the hero ring: tool name, one line
// description, formats in and out, and a tiny looping preview. The preview video is only mounted while the
// card is open, so nothing is downloaded until someone points at an item.
import { useEffect, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { cn } from '../ui'
import { lightData, posterUrl, videoUrl, type HoverInfo } from './pool'

const CARD_W = 212

function Preview({ slug }: { slug: string }) {
  const [ready, setReady] = useState(false)
  const [broken, setBroken] = useState(false)
  const ref = useRef<HTMLVideoElement>(null)
  // Hovering or tapping is a deliberate choice, so the preview plays even with reduced motion on, the same as
  // the tool cards. Only data saver or a 2G connection keeps it to the still poster.
  const playVideo = !lightData()
  useEffect(() => { setReady(false); setBroken(false) }, [slug])
  useEffect(() => { const v = ref.current; if (v) void v.play().catch(() => {}) }, [slug])
  if (broken) return null
  return (
    <div className="relative mb-2 aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
      <img src={posterUrl(slug)} alt="" decoding="async" className="absolute inset-0 size-full object-cover" onError={() => setBroken(true)} />
      {playVideo && (
        <video ref={ref} key={slug} src={videoUrl(slug)} muted loop playsInline autoPlay preload="none" aria-hidden="true" tabIndex={-1}
          onCanPlay={() => setReady(true)} className={cn('absolute inset-0 size-full object-cover transition-opacity duration-300', ready ? 'opacity-100' : 'opacity-0')} />
      )}
    </div>
  )
}

export function HoverCard({ info, ringW, touch }: { info: HoverInfo | null; ringW: number; reduce: boolean; touch: boolean }) {
  if (!info || !ringW) return null
  const xPx = (info.x / 100) * ringW
  const half = CARD_W / 2
  const left = Math.min(Math.max(xPx, half + 2), ringW - half - 2)
  const above = info.y > 52
  const gap = Math.round((info.h ?? 18) + 10)
  return (
    <div role="tooltip" id="hr-card" className={cn('hr-card pointer-events-none absolute z-40', above ? 'hr-card-up' : 'hr-card-down')}
      style={{ left, top: `${info.y}%`, width: CARD_W, transform: `translate(-50%, ${above ? `calc(-100% - ${gap}px)` : `${gap}px`})` }}>
      <div className="rounded-xl border bg-surface/95 p-2.5 text-left shadow-2xl backdrop-blur" style={{ borderColor: info.color + '55', boxShadow: `0 18px 40px -16px ${info.color}88` }}>
        {info.media && <Preview slug={info.media} />}
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 shrink-0 rounded-full" style={{ background: info.color }} />
          <span className="truncate text-[13px] font-semibold" style={{ color: info.color }}>{info.title}</span>
          {info.extra && <span className="ml-auto shrink-0 rounded border border-border px-1 font-mono text-[9px] text-muted">{info.extra}</span>}
        </div>
        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted">{info.desc}</p>
        {(info.ins.length > 0 || info.outs.length > 0) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1 font-mono text-[9.5px]">
            {info.ins.map((f) => <span key={'i' + f} className="rounded bg-surface-2 px-1 py-px text-fg/80">{f}</span>)}
            {info.outs.length > 0 && <ArrowRight className="size-3 text-muted" aria-hidden="true" />}
            {info.outs.map((f) => <span key={'o' + f} className="rounded px-1 py-px" style={{ background: info.color + '22', color: info.color }}>{f}</span>)}
          </div>
        )}
        {touch && <div className="mt-1.5 text-[10px] text-muted">Tap again to open</div>}
      </div>
    </div>
  )
}
