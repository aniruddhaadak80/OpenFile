import { useCallback, useState } from 'react'
import { Target } from 'lucide-react'
import { Button, Field, Input, Label, Progress, Segmented, Switch, ToolGrid, ErrorNote, useJob } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { BatchResults, ImageDrop, StatusPill, ThumbGrid, hqResize, outName, useImageList, type Result } from './_img/kit'
import { decodeAny, encodeCanvas, type OutFmt } from '@/lib/b2/codecs'

const PRESETS = [10, 20, 30, 50, 100, 200, 500, 1000]
type Unit = 'KB' | 'MB'

/** Find the best quality (and, if needed, the largest size) that fits under `target` bytes. */
async function fitToSize(src: HTMLCanvasElement, fmt: OutFmt, target: number, allowResize: boolean, onStep: (s: string) => void) {
  let scale = 1, best: { blob: Blob; q: number; scale: number } | null = null
  for (let round = 0; round < 12; round++) {
    const c = scale === 1 ? src : hqResize(src, src.width * scale, src.height * scale)
    let lo = 5, hi = 95, found: Blob | null = null, foundQ = 0
    const minBlob = await encodeCanvas(c, fmt, { quality: lo })
    if (minBlob.size > target) {
      if (!allowResize) throw new Error(`Even at the lowest quality the image is ${formatBytes(minBlob.size)}. Turn on "Allow smaller dimensions" or pick a larger target.`)
      scale *= Math.max(0.35, Math.min(0.9, Math.sqrt(target / minBlob.size) * 0.95))
      onStep(`Reducing size to ${Math.round(src.width * scale)}×${Math.round(src.height * scale)}`)
      continue
    }
    found = minBlob; foundQ = lo
    for (let i = 0; i < 7 && hi - lo > 1; i++) {
      const mid = Math.round((lo + hi) / 2)
      onStep(`Trying quality ${mid} at ${c.width}×${c.height}`)
      const b = await encodeCanvas(c, fmt, { quality: mid })
      if (b.size <= target) { found = b; foundQ = mid; lo = mid } else hi = mid
    }
    best = { blob: found, q: foundQ, scale }
    // if quality ended very low and resize is allowed, a slightly smaller image often looks better
    if (allowResize && foundQ < 25 && scale > 0.5) {
      const alt = hqResize(src, src.width * scale * 0.8, src.height * scale * 0.8)
      let l2 = foundQ, h2 = 95, f2: Blob | null = null, q2 = 0
      for (let i = 0; i < 6 && h2 - l2 > 1; i++) { const mid = Math.round((l2 + h2) / 2); const b = await encodeCanvas(alt, fmt, { quality: mid }); if (b.size <= target) { f2 = b; q2 = mid; l2 = mid } else h2 = mid }
      if (f2 && q2 >= foundQ + 20) best = { blob: f2, q: q2, scale: scale * 0.8 }
    }
    break
  }
  if (!best) throw new Error('Could not reach that size. Try a larger target.')
  return best
}

export default function CompressToSize() {
  const { items, add, remove, clear } = useImageList()
  const [size, setSize] = useState(50)
  const [unit, setUnit] = useState<Unit>('KB')
  const [fmt, setFmt] = useState<OutFmt>('jpg')
  const [allowResize, setAllowResize] = useState(true)
  const [status, setStatus] = useState<Record<string, 'run' | 'done' | 'err'>>({})
  const [step, setStep] = useState('')
  const [results, setResults] = useState<Result[] | null>(null)
  const { busy, progress, error, run } = useJob()
  const onFiles = useCallback((f: File[]) => { add(f); setResults(null) }, [add])
  const reset = () => { clear(); setResults(null); setStatus({}) }
  const target = Math.floor(size * (unit === 'MB' ? 1024 * 1024 : 1024))

  const go = () => run(async (setP) => {
    if (!(target > 512)) throw new Error('Pick a target of at least 1 KB.')
    const out: Result[] = []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      setStatus((s) => ({ ...s, [it.id]: 'run' }))
      try {
        const { canvas } = await decodeAny(it.file)
        const r = await fitToSize(canvas, fmt, target, allowResize, setStep)
        out.push({ id: it.id, name: outName(it.file.name, fmt), blob: r.blob, originalSize: it.file.size, url: URL.createObjectURL(r.blob), note: `quality ${r.q}${r.scale < 1 ? `, ${Math.round(canvas.width * r.scale)}×${Math.round(canvas.height * r.scale)}` : ''}` })
        setStatus((s) => ({ ...s, [it.id]: 'done' }))
      } catch (e) { setStatus((s) => ({ ...s, [it.id]: 'err' })); if (items.length === 1) throw e }
      setP((i + 1) / items.length)
    }
    if (!out.length) throw new Error('No image could be compressed to that size.')
    setResults(out); setStep('')
  })

  if (!items.length) return <ImageDrop onFiles={onFiles} label="Drop images to shrink to an exact size" />
  return (
    <div className="space-y-6">
      <ToolGrid
        main={<ThumbGrid items={items} onAdd={onFiles} onRemove={(id) => { remove(id); setResults(null) }} extra={(it) => <StatusPill state={status[it.id]} />} />}
        side={<>
          <div>
            <Label>Target size</Label>
            <div className="flex gap-2">
              <Input type="number" min={1} value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Target size" />
              <Segmented value={unit} onChange={setUnit} options={['KB', 'MB']} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => <button key={p} onClick={() => { setSize(p >= 1000 ? 1 : p); setUnit(p >= 1000 ? 'MB' : 'KB') }} className="rounded-lg border border-border px-2 py-1 font-mono text-xs text-muted hover:border-accent hover:text-accent cursor-pointer">{p >= 1000 ? '1 MB' : `${p} KB`}</button>)}
            </div>
          </div>
          <Field label="Output format"><Segmented value={fmt} onChange={setFmt} options={[{ value: 'jpg', label: 'JPG' }, { value: 'webp', label: 'WEBP' }, { value: 'avif', label: 'AVIF' }]} /></Field>
          <Switch checked={allowResize} onChange={setAllowResize} label="Allow smaller dimensions if needed" />
          <p className="text-xs text-muted">The tool searches for the highest quality that stays under {formatBytes(target)}. JPG uses MozJPEG for the best result per byte.</p>
          {busy && <Progress value={progress} label={step || 'Working'} />}
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" loading={busy} icon={<Target className="size-4" />} onClick={go}>Compress to {size} {unit}</Button>
          <Button variant="ghost" className="w-full" onClick={reset}>Start over</Button>
        </>}
      />
      {results && <BatchResults results={results} zipName={`under-${size}${unit.toLowerCase()}.zip`} onReset={reset} />}
    </div>
  )
}
