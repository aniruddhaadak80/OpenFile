import { useCallback, useEffect, useState } from 'react'
import { Plus, Copy, Trash2, ChevronUp, ChevronDown, Bold, Italic, AlignLeft, AlignCenter, AlignRight, CaseUpper, Download, Type } from 'lucide-react'
import { Button, ErrorNote, Field, Input, Label, Segmented, Select, Slider, Switch, Textarea, ToolGrid, cn, useJob } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { ColorInput, FONT_CHOICES, ImageDrop, decode, ensureFont, exportCanvas, outName } from './_img/kit'
import { TextStage, newLayer, renderFull, type TextLayer } from './_img/textLayers'

const Toggle = ({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: React.ReactNode; label: string }) => (
  <button onClick={onClick} aria-label={label} title={label} className={cn('grid size-9 place-items-center rounded-lg border transition cursor-pointer', on ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-fg')}>{children}</button>
)

export default function AddTextToImage() {
  const [file, setFile] = useState<File | null>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [layers, setLayers] = useState<TextLayer[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [customFont, setCustomFont] = useState('')
  const [fmt, setFmt] = useState<'png' | 'jpg' | 'webp'>('png')
  const [, setTick] = useState(0)
  const { busy, error, run } = useJob()

  const onFiles = useCallback(async (f: File[]) => {
    const im = await decode(f[0]); setFile(f[0]); setImg(im)
    const L = newLayer({ text: 'Double the impact', y: 0.18 }); setLayers([L]); setSel(L.id)
  }, [])
  const upd = (id: string, p: Partial<TextLayer>) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)))
  const L = layers.find((l) => l.id === sel) ?? null
  const fonts = Array.from(new Set(layers.map((l) => l.font)))
  useEffect(() => { fonts.forEach((f) => ensureFont(f).then(() => setTick((t) => t + 1))) }, [fonts.join('|')])

  const add = () => { const n = newLayer({ text: 'New text', y: 0.5 + ((layers.length % 4) - 1.5) * 0.12 }); setLayers((ls) => [...ls, n]); setSel(n.id) }
  const dup = () => { if (!L) return; const n = { ...L, id: Math.random().toString(36).slice(2), x: Math.min(0.95, L.x + 0.04), y: Math.min(0.95, L.y + 0.04) }; setLayers((ls) => [...ls, n]); setSel(n.id) }
  const del = () => { if (!L) return; setLayers((ls) => ls.filter((l) => l.id !== L.id)); setSel(null) }
  const move = (d: number) => { if (!L) return; setLayers((ls) => { const i = ls.findIndex((l) => l.id === L.id), j = i + d; if (j < 0 || j >= ls.length) return ls; const a = [...ls]; [a[i], a[j]] = [a[j], a[i]]; return a }) }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!L) return
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return
      const step = e.shiftKey ? 0.02 : 0.004
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); del() }
      if (e.key === 'ArrowLeft') { e.preventDefault(); upd(L.id, { x: L.x - step }) }
      if (e.key === 'ArrowRight') { e.preventDefault(); upd(L.id, { x: L.x + step }) }
      if (e.key === 'ArrowUp') { e.preventDefault(); upd(L.id, { y: L.y - step }) }
      if (e.key === 'ArrowDown') { e.preventDefault(); upd(L.id, { y: L.y + step }) }
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })

  const exportImg = () => run(async () => {
    if (!img || !file) return
    await Promise.all(fonts.map(ensureFont))
    const c = renderFull(img, layers)
    downloadBlob(await exportCanvas(c, fmt, 0.93), outName(file.name, fmt, '-text'))
  })
  const reset = () => { setFile(null); setImg(null); setLayers([]); setSel(null) }

  if (!file || !img) return <ImageDrop multiple={false} onFiles={onFiles} label="Drop an image to add text" />

  return (
    <ToolGrid
      main={<>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="checker grid place-items-center overflow-hidden rounded-xl p-2">
            <TextStage img={img} layers={layers} selected={sel} onSelect={setSel} onChange={upd} />
          </div>
          <p className="mt-2 text-center text-[11px] text-muted">Click a text to select · drag to move · arrow keys nudge · Delete removes</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {layers.map((l, i) => <button key={l.id} onClick={() => setSel(l.id)} className={cn('flex max-w-48 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs cursor-pointer', sel === l.id ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-fg')}><Type className="size-3.5 shrink-0" /><span className="truncate">{l.text || `Layer ${i + 1}`}</span></button>)}
          <Button size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={add}>Add text</Button>
        </div>
      </>}
      side={<>
        {!L ? <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted">Select a text layer on the image, or <button className="text-accent underline cursor-pointer" onClick={add}>add a new one</button>.</div> : (<>
          <div className="flex items-center justify-between">
            <Label className="mb-0">Text layer</Label>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => move(1)} icon={<ChevronUp className="size-4" />} aria-label="Bring forward" title="Bring forward" />
              <Button size="sm" variant="ghost" onClick={() => move(-1)} icon={<ChevronDown className="size-4" />} aria-label="Send backward" title="Send backward" />
              <Button size="sm" variant="ghost" onClick={dup} icon={<Copy className="size-4" />} aria-label="Duplicate" title="Duplicate" />
              <Button size="sm" variant="ghost" onClick={del} icon={<Trash2 className="size-4 text-danger" />} aria-label="Delete" title="Delete" />
            </div>
          </div>
          <Textarea value={L.text} onChange={(e) => upd(L.id, { text: e.target.value })} className="min-h-20 font-sans text-sm" placeholder="Type your text (Enter for new line)" />
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Field label="Font"><Select value={FONT_CHOICES.includes(L.font) ? L.font : '__custom'} onChange={(v) => v !== '__custom' && upd(L.id, { font: v })} options={[...FONT_CHOICES.map((f) => ({ value: f, label: f })), { value: '__custom', label: FONT_CHOICES.includes(L.font) ? 'Custom Google Font…' : L.font }]} /></Field>
            <Field label="Color"><input type="color" value={L.color} onChange={(e) => upd(L.id, { color: e.target.value })} className="h-10 w-12 cursor-pointer rounded-xl border border-border bg-surface-2/60 p-1" /></Field>
          </div>
          <div className="flex gap-2">
            <Input value={customFont} onChange={(e) => setCustomFont(e.target.value)} placeholder="Any Google Font, e.g. Caveat" onKeyDown={(e) => { if (e.key === 'Enter' && customFont.trim()) upd(L.id, { font: customFont.trim() }) }} />
            <Button variant="secondary" disabled={!customFont.trim()} onClick={() => upd(L.id, { font: customFont.trim() })}>Use</Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Toggle on={L.bold} onClick={() => upd(L.id, { bold: !L.bold })} label="Bold"><Bold className="size-4" /></Toggle>
            <Toggle on={L.italic} onClick={() => upd(L.id, { italic: !L.italic })} label="Italic"><Italic className="size-4" /></Toggle>
            <Toggle on={L.upper} onClick={() => upd(L.id, { upper: !L.upper })} label="Uppercase"><CaseUpper className="size-4" /></Toggle>
            <div className="mx-1 h-6 w-px bg-border" />
            <Toggle on={L.align === 'left'} onClick={() => upd(L.id, { align: 'left' })} label="Align left"><AlignLeft className="size-4" /></Toggle>
            <Toggle on={L.align === 'center'} onClick={() => upd(L.id, { align: 'center' })} label="Align center"><AlignCenter className="size-4" /></Toggle>
            <Toggle on={L.align === 'right'} onClick={() => upd(L.id, { align: 'right' })} label="Align right"><AlignRight className="size-4" /></Toggle>
          </div>
          <Slider label="Size" value={L.size} onChange={(size) => upd(L.id, { size })} min={8} max={400} />
          <Slider label="Rotation" value={L.rotation} onChange={(rotation) => upd(L.id, { rotation })} min={-180} max={180} suffix="°" />
          <Slider label="Opacity" value={L.opacity} onChange={(opacity) => upd(L.id, { opacity })} min={5} max={100} suffix="%" />
          <Slider label="Wrap width" value={Math.round(L.maxWidth * 100)} onChange={(v) => upd(L.id, { maxWidth: v / 100 })} min={0} max={100} suffix={L.maxWidth ? '%' : ' (off)'} />
          <details className="group rounded-xl border border-border p-3" open={L.strokeW > 0}>
            <summary className="cursor-pointer text-sm font-medium">Outline</summary>
            <div className="mt-3 space-y-3"><Slider label="Width" value={L.strokeW} onChange={(strokeW) => upd(L.id, { strokeW })} min={0} max={20} /><ColorInput value={L.strokeColor} onChange={(strokeColor) => upd(L.id, { strokeColor })} /></div>
          </details>
          <details className="rounded-xl border border-border p-3" open={L.shadow}>
            <summary className="cursor-pointer text-sm font-medium">Shadow</summary>
            <div className="mt-3 space-y-3"><Switch checked={L.shadow} onChange={(shadow) => upd(L.id, { shadow })} label="Drop shadow" />{L.shadow && <><Slider label="Blur" value={L.shadowBlur} onChange={(shadowBlur) => upd(L.id, { shadowBlur })} min={0} max={60} /><ColorInput value={L.shadowColor} onChange={(shadowColor) => upd(L.id, { shadowColor })} /></>}</div>
          </details>
          <details className="rounded-xl border border-border p-3" open={L.box}>
            <summary className="cursor-pointer text-sm font-medium">Background box</summary>
            <div className="mt-3 space-y-3"><Switch checked={L.box} onChange={(box) => upd(L.id, { box })} label="Show box" />{L.box && <><ColorInput value={L.boxColor} onChange={(boxColor) => upd(L.id, { boxColor })} /><Slider label="Box opacity" value={L.boxOpacity} onChange={(boxOpacity) => upd(L.id, { boxOpacity })} min={5} max={100} suffix="%" /><Slider label="Padding" value={L.boxPad} onChange={(boxPad) => upd(L.id, { boxPad })} min={0} max={80} /><Slider label="Corner radius" value={L.boxRadius} onChange={(boxRadius) => upd(L.id, { boxRadius })} min={0} max={80} /></>}</div>
          </details>
        </>)}
        <div className="border-t border-border pt-4">
          <Label>Format</Label>
          <Segmented value={fmt} onChange={setFmt} options={[{ value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }, { value: 'webp', label: 'WEBP' }]} />
        </div>
        <ErrorNote error={error} />
        <Button size="lg" className="w-full" loading={busy} icon={<Download className="size-4" />} onClick={exportImg}>Download image</Button>
        <Button variant="ghost" className="w-full" onClick={reset}>Start over</Button>
      </>}
    />
  )
}
