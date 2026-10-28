import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Button, Field, FileChip, Input, Label, Segmented, Slider, Switch, ToolGrid, ErrorNote, useJob } from '@/components/ui'
import { baseName, downloadBlob, formatBytes } from '@/lib/files'
import { ImageDrop, useDebounced } from '@/tools/image/_img/kit'
import { Viewer3D } from '@/lib/b2/Viewer3D'
import { decodeAny } from '@/lib/b2/codecs'
import { binaryStl, heightmapSolid } from '@/lib/b2/mesh'

type Mode = 'lithophane' | 'heightmap'

/** Sample the image to a heightmap grid. Lithophane: dark = thick. Heightmap: bright = tall. */
function sample(src: HTMLCanvasElement, cols: number, rows: number, o: { mode: Mode; invert: boolean; border: number; gamma: number; smooth: number }) {
  const c = document.createElement('canvas'); c.width = cols; c.height = rows
  const ctx = c.getContext('2d')!
  if (o.smooth > 0) ctx.filter = `blur(${o.smooth}px)`
  ctx.drawImage(src, 0, 0, cols, rows)
  const d = ctx.getImageData(0, 0, cols, rows).data
  const hm = new Float32Array(cols * rows)
  const bpx = Math.round(o.border)
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = (j * cols + i) * 4
    const a = d[k + 3] / 255
    let l = ((0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]) / 255) * a + (1 - a)
    l = Math.pow(l, o.gamma)
    let h = o.mode === 'lithophane' ? 1 - l : l
    if (o.invert) h = 1 - h
    if (bpx && (i < bpx || j < bpx || i >= cols - bpx || j >= rows - bpx)) h = 1
    hm[j * cols + i] = h
  }
  return hm
}

export default function LithophaneMaker() {
  const [file, setFile] = useState<File | null>(null)
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null)
  const [mode, setMode] = useState<Mode>('lithophane')
  const [width, setWidth] = useState(100)
  const [minT, setMinT] = useState(0.8)
  const [maxT, setMaxT] = useState(3)
  const [res, setRes] = useState(5)
  const [border, setBorder] = useState(3)
  const [curve, setCurve] = useState(0)
  const [invert, setInvert] = useState(false)
  const [gamma, setGamma] = useState(1)
  const [smooth, setSmooth] = useState(0.4)
  const [obj, setObj] = useState<any>(null)
  const { busy, error, run } = useJob()

  const open = (fs: File[]) => run(async () => { const { canvas } = await decodeAny(fs[0]); setFile(fs[0]); setSrc(canvas) })
  const grid = (preview: boolean) => {
    if (!src) return { cols: 2, rows: 2 }
    const r = preview ? Math.min(res, 2.2) : res
    let cols = Math.max(8, Math.round(width * r)), rows = Math.max(8, Math.round(cols * src.height / src.width))
    const cap = preview ? 60000 : 1_500_000
    if (cols * rows > cap) { const k = Math.sqrt(cap / (cols * rows)); cols = Math.round(cols * k); rows = Math.round(rows * k) }
    return { cols, rows }
  }
  const params = useDebounced([src, mode, width, minT, maxT, res, border, curve, invert, gamma, smooth], 200)
  useEffect(() => {
    if (!src) return
    let dead = false
    import('@/lib/b2/three-viewer').then(({ THREE }) => {
      if (dead) return
      const { cols, rows } = grid(true)
      const hm = sample(src, cols, rows, { mode, invert, border: (border / width) * cols, gamma, smooth })
      const tris = heightmapSolid(hm, cols, rows, { width, minT, maxT: Math.max(minT + 0.05, maxT), curve })
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(tris, 3)); g.computeVertexNormals()
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.7, side: THREE.DoubleSide }))
      m.rotation.x = -Math.PI / 2
      const grp = new THREE.Group(); grp.add(m); setObj(grp)
    })
    return () => { dead = true }
  }, params)

  const size = useMemo(() => { const { cols, rows } = grid(false); return { cols, rows, tris: ((cols - 1) * (rows - 1) * 4 + (cols + rows) * 4), h: src ? width * src.height / src.width : 0 } }, [src, width, res])

  const save = () => run(async () => {
    if (!src || !file) return
    const { cols, rows } = grid(false)
    const hm = sample(src, cols, rows, { mode, invert, border: (border / width) * cols, gamma, smooth: smooth * (cols / grid(true).cols) })
    const tris = heightmapSolid(hm, cols, rows, { width, minT, maxT: Math.max(minT + 0.05, maxT), curve })
    downloadBlob(binaryStl(tris, `OpenFile ${mode}`), `${baseName(file.name)}-${mode}.stl`, 'model/stl')
  })

  if (!src || !file) return <div className="space-y-3"><ImageDrop multiple={false} onFiles={open} label="Drop a photo to turn into a lithophane" sub="Portraits and high-contrast photos work best · creates a printable STL" /><ErrorNote error={error} /></div>
  return (
    <ToolGrid
      main={<>
        <Viewer3D keepCamera object={obj} screenshotName={`${baseName(file.name)}-${mode}`} height="56vh" />
        <FileChip file={file} onRemove={() => { setFile(null); setSrc(null); setObj(null) }} extra={<span className="text-xs text-muted">{width} × {size.h.toFixed(1)} mm</span>} />
        <p className="text-xs text-muted">The preview uses a lower resolution. The STL uses {size.cols}×{size.rows} points (about {(size.tris / 1000).toFixed(0)}k triangles, {formatBytes(size.tris * 50)}).</p>
      </>}
      side={<>
        <Field label="Type"><Segmented value={mode} onChange={setMode} options={[{ value: 'lithophane', label: 'Lithophane (backlit)' }, { value: 'heightmap', label: 'Relief / heightmap' }]} /></Field>
        <Field label="Width (mm)"><Input type="number" min={10} max={400} value={width} onChange={(e) => setWidth(Math.max(10, Number(e.target.value)))} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Thinnest (mm)"><Input type="number" step={0.1} min={0.2} value={minT} onChange={(e) => setMinT(Number(e.target.value))} /></Field>
          <Field label="Thickest (mm)"><Input type="number" step={0.1} min={0.5} value={maxT} onChange={(e) => setMaxT(Number(e.target.value))} /></Field>
        </div>
        <Slider label="Detail (points per mm)" value={res} onChange={setRes} min={1} max={10} step={0.5} />
        <Slider label="Frame" value={border} onChange={setBorder} min={0} max={15} suffix=" mm" />
        <Slider label="Curve" value={curve} onChange={setCurve} min={0} max={180} step={5} suffix="°" />
        <Slider label="Contrast curve" value={gamma} onChange={setGamma} min={0.4} max={2.5} step={0.05} />
        <Slider label="Smoothing" value={smooth} onChange={setSmooth} min={0} max={3} step={0.1} suffix=" px" />
        <Switch checked={invert} onChange={setInvert} label="Invert" />
        <ErrorNote error={error} />
        <Button size="lg" className="w-full" loading={busy} icon={<Download className="size-4" />} onClick={save}>Download STL</Button>
        <Label>Print tips</Label>
        <ul className="list-disc space-y-1 pl-4 text-xs text-muted"><li>Print standing up in white PLA, 100% infill.</li><li>Use a 0.1 to 0.12 mm layer height for fine detail.</li><li>Hold it in front of a light to see the picture.</li></ul>
      </>}
    />
  )
}
