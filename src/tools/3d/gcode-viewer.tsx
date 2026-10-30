import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Button, Dropzone, Field, Segmented, Slider, Switch, ToolGrid, useJob, Progress } from '@/components/ui'
import { downloadBlob, formatBytes } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { Viewer3D } from '@/lib/b2/Viewer3D'
import { Tile } from '@/lib/b14/ui'
import { filamentGrams, fmtDuration, parseGcode, type Gcode } from '@/lib/b14/d3'
import { toCsv } from '@/lib/bcat/kit'

type ColorBy = 'layer' | 'single'

export default function GcodeViewer() {
  const [file, setFile] = useState<File | null>(null)
  const [g, setG] = useState<Gcode | null>(null)
  const [upTo, setUpTo] = useState(0)
  const [travel, setTravel] = useState(false)
  const [colorBy, setColorBy] = useState<ColorBy>('layer')
  const [dia, setDia] = useState(175)
  const [built, setBuilt] = useState<{ root: any; ext: any; trv: any; extEnd: number[]; trvEnd: number[] } | null>(null)
  const { busy, progress, error, run } = useJob()

  const open = (f: File) => run(async (setP) => {
    if (f.size > 250 * 1024 * 1024) throw new Error('This file is over 250 MB, which is too big to draw in a browser tab.')
    setP(0.1)
    const parsed = parseGcode(await f.text())
    setP(0.7)
    setG(parsed); setFile(f); setUpTo(parsed.layers.length)
  })

  useEffect(() => {
    if (!g) return
    let dead = false
    import('@/lib/b2/three-viewer').then(({ THREE }) => {
      if (dead) return
      const nE = g.kind.reduce((a, k) => a + (k === 1 ? 1 : 0), 0), nT = g.kind.length - nE
      const pe = new Float32Array(nE * 6), ce = new Float32Array(nE * 6), pt = new Float32Array(nT * 6)
      const extEnd = new Array(g.layers.length).fill(0), trvEnd = new Array(g.layers.length).fill(0)
      const a = new THREE.Color('#14B8A6'), b = new THREE.Color('#F5A524'), single = new THREE.Color('#F5A524'), tmp = new THREE.Color()
      let ie = 0, it = 0
      const L = Math.max(1, g.layers.length - 1)
      for (let i = 0; i < g.kind.length; i++) {
        const src = g.seg.subarray(i * 6, i * 6 + 6), layer = g.layerOf[i]
        if (g.kind[i] === 1) {
          pe.set(src, ie * 6)
          if (colorBy === 'layer') tmp.copy(a).lerp(b, layer / L); else tmp.copy(single)
          for (let k = 0; k < 2; k++) { ce[ie * 6 + k * 3] = tmp.r; ce[ie * 6 + k * 3 + 1] = tmp.g; ce[ie * 6 + k * 3 + 2] = tmp.b }
          ie++; extEnd[layer] = ie
        } else { pt.set(src, it * 6); it++; trvEnd[layer] = it }
      }
      for (let l = 1; l < g.layers.length; l++) { extEnd[l] = Math.max(extEnd[l], extEnd[l - 1]); trvEnd[l] = Math.max(trvEnd[l], trvEnd[l - 1]) }
      const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.BufferAttribute(pe, 3)); ge.setAttribute('color', new THREE.BufferAttribute(ce, 3))
      const gt = new THREE.BufferGeometry(); gt.setAttribute('position', new THREE.BufferAttribute(pt, 3))
      const ext = new THREE.LineSegments(ge, new THREE.LineBasicMaterial({ vertexColors: true }))
      const trv = new THREE.LineSegments(gt, new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.35 }))
      const root = new THREE.Group(); root.add(ext, trv); root.rotation.x = -Math.PI / 2; root.name = 'toolpath'
      setBuilt({ root, ext, trv, extEnd, trvEnd })
    })
    return () => { dead = true }
  }, [g, colorBy])
  useEffect(() => {
    if (!built || !g) return
    const l = Math.max(0, Math.min(g.layers.length, upTo) - 1)
    built.ext.geometry.setDrawRange(0, (upTo === 0 ? 0 : built.extEnd[l]) * 2)
    built.trv.geometry.setDrawRange(0, (upTo === 0 ? 0 : built.trvEnd[l]) * 2)
    built.trv.visible = travel
  }, [built, upTo, travel])

  const size = useMemo(() => g ? g.bounds.max.map((v, i) => v - g.bounds.min[i]) : [0, 0, 0], [g])
  if (!file || !g) return <>
    <Dropzone accept=".gcode,.gco,.g,.nc,.ngc,.tap,.cnc,.txt" onFiles={(f) => open(f[0])} label="Drop a G-code file" sub="3D printer, CNC or laser G-code. See the toolpath layer by layer, with print time, filament use and size." />
    {busy && <div className="mt-3"><Progress value={progress} label="Reading moves" /></div>}
    {error && <p className="mt-3 text-sm text-danger">{error}</p>}
  </>
  const grams = filamentGrams(g.filament, dia / 100)
  const curZ = g.layers[Math.max(0, Math.min(g.layers.length, upTo) - 1)]?.z ?? 0
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => { setFile(null); setG(null); setBuilt(null) }} />
        <Viewer3D object={built?.root} screenshotName="toolpath" showClay={false} />
        <Slider label={`Layers shown: ${upTo} of ${g.layers.length} (Z ${curZ.toFixed(2)} mm)`} value={upTo} onChange={setUpTo} min={0} max={g.layers.length} />
      </>}
      side={<>
        <div className="grid grid-cols-2 gap-2">
          <Tile label="Type" value={g.flavor === 'printer' ? '3D print' : g.flavor === 'laser' ? 'Laser' : 'CNC'} />
          <Tile label="Layers" value={g.layers.length.toLocaleString()} />
          <Tile label="Time (estimate)" value={fmtDuration(g.seconds)} sub={g.meta['estimated printing time'] || g.meta.TIME ? `File says ${g.meta['estimated printing time'] || fmtDuration(+g.meta.TIME)}` : undefined} />
          <Tile label="Size (mm)" value={`${size[0].toFixed(0)} x ${size[1].toFixed(0)} x ${size[2].toFixed(1)}`} />
          {g.flavor === 'printer' && <Tile label="Filament" value={`${(g.filament / 1000).toFixed(2)} m`} sub={`about ${grams.toFixed(1)} g of PLA`} />}
          <Tile label={g.flavor === 'printer' ? 'Moves' : 'Cut length'} value={g.flavor === 'printer' ? g.kind.length.toLocaleString() : `${(g.extrudeLen / 1000).toFixed(2)} m`} sub={`${formatBytes(file.size)} · ${g.lines.toLocaleString()} lines`} />
        </div>
        {g.flavor === 'printer' && <Field label="Filament"><Segmented value={String(dia)} onChange={(v) => setDia(+v)} options={[{ value: '175', label: '1.75 mm' }, { value: '285', label: '2.85 mm' }]} /></Field>}
        <Field label="Colour"><Segmented value={colorBy} onChange={setColorBy} options={[{ value: 'layer', label: 'By height' }, { value: 'single', label: 'One colour' }]} /></Field>
        <Switch checked={travel} onChange={setTravel} label="Show travel moves" />
        {!!Object.keys(g.meta).length && <div className="rounded-xl border border-border bg-surface p-2 text-xs">{Object.entries(g.meta).slice(0, 8).map(([k, v]) => <div key={k} className="flex gap-2"><span className="text-muted">{k}</span><span className="ml-auto truncate font-mono">{v}</span></div>)}</div>}
        <Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([toCsv([['layer', 'z_mm', 'moves'], ...g.layers.map((l, i) => [i + 1, l.z.toFixed(3), l.end - l.start])])], { type: 'text/csv' }), 'layers.csv')}>Layer list (CSV)</Button>
        <p className="text-xs text-muted">Time is worked out from move lengths and speeds, without acceleration, so slicers often show a little more.</p>
      </>}
    />
  )
}
