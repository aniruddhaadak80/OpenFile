import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, AlertTriangle, Wrench, Download } from 'lucide-react'
import { Button, Dropzone, Field, FileChip, Label, Progress, Segmented, Select, Slider, Switch, ToolGrid, ErrorNote, cn, useJob } from '@/components/ui'
import { baseName, downloadBlob, formatBytes } from '@/lib/files'
import { Viewer3D } from '@/lib/b2/Viewer3D'
import { analyseMesh, binaryStl, flipWinding, removeDegenerate, transformTris, unweldMesh, weldMesh, type MeshReport, type Tri } from '@/lib/b2/mesh'

const UNITS = [{ value: 'mm', label: 'Millimetres', k: 1 }, { value: 'cm', label: 'Centimetres', k: 10 }, { value: 'm', label: 'Metres', k: 1000 }, { value: 'in', label: 'Inches', k: 25.4 }]
const DENSITY: Record<string, number> = { PLA: 1.24, PETG: 1.27, ABS: 1.04, TPU: 1.21, Resin: 1.15, Nylon: 1.14 }

export default function StlInspector() {
  const [file, setFile] = useState<File | null>(null)
  const [tris, setTris] = useState<Tri | null>(null)
  const [orig, setOrig] = useState<Tri | null>(null)
  const [report, setReport] = useState<MeshReport | null>(null)
  const [unit, setUnit] = useState('mm')
  const [material, setMaterial] = useState('PLA')
  const [infill, setInfill] = useState(20)
  const [ratio, setRatio] = useState(50)
  const [obj, setObj] = useState<any>(null)
  const [log, setLog] = useState<string[]>([])
  const { busy, progress, error, run } = useJob()

  const open = (fs: File[]) => run(async (setP) => {
    const { loadModelFiles, THREE } = await import('@/lib/b2/three-viewer')
    const m = await loadModelFiles(fs)
    setP(0.5)
    m.root.updateMatrixWorld(true)
    const parts: number[][] = []
    m.root.traverse((o: any) => {
      if (!o.isMesh) return
      const g = (o.geometry as any).index ? o.geometry.toNonIndexed() : o.geometry
      const p = g.attributes.position, v = new THREE.Vector3(), arr = new Array(p.count * 3)
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z }
      parts.push(arr)
    })
    if (!parts.length) throw new Error('No triangle meshes found in this file.')
    const t = Float32Array.from(parts.flat())
    setFile(fs[0]); setOrig(t); setTris(t); setLog([])
  })

  useEffect(() => {
    if (!tris) return
    setReport(analyseMesh(tris))
    let dead = false
    import('@/lib/b2/three-viewer').then(({ THREE }) => {
      if (dead) return
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(tris, 3)); g.computeVertexNormals()
      const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x2dd4bf, roughness: 0.55, metalness: 0.05 }))
      mesh.rotation.x = -Math.PI / 2 // STL is Z-up
      const grp = new THREE.Group(); grp.add(mesh); setObj(grp)
    })
    return () => { dead = true }
  }, [tris])

  const k = UNITS.find((u) => u.value === unit)!.k
  const derived = useMemo(() => {
    if (!report) return null
    const volCm3 = (report.volume * k ** 3) / 1000
    const shellFrac = Math.min(1, (report.area * k * k * 1.2) / Math.max(1, report.volume * k ** 3)) // ~1.2 mm walls
    const filled = volCm3 * (shellFrac + (1 - shellFrac) * (infill / 100))
    return { volCm3, areaCm2: (report.area * k * k) / 100, grams: filled * DENSITY[material], size: report.bbox.max.map((v, i) => (v - report.bbox.min[i]) * k) }
  }, [report, k, material, infill])

  const apply = (label: string, f: (t: Tri) => Tri | Promise<Tri>) => run(async () => { if (!tris) return; const out = await f(tris); setTris(out); setLog((l) => [...l, label]) })
  const decimate = () => apply(`Reduced triangles to about ${ratio}%`, async (t) => {
    const { MeshoptSimplifier } = await import('meshoptimizer/simplifier')
    await MeshoptSimplifier.ready
    const { positions, indices } = weldMesh(t)
    const target = Math.max(3, Math.floor((indices.length * ratio) / 100 / 3) * 3)
    const [out] = MeshoptSimplifier.simplify(indices, positions, 3, target, 0.05, ['LockBorder'])
    return unweldMesh(positions, out)
  })

  if (!tris || !file || !report || !derived) return (
    <div className="space-y-3">
      <Dropzone multiple accept=".stl,.obj,.ply,.3mf,.off,.amf,.glb,.gltf" onFiles={open} label="Drop an STL (or OBJ, PLY, 3MF) to check before printing" sub="Volume, size, weight estimate, watertight check and quick fixes" />
      {busy && <Progress value={progress} label="Reading model" />}
      <ErrorNote error={error} />
    </div>
  )
  const issues = [
    !report.watertight && `${report.boundaryEdges.toLocaleString()} open edges (holes)`,
    report.nonManifoldEdges > 0 && `${report.nonManifoldEdges.toLocaleString()} non-manifold edges`,
    report.degenerate > 0 && `${report.degenerate.toLocaleString()} zero-area triangles`,
    report.flippedHint && 'Normals point inward (model is inside out)',
  ].filter(Boolean) as string[]
  return (
    <ToolGrid
      main={<>
        <Viewer3D keepCamera object={obj} screenshotName={baseName(file.name)} height="54vh" />
        <div className="grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-4">
          {[['Size', derived.size.map((v) => v.toFixed(1)).join(' × ') + ' mm'], ['Volume', `${derived.volCm3.toFixed(2)} cm³`], ['Surface', `${derived.areaCm2.toFixed(1)} cm²`], ['Est. weight', `${derived.grams.toFixed(1)} g ${material}`], ['Triangles', report.triangles.toLocaleString()], ['Vertices', report.vertices.toLocaleString()], ['Shells', String(report.shells)], ['STL size', formatBytes(84 + report.triangles * 50)]].map(([a, b]) => <div key={a} className="rounded-lg border border-border bg-surface-2/50 px-2.5 py-1.5"><div className="text-muted">{a}</div><div className="font-medium">{b}</div></div>)}
        </div>
      </>}
      side={<>
        <FileChip file={file} onRemove={() => { setFile(null); setTris(null) }} />
        <div className={cn('rounded-xl border p-3 text-sm', issues.length ? 'border-warn/40 bg-warn/10' : 'border-success/40 bg-success/10')}>
          <div className={cn('flex items-center gap-2 font-semibold', issues.length ? 'text-warn' : 'text-success')}>{issues.length ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}{issues.length ? 'Needs attention' : 'Watertight and ready to slice'}</div>
          {issues.length > 0 && <ul className="mt-1.5 list-disc pl-5 text-xs">{issues.map((i) => <li key={i}>{i}</li>)}</ul>}
        </div>
        <Field label="File units"><Select value={unit} onChange={setUnit} options={UNITS.map((u) => ({ value: u.value, label: u.label }))} /></Field>
        <div className="grid grid-cols-2 gap-2"><Field label="Material"><Select value={material} onChange={setMaterial} options={Object.keys(DENSITY)} /></Field><Slider label="Infill" value={infill} onChange={setInfill} min={0} max={100} suffix="%" /></div>
        <div className="space-y-2">
          <Label>Fixes</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" icon={<Wrench className="size-3.5" />} onClick={() => apply('Flipped normals', flipWinding)}>Flip normals</Button>
            <Button size="sm" variant="outline" icon={<Wrench className="size-3.5" />} disabled={!report.degenerate} onClick={() => apply('Removed zero-area triangles', removeDegenerate)}>Remove bad triangles</Button>
            <Button size="sm" variant="outline" onClick={() => apply('Placed on the build plate', (t) => { const r = analyseMesh(t); const cx = (r.bbox.min[0] + r.bbox.max[0]) / 2, cy = (r.bbox.min[1] + r.bbox.max[1]) / 2; return transformTris(t, (x, y, z) => [x - cx, y - cy, z - r.bbox.min[2]]) })}>Centre on plate</Button>
            <Button size="sm" variant="outline" onClick={() => apply(`Scaled from ${unit} to mm`, (t) => transformTris(t, (x, y, z) => [x * k, y * k, z * k]))} disabled={k === 1}>Convert to mm</Button>
          </div>
          <Slider label="Keep triangles" value={ratio} onChange={setRatio} min={5} max={95} suffix="%" />
          <Button size="sm" variant="outline" className="w-full" loading={busy} onClick={decimate}>Reduce triangles (simplify)</Button>
          {log.length > 0 && <div className="rounded-lg bg-surface-2/50 p-2 text-[11px] text-muted">{log.map((l, i) => <div key={i}>✓ {l}</div>)}<button className="mt-1 underline cursor-pointer" onClick={() => { setTris(orig); setLog([]) }}>Undo all</button></div>}
        </div>
        <ErrorNote error={error} />
        <Button size="lg" className="w-full" icon={<Download className="size-4" />} onClick={() => downloadBlob(binaryStl(tris), `${baseName(file.name)}${log.length ? '-fixed' : ''}.stl`, 'model/stl')}>Download STL</Button>
        <p className="text-[11px] text-muted">Weight is an estimate based on volume, about 1.2 mm walls and your infill. Holes are reported but not filled automatically.</p>
      </>}
    />
  )
}
