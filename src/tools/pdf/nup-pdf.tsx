import { useState } from 'react'
import { Grid2x2, BookOpen } from 'lucide-react'
import { Button, Dropzone, Field, ResultCard, Segmented, Select, Slider, Switch, ToolGrid, Progress, ErrorNote, useJob, Label, cn } from '@/components/ui'
import { pdfBlob } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, LivePreview, PDF_ACCEPT, ops, readBytes, usePdfDoc } from './_core/kit'
import type { NupOpts } from './_core/ops'

type Per = NupOpts['perSheet']
const PER: Per[] = [2, 4, 6, 8, 9, 16]
const SHEET_SIZES: Record<string, [number, number]> = { A4: [595.28, 841.89], Letter: [612, 792], A3: [841.89, 1190.55], Legal: [612, 1008], A5: [419.53, 595.28] }
const GRID: Record<Per, [number, number]> = { 2: [1, 2], 4: [2, 2], 6: [2, 3], 8: [2, 4], 9: [3, 3], 16: [4, 4] }

function bookletPairs(n: number) {
  const total = Math.ceil(n / 4) * 4
  const pairs: [number, number][] = []
  for (let i = 0; i < total / 4; i++) { pairs.push([total - 1 - 2 * i, 2 * i]); pairs.push([2 * i + 1, total - 2 - 2 * i]) }
  return pairs.map(([a, b]) => [a < n ? a : -1, b < n ? b : -1] as [number, number])
}

export default function NupPdf() {
  const [file, setFile] = useState<File | null>(null)
  const { numPages, error } = usePdfDoc(file)
  const [mode, setMode] = useState<'nup' | 'booklet'>('nup')
  const [per, setPer] = useState<Per>(4)
  const [sheet, setSheet] = useState('A4')
  const [orientation, setOrientation] = useState<NupOpts['orientation']>('auto')
  const [margin, setMargin] = useState(18)
  const [gap, setGap] = useState(10)
  const [border, setBorder] = useState(true)
  const [order, setOrder] = useState<'row' | 'col'>('row')
  const [preview, setPreview] = useState(0)
  const [result, setResult] = useState<Blob | null>(null)
  const job = useJob()
  const reset = () => { setFile(null); setResult(null); setPreview(0) }
  const d = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setResult(null); setPreview(0) }

  const nupOpts = (): NupOpts => ({ perSheet: per, sheet: SHEET_SIZES[sheet], orientation, margin, gap, border, order })
  const pairs = numPages ? bookletPairs(numPages) : []
  const sheetsOut = mode === 'nup' ? Math.ceil(numPages / per) : pairs.length
  const deps = [mode, per, sheet, orientation, margin, gap, border, order]

  const run = () => job.run(async (setP) => {
    if (!file) return
    const o = await ops()
    const bytes = await readBytes(file)
    setP(0.2)
    const out = mode === 'nup' ? await o.nup(bytes, nupOpts()) : await o.booklet(bytes, { sheet: SHEET_SIZES[sheet], margin, gap, border })
    setResult(pdfBlob(out)); setP(1); toast(mode === 'nup' ? `${numPages} pages on ${sheetsOut} sheets` : `Booklet ready · ${pairs.length / 2} sheets`, 'success')
  })

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to impose" />

  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={reset} />
      {result && <ResultCard blob={result} filename={`${baseName(file.name)}-${mode === 'nup' ? `${per}up` : 'booklet'}.pdf`} title={mode === 'nup' ? `${sheetsOut} sheet${sheetsOut > 1 ? 's' : ''} (${per}-up)` : `Booklet · ${pairs.length} sides`} onReset={reset} />}
      <ToolGrid
        main={error ? <div className="text-sm text-danger">{error}</div> : numPages ? (
          mode === 'nup'
            ? <LivePreview file={file} pageIndex={preview} setPageIndex={setPreview} total={sheetsOut} deps={deps}
              extractPages={(s) => Array.from({ length: Math.min(per, numPages - s * per) }, (_, k) => s * per + k)}
              build={async (b) => (await ops()).nup(b, nupOpts())}
              note={`Sheet ${preview + 1} of ${sheetsOut}`} />
            : <LivePreview file={file} pageIndex={preview} setPageIndex={setPreview} total={pairs.length} deps={deps}
              extractPages={(s) => pairs[s].filter((i) => i >= 0)}
              build={async (b, s) => { const [l, r] = pairs[s]; const local: [number, number] = [l >= 0 ? 0 : -1, r >= 0 ? (l >= 0 ? 1 : 0) : -1]; return (await ops()).booklet(b, { sheet: SHEET_SIZES[sheet], margin, gap, border, pairs: [local] }) }}
              note={<>Sheet {Math.floor(preview / 2) + 1}, {preview % 2 ? 'back' : 'front'} · pages {pairs[preview]?.map((i) => (i < 0 ? 'blank' : i + 1)).join(' + ')}. Print double-sided (flip on short edge), fold in half and staple.</>} />
        ) : null}
        side={<>
          <Segmented value={mode} onChange={d(setMode)} className="w-full" options={[{ value: 'nup', label: <span className="inline-flex items-center gap-1.5"><Grid2x2 className="size-3.5" />N-up</span> }, { value: 'booklet', label: <span className="inline-flex items-center gap-1.5"><BookOpen className="size-3.5" />Booklet</span> }]} />
          {mode === 'nup' && <div>
            <Label>Pages per sheet</Label>
            <div className="grid grid-cols-3 gap-2">
              {PER.map((n) => {
                const [c, r] = GRID[n]
                return (
                  <button key={n} type="button" onClick={() => d(setPer)(n)} className={cn('flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition cursor-pointer', per === n ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50')}>
                    <div className="grid aspect-[3/4] w-8 gap-0.5 rounded-sm border border-border bg-surface p-0.5" style={{ gridTemplateColumns: `repeat(${c}, 1fr)`, gridTemplateRows: `repeat(${r}, 1fr)` }}>
                      {Array.from({ length: n }, (_, i) => <div key={i} className={cn('rounded-[1px]', per === n ? 'bg-accent/60' : 'bg-border')} />)}
                    </div>
                    <span className="text-xs font-semibold">{n}-up</span>
                  </button>
                )
              })}
            </div>
          </div>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sheet size"><Select value={sheet} onChange={d(setSheet)} options={Object.keys(SHEET_SIZES)} /></Field>
            {mode === 'nup' ? <Field label="Orientation"><Select value={orientation} onChange={d(setOrientation)} options={[{ value: 'auto', label: 'Auto' }, { value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]} /></Field>
              : <Field label="Orientation"><div className="flex h-10 items-center text-sm text-muted">Landscape</div></Field>}
          </div>
          {mode === 'nup' && <Field label="Page order"><Segmented value={order} onChange={d(setOrder)} className="w-full" options={[{ value: 'row', label: 'Across, then down' }, { value: 'col', label: 'Down, then across' }]} /></Field>}
          <Slider label="Outer margin" value={margin} min={0} max={72} onChange={d(setMargin)} suffix="pt" />
          <Slider label={mode === 'nup' ? 'Gap between pages' : 'Gutter (spine)'} value={gap} min={0} max={48} onChange={d(setGap)} suffix="pt" />
          <Switch checked={border} onChange={d(setBorder)} label="Draw page borders" />
          <div className="rounded-xl bg-surface-2/60 p-3 text-xs text-muted">{numPages} pages → <span className="font-semibold text-fg">{mode === 'nup' ? `${sheetsOut} sheet${sheetsOut === 1 ? '' : 's'}` : `${pairs.length / 2 || 0} sheet${pairs.length / 2 === 1 ? '' : 's'} (${pairs.length} sides${numPages % 4 ? `, ${4 - (numPages % 4)} blank added` : ''})`}</span>. Pages stay vector, text remains sharp and selectable.</div>
          {job.busy && <Progress value={job.progress} label="Imposing…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={mode === 'nup' ? <Grid2x2 className="size-5" /> : <BookOpen className="size-5" />} loading={job.busy} disabled={!numPages} onClick={run}>{mode === 'nup' ? `Create ${per}-up PDF` : 'Create booklet'}</Button>
        </>}
      />
    </div>
  )
}
