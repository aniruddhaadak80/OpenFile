import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Cpu } from 'lucide-react'
import { Button, Dropzone, Label, Progress, Slider, Switch, ToolGrid, ErrorNote, cn, useJob } from '@/components/ui'
import { formatBytes, baseName } from '@/lib/files'
import { BatchResults, ColorInput, StatusPill, uid, type Result } from './_img/kit'
import { decodeAny, encodeCanvas, extOf, type OutFmt } from '@/lib/b2/codecs'

type Target = { id: string; label: string; sub: string; ext: string; engine: 'native' | 'magick'; magick?: string; lossy?: boolean }
const TARGETS: Target[] = [
  { id: 'png', label: 'PNG', sub: 'Lossless', ext: 'png', engine: 'native' },
  { id: 'jpg', label: 'JPG', sub: 'MozJPEG', ext: 'jpg', engine: 'native', lossy: true },
  { id: 'webp', label: 'WEBP', sub: 'libwebp', ext: 'webp', engine: 'native', lossy: true },
  { id: 'avif', label: 'AVIF', sub: 'libavif', ext: 'avif', engine: 'native', lossy: true },
  { id: 'jxl', label: 'JPEG XL', sub: 'libjxl', ext: 'jxl', engine: 'native', lossy: true },
  { id: 'qoi', label: 'QOI', sub: 'Fast lossless', ext: 'qoi', engine: 'native' },
  { id: 'tiff', label: 'TIFF', sub: 'Print, archive', ext: 'tif', engine: 'native' },
  { id: 'bmp', label: 'BMP', sub: 'Uncompressed', ext: 'bmp', engine: 'native' },
  { id: 'gif', label: 'GIF', sub: '256 colours', ext: 'gif', engine: 'native' },
  { id: 'ico', label: 'ICO', sub: 'Windows icon', ext: 'ico', engine: 'native' },
  { id: 'jp2', label: 'JPEG 2000', sub: 'JP2', ext: 'jp2', engine: 'magick', magick: 'JP2', lossy: true },
  { id: 'tga', label: 'TGA', sub: 'Targa', ext: 'tga', engine: 'magick', magick: 'TGA' },
  { id: 'psd', label: 'PSD', sub: 'Flat Photoshop', ext: 'psd', engine: 'magick', magick: 'PSD' },
  { id: 'dds', label: 'DDS', sub: 'Game textures', ext: 'dds', engine: 'magick', magick: 'DDS' },
  { id: 'pcx', label: 'PCX', sub: 'Legacy paint', ext: 'pcx', engine: 'magick', magick: 'PCX' },
  { id: 'ppm', label: 'PPM', sub: 'Netpbm colour', ext: 'ppm', engine: 'magick', magick: 'PPM' },
  { id: 'pgm', label: 'PGM', sub: 'Netpbm grey', ext: 'pgm', engine: 'magick', magick: 'PGM' },
  { id: 'pbm', label: 'PBM', sub: 'Netpbm 1-bit', ext: 'pbm', engine: 'magick', magick: 'PBM' },
  { id: 'pam', label: 'PAM', sub: 'Netpbm alpha', ext: 'pam', engine: 'magick', magick: 'PAM' },
  { id: 'sgi', label: 'SGI', sub: 'Silicon Graphics', ext: 'sgi', engine: 'magick', magick: 'SGI' },
  { id: 'pict', label: 'PICT', sub: 'Classic Mac', ext: 'pct', engine: 'magick', magick: 'PICT' },
  { id: 'xbm', label: 'XBM', sub: 'X11 bitmap', ext: 'xbm', engine: 'magick', magick: 'XBM' },
  { id: 'xpm', label: 'XPM', sub: 'X11 pixmap', ext: 'xpm', engine: 'magick', magick: 'XPM' },
  { id: 'wbmp', label: 'WBMP', sub: 'Wireless bitmap', ext: 'wbmp', engine: 'magick', magick: 'WBMP' },
  { id: 'hdr', label: 'HDR', sub: 'Radiance', ext: 'hdr', engine: 'magick', magick: 'HDR' },
  { id: 'ff', label: 'Farbfeld', sub: 'Simple lossless', ext: 'ff', engine: 'magick', magick: 'FARBFELD' },
]
const NATIVE_IN = new Set(['png', 'jpg', 'jpeg', 'jfif', 'pjpeg', 'webp', 'gif', 'bmp', 'avif', 'tif', 'tiff', 'jxl', 'qoi', 'heic', 'heif', 'psd', 'psb', 'ppm', 'pgm', 'pbm', 'pam', 'pnm', 'tga', 'ico', 'cur', 'icns', 'svg', 'svgz'])
const MAGICK_HINT: Record<string, string> = { xcf: 'XCF', pcx: 'PCX', dds: 'DDS', sgi: 'SGI', rgb: 'SGI', pict: 'PICT', pct: 'PICT', xbm: 'XBM', xpm: 'XPM', wbmp: 'WBMP', jp2: 'JP2', j2k: 'JP2', jpf: 'JP2', jpx: 'JP2', hdr: 'HDR', exr: 'EXR', mng: 'MNG', dpx: 'DPX', cin: 'CIN', fits: 'FITS', fit: 'FITS', ras: 'SUN', sun: 'SUN', ff: 'FARBFELD', pfm: 'PFM', miff: 'MIFF', dcx: 'DCX', otb: 'OTB', palm: 'PALM', pcd: 'PCD', viff: 'VIFF', wpg: 'WPG' }
export const PRO_ACCEPT = [...NATIVE_IN, ...Object.keys(MAGICK_HINT)].map((e) => '.' + e).join(',') + ',image/*'

type Item = { id: string; file: File; preview?: string; info?: string; err?: string }

async function decodeFile(file: File): Promise<{ canvas: HTMLCanvasElement; format: string }> {
  const ext = extOf(file.name)
  if (!MAGICK_HINT[ext]) {
    try { return await decodeAny(file) } catch (e) { if (NATIVE_IN.has(ext)) throw e }
  }
  const { magickToPng } = await import('@/lib/b2/magick')
  const r = await magickToPng(new Uint8Array(await file.arrayBuffer()), MAGICK_HINT[ext])
  const d = await decodeAny(new Blob([r.png as BlobPart], { type: 'image/png' }))
  return { canvas: d.canvas, format: r.format.toLowerCase() }
}

export default function ProImageConverter() {
  const initial = useMemo(() => new URLSearchParams(location.search).get('to') ?? 'png', [])
  const [items, setItems] = useState<Item[]>([])
  const [to, setTo] = useState(TARGETS.some((t) => t.id === initial) ? initial : 'png')
  const [quality, setQuality] = useState(85)
  const [lossless, setLossless] = useState(false)
  const [bg, setBg] = useState('#ffffff')
  const [status, setStatus] = useState<Record<string, 'run' | 'done' | 'err'>>({})
  const [results, setResults] = useState<Result[] | null>(null)
  const { busy, progress, error, run } = useJob()
  const t = TARGETS.find((x) => x.id === to)!

  const add = useCallback(async (files: File[]) => {
    setResults(null)
    const fresh = files.map((file) => ({ id: uid(), file }))
    setItems((s) => [...s, ...fresh])
    for (const it of fresh) {
      try {
        const d = await decodeFile(it.file)
        const small = document.createElement('canvas'); const s = Math.min(1, 320 / Math.max(d.canvas.width, d.canvas.height))
        small.width = Math.max(1, d.canvas.width * s); small.height = Math.max(1, d.canvas.height * s)
        small.getContext('2d')!.drawImage(d.canvas, 0, 0, small.width, small.height)
        const preview = small.toDataURL('image/png')
        setItems((s) => s.map((x) => (x.id === it.id ? { ...x, preview, info: `${d.format.toUpperCase()} · ${d.canvas.width}×${d.canvas.height}` } : x)))
      } catch (e: any) { setItems((s) => s.map((x) => (x.id === it.id ? { ...x, err: e?.message || 'Unreadable' } : x))) }
    }
  }, [])
  useEffect(() => () => setItems([]), [])

  const convert = () => run(async (setP) => {
    const out: Result[] = []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      setStatus((s) => ({ ...s, [it.id]: 'run' }))
      try {
        const { canvas } = await decodeFile(it.file)
        let blob: Blob
        if (t.engine === 'native') blob = await encodeCanvas(canvas, to as OutFmt, { quality, lossless, bg, oxipngLevel: to === 'png' ? 2 : 0 })
        else {
          const png = new Uint8Array(await (await encodeCanvas(canvas, 'png')).arrayBuffer())
          const { pngToMagick } = await import('@/lib/b2/magick')
          blob = new Blob([(await pngToMagick(png, t.magick!, quality)) as BlobPart], { type: 'application/octet-stream' })
        }
        out.push({ id: it.id, name: `${baseName(it.file.name)}.${t.ext}`, blob, originalSize: it.file.size, url: it.preview, note: `${extOf(it.file.name).toUpperCase()} → ${t.label}` })
        setStatus((s) => ({ ...s, [it.id]: 'done' }))
      } catch (e: any) {
        setStatus((s) => ({ ...s, [it.id]: 'err' }))
        if (items.length === 1) throw new Error(e?.message || String(e))
      }
      setP((i + 1) / items.length)
    }
    if (!out.length) throw new Error('None of the files could be converted.')
    setResults(out)
  })

  const reset = () => { setItems([]); setResults(null); setStatus({}) }
  if (!items.length) return <Dropzone multiple accept={PRO_ACCEPT} onFiles={add} label="Drop images in any format" sub="TIFF, JPEG XL, QOI, HEIC, PSD, TGA, PCX, DDS, XCF, JP2, Netpbm, SGI, PICT, XBM, XPM, HDR and more · never uploaded" />
  const needsMagick = t.engine === 'magick' || items.some((i) => MAGICK_HINT[extOf(i.file.name)])
  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {items.map((it) => (
              <div key={it.id} className="overflow-hidden rounded-xl border border-border bg-surface-2/40">
                <div className="checker grid aspect-square place-items-center overflow-hidden">{it.preview ? <img src={it.preview} alt="" className="max-h-full max-w-full object-contain" /> : <span className="px-2 text-center text-xs text-muted">{it.err ? 'Cannot preview' : 'Reading...'}</span>}</div>
                <div className="border-t border-border px-2.5 py-1.5">
                  <div className="truncate text-xs font-medium" title={it.file.name}>{it.file.name}</div>
                  <div className={cn('truncate text-[11px]', it.err ? 'text-danger' : 'text-muted')} title={it.err}>{it.err ?? `${it.info ?? extOf(it.file.name).toUpperCase()} · ${formatBytes(it.file.size)}`}</div>
                  <StatusPill state={status[it.id]} />
                </div>
              </div>
            ))}
          </div>
          <Dropzone compact multiple accept={PRO_ACCEPT} onFiles={add} label="Add more files" />
        </>}
        side={<>
          <div>
            <Label>Convert to</Label>
            <div className="grid max-h-80 grid-cols-2 gap-1.5 overflow-auto pr-1 scrollbar-thin">
              {TARGETS.map((x) => (
                <button key={x.id} onClick={() => { setTo(x.id); setResults(null) }} className={cn('rounded-lg border px-2.5 py-1.5 text-left transition cursor-pointer', to === x.id ? 'border-accent bg-accent/10 ring-2 ring-accent/20' : 'border-border hover:border-accent/50')}>
                  <div className="text-xs font-semibold">{x.label}</div><div className="text-[10px] text-muted">{x.sub}</div>
                </button>
              ))}
            </div>
          </div>
          {t.lossy && !lossless && <Slider label="Quality" value={quality} onChange={setQuality} min={10} max={100} suffix="%" />}
          {(to === 'webp' || to === 'avif' || to === 'jxl') && <Switch checked={lossless} onChange={setLossless} label="Lossless" />}
          {(to === 'jpg' || to === 'bmp') && <div><Label>Background for transparency</Label><ColorInput value={bg} onChange={setBg} /></div>}
          {needsMagick && <p className="flex gap-2 rounded-xl border border-border bg-surface-2/50 p-3 text-xs text-muted"><Cpu className="size-4 shrink-0 text-accent" />Some formats use the ImageMagick engine (about 15 MB). It downloads once and is cached.</p>}
          {busy && <Progress value={progress} label="Converting" />}
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" loading={busy} icon={<RefreshCw className="size-4" />} onClick={convert}>Convert {items.length} to {t.label}</Button>
          <Button variant="ghost" className="w-full" onClick={reset}>Start over</Button>
        </>}
      />
      {results && <BatchResults results={results} zipName={`converted-${t.ext}.zip`} onReset={reset} />}
    </div>
  )
}
