import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, FileArchive, Loader2, X, Check, AlertCircle, Smartphone, Maximize2 } from 'lucide-react'
import { Button, Dropzone, ToolGrid, Label, Segmented, Slider, Switch, Progress, ErrorNote, Badge, useJob, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { canvasToBlob, createCanvas, downloadBlob, formatBytes, loadImage, renameExt, zipFiles } from '@/lib/files'
import { Lightbox, Stat } from './_conv/shared'

type Fmt = 'jpg' | 'png' | 'webp'
interface Item { id: string; file: File; status: 'queued' | 'working' | 'done' | 'error'; out?: { blob: Blob; url: string; name: string; w: number; h: number }[]; err?: string }
let uid = 0

export default function HeicConverter() {
  const [items, setItems] = useState<Item[]>([])
  const [fmt, setFmt] = useState<Fmt>('jpg')
  const [quality, setQuality] = useState(90)
  const [all, setAll] = useState(false)
  const [view, setView] = useState<number | null>(null)
  const { busy, progress, error, run } = useJob()

  useEffect(() => () => items.forEach((i) => i.out?.forEach((o) => URL.revokeObjectURL(o.url))), []) // eslint-disable-line

  const add = (files: File[]) => setItems((s) => [...s, ...files.map((file) => ({ id: `h${++uid}`, file, status: 'queued' as const }))])
  const remove = (id: string) => setItems((s) => s.filter((i) => i.id !== id))
  const clear = () => { items.forEach((i) => i.out?.forEach((o) => URL.revokeObjectURL(o.url))); setItems([]) }

  const convertOne = async (it: Item) => {
    const heic2any = (await import('heic2any')).default as any
    const toType = fmt === 'png' || fmt === 'webp' ? 'image/png' : 'image/jpeg'
    const res = await heic2any({ blob: it.file, toType, quality: quality / 100, multiple: all || undefined })
    const blobs: Blob[] = Array.isArray(res) ? res : [res]
    const outs = []
    for (let k = 0; k < blobs.length; k++) {
      let blob = blobs[k]
      const img = await loadImage(blob)
      const w = img.naturalWidth, h = img.naturalHeight
      if (fmt === 'webp') {
        const { canvas, ctx } = createCanvas(w, h)
        ctx.drawImage(img, 0, 0)
        blob = await canvasToBlob(canvas, 'image/webp', quality / 100)
        canvas.width = canvas.height = 0
      }
      URL.revokeObjectURL(img.src)
      const suffix = blobs.length > 1 ? `-${k + 1}` : ''
      outs.push({ blob, url: URL.createObjectURL(blob), name: renameExt(it.file.name, fmt, suffix), w, h })
    }
    return outs
  }

  const convertAll = () => run(async (setP) => {
    const todo = items.filter((i) => i.status !== 'done')
    if (!todo.length) return
    let done = 0
    for (const it of todo) {
      setItems((s) => s.map((x) => (x.id === it.id ? { ...x, status: 'working' } : x)))
      try {
        const out = await convertOne(it)
        setItems((s) => s.map((x) => (x.id === it.id ? { ...x, status: 'done', out } : x)))
      } catch (e: any) {
        const msg = e?.message?.includes('format not supported') || e?.code === 2 ? 'Not a valid HEIC/HEIF image' : e?.message || 'Conversion failed'
        setItems((s) => s.map((x) => (x.id === it.id ? { ...x, status: 'error', err: msg } : x)))
      }
      setP(++done / todo.length)
    }
    toast('Conversion finished', 'success')
  })

  // re-run everything when the output settings change
  useEffect(() => { setItems((s) => s.map((i) => { i.out?.forEach((o) => URL.revokeObjectURL(o.url)); return i.status === 'done' || i.status === 'error' ? { ...i, status: 'queued', out: undefined, err: undefined } : i })) }, [fmt, quality, all])

  const outs = items.flatMap((i) => i.out ?? [])
  const inSize = items.filter((i) => i.out).reduce((s, i) => s + i.file.size, 0)
  const outSize = outs.reduce((s, o) => s + o.blob.size, 0)
  const pending = items.filter((i) => i.status !== 'done').length
  const zip = async () => downloadBlob(await zipFiles(outs.map((o) => ({ name: o.name, data: o.blob }))), `heic-converted-${fmt}.zip`)

  if (!items.length) return <Dropzone multiple accept=".heic,.heif,image/heic,image/heif" onFiles={add} label="Drop HEIC / HEIF photos from your iPhone" sub="Batch convert to JPG, PNG or WEBP, photos never leave your device." />

  return (
    <div className="space-y-5">
      <ToolGrid
        main={<>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{items.length} photo{items.length > 1 ? 's' : ''}</Badge>
            {outs.length > 0 && <span className="text-xs text-muted">{formatBytes(inSize)} → {formatBytes(outSize)}</span>}
            <div className="ml-auto flex gap-2">
              {outs.length > 1 && <Button size="sm" icon={<FileArchive className="size-4" />} onClick={zip}>Download all (ZIP)</Button>}
              <Button size="sm" variant="ghost" onClick={clear}>Start over</Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence>
              {items.map((it) => {
                const first = it.out?.[0]
                const idx = first ? outs.indexOf(first) : -1
                return (
                  <motion.div key={it.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="overflow-hidden rounded-2xl border border-border bg-surface">
                    <div className="checker relative grid aspect-[4/3] place-items-center overflow-hidden">
                      {first ? (
                        <button onClick={() => setView(idx)} className="group size-full cursor-zoom-in">
                          <img src={first.url} alt={first.name} className="size-full object-cover transition group-hover:scale-105" />
                          <span className="absolute right-2 top-2 rounded-lg bg-black/60 p-1.5 text-white opacity-0 transition group-hover:opacity-100"><Maximize2 className="size-3.5" /></span>
                        </button>
                      ) : it.status === 'working' ? <div className="flex flex-col items-center gap-2 text-xs text-muted"><Loader2 className="size-6 animate-spin text-accent" />Decoding HEIC…</div>
                        : it.status === 'error' ? <div className="flex flex-col items-center gap-2 px-4 text-center text-xs text-danger"><AlertCircle className="size-6" />{it.err}</div>
                          : <div className="flex flex-col items-center gap-2 text-xs text-muted"><Smartphone className="size-6" />Ready to convert</div>}
                      {(it.out?.length ?? 0) > 1 && <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{it.out!.length} images</span>}
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <div className={cn('grid size-6 shrink-0 place-items-center rounded-full', it.status === 'done' ? 'bg-success/15 text-success' : it.status === 'error' ? 'bg-danger/15 text-danger' : 'bg-surface-2 text-muted')}>{it.status === 'done' ? <Check className="size-3.5" /> : it.status === 'error' ? <X className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}</div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold">{first?.name ?? it.file.name}</div>
                        <div className="font-mono text-[10px] text-muted">{formatBytes(it.file.size)}{first && <> → {formatBytes(it.out!.reduce((s, o) => s + o.blob.size, 0))} · {first.w}×{first.h}</>}</div>
                      </div>
                      {it.out?.map((o, k) => <button key={k} onClick={() => downloadBlob(o.blob, o.name)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-accent cursor-pointer" aria-label="Download"><Download className="size-4" /></button>)}
                      {it.status !== 'working' && <button onClick={() => remove(it.id)} className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger cursor-pointer" aria-label="Remove"><X className="size-4" /></button>}
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
          <Dropzone compact multiple accept=".heic,.heif,image/heic,image/heif" onFiles={add} label="Add more HEIC photos" />
        </>}
        side={<>
          <div><Label>Output format</Label><Segmented value={fmt} onChange={setFmt} options={[{ value: 'jpg', label: 'JPG' }, { value: 'png', label: 'PNG' }, { value: 'webp', label: 'WEBP' }]} /></div>
          {fmt !== 'png' && <Slider label="Quality" value={quality} onChange={setQuality} min={40} max={100} suffix="%" />}
          <Switch checked={all} onChange={setAll} label="Extract every image in multi-image HEIC (bursts)" />
          <div className="grid grid-cols-2 gap-2"><Stat label="Converted" value={`${items.filter((i) => i.status === 'done').length}/${items.length}`} /><Stat label="Output" value={formatBytes(outSize)} /></div>
          {busy && <Progress value={progress} label="Converting" />}
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" loading={busy} disabled={!pending} icon={<Smartphone className="size-5" />} onClick={convertAll}>{pending ? `Convert ${pending} photo${pending > 1 ? 's' : ''}` : 'All converted'}</Button>
          <p className="text-[11px] text-muted">Decoding runs locally via WebAssembly. Location and camera metadata are not copied to the output.</p>
        </>}
      />
      <Lightbox items={outs.map((o) => ({ src: o.url, caption: `${o.name} · ${o.w}×${o.h}` }))} index={view} onClose={() => setView(null)} onIndex={setView}
        actions={(i) => <Button size="sm" icon={<Download className="size-4" />} onClick={() => downloadBlob(outs[i].blob, outs[i].name)}>Download</Button>} />
    </div>
  )
}
