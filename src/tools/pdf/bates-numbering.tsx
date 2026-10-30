import { useMemo, useState } from 'react'
import { Hash, ArrowUp, ArrowDown, X } from 'lucide-react'
import { Button, Dropzone, Field, Input, Select, Slider, Switch, ToolGrid, Progress, ErrorNote, useJob, Label } from '@/components/ui'
import { pdfBlob } from '@/lib/pdf'
import { baseName, formatBytes } from '@/lib/files'
import { ColorInput, PositionPicker, LivePreview, PDF_ACCEPT, readBytes, usePdfDoc, FONTS_LIST, MultiResult, type OutFile } from './_core/kit'
import { batesNumber, batesLabel, type Pos9, type Font } from '@/lib/b14/pdf'
import { OpenButton } from '@/lib/b14/ui'
import { toCsv, DlButton } from '@/lib/bcat/kit'

const POS: Pos9[] = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br']

export default function BatesNumbering() {
  const [files, setFiles] = useState<File[]>([])
  const first = files[0] ?? null
  const { numPages } = usePdfDoc(first)
  const [prefix, setPrefix] = useState('ABC')
  const [suffix, setSuffix] = useState('')
  const [start, setStart] = useState(1)
  const [digits, setDigits] = useState(6)
  const [position, setPosition] = useState<Pos9>('br')
  const [size, setSize] = useState(10)
  const [color, setColor] = useState('#000000')
  const [font, setFont] = useState<Font>('Helvetica-Bold')
  const [margin, setMargin] = useState(24)
  const [box, setBox] = useState(true)
  const [preview, setPreview] = useState(0)
  const [out, setOut] = useState<{ files: OutFile[]; ranges: { name: string; first: string; last: string; pages: number }[] } | null>(null)
  const job = useJob()
  const o = { prefix, suffix, start, digits, position, size, color, font, margin, box }
  const deps = [prefix, suffix, start, digits, position, size, color, font, margin, box]
  const move = (i: number, d: number) => setFiles((p) => { const n = [...p], j = i + d; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j], n[i]]; return n })
  const run = () => job.run(async (setP) => {
    setOut(null)
    const bytes = []; for (let i = 0; i < files.length; i++) { bytes.push(await readBytes(files[i])); setP((i + 1) / files.length / 2) }
    const r = await batesNumber(bytes, o); setP(1)
    setOut({ files: r.outputs.map((b, i) => ({ name: `${baseName(files[i].name)}_${r.ranges[i].first}-${r.ranges[i].last}.pdf`, blob: pdfBlob(b), pages: r.ranges[i].pages })), ranges: r.ranges.map((x, i) => ({ ...x, name: files[i].name })) })
  })
  const sample = useMemo(() => batesLabel(start, o), [prefix, suffix, start, digits])
  if (!files.length) return <Dropzone multiple accept={PDF_ACCEPT} onFiles={setFiles} label="Drop one or more PDFs" sub="Every page gets a unique number like ABC000001, continuing from one file to the next, for legal discovery, audits and archives." />
  return (
    <div className="space-y-4">
      {out && <MultiResult files={out.files} zipName="bates-numbered.zip" onReset={() => setOut(null)} title={`Numbered ${out.ranges.reduce((a, r) => a + r.pages, 0)} pages in ${out.files.length} files`} />}
      <ToolGrid
        main={<>
          <div className="space-y-1.5">{files.map((f, i) => <div key={i} className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm"><span className="w-6 text-xs text-muted">{i + 1}</span><span className="min-w-0 flex-1 truncate">{f.name}</span><span className="text-xs text-muted">{formatBytes(f.size)}</span><Button size="sm" variant="ghost" aria-label="Move up" onClick={() => move(i, -1)}><ArrowUp className="size-4" /></Button><Button size="sm" variant="ghost" aria-label="Move down" onClick={() => move(i, 1)}><ArrowDown className="size-4" /></Button><Button size="sm" variant="ghost" aria-label="Remove" onClick={() => setFiles(files.filter((_, k) => k !== i))}><X className="size-4" /></Button></div>)}
            <OpenButton multiple accept={PDF_ACCEPT} onFiles={(f) => setFiles([...files, ...f])} label="Add PDFs" /></div>
          {first && numPages > 0 && <LivePreview file={first} pageIndex={preview} setPageIndex={setPreview} total={numPages} deps={deps} note="Preview of the first file. Numbers continue across all files in the order above."
            build={async (b, pi) => (await batesNumber([b], { ...o, start: start + pi })).outputs[0]} />}
          {out && <><Label>Number ranges</Label><div className="space-y-1">{out.ranges.map((r) => <div key={r.name} className="flex gap-2 text-xs"><span className="min-w-0 flex-1 truncate">{r.name}</span><span className="font-mono">{r.first} to {r.last}</span></div>)}</div><DlButton name="bates-log.csv" mime="text/csv" data={() => toCsv([['file', 'first', 'last', 'pages'], ...out.ranges.map((r) => [r.name, r.first, r.last, r.pages])])}>Download log (CSV)</DlButton></>}
        </>}
        side={<>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prefix"><Input value={prefix} onChange={(e) => setPrefix(e.target.value)} /></Field>
            <Field label="Suffix"><Input value={suffix} onChange={(e) => setSuffix(e.target.value)} /></Field>
            <Field label="Start number"><Input type="number" min={0} value={start} onChange={(e) => setStart(Math.max(0, Math.round(+e.target.value || 0)))} /></Field>
            <Field label="Digits"><Input type="number" min={1} max={12} value={digits} onChange={(e) => setDigits(Math.min(12, Math.max(1, Math.round(+e.target.value || 6))))} /></Field>
          </div>
          <p className="text-sm">First label: <span className="font-mono font-semibold">{sample}</span></p>
          <div className="grid grid-cols-[auto_1fr] items-start gap-4"><div><Label>Position</Label><PositionPicker value={position} onChange={setPosition} options={POS} rows={3} /></div><Field label="Font"><Select value={font} onChange={setFont} options={FONTS_LIST} /></Field></div>
          <Slider label="Size" value={size} onChange={setSize} min={6} max={24} suffix="pt" />
          <Slider label="Margin" value={margin} onChange={setMargin} min={6} max={80} suffix="pt" />
          <Field label="Colour"><ColorInput value={color} onChange={setColor} /></Field>
          <Switch checked={box} onChange={setBox} label="White box behind the number" />
          {job.busy && <Progress value={job.progress} label="Stamping" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<Hash className="size-5" />} loading={job.busy} onClick={run}>Add Bates numbers</Button>
        </>}
      />
    </div>
  )
}
