import { useMemo, useState } from 'react'
import { Download, Layers } from 'lucide-react'
import { Button, Dropzone, ErrorNote, Label, Select, Slider, ToolGrid, cn } from '@/components/ui'
import { baseName, downloadBlob, zipFiles } from '@/lib/files'
import { encodePngFrame, resizeAnim } from '@/lib/b3/anim'
import { parseAseprite, tagAnim, type AseFile } from '@/lib/b3/aseprite'
import { buildSheet, sheetJson } from '@/lib/b3/sprite'
import { AnimPlayer, AnimStats, ExportPanel } from './_b3/anim-ui'

export default function AsepriteConverter() {
  const [file, setFile] = useState<File | null>(null)
  const [ase, setAse] = useState<AseFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tag, setTag] = useState('all')
  const [scale, setScale] = useState(4)
  const open = async (f: File) => {
    setFile(f); setError(null); setAse(null)
    try { setAse(parseAseprite(new Uint8Array(await f.arrayBuffer()))) } catch (e: any) { setError(e?.message || 'Could not read this file.') }
  }
  const anim = useMemo(() => {
    if (!ase) return null
    const t = ase.tags.find((x) => x.name === tag)
    const a = t ? tagAnim(ase.anim, t) : ase.anim
    return scale > 1 ? resizeAnim(a, a.width * scale, a.height * scale, false) : a
  }, [ase, tag, scale])
  const sheet = async () => {
    if (!anim || !file) return
    const { rgba, layout } = buildSheet(anim, Math.min(8, anim.frames.length))
    const name = baseName(file.name)
    downloadBlob(await zipFiles([{ name: `${name}.png`, data: encodePngFrame(rgba, layout.width, layout.height) }, { name: `${name}.json`, data: JSON.stringify(sheetJson(name, anim, layout, `${name}.png`), null, 2) }]), `${name}-sheet.zip`)
  }
  const reset = () => { setFile(null); setAse(null) }
  if (!file) return <Dropzone accept=".ase,.aseprite" onFiles={(f) => open(f[0])} label="Drop an .aseprite or .ase file" sub="Layers are merged as they look in Aseprite. Export GIF, APNG, WebP, a sprite sheet or frames." />
  if (!ase || !anim) return <div className="space-y-3"><ErrorNote error={error} /><Button variant="outline" onClick={reset}>Try another file</Button></div>
  return (
    <ToolGrid
      main={<>
        <div className="flex items-center justify-between"><span className="truncate text-sm font-medium">{file.name}</span><Button variant="ghost" size="sm" onClick={reset}>Start over</Button></div>
        <AnimPlayer anim={anim} />
        <AnimStats anim={anim} />
        <div className="rounded-xl border border-border p-3 text-xs">
          <div className="mb-1 flex items-center gap-1.5 font-semibold"><Layers className="size-3.5 text-accent" />Layers</div>
          <div className="flex flex-wrap gap-1">{ase.layers.map((l, i) => <span key={i} className={cn('rounded px-1.5 py-0.5', l.visible ? 'bg-surface-2' : 'bg-surface-2/40 text-muted line-through')} style={{ marginLeft: l.level * 8 }}>{l.type === 1 ? '▸ ' : ''}{l.name}</span>)}</div>
          <p className="mt-2 text-muted">{ase.depth === 32 ? 'RGBA' : ase.depth === 16 ? 'Grayscale' : `Indexed, ${ase.palette} colours`}. Hidden layers stay hidden.</p>
        </div>
      </>}
      side={<>
        {ase.tags.length > 0 && <div><Label>Animation tag</Label><Select aria-label="Animation tag" value={tag} onChange={setTag} options={[{ value: 'all', label: 'All frames' }, ...ase.tags.map((t) => ({ value: t.name, label: `${t.name} (${t.from + 1}-${t.to + 1}, ${t.direction})` }))]} /></div>}
        <Slider label="Pixel scale" value={scale} onChange={setScale} min={1} max={12} suffix="×" />
        <p className="text-xs text-muted">Scales with sharp pixels, no blur. {ase.width}×{ase.height} becomes {ase.width * scale}×{ase.height * scale}.</p>
        <Button variant="outline" className="w-full" icon={<Download className="size-4" />} onClick={sheet}>Sprite sheet (PNG + JSON)</Button>
        <ExportPanel anim={anim} name={file.name} suffix={tag !== 'all' ? `-${tag}` : ''} formats={['gif', 'apng', 'webp', 'mp4']} onReset={reset} />
      </>}
    />
  )
}
