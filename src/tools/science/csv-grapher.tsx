import { useMemo, useRef, useState } from 'react'
import { Download, ImageDown } from 'lucide-react'
import { Button, Card, Label, Segmented, Select, Switch, Textarea, Input, ErrorNote } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { fit, type FitKind } from '@/lib/cf/sci'
import { numOf, sniffDelimiter } from '@/lib/cf/sheet'
import { csvSplit } from '@/lib/cf/study'
import { useSheet, useColOptions, Stat, Stats } from '@/lib/cf/ui'
import { PALETTE } from '@/lib/bcat/kit'

const SAMPLE = 'time_s,distance_m,speed_m_s\n0,0,0\n1,4.9,9.8\n2,19.6,19.6\n3,44.1,29.4\n4,78.4,39.2\n5,122.5,49\n6,176.4,58.8'

export default function CsvGrapher() {
  const s = useSheet()
  const [text, setText] = useState(SAMPLE)
  const [xc, setXc] = useState('0'), [ycs, setYcs] = useState<string[]>(['1'])
  const [kind, setKind] = useState<'scatter' | 'line' | 'bar'>('scatter')
  const [fitK, setFitK] = useState<FitKind | 'none'>('quadratic')
  const [title, setTitle] = useState(''), [logY, setLogY] = useState(false), [grid, setGrid] = useState(true)
  const svgRef = useRef<SVGSVGElement>(null)
  const rows = useMemo(() => { if (s.book) return s.rows.map((r) => r.map((c) => (c == null ? '' : String(c)))); const d = sniffDelimiter(text); return text.trim().split(/\r?\n/).map((l) => csvSplit(l, d)) }, [s.book, s.rows, text])
  const cols = useColOptions(rows, true)
  const body = rows.slice(1)
  const xs = body.map((r) => numOf(r[+xc] ?? null))
  const xNumeric = xs.filter((x) => !isNaN(x)).length >= body.length * 0.8
  const xv = xNumeric ? xs : body.map((_, i) => i)
  const series = ycs.map((yc, si) => ({ name: cols[+yc]?.label ?? `Y${si + 1}`, color: PALETTE[si % PALETTE.length], pts: body.map((r, i) => [xv[i], numOf(r[+yc] ?? null)] as [number, number]).filter(([x, y]) => isFinite(x) && isFinite(y) && (!logY || y > 0)) }))
  const all = series.flatMap((x) => x.pts)
  const fits = useMemo(() => fitK === 'none' ? [] : series.map((sr) => { try { return fit(sr.pts.map((p) => p[0]), sr.pts.map((p) => p[1]), fitK) } catch { return null } }), [series.map((x) => x.pts.length).join(), fitK, xc, ycs.join(), rows])
  const W = 720, Hh = 420, L = 60, B = 50, T = title ? 40 : 18, Rr = 20
  const x0 = Math.min(...all.map((p) => p[0])), x1 = Math.max(...all.map((p) => p[0]))
  const ty = (y: number) => (logY ? Math.log10(y) : y)
  const yv = all.map((p) => ty(p[1])); let y0 = Math.min(...yv), y1 = Math.max(...yv); if (!logY && y0 > 0 && y0 < y1 * 0.5) y0 = 0; if (y0 === y1) { y0 -= 1; y1 += 1 }
  const sx = (x: number) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - Rr), sy = (y: number) => Hh - B - ((ty(y) - y0) / (y1 - y0 || 1)) * (Hh - B - T)
  const ticks = (a: number, b: number, n = 6) => { const st = 10 ** Math.floor(Math.log10((b - a) / n || 1)); const m = [1, 2, 5, 10].find((k) => (b - a) / (st * k) <= n)! * st; const out = []; for (let v = Math.ceil(a / m) * m; v <= b + 1e-9; v += m) out.push(+v.toPrecision(10)); return out }
  const exportSvg = () => { const el = svgRef.current; if (!el) return; downloadBlob(new Blob([new XMLSerializer().serializeToString(el)], { type: 'image/svg+xml' }), 'graph.svg') }
  const exportPng = async () => { const el = svgRef.current; if (!el) return; const svg = new XMLSerializer().serializeToString(el); const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await img.decode(); const c = document.createElement('canvas'); c.width = W * 2; c.height = Hh * 2; const g = c.getContext('2d')!; g.fillStyle = '#0B0D10'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); c.toBlob((b) => b && downloadBlob(b, 'graph.png'), 'image/png') }
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        {!s.book ? <div><Label hint={<button className="text-accent cursor-pointer" onClick={() => document.getElementById('csvg-file')?.click()}>or open a file</button>}>Data (CSV, first row is the header)</Label>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-40" />
          <input id="csvg-file" type="file" hidden accept=".csv,.tsv,.txt,.xlsx,.xls,.ods" onChange={(e) => { const f = e.target.files?.[0]; if (f) s.open(f); e.target.value = '' }} /></div>
          : <div className="flex items-center gap-2 text-sm"><span className="truncate">{s.file?.name}</span><Button size="sm" variant="ghost" onClick={s.reset}>Use pasted data</Button></div>}
        <ErrorNote error={s.error} />
        <Card className="p-2">
          {all.length < 2 ? <div className="p-8 text-center text-sm text-muted">Pick an X column and at least one Y column with numbers.</div> :
          <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${Hh}`} className="w-full" role="img" aria-label={title || 'Graph'} fontFamily="Inter, Arial, sans-serif">
            <rect width={W} height={Hh} fill="#0B0D10" />
            {title && <text x={W / 2} y="26" textAnchor="middle" fill="#F5F3EE" fontSize="16" fontWeight="700">{title}</text>}
            {ticks(x0, x1).map((v) => <g key={'x' + v}>{grid && <line x1={sx(v)} x2={sx(v)} y1={T} y2={Hh - B} stroke="#F5F3EE" opacity=".08" />}<text x={sx(v)} y={Hh - B + 16} textAnchor="middle" fill="#A8A29E" fontSize="11">{v}</text></g>)}
            {ticks(y0, y1).map((v) => <g key={'y' + v}>{grid && <line x1={L} x2={W - Rr} y1={sy(logY ? 10 ** v : v)} y2={sy(logY ? 10 ** v : v)} stroke="#F5F3EE" opacity=".08" />}<text x={L - 6} y={sy(logY ? 10 ** v : v) + 4} textAnchor="end" fill="#A8A29E" fontSize="11">{logY ? `1e${v}` : v}</text></g>)}
            <line x1={L} x2={W - Rr} y1={Hh - B} y2={Hh - B} stroke="#A8A29E" /><line x1={L} x2={L} y1={T} y2={Hh - B} stroke="#A8A29E" />
            <text x={(W + L) / 2} y={Hh - 12} textAnchor="middle" fill="#F5F3EE" fontSize="12">{xNumeric ? cols[+xc]?.label : 'Row'}</text>
            {series.map((sr, si) => <g key={si}>
              {kind === 'line' && <polyline fill="none" stroke={sr.color} strokeWidth="2" points={[...sr.pts].sort((a, b) => a[0] - b[0]).map(([x, y]) => `${sx(x)},${sy(y)}`).join(' ')} />}
              {kind === 'bar' ? sr.pts.map(([x, y], i) => { const bw = Math.max(2, ((W - L - Rr) / Math.max(1, sr.pts.length)) / series.length * 0.7); return <rect key={i} x={sx(x) - (bw * series.length) / 2 + si * bw} y={Math.min(sy(y), sy(Math.max(y0, 0)))} width={bw} height={Math.abs(sy(Math.max(y0, 0)) - sy(y))} fill={sr.color} /> })
                : sr.pts.map(([x, y], i) => <circle key={i} cx={sx(x)} cy={sy(y)} r={kind === 'line' ? 2.5 : 4} fill={sr.color} />)}
              {fits[si] && <polyline fill="none" stroke={sr.color} strokeDasharray="6 4" strokeWidth="1.5" opacity=".9" points={Array.from({ length: 80 }, (_, i) => { const x = x0 + ((x1 - x0) * i) / 79; const y = fits[si]!.f(x); return isFinite(y) && (!logY || y > 0) ? `${sx(x)},${Math.max(T - 20, Math.min(Hh, sy(y)))}` : '' }).filter(Boolean).join(' ')} />}
              <g transform={`translate(${L + 12 + si * 150}, ${T + 8})`}><rect width="10" height="10" fill={sr.color} rx="2" /><text x="15" y="9" fill="#F5F3EE" fontSize="11">{sr.name}</text></g>
            </g>)}
          </svg>}
        </Card>
        {fits.some(Boolean) && <Stats cols={2}>{fits.map((ft, i) => ft && <Stat key={i} label={`${series[i].name}: ${ft.kind} fit`} value={<span className="font-mono text-sm">{ft.eq}</span>} sub={`R² = ${ft.r2.toFixed(4)}`} />)}</Stats>}
      </div>
      <Card className="space-y-4 self-start">
        <div><Label>X axis</Label><Select value={xc} onChange={setXc} options={cols} /></div>
        <div><Label>Y series</Label><div className="flex flex-wrap gap-1.5">{cols.filter((c) => c.value !== xc).map((c) => <button key={c.value} aria-pressed={ycs.includes(c.value)} onClick={() => setYcs((o) => (o.includes(c.value) ? o.filter((x) => x !== c.value) : [...o, c.value]))} className={`rounded-full border px-2.5 py-1 text-xs cursor-pointer ${ycs.includes(c.value) ? 'border-accent text-fg' : 'border-border text-muted'}`}>{c.label}</button>)}</div></div>
        <div><Label>Chart</Label><Segmented value={kind} onChange={setKind} options={[{ value: 'scatter', label: 'Scatter' }, { value: 'line', label: 'Line' }, { value: 'bar', label: 'Bar' }]} /></div>
        <div><Label>Trend line</Label><Select value={fitK} onChange={setFitK} options={[{ value: 'none', label: 'None' }, { value: 'linear', label: 'Linear' }, { value: 'quadratic', label: 'Quadratic' }, { value: 'exponential', label: 'Exponential' }, { value: 'power', label: 'Power' }, { value: 'log', label: 'Logarithmic' }]} /></div>
        <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional" /></div>
        <Switch checked={logY} onChange={setLogY} label="Log scale Y" /><Switch checked={grid} onChange={setGrid} label="Grid lines" />
        <div className="flex gap-2"><Button className="flex-1" icon={<ImageDown className="size-4" />} onClick={exportPng} disabled={all.length < 2}>PNG</Button><Button className="flex-1" variant="outline" icon={<Download className="size-4" />} onClick={exportSvg} disabled={all.length < 2}>SVG</Button></div>
      </Card>
    </div>
  )
}
