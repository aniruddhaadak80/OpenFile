import { useMemo, useState } from 'react'
import { BarChart3, Download } from 'lucide-react'
import { Button, CopyButton, Field, Input, Segmented, Select, Switch, Textarea, ToolGrid, cn } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { toast } from '@/components/toast'
import { chartSvg, parseChartTable, type ChartKind } from '@/lib/b14/design'
import { OpenButton, SvgPreview } from '@/lib/b14/ui'

/** True when the file is binary (a photo, audio, an archive), so it is not loaded as text. */
async function isBinaryFile(f: File): Promise<boolean> {
  const b = new Uint8Array(await f.slice(0, 4096).arrayBuffer())
  if ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff)) return false
  let ctrl = 0
  for (const c of b) { if (c === 0) return true; if (c < 9 || (c > 13 && c < 32)) ctrl++ }
  return b.length > 0 && ctrl / b.length > 0.1
}

const SAMPLE = 'Month,Online,In store\nJan,120,80\nFeb,150,95\nMar,170,90\nApr,165,110\nMay,210,120\nJun,240,135'
const KINDS: { id: ChartKind; label: string }[] = [{ id: 'bar', label: 'Bars' }, { id: 'stacked', label: 'Stacked' }, { id: 'hbar', label: 'Sideways bars' }, { id: 'line', label: 'Line' }, { id: 'area', label: 'Area' }, { id: 'pie', label: 'Pie' }, { id: 'donut', label: 'Donut' }, { id: 'scatter', label: 'Dots' }]
const PALETTES: Record<string, string[]> = { brand: ['#F5A524', '#14B8A6', '#38BDF8', '#84CC16', '#F97316', '#22D3EE', '#10B981', '#FBBF24'], ocean: ['#0EA5E9', '#14B8A6', '#22D3EE', '#0F766E', '#38BDF8', '#2DD4BF'], warm: ['#F97316', '#F5A524', '#EF4444', '#FBBF24', '#FB923C', '#FDE68A'], mono: ['#111827', '#4B5563', '#9CA3AF', '#D1D5DB', '#6B7280', '#374151'] }
const SIZES = [{ value: '960x540', label: 'Slide 960 x 540' }, { value: '1200x675', label: 'Wide 1200 x 675' }, { value: '1080x1080', label: 'Square 1080' }, { value: '800x1000', label: 'Tall 800 x 1000' }]

export default function ChartMaker() {
  const [text, setText] = useState(SAMPLE)
  const [kind, setKind] = useState<ChartKind>('bar')
  const [title, setTitle] = useState('Sales by month')
  const [size, setSize] = useState('960x540')
  const [pal, setPal] = useState('brand')
  const [dark, setDark] = useState(false)
  const [grid, setGrid] = useState(true)
  const [legend, setLegend] = useState(true)
  const [values, setValues] = useState(false)
  const [w, h] = size.split('x').map(Number)
  const parsed = useMemo(() => { try { return { d: parseChartTable(text), err: null } } catch (e: any) { return { d: null, err: e.message as string } } }, [text])
  const svg = useMemo(() => parsed.d ? chartSvg(parsed.d, { kind, title, w, h, colors: PALETTES[pal], bg: dark ? '#0B0D10' : '#FFFFFF', fg: dark ? '#F2EFE8' : '#1A1C20', grid, legend, values, font: 'Inter, Arial, sans-serif' }) : '', [parsed, kind, title, w, h, pal, dark, grid, legend, values])
  const name = (title || 'chart').toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'chart'
  const raster = async (type: 'image/png' | 'image/jpeg') => {
    const u = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    try { await document.fonts.ready; const img = new Image(); img.src = u; await img.decode(); const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); c.toBlob((b) => (b ? downloadBlob(b, `${name}.${type === 'image/png' ? 'png' : 'jpg'}`) : toast('Could not save', 'error')), type, 0.93) } finally { setTimeout(() => URL.revokeObjectURL(u), 1000) }
  }
  const pieWarn = (kind === 'pie' || kind === 'donut') && parsed.d && parsed.d.series.length > 1
  return (
    <ToolGrid
      main={<>
        {svg ? <SvgPreview svg={svg} dark={dark} label={title || 'Chart'} /> : <div className="grid min-h-60 place-items-center rounded-2xl border border-dashed border-border p-6 text-sm text-danger">{parsed.err}</div>}
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {KINDS.map((k) => <button key={k.id} aria-pressed={kind === k.id} onClick={() => setKind(k.id)} className={cn('cursor-pointer rounded-lg border px-2 py-1.5 text-xs', kind === k.id ? 'border-accent bg-accent/10' : 'border-border bg-surface hover:bg-surface-2')}>{k.label}</button>)}
        </div>
        {pieWarn && <p className="text-xs text-muted">Pie and donut charts use the first number column only.</p>}
        <Field label="Data (paste from a spreadsheet, CSV or type it)"><Textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} className="min-h-44" /></Field>
        <div className="flex flex-wrap gap-2"><OpenButton accept=".csv,.tsv,.txt" onFiles={async (f) => { if (await isBinaryFile(f[0])) { toast(`${f[0].name} is not a CSV or text file. Choose a .csv, .tsv or .txt file.`, 'error'); return } setText(await f[0].text()) }} label="Open CSV" /><span className="self-center text-xs text-muted">First column is labels, each next column is one series.</span></div>
      </>}
      side={<>
        <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 90))} /></Field>
        <Field label="Size"><Select value={size} onChange={setSize} options={SIZES} /></Field>
        <Field label="Colours"><div className="flex flex-wrap gap-1.5">{Object.entries(PALETTES).map(([id, cs]) => <button key={id} aria-label={`Palette ${id}`} aria-pressed={pal === id} onClick={() => setPal(id)} className={`flex cursor-pointer gap-0.5 rounded-lg border-2 p-1 ${pal === id ? 'border-accent' : 'border-border'}`}>{cs.slice(0, 4).map((c) => <span key={c} className="h-5 w-2.5 rounded-sm" style={{ background: c }} />)}</button>)}</div></Field>
        <Field label="Background"><Segmented value={dark ? 'd' : 'l'} onChange={(v) => setDark(v === 'd')} options={[{ value: 'l', label: 'Light' }, { value: 'd', label: 'Dark' }]} /></Field>
        <Switch checked={grid} onChange={setGrid} label="Grid lines" />
        <Switch checked={legend} onChange={setLegend} label="Legend" />
        <Switch checked={values} onChange={setValues} label="Show values" />
        <Button size="lg" className="w-full" icon={<BarChart3 className="size-5" />} disabled={!svg} onClick={() => raster('image/png')}>Download PNG</Button>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" icon={<Download className="size-4" />} disabled={!svg} onClick={() => downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`)}>SVG</Button>
          <Button size="sm" variant="outline" icon={<Download className="size-4" />} disabled={!svg} onClick={() => raster('image/jpeg')}>JPG</Button>
          <CopyButton text={svg} label="Copy SVG" />
        </div>
      </>}
    />
  )
}
