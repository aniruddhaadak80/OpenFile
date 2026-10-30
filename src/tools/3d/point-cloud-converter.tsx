import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Button, Dropzone, Field, Progress, Segmented, Select, Slider, Switch, ToolGrid, useJob } from '@/components/ui'
import { baseName, downloadBlob, formatBytes } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { Viewer3D } from '@/lib/b2/Viewer3D'
import { Tile } from '@/lib/b14/ui'
import { cloudBounds, everyNth, parseCloud, recenter, voxelDown, writeCloud, type Cloud, type CloudOut } from '@/lib/b14/d3'

const OUTS: { value: CloudOut; label: string; ext: string }[] = [
  { value: 'ply', label: 'PLY (binary)', ext: 'ply' }, { value: 'ply-ascii', label: 'PLY (text)', ext: 'ply' },
  { value: 'las', label: 'LAS 1.2', ext: 'las' }, { value: 'pcd-binary', label: 'PCD (binary)', ext: 'pcd' }, { value: 'pcd', label: 'PCD (text)', ext: 'pcd' },
  { value: 'xyz', label: 'XYZ', ext: 'xyz' }, { value: 'csv', label: 'CSV', ext: 'csv' },
]
type Thin = 'none' | 'nth' | 'voxel'
type ColorMode = 'rgb' | 'height' | 'intensity' | 'single'

export default function PointCloudConverter() {
  const [file, setFile] = useState<File | null>(null)
  const [cloud, setCloud] = useState<Cloud | null>(null)
  const [thin, setThin] = useState<Thin>('none')
  const [nth, setNth] = useState(2)
  const [voxel, setVoxel] = useState(1)
  const [center, setCenter] = useState(false)
  const [zUp, setZUp] = useState(true)
  const [colorMode, setColorMode] = useState<ColorMode>('rgb')
  const [pointSize, setPointSize] = useState(2)
  const [out, setOut] = useState<CloudOut>('ply')
  const [obj, setObj] = useState<any>(null)
  const { busy, progress, error, run } = useJob()

  const open = (f: File) => run(async (setP) => {
    setP(0.2)
    const c = parseCloud(f.name, await f.arrayBuffer())
    setCloud(c); setFile(f); setColorMode(c.col ? 'rgb' : c.intensity ? 'intensity' : 'height')
    const b = cloudBounds(c), diag = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2])
    setVoxel(+(diag / 200).toPrecision(2) || 0.01)
    setCenter(Math.max(...b.max.map(Math.abs)) > 10000)
    setZUp(f.name.toLowerCase().endsWith('.las') || f.name.toLowerCase().endsWith('.xyz') || f.name.toLowerCase().endsWith('.pts'))
  })
  const result = useMemo(() => {
    if (!cloud) return null
    let c = thin === 'nth' ? everyNth(cloud, nth) : thin === 'voxel' ? voxelDown(cloud, voxel) : cloud
    if (center) c = recenter(c).cloud
    return c
  }, [cloud, thin, nth, voxel, center])

  useEffect(() => {
    if (!result) return
    let dead = false
    import('@/lib/b2/three-viewer').then(({ THREE }) => {
      if (dead) return
      // the preview draws at most 1.5 million points, the file keeps them all
      const view = result.count > 1_500_000 ? everyNth(result, Math.ceil(result.count / 1_500_000)) : result
      const src = center ? view : recenter(view).cloud
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(src.pos, 3))
      const col = new Float32Array(view.count * 3)
      const b = cloudBounds(view)
      const lo = new THREE.Color('#14B8A6'), hi = new THREE.Color('#F5A524'), t = new THREE.Color()
      let imax = 1; if (view.intensity) for (let i = 0; i < view.count; i++) if (view.intensity[i] > imax) imax = view.intensity[i]
      const axis = zUp ? 2 : 1, span = Math.max(1e-9, b.max[axis] - b.min[axis])
      for (let i = 0; i < view.count; i++) {
        if (colorMode === 'rgb' && view.col) { col[i * 3] = view.col[i * 3] / 255; col[i * 3 + 1] = view.col[i * 3 + 1] / 255; col[i * 3 + 2] = view.col[i * 3 + 2] / 255; continue }
        if (colorMode === 'intensity' && view.intensity) { const k = Math.min(1, view.intensity[i] / imax); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0.15 + 0.85 * k; continue }
        if (colorMode === 'single') { col[i * 3] = 0.96; col[i * 3 + 1] = 0.65; col[i * 3 + 2] = 0.14; continue }
        t.copy(lo).lerp(hi, (view.pos[i * 3 + axis] - b.min[axis]) / span); col[i * 3] = t.r; col[i * 3 + 1] = t.g; col[i * 3 + 2] = t.b
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3))
      g.computeBoundingSphere()
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: pointSize, sizeAttenuation: false, vertexColors: true }))
      if (zUp) pts.rotation.x = -Math.PI / 2
      setObj(pts)
    })
    return () => { dead = true }
  }, [result, colorMode, zUp, pointSize])

  if (!file || !cloud || !result) return <>
    <Dropzone accept=".ply,.pcd,.las,.xyz,.pts,.txt,.csv,.asc,.laz" onFiles={(f) => open(f[0])} label="Drop a point cloud" sub="PLY, LAS, PCD, XYZ, PTS, CSV or TXT from a 3D scanner, phone LiDAR app or drone survey. View it, thin it out and save it in another format." />
    {busy && <div className="mt-3"><Progress value={progress} label="Reading points" /></div>}
    {error && <p className="mt-3 text-sm text-danger">{error}</p>}
  </>
  const b = cloudBounds(result)
  const o = OUTS.find((x) => x.value === out)!
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => { setFile(null); setCloud(null); setObj(null) }} />
        <Viewer3D object={obj} screenshotName={baseName(file.name)} showClay={false} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Points" value={result.count.toLocaleString()} sub={result.count !== cloud.count ? `from ${cloud.count.toLocaleString()}` : cloud.format.toUpperCase()} />
          <Tile label="Colour" value={cloud.col ? 'RGB' : 'None'} sub={cloud.intensity ? 'with intensity' : undefined} />
          <Tile label="Size X x Y" value={`${(b.max[0] - b.min[0]).toFixed(2)} x ${(b.max[1] - b.min[1]).toFixed(2)}`} />
          <Tile label="Size Z" value={(b.max[2] - b.min[2]).toFixed(2)} sub={cloud.comments[0]} />
        </div>
      </>}
      side={<>
        <Field label="Colour by"><Select value={colorMode} onChange={setColorMode} options={[...(cloud.col ? [{ value: 'rgb' as const, label: 'Scan colours' }] : []), { value: 'height', label: 'Height' }, ...(cloud.intensity ? [{ value: 'intensity' as const, label: 'Intensity' }] : []), { value: 'single', label: 'One colour' }]} /></Field>
        <Slider label="Point size" value={pointSize} onChange={setPointSize} min={1} max={8} suffix=" px" />
        <Switch checked={zUp} onChange={setZUp} label="Z axis points up" />
        <Field label="Thin out"><Segmented value={thin} onChange={setThin} options={[{ value: 'none', label: 'Keep all' }, { value: 'nth', label: 'Every Nth' }, { value: 'voxel', label: 'Grid' }]} /></Field>
        {thin === 'nth' && <Slider label="Keep one point in" value={nth} onChange={setNth} min={2} max={50} />}
        {thin === 'voxel' && <Field label={`Grid cell size (${voxel})`}><Slider ariaLabel="Grid cell size" value={Math.log10(voxel) * 100} onChange={(v) => setVoxel(+Math.pow(10, v / 100).toPrecision(2))} min={-300} max={300} /></Field>}
        <Switch checked={center} onChange={setCenter} label="Move to the origin (large survey numbers)" />
        <Field label="Save as"><Select value={out} onChange={setOut} options={OUTS.map(({ value, label }) => ({ value, label }))} /></Field>
        <Button size="lg" className="w-full" icon={<Download className="size-5" />} onClick={() => { const bytes = writeCloud(result, out); downloadBlob(new Blob([bytes as BlobPart]), `${baseName(file.name)}${result.count !== cloud.count ? '-thin' : ''}.${o.ext}`) }}>Download {o.label}</Button>
        <p className="text-xs text-muted">Source {formatBytes(file.size)}. LAZ (compressed LAS) and compressed PCD need to be unpacked first. Faces in PLY meshes are dropped: this tool keeps points.</p>
      </>}
    />
  )
}
