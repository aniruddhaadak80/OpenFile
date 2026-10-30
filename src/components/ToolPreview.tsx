// Tool preview videos. public/media/tools/index.json maps slug -> { video, poster, duration, voice }.
// The index is fetched once at runtime (relative to BASE_URL). When it is missing, or a slug has no entry,
// every component here renders nothing, so pages work the same without media.
import { useEffect, useRef, useState } from 'react'
import { Play, Volume2, VolumeX, Clapperboard } from 'lucide-react'
import { cn } from './ui'

export interface ToolMedia { video: string; poster?: string; duration?: number; voice?: boolean | string }
type MediaIndex = Record<string, ToolMedia>

const base = import.meta.env.BASE_URL
let indexPromise: Promise<MediaIndex> | null = null
let indexCache: MediaIndex | null = null

/** Resolve a path from index.json against the media folder (absolute URLs and rooted paths are kept). */
function resolveUrl(p: string | undefined): string | undefined {
  if (!p) return undefined
  if (/^(https?:)?\/\//.test(p) || p.startsWith('data:')) return p
  if (p.startsWith('/')) return base.replace(/\/$/, '') + p
  if (p.startsWith('media/')) return base + p
  return `${base}media/tools/${p}`
}

export function loadMediaIndex(): Promise<MediaIndex> {
  if (indexCache) return Promise.resolve(indexCache)
  if (!indexPromise) {
    indexPromise = fetch(`${base}media/tools/index.json`, { cache: 'force-cache' })
      .then((r) => (r.ok && (r.headers.get('content-type') || '').includes('json') ? r.json() : r.ok ? r.text().then((t) => JSON.parse(t)) : {}))
      .then((j: unknown) => {
        const out: MediaIndex = {}
        if (j && typeof j === 'object') {
          for (const [slug, v] of Object.entries(j as Record<string, any>)) {
            const video = resolveUrl(typeof v === 'string' ? v : v?.video)
            if (video) out[slug] = { video, poster: resolveUrl(v?.poster), duration: Number(v?.duration) || undefined, voice: v?.voice }
          }
        }
        indexCache = out
        return out
      })
      .catch(() => (indexCache = {}))
  }
  return indexPromise
}

export function useToolMedia(slug: string | undefined): ToolMedia | null {
  const [m, setM] = useState<ToolMedia | null>(() => (slug && indexCache ? indexCache[slug] ?? null : null))
  useEffect(() => {
    if (!slug) return
    let live = true
    void loadMediaIndex().then((idx) => { if (live) setM(idx[slug] ?? null) })
    return () => { live = false }
  }, [slug])
  return m
}

const fmt = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '')

/** "Watch preview" panel for a tool page. Loads the video only after the user asks for it. */
export function WatchPreview({ slug, name, className }: { slug: string; name: string; className?: string }) {
  const media = useToolMedia(slug)
  const [play, setPlay] = useState(false)
  const [muted, setMuted] = useState(true)
  const [broken, setBroken] = useState(false)
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => { setPlay(false); setBroken(false) }, [slug])
  if (!media || broken) return null
  return (
    <section className={cn('overflow-hidden rounded-2xl border border-border bg-surface', className)} aria-label={`${name} preview video`}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium"><Clapperboard className="size-4 text-accent" /> Watch preview {media.duration ? <span className="font-mono text-xs text-muted">{fmt(media.duration)}</span> : null}</div>
        {play && (
          <button onClick={() => { const v = ref.current; if (v) { v.muted = !muted; setMuted(!muted) } }} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg cursor-pointer" aria-pressed={!muted}>
            {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}{muted ? 'Sound off' : 'Sound on'}
          </button>
        )}
      </div>
      {play ? (
        <video ref={ref} src={media.video} poster={media.poster} autoPlay muted={muted} playsInline controls loop preload="metadata" onError={() => setBroken(true)} className="aspect-video w-full bg-black" />
      ) : (
        <button onClick={() => setPlay(true)} className="group relative block aspect-video w-full cursor-pointer bg-black" aria-label={`Play the ${name} preview`}>
          {media.poster && <img src={media.poster} alt="" loading="lazy" decoding="async" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} className="absolute inset-0 size-full object-cover opacity-90 transition group-hover:opacity-100" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute inset-0 grid place-items-center">
            <span className="grid size-16 place-items-center rounded-full bg-gradient-brand shadow-glow transition group-hover:scale-110"><Play className="ml-1 size-7 fill-current" /></span>
          </div>
          <div className="absolute bottom-3 left-4 text-left text-sm font-medium text-white">See {name} in action</div>
        </button>
      )}
    </section>
  )
}

/** Muted hover preview for tool cards (desktop pointers only). Renders nothing without media.
 *  While it plays it covers the whole card on an opaque backdrop: the clip is shown whole (contain, so its own labels
 *  are never cut at the card edges) and the tool name sits in a bar under it, so no card text shows through the video. */
export function HoverPreview({ slug, active, name }: { slug: string; active: boolean; name?: string }) {
  const media = useToolMedia(active ? slug : undefined)
  const ref = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const v = ref.current
    if (!v) return
    if (active) { v.currentTime = 0; void v.play().catch(() => {}) } else { v.pause(); setReady(false) }
  }, [active, media])
  if (!media) return null
  const on = active && ready
  return (
    <div data-on={on || undefined} className={cn('pointer-events-none absolute inset-0 z-20 flex flex-col overflow-hidden rounded-[inherit] bg-black transition-opacity duration-300', on ? 'opacity-100' : 'opacity-0')} aria-hidden="true">
      <div className="relative min-h-0 flex-1">
        <video ref={ref} src={active ? media.video : undefined} poster={media.poster} muted playsInline loop preload="none" onPlaying={() => setReady(true)} className="absolute inset-0 size-full object-contain" />
      </div>
      {name && <div className="flex shrink-0 items-center justify-between gap-2 border-t border-white/10 bg-black/90 px-4 py-2 text-sm font-semibold text-white"><span className="truncate">{name}</span><Play className="size-3.5 shrink-0 fill-current opacity-70" /></div>}
    </div>
  )
}

/** True on devices with a fine pointer that can hover (desktop). */
export function canHover() {
  return typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches
}
