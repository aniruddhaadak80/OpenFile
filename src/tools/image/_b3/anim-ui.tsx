/* Shared UI for the Batch 3 animation tools: loader hook, player, frame strip and export panel. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, SkipBack, SkipForward, Download, RotateCcw, Film, Repeat } from 'lucide-react'
import { Button, Dropzone, Label, ResultCard, Segmented, Slider, Switch, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { baseName, formatBytes } from '@/lib/files'
import { type Anim, type OutFmt, ANIM_ACCEPT, OUT_EXT, OUT_LABEL, decodeAnim, encodeAnim, frameToCanvas, totalDuration, hasTransparency, type DecodeOpts } from '@/lib/b3/anim'
import { useMediaJob, useObjectUrl } from '@/tools/video/_media/media'
import { JobPanel, Reveal } from '@/tools/video/_media/ui'
import { ColorInput } from '@/tools/image/_img/kit'

export { ColorInput }

/* ------------------------------------------------------------------ loading */

export function useAnim(decodeOpts?: DecodeOpts) {
  const [file, setFile] = useState<File | null>(null)
  const [anim, setAnim] = useState<Anim | null>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const gen = useRef(0)
  const load = useCallback(async (f: File) => {
    const my = ++gen.current
    setFile(f); setAnim(null); setError(null); setLoading(true); setProgress(0)
    try {
      const a = await decodeAnim(f, { ...decodeOpts, onProgress: (p) => my === gen.current && setProgress(p) })
      if (my !== gen.current) return
      if (!a.frames.length) throw new Error('No frames were found in this file.')
      setAnim(a)
    } catch (e: any) {
      if (my !== gen.current) return
      const m = e?.message || String(e); setError(m); toast(m, 'error')
    } finally { if (my === gen.current) setLoading(false) }
    // decodeOpts is read at call time on purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const reset = useCallback(() => { gen.current++; setFile(null); setAnim(null); setError(null); setLoading(false) }, [])
  return { file, anim, setAnim, loading, progress, error, load, reset }
}

export function AnimDrop({ onFile, label = 'Drop a GIF, APNG or animated WebP', sub = 'Animated AVIF works in Chrome and Edge. Nothing leaves your device.', accept = ANIM_ACCEPT, multiple = false, onFiles }: { onFile?: (f: File) => void; onFiles?: (f: File[]) => void; label?: React.ReactNode; sub?: React.ReactNode; accept?: string; multiple?: boolean }) {
  return <Dropzone accept={accept} multiple={multiple} onFiles={(f) => (onFiles ? onFiles(f) : onFile?.(f[0]))} label={label} sub={sub} />
}

export function Loading({ progress, label = 'Reading frames' }: { progress: number; label?: string }) {
  return (
    <div className="grid min-h-60 place-items-center rounded-2xl border border-border bg-surface-2/40 p-8 text-center">
      <div className="w-64 max-w-full space-y-3">
        <Film className="mx-auto size-8 animate-pulse text-accent" />
        <div className="text-sm font-medium">{label}</div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ player */

export function AnimPlayer({ anim, className, maxH = '60vh', showControls = true, frame: controlled, onFrame, autoPlay = true, background }: {
  anim: Anim; className?: string; maxH?: string; showControls?: boolean; frame?: number; onFrame?: (i: number) => void; autoPlay?: boolean; background?: string
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [playing, setPlaying] = useState(autoPlay && anim.frames.length > 1)
  const [own, setOwn] = useState(0)
  const frame = Math.min(anim.frames.length - 1, controlled ?? own)
  const setFrame = useCallback((i: number) => { setOwn(i); onFrame?.(i) }, [onFrame])
  const ref = useRef({ frame, anim }); ref.current = { frame, anim }
  useEffect(() => { setOwn((f) => Math.min(f, anim.frames.length - 1)) }, [anim])
  useEffect(() => {
    if (!playing || anim.frames.length < 2) return
    let t: ReturnType<typeof setTimeout>
    const step = () => {
      const { frame: f, anim: a } = ref.current
      const next = (f + 1) % a.frames.length
      t = setTimeout(() => { setFrame(next); step() }, Math.max(16, a.frames[f]?.delay ?? 100))
    }
    step()
    return () => clearTimeout(t)
  }, [playing, anim, setFrame])
  useEffect(() => {
    const f = anim.frames[frame]; if (!f || !canvas.current) return
    frameToCanvas(f.rgba, anim.width, anim.height, canvas.current)
  }, [anim, frame])
  const step = (d: number) => { setPlaying(false); setFrame((frame + d + anim.frames.length) % anim.frames.length) }
  return (
    <div className={cn('space-y-2', className)}>
      <div tabIndex={0} aria-label="Animation preview. Space plays or pauses, arrow keys step frames."
        onKeyDown={(e) => { if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p) } else if (e.key === 'ArrowRight') { e.preventDefault(); step(1) } else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1) } }}
        className={cn('grid place-items-center overflow-hidden rounded-2xl border border-border p-2 outline-none focus-visible:ring-2 focus-visible:ring-accent', !background && 'checker')} style={background ? { background } : undefined}>
        <canvas ref={canvas} className="max-w-full object-contain [image-rendering:auto]" style={{ maxHeight: maxH }} />
      </div>
      {showControls && anim.frames.length > 1 && (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" aria-label="Previous frame" onClick={() => step(-1)} icon={<SkipBack className="size-4" />} />
          <Button variant="secondary" size="sm" aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying((p) => !p)} icon={playing ? <Pause className="size-4" /> : <Play className="size-4" />} />
          <Button variant="ghost" size="sm" aria-label="Next frame" onClick={() => step(1)} icon={<SkipForward className="size-4" />} />
          <input type="range" min={0} max={anim.frames.length - 1} value={frame} aria-label="Frame" onChange={(e) => { setPlaying(false); setFrame(+e.target.value) }} className="min-w-0 flex-1 cursor-pointer accent-[var(--accent)]" />
          <span className="w-20 text-right font-mono text-xs text-muted">{frame + 1}/{anim.frames.length}</span>
        </div>
      )}
    </div>
  )
}

export function AnimStats({ anim, file, extra }: { anim: Anim; file?: Blob | null; extra?: React.ReactNode }) {
  const dur = totalDuration(anim) / 1000
  const items: [string, React.ReactNode][] = [
    ['Size', `${anim.width}×${anim.height}`],
    ['Frames', anim.frames.length],
    ['Length', `${dur.toFixed(2)}s`],
    ['Loop', anim.loop === 0 ? 'Forever' : anim.loop === 1 ? 'Once' : `${anim.loop}×`],
  ]
  if (file) items.push(['File', formatBytes(file.size)])
  if (anim.source) items.unshift(['Type', anim.source])
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(([k, v]) => <span key={k} className="rounded-lg bg-surface-2/70 px-2 py-1 text-xs"><span className="text-muted">{k} </span><span className="font-mono">{v}</span></span>)}
      {extra}
    </div>
  )
}

/** Thumbnail data URLs for a frame strip (small, generated once per anim). */
export function useFrameThumbs(anim: Anim | null, size = 96) {
  return useMemo(() => {
    if (!anim) return [] as string[]
    const s = Math.min(1, size / Math.max(anim.width, anim.height))
    const w = Math.max(1, Math.round(anim.width * s)), h = Math.max(1, Math.round(anim.height * s))
    const big = document.createElement('canvas'), small = document.createElement('canvas')
    small.width = w; small.height = h
    const ctx = small.getContext('2d')!
    return anim.frames.map((f) => {
      frameToCanvas(f.rgba, anim.width, anim.height, big)
      ctx.clearRect(0, 0, w, h); ctx.drawImage(big, 0, 0, w, h)
      return small.toDataURL('image/png')
    })
  }, [anim, size])
}

/* ------------------------------------------------------------------ export */

export interface ExportPanelProps {
  anim: Anim | null
  name: string
  formats?: OutFmt[]
  defaultFmt?: OutFmt
  originalSize?: number
  /** label on the main button */
  action?: string
  /** compute the final animation lazily (heavy transforms run only on export) */
  prepare?: () => Promise<Anim> | Anim
  suffix?: string
  onReset?: () => void
  /** extra controls rendered above the format picker */
  children?: React.ReactNode
  /** hide the format picker when there is only one sensible output */
  compactGif?: boolean
}

export function ExportPanel({ anim, name, formats = ['gif', 'apng', 'webp', 'mp4', 'webm'], defaultFmt, originalSize, action, prepare, suffix = '', onReset, children }: ExportPanelProps) {
  const [fmt, setFmt] = useState<OutFmt>(defaultFmt ?? formats[0])
  const [colors, setColors] = useState(256)
  const [dither, setDither] = useState(false)
  const [lossy, setLossy] = useState(0)
  const [webpQ, setWebpQ] = useState(80)
  const [webpLossless, setWebpLossless] = useState(false)
  const [apngSmall, setApngSmall] = useState(false)
  const [bg, setBg] = useState('#ffffff')
  const [repeat, setRepeat] = useState(1)
  const [result, setResult] = useState<{ blob: Blob; name: string; fmt: OutFmt } | null>(null)
  const url = useObjectUrl(result?.blob)
  const job = useMediaJob()
  const transparent = useMemo(() => (anim ? hasTransparency(anim) : false), [anim])
  useEffect(() => { setResult(null) }, [anim])

  const go = () => job.run(async ({ setProgress, setLabel }) => {
    setResult(null)
    setLabel('Preparing')
    const a = prepare ? await prepare() : anim
    if (!a) throw new Error('Load an animation first.')
    const blob = await encodeAnim(a, fmt, {
      gif: { colors, dither: dither ? 0.85 : 0, lossy },
      apngColors: apngSmall ? 256 : 0,
      webpQuality: webpQ, webpLossless,
      background: bg, videoRepeat: repeat,
      onProgress: setProgress, onLabel: setLabel,
    })
    setResult({ blob, name: `${baseName(name)}${suffix}.${OUT_EXT[fmt]}`, fmt })
  })

  return (
    <div className="space-y-4">
      {children}
      {formats.length > 1 && (
        <div>
          <Label>Save as</Label>
          <Segmented value={fmt} onChange={(v) => { setFmt(v); setResult(null) }} options={formats.map((f) => ({ value: f, label: OUT_LABEL[f] }))} />
        </div>
      )}
      {fmt === 'gif' && (
        <div className="space-y-3">
          <Slider label="Colours" value={colors} onChange={setColors} min={2} max={256} step={1} />
          <Slider label="Lossy compression" value={lossy} onChange={setLossy} min={0} max={100} suffix="" />
          <Switch checked={dither} onChange={setDither} label="Dithering (smoother gradients)" />
        </div>
      )}
      {fmt === 'webp' && (
        <div className="space-y-3">
          <Switch checked={webpLossless} onChange={setWebpLossless} label="Lossless" />
          {!webpLossless && <Slider label="Quality" value={webpQ} onChange={setWebpQ} min={1} max={100} />}
        </div>
      )}
      {fmt === 'apng' && <Switch checked={apngSmall} onChange={setApngSmall} label="Smaller file (256 colours)" />}
      {(fmt === 'mp4' || fmt === 'webm') && (
        <div className="space-y-3">
          {fmt === 'mp4' && transparent && <div><Label>Background for transparent areas</Label><ColorInput value={bg} onChange={setBg} /></div>}
          <Slider label="Play the loop" value={repeat} onChange={setRepeat} min={1} max={20} suffix="×" />
        </div>
      )}
      <Button size="lg" className="w-full" icon={<Download className="size-5" />} onClick={go} loading={job.busy} disabled={!anim}>{action ?? `Save as ${OUT_LABEL[fmt]}`}</Button>
      <JobPanel job={job} onRetry={go} />
      {result && url && (
        <Reveal k={url}>
          <ResultCard blob={result.blob} filename={result.name} originalSize={originalSize} title={`${OUT_LABEL[result.fmt]} ready`} onReset={onReset}>
            {result.fmt === 'mp4' || result.fmt === 'webm'
              ? <video src={url} controls loop autoPlay muted playsInline className="max-h-72 w-full rounded-xl bg-black" />
              : <div className="checker grid place-items-center rounded-xl p-2"><img src={url} alt="Result preview" className="max-h-72 max-w-full" /></div>}
          </ResultCard>
        </Reveal>
      )}
    </div>
  )
}

/** File row with a start over button. */
export function AnimBar({ file, onReset, children }: { file: File; onReset: () => void; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-0 flex-1 truncate text-sm font-medium" title={file.name}>{file.name}</div>
      {children}
      <Button variant="ghost" size="sm" icon={<RotateCcw className="size-4" />} onClick={onReset}>Start over</Button>
    </div>
  )
}

/** Debounced async preview of a transform; returns the latest result. */
export function usePreview<T>(compute: () => Promise<T> | T, deps: unknown[], ms = 250) {
  const [value, setValue] = useState<T | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setBusy(true)
    const t = setTimeout(async () => {
      try { const v = await compute(); if (alive) { setValue(v); setError(null) } }
      catch (e: any) { if (alive) setError(e?.message || String(e)) }
      finally { if (alive) setBusy(false) }
    }, ms)
    return () => { alive = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return { value, busy, error }
}

export function LoopIcon() { return <Repeat className="size-4" /> }

/** Bare canvas that plays an animation (no padding, so overlays can align to it). */
export function AnimCanvas({ anim, playing = true, className, style }: { anim: Anim; playing?: boolean; className?: string; style?: React.CSSProperties }) {
  const c = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let i = 0, t: ReturnType<typeof setTimeout>
    const draw = () => { const f = anim.frames[i]; if (c.current && f) frameToCanvas(f.rgba, anim.width, anim.height, c.current) }
    const step = () => { draw(); if (!playing || anim.frames.length < 2) return; t = setTimeout(() => { i = (i + 1) % anim.frames.length; step() }, Math.max(16, anim.frames[i].delay)) }
    step()
    return () => clearTimeout(t)
  }, [anim, playing])
  return <canvas ref={c} className={cn('block max-w-full', className)} style={{ maxHeight: '60vh', ...style }} />
}
