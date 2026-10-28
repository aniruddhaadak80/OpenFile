import { useEffect, useMemo, useRef, useState } from 'react'
import { Eye, EyeOff, Folder, Download, Package, Layers, ImageIcon } from 'lucide-react'
import { Button, Dropzone, FileChip, Label, Progress, Segmented, Switch, ToolGrid, ErrorNote, cn, useJob } from '@/components/ui'
import { baseName, downloadBlob, zipFiles } from '@/lib/files'

type L = { id: number; name: string; depth: number; hidden: boolean; opacity: number; blend: string; canvas?: HTMLCanvasElement; left: number; top: number; group: boolean; parent: number | null; text?: string; thumb?: string }
const BLEND: Record<string, GlobalCompositeOperation> = { normal: 'source-over', multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten', 'color dodge': 'color-dodge', 'color burn': 'color-burn', 'hard light': 'hard-light', 'soft light': 'soft-light', difference: 'difference', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity', 'linear dodge': 'lighter' }
const toPng = (c: HTMLCanvasElement) => new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('PNG export failed'))), 'image/png'))
function thumbOf(c?: HTMLCanvasElement) {
  if (!c || !c.width || !c.height) return undefined
  const k = Math.min(1, 40 / Math.max(c.width, c.height)); const t = document.createElement('canvas'); t.width = Math.max(1, c.width * k); t.height = Math.max(1, c.height * k)
  t.getContext('2d')!.drawImage(c, 0, 0, t.width, t.height); return t.toDataURL()
}
const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'layer'

export default function PsdViewer() {
  const [file, setFile] = useState<File | null>(null)
  const [layers, setLayers] = useState<L[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [composite, setComposite] = useState<HTMLCanvasElement | null>(null)
  const [hidden, setHidden] = useState<Set<number>>(new Set())
  const [view, setView] = useState<'live' | 'saved'>('live')
  const [sel, setSel] = useState<number | null>(null)
  const [info, setInfo] = useState<Record<string, string>>({})
  const [trim, setTrim] = useState(true)
  const { busy, progress, error, run } = useJob()
  const out = useRef<HTMLCanvasElement>(null)

  const open = (f: File) => run(async (setP) => {
    setFile(f); setLayers([])
    const { readPsd } = await import('ag-psd')
    setP(0.2)
    const psd = readPsd(await f.arrayBuffer(), { skipThumbnail: true })
    setP(0.8)
    const list: L[] = []; let id = 0
    const walk = (children: any[] | undefined, depth: number, parent: number | null) => {
      if (!children) return
      // ag-psd lists children bottom-to-top; show top-to-bottom like Photoshop
      for (let i = children.length - 1; i >= 0; i--) {
        const c = children[i], me = id++
        list.push({ id: me, name: c.name || `Layer ${me + 1}`, depth, hidden: !!c.hidden, opacity: c.opacity ?? 1, blend: c.blendMode || 'normal', canvas: c.canvas, left: c.left ?? 0, top: c.top ?? 0, group: !!c.children, parent, text: c.text?.text, thumb: thumbOf(c.canvas) })
        walk(c.children, depth + 1, me)
      }
    }
    walk(psd.children, 0, null)
    setLayers(list); setSize({ w: psd.width, h: psd.height }); setComposite((psd.canvas as HTMLCanvasElement) ?? null)
    setHidden(new Set(list.filter((l) => l.hidden).map((l) => l.id)))
    setView(list.length ? 'live' : 'saved')
    setInfo({ Size: `${psd.width}×${psd.height}`, Layers: String(list.filter((l) => !l.group).length), Groups: String(list.filter((l) => l.group).length), 'Colour mode': ['Bitmap', 'Grayscale', 'Indexed', 'RGB', 'CMYK', '', '', 'Multichannel', 'Duotone', 'Lab'][psd.colorMode ?? 3] || 'RGB', 'Bits per channel': String(psd.bitsPerChannel ?? 8) })
    setP(1)
  })

  const isHidden = (l: L): boolean => hidden.has(l.id) || (l.parent !== null && isHidden(layers.find((x) => x.id === l.parent)!))
  const flat = useMemo(() => {
    if (!size.w) return null
    const c = document.createElement('canvas'); c.width = size.w; c.height = size.h
    const ctx = c.getContext('2d')!
    const groupOpacity = (l: L): number => (l.parent === null ? 1 : (layers.find((x) => x.id === l.parent)!.opacity) * groupOpacity(layers.find((x) => x.id === l.parent)!))
    for (const l of [...layers].reverse()) {
      if (l.group || !l.canvas || isHidden(l)) continue
      ctx.globalAlpha = l.opacity * groupOpacity(l)
      ctx.globalCompositeOperation = BLEND[l.blend] ?? 'source-over'
      ctx.drawImage(l.canvas, l.left, l.top)
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'
    return c
  }, [layers, hidden, size])

  const shown = view === 'saved' && composite ? composite : flat
  useEffect(() => {
    const v = out.current; if (!v || !shown) return
    v.width = shown.width; v.height = shown.height
    const ctx = v.getContext('2d')!; ctx.clearRect(0, 0, v.width, v.height); ctx.drawImage(shown, 0, 0)
    const l = layers.find((x) => x.id === sel)
    if (l?.canvas) { ctx.strokeStyle = '#F5A524'; ctx.lineWidth = Math.max(2, shown.width / 400); ctx.setLineDash([8, 6]); ctx.strokeRect(l.left, l.top, l.canvas.width, l.canvas.height) }
  }, [shown, sel, layers])

  const layerCanvas = (l: L) => {
    if (trim || !l.canvas) return l.canvas!
    const c = document.createElement('canvas'); c.width = size.w; c.height = size.h
    c.getContext('2d')!.drawImage(l.canvas, l.left, l.top); return c
  }
  const exportAll = () => run(async (setP) => {
    const files: { name: string; data: Blob }[] = []
    const real = layers.filter((l) => !l.group && l.canvas && l.canvas.width > 0)
    for (let i = 0; i < real.length; i++) { files.push({ name: `${String(i + 1).padStart(3, '0')}-${safe(real[i].name)}.png`, data: await toPng(layerCanvas(real[i])) }); setP((i + 1) / real.length) }
    if (!files.length) throw new Error('This file has no pixel layers to export.')
    downloadBlob(await zipFiles(files), `${baseName(file!.name)}-layers.zip`)
  })

  if (!file) return <Dropzone accept=".psd,.psb" onFiles={(f) => open(f[0])} label="Drop a PSD or PSB file" sub="View layers, hide or show them, export PNGs · never uploaded" />
  return (
    <ToolGrid
      main={<>
        <FileChip file={file} onRemove={() => { setFile(null); setLayers([]); setComposite(null) }} />
        {busy && <Progress value={progress} label="Reading layers" />}
        <ErrorNote error={error} />
        {shown && <div className="checker grid place-items-center overflow-auto rounded-2xl border border-border p-2"><canvas ref={out} className="max-h-[70vh] max-w-full object-contain" style={{ height: 'auto' }} /></div>}
        {Object.keys(info).length > 0 && <div className="flex flex-wrap gap-2 text-xs">{Object.entries(info).map(([k, v]) => <span key={k} className="rounded-lg border border-border bg-surface-2/50 px-2.5 py-1"><span className="text-muted">{k}:</span> {v}</span>)}</div>}
      </>}
      side={<>
        {composite && layers.length > 0 && <Segmented value={view} onChange={setView} options={[{ value: 'live', label: 'Live layers' }, { value: 'saved', label: 'Saved composite' }]} />}
        <div>
          <Label hint={`${layers.length}`}>Layers</Label>
          <div className="max-h-96 space-y-0.5 overflow-auto rounded-xl border border-border p-1 scrollbar-thin" role="list">
            {!layers.length && <div className="p-3 text-xs text-muted">No layers found. Only the flattened image is available.</div>}
            {layers.map((l) => (
              <div key={l.id} role="listitem" className={cn('flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs', sel === l.id ? 'bg-accent/10' : 'hover:bg-surface-2')} style={{ paddingLeft: 6 + l.depth * 14 }}>
                <button className="rounded p-0.5 text-muted hover:text-fg cursor-pointer" aria-label={hidden.has(l.id) ? `Show ${l.name}` : `Hide ${l.name}`} onClick={() => { setView('live'); setHidden((s) => { const n = new Set(s); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n }) }}>{hidden.has(l.id) ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</button>
                {l.group ? <Folder className="size-3.5 text-accent" /> : l.thumb ? <img src={l.thumb} alt="" className="checker size-5 rounded object-contain" /> : <ImageIcon className="size-3.5 text-muted" />}
                <button className={cn('min-w-0 flex-1 truncate text-left cursor-pointer', isHidden(l) && 'text-muted')} onClick={() => setSel(l.id === sel ? null : l.id)} title={l.text ?? l.name}>{l.name}</button>
                {!l.group && l.canvas && <button className="rounded p-0.5 text-muted hover:text-fg cursor-pointer" aria-label={`Download ${l.name}`} onClick={async () => downloadBlob(await toPng(layerCanvas(l)), `${safe(l.name)}.png`)}><Download className="size-3.5" /></button>}
              </div>
            ))}
          </div>
        </div>
        <Switch checked={trim} onChange={setTrim} label="Trim layers to their content" />
        <Button size="lg" className="w-full" disabled={!shown} icon={<ImageIcon className="size-4" />} onClick={async () => shown && downloadBlob(await toPng(shown), `${baseName(file.name)}.png`)}>Download image (PNG)</Button>
        <Button variant="outline" className="w-full" loading={busy} disabled={!layers.length} icon={<Package className="size-4" />} onClick={exportAll}>Export all layers (ZIP)</Button>
        <p className="flex gap-2 text-[11px] text-muted"><Layers className="size-3.5 shrink-0" />Live view redraws visible layers with their blend modes. Adjustment layers and layer effects are only in the saved composite.</p>
        <Button variant="ghost" className="w-full" onClick={() => { setFile(null); setLayers([]); setComposite(null) }}>Start over</Button>
      </>}
    />
  )
}
