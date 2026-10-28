import { useState } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import { Button, Dropzone, Field, Label, Progress, Select, Slider, Switch, ToolGrid, ErrorNote, ResultCard, cn, useJob } from '@/components/ui'
import { baseName } from '@/lib/files'
import { Viewer3D } from '@/lib/b2/Viewer3D'
import { ModelStatsGrid } from '@/lib/b2/ModelStats'
import type { ExportFmt, Loaded, Stats } from '@/lib/b2/three-viewer'

const OUTS: { id: ExportFmt; label: string; sub: string }[] = [
  { id: 'glb', label: 'GLB', sub: 'Web, AR, games' }, { id: 'gltf', label: 'glTF', sub: 'Text, embedded' },
  { id: 'obj', label: 'OBJ', sub: 'Universal mesh' }, { id: 'stl', label: 'STL', sub: '3D printing' },
  { id: 'stl-ascii', label: 'STL text', sub: 'Readable STL' }, { id: 'ply', label: 'PLY', sub: 'Scans, colours' },
  { id: 'ply-ascii', label: 'PLY text', sub: 'Readable PLY' }, { id: 'usdz', label: 'USDZ', sub: 'Apple AR Quick Look' },
]

export default function ThreeDConverter() {
  const [model, setModel] = useState<Loaded | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [to, setTo] = useState<ExportFmt>('glb')
  const [scale, setScale] = useState(1)
  const [unit, setUnit] = useState('1')
  const [center, setCenter] = useState(false)
  const [zUp, setZUp] = useState(false)
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null)
  const { busy, error, run } = useJob()

  const open = (fs: File[]) => run(async () => {
    const all = [...files, ...fs]
    const { loadModelFiles, modelStats } = await import('@/lib/b2/three-viewer')
    const m = await loadModelFiles(all)
    setFiles(all); setModel(m); setStats(modelStats(m.root, m.animations.length)); setResult(null)
  })

  const convert = () => run(async () => {
    if (!model) return
    const { exportModel, EXPORT_EXT, THREE } = await import('@/lib/b2/three-viewer')
    const wrapper = new THREE.Group()
    wrapper.add(model.root.clone(true))
    const k = scale * Number(unit)
    if (k !== 1) wrapper.scale.setScalar(k)
    if (zUp) wrapper.rotation.x = -Math.PI / 2
    const outer = new THREE.Group(); outer.add(wrapper)
    if (center) { outer.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(wrapper); const c = box.getCenter(new THREE.Vector3()); wrapper.position.set(-c.x, -box.min.y, -c.z) }
    const blob = await exportModel(outer, to, model.animations)
    setResult({ blob, name: `${baseName(model.name)}.${EXPORT_EXT[to]}` })
  })

  if (!model) return (
    <div className="space-y-3">
      <Dropzone multiple onFiles={open} label="Drop a 3D model to convert" sub="GLB, GLTF, OBJ, STL, PLY, FBX, 3MF, DAE, 3DS, USDZ, AMF, VRML, OFF and more. Add textures and .mtl or .bin files together." />
      {busy && <Progress value={0.5} label="Loading model" />}
      <ErrorNote error={error} />
    </div>
  )
  const meshOnly = to.startsWith('stl')
  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <Viewer3D object={model.root} clips={model.animations} screenshotName={baseName(model.name)} height="52vh" />
          {stats && <ModelStatsGrid stats={stats} format={model.format} />}
        </>}
        side={<>
          <div>
            <Label>Convert to</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {OUTS.map((o) => <button key={o.id} onClick={() => { setTo(o.id); setResult(null) }} className={cn('rounded-lg border px-2.5 py-1.5 text-left cursor-pointer', to === o.id ? 'border-accent bg-accent/10 ring-2 ring-accent/20' : 'border-border hover:border-accent/50')}><div className="text-xs font-semibold">{o.label}</div><div className="text-[10px] text-muted">{o.sub}</div></button>)}
            </div>
          </div>
          <Field label="Unit change"><Select value={unit} onChange={setUnit} options={[{ value: '1', label: 'Keep units' }, { value: '1000', label: 'Metres to millimetres (×1000)' }, { value: '0.001', label: 'Millimetres to metres (÷1000)' }, { value: '10', label: 'Centimetres to millimetres (×10)' }, { value: '25.4', label: 'Inches to millimetres (×25.4)' }, { value: '0.0393701', label: 'Millimetres to inches' }]} /></Field>
          <Slider label="Extra scale" value={scale} onChange={setScale} min={0.1} max={10} step={0.1} suffix="×" />
          <Switch checked={center} onChange={setCenter} label="Centre on origin, sitting on the floor" />
          <Switch checked={zUp} onChange={setZUp} label="Convert Z-up to Y-up (rotate 90°)" />
          {meshOnly && <p className="flex gap-2 text-xs text-muted"><AlertTriangle className="size-4 shrink-0 text-warn" />STL keeps only geometry. Colours, textures and animations are dropped.</p>}
          {(to === 'obj') && <p className="text-xs text-muted">OBJ is saved without its .mtl file, so textures are not included. Use GLB to keep materials.</p>}
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" loading={busy} icon={<RefreshCw className="size-4" />} onClick={convert}>Convert to {OUTS.find((o) => o.id === to)!.label}</Button>
          <Button variant="ghost" className="w-full" onClick={() => { setModel(null); setFiles([]); setResult(null) }}>Start over</Button>
        </>}
      />
      {result && <ResultCard blob={result.blob} filename={result.name} originalSize={files[0]?.size} onReset={() => { setModel(null); setFiles([]); setResult(null) }} />}
    </div>
  )
}
