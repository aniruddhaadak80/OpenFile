import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button, Dropzone, Field, FileChip, Progress, Segmented, Switch, ToolGrid, ErrorNote, useJob } from '@/components/ui'
import { baseName, downloadBlob } from '@/lib/files'
import type { CadDoc } from '@/lib/b2/cad'
import { CadCanvas } from './_b2/CadCanvas'
import { LayerPanel } from './_b2/LayerPanel'

export default function DxfViewer() {
  const [file, setFile] = useState<File | null>(null)
  const [doc, setDoc] = useState<CadDoc | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [bg, setBg] = useState('#111111')
  const [mono, setMono] = useState(false)
  const [dist, setDist] = useState<number | null>(null)
  const { busy, error, run } = useJob()

  const open = (f: File) => run(async () => {
    if (/\.dwg$/i.test(f.name)) throw new Error('DWG is a closed binary format. Save or export the drawing as DXF (any version) from your CAD program, then open it here.')
    const { parseDxf } = await import('@/lib/b2/cad')
    const d = await parseDxf(await f.text())
    setFile(f); setDoc(d); setHidden(new Set())
  })

  if (!doc || !file) return (
    <div className="space-y-3">
      <Dropzone accept=".dxf,.dwg" onFiles={(f) => open(f[0])} label="Drop a DXF drawing" sub="AutoCAD DXF (ASCII, any version) · layers, zoom and measuring · never uploaded" />
      {busy && <Progress value={0.5} label="Reading drawing" />}
      <ErrorNote error={error} />
    </div>
  )
  const w = doc.bbox.maxX - doc.bbox.minX, h = doc.bbox.maxY - doc.bbox.minY
  const exportSvg = async () => { const { cadToSvg } = await import('@/lib/b2/cad'); downloadBlob(new Blob([cadToSvg(doc, { hidden, mono: mono ? (bg === '#ffffff' ? '#000000' : '#ffffff') : null, bg })], { type: 'image/svg+xml' }), `${baseName(file.name)}.svg`) }
  return (
    <ToolGrid
      main={<CadCanvas doc={doc} hidden={hidden} bg={bg} mono={mono ? (bg === '#ffffff' ? '#000000' : '#ffffff') : null} onMeasure={setDist} />}
      side={<>
        <FileChip file={file} onRemove={() => { setFile(null); setDoc(null) }} />
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          {[['Entities', doc.entityCount.toLocaleString()], ['Units', doc.units], ['Width', `${+w.toPrecision(6)}`], ['Height', `${+h.toPrecision(6)}`]].map(([k, v]) => <div key={k} className="rounded-lg border border-border bg-surface-2/50 px-2.5 py-1.5"><div className="text-muted">{k}</div><div className="font-medium">{v}</div></div>)}
          {dist !== null && <div className="col-span-2 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5"><div className="text-muted">Measured distance</div><div className="font-mono font-semibold text-accent">{+dist.toPrecision(8)} {doc.units === 'unitless' ? '' : doc.units}</div></div>}
        </div>
        {doc.space !== 'Model' && <p className="text-[11px] text-muted">{doc.space === 'Block library' ? 'This file only holds block definitions, so each block is shown on its own with its name.' : `This file has no model space drawing, so the paper layout is shown (${doc.space}).`}</p>}
        <LayerPanel layers={doc.layers} hidden={hidden} setHidden={setHidden} />
        <Field label="Background"><Segmented value={bg} onChange={setBg} options={[{ value: '#111111', label: 'Dark' }, { value: '#ffffff', label: 'Light' }, { value: '#0b2540', label: 'Blueprint' }]} /></Field>
        <Switch checked={mono} onChange={setMono} label="Single colour lines" />
        <Button variant="outline" className="w-full" icon={<Download className="size-4" />} onClick={exportSvg}>Save visible layers as SVG</Button>
        <p className="text-[11px] text-muted">Need PDF or PNG? Use CAD Converter. Text uses a generic font; hatches show as outlines.</p>
        <Button variant="ghost" className="w-full" onClick={() => { setFile(null); setDoc(null) }}>Open another drawing</Button>
      </>}
    />
  )
}
