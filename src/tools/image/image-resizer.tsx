import { useCallback, useEffect, useMemo, useState } from 'react'
import { Lock, Unlock, Scaling } from 'lucide-react'
import { Button, ErrorNote, Field, Input, Label, Progress, Segmented, Select, Slider, Switch, ToolGrid, cn, useJob } from '@/components/ui'
import { BatchResults, ColorInput, ImageDrop, SOCIAL_SIZES, StatusPill, ThumbGrid, canvas, decode, exportCanvas, fmtFromMime, fmtSupported, hqResize, outName, useDebounced, useImageList, useObjectUrl, type Drawable, type Fmt, type Item, type Result } from './_img/kit'

type Mode = 'pixels' | 'percent' | 'preset'
type FitMode = 'contain' | 'cover' | 'stretch'
type OutF = 'keep' | 'png' | 'jpg' | 'webp'
type Opts = { mode: Mode; W: number; H: number; lock: boolean; by: 'w' | 'h'; pct: number; preset: string; fit: FitMode; bg: string; transparent: boolean }

function target(it: { w: number; h: number }, o: Opts): { tw: number; th: number; fit: FitMode } {
  if (o.mode === 'percent') return { tw: Math.max(1, Math.round((it.w * o.pct) / 100)), th: Math.max(1, Math.round((it.h * o.pct) / 100)), fit: 'stretch' }
  if (o.mode === 'preset') { const p = SOCIAL_SIZES.find((s) => s.id === o.preset)!; return { tw: p.w, th: p.h, fit: o.fit } }
  if (o.lock) return o.by === 'w' ? { tw: o.W, th: Math.max(1, Math.round((it.h * o.W) / it.w)), fit: 'stretch' } : { tw: Math.max(1, Math.round((it.w * o.H) / it.h)), th: o.H, fit: 'stretch' }
  return { tw: o.W, th: o.H, fit: o.fit }
}

export function renderResized(img: Drawable, w: number, h: number, t: { tw: number; th: number; fit: FitMode }, bg: string | null) {
  const { canvas: c, ctx } = canvas(t.tw, t.th)
  if (t.fit === 'stretch') { ctx.drawImage(hqResize(img, t.tw, t.th), 0, 0); return c }
  const s = t.fit === 'contain' ? Math.min(t.tw / w, t.th / h) : Math.max(t.tw / w, t.th / h)
  const dw = Math.round(w * s), dh = Math.round(h * s)
  if (bg && t.fit === 'contain') { ctx.fillStyle = bg; ctx.fillRect(0, 0, t.tw, t.th) }
  ctx.drawImage(hqResize(img, dw, dh), Math.round((t.tw - dw) / 2), Math.round((t.th - dh) / 2))
  return c
}

export default function ImageResizer() {
  const { items, add, remove, clear } = useImageList()
  const [sel, setSel] = useState<string | null>(null)
  const [o, setO] = useState<Opts>({ mode: 'pixels', W: 1280, H: 720, lock: true, by: 'w', pct: 50, preset: 'ig-post', fit: 'cover', bg: '#ffffff', transparent: false })
  const [fmt, setFmt] = useState<OutF>('keep')
  const [quality, setQuality] = useState(92)
  const [status, setStatus] = useState<Record<string, 'run' | 'done' | 'err'>>({})
  const [results, setResults] = useState<Result[] | null>(null)
  const [preview, setPreview] = useState<Blob | null>(null)
  const { busy, progress, error, run } = useJob()
  const set = (p: Partial<Opts>) => { setO((s) => ({ ...s, ...p })); setResults(null) }
  const onFiles = useCallback(async (f: File[]) => { const added = await add(f); setResults(null); if (added[0]) { setSel((s) => s ?? added[0].id); setO((s) => (s.W === 1280 && s.H === 720 ? { ...s, W: added[0].w, H: added[0].h } : s)) } }, [add])
  const reset = () => { clear(); setResults(null); setStatus({}); setSel(null); setPreview(null) }

  const cur: Item | undefined = items.find((i) => i.id === sel) ?? items[0]
  const t = cur ? target(cur, o) : null
  const dOpts = useDebounced(o, 200)
  const outFmt = (it: Item): Fmt => { const f = fmt === 'keep' ? fmtFromMime(it.file.type, it.file.name) : fmt; return ['png', 'jpg', 'webp', 'avif'].includes(f) && fmtSupported(f) ? f : 'png' }
  const bgFor = (f: Fmt) => (o.transparent && f !== 'jpg' ? null : o.bg)

  // live preview of the selected image
  useEffect(() => {
    if (!cur) return
    let off = false
    ;(async () => {
      const img = await decode(cur.file)
      const tt = target(cur, dOpts)
      const scale = Math.min(1, 900 / Math.max(tt.tw, tt.th))
      const c = renderResized(img, cur.w, cur.h, { tw: Math.max(1, Math.round(tt.tw * scale)), th: Math.max(1, Math.round(tt.th * scale)), fit: tt.fit }, dOpts.transparent ? null : dOpts.bg)
      c.toBlob((b) => { if (!off && b) setPreview(b) }, 'image/png')
    })().catch(() => {})
    return () => { off = true }
  }, [cur?.id, dOpts])
  const previewUrl = useObjectUrl(preview)

  const go = () => run(async (setP) => {
    const out: Result[] = []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      setStatus((s) => ({ ...s, [it.id]: 'run' }))
      try {
        const tt = target(it, o)
        if (tt.tw > 16384 || tt.th > 16384) throw new Error('Target is too large (max 16384px per side)')
        const f = outFmt(it)
        const c = renderResized(await decode(it.file), it.w, it.h, tt, bgFor(f))
        const blob = await exportCanvas(c, f, quality / 100, o.bg)
        out.push({ id: it.id, name: outName(it.file.name, f, `-${tt.tw}x${tt.th}`), blob, originalSize: it.file.size, url: URL.createObjectURL(blob), note: `${it.w}×${it.h} → ${tt.tw}×${tt.th}` })
        setStatus((s) => ({ ...s, [it.id]: 'done' }))
      } catch (e) { setStatus((s) => ({ ...s, [it.id]: 'err' })); if (items.length === 1) throw e }
      setP((i + 1) / items.length)
    }
    setResults(out)
  })

  if (!items.length) return <ImageDrop onFiles={onFiles} label="Drop images to resize" />
  const showFit = o.mode === 'preset' || (o.mode === 'pixels' && !o.lock)

  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          {cur && t && (
            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="truncate font-medium">{cur.file.name}</span>
                <span className="font-mono text-xs text-muted">{cur.w}×{cur.h} → <b className="text-accent">{t.tw}×{t.th}</b></span>
              </div>
              <div className="checker grid min-h-48 place-items-center overflow-hidden rounded-xl p-2">
                {previewUrl ? <img src={previewUrl} alt="Resized preview" className="max-h-[55vh] max-w-full shadow-lg ring-1 ring-border transition-all" /> : <div className="h-48" />}
              </div>
            </div>
          )}
          {items.length > 1 && <ThumbGrid items={items} selected={cur?.id} onSelect={setSel} onRemove={(id) => { remove(id); setResults(null) }} onAdd={onFiles}
            extra={(it) => { const tt = target(it, o); return <div className="flex items-center justify-between text-[11px] text-muted"><span className="font-mono">→ {tt.tw}×{tt.th}</span><StatusPill state={status[it.id]} /></div> }} />}
          {items.length === 1 && <ThumbGrid items={[]} onAdd={onFiles} />}
        </>}
        side={<>
          <Segmented value={o.mode} onChange={(mode) => set({ mode })} options={[{ value: 'pixels', label: 'Pixels' }, { value: 'percent', label: 'Percent' }, { value: 'preset', label: 'Social presets' }]} />
          {o.mode === 'pixels' && (
            <div className="flex items-end gap-2">
              <Field label="Width" className="flex-1"><Input type="number" min={1} value={o.lock && o.by === 'h' && cur ? target(cur, o).tw : o.W} onChange={(e) => set({ W: Math.max(1, Number(e.target.value) || 1), by: 'w' })} /></Field>
              <button onClick={() => set({ lock: !o.lock })} className={cn('mb-1 grid size-8 place-items-center rounded-lg border cursor-pointer', o.lock ? 'border-accent text-accent' : 'border-border text-muted')} title={o.lock ? 'Aspect ratio locked' : 'Aspect ratio unlocked'} aria-label="Toggle aspect lock">{o.lock ? <Lock className="size-4" /> : <Unlock className="size-4" />}</button>
              <Field label="Height" className="flex-1"><Input type="number" min={1} value={o.lock && o.by === 'w' && cur ? target(cur, o).th : o.H} onChange={(e) => set({ H: Math.max(1, Number(e.target.value) || 1), by: 'h' })} /></Field>
            </div>
          )}
          {o.mode === 'pixels' && o.lock && items.length > 1 && <p className="-mt-3 text-[11px] text-muted">With the lock on, each image keeps its own aspect ratio.</p>}
          {o.mode === 'percent' && (
            <div className="space-y-3">
              <Slider label="Scale" value={o.pct} onChange={(pct) => set({ pct })} min={1} max={400} suffix="%" />
              <div className="flex flex-wrap gap-1.5">{[25, 50, 75, 150, 200].map((p) => <Button key={p} size="sm" variant={o.pct === p ? 'primary' : 'secondary'} onClick={() => set({ pct: p })}>{p}%</Button>)}</div>
            </div>
          )}
          {o.mode === 'preset' && <Field label="Preset"><Select value={o.preset} onChange={(preset) => set({ preset })} options={SOCIAL_SIZES.map((s) => ({ value: s.id, label: s.label }))} /></Field>}
          {showFit && (
            <div>
              <Label>Fit</Label>
              <Segmented value={o.fit} onChange={(fit) => set({ fit })} options={[{ value: 'cover', label: 'Cover (crop)' }, { value: 'contain', label: 'Contain (pad)' }, { value: 'stretch', label: 'Stretch' }]} />
              {o.fit === 'contain' && (
                <div className="mt-3 space-y-2">
                  <Switch checked={o.transparent} onChange={(transparent) => set({ transparent })} label="Transparent padding" />
                  {!o.transparent && <ColorInput value={o.bg} onChange={(bg) => set({ bg })} />}
                </div>
              )}
            </div>
          )}
          <div>
            <Label>Format</Label>
            <Segmented value={fmt} onChange={(f) => { setFmt(f); setResults(null) }} options={[{ value: 'keep', label: 'Original' }, { value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }, { value: 'webp', label: 'WEBP' }]} />
          </div>
          {fmt !== 'png' && <Slider label="Quality" value={quality} onChange={setQuality} min={40} max={100} suffix="%" />}
          {busy && <Progress value={progress} label="Resizing" />}
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" loading={busy} icon={<Scaling className="size-4" />} onClick={go}>Resize {items.length > 1 ? `${items.length} images` : 'image'}</Button>
          <p className="text-center text-[11px] text-muted">High-quality stepwise downscaling for crisp results.</p>
          <Button variant="ghost" className="w-full" onClick={reset}>Start over</Button>
        </>}
      />
      {results && <BatchResults results={results} zipName="resized-images.zip" onReset={reset} />}
    </div>
  )
}
