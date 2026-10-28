import { useCallback, useEffect, useState } from 'react'
import { Square, Circle } from 'lucide-react'
import { Button, ErrorNote, Label, Progress, Segmented, Slider, Switch, ToolGrid, useJob } from '@/components/ui'
import { BatchResults, ColorInput, ImageDrop, StatusPill, ThumbGrid, canvas, decode, exportCanvas, outName, rrect, useDebounced, useImageList, useObjectUrl, type Drawable, type Result } from './_img/kit'

type O = { shape: 'rounded' | 'circle'; radius: number; border: number; borderColor: string; shadow: boolean; shadowSize: number; shadowOpacity: number; square: boolean }

function render(img: Drawable, w: number, h: number, o: O, scale = 1) {
  let sw = w, sh = h, sx = 0, sy = 0
  if (o.shape === 'circle' && o.square) { const m = Math.min(w, h); sx = (w - m) / 2; sy = (h - m) / 2; sw = sh = m }
  const W = sw * scale, H = sh * scale
  const base = Math.min(W, H)
  const pad = o.shadow ? Math.round(base * (o.shadowSize / 100) * 1.6) : 0
  const { canvas: c, ctx } = canvas(W + pad * 2, H + pad * 2)
  const path = () => { if (o.shape === 'circle') { ctx.beginPath(); ctx.ellipse(pad + W / 2, pad + H / 2, W / 2, H / 2, 0, 0, Math.PI * 2); ctx.closePath() } else rrect(ctx, pad, pad, W, H, (o.radius / 100) * base * 0.5) }
  if (o.shadow) {
    ctx.save(); path(); ctx.shadowColor = `rgba(0,0,0,${o.shadowOpacity / 100})`; ctx.shadowBlur = base * (o.shadowSize / 100); ctx.shadowOffsetY = base * (o.shadowSize / 100) * 0.3; ctx.fillStyle = '#000'; ctx.fill(); ctx.restore()
  }
  ctx.save(); path(); ctx.clip(); ctx.drawImage(img, sx, sy, sw, sh, pad, pad, W, H)
  if (o.border > 0) { ctx.lineWidth = (o.border / 100) * base * 0.2 * 2; ctx.strokeStyle = o.borderColor; path(); ctx.stroke() }
  ctx.restore()
  return c
}

export default function RoundedCorners() {
  const { items, add, remove, clear } = useImageList()
  const [sel, setSel] = useState<string | null>(null)
  const [o, setO] = useState<O>({ shape: 'rounded', radius: 20, border: 0, borderColor: '#ffffff', shadow: false, shadowSize: 6, shadowOpacity: 35, square: true })
  const [fmt, setFmt] = useState<'png' | 'webp'>('png')
  const [status, setStatus] = useState<Record<string, 'run' | 'done' | 'err'>>({})
  const [results, setResults] = useState<Result[] | null>(null)
  const [preview, setPreview] = useState<Blob | null>(null)
  const { busy, progress, error, run } = useJob()
  const set = (p: Partial<O>) => { setO((s) => ({ ...s, ...p })); setResults(null) }
  const onFiles = useCallback(async (f: File[]) => { const a = await add(f); setResults(null); if (a[0]) setSel((s) => s ?? a[0].id) }, [add])
  const reset = () => { clear(); setResults(null); setStatus({}); setSel(null) }
  const cur = items.find((i) => i.id === sel) ?? items[0]
  const dO = useDebounced(o, 50)
  useEffect(() => {
    if (!cur) return
    let off = false
    decode(cur.file).then((img) => render(img, cur.w, cur.h, dO, Math.min(1, 900 / Math.max(cur.w, cur.h))).toBlob((b) => { if (!off && b) setPreview(b) })).catch(() => {})
    return () => { off = true }
  }, [cur?.id, dO])
  const pUrl = useObjectUrl(preview)

  const go = () => run(async (setP) => {
    const out: Result[] = []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      setStatus((s) => ({ ...s, [it.id]: 'run' }))
      try {
        const blob = await exportCanvas(render(await decode(it.file), it.w, it.h, o), fmt, 0.95)
        out.push({ id: it.id, name: outName(it.file.name, fmt, o.shape === 'circle' ? '-circle' : '-rounded'), blob, originalSize: it.file.size, url: URL.createObjectURL(blob) })
        setStatus((s) => ({ ...s, [it.id]: 'done' }))
      } catch (e) { setStatus((s) => ({ ...s, [it.id]: 'err' })); if (items.length === 1) throw e }
      setP((i + 1) / items.length)
    }
    setResults(out)
  })

  if (!items.length) return <ImageDrop onFiles={onFiles} label="Drop images to round their corners" />

  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <div className="rounded-2xl border border-border bg-surface p-4"><div className="checker grid min-h-72 place-items-center rounded-xl p-6">{pUrl && <img src={pUrl} alt="Preview" className="max-h-[56vh] max-w-full" />}</div></div>
          {items.length > 1 ? <ThumbGrid items={items} selected={cur?.id} onSelect={setSel} onRemove={(id) => { remove(id); setResults(null) }} onAdd={onFiles} extra={(it) => <StatusPill state={status[it.id]} />} /> : <ThumbGrid items={[]} onAdd={onFiles} />}
        </>}
        side={<>
          <div><Label>Shape</Label><Segmented value={o.shape} onChange={(shape) => set({ shape })} options={[{ value: 'rounded', label: <span className="flex items-center gap-1.5"><Square className="size-3.5" />Rounded</span> }, { value: 'circle', label: <span className="flex items-center gap-1.5"><Circle className="size-3.5" />Circle</span> }]} /></div>
          {o.shape === 'rounded' ? <>
            <Slider label="Corner radius" value={o.radius} onChange={(radius) => set({ radius })} min={0} max={100} suffix="%" />
            <div className="-mt-3 flex gap-1.5">{[5, 12, 25, 50, 100].map((r) => <Button key={r} size="sm" variant={o.radius === r ? 'primary' : 'ghost'} onClick={() => set({ radius: r })}>{r}%</Button>)}</div>
          </> : <Switch checked={o.square} onChange={(square) => set({ square })} label="Crop to perfect circle (else ellipse)" />}
          <div className="space-y-3">
            <Slider label="Border" value={o.border} onChange={(border) => set({ border })} min={0} max={30} />
            {o.border > 0 && <ColorInput value={o.borderColor} onChange={(borderColor) => set({ borderColor })} />}
          </div>
          <div className="space-y-3">
            <Switch checked={o.shadow} onChange={(shadow) => set({ shadow })} label="Drop shadow" />
            {o.shadow && <><Slider label="Shadow size" value={o.shadowSize} onChange={(shadowSize) => set({ shadowSize })} min={1} max={20} /><Slider label="Shadow opacity" value={o.shadowOpacity} onChange={(shadowOpacity) => set({ shadowOpacity })} min={5} max={90} suffix="%" /></>}
          </div>
          <div><Label>Format (keeps transparency)</Label><Segmented value={fmt} onChange={(f) => { setFmt(f); setResults(null) }} options={[{ value: 'png', label: 'PNG' }, { value: 'webp', label: 'WEBP' }]} /></div>
          {busy && <Progress value={progress} label="Processing" />}
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" loading={busy} onClick={go}>Apply to {items.length} image{items.length > 1 ? 's' : ''}</Button>
          <Button variant="ghost" className="w-full" onClick={reset}>Start over</Button>
        </>}
      />
      {results && <BatchResults results={results} zipName="rounded-images.zip" onReset={reset} />}
    </div>
  )
}
