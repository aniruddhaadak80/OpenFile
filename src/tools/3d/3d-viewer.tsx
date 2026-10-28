import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button, Dropzone, FileChip, Label, Progress, ToolGrid, ErrorNote, useJob } from '@/components/ui'
import { baseName } from '@/lib/files'
import { Viewer3D } from '@/lib/b2/Viewer3D'
import { ModelStatsGrid } from '@/lib/b2/ModelStats'
import type { Loaded, Stats } from '@/lib/b2/three-viewer'

export const FORMATS_TEXT = 'GLB, GLTF, OBJ + MTL, STL, PLY, FBX, 3MF, DAE, 3DS, USDZ, AMF, VRML, OFF, PCD, XYZ, VTK, KMZ, LWO, G-code'

export default function ThreeDViewer() {
  const [files, setFiles] = useState<File[]>([])
  const [model, setModel] = useState<Loaded | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const { busy, error, run } = useJob()

  const open = (fs: File[]) => run(async () => {
    const all = [...files, ...fs]
    const { loadModelFiles, modelStats, MODEL_ACCEPT } = await import('@/lib/b2/three-viewer')
    void MODEL_ACCEPT
    const m = await loadModelFiles(all)
    setFiles(all); setModel(m); setStats(modelStats(m.root, m.animations.length))
  })

  if (!model) return (
    <div className="space-y-3">
      <Dropzone multiple onFiles={open} label="Drop a 3D model" sub={<>{FORMATS_TEXT}. For glTF or OBJ, drop the textures, .bin and .mtl files together with the model.</>} />
      {busy && <Progress value={0.5} label="Loading model" />}
      <ErrorNote error={error} />
    </div>
  )
  return (
    <ToolGrid
      main={<Viewer3D object={model.root} clips={model.animations} screenshotName={baseName(model.name)} />}
      side={<>
        <div className="space-y-1.5">{files.map((f) => <FileChip key={f.name} file={f} />)}</div>
        {stats && <div><Label>Model info</Label><ModelStatsGrid stats={stats} format={model.format} /></div>}
        {model.warnings.map((w) => <p key={w} className="flex gap-2 rounded-xl border border-warn/30 bg-warn/10 p-2.5 text-xs text-warn"><AlertTriangle className="size-4 shrink-0" />{w}</p>)}
        <Dropzone compact multiple onFiles={open} label="Add textures or linked files" sub="They are matched by file name" />
        <ErrorNote error={error} />
        <p className="text-xs text-muted">Use the camera button in the viewer to save a PNG screenshot at twice the screen resolution.</p>
        <Button variant="ghost" className="w-full" onClick={() => { setFiles([]); setModel(null); setStats(null) }}>Open another model</Button>
      </>}
    />
  )
}
