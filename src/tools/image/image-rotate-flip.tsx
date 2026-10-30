import { useCallback, useEffect, useState } from 'react'
import { RotateCcw, RotateCw, FlipHorizontal2, FlipVertical2, RefreshCcw } from 'lucide-react'
import { Button, ErrorNote, Label, Progress, Segmented, Slider, Switch, ToolGrid, useJob } from '@/components/ui'
import { BatchResults, ColorInput, ImageDrop, StatusPill, ThumbGrid, canvas, decode, exportCanvas, fmtFromMime, outName, rotatedBounds, useDebounced, useImageList, useObjectUrl, type Drawable, type Fmt, type Result } from './_img/kit'

type O = { angle: number; fh: boolean; fv: boolean; expand: boolean; transparent: boolean; bg: string }
export function rotateFlip(img: Drawable, w: number, h: number, o: O, scale = 1) {
  const b = o.expand ? rotatedBounds(w, h, o.angle) : { w, h }
  const { canvas: c, ctx } = canvas(b.w * scale, b.h * scale)
  if (!o.transparent) { ctx.fillStyle = o.bg; ctx.fillRect(0, 0, c.width, c.height) }
  ctx.translate(c.width / 2, c.height / 2)
  ctx.rotate((o.angle * Math.PI) / 180)
  ctx.scale((o.fh ? -1 : 1) * scale, (o.fv ? -1 : 1) * scale)
  ctx.drawImage(img, -w / 2, -h / 2, w, h)
  return c
}

export default function ImageRotateFlip() {
  const { items, add, remove, clear } = useImageList()
  const [sel, setSel] = useState<string | null>(null)
  const [o, setO] = useState<O>({ angle: 0, fh: false, fv: false, expand: true, transparent: true, bg: '#ffffff' })
  const [fmt, setFmt] = useState<'keep' | 'png' | 'jpg' | 'webp'>('keep')
  const [status, setStatus] = useState<Record<string, 'run' | 'done' | 'err'>>({})
  const [results, setResults] = useState<Result[] | null>(null)
  const [preview, setPreview] = useState<Blob | null>(null)
  const { busy, progress, error, run } = useJob()
  const set = (p: Partial<O>) => { setO((s) => ({ ...s, ...p })); setResults(null) }
  const onFiles = useCallback(async (f: File[]) => { const a = await add(f); setResults(null); if (a[0]) setSel((s) => s ?? a[0].id) }, [add])
  const reset = () => { clear(); setResults(null); setStatus({}); setSel(null); setPreview(null) }
  const cur = items.find((i) => i.id === sel) ?? items[0]
  const dO = useDebounced(o, 60)
  useEffect(() => {
    if (!cur) return
    let off = false
    decode(cur.file).then((img) => { const s = Math.min(1, 900 / Math.max(cur.w, cur.h)); rotateFlip(img, cur.w, cur.h, dO, s).toBlob((b) => { if (!off && b) setPreview(b) }) }).catch(() => {})
    return () => { off = true }
  }, [cur?.id, dO])
  const previewUrl = useObjectUrl(preview)
  const rot = (d: number) => set({ angle: ((((o.angle + d) % 360) + 540) % 360) - 180 })

  const go = () => run(async (setP) => {
    const out: Result[] = []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      setStatus((s) => ({ ...s, [it.id]: 'run' }))
      try {
        let f: Fmt = fmt === 'keep' ? fmtFromMime(it.file.type, it.file.name) : fmt
        if (!['png', 'jpg', 'webp'].includes(f)) f = 'png'
        if (o.transparent && f === 'jpg' && o.angle % 90 !== 0) f = 'png'
        const same = f === fmtFromMime(it.file.type, it.file.name)
        let blob: Blob, dims = `${it.w}×${it.h}`
        if (same && o.angle === 0 && !o.fh && !o.fv) blob = it.file
        else {
          const c = rotateFlip(await decode(it.file), it.w, it.h, o)
          dims = `${c.width}×${c.height}`
          blob = await exportCanvas(c, f, 0.93, o.bg)
          // A pure rotate or flip should not hand back a much bigger photo: step the quality down until it fits.
          if (same && f !== 'png') for (const q of [0.88, 0.82, 0.76]) { if (blob.size <= it.file.size) break; const b2 = await exportCanvas(c, f, q, o.bg); if (b2.size < blob.size) blob = b2 }
        }
        out.push({ id: it.id, name: outName(it.file.name, f, '-rotated'), blob, originalSize: it.file.size, url: URL.createObjectURL(blob), note: dims })
        setStatus((s) => ({ ...s, [it.id]: 'done' }))
      } catch (e) { setStatus((s) => ({ ...s, [it.id]: 'err' })); if (items.length === 1) throw e }
      setP((i + 1) / items.length)
    }
    setResults(out)
  })

  if (!items.length) return <ImageDrop onFiles={onFiles} label="Drop images to rotate or flip" />
  const nb = cur ? (o.expand ? rotatedBounds(cur.w, cur.h, o.angle) : { w: cur.w, h: cur.h }) : null

  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="checker grid min-h-72 place-items-center overflow-hidden rounded-xl p-4">
              {previewUrl && <img src={previewUrl} alt="Preview" className="max-h-[56vh] max-w-full drop-shadow-xl" />}
            </div>
            {nb && <div className="mt-2 text-center font-mono text-xs text-muted">{cur!.w}×{cur!.h} → {nb.w}×{nb.h}</div>}
          </div>
          {(items.length > 1) ? <ThumbGrid items={items} selected={cur?.id} onSelect={setSel} onRemove={(id) => { remove(id); setResults(null) }} onAdd={onFiles} extra={(it) => <StatusPill state={status[it.id]} />} /> : <ThumbGrid items={[]} onAdd={onFiles} />}
        </>}
        side={<>
          <div>
            <Label>Quick actions</Label>
            <div className="grid grid-cols-4 gap-2">
              <Button variant="secondary" onClick={() => rot(-90)} icon={<RotateCcw className="size-4" />} aria-label="Rotate 90° left" title="Rotate 90° left" />
              <Button variant="secondary" onClick={() => rot(90)} icon={<RotateCw className="size-4" />} aria-label="Rotate 90° right" title="Rotate 90° right" />
              <Button variant={o.fh ? 'outline' : 'secondary'} onClick={() => set({ fh: !o.fh })} icon={<FlipHorizontal2 className="size-4" />} aria-label="Flip horizontally" title="Flip horizontally" />
              <Button variant={o.fv ? 'outline' : 'secondary'} onClick={() => set({ fv: !o.fv })} icon={<FlipVertical2 className="size-4" />} aria-label="Flip vertically" title="Flip vertically" />
            </div>
          </div>
          <Slider label="Angle" value={o.angle} onChange={(angle) => set({ angle })} min={-180} max={180} step={0.5} suffix="°" />
          <div className="-mt-3 flex flex-wrap gap-1.5">{[-45, -15, 15, 45, 180].map((a) => <Button key={a} size="sm" variant="ghost" onClick={() => set({ angle: a })}>{a > 0 ? '+' : ''}{a}°</Button>)}</div>
          <Switch checked={o.expand} onChange={(expand) => set({ expand })} label="Expand canvas to fit" />
          <div className="space-y-2">
            <Switch checked={o.transparent} onChange={(transparent) => set({ transparent })} label="Transparent background" />
            {!o.transparent && <ColorInput value={o.bg} onChange={(bg) => set({ bg })} />}
          </div>
          <div><Label>Format</Label><Segmented value={fmt} onChange={(f) => { setFmt(f); setResults(null) }} options={[{ value: 'keep', label: 'Original' }, { value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }, { value: 'webp', label: 'WEBP' }]} /></div>
          {busy && <Progress value={progress} label="Processing" />}
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" loading={busy} icon={<RotateCw className="size-4" />} onClick={go}>Apply to {items.length} image{items.length > 1 ? 's' : ''}</Button>
          <div className="flex gap-2"><Button variant="ghost" className="flex-1" icon={<RefreshCcw className="size-4" />} onClick={() => set({ angle: 0, fh: false, fv: false })}>Reset</Button><Button variant="ghost" className="flex-1" onClick={reset}>Start over</Button></div>
        </>}
      />
      {results && <BatchResults results={results} zipName="rotated-images.zip" onReset={reset} />}
    </div>
  )
}
