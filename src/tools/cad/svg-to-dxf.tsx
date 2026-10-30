import { sanitizeMarkup } from '@/lib/safe'
import { useMemo, useState } from 'react'
import { FileOutput, Download } from 'lucide-react'
import { Button, Dropzone, Field, Input, Select, Slider, Switch, ToolGrid, ErrorNote } from '@/components/ui'
import { baseName, downloadBlob } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { flattenPath, shapeToPath, parseTransform, mul, apply, IDENT, writeDxf, writeSvg, bounds, type Poly, type Mat } from '@/lib/b14/cad'
import { SvgPreview, Tile } from '@/lib/b14/ui'

type Scale = 'auto' | 'px96' | 'px72' | 'mm'

function svgToPolys(text: string, tol: number): { polys: Poly[]; mmPerUnit: number | null; skipped: number } {
  const doc = new DOMParser().parseFromString(sanitizeMarkup(text, 'image/svg+xml'), 'image/svg+xml')
  if (doc.getElementsByTagName('parsererror')[0]) throw new Error('This SVG could not be read. It may be damaged or not an SVG.')
  const root = doc.documentElement
  if (root.nodeName.toLowerCase() !== 'svg') throw new Error('This file does not contain an <svg> element.')
  // real size: width="100mm" plus viewBox gives mm per user unit
  let mmPerUnit: number | null = null
  const vb = root.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)
  const wAttr = root.getAttribute('width') ?? ''
  const m = wAttr.match(/^([\d.]+)\s*(mm|cm|in|pt|px)?$/)
  if (m && vb && vb[2] > 0) { const k = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, px: 25.4 / 96 }[m[2] ?? 'px'] ?? 25.4 / 96; mmPerUnit = (+m[1] * k) / vb[2] }
  const polys: Poly[] = []
  let skipped = 0
  const walk = (el: Element, mat: Mat) => {
    const tag = el.nodeName.toLowerCase().replace(/^svg:/, '')
    if (['defs', 'clippath', 'mask', 'symbol', 'title', 'desc', 'metadata', 'style', 'script', 'text', 'pattern', 'marker'].includes(tag)) { if (tag === 'text') skipped++; return }
    const M = mul(mat, parseTransform(el.getAttribute('transform')))
    const num = (k: string) => parseFloat(el.getAttribute(k) ?? '0') || 0
    let d: string | null = null
    if (tag === 'path') d = el.getAttribute('d')
    else if (tag === 'polyline' || tag === 'polygon') { const p = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number); if (p.length >= 4) { const pts: string[] = []; for (let i = 0; i + 1 < p.length; i += 2) pts.push(`${p[i]} ${p[i + 1]}`); d = 'M' + pts.join(' L') + (tag === 'polygon' ? ' Z' : '') } }
    else if (tag === 'image') skipped++
    else d = shapeToPath(tag, num)
    if (d) for (const p of flattenPath(d, tol)) polys.push({ ...p, pts: p.pts.map((q) => apply(M, q)) })
    for (const c of Array.from(el.children)) walk(c, M)
  }
  walk(root, IDENT)
  return { polys, mmPerUnit, skipped }
}

export default function SvgToDxf() {
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [scale, setScale] = useState<Scale>('auto')
  const [tol, setTol] = useState(0.2)
  const [fitW, setFitW] = useState('')
  const [flip, setFlip] = useState(true)
  const open = async (f: File) => { setFile(f); setText(await f.text()) }
  const res = useMemo(() => {
    if (!text) return null
    try {
      const r = svgToPolys(text, tol)
      const k0 = scale === 'auto' ? r.mmPerUnit ?? 25.4 / 96 : scale === 'px96' ? 25.4 / 96 : scale === 'px72' ? 25.4 / 72 : 1
      let polys = r.polys.map((p) => ({ ...p, pts: p.pts.map(([x, y]) => [x * k0, flip ? -y * k0 : y * k0] as [number, number]) }))
      let b = bounds(polys)
      const fw = parseFloat(fitW)
      if (fw > 0 && b.w > 0) { const s = fw / b.w; polys = polys.map((p) => ({ ...p, pts: p.pts.map(([x, y]) => [x * s, y * s] as [number, number]) })); b = bounds(polys) }
      polys = polys.map((p) => ({ ...p, pts: p.pts.map(([x, y]) => [x - b.x0, y - b.y0] as [number, number]) }))
      return { polys, b: bounds(polys), skipped: r.skipped, points: polys.reduce((a, p) => a + p.pts.length, 0), error: null as string | null }
    } catch (e: any) { return { polys: [], b: bounds([]), skipped: 0, points: 0, error: e.message as string } }
  }, [text, scale, tol, fitW, flip])
  if (!file) return <Dropzone accept=".svg,image/svg+xml" onFiles={(f) => open(f[0])} label="Drop an SVG" sub="Convert logos and drawings to DXF for laser cutters, plasma tables and CNC routers, at their real size in millimetres." />
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => { setFile(null); setText('') }} />
        {res?.error ? <ErrorNote error={res.error} /> : res && <>
          <SvgPreview svg={writeSvg(res.polys, [], { stroke: Math.max(0.15, res.b.w / 600) })} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Tile label="Width" value={`${res.b.w.toFixed(1)} mm`} /><Tile label="Height" value={`${res.b.h.toFixed(1)} mm`} /><Tile label="Shapes" value={res.polys.length} /><Tile label="Points" value={res.points.toLocaleString()} /></div>
          {res.skipped > 0 && <p className="text-xs text-warn">{res.skipped} text or image elements were skipped. Convert text to outlines (paths) in your editor first.</p>}
        </>}
      </>}
      side={<>
        <Field label="Size"><Select value={scale} onChange={setScale} options={[{ value: 'auto', label: 'From the SVG (width and viewBox)' }, { value: 'px96', label: '1 px = 1/96 inch (Inkscape, browsers)' }, { value: 'px72', label: '1 px = 1/72 inch (Illustrator)' }, { value: 'mm', label: '1 unit = 1 mm' }]} /></Field>
        <Field label="Scale to width (mm, optional)"><Input type="number" min={0} value={fitW} onChange={(e) => setFitW(e.target.value)} placeholder="Keep size" /></Field>
        <Slider label="Curve accuracy" value={tol} onChange={setTol} min={0.05} max={2} step={0.05} suffix=" mm" />
        <Switch checked={flip} onChange={setFlip} label="Flip Y (DXF counts up, SVG counts down)" />
        <Button className="w-full" icon={<Download className="size-4" />} disabled={!res || !!res.error || !res.polys.length} onClick={() => res && downloadBlob(new Blob([writeDxf(res.polys)], { type: 'application/dxf' }), `${baseName(file.name)}.dxf`)}>Download DXF</Button>
        <Button className="w-full" variant="outline" icon={<FileOutput className="size-4" />} disabled={!res || !!res.error || !res.polys.length} onClick={() => res && downloadBlob(new Blob([writeSvg(res.polys, [], { flipY: true })], { type: 'image/svg+xml' }), `${baseName(file.name)}-mm.svg`)}>Download clean SVG (mm)</Button>
        <p className="text-xs text-muted">Curves become short straight lines (AutoCAD R12 polylines), which every cutter reads. Lower accuracy values give smoother curves and bigger files. For a PNG or JPG, trace it first with Image to SVG.</p>
      </>}
    />
  )
}
