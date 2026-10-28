/* React wrapper around the shared three.js Viewer, with a keyboard-accessible toolbar. */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Box, Camera, Grid3x3, Maximize, RotateCw, Scan, Sun, Play, Pause, Axis3d, Palette } from 'lucide-react'
import { cn } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import type { Viewer } from './three-viewer'

export type Viewer3DHandle = { viewer: Viewer | null }
type Props = { object?: any; clips?: any[]; className?: string; screenshotName?: string; height?: string; onReady?: (v: Viewer) => void; showClay?: boolean }

function Tb({ on, label, onClick, children }: { on?: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" title={label} aria-label={label} aria-pressed={on} onClick={onClick} className={cn('grid size-8 place-items-center rounded-lg transition cursor-pointer', on ? 'bg-accent/20 text-accent' : 'text-white/80 hover:bg-white/10 hover:text-white')}>{children}</button>
}

export const Viewer3D = forwardRef<Viewer3DHandle, Props>(function Viewer3D({ object, clips, className, screenshotName = 'model', height = '62vh', onReady, showClay = true }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [viewer, setViewer] = useState<Viewer | null>(null)
  const [wire, setWire] = useState(false)
  const [grid, setGrid] = useState(true)
  const [axes, setAxes] = useState(false)
  const [spin, setSpin] = useState(false)
  const [clay, setClay] = useState(false)
  const [light, setLight] = useState<'studio' | 'soft' | 'flat' | 'dark'>('studio')
  const [bg, setBg] = useState('transparent')
  const [clip, setClip] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useImperativeHandle(ref, () => ({ viewer }), [viewer])

  useEffect(() => {
    let v: Viewer | null = null, dead = false
    import('./three-viewer').then(({ Viewer }) => {
      if (dead || !host.current) return
      try { v = new Viewer(host.current); setViewer(v); onReady?.(v) } catch (e: any) { setErr('3D needs WebGL, which is not available in this browser. ' + (e?.message || '')) }
    })
    return () => { dead = true; v?.dispose() }
  }, [])
  useEffect(() => { if (viewer && object) { viewer.setObject(object, clips ?? []); setClip(clips?.length ? 0 : null); if (clips?.length) viewer.playClip(0); if (clay) viewer.setClay(true) } }, [viewer, object, clips])
  useEffect(() => { viewer?.setWireframe(wire) }, [viewer, wire])
  useEffect(() => { if (viewer) viewer.grid.visible = grid }, [viewer, grid])
  useEffect(() => { if (viewer) viewer.axes.visible = axes }, [viewer, axes])
  useEffect(() => { viewer?.setAutoRotate(spin) }, [viewer, spin])
  useEffect(() => { viewer?.setClay(clay) }, [viewer, clay])
  useEffect(() => { viewer?.setLighting(light) }, [viewer, light])
  useEffect(() => { viewer?.setBackground(bg) }, [viewer, bg])

  const shot = async () => { if (viewer) downloadBlob(await viewer.screenshot(2, bg === 'transparent' ? undefined : bg), `${screenshotName}.png`) }
  const lights = ['studio', 'soft', 'flat', 'dark'] as const
  const bgs = ['transparent', '#0b0b0c', '#1f2933', '#f4f1ea', '#ffffff']
  return (
    <div ref={wrap} className={cn('relative overflow-hidden rounded-2xl border border-border', bg === 'transparent' && 'checker', className)} style={{ height }}>
      <div ref={host} className="absolute inset-0" />
      {err && <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-danger">{err}</div>}
      <div className="absolute left-2 top-2 flex flex-wrap gap-0.5 rounded-xl bg-black/60 p-1 backdrop-blur" role="toolbar" aria-label="Viewer controls">
        <Tb label="Fit to view" onClick={() => viewer?.fit()}><Scan className="size-4" /></Tb>
        <Tb label="Wireframe" on={wire} onClick={() => setWire(!wire)}><Box className="size-4" /></Tb>
        {showClay && <Tb label="Clay material" on={clay} onClick={() => setClay(!clay)}><Palette className="size-4" /></Tb>}
        <Tb label="Grid" on={grid} onClick={() => setGrid(!grid)}><Grid3x3 className="size-4" /></Tb>
        <Tb label="Axes" on={axes} onClick={() => setAxes(!axes)}><Axis3d className="size-4" /></Tb>
        <Tb label="Auto-rotate" on={spin} onClick={() => setSpin(!spin)}><RotateCw className="size-4" /></Tb>
        <Tb label={`Lighting: ${light}`} onClick={() => setLight(lights[(lights.indexOf(light) + 1) % lights.length])}><Sun className="size-4" /></Tb>
        <Tb label="Background" onClick={() => setBg(bgs[(bgs.indexOf(bg) + 1) % bgs.length])}><span className="size-3.5 rounded-full border border-white/60" style={{ background: bg === 'transparent' ? 'linear-gradient(135deg,#fff 50%,#888 50%)' : bg }} /></Tb>
        <Tb label="Screenshot (PNG)" onClick={shot}><Camera className="size-4" /></Tb>
        <Tb label="Fullscreen" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : wrap.current?.requestFullscreen?.())}><Maximize className="size-4" /></Tb>
      </div>
      <div className="absolute bottom-2 left-2 flex flex-wrap gap-0.5 rounded-xl bg-black/60 p-1 text-[11px] text-white/80 backdrop-blur">
        {(['front', 'back', 'left', 'right', 'top', 'iso'] as const).map((d) => <button key={d} type="button" onClick={() => viewer?.setView(d)} className="rounded-md px-2 py-1 capitalize hover:bg-white/10 cursor-pointer">{d}</button>)}
      </div>
      {!!clips?.length && (
        <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-xl bg-black/60 p-1 text-xs text-white backdrop-blur">
          <Tb label={clip === null ? 'Play animation' : 'Stop animation'} onClick={() => { const n = clip === null ? 0 : null; setClip(n); viewer?.playClip(n) }}>{clip === null ? <Play className="size-4" /> : <Pause className="size-4" />}</Tb>
          {clips.length > 1 && <select aria-label="Animation" value={clip ?? 0} onChange={(e) => { const n = Number(e.target.value); setClip(n); viewer?.playClip(n) }} className="max-w-40 rounded-md bg-transparent px-1 py-1 outline-none">{clips.map((c: any, i: number) => <option key={i} value={i} className="text-black">{c.name || `Clip ${i + 1}`}</option>)}</select>}
        </div>
      )}
      <div className="pointer-events-none absolute right-3 top-3 hidden text-[10px] text-white/60 sm:block">Drag to orbit · right-drag to pan · scroll to zoom</div>
    </div>
  )
})
