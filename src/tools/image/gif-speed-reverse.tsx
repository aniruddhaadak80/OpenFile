import { useMemo, useState } from 'react'
import { Button, Label, Segmented, Slider, Switch, ToolGrid, ErrorNote, cn } from '@/components/ui'
import { type Anim, boomerang, changeSpeed, cutAnim, reverseAnim, setAllDelays, totalDuration } from '@/lib/b3/anim'
import { AnimBar, AnimDrop, AnimPlayer, AnimStats, ExportPanel, Loading, useAnim, useFrameThumbs } from './_b3/anim-ui'

type Dir = 'forward' | 'reverse' | 'boomerang'
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]

export default function GifSpeedReverse() {
  const { file, anim, loading, progress, error, load, reset } = useAnim()
  const thumbs = useFrameThumbs(anim, 64)
  const [speed, setSpeed] = useState(1)
  const [fixed, setFixed] = useState(false)
  const [fixedDelay, setFixedDelay] = useState(100)
  const [dir, setDir] = useState<Dir>('forward')
  const [range, setRange] = useState<[number, number] | null>(null)
  const n = anim?.frames.length ?? 0
  const [a0, a1] = range ?? [0, Math.max(0, n - 1)]

  const out: Anim | null = useMemo(() => {
    if (!anim) return null
    let a = cutAnim(anim, a0, a1)
    a = fixed ? setAllDelays(a, fixedDelay) : changeSpeed(a, speed)
    if (dir === 'reverse') a = reverseAnim(a)
    if (dir === 'boomerang') a = boomerang(a)
    return a
  }, [anim, a0, a1, speed, fixed, fixedDelay, dir])

  const start = () => { reset(); setRange(null); setSpeed(1); setDir('forward') }
  if (!file) return <AnimDrop onFile={load} label="Drop a GIF, APNG or animated WebP to change speed, reverse or cut" />
  if (loading) return <Loading progress={progress} />
  if (!anim || !out) return <div className="space-y-3"><ErrorNote error={error} /><Button variant="outline" onClick={start}>Try another file</Button></div>

  return (
    <ToolGrid
      main={<>
        <AnimBar file={file} onReset={start} />
        <AnimPlayer anim={out} />
        <AnimStats anim={out} file={file} />
        {n > 1 && (
          <div className="space-y-2">
            <Label hint={`frames ${a0 + 1} to ${a1 + 1}`}>Cut</Label>
            <div className="flex gap-0.5 overflow-hidden rounded-lg">
              {thumbs.map((t, i) => <img key={i} src={t} alt="" className={cn('h-10 min-w-0 flex-1 object-cover transition', (i < a0 || i > a1) && 'opacity-25 grayscale')} />)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Slider label="First frame" value={a0 + 1} min={1} max={n} onChange={(v) => setRange([Math.min(v - 1, a1), a1])} />
              <Slider label="Last frame" value={a1 + 1} min={1} max={n} onChange={(v) => setRange([a0, Math.max(v - 1, a0)])} />
            </div>
          </div>
        )}
      </>}
      side={<>
        <div><Label>Direction</Label><Segmented value={dir} onChange={setDir} options={[{ value: 'forward', label: 'Forward' }, { value: 'reverse', label: 'Reverse' }, { value: 'boomerang', label: 'Boomerang' }]} /></div>
        <div className="space-y-2">
          <Switch checked={fixed} onChange={setFixed} label="Same delay for every frame" />
          {fixed ? <Slider label="Delay" value={fixedDelay} onChange={setFixedDelay} min={20} max={2000} step={10} suffix=" ms" /> : <>
            <Label hint={`${speed}×`}>Speed</Label>
            <input type="range" min={-2} max={2} step={0.01} value={Math.log2(speed)} onChange={(e) => setSpeed(+Math.pow(2, +e.target.value).toFixed(2))} className="w-full cursor-pointer accent-[var(--accent)]" aria-label="Speed" />
            <div className="flex flex-wrap gap-1.5">{SPEEDS.map((s) => <button key={s} onClick={() => setSpeed(s)} className={cn('rounded-lg px-2.5 py-1 font-mono text-xs transition cursor-pointer', speed === s ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted hover:text-fg')}>{s}×</button>)}</div>
          </>}
          <p className="text-xs text-muted">Length {(totalDuration(anim) / 1000).toFixed(2)}s → <span className="text-accent">{(totalDuration(out) / 1000).toFixed(2)}s</span>. Frames faster than 20 ms are merged, because viewers cannot show them.</p>
        </div>
        <ExportPanel anim={out} name={file.name} suffix={dir === 'forward' ? `-${speed}x` : `-${dir}`} defaultFmt={anim.source === 'WebP' ? 'webp' : anim.source === 'APNG' ? 'apng' : 'gif'} originalSize={file.size} onReset={start} />
      </>}
    />
  )
}
