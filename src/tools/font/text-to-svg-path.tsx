import { useEffect, useMemo, useState } from 'react'
import { Spline, Download } from 'lucide-react'
import { Button, Dropzone, Field, Input, Segmented, Slider, Switch, Textarea, ToolGrid, ErrorNote, CopyButton, Spinner } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { openFont } from '@/lib/b14/font'
import { flattenPath, writeDxf, bounds } from '@/lib/b14/cad'
import { SvgPreview } from '@/lib/b14/ui'

const BUILTIN = [{ value: 'space-grotesk-latin.woff2', label: 'Space Grotesk' }, { value: 'inter-latin.woff2', label: 'Inter' }, { value: 'hand/hand-caveat.woff2', label: 'Caveat (handwriting)' }, { value: 'hand/hand-kalam.woff2', label: 'Kalam' }]

export default function TextToSvgPath() {
  const [file, setFile] = useState<File | null>(null)
  const [builtin, setBuiltin] = useState(BUILTIN[0].value)
  const [font, setFont] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [text, setText] = useState('OpenFile')
  const [size, setSize] = useState(72)
  const [spacing, setSpacing] = useState(0)
  const [lineH, setLineH] = useState(1.2)
  const [align, setAlign] = useState<'left' | 'center' | 'right'>('left')
  const [kern, setKern] = useState(true)
  const [color, setColor] = useState('#111111')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    let off = false
    setLoading(true); setErr(null)
    ;(async () => {
      try {
        const buf = file ? await file.arrayBuffer() : await (await fetch(`${import.meta.env.BASE_URL}fonts/${builtin}`)).arrayBuffer()
        const f = await openFont(buf, file?.name ?? builtin)
        if (!off) setFont(f)
      } catch (e: any) { if (!off) setErr(e?.message || 'Could not read this font.') } finally { if (!off) setLoading(false) }
    })()
    return () => { off = true }
  }, [file, builtin])
  const out = useMemo(() => {
    if (!font) return null
    const lines = text.split('\n')
    const widths = lines.map((l) => font.getAdvanceWidth(l, size, { kerning: kern }) + Math.max(0, [...l].length - 1) * spacing)
    const maxW = Math.max(1, ...widths)
    const parts: string[] = []
    lines.forEach((l, i) => {
      let x = align === 'left' ? 0 : align === 'center' ? (maxW - widths[i]) / 2 : maxW - widths[i]
      const y = size + i * size * lineH
      if (!spacing) { parts.push(font.getPath(l, x, y, size, { kerning: kern }).toPathData(2)); return }
      for (const ch of l) { parts.push(font.getPath(ch, x, y, size).toPathData(2)); x += font.getAdvanceWidth(ch, size) + spacing }
    })
    const d = parts.filter(Boolean).join(' ')
    const polys = flattenPath(d, 0.3)
    const b = bounds(polys)
    const pad = 4
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${(b.x0 - pad).toFixed(2)} ${(b.y0 - pad).toFixed(2)} ${(b.w + pad * 2).toFixed(2)} ${(b.h + pad * 2).toFixed(2)}" width="${(b.w + pad * 2).toFixed(0)}" height="${(b.h + pad * 2).toFixed(0)}"><path d="${d}" fill="${color}"/></svg>`
    return { d, svg, polys }
  }, [font, text, size, spacing, lineH, align, kern, color])
  return (
    <ToolGrid
      main={<>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-24 text-lg" aria-label="Text" />
        {loading ? <Spinner label="Loading font" /> : <ErrorNote error={err} />}
        {out && <SvgPreview svg={out.svg} />}
        {out && <div className="flex flex-wrap gap-2"><CopyButton text={out.d} label="Copy path data" /><CopyButton text={out.svg} label="Copy SVG" /></div>}
      </>}
      side={<>
        {file ? <div className="flex items-center gap-2 text-sm"><span className="flex-1 truncate">{file.name}</span><Button size="sm" variant="ghost" onClick={() => setFile(null)}>Use built in</Button></div>
          : <Field label="Font"><Segmented value={builtin} onChange={setBuiltin} options={BUILTIN.map((b) => ({ value: b.value, label: b.label.split(' ')[0] }))} /></Field>}
        <Dropzone compact accept=".ttf,.otf,.woff,.woff2" onFiles={(f) => setFile(f[0])} label="Or drop your own font" sub="TTF, OTF, WOFF, WOFF2" />
        <Slider label="Size" value={size} onChange={setSize} min={12} max={300} suffix=" px" />
        <Slider label="Letter spacing" value={spacing} onChange={setSpacing} min={-10} max={60} suffix=" px" />
        <Slider label="Line height" value={lineH} onChange={setLineH} min={0.8} max={2.5} step={0.05} />
        <Field label="Align"><Segmented value={align} onChange={setAlign} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }]} /></Field>
        <Switch checked={kern} onChange={setKern} label="Use the font's kerning" />
        <Field label="Fill colour"><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Fill colour" /></Field>
        <Button className="w-full" icon={<Download className="size-4" />} disabled={!out} onClick={() => out && downloadBlob(new Blob([out.svg], { type: 'image/svg+xml' }), 'text.svg')}>Download SVG</Button>
        <Button className="w-full" variant="outline" icon={<Download className="size-4" />} disabled={!out} onClick={() => out && downloadBlob(new Blob([writeDxf(out.polys.map((p) => ({ ...p, pts: p.pts.map(([x, y]) => [x * 0.2646, -y * 0.2646] as [number, number]) })))], { type: 'application/dxf' }), 'text.dxf')}>Download DXF (laser, 1 px = 0.26 mm)</Button>
        <p className="flex gap-1.5 text-xs text-muted"><Spline className="size-4 shrink-0" />Letters become outlines, so the result looks the same everywhere without the font installed. Check the font licence before using it in a logo.</p>
      </>}
    />
  )
}
