/* Zoomable waveform with selection, playhead and time ruler (canvas). */
import { useEffect, useRef, useState } from 'react'
import { peaks, cssVar } from '@/tools/video/_media/audio'
import { fmtTime } from '@/tools/video/_media/media'

export interface WaveformProps {
  buffer: AudioBuffer
  view: [number, number]
  onView: (v: [number, number]) => void
  selection: [number, number] | null
  onSelection: (s: [number, number] | null) => void
  playhead: number
  onSeek: (t: number) => void
  height?: number
}

export function Waveform({ buffer, view, onView, selection, onSelection, playhead, onSeek, height = 220 }: WaveformProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(800)
  const drag = useRef<{ t0: number; x0: number; moved: boolean; mode: 'select' | 'edge-s' | 'edge-e' } | null>(null)
  const peakCache = useRef<{ key: string; buf: AudioBuffer; data: Float32Array } | null>(null)

  useEffect(() => {
    const el = wrap.current; if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el); setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const [v0, v1] = view
  const span = Math.max(1e-6, v1 - v0)
  const xOf = (t: number) => ((t - v0) / span) * width
  const tOf = (x: number) => Math.min(buffer.duration, Math.max(0, v0 + (x / width) * span))

  useEffect(() => {
    const c = canvas.current; if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = width * dpr; c.height = height * dpr
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    const accent = cssVar('--accent', '#14b8a6'), muted = cssVar('--muted', '#888'), border = cssVar('--border', '#333'), fg = cssVar('--fg', '#fff')
    const ruler = 18, H = height - ruler, mid = ruler + H / 2

    // ruler
    ctx.fillStyle = muted; ctx.font = '10px ui-monospace, monospace'; ctx.textBaseline = 'top'
    const targetTicks = Math.max(2, Math.floor(width / 90))
    const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600]
    const step = steps.find((s) => span / s <= targetTicks) ?? 3600
    ctx.strokeStyle = border; ctx.lineWidth = 1
    for (let t = Math.ceil(v0 / step) * step; t <= v1; t += step) {
      const x = Math.round(xOf(t)) + 0.5
      ctx.beginPath(); ctx.moveTo(x, ruler - 5); ctx.lineTo(x, height); ctx.globalAlpha = 0.35; ctx.stroke(); ctx.globalAlpha = 1
      ctx.fillText(fmtTime(t, step < 0.1 ? 2 : step < 1 ? 1 : 0), x + 3, 3)
    }
    // center line
    ctx.strokeStyle = border; ctx.beginPath(); ctx.moveTo(0, mid + 0.5); ctx.lineTo(width, mid + 0.5); ctx.stroke()

    // selection
    if (selection) {
      const a = xOf(selection[0]), b = xOf(selection[1])
      ctx.fillStyle = accent; ctx.globalAlpha = 0.16; ctx.fillRect(a, ruler, b - a, H); ctx.globalAlpha = 1
      ctx.fillStyle = accent; ctx.fillRect(a - 1, ruler, 2, H); ctx.fillRect(b - 1, ruler, 2, H)
    }

    // waveform (cached per buffer + view + width)
    const key = `${v0}:${v1}:${width}`
    let p = peakCache.current?.key === key && peakCache.current.buf === buffer ? peakCache.current.data : null
    if (!p) { p = peaks(buffer, v0, v1, width); peakCache.current = { key, buf: buffer, data: p } }
    const sx = selection ? xOf(selection[0]) : -1, ex = selection ? xOf(selection[1]) : -1
    for (let x = 0; x < width; x++) {
      const mn = p[x * 2], mx = p[x * 2 + 1]
      const y1 = mid - mx * (H / 2) * 0.95, y2 = mid - mn * (H / 2) * 0.95
      ctx.fillStyle = x >= sx && x <= ex ? accent : muted
      ctx.globalAlpha = x >= sx && x <= ex ? 1 : 0.75
      ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1))
    }
    ctx.globalAlpha = 1

    // playhead
    if (playhead >= v0 && playhead <= v1) {
      const x = Math.round(xOf(playhead)) + 0.5
      ctx.strokeStyle = fg; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, ruler); ctx.lineTo(x, height); ctx.stroke()
      ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(x - 5, ruler); ctx.lineTo(x + 5, ruler); ctx.lineTo(x, ruler + 6); ctx.fill()
    }
  }, [buffer, v0, v1, width, height, selection, playhead])

  const localX = (e: { clientX: number }) => e.clientX - canvas.current!.getBoundingClientRect().left

  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId)
    const x = localX(e), t = tOf(x)
    let mode: 'select' | 'edge-s' | 'edge-e' = 'select'
    if (selection) {
      if (Math.abs(x - xOf(selection[0])) < 6) mode = 'edge-s'
      else if (Math.abs(x - xOf(selection[1])) < 6) mode = 'edge-e'
    }
    drag.current = { t0: mode === 'edge-s' ? selection![1] : mode === 'edge-e' ? selection![0] : t, x0: x, moved: mode !== 'select', mode }
  }
  const onMove = (e: React.PointerEvent) => {
    const x = localX(e)
    if (canvas.current && selection) {
      const near = Math.abs(x - xOf(selection[0])) < 6 || Math.abs(x - xOf(selection[1])) < 6
      canvas.current.style.cursor = near ? 'ew-resize' : 'text'
    }
    const d = drag.current; if (!d) return
    if (Math.abs(x - d.x0) > 3) d.moved = true
    if (!d.moved) return
    const t = tOf(x)
    onSelection([Math.min(d.t0, t), Math.max(d.t0, t)])
  }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null
    if (d && !d.moved) { onSelection(null); onSeek(tOf(localX(e))) }
  }
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const t = tOf(localX(e)), k = e.deltaY > 0 ? 1.25 : 0.8
      const ns = Math.min(buffer.duration, Math.max(0.05, span * k))
      let a = t - ((t - v0) / span) * ns
      a = Math.max(0, Math.min(buffer.duration - ns, a))
      onView([a, a + ns])
    } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
      const dt = ((e.shiftKey ? e.deltaY : e.deltaX) / width) * span
      const a = Math.max(0, Math.min(buffer.duration - span, v0 + dt)); onView([a, a + span])
    }
  }

  const wheelRef = useRef(onWheel); wheelRef.current = onWheel
  useEffect(() => {
    const el = wrap.current; if (!el) return
    const h = (e: WheelEvent) => wheelRef.current(e)
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  }, [])

  return (
    <div ref={wrap} className="relative w-full overflow-hidden rounded-xl border border-border bg-surface-2/40">
      <canvas ref={canvas} style={{ width: '100%', height, cursor: 'text', touchAction: 'none' }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} />
    </div>
  )
}
