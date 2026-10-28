import { useCallback, useState } from 'react'
import { ArrowRight, RefreshCw } from 'lucide-react'
import { Button, Label, Progress, Slider, Switch, ToolGrid, ErrorNote, cn, useJob } from '@/components/ui'
import { BatchResults, ColorInput, ImageDrop, StatusPill, ThumbGrid, decode, encodeICO, exportCanvas, flatten, fmtFromMime, fmtSupported, hasAlpha, outName, toCanvas, useImageList, type Fmt, type Result } from './_img/kit'

const FORMATS: { f: Fmt; label: string; sub: string }[] = [
  { f: 'png', label: 'PNG', sub: 'Lossless · transparency' },
  { f: 'jpg', label: 'JPG', sub: 'Photos · smallest' },
  { f: 'webp', label: 'WEBP', sub: 'Modern web' },
  { f: 'avif', label: 'AVIF', sub: 'Next-gen' },
  { f: 'bmp', label: 'BMP', sub: 'Uncompressed' },
  { f: 'gif', label: 'GIF', sub: '256 colors' },
  { f: 'ico', label: 'ICO', sub: 'Favicon / icon' },
]
const ICO_SIZES = [16, 32, 48, 64, 128, 256]

export default function ImageConverter() {
  const { items, add, remove, clear } = useImageList()
  const [to, setTo] = useState<Fmt>('webp')
  const [quality, setQuality] = useState(90)
  const [bg, setBg] = useState('#ffffff')
  const [keepAlphaGif, setKeepAlphaGif] = useState(true)
  const [icoSizes, setIcoSizes] = useState<number[]>(ICO_SIZES)
  const [status, setStatus] = useState<Record<string, 'run' | 'done' | 'err'>>({})
  const [results, setResults] = useState<Result[] | null>(null)
  const { busy, progress, error, run } = useJob()
  const onFiles = useCallback((f: File[]) => { add(f); setResults(null) }, [add])
  const reset = () => { clear(); setResults(null); setStatus({}) }

  const convert = () => run(async (setP) => {
    const out: Result[] = []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      setStatus((s) => ({ ...s, [it.id]: 'run' }))
      try {
        const c = toCanvas(await decode(it.file))
        let blob: Blob
        if (to === 'ico') {
          if (!icoSizes.length) throw new Error('Pick at least one icon size')
          blob = await encodeICO(c, [...icoSizes].sort((a, b) => a - b))
        } else if (to === 'gif' && !keepAlphaGif && hasAlpha(c)) {
          blob = await exportCanvas(flatten(c, bg), 'gif')
        } else blob = await exportCanvas(c, to, quality / 100, bg)
        out.push({ id: it.id, name: outName(it.file.name, to), blob, originalSize: it.file.size, url: URL.createObjectURL(blob), note: `${fmtFromMime(it.file.type, it.file.name).toUpperCase()} → ${to.toUpperCase()}` })
        setStatus((s) => ({ ...s, [it.id]: 'done' }))
      } catch (e: any) {
        setStatus((s) => ({ ...s, [it.id]: 'err' }))
        if (items.length === 1) throw e
      }
      setP((i + 1) / items.length)
    }
    if (!out.length) throw new Error('No images could be converted.')
    setResults(out)
  })

  if (!items.length) return <ImageDrop onFiles={onFiles} label="Drop images to convert" />
  const lossy = to === 'jpg' || to === 'webp' || to === 'avif'
  const needsBg = to === 'jpg' || to === 'bmp' || (to === 'gif' && !keepAlphaGif)

  return (
    <div className="space-y-6">
      <ToolGrid
        main={<ThumbGrid items={items} onRemove={(id) => { remove(id); setResults(null) }} onAdd={onFiles}
          extra={(it) => <div className="flex items-center justify-between"><span className="text-[11px] text-muted">{fmtFromMime(it.file.type, it.file.name).toUpperCase()} <ArrowRight className="inline size-3" /> {to.toUpperCase()}</span><StatusPill state={status[it.id]} /></div>} />}
        side={<>
          <div>
            <Label>Convert to</Label>
            <div className="grid grid-cols-2 gap-2">
              {FORMATS.map(({ f, label, sub }) => { const ok = fmtSupported(f); return (
                <button key={f} disabled={!ok} onClick={() => { setTo(f); setResults(null) }} title={ok ? '' : 'Not supported by this browser'}
                  className={cn('rounded-xl border px-3 py-2 text-left transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-40', to === f ? 'border-accent bg-accent/10 ring-2 ring-accent/20' : 'border-border hover:border-accent/50')}>
                  <div className="text-sm font-semibold">{label}</div><div className="text-[11px] text-muted">{ok ? sub : 'Unsupported here'}</div>
                </button>) })}
            </div>
          </div>
          {lossy && <Slider label="Quality" value={quality} onChange={setQuality} min={10} max={100} suffix="%" />}
          {to === 'gif' && <Switch checked={keepAlphaGif} onChange={setKeepAlphaGif} label="Keep transparency" />}
          {to === 'ico' && (
            <div>
              <Label hint={`${icoSizes.length} sizes`}>Icon sizes</Label>
              <div className="flex flex-wrap gap-1.5">
                {ICO_SIZES.map((s) => <button key={s} onClick={() => setIcoSizes((a) => a.includes(s) ? a.filter((x) => x !== s) : [...a, s])} className={cn('rounded-lg border px-2.5 py-1 font-mono text-xs cursor-pointer', icoSizes.includes(s) ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted')}>{s}</button>)}
              </div>
              <p className="mt-1.5 text-[11px] text-muted">Each size is embedded as a PNG; non-square images are centered on transparency.</p>
            </div>
          )}
          {needsBg && <div><Label>Background for transparent areas</Label><ColorInput value={bg} onChange={setBg} /></div>}
          {busy && <Progress value={progress} label="Converting" />}
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" loading={busy} icon={<RefreshCw className="size-4" />} onClick={convert}>Convert {items.length} to {to.toUpperCase()}</Button>
          <Button variant="ghost" className="w-full" onClick={reset}>Start over</Button>
        </>}
      />
      {results && <BatchResults results={results} zipName={`converted-${to}.zip`} onReset={reset} />}
    </div>
  )
}
