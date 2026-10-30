import { useMemo, useState } from 'react'
import { Box, Download } from 'lucide-react'
import { Button, Field, Input, Segmented, Switch, ToolGrid } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { box, writeDxf, writeSvg } from '@/lib/b14/cad'
import { SvgPreview, Tile } from '@/lib/b14/ui'

export default function LaserBoxMaker() {
  const [w, setW] = useState(120)
  const [d, setD] = useState(80)
  const [h, setH] = useState(60)
  const [t, setT] = useState(3)
  const [finger, setFinger] = useState(10)
  const [kerf, setKerf] = useState(0.1)
  const [lid, setLid] = useState(true)
  const [outside, setOutside] = useState<'outside' | 'inside'>('outside')
  const res = useMemo(() => { try { return { ...box({ width: w, depth: d, height: h, thickness: t, finger, kerf, lid, outside: outside === 'outside', gap: 6 }), error: null as string | null } } catch (e: any) { return { panels: [], size: { w: 0, h: 0 }, error: e.message as string } } }, [w, d, h, t, finger, kerf, lid, outside])
  const polys = res.panels.map((p) => p.poly)
  const svg = polys.length ? writeSvg(polys, [], { stroke: 0.3 }) : ''
  const num = (set: (n: number) => void, min: number, max: number) => (e: React.ChangeEvent<HTMLInputElement>) => set(Math.min(max, Math.max(min, +e.target.value || min)))
  const name = `box-${w}x${d}x${h}-${t}mm`
  return (
    <ToolGrid
      main={<>
        <SvgPreview svg={svg} label="Box panels preview" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Tile label="Panels" value={res.panels.length} /><Tile label="Sheet needed" value={`${Math.ceil(res.size.w)} x ${Math.ceil(res.size.h)} mm`} /><Tile label="Inside" value={outside === 'outside' ? `${w - 2 * t} x ${d - 2 * t} x ${h - (lid ? 2 : 1) * t}` : `${w} x ${d} x ${h}`} sub="mm" /><Tile label="Finger" value={`${finger} mm`} /></div>
        <p className="text-xs text-muted">Panels from left: bottom{lid ? ', lid' : ''}, front, back, then the two sides below. Fingers are spread evenly so both ends of every edge match.</p>
      </>}
      side={<>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Width"><Input type="number" min={20} max={2000} value={w} onChange={num(setW, 20, 2000)} /></Field>
          <Field label="Depth"><Input type="number" min={20} max={2000} value={d} onChange={num(setD, 20, 2000)} /></Field>
          <Field label="Height"><Input type="number" min={20} max={2000} value={h} onChange={num(setH, 20, 2000)} /></Field>
        </div>
        <Field label="Sizes are"><Segmented value={outside} onChange={setOutside} options={[{ value: 'outside', label: 'Outside' }, { value: 'inside', label: 'Inside' }]} /></Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Material"><Input type="number" min={0.5} max={30} step={0.1} value={t} onChange={num(setT, 0.5, 30)} /></Field>
          <Field label="Finger"><Input type="number" min={2} max={100} value={finger} onChange={num(setFinger, 2, 100)} /></Field>
          <Field label="Kerf"><Input type="number" min={0} max={1} step={0.01} value={kerf} onChange={(e) => setKerf(Math.min(1, Math.max(0, +e.target.value || 0)))} /></Field>
        </div>
        <Switch checked={lid} onChange={setLid} label="Closed box with lid" />
        <Button className="w-full" icon={<Download className="size-4" />} disabled={!polys.length} onClick={() => downloadBlob(new Blob([writeSvg(polys, [], { stroke: 0.1 })], { type: 'image/svg+xml' }), `${name}.svg`)}>Download SVG (mm)</Button>
        <Button className="w-full" variant="outline" icon={<Download className="size-4" />} disabled={!polys.length} onClick={() => downloadBlob(new Blob([writeDxf(polys)], { type: 'application/dxf' }), `${name}.dxf`)}>Download DXF</Button>
        <p className="flex gap-1.5 text-xs text-muted"><Box className="size-4 shrink-0" />All sizes in mm. Kerf is the width your laser burns away (about 0.1 to 0.2 mm), so fingers come out snug. Do a small test cut first.</p>
      </>}
    />
  )
}
