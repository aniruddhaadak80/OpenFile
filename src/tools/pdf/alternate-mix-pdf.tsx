import { useState } from 'react'
import { Shuffle, ArrowUp, ArrowDown, X, ArrowDownUp } from 'lucide-react'
import { Button, Dropzone, ResultCard, Switch, ToolGrid, Progress, ErrorNote, Input, cn, useJob } from '@/components/ui'
import { pdfBlob } from '@/lib/pdf'
import { formatBytes } from '@/lib/files'
import { toast } from '@/components/toast'
import { PDF_ACCEPT, usePdfThumbsLite } from './_b1/thumbs'
import { core, readBytes, Note } from './_b1/ui'

type Src = { id: string; file: File; reverse: boolean; take: number; pages?: number }

export default function AlternateMixPdf() {
  const [srcs, setSrcs] = useState<Src[]>([])
  const [loopRest, setLoopRest] = useState(true)
  const [result, setResult] = useState<{ blob: Blob; plan: [number, number][] } | null>(null)
  const job = useJob()
  const add = async (files: File[]) => {
    const C = await core()
    const next: Src[] = []
    for (const f of files) {
      let pages: number | undefined
      try { pages = (await C.open(await readBytes(f))).getPageCount() } catch { toast(`${f.name} could not be read`, 'error'); continue }
      next.push({ id: Math.random().toString(36).slice(2), file: f, reverse: false, take: 1, pages })
    }
    setSrcs((s) => { const all = [...s, ...next]; if (all.length === 2 && s.length < 2 && !all[1].reverse) all[1] = { ...all[1], reverse: true }; return all }); setResult(null)
  }
  const upd = (id: string, p: Partial<Src>) => { setSrcs((s) => s.map((x) => (x.id === id ? { ...x, ...p } : x))); setResult(null) }
  const moveBy = (i: number, d: number) => { setSrcs((s) => { const a = [...s]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a }); setResult(null) }
  const run = () => job.run(async (setP) => {
    const C = await core(); setP(0.2)
    const r = await C.alternateMix(await Promise.all(srcs.map(async (s) => ({ bytes: await readBytes(s.file), reverse: s.reverse }))), { chunk: srcs.map((s) => s.take), loopRest })
    setResult({ blob: pdfBlob(r.bytes), plan: r.plan }); setP(1); toast('Pages interleaved', 'success')
  })
  const reset = () => { setSrcs([]); setResult(null) }
  const preview = planPreview(srcs, loopRest)
  if (!srcs.length) return <Dropzone multiple accept={PDF_ACCEPT} onFiles={add} label="Drop two PDFs: the front sides and the back sides" sub="Or several PDFs to mix page by page. Everything stays on your device." />
  const COLORS = ['#F5A524', '#2DD4BF', '#38BDF8', '#84CC16', '#FB923C', '#22D3EE']
  return (
    <div className="space-y-4">
      {result && <ResultCard blob={result.blob} filename="mixed.pdf" title={`Mixed PDF with ${result.plan.length} pages`} onReset={reset} />}
      <ToolGrid
        main={<div className="space-y-3">
          {srcs.map((s, i) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-3">
              <span className="grid size-8 place-items-center rounded-lg text-sm font-bold text-black" style={{ background: COLORS[i % COLORS.length] }}>{String.fromCharCode(65 + i)}</span>
              <SrcThumb file={s.file} />
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{s.file.name}</div><div className="text-xs text-muted">{formatBytes(s.file.size)} · {s.pages} pages</div></div>
              <label className="flex items-center gap-1.5 text-xs text-muted">Take<Input type="number" min={1} max={50} value={s.take} onChange={(e) => upd(s.id, { take: Math.max(1, Number(e.target.value) || 1) })} className="h-8 w-16" /></label>
              <Button size="sm" variant={s.reverse ? 'primary' : 'outline'} icon={<ArrowDownUp className="size-3.5" />} onClick={() => upd(s.id, { reverse: !s.reverse })} aria-pressed={s.reverse}>{s.reverse ? 'Reversed' : 'Reverse'}</Button>
              <div className="flex">
                <button className="rounded-lg p-1.5 text-muted hover:bg-surface-2 cursor-pointer" aria-label="Move up" onClick={() => moveBy(i, -1)}><ArrowUp className="size-4" /></button>
                <button className="rounded-lg p-1.5 text-muted hover:bg-surface-2 cursor-pointer" aria-label="Move down" onClick={() => moveBy(i, 1)}><ArrowDown className="size-4" /></button>
                <button className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger cursor-pointer" aria-label="Remove" onClick={() => { setSrcs((x) => x.filter((y) => y.id !== s.id)); setResult(null) }}><X className="size-4" /></button>
              </div>
            </div>
          ))}
          <Dropzone compact multiple accept={PDF_ACCEPT} onFiles={add} label="Add another PDF" />
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">New page order</div>
            <div className="flex flex-wrap gap-1">
              {preview.slice(0, 120).map(([k, p], i) => <span key={i} className="rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold text-black" style={{ background: COLORS[k % COLORS.length] }}>{String.fromCharCode(65 + k)}{p + 1}</span>)}
              {preview.length > 120 && <span className="text-xs text-muted">and {preview.length - 120} more</span>}
            </div>
          </div>
        </div>}
        side={<>
          <Switch checked={loopRest} onChange={(v) => { setLoopRest(v); setResult(null) }} label="Keep alternating when one file runs out" />
          <Note>Scanned a double-sided stack on a one-sided scanner? Scan the fronts, flip the stack, scan the backs, then drop both files here. The backs come out in reverse, so the second file is reversed for you.</Note>
          {job.busy && <Progress value={job.progress} label="Mixing…" />}
          <ErrorNote error={job.error} />
          <Button className={cn('w-full')} size="lg" icon={<Shuffle className="size-5" />} loading={job.busy} disabled={srcs.length < 2} onClick={run}>Mix pages</Button>
          {srcs.length < 2 && <div className="text-center text-xs text-muted">Add at least two PDFs.</div>}
        </>}
      />
    </div>
  )
}

function SrcThumb({ file }: { file: File }) {
  const t = usePdfThumbsLite(file, 1)
  return <div className="grid h-12 w-9 place-items-center overflow-hidden rounded border border-border bg-white">{t[0] && <img src={t[0]} alt="" className="max-h-full max-w-full" />}</div>
}

function planPreview(srcs: Src[], loopRest: boolean): [number, number][] {
  const orders = srcs.map((s) => { const a = Array.from({ length: s.pages ?? 0 }, (_, i) => i); return s.reverse ? a.reverse() : a })
  const pos = orders.map(() => 0); const plan: [number, number][] = []
  let guard = 0
  while (pos.some((p, k) => p < orders[k].length) && guard++ < 100000) {
    for (let k = 0; k < orders.length; k++) for (let t = 0; t < srcs[k].take && pos[k] < orders[k].length; t++) plan.push([k, orders[k][pos[k]++]])
    if (!loopRest && pos.some((p, k) => p >= orders[k].length)) for (let k = 0; k < orders.length; k++) while (pos[k] < orders[k].length) plan.push([k, orders[k][pos[k]++]])
  }
  return plan
}
