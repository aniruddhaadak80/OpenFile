import { useEffect, useMemo, useState } from 'react'
import { FileCode2, ArrowUp, ArrowDown, X } from 'lucide-react'
import { Button, Dropzone, ResultCard, Segmented, Slider, ToolGrid, Progress, ErrorNote, Field, useJob } from '@/components/ui'
import { baseName, formatBytes } from '@/lib/files'
import { toast } from '@/components/toast'
import type { SvgInfo, SvgPage } from './_b1/svg'

type Item = { id: string; file: File; info?: SvgInfo; error?: string; url: string }

export default function SvgToPdf() {
  const [items, setItems] = useState<Item[]>([])
  const [page, setPage] = useState<SvgPage>('match')
  const [orientation, setOrientation] = useState<'auto' | 'portrait' | 'landscape'>('auto')
  const [margin, setMargin] = useState(0)
  const [result, setResult] = useState<Blob | null>(null)
  const job = useJob()
  const add = async (files: File[]) => {
    const { svgSize } = await import('./_b1/svg')
    const next: Item[] = []
    for (const f of files) {
      const it: Item = { id: Math.random().toString(36).slice(2), file: f, url: URL.createObjectURL(f) }
      try { it.info = svgSize(await f.text()) } catch (e: any) { it.error = e.message }
      next.push(it)
    }
    setItems((x) => [...x, ...next]); setResult(null)
  }
  useEffect(() => () => items.forEach((i) => URL.revokeObjectURL(i.url)), []) // eslint-disable-line
  const good = useMemo(() => items.filter((i) => i.info), [items])
  const move = (i: number, d: number) => { setItems((a) => { const b = [...a]; const j = i + d; if (j < 0 || j >= b.length) return b; [b[i], b[j]] = [b[j], b[i]]; return b }); setResult(null) }
  const run = () => job.run(async (setP) => {
    const { svgsToPdf } = await import('./_b1/svg')
    setResult(await svgsToPdf(good.map((g) => g.info!), { page, margin: margin * 72 / 25.4, orientation, onProgress: setP })); toast('PDF ready', 'success')
  })
  const reset = () => { setItems([]); setResult(null) }
  const ch = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setResult(null) }
  if (!items.length) return <Dropzone multiple accept=".svg,image/svg+xml" onFiles={add} label="Drop one or more SVG files" sub="Shapes, paths, gradients and text stay as sharp vectors in the PDF." />
  return (
    <div className="space-y-4">
      {result && <ResultCard blob={result} filename={`${items.length === 1 ? baseName(items[0].file.name) : 'svg-images'}.pdf`} title="Vector PDF ready" onReset={reset} />}
      <ToolGrid
        main={<div className="space-y-3">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
            {items.map((it, i) => (
              <div key={it.id} className="overflow-hidden rounded-xl border border-border bg-surface">
                <div className="checker grid aspect-square place-items-center p-2">{it.error ? <span className="p-2 text-center text-xs text-danger">{it.error}</span> : <img src={it.url} alt="" className="max-h-full max-w-full" />}</div>
                <div className="flex items-center gap-1 p-2 text-[11px]">
                  <div className="min-w-0 flex-1"><div className="truncate font-medium">{it.file.name}</div><div className="text-muted">{it.info ? `${Math.round(it.info.w)} × ${Math.round(it.info.h)} pt` : ''} · {formatBytes(it.file.size)}</div></div>
                  <button type="button" aria-label="Move earlier" onClick={() => move(i, -1)} className="rounded p-1 text-muted hover:text-fg cursor-pointer"><ArrowUp className="size-3.5" /></button>
                  <button type="button" aria-label="Move later" onClick={() => move(i, 1)} className="rounded p-1 text-muted hover:text-fg cursor-pointer"><ArrowDown className="size-3.5" /></button>
                  <button type="button" aria-label="Remove" onClick={() => { setItems((a) => a.filter((x) => x.id !== it.id)); setResult(null) }} className="rounded p-1 text-muted hover:text-danger cursor-pointer"><X className="size-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
          <Dropzone compact multiple accept=".svg,image/svg+xml" onFiles={add} label="Add more SVG files" />
        </div>}
        side={<>
          <Field label="Page size"><Segmented value={page} onChange={ch(setPage)} options={[{ value: 'match', label: 'Same as SVG' }, { value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }, { value: 'a3', label: 'A3' }, { value: 'a5', label: 'A5' }]} /></Field>
          {page !== 'match' && <Field label="Orientation"><Segmented value={orientation} onChange={ch(setOrientation)} options={[{ value: 'auto', label: 'Auto' }, { value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]} /></Field>}
          <Slider label="Margin" value={margin} min={0} max={40} onChange={ch(setMargin)} suffix=" mm" />
          <div className="rounded-xl bg-surface-2/60 p-3 text-xs leading-relaxed text-muted">Each SVG becomes one page. Text uses standard PDF fonts; convert text to paths in your design app if you need an exact typeface. Filters such as blur are not supported by the vector engine.</div>
          {job.busy && <Progress value={job.progress} label="Converting…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<FileCode2 className="size-5" />} loading={job.busy} disabled={!good.length} onClick={run}>Create PDF ({good.length} page{good.length === 1 ? '' : 's'})</Button>
        </>}
      />
    </div>
  )
}
