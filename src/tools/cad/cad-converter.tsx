import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button, Dropzone, Field, Input, Label, Progress, Segmented, Select, Switch, ToolGrid, ErrorNote, ResultCard, useJob } from '@/components/ui'
import { baseName } from '@/lib/files'
import type { CadDoc } from '@/lib/b2/cad'
import { fitPageMm } from '@/lib/b2/cad-page'
import { CadCanvas } from './_b2/CadCanvas'
import { LayerPanel } from './_b2/LayerPanel'

type Out = 'svg' | 'pdf' | 'png' | 'jpg'
const PAGES: Record<string, [number, number] | null> = { fit: null, a4: [210, 297], a3: [297, 420], a2: [420, 594], a1: [594, 841], letter: [215.9, 279.4], tabloid: [279.4, 431.8] }

export default function CadConverter() {
  const [file, setFile] = useState<File | null>(null)
  const [doc, setDoc] = useState<CadDoc | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [to, setTo] = useState<Out>('pdf')
  const [bg, setBg] = useState('#ffffff')
  const [mono, setMono] = useState(true)
  const [width, setWidth] = useState(3000)
  const [page, setPage] = useState('fit')
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null)
  const { busy, error, run } = useJob()

  const open = (f: File) => run(async () => {
    if (/\.dwg$/i.test(f.name)) throw new Error('DWG is a closed binary format. Export the drawing as DXF from your CAD program first.')
    const { parseDxf } = await import('@/lib/b2/cad')
    setDoc(await parseDxf(await f.text())); setFile(f); setHidden(new Set()); setResult(null)
  })

  const monoColor = mono ? (bg === '#ffffff' || bg === 'transparent' ? '#000000' : '#ffffff') : null
  const convert = () => run(async () => {
    if (!doc || !file) return
    const { cadToSvg, drawCad, fitView } = await import('@/lib/b2/cad')
    const name = baseName(file.name)
    const bw = doc.bbox.maxX - doc.bbox.minX || 1, bh = doc.bbox.maxY - doc.bbox.minY || 1
    if (to === 'svg') { setResult({ blob: new Blob([cadToSvg(doc, { hidden, mono: monoColor, bg })], { type: 'image/svg+xml' }), name: `${name}.svg` }); return }
    if (to === 'pdf') {
      const { jsPDF } = await import('jspdf'); await import('svg2pdf.js')
      const fixed = PAGES[page]
      const landscape = bw > bh
      const [pw, ph] = fixed ? (landscape ? [fixed[1], fixed[0]] : fixed) : fitPageMm(bw, bh, doc.units)
      const pdf = new jsPDF({ unit: 'mm', format: [pw, ph], orientation: pw > ph ? 'landscape' : 'portrait' })
      const svgText = cadToSvg(doc, { hidden, mono: monoColor, bg: bg === 'transparent' ? '#ffffff' : bg, strokeWidth: Math.max(bw, bh) / 1500 })
      const el = new DOMParser().parseFromString(svgText, 'image/svg+xml').documentElement as unknown as SVGSVGElement
      const holder = document.createElement('div'); holder.style.cssText = 'position:fixed;left:-99999px;top:0'; holder.appendChild(el); document.body.appendChild(holder)
      try {
        const m = 8, aw = pw - m * 2, ah = ph - m * 2, k = Math.min(aw / bw, ah / bh)
        await (pdf as any).svg(el, { x: m + (aw - bw * k) / 2, y: m + (ah - bh * k) / 2, width: bw * k, height: bh * k })
      } finally { holder.remove() }
      setResult({ blob: pdf.output('blob'), name: `${name}.pdf` }); return
    }
    const w = Math.min(16000, Math.max(100, width)), h = Math.round(w * bh / bw)
    if (h > 16000) throw new Error('That width makes the image too tall. Use a smaller width.')
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const effBg = to === 'jpg' && bg === 'transparent' ? '#ffffff' : bg
    drawCad(c.getContext('2d')!, doc, fitView(doc, w, h, 0.02), { hidden, mono: monoColor, bg: effBg, lineWidth: Math.max(1, w / 1500) })
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Export failed'))), to === 'png' ? 'image/png' : 'image/jpeg', 0.95))
    setResult({ blob, name: `${name}.${to}` })
  })

  if (!doc || !file) return (
    <div className="space-y-3">
      <Dropzone accept=".dxf,.dwg" onFiles={(f) => open(f[0])} label="Drop a DXF drawing to convert" sub="Convert to SVG, vector PDF, PNG or JPG · never uploaded" />
      {busy && <Progress value={0.5} label="Reading drawing" />}
      <ErrorNote error={error} />
    </div>
  )
  return (
    <div className="space-y-6">
      <ToolGrid
        main={<CadCanvas doc={doc} hidden={hidden} bg={bg === 'transparent' ? 'transparent' : bg} mono={monoColor} height="56vh" />}
        side={<>
          <Field label="Convert to"><Segmented value={to} onChange={(v) => { setTo(v); setResult(null) }} options={[{ value: 'pdf', label: 'PDF' }, { value: 'svg', label: 'SVG' }, { value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }]} /></Field>
          {to === 'pdf' && <Field label="Page size"><Select value={page} onChange={setPage} options={[{ value: 'fit', label: 'Fit drawing (real size)' }, { value: 'a4', label: 'A4' }, { value: 'a3', label: 'A3' }, { value: 'a2', label: 'A2' }, { value: 'a1', label: 'A1' }, { value: 'letter', label: 'Letter' }, { value: 'tabloid', label: 'Tabloid' }]} /></Field>}
          {(to === 'png' || to === 'jpg') && <Field label="Image width (px)"><Input type="number" min={100} max={16000} value={width} onChange={(e) => setWidth(Number(e.target.value))} /></Field>}
          <Field label="Background"><Segmented value={bg} onChange={setBg} options={[{ value: '#ffffff', label: 'White' }, { value: '#111111', label: 'Dark' }, ...(to !== 'jpg' && to !== 'pdf' ? [{ value: 'transparent', label: 'None' }] : [])]} /></Field>
          <Switch checked={mono} onChange={setMono} label="Black and white lines (best for print)" />
          {doc.space !== 'Model' && <p className="text-[11px] text-muted">{doc.space === 'Block library' ? 'This file only holds block definitions, so each block is drawn on its own with its name.' : `This file has no model space drawing, so the paper layout is converted (${doc.space}).`}</p>}
          <LayerPanel layers={doc.layers} hidden={hidden} setHidden={setHidden} />
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" loading={busy} icon={<RefreshCw className="size-4" />} onClick={convert}>Convert to {to.toUpperCase()}</Button>
          <Label>Hidden layers are left out of the export.</Label>
          <Button variant="ghost" className="w-full" onClick={() => { setDoc(null); setFile(null); setResult(null) }}>Start over</Button>
        </>}
      />
      {result && <ResultCard blob={result.blob} filename={result.name} onReset={() => { setDoc(null); setFile(null); setResult(null) }} />}
    </div>
  )
}
