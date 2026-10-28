import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Pipette, RefreshCw, X, ImagePlus, Sparkles } from 'lucide-react'
import { Button, Card, Dropzone, Label, Segmented, Slider, Tabs, Textarea, CopyButton, Badge, ErrorNote, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { loadImage, downloadBlob, canvasToBlob, baseName, copyText } from '@/lib/files'
import { RGBA, rgbToHex, contrast, textOn, harmonies, nearestName, fmt, rgbToHsl } from './_design/color'
import { samplePixels, kmeans, medianCut, vibrantSwatches } from './_design/quantize'

type Sw = { id: number; color: RGBA; share?: number; picked?: boolean }
type ExportKind = 'css' | 'tailwind' | 'scss' | 'json'
const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 1 }, BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 }
let uid = 1
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export default function ColorPalette() {
  const [file, setFile] = useState<File | null>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [pixels, setPixels] = useState<{ data: Uint8ClampedArray; w: number; h: number } | null>(null)
  const [count, setCount] = useState(6)
  const [method, setMethod] = useState<'kmeans' | 'median'>('kmeans')
  const [swatches, setSwatches] = useState<Sw[]>([])
  const [sel, setSel] = useState(0)
  const [exp, setExp] = useState<ExportKind>('css')
  const [harm, setHarm] = useState<keyof ReturnType<typeof harmonies>>('complementary')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const open = async (f: File) => {
    setError(null)
    try {
      const im = await loadImage(f)
      const scale = Math.min(1, 360 / Math.max(im.naturalWidth, im.naturalHeight))
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.naturalWidth * scale)); c.height = Math.max(1, Math.round(im.naturalHeight * scale))
      const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(im, 0, 0, c.width, c.height)
      setPixels({ data: ctx.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height })
      setFile(f); setImg(im)
    } catch { setError('Could not read that image. Try a PNG, JPG, WEBP or GIF.') }
  }
  // paste support
  useEffect(() => {
    const h = (e: ClipboardEvent) => { const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith('image/')); if (f) open(f) }
    window.addEventListener('paste', h); return () => window.removeEventListener('paste', h)
  }, [])

  const px = useMemo(() => (pixels ? samplePixels(pixels.data, 20000) : null), [pixels])
  const extract = useCallback(() => {
    if (!px) return
    setBusy(true)
    setTimeout(() => {
      const res = method === 'kmeans' ? kmeans(px, count) : medianCut(px, count)
      if (!res.length) setError('The image is fully transparent — no colours to extract.')
      setSwatches((old) => [...res.map((s) => ({ id: uid++, color: s.color, share: s.share })), ...old.filter((o) => o.picked)])
      setSel(0); setBusy(false)
    }, 10)
  }, [px, count, method])
  useEffect(() => { extract() }, [extract])
  const vibrant = useMemo(() => (px ? vibrantSwatches(px) : []), [px])

  const names = useMemo(() => { const used: Record<string, number> = {}; return swatches.map((s) => { const n = slug(nearestName(s.color)) || 'color'; used[n] = (used[n] ?? 0) + 1; return used[n] > 1 ? `${n}-${used[n]}` : n }) }, [swatches])
  const exportText = useMemo(() => {
    const hexes = swatches.map((s) => rgbToHex(s.color))
    switch (exp) {
      case 'css': return `:root {\n${hexes.map((h, i) => `  --color-${names[i]}: ${h};`).join('\n')}\n}`
      case 'scss': return hexes.map((h, i) => `$color-${names[i]}: ${h};`).join('\n') + `\n\n$palette: (\n${hexes.map((h, i) => `  '${names[i]}': ${h},`).join('\n')}\n);`
      case 'tailwind': return `// tailwind.config.js\nmodule.exports = {\n  theme: {\n    extend: {\n      colors: {\n${hexes.map((h, i) => `        '${names[i]}': '${h}',`).join('\n')}\n      },\n    },\n  },\n}\n\n/* Tailwind v4 — in your CSS */\n@theme {\n${hexes.map((h, i) => `  --color-${names[i]}: ${h};`).join('\n')}\n}`
      case 'json': return JSON.stringify(swatches.map((s, i) => ({ name: names[i], hex: rgbToHex(s.color), rgb: [s.color.r, s.color.g, s.color.b], hsl: fmt.hsl(s.color), oklch: fmt.oklch(s.color), share: s.share != null ? +(s.share * 100).toFixed(2) : undefined })), null, 2)
    }
  }, [swatches, exp, names])

  const pngCard = async () => {
    const n = swatches.length; if (!n) return
    const W = 1200, pad = 48, sw = (W - pad * 2) / n, H = 640
    const c = document.createElement('canvas'); c.width = W; c.height = H
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H)
    if (img) { // thumbnail strip
      const th = 180, r = img.naturalWidth / img.naturalHeight
      ctx.save(); ctx.beginPath(); ctx.roundRect(pad, pad, W - pad * 2, th, 18); ctx.clip()
      const dw = W - pad * 2, dh = dw / r
      ctx.drawImage(img, pad, pad + (th - dh) / 2, dw, dh); ctx.restore()
    }
    const top = img ? pad + 180 + 24 : pad
    swatches.forEach((s, i) => {
      const x = pad + i * sw
      ctx.save(); ctx.beginPath(); ctx.roundRect(x + 4, top, sw - 8, 260, 14); ctx.fillStyle = rgbToHex(s.color); ctx.fill(); ctx.restore()
      ctx.fillStyle = textOn(s.color); ctx.font = '600 20px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'
      if (s.share != null && sw > 70) ctx.fillText(`${Math.round(s.share * 100)}%`, x + sw / 2, top + 240)
      ctx.fillStyle = '#111'; ctx.font = `700 ${Math.min(22, sw / 6)}px "JetBrains Mono", monospace`
      ctx.fillText(rgbToHex(s.color).toUpperCase(), x + sw / 2, top + 296)
      ctx.fillStyle = '#666'; ctx.font = `500 ${Math.min(16, sw / 8)}px Inter, sans-serif`
      ctx.fillText(names[i], x + sw / 2, top + 322)
    })
    ctx.fillStyle = '#999'; ctx.font = '500 14px Inter, sans-serif'; ctx.textAlign = 'right'; ctx.fillText('Made with OpenFile', W - pad, H - 20)
    downloadBlob(await canvasToBlob(c), `${file ? baseName(file.name) : 'palette'}-palette.png`)
  }

  const add = (c: RGBA) => { setSwatches((s) => [...s, { id: uid++, color: c, picked: true }]); toast(`Added ${rgbToHex(c)}`) }
  const base = swatches[sel]?.color ?? swatches[0]?.color

  if (!file || !img) return (
    <div className="space-y-4">
      <Dropzone accept="image/*" onFiles={(f) => open(f[0])} label="Drop an image to extract its palette" sub="Or paste an image (Ctrl+V). Processed 100% in your browser." />
      <ErrorNote error={error} />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <Card className="p-3">
            <Loupe img={img} pixels={pixels!} onPick={add} />
          </Card>
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display font-semibold">Palette <span className="text-sm font-normal text-muted">{swatches.length} colours</span></h3>
              <span className="text-xs text-muted">Click to copy · select for harmonies</span>
            </div>
            <div className="flex h-24 overflow-hidden rounded-xl">
              <AnimatePresence initial={false}>
                {swatches.map((s, i) => (
                  <motion.button layout key={s.id} initial={{ flexGrow: 0 }} animate={{ flexGrow: 1 }} exit={{ flexGrow: 0 }}
                    onClick={async () => { setSel(i); if (await copyText(rgbToHex(s.color))) toast(`${rgbToHex(s.color)} copied`) }}
                    className={cn('group relative min-w-0 basis-0 cursor-pointer transition', sel === i && 'z-10 ring-2 ring-inset ring-white/80')} style={{ background: rgbToHex(s.color), color: textOn(s.color) }}>
                    <span className="absolute inset-x-0 bottom-1.5 truncate px-1 font-mono text-[11px] font-semibold opacity-0 transition group-hover:opacity-100">{rgbToHex(s.color).toUpperCase()}</span>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {swatches.map((s, i) => {
                const cw = contrast(s.color, WHITE), cb = contrast(s.color, BLACK)
                return (
                  <motion.div layout key={s.id} onClick={() => setSel(i)} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border p-2 transition', sel === i ? 'border-accent bg-accent/5' : 'border-border bg-surface-2/40 hover:border-accent/50')}>
                    <div className="size-11 shrink-0 rounded-lg ring-1 ring-black/10" style={{ background: rgbToHex(s.color) }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5"><span className="font-mono text-sm font-semibold">{rgbToHex(s.color).toUpperCase()}</span>{s.share != null ? <span className="text-[11px] text-muted">{(s.share * 100).toFixed(1)}%</span> : <Badge>PICKED</Badge>}</div>
                      <div className="truncate text-[11px] capitalize text-muted">{names[i].replace(/-/g, ' ')}</div>
                      <div className="mt-1 flex gap-1 text-[10px] font-semibold">
                        <span className="rounded px-1.5 py-0.5 ring-1 ring-border" style={{ background: rgbToHex(s.color), color: '#fff' }} title="Contrast with white text">W {cw.toFixed(1)} {cw >= 7 ? 'AAA' : cw >= 4.5 ? 'AA' : cw >= 3 ? 'AA L' : '✕'}</span>
                        <span className="rounded px-1.5 py-0.5 ring-1 ring-border" style={{ background: rgbToHex(s.color), color: '#000' }} title="Contrast with black text">B {cb.toFixed(1)} {cb >= 7 ? 'AAA' : cb >= 4.5 ? 'AA' : cb >= 3 ? 'AA L' : '✕'}</span>
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setSwatches((l) => l.filter((x) => x.id !== s.id)); setSel(0) }} className="rounded-lg p-1 text-muted hover:bg-danger/10 hover:text-danger cursor-pointer" aria-label="Remove"><X className="size-4" /></button>
                  </motion.div>
                )
              })}
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <h3 className="mb-3 flex items-center gap-2 font-display font-semibold"><Sparkles className="size-4 text-accent" />Vibrant & muted</h3>
              <div className="grid grid-cols-3 gap-2">
                {vibrant.map((v) => (
                  <button key={v.name} disabled={!v.color} onClick={() => v.color && add(v.color)} title={v.color ? 'Add to palette' : 'Not found in this image'}
                    className="flex h-20 flex-col justify-between rounded-xl p-2 text-left text-[11px] transition enabled:hover:scale-[1.03] disabled:opacity-60 cursor-pointer disabled:cursor-default"
                    style={v.color ? { background: rgbToHex(v.color), color: textOn(v.color) } : undefined}>
                    <span className="font-semibold">{v.name}</span>
                    <span className="font-mono">{v.color ? rgbToHex(v.color).toUpperCase() : <span className="text-muted">—</span>}</span>
                  </button>
                ))}
              </div>
            </Card>
            <Card>
              <div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-display font-semibold">Harmonies</h3>{base && <span className="size-5 rounded-md ring-1 ring-border" style={{ background: rgbToHex(base) }} />}</div>
              <Segmented value={harm} onChange={setHarm} className="mb-3" options={[{ value: 'complementary', label: 'Compl.' }, { value: 'analogous', label: 'Analog.' }, { value: 'triadic', label: 'Triadic' }, { value: 'tetradic', label: 'Tetradic' }, { value: 'split', label: 'Split' }]} />
              {base && <div className="flex h-16 overflow-hidden rounded-xl">
                {harmonies(base)[harm].map((c, i) => (
                  <button key={i} onClick={() => add(c)} title="Add to palette" className="group flex flex-1 items-end justify-center pb-1.5 font-mono text-[10px] font-semibold cursor-pointer" style={{ background: rgbToHex(c), color: textOn(c) }}>
                    <span className="opacity-80 group-hover:opacity-100">{rgbToHex(c).toUpperCase()}</span>
                  </button>
                ))}
              </div>}
              <p className="mt-2 text-[11px] text-muted">Based on the selected swatch ({base ? Math.round(rgbToHsl(base).h) : 0}° hue). Click a colour to add it.</p>
            </Card>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="space-y-5">
            <Slider label="Number of colours" value={count} onChange={setCount} min={3} max={16} />
            <div><Label>Algorithm</Label><Segmented value={method} onChange={setMethod} options={[{ value: 'kmeans', label: 'K-means++' }, { value: 'median', label: 'Median cut' }]} /></div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={extract} loading={busy} icon={<RefreshCw className="size-4" />}>Re-extract</Button>
              <Button variant="ghost" onClick={() => { setFile(null); setImg(null); setSwatches([]) }} icon={<ImagePlus className="size-4" />}>New</Button>
            </div>
            <div className="border-t border-border pt-4">
              <Tabs value={exp} onChange={setExp} tabs={[{ value: 'css', label: 'CSS' }, { value: 'tailwind', label: 'Tailwind' }, { value: 'scss', label: 'SCSS' }, { value: 'json', label: 'JSON' }]} />
              <Textarea readOnly value={exportText} className="mt-3 h-48 text-[12px]" />
              <div className="mt-2 flex flex-wrap gap-2">
                <CopyButton text={exportText} />
                <Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={() => downloadBlob(exportText, `palette.${exp === 'json' ? 'json' : exp === 'scss' ? 'scss' : exp === 'css' ? 'css' : 'js'}`, 'text/plain')}>File</Button>
              </div>
            </div>
            <Button className="w-full" onClick={pngCard} disabled={!swatches.length} icon={<Download className="size-4" />}>Download palette card (PNG)</Button>
          </Card>
        </aside>
      </div>
    </div>
  )
}

/** Image with a magnifying loupe that follows the pointer; click picks the colour under it. */
function Loupe({ img, pixels, onPick }: { img: HTMLImageElement; pixels: { data: Uint8ClampedArray; w: number; h: number }; onPick: (c: RGBA) => void }) {
  const wrap = useRef<HTMLDivElement>(null)
  const lens = useRef<HTMLCanvasElement>(null)
  const full = useRef<HTMLCanvasElement | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number; c: RGBA } | null>(null)
  // full-res canvas for accurate sampling
  useEffect(() => {
    const c = document.createElement('canvas'); const s = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight))
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s)
    c.getContext('2d', { willReadFrequently: true })!.drawImage(img, 0, 0, c.width, c.height); full.current = c
  }, [img])
  const at = (e: React.PointerEvent) => {
    const el = wrap.current!.querySelector('img')!.getBoundingClientRect()
    const fx = (e.clientX - el.left) / el.width, fy = (e.clientY - el.top) / el.height
    if (fx < 0 || fy < 0 || fx > 1 || fy > 1 || !full.current) return null
    const f = full.current, X = Math.floor(fx * f.width), Y = Math.floor(fy * f.height)
    const d = f.getContext('2d')!.getImageData(X, Y, 1, 1).data
    return { x: e.clientX - wrap.current!.getBoundingClientRect().left, y: e.clientY - wrap.current!.getBoundingClientRect().top, c: { r: d[0], g: d[1], b: d[2], a: 1 }, X, Y }
  }
  const move = (e: React.PointerEvent) => {
    const p = at(e); if (!p) { setPos(null); return }
    setPos(p)
    const L = lens.current, f = full.current; if (!L || !f) return
    const ctx = L.getContext('2d')!; ctx.imageSmoothingEnabled = false
    const N = 11, S = L.width / N
    ctx.clearRect(0, 0, L.width, L.height)
    ctx.drawImage(f, p.X - (N >> 1), p.Y - (N >> 1), N, N, 0, 0, L.width, L.height)
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.strokeRect((N >> 1) * S, (N >> 1) * S, S, S)
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1; ctx.strokeRect((N >> 1) * S - 1, (N >> 1) * S - 1, S + 2, S + 2)
  }
  return (
    <div ref={wrap} className="relative flex justify-center overflow-hidden rounded-xl checker" onPointerMove={move} onPointerLeave={() => setPos(null)} onClick={(e) => { const p = at(e as any); if (p) onPick(p.c) }}>
      <img src={img.src} alt="" className="max-h-[440px] w-auto max-w-full cursor-crosshair select-none" draggable={false} />
      <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 rounded-lg bg-black/55 px-2 py-1 text-[11px] text-white backdrop-blur"><Pipette className="size-3.5" />Hover to zoom · click to add colour</div>
      <div className="pointer-events-none absolute" style={{ left: pos ? pos.x + 18 : -999, top: pos ? pos.y - 70 : -999, opacity: pos ? 1 : 0 }}>
        <canvas ref={lens} width={110} height={110} className="block rounded-full border-4 border-white shadow-2xl" />
        {pos && <div className="mx-auto -mt-3 w-fit rounded-md bg-black/75 px-2 py-0.5 font-mono text-[11px] text-white">{rgbToHex(pos.c).toUpperCase()}</div>}
      </div>
    </div>
  )
}
