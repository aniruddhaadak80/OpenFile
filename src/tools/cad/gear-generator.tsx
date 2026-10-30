import { useMemo, useState } from 'react'
import { Cog, Download } from 'lucide-react'
import { Button, Field, Input, Select, ToolGrid } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { gear, gearInfo, writeDxf, writeSvg } from '@/lib/b14/cad'
import { SvgPreview, Tile } from '@/lib/b14/ui'

export default function GearGenerator() {
  const [teeth, setTeeth] = useState(24)
  const [mod, setMod] = useState(2)
  const [pa, setPa] = useState('20')
  const [bore, setBore] = useState(6)
  const [back, setBack] = useState(0.1)
  const [mate, setMate] = useState(12)
  const g = useMemo(() => gear({ teeth, module: mod, pressure: +pa, bore, backlash: back, steps: 12 }), [teeth, mod, pa, bore, back])
  const info = gearInfo({ teeth, module: mod, pressure: +pa, bore })
  const svg = writeSvg([g.outline], g.bore ? [g.bore] : [], { stroke: Math.max(0.15, info.outsideDiameter / 400) })
  const name = `gear-${teeth}t-m${mod}`
  const center = (mod * (teeth + mate)) / 2
  return (
    <ToolGrid
      main={<>
        <SvgPreview svg={svg} label="Gear preview" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Pitch diameter" value={`${info.pitchDiameter.toFixed(2)} mm`} />
          <Tile label="Outside diameter" value={`${info.outsideDiameter.toFixed(2)} mm`} />
          <Tile label="Root diameter" value={`${info.rootDiameter.toFixed(2)} mm`} />
          <Tile label="Circular pitch" value={`${info.circularPitch.toFixed(3)} mm`} />
        </div>
        <p className="text-sm text-muted">To mesh with a {mate} tooth gear of the same module, place the centres <b className="text-fg">{center.toFixed(2)} mm</b> apart (ratio {(teeth / mate).toFixed(3)} : 1).</p>
      </>}
      side={<>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Teeth"><Input type="number" min={6} max={300} value={teeth} onChange={(e) => setTeeth(Math.min(300, Math.max(6, Math.round(+e.target.value || 6))))} /></Field>
          <Field label="Module (mm)"><Input type="number" min={0.2} max={20} step={0.1} value={mod} onChange={(e) => setMod(Math.min(20, Math.max(0.2, +e.target.value || 1)))} /></Field>
          <Field label="Bore (mm)"><Input type="number" min={0} step={0.5} value={bore} onChange={(e) => setBore(Math.max(0, +e.target.value || 0))} /></Field>
          <Field label="Backlash (mm)"><Input type="number" min={0} max={1} step={0.05} value={back} onChange={(e) => setBack(Math.min(1, Math.max(0, +e.target.value || 0)))} /></Field>
        </div>
        <Field label="Pressure angle"><Select value={pa} onChange={setPa} options={[{ value: '20', label: '20° (standard)' }, { value: '14.5', label: '14.5° (older gears)' }, { value: '25', label: '25° (strong teeth)' }]} /></Field>
        <Field label="Mating gear teeth (for centre distance)"><Input type="number" min={6} value={mate} onChange={(e) => setMate(Math.max(6, Math.round(+e.target.value || 6)))} /></Field>
        <Button className="w-full" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([writeDxf([g.outline], g.bore ? [g.bore] : [])], { type: 'application/dxf' }), `${name}.dxf`)}>Download DXF</Button>
        <Button className="w-full" variant="outline" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([writeSvg([g.outline], g.bore ? [g.bore] : [], { stroke: 0.1 })], { type: 'image/svg+xml' }), `${name}.svg`)}>Download SVG (mm)</Button>
        <p className="flex gap-1.5 text-xs text-muted"><Cog className="size-4 shrink-0" />True involute teeth, for laser cutting, CNC or extruding to 3D. Two gears mesh when they share the same module and pressure angle.</p>
      </>}
    />
  )
}
