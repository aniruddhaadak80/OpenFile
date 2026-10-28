import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, X, Sparkles } from 'lucide-react'
import { Button, Field, Input, Label, Progress, Segmented, Slider, Switch, ToolGrid, cn } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { BatchResults, BeforeAfter, ImageDrop, ThumbGrid, decode, exportCanvas, fmtFromMime, fmtSupported, hqResize, outName, quantizeCanvas, toCanvas, useImageList, type Fmt, type Item, type Result } from './_img/kit'

type OutFmt = 'keep' | 'jpg' | 'webp' | 'avif' | 'jxl'
type R = { blob: Blob; url: string; state: 'run' | 'done' | 'err'; kept?: boolean; fmt?: Fmt | 'jxl'; w?: number; h?: number; err?: string }

async function compressOne(it: Item, o: { quality: number; maxW: number; fmt: OutFmt; neverLarger: boolean; pro: boolean }) {
  const img = await decode(it.file)
  let c = it.w > o.maxW && o.maxW > 0 ? hqResize(img, o.maxW, Math.round((it.h * o.maxW) / it.w)) : toCanvas(img)
  let fmt: Fmt | 'jxl' = o.fmt === 'keep' ? fmtFromMime(it.file.type, it.file.name) : o.fmt
  if (!['jpg', 'webp', 'avif', 'png', 'jxl'].includes(fmt)) fmt = 'png'
  let blob: Blob
  if (o.pro || fmt === 'jxl') {
    // WebAssembly codecs: MozJPEG, libwebp, libavif, libjxl, and palette quantisation + OxiPNG for PNG
    const { encodeCanvas, quantize } = await import('@/lib/b2/codecs')
    if (fmt === 'png' && o.quality < 95) c = await quantize(c, Math.max(16, Math.min(256, Math.round(o.quality * 2.7))), true)
    blob = await encodeCanvas(c, fmt as any, { quality: o.quality, oxipngLevel: fmt === 'png' ? 3 : 0 })
  } else {
    if (fmt === 'png' && o.quality < 95) c = await quantizeCanvas(c, Math.max(16, Math.min(256, Math.round(o.quality * 2.7))))
    blob = await exportCanvas(c, fmt as Fmt, o.quality / 100)
  }
  let kept = false
  const sameFmt = fmtFromMime(it.file.type, it.file.name) === fmt
  if (o.neverLarger && sameFmt && c.width === it.w && blob.size >= it.file.size) { blob = it.file; kept = true }
  return { blob, fmt, kept, w: c.width, h: c.height }
}

export default function ImageCompressor() {
  const { items, add, remove, clear } = useImageList()
  const [quality, setQuality] = useState(75)
  const [resize, setResize] = useState(false)
  const [maxW, setMaxW] = useState(1920)
  const [fmt, setFmt] = useState<OutFmt>('keep')
  const [neverLarger, setNeverLarger] = useState(true)
  const [pro, setPro] = useState(true)
  const [res, setRes] = useState<Record<string, R>>({})
  const [compare, setCompare] = useState<string | null>(null)
  const run = useRef(0)
  const urls = useRef<string[]>([])
  useEffect(() => () => urls.current.forEach(URL.revokeObjectURL), [])

  const opts = useMemo(() => ({ quality, maxW: resize ? maxW : 0, fmt, neverLarger, pro }), [quality, resize, maxW, fmt, neverLarger, pro])

  // live re-compress whenever images or options change
  useEffect(() => {
    if (!items.length) return
    const token = ++run.current
    const t = setTimeout(async () => {
      setRes((s) => { const n: Record<string, R> = {}; for (const it of items) n[it.id] = { ...(s[it.id] ?? { blob: it.file, url: it.url }), state: 'run' }; return n })
      for (const it of items) {
        if (token !== run.current) return
        setRes((s) => ({ ...s, [it.id]: { ...(s[it.id] ?? { blob: it.file, url: it.url }), state: 'run' } }))
        try {
          const r = await compressOne(it, opts)
          if (token !== run.current) return
          const url = r.kept ? it.url : URL.createObjectURL(r.blob)
          if (!r.kept) urls.current.push(url)
          setRes((s) => ({ ...s, [it.id]: { ...r, url, state: 'done' } }))
        } catch (e: any) {
          setRes((s) => ({ ...s, [it.id]: { blob: it.file, url: it.url, state: 'err', err: e?.message } }))
        }
      }
    }, 350)
    return () => clearTimeout(t)
  }, [items, opts])

  const reset = () => { clear(); setRes({}); setCompare(null); run.current++ }
  const onFiles = useCallback((f: File[]) => { add(f) }, [add])

  const done = items.filter((i) => res[i.id]?.state === 'done')
  const progress = items.length ? done.length / items.length : 0
  const working = items.some((i) => res[i.id]?.state === 'run')
  const results: Result[] = done.map((i) => ({ id: i.id, name: outName(i.file.name, (res[i.id].fmt ?? 'png') as Fmt, res[i.id].kept ? '' : '-min'), blob: res[i.id].blob, originalSize: i.file.size, url: res[i.id].url, note: res[i.id].kept ? 'already optimal, kept original' : `${res[i.id].w}×${res[i.id].h}` }))
  const cmp = compare ? items.find((i) => i.id === compare) : null
  const avifOk = fmtSupported('avif')

  if (!items.length) return <ImageDrop onFiles={onFiles} label="Drop images to compress" />

  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <AnimatePresence>
            {cmp && res[cmp.id] && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="rounded-2xl border border-border bg-surface p-4">
                  <div className="mb-3 flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0 truncate font-medium">{cmp.file.name}</div>
                    <div className="flex items-center gap-3 text-xs text-muted">
                      <span>{formatBytes(cmp.file.size)} → <b className="text-fg">{formatBytes(res[cmp.id].blob.size)}</b></span>
                      <button onClick={() => setCompare(null)} className="rounded-lg p-1 hover:bg-surface-2 cursor-pointer" aria-label="Close comparison"><X className="size-4" /></button>
                    </div>
                  </div>
                  <BeforeAfter before={cmp.url} after={res[cmp.id].url} labels={['Original', 'Compressed']} maxH="60vh" />
                  <p className="mt-2 text-center text-xs text-muted">Drag the divider to compare. Zoom your browser in to inspect fine detail.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <ThumbGrid items={items} onRemove={(id) => { remove(id); if (compare === id) setCompare(null) }} onAdd={onFiles} onSelect={(id) => setCompare(id)} selected={compare ?? undefined}
            extra={(it) => { const r = res[it.id]; if (!r || r.state === 'run') return <div className="mt-1 h-1 overflow-hidden rounded bg-surface-2"><div className="shimmer h-full" /></div>
              if (r.state === 'err') return <div className="mt-1 text-[11px] text-danger">{r.err ?? 'Failed'}</div>
              const s = 1 - r.blob.size / it.file.size
              return <div className="mt-1 flex items-center justify-between text-[11px]"><span className="font-medium">{formatBytes(r.blob.size)}</span><span className={cn('font-mono', s > 0.001 ? 'text-success' : 'text-muted')}>{s > 0.001 ? `−${(s * 100).toFixed(0)}%` : r.kept ? 'kept' : `+${(-s * 100).toFixed(0)}%`}</span></div> }} />
          <p className="flex items-center gap-1.5 text-xs text-muted"><Eye className="size-3.5" /> Click any image to compare before / after.</p>
        </>}
        side={<>
          <Slider label="Quality" value={quality} onChange={setQuality} min={10} max={100} suffix="%" />
          <div className="-mt-3 flex justify-between text-[11px] text-muted"><span>Smaller file</span><span>Better quality</span></div>
          <div>
            <Label>Output format</Label>
            <Segmented value={fmt} onChange={setFmt} options={[{ value: 'keep', label: 'Keep' }, { value: 'jpg', label: 'JPG' }, { value: 'webp', label: 'WEBP' }, ...(avifOk || pro ? [{ value: 'avif' as OutFmt, label: 'AVIF' }] : []), { value: 'jxl' as OutFmt, label: 'JXL' }]} />
            {!avifOk && !pro && <p className="mt-1.5 text-[11px] text-muted">AVIF encoding is not built into this browser. Turn on the best-compression engine to use it.</p>}
            {fmt === 'jxl' && <p className="mt-1.5 text-[11px] text-muted">JPEG XL is very efficient but only some browsers can open it (Safari does). Keep a JPG copy for sharing.</p>}
            {fmt === 'keep' && items.some((i) => fmtFromMime(i.file.type, i.file.name) === 'png') && <p className="mt-1.5 text-[11px] text-muted">PNGs are compressed by smart color reduction. For the biggest savings choose WEBP.</p>}
          </div>
          <div className="space-y-3">
            <Switch checked={resize} onChange={setResize} label="Limit max width" />
            {resize && <Field label="Max width" hint="px"><Input type="number" min={16} value={maxW} onChange={(e) => setMaxW(Math.max(16, Number(e.target.value) || 0))} /></Field>}
            <Switch checked={neverLarger} onChange={setNeverLarger} label="Never make files larger" />
            <Switch checked={pro} onChange={setPro} label="Best compression (MozJPEG, OxiPNG, libwebp)" />
            {pro && <p className="text-[11px] text-muted">Uses WebAssembly encoders for smaller files at the same quality. A little slower; the engine loads once.</p>}
          </div>
          <div className="rounded-xl bg-surface-2/60 p-3">
            {working ? <Progress value={progress} label={`Compressing ${done.length}/${items.length}`} /> : (
              <div className="flex items-center gap-2 text-sm"><Sparkles className="size-4 text-accent" />
                {results.length ? <span>Saved <b className="text-success">{formatBytes(Math.max(0, results.reduce((a, r) => a + (r.originalSize ?? 0) - r.blob.size, 0)))}</b> across {results.length} image{results.length > 1 ? 's' : ''}</span> : 'Ready'}
              </div>
            )}
          </div>
          <Button variant="ghost" className="w-full" onClick={reset}>Start over</Button>
        </>}
      />
      {!working && results.length === items.length && <BatchResults results={results} zipName="compressed-images.zip" onReset={reset} />}
    </div>
  )
}
