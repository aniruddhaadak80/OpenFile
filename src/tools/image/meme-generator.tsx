import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, Plus, Trash2, Upload, Laugh, Copy } from 'lucide-react'
import { Button, ErrorNote, Field, Input, Label, Slider, Switch, ToolGrid, cn, useJob } from '@/components/ui'
import { toast } from '@/components/toast'
import { downloadBlob, baseName } from '@/lib/files'
import { ColorInput, ImageDrop, canvas, decode, exportCanvas, loadGoogleFont, usePasteImages } from './_img/kit'
import { TextStage, measure, newLayer, renderFull, type TextLayer } from './_img/textLayers'

/* six built-in templates drawn on canvas, no network, no copyright */
function makeTemplate(i: number): HTMLCanvasElement {
  const W = 900, H = 900
  const { canvas: c, ctx } = canvas(W, H)
  const lg = (a: string, b: string, x1 = 0, y1 = 0, x2 = W, y2 = H) => { const g = ctx.createLinearGradient(x1, y1, x2, y2); g.addColorStop(0, a); g.addColorStop(1, b); return g }
  switch (i) {
    case 0: { ctx.fillStyle = lg('#134e4a', '#f5a524'); ctx.fillRect(0, 0, W, H); ctx.fillStyle = 'rgba(255,255,255,.08)'; for (let k = 0; k < 9; k++) { ctx.beginPath(); ctx.arc(W / 2, H / 2, 60 + k * 70, 0, Math.PI * 2); ctx.lineWidth = 18; ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.stroke() } break }
    case 1: { ctx.fillStyle = lg('#f97316', '#c2410c', 0, 0, 0, H); ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(W / 2, H * 0.62, 190, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#7c2d12'; ctx.fillRect(0, H * 0.62, W, H); ctx.fillStyle = 'rgba(0,0,0,.25)'; for (let y = H * 0.66; y < H; y += 34) ctx.fillRect(W * 0.2, y, W * 0.6, 8); break }
    case 2: { // two-panel reaction
      ctx.fillStyle = '#fef3c7'; ctx.fillRect(0, 0, W, H / 2); ctx.fillStyle = '#dcfce7'; ctx.fillRect(0, H / 2, W, H / 2)
      ctx.fillStyle = '#ef4444'; ctx.font = '700 220px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✕', W * 0.22, H * 0.25)
      ctx.fillStyle = '#16a34a'; ctx.fillText('✓', W * 0.22, H * 0.75); ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.fillRect(0, H / 2 - 3, W, 6); break
    }
    case 3: { ctx.fillStyle = '#0ea5e9'; ctx.fillRect(0, 0, W / 2, H); ctx.fillStyle = '#ef4444'; ctx.fillRect(W / 2, 0, W / 2, H); ctx.fillStyle = '#fff'; ctx.font = '900 120px Impact, Anton, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('VS', W / 2, H / 2); break }
    case 4: { ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H); ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.strokeRect(60, 60, W - 120, H - 260); ctx.fillStyle = lg('#374151', '#111827'); ctx.fillRect(66, 66, W - 132, H - 272); break }
    default: { ctx.fillStyle = lg('#a7f3d0', '#93c5fd'); ctx.fillRect(0, 0, W, H); for (let k = 0; k < 40; k++) { ctx.fillStyle = `hsla(${(k * 37) % 360},90%,70%,.5)`; ctx.beginPath(); ctx.arc((k * 197) % W, (k * 113) % H, 20 + ((k * 7) % 50), 0, Math.PI * 2); ctx.fill() } }
  }
  return c
}
const TEMPLATE_NAMES = ['Galaxy', 'Sunset', 'Nope / Yep', 'Versus', 'Poster', 'Confetti']

export default function MemeGenerator() {
  const [name, setName] = useState('meme')
  const [img, setImg] = useState<HTMLImageElement | HTMLCanvasElement | null>(null)
  const [top, setTop] = useState('When the code works')
  const [bottom, setBottom] = useState('on the first try')
  const [size, setSize] = useState(78)
  const [stroke, setStroke] = useState(5)
  const [color, setColor] = useState('#ffffff')
  const [strokeColor, setStrokeColor] = useState('#000000')
  const [upper, setUpper] = useState(true)
  const [extras, setExtras] = useState<TextLayer[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [fontTick, setTick] = useState(0)
  const { busy, error, run } = useJob()
  const thumbs = useMemo(() => TEMPLATE_NAMES.map((_, i) => makeTemplate(i).toDataURL('image/jpeg', 0.7)), [])
  const fileIn = useRef<HTMLInputElement>(null)
  useEffect(() => { loadGoogleFont('Anton', '400').then(() => setTick((t) => t + 1)) }, [])

  const onFiles = useCallback(async (f: File[]) => { setImg(await decode(f[0])); setName(baseName(f[0].name)) }, [])
  usePasteImages(onFiles, !!img)
  const iw = img ? ((img as HTMLImageElement).naturalWidth || img.width) : 1, ih = img ? ((img as HTMLImageElement).naturalHeight || img.height) : 1

  const style: Partial<TextLayer> = { font: 'Impact', bold: false, upper, color, strokeColor, strokeW: stroke, shadow: false, size, maxWidth: 0.94, lineHeight: 1.05 }
  const anchored = useMemo(() => {
    const ctx = document.createElement('canvas').getContext('2d')!
    const mk = (id: string, text: string, where: 'top' | 'bottom') => {
      const L = newLayer({ ...style, id, text })
      const m = measure(ctx, L, iw), margin = ih * 0.03
      L.y = where === 'top' ? (margin + m.h / 2) / ih : (ih - margin - m.h / 2) / ih
      return L
    }
    return [mk('__top', top, 'top'), mk('__bottom', bottom, 'bottom')].filter((l) => l.text)
  }, [top, bottom, size, stroke, color, strokeColor, upper, iw, ih, fontTick])
  useEffect(() => { setExtras((ex) => ex.map((l) => ({ ...l, ...style, size: l.size, maxWidth: l.maxWidth }))) }, [stroke, color, strokeColor, upper])
  const layers = [...anchored, ...extras]
  const ex = extras.find((l) => l.id === sel)

  const addText = () => { const L = newLayer({ ...style, text: 'MORE TEXT', size: Math.round(size * 0.8), maxWidth: 0.6, y: 0.5 }); setExtras((e) => [...e, L]); setSel(L.id) }
  const exportImg = () => run(async () => {
    if (!img) return
    await loadGoogleFont('Anton', '400')
    const c = renderFull(img as any, layers)
    downloadBlob(await exportCanvas(c, 'jpg', 0.92), `${name}-meme.jpg`)
  })
  const copyImg = () => run(async () => {
    if (!img || !('ClipboardItem' in window)) throw new Error('Copying images is not supported in this browser.')
    const c = renderFull(img as any, layers)
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png')) })])
    toast('Meme copied to clipboard')
  })

  if (!img) return (
    <div className="space-y-6">
      <ImageDrop multiple={false} onFiles={onFiles} label="Drop an image for your meme" />
      <div>
        <div className="mb-3 text-center text-sm text-muted">…or start from a built-in template</div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {thumbs.map((t, i) => <button key={i} onClick={() => { setImg(makeTemplate(i)); setName(TEMPLATE_NAMES[i].toLowerCase().replace(/\W+/g, '-')) }} className="group overflow-hidden rounded-xl border border-border transition hover:-translate-y-0.5 hover:border-accent cursor-pointer"><img src={t} alt="" className="aspect-square w-full object-cover" /><div className="py-1.5 text-xs font-medium">{TEMPLATE_NAMES[i]}</div></button>)}
        </div>
      </div>
    </div>
  )

  return (
    <ToolGrid
      main={<>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="grid place-items-center overflow-hidden rounded-xl bg-surface-2/50 p-2">
            <TextStage img={img as any} layers={layers} selected={sel} onSelect={(id) => setSel(id && !id.startsWith('__') ? id : null)} onChange={(id, p) => { if (!id.startsWith('__')) setExtras((e) => e.map((l) => (l.id === id ? { ...l, ...p } : l))) }} />
          </div>
          <p className="mt-2 text-center text-[11px] text-muted">Top & bottom captions stay anchored · extra texts can be dragged anywhere</p>
        </div>
      </>}
      side={<>
        <Field label="Top text"><Input value={top} onChange={(e) => setTop(e.target.value)} placeholder="Top caption" /></Field>
        <Field label="Bottom text"><Input value={bottom} onChange={(e) => setBottom(e.target.value)} placeholder="Bottom caption" /></Field>
        <Slider label="Text size" value={size} onChange={setSize} min={20} max={200} />
        <Slider label="Outline" value={stroke} onChange={setStroke} min={0} max={14} />
        <div className="grid grid-cols-2 gap-2"><div><Label>Fill</Label><ColorInput value={color} onChange={setColor} /></div><div><Label>Outline</Label><ColorInput value={strokeColor} onChange={setStrokeColor} /></div></div>
        <Switch checked={upper} onChange={setUpper} label="ALL CAPS" />
        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex items-center justify-between"><Label className="mb-0">Extra text</Label><Button size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={addText}>Add</Button></div>
          {extras.map((l) => <button key={l.id} onClick={() => setSel(l.id)} className={cn('block w-full truncate rounded-lg border px-2.5 py-1.5 text-left text-xs cursor-pointer', sel === l.id ? 'border-accent bg-accent/10' : 'border-border')}>{l.text || '(empty)'}</button>)}
          {ex && <div className="space-y-2 rounded-xl bg-surface-2/60 p-3">
            <Input value={ex.text} onChange={(e) => setExtras((a) => a.map((l) => (l.id === ex.id ? { ...l, text: e.target.value } : l)))} />
            <Slider label="Size" value={ex.size} onChange={(v) => setExtras((a) => a.map((l) => (l.id === ex.id ? { ...l, size: v } : l)))} min={14} max={200} />
            <Slider label="Rotation" value={ex.rotation} onChange={(v) => setExtras((a) => a.map((l) => (l.id === ex.id ? { ...l, rotation: v } : l)))} min={-45} max={45} suffix="°" />
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-4 text-danger" />} onClick={() => { setExtras((a) => a.filter((l) => l.id !== ex.id)); setSel(null) }}>Remove</Button>
          </div>}
        </div>
        <ErrorNote error={error} />
        <div className="grid grid-cols-2 gap-2">
          <Button loading={busy} icon={<Download className="size-4" />} onClick={exportImg}>Download</Button>
          <Button variant="outline" disabled={busy} icon={<Copy className="size-4" />} onClick={copyImg}>Copy</Button>
        </div>
        <input ref={fileIn} type="file" hidden accept="image/*" onChange={(e) => { const f = e.target.files; e.target.value = ''; if (f?.[0]) onFiles([f[0]]) }} />
        <div className="flex gap-2"><Button variant="ghost" className="flex-1" icon={<Upload className="size-4" />} onClick={() => fileIn.current?.click()}>New image</Button><Button variant="ghost" className="flex-1" icon={<Laugh className="size-4" />} onClick={() => { setImg(null); setExtras([]) }}>Templates</Button></div>
      </>}
    />
  )
}
