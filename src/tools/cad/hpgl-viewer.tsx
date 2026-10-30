import { useMemo, useState } from 'react'
import { Printer, Download } from 'lucide-react'
import { Button, Dropzone, ToolGrid, ErrorNote, Label } from '@/components/ui'
import { baseName, downloadBlob } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { parseHpgl, writeDxf, writeSvg, bounds, HPGL_UNIT, type Poly } from '@/lib/b14/cad'
import { SvgPreview, Tile } from '@/lib/b14/ui'
import { PALETTE } from '@/lib/bcat/kit'

export default function HpglViewer() {
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [hidden, setHidden] = useState<Set<number>>(new Set())
  const open = async (f: File) => { setFile(f); setText(await f.text()); setHidden(new Set()) }
  const res = useMemo(() => {
    if (!text) return null
    try {
      const r = parseHpgl(text)
      if (!r.polys.length) throw new Error('No drawing commands were found. Is this an HPGL or PLT plotter file?')
      const mm: Poly[] = r.polys.map((p) => ({ ...p, pts: p.pts.map(([x, y]) => [x * HPGL_UNIT, y * HPGL_UNIT] as [number, number]) }))
      return { ...r, mm, error: null as string | null }
    } catch (e: any) { return { polys: [], pens: [], warnings: [], mm: [] as Poly[], error: e.message as string } }
  }, [text])
  const visible = (res?.mm ?? []).filter((p) => !hidden.has(+(p.layer ?? 'PEN1').slice(3))).map((p) => ({ ...p, color: PALETTE[(+(p.layer ?? 'PEN1').slice(3) - 1 + PALETTE.length) % PALETTE.length] === '#FDE68A' ? '#F5A524' : PALETTE[(+(p.layer ?? 'PEN1').slice(3) - 1 + PALETTE.length) % PALETTE.length] }))
  const b = bounds(visible)
  const svg = visible.length ? writeSvg(visible, [], { stroke: Math.max(0.2, b.w / 700) }) : ''
  if (!file) return <Dropzone accept=".plt,.hpgl,.hpg,.hgl,.pen,.hp2,.prn,text/plain" onFiles={(f) => open(f[0])} label="Drop an HPGL or PLT file" sub="See plotter and vinyl cutter files from CAD programs, hide pens, and convert them to SVG, DXF or PDF." />
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => { setFile(null); setText('') }} />
        {res?.error ? <ErrorNote error={res.error} /> : <>
          <SvgPreview svg={svg} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Tile label="Width" value={`${b.w.toFixed(1)} mm`} /><Tile label="Height" value={`${b.h.toFixed(1)} mm`} /><Tile label="Strokes" value={visible.length} /><Tile label="Pens" value={res?.pens.length ?? 0} /></div>
          {res?.warnings.map((w) => <p key={w} className="text-xs text-warn">{w}</p>)}
        </>}
      </>}
      side={<>
        {res && res.pens.length > 0 && <div><Label>Pens</Label><div className="flex flex-wrap gap-1.5">{res.pens.map((p) => <button key={p} type="button" aria-pressed={!hidden.has(p)} onClick={() => setHidden((h) => { const n = new Set(h); n.has(p) ? n.delete(p) : n.add(p); return n })} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs" style={{ opacity: hidden.has(p) ? 0.4 : 1 }}><span className="size-2.5 rounded-full" style={{ background: PALETTE[(p - 1 + PALETTE.length) % PALETTE.length] }} />Pen {p}</button>)}</div></div>}
        <Button className="w-full" icon={<Download className="size-4" />} disabled={!visible.length} onClick={() => downloadBlob(new Blob([writeSvg(visible, [], { stroke: 0.25 })], { type: 'image/svg+xml' }), `${baseName(file.name)}.svg`)}>SVG</Button>
        <Button className="w-full" variant="outline" icon={<Download className="size-4" />} disabled={!visible.length} onClick={() => downloadBlob(new Blob([writeDxf(visible)], { type: 'application/dxf' }), `${baseName(file.name)}.dxf`)}>DXF</Button>
        <Button className="w-full" variant="outline" icon={<Printer className="size-4" />} disabled={!visible.length} onClick={async () => {
          const { jsPDF } = await import('jspdf'); const m = 10; const W = b.w + m * 2, H = b.h + m * 2
          const doc = new jsPDF({ unit: 'mm', format: [Math.max(W, 20), Math.max(H, 20)], orientation: W > H ? 'landscape' : 'portrait' })
          doc.setLineWidth(0.25)
          for (const p of visible) { doc.setDrawColor(p.color ?? '#000000'); for (let i = 1; i < p.pts.length; i++) doc.line(p.pts[i - 1][0] - b.x0 + m, b.y1 - p.pts[i - 1][1] + m, p.pts[i][0] - b.x0 + m, b.y1 - p.pts[i][1] + m) }
          downloadBlob(doc.output('blob'), `${baseName(file.name)}.pdf`)
        }}>PDF (true size)</Button>
        <p className="text-xs text-muted">HPGL counts in plotter units of 0.025 mm. Lines, arcs and circles are drawn. Text labels are skipped.</p>
      </>}
    />
  )
}
