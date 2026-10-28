import { useCallback, useRef, useState } from 'react'
import { ArrowRight, RefreshCw } from 'lucide-react'
import { Button, Label, Progress, Slider, Switch, ToolGrid, ErrorNote, cn, useJob } from '@/components/ui'
import { BatchResults, ColorInput, ImageDrop, StatusPill, ThumbGrid, decode, encodeICO, exportCanvas, flatten, fmtFromMime, fmtSupported, hasAlpha, outName, toCanvas, useImageList, type Fmt, type Result } from './_img/kit'
import { toast } from '@/components/toast'

// Extra formats (Batch 2): decoded and encoded with the shared WebAssembly codecs.
type XFmt = Fmt | 'jxl' | 'qoi' | 'tiff'
const NEEDS_DECODER = /\.(tiff?|jxl|qoi|heic|heif|psd|tga|ppm|pgm|pbm|pam|pnm|icns|cur|jfif)$/i
const ACCEPT = 'image/*,.tif,.tiff,.jxl,.qoi,.heic,.heif,.psd,.tga,.ppm,.pgm,.pbm,.pam,.icns,.cur,.ico,.jfif'
const ALIAS: Record<string, XFmt> = { jpeg: 'jpg', jpg: 'jpg', png: 'png', webp: 'webp', avif: 'avif', bmp: 'bmp', gif: 'gif', ico: 'ico', jxl: 'jxl', qoi: 'qoi', tif: 'tiff', tiff: 'tiff' }
/** Format-pair landing pages such as /tools/image-converter?from=heic&to=jpg preselect the target. */
function initialTarget(): XFmt { try { const p = new URLSearchParams(location.search); const pair = (p.get('pair') ?? '').split('-to-'); return ALIAS[(p.get('to') ?? pair[1] ?? '').toLowerCase()] ?? 'webp' } catch { return 'webp' } }

const FORMATS: { f: XFmt; label: string; sub: string }[] = [
  { f: 'png', label: 'PNG', sub: 'Lossless · transparency' },
  { f: 'jpg', label: 'JPG', sub: 'Photos · smallest' },
  { f: 'webp', label: 'WEBP', sub: 'Modern web' },
  { f: 'avif', label: 'AVIF', sub: 'Next-gen' },
  { f: 'bmp', label: 'BMP', sub: 'Uncompressed' },
  { f: 'gif', label: 'GIF', sub: '256 colors' },
  { f: 'ico', label: 'ICO', sub: 'Favicon / icon' },
  { f: 'jxl', label: 'JPEG XL', sub: 'Next-gen, lossless JPG' },
  { f: 'qoi', label: 'QOI', sub: 'Fast lossless' },
  { f: 'tiff', label: 'TIFF', sub: 'Print, archive' },
]
const isExtra = (f: XFmt): f is 'jxl' | 'qoi' | 'tiff' => f === 'jxl' || f === 'qoi' || f === 'tiff'
const ICO_SIZES = [16, 32, 48, 64, 128, 256]

export default function ImageConverter() {
  const { items, add, remove, clear } = useImageList()
  const [to, setTo] = useState<XFmt>(initialTarget)
  const originals = useRef(new Map<File, File>())
  const [quality, setQuality] = useState(90)
  const [bg, setBg] = useState('#ffffff')
  const [keepAlphaGif, setKeepAlphaGif] = useState(true)
  const [icoSizes, setIcoSizes] = useState<number[]>(ICO_SIZES)
  const [status, setStatus] = useState<Record<string, 'run' | 'done' | 'err'>>({})
  const [results, setResults] = useState<Result[] | null>(null)
  const { busy, progress, error, run } = useJob()
  const onFiles = useCallback(async (f: File[]) => {
    setResults(null)
    // formats the browser cannot preview are decoded to PNG for the thumbnail; the original is kept for conversion
    const ready: File[] = []
    for (const file of f) {
      if (!NEEDS_DECODER.test(file.name)) { ready.push(file); continue }
      try {
        const { decodeAny } = await import('@/lib/b2/codecs')
        const { canvas } = await decodeAny(file)
        const png = await new Promise<Blob>((r, j) => canvas.toBlob((b) => (b ? r(b) : j(new Error('decode failed'))), 'image/png'))
        const proxy = new File([png], file.name, { type: 'image/png' })
        originals.current.set(proxy, file); ready.push(proxy)
      } catch (e: any) { toast(`Could not read ${file.name}: ${e?.message || e}`, 'error') }
    }
    if (ready.length) add(ready)
  }, [add])
  const reset = () => { clear(); setResults(null); setStatus({}) }

  const convert = () => run(async (setP) => {
    const out: Result[] = []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      setStatus((s) => ({ ...s, [it.id]: 'run' }))
      try {
        const c = toCanvas(await decode(it.file))
        let blob: Blob
        if (isExtra(to)) {
          const { encodeCanvas } = await import('@/lib/b2/codecs')
          blob = await encodeCanvas(c, to, { quality })
        } else if (to === 'ico') {
          if (!icoSizes.length) throw new Error('Pick at least one icon size')
          blob = await encodeICO(c, [...icoSizes].sort((a, b) => a - b))
        } else if (to === 'gif' && !keepAlphaGif && hasAlpha(c)) {
          blob = await exportCanvas(flatten(c, bg), 'gif')
        } else blob = await exportCanvas(c, to, quality / 100, bg)
        const src = originals.current.get(it.file) ?? it.file
        out.push({ id: it.id, name: outName(it.file.name, to === 'tiff' ? 'tif' : to), blob, originalSize: src.size, url: URL.createObjectURL(blob), note: `${(src.name.split('.').pop() ?? '').toUpperCase()} → ${to.toUpperCase()}` })
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

  if (!items.length) return <ImageDrop onFiles={onFiles} label="Drop images to convert" accept={ACCEPT} sub={<>JPG, PNG, WEBP, AVIF, GIF, BMP, HEIC, TIFF, JPEG XL, QOI, PSD, TGA and more · never uploaded</>} />
  const lossy = to === 'jpg' || to === 'webp' || to === 'avif' || to === 'jxl'
  const needsBg = to === 'jpg' || to === 'bmp' || (to === 'gif' && !keepAlphaGif)

  return (
    <div className="space-y-6">
      <ToolGrid
        main={<ThumbGrid items={items} accept={ACCEPT} onRemove={(id) => { remove(id); setResults(null) }} onAdd={onFiles}
          extra={(it) => <div className="flex items-center justify-between"><span className="text-[11px] text-muted">{(originals.current.has(it.file) ? (it.file.name.split('.').pop() ?? '') : fmtFromMime(it.file.type, it.file.name)).toUpperCase()} <ArrowRight className="inline size-3" /> {to.toUpperCase()}</span><StatusPill state={status[it.id]} /></div>} />}
        side={<>
          <div>
            <Label>Convert to</Label>
            <div className="grid grid-cols-2 gap-2">
              {FORMATS.map(({ f, label, sub }) => { const ok = isExtra(f) || fmtSupported(f); return (
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
