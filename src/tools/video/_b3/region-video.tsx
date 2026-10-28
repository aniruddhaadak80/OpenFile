/* Video (or still) with a draggable region on top, plus a tiny play control. */
import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui'
import { RegionBox, type Rect } from './region'

export function RegionVideo({ url, width, height, rect, onChange, ratio = null, shade = true, overlay, label }: { url: string | null; width: number; height: number; rect: Rect; onChange: (r: Rect) => void; ratio?: number | null; shade?: boolean; overlay?: React.ReactNode; label?: string }) {
  const v = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  useEffect(() => { setPlaying(false) }, [url])
  if (!url || !width) return <div className="grid aspect-video place-items-center rounded-2xl border border-border bg-surface-2/40 text-sm text-muted">Loading preview</div>
  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-border bg-black/90 p-2">
        <RegionBox width={width} height={height} rect={rect} onChange={onChange} ratio={ratio} shade={shade} label={label}>
          <video ref={v} src={url} muted loop playsInline className="block max-h-[60vh] max-w-full" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
          {overlay}
        </RegionBox>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted">
        <Button size="sm" variant="secondary" aria-label={playing ? 'Pause' : 'Play'} icon={playing ? <Pause className="size-4" /> : <Play className="size-4" />} onClick={() => { const el = v.current; if (!el) return; el.paused ? el.play() : el.pause() }} />
        Drag on the video to draw an area. Arrow keys nudge it.
      </div>
    </div>
  )
}
