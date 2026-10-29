// Listen buttons on the blog index: one shared mini player at the bottom that plays a post's natural narration.
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Headphones, Pause, Play, X, ArrowRight } from 'lucide-react'
import { POSTS } from '../meta'
import { cn } from '@/components/ui'
import { audioUrl, fmtTime, listenMinutes, mediaFor, pub } from './media'
import { SPEEDS } from './ReadAloud'

const Ctx = createContext<{ current: string; playing: boolean; toggle: (slug: string) => void } | null>(null)

export function ListenProvider({ children }: { children: React.ReactNode }) {
  const a = useRef<HTMLAudioElement>(null)
  const [cur, setCur] = useState('')
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const [d, setD] = useState(0)
  const [rate, setRate] = useState(() => { try { return JSON.parse(localStorage.getItem('of-read-prefs') || '{}').rate || 1 } catch { return 1 } })
  const voiceFor = (slug: string) => { const vs = mediaFor(slug).voices ?? []; let pref = ''; try { pref = (JSON.parse(localStorage.getItem('of-read-prefs') || '{}').voice || '').slice(7) } catch { /* none */ } return vs.find((v) => v.id === pref) ?? vs[0] }
  const toggle = (slug: string) => {
    const el = a.current!
    if (slug === cur) { if (el.paused) el.play().catch(() => {}); else el.pause(); return }
    const v = voiceFor(slug)
    if (!v) return
    setCur(slug); setT(0); setD(v.dur)
    el.src = audioUrl(slug, v.id)
    el.playbackRate = rate
    el.play().catch(() => {})
  }
  useEffect(() => { if (a.current) a.current.playbackRate = rate }, [rate])
  useEffect(() => {
    if (!cur || !('mediaSession' in navigator)) return
    const p = POSTS.find((x) => x.slug === cur)
    navigator.mediaSession.metadata = new MediaMetadata({ title: p?.title ?? cur, artist: 'Aniruddha Adak', album: 'OpenFile blog', artwork: [{ src: new URL(pub(cur, 'cover.webp'), location.href).href, sizes: '800x500', type: 'image/webp' }] })
    try {
      navigator.mediaSession.setActionHandler('seekbackward', () => { if (a.current) a.current.currentTime -= 10 })
      navigator.mediaSession.setActionHandler('seekforward', () => { if (a.current) a.current.currentTime += 10 })
    } catch { /* unsupported */ }
  }, [cur])
  const post = POSTS.find((x) => x.slug === cur)
  return (
    <Ctx.Provider value={{ current: cur, playing, toggle }}>
      {children}
      <audio ref={a} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onLoadedMetadata={(e) => isFinite(e.currentTarget.duration) && setD(e.currentTarget.duration)} className="hidden" />
      {post && (
        <div role="region" aria-label="Now playing" className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-bg/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-3 py-2 sm:px-5">
            <img src={pub(post.slug, 'cover.webp')} alt="" className="hidden h-10 w-16 rounded-md object-cover sm:block" />
            <button aria-label={playing ? 'Pause' : 'Play'} onClick={() => toggle(post.slug)} className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-on-accent cursor-pointer">{playing ? <Pause className="size-5" /> : <Play className="size-5 translate-x-px" />}</button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{post.title}</div>
              <div className="flex items-center gap-2">
                <input type="range" aria-label="Seek" min={0} max={Math.max(1, d)} step={0.5} value={t} onChange={(e) => { if (a.current) a.current.currentTime = +e.target.value }} className="of-range min-w-0 flex-1" style={{ ['--pct' as string]: (d ? (t / d) * 100 : 0) + '%' }} />
                <span className="shrink-0 text-[11px] tabular-nums text-muted">{fmtTime(t)} / {fmtTime(d)}</span>
              </div>
            </div>
            <select aria-label="Speed" value={rate} onChange={(e) => setRate(+e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-1.5 text-xs cursor-pointer">{SPEEDS.map((s) => <option key={s} value={s}>{s}x</option>)}</select>
            <Link to={`/blog/${post.slug}`} className="hidden items-center gap-1 text-sm text-accent sm:flex">Open post <ArrowRight className="size-4" /></Link>
            <button aria-label="Close player" onClick={() => { a.current?.pause(); setCur('') }} className="grid size-9 place-items-center rounded-full text-muted hover:text-fg cursor-pointer"><X className="size-4" /></button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}

/** Small listen button for a post card. Stops the click from opening the post. */
export function CardListen({ slug, minutes, className }: { slug: string; minutes: number; className?: string }) {
  const ctx = useContext(Ctx)
  if (!ctx || !mediaFor(slug).voices?.length) return null
  const on = ctx.current === slug && ctx.playing
  return (
    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); ctx.toggle(slug) }} aria-label={on ? 'Pause listening' : `Listen to this post, ${listenMinutes(slug, minutes)} minutes`}
      className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition cursor-pointer', on ? 'border-accent bg-accent text-on-accent' : 'border-border bg-bg/80 text-fg backdrop-blur hover:border-accent', className)}>
      {on ? <Pause className="size-3.5" /> : <Headphones className="size-3.5 text-accent" />} {on ? 'Pause' : `Listen ${listenMinutes(slug, minutes)} min`}
    </button>
  )
}
