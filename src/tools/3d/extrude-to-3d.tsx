import { useEffect, useState } from 'react'
import { Box } from 'lucide-react'
import { Button, Dropzone, Field, Input, Progress, Select, Slider, Switch, ToolGrid, useJob } from '@/components/ui'
import { baseName, downloadBlob, loadImage } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { Viewer3D } from '@/lib/b2/Viewer3D'
import type { ExportFmt } from '@/lib/b2/three-viewer'
import { Tile } from '@/lib/b14/ui'

const SAMPLE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 8 L61 38 L93 38 L67 57 L77 88 L50 69 L23 88 L33 57 L7 38 L39 38 Z" fill="#F5A524"/></svg>'

/** Trace a picture into a black and white SVG (dark parts become solid). */
async function traceImage(f: File, threshold: number, invert: boolean): Promise<string> {
  const img = await loadImage(f)
  const s = Math.min(1, 700 / Math.max(img.naturalWidth, img.naturalHeight))
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s)
  const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height)
  const d = ctx.getImageData(0, 0, c.width, c.height)
  for (let i = 0; i < d.data.length; i += 4) { const l = d.data[i] * 0.299 + d.data[i + 1] * 0.587 + d.data[i + 2] * 0.114; const on = invert ? l > threshold : l < threshold; const v = on ? 0 : 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255 }
  // @ts-ignore, imagetracerjs ships without types
  const { default: tracer }: any = await import('imagetracerjs')
  const svg: string = tracer.imagedataToSVG(d, { numberofcolors: 2, colorquantcycles: 1, pathomit: 12, ltres: 1, qtres: 1, blurradius: 0, strokewidth: 0, linefilter: true, roundcoords: 1 })
  // keep only the dark paths
  return svg.replace(/<path[^>]*fill="rgb\((\d+),(\d+),(\d+)\)"[^>]*\/>/g, (m, r) => (+r > 128 ? '' : m))
}

export default function ExtrudeTo3d() {
  const [file, setFile] = useState<File | null>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const [depth, setDepth] = useState(5)
  const [width, setWidth] = useState(80)
  const [bevel, setBevel] = useState(0.4)
  const [base, setBase] = useState(0)
  const [smooth, setSmooth] = useState(12)
  const [keepColor, setKeepColor] = useState(true)
  const [threshold, setThreshold] = useState(128)
  const [invert, setInvert] = useState(false)
  const [fmt, setFmt] = useState<ExportFmt>('stl')
  const [obj, setObj] = useState<any>(null)
  const [stats, setStats] = useState<{ tris: number; w: number; h: number; d: number; shapes: number } | null>(null)
  const { busy, progress, error, run } = useJob()

  const open = (f: File) => run(async () => {
    setFile(f)
    if (/svg/i.test(f.type) || /\.svg$/i.test(f.name)) setSvg(await f.text())
    else setSvg(await traceImage(f, threshold, invert))
  })
  useEffect(() => { if (file && !/\.svg$/i.test(file.name)) run(async () => setSvg(await traceImage(file, threshold, invert))) }, [threshold, invert])

  useEffect(() => {
    if (!svg) return
    let dead = false
    ;(async () => {
      const { THREE } = await import('@/lib/b2/three-viewer')
      const { SVGLoader } = await import('three/examples/jsm/loaders/SVGLoader.js')
      const { mergeGeometries } = await import('three/examples/jsm/utils/BufferGeometryUtils.js')
      const data = new SVGLoader().parse(svg)
      const groups = new Map<string, any[]>()
      let shapes = 0
      for (const p of data.paths) {
        const style: any = (p as any).userData?.style ?? {}
        if (style.fill === 'none' && !(p as any).subPaths?.length) continue
        if (style.fill === 'none') continue
        const color = keepColor && style.fill && style.fill !== 'none' ? new THREE.Color().setStyle(style.fill).getHexString() : 'f5a524'
        for (const sh of SVGLoader.createShapes(p)) {
          shapes++
          const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: smooth })
          if (!groups.has(color)) groups.set(color, [])
          groups.get(color)!.push(g)
        }
      }
      if (!shapes) throw new Error('No filled shapes found. Outlines without fill cannot be extruded, so fill them or use a picture.')
      // size: scale the outline to the chosen width, then set the real depth
      const all = new THREE.Box3()
      groups.forEach((gs) => gs.forEach((g) => { g.computeBoundingBox(); all.union(g.boundingBox!) }))
      const sz = all.getSize(new THREE.Vector3()), k = width / Math.max(1e-6, sz.x)
      const root = new THREE.Group(); root.name = 'extruded'
      let tris = 0
      groups.forEach((gs, color) => {
        const merged = mergeGeometries(gs.map((g) => g.toNonIndexed ? g.toNonIndexed() : g), false)!
        merged.translate(-(all.min.x + sz.x / 2), -(all.min.y + sz.y / 2), 0)
        merged.scale(k, -k, depth) // SVG y goes down
        merged.computeVertexNormals()
        tris += merged.attributes.position.count / 3
        // flipping y mirrors the winding, so flip faces back
        const pos = merged.attributes.position as any
        for (let i = 0; i < pos.count; i += 3) { for (let a = 0; a < 3; a++) { const t = pos.getComponent(i + 1, a); pos.setComponent(i + 1, a, pos.getComponent(i + 2, a)); pos.setComponent(i + 2, a, t) } }
        merged.computeVertexNormals()
        root.add(new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color: '#' + color, roughness: 0.55, metalness: 0.05 })))
        gs.forEach((g) => g.dispose())
      })
      if (base > 0) {
        const pad = width * 0.05, bw = sz.x * k + pad * 2, bh = sz.y * k + pad * 2
        const plate = new THREE.BoxGeometry(bw, bh, base); plate.translate(0, 0, -base / 2)
        root.add(new THREE.Mesh(plate.toNonIndexed(), new THREE.MeshStandardMaterial({ color: '#2a2f37', roughness: 0.8 })))
        tris += 12
      }
      root.rotation.x = -Math.PI / 2
      if (!dead) { setObj(root); setStats({ tris: Math.round(tris), w: sz.x * k, h: sz.y * k, d: depth + base + bevel * 2, shapes }) }
    })().catch((e) => { if (!dead) run(async () => { throw e }) })
    return () => { dead = true }
  }, [svg, depth, width, bevel, base, smooth, keepColor])

  const save = () => run(async () => {
    if (!obj) return
    const { exportModel, EXPORT_EXT } = await import('@/lib/b2/three-viewer')
    obj.updateMatrixWorld(true)
    // printers expect Z up: export an unrotated copy for STL/OBJ/PLY, glTF keeps Y up
    const copy = obj.clone(); if (fmt !== 'glb' && fmt !== 'gltf' && fmt !== 'usdz') copy.rotation.x = 0
    copy.updateMatrixWorld(true)
    downloadBlob(await exportModel(copy, fmt), `${file ? baseName(file.name) : 'shape'}-3d.${EXPORT_EXT[fmt]}`)
  })

  if (!svg) return <>
    <Dropzone accept=".svg,image/png,image/jpeg,image/webp" onFiles={(f) => open(f[0])} label="Drop an SVG logo or a picture" sub="Turn a logo, icon, signature or drawing into a solid 3D model for printing (STL, OBJ, GLB). Pictures are traced into shapes first." />
    <div className="mt-3 flex justify-center"><Button variant="outline" size="sm" onClick={() => { setFile(new File([SAMPLE], 'star.svg', { type: 'image/svg+xml' })); setSvg(SAMPLE) }}>Try with a star</Button></div>
    {busy && <div className="mt-3"><Progress value={progress} label="Tracing" /></div>}
    {error && <p className="mt-3 text-sm text-danger">{error}</p>}
  </>
  const isImg = file && !/\.svg$/i.test(file.name)
  return (
    <ToolGrid
      main={<>
        {file && <TopBar file={file} onReset={() => { setFile(null); setSvg(null); setObj(null) }} />}
        <Viewer3D object={obj} screenshotName="extruded" />
        {error && <p className="text-sm text-danger">{error}</p>}
        {stats && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Tile label="Width" value={`${stats.w.toFixed(1)} mm`} /><Tile label="Height" value={`${stats.h.toFixed(1)} mm`} /><Tile label="Thickness" value={`${stats.d.toFixed(1)} mm`} /><Tile label="Triangles" value={stats.tris.toLocaleString()} sub={`${stats.shapes} shapes`} /></div>}
      </>}
      side={<>
        {isImg && <><Slider label="Trace darkness" value={threshold} onChange={setThreshold} min={20} max={235} /><Switch checked={invert} onChange={setInvert} label="Use light parts instead" /></>}
        <Field label="Width (mm)"><Input type="number" min={1} max={1000} value={width} onChange={(e) => setWidth(Math.max(1, Math.min(1000, +e.target.value || 1)))} /></Field>
        <Slider label="Thickness" value={depth} onChange={setDepth} min={0.4} max={40} step={0.2} suffix=" mm" />
        <Slider label="Rounded edge" value={bevel} onChange={setBevel} min={0} max={3} step={0.1} suffix=" mm" />
        <Slider label="Base plate" value={base} onChange={setBase} min={0} max={10} step={0.5} suffix=" mm" />
        <Slider label="Curve smoothness" value={smooth} onChange={setSmooth} min={2} max={48} />
        {!isImg && <Switch checked={keepColor} onChange={setKeepColor} label="Keep SVG colours" />}
        <Field label="Format"><Select value={fmt} onChange={setFmt} options={[{ value: 'stl', label: 'STL (3D printing)' }, { value: 'obj', label: 'OBJ' }, { value: 'glb', label: 'GLB (web, AR)' }, { value: 'ply', label: 'PLY' }, { value: 'usdz', label: 'USDZ (iPhone AR)' }]} /></Field>
        <Button size="lg" className="w-full" icon={<Box className="size-5" />} onClick={save} loading={busy} disabled={!obj}>Download 3D model</Button>
        <p className="text-xs text-muted">Sizes are in millimetres, the unit slicers expect.</p>
      </>}
    />
  )
}
