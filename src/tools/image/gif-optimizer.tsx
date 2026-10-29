import { useMemo, useState } from 'react'
import { Minimize2, Target } from 'lucide-react'
import { Button, Input, Label, ResultCard, Segmented, Slider, Switch, ToolGrid, ErrorNote } from '@/components/ui'
import { baseName, formatBytes } from '@/lib/files'
import { KEPT_ORIGINAL, notSmaller } from '@/lib/compress-guard'
import { type Anim, dedupeFrames, dropFrames, encodeAnim, encodeGif, resizeAnim, totalDuration } from '@/lib/b3/anim'
import { useMediaJob, useObjectUrl } from '@/tools/video/_media/media'
import { JobPanel, Note, Reveal } from '@/tools/video/_media/ui'
import { AnimBar, AnimDrop, AnimPlayer, AnimStats, Loading, useAnim } from './_b3/anim-ui'

type Mode = 'settings' | 'target'
type Out = 'gif' | 'webp'
const PRESETS = { light: { colors: 256, lossy: 20, drop: 1, scale: 100 }, balanced: { colors: 192, lossy: 50, drop: 1, scale: 100 }, strong: { colors: 96, lossy: 85, drop: 2, scale: 80 } }

function shrink(a: Anim, scale: number, drop: number) {
  let x = dedupeFrames(a)
  if (drop > 1) x = dropFrames(x, drop)
  if (scale < 100) x = resizeAnim(x, Math.max(1, Math.round(a.width * scale / 100)), Math.max(1, Math.round(a.height * scale / 100)))
  return x
}

export default function GifOptimizer() {
  const { file, anim, loading, progress, error, load, reset } = useAnim()
  const [mode, setMode] = useState<Mode>('settings')
  const [out, setOut] = useState<Out>('gif')
  const [colors, setColors] = useState(192)
  const [lossy, setLossy] = useState(50)
  const [dither, setDither] = useState(false)
  const [drop, setDrop] = useState(1)
  const [scale, setScale] = useState(100)
  const [quality, setQuality] = useState(70)
  const [targetKb, setTargetKb] = useState(1024)
  const [result, setResult] = useState<{ blob: Blob; note: string; kept?: boolean } | null>(null)
  const url = useObjectUrl(result?.blob)
  const job = useMediaJob()
  const start = () => { if (job.busy) job.cancel(); reset(); setResult(null); job.reset() }
  const fps = useMemo(() => (anim ? anim.frames.length / (totalDuration(anim) / 1000 || 1) : 0), [anim])

  const preset = (k: keyof typeof PRESETS) => { const p = PRESETS[k]; setColors(p.colors); setLossy(p.lossy); setDrop(p.drop); setScale(p.scale) }

  const go = () => job.run(async ({ setProgress, setLabel }) => {
    if (!anim || !file) return
    setResult(null)
    const tick = () => new Promise((r) => setTimeout(r, 0))
    if (mode === 'settings') {
      setLabel('Optimizing'); await tick()
      const a = shrink(anim, scale, drop)
      const blob = out === 'gif'
        ? new Blob([encodeGif(a, { colors, lossy, dither: dither ? 0.8 : 0, onProgress: setProgress }) as BlobPart], { type: 'image/gif' })
        : await encodeAnim(a, 'webp', { webpQuality: quality, onProgress: setProgress, onLabel: setLabel })
      if (notSmaller(file.size, blob.size)) { setResult({ blob: file, note: KEPT_ORIGINAL, kept: true }); return }
      setResult({ blob, note: `${a.width}×${a.height}, ${a.frames.length} frames` })
      return
    }
    // target size: walk a ladder from gentle to aggressive until the file fits
    const target = targetKb * 1024
    const ladder: { colors: number; lossy: number; scale: number; drop: number; q: number }[] = [
      { colors: 256, lossy: 20, scale: 100, drop: 1, q: 85 }, { colors: 192, lossy: 50, scale: 100, drop: 1, q: 75 },
      { colors: 128, lossy: 80, scale: 100, drop: 1, q: 65 }, { colors: 128, lossy: 90, scale: 85, drop: 1, q: 55 },
      { colors: 96, lossy: 100, scale: 75, drop: 1, q: 45 }, { colors: 64, lossy: 100, scale: 65, drop: 2, q: 40 },
      { colors: 48, lossy: 100, scale: 55, drop: 2, q: 32 }, { colors: 32, lossy: 100, scale: 45, drop: 2, q: 25 },
      { colors: 32, lossy: 100, scale: 35, drop: 3, q: 20 }, { colors: 16, lossy: 100, scale: 25, drop: 3, q: 15 },
    ]
    let best: Blob | null = null, note = ''
    for (let i = 0; i < ladder.length; i++) {
      const s = ladder[i]
      setLabel(`Trying step ${i + 1} of ${ladder.length}`); setProgress(i / ladder.length); await tick()
      const a = shrink(anim, s.scale, s.drop)
      const blob = out === 'gif'
        ? new Blob([encodeGif(a, { colors: s.colors, lossy: s.lossy }) as BlobPart], { type: 'image/gif' })
        : await encodeAnim(a, 'webp', { webpQuality: s.q })
      best = blob; note = `${a.width}×${a.height}, ${a.frames.length} frames${out === 'gif' ? `, ${s.colors} colours` : `, quality ${s.q}`}`
      if (blob.size <= target) break
    }
    if (best && notSmaller(file.size, best.size)) { setResult({ blob: file, note: KEPT_ORIGINAL, kept: true }); return }
    if (best && best.size > target) note += '. Could not reach the target without destroying the image; this is the smallest version.'
    if (best) setResult({ blob: best, note })
  })

  if (!file) return <AnimDrop onFile={load} label="Drop a GIF, APNG or animated WebP to compress" />
  if (loading) return <Loading progress={progress} />
  if (!anim) return <div className="space-y-3"><ErrorNote error={error} /><Button variant="outline" onClick={start}>Try another file</Button></div>

  const ext = out === 'gif' ? 'gif' : 'webp'
  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <AnimBar file={file} onReset={start} />
          <AnimPlayer anim={anim} />
          <AnimStats anim={anim} file={file} extra={<span className="rounded-lg bg-surface-2/70 px-2 py-1 text-xs"><span className="text-muted">Speed </span><span className="font-mono">{fps.toFixed(1)} fps</span></span>} />
        </>}
        side={<>
          <div><Label>Output</Label><Segmented value={out} onChange={(v) => { setOut(v); setResult(null) }} options={[{ value: 'gif', label: 'GIF' }, { value: 'webp', label: 'Animated WebP' }]} /></div>
          <div><Label>Mode</Label><Segmented value={mode} onChange={setMode} options={[{ value: 'settings', label: 'Settings' }, { value: 'target', label: 'Target size' }]} /></div>
          {mode === 'target' ? (
            <div>
              <Label hint={formatBytes(targetKb * 1024)}>Largest file size (KB)</Label>
              <Input type="number" min={10} value={targetKb} onChange={(e) => setTargetKb(Math.max(10, +e.target.value || 10))} />
              <div className="mt-2 flex flex-wrap gap-1.5">{[256, 512, 1024, 2048, 8192].map((k) => <Button key={k} size="sm" variant="secondary" onClick={() => setTargetKb(k)}>{k >= 1024 ? `${k / 1024} MB` : `${k} KB`}</Button>)}</div>
              <p className="mt-2 text-xs text-muted">Colours, size and frame count are reduced step by step until the file fits.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => preset('light')}>Light</Button>
                <Button size="sm" variant="secondary" onClick={() => preset('balanced')}>Balanced</Button>
                <Button size="sm" variant="secondary" onClick={() => preset('strong')}>Strong</Button>
              </div>
              {out === 'gif' ? <>
                <Slider label="Colours" value={colors} onChange={setColors} min={2} max={256} />
                <Slider label="Lossy" value={lossy} onChange={setLossy} min={0} max={100} />
                <Switch checked={dither} onChange={setDither} label="Dithering" />
              </> : <Slider label="Quality" value={quality} onChange={setQuality} min={1} max={100} />}
              <Slider label="Size" value={scale} onChange={setScale} min={10} max={100} suffix="%" />
              <div>
                <Label hint={drop === 1 ? 'keep all' : `keep 1 of ${drop}`}>Drop frames</Label>
                <Segmented value={String(drop)} onChange={(v) => setDrop(+v)} options={['1', '2', '3', '4'].map((v) => ({ value: v, label: v === '1' ? 'None' : `1/${v}` }))} />
              </div>
            </div>
          )}
          <Button size="lg" className="w-full" icon={mode === 'target' ? <Target className="size-5" /> : <Minimize2 className="size-5" />} onClick={go} loading={job.busy}>Compress</Button>
          <JobPanel job={job} onRetry={go} />
          <Note>Unchanged pixels between frames are stored once, and identical frames are merged, so the file shrinks even at full quality.</Note>
        </>}
      />
      {result && url && (
        <Reveal k={url}>
          <ResultCard blob={result.blob} filename={result.kept ? file.name : `${baseName(file.name)}-optimized.${ext}`} originalSize={file.size} title={result.kept ? 'Here is your original file' : 'Compressed'} onReset={start}>
            {result.kept && <Note tone="warn" className="mb-3">{KEPT_ORIGINAL} Try the Strong preset, fewer colours, a smaller size or dropping frames.</Note>}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="checker grid place-items-center rounded-xl p-2"><img src={url} alt="Compressed result" className="max-h-72 max-w-full" /></div>
              <div className="space-y-2 text-sm">
                {!result.kept && <div className="text-muted">{result.note}</div>}
                <div className="font-mono">{formatBytes(file.size)} → <span className="text-success">{formatBytes(result.blob.size)}</span></div>
              </div>
            </div>
          </ResultCard>
        </Reveal>
      )}
    </div>
  )
}
