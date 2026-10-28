import { useMemo, useState } from 'react'
import { FilePlus, FileStack, X } from 'lucide-react'
import { Button, Dropzone, Field, Input, ResultCard, Segmented, Select, Slider, ToolGrid, Progress, ErrorNote, Spinner, useJob, cn } from '@/components/ui'
import { usePdfThumbs } from '@/components/PdfThumbs'
import { pdfBlob } from '@/lib/pdf'
import { baseName, parsePageRanges, formatBytes } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, PDF_ACCEPT, Thumb, ops, readBytes, motion } from './_core/kit'
import type { Insertion } from './_core/ops'

type Where = 'after' | 'every' | 'start' | 'end'
type SizeOpt = 'match' | 'A4' | 'Letter' | 'A4L' | 'LetterL'
const SIZES: Record<Exclude<SizeOpt, 'match'>, [number, number]> = { A4: [595.28, 841.89], Letter: [612, 792], A4L: [841.89, 595.28], LetterL: [792, 612] }

export default function AddBlankPages() {
  const [file, setFile] = useState<File | null>(null)
  const { thumbs, numPages, error, loading } = usePdfThumbs(file)
  const [mode, setMode] = useState<'blank' | 'pdf'>('blank')
  const [where, setWhere] = useState<Where>('after')
  const [after, setAfter] = useState('1')
  const [everyN, setEveryN] = useState(1)
  const [count, setCount] = useState(1)
  const [size, setSize] = useState<SizeOpt>('match')
  const [other, setOther] = useState<File | null>(null)
  const ot = usePdfThumbs(other)
  const [otherRange, setOtherRange] = useState('')
  const [result, setResult] = useState<Blob | null>(null)
  const job = useJob()
  const reset = () => { setFile(null); setOther(null); setResult(null) }
  const d = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setResult(null) }

  const positions = useMemo(() => {
    if (!numPages) return [] as number[]
    if (where === 'start') return [0]
    if (where === 'end') return [numPages]
    if (where === 'every') { const p: number[] = []; for (let i = everyN; i <= numPages; i += everyN) p.push(i); return p }
    const set = new Set<number>()
    for (const part of after.split(/[,\s]+/).filter(Boolean)) { const n = parseInt(part); if (!isNaN(n) && n >= 0 && n <= numPages) set.add(n) }
    return [...set].sort((a, b) => a - b)
  }, [where, after, everyN, numPages])

  const otherIdx = useMemo(() => (ot.numPages ? (otherRange.trim() ? parsePageRanges(otherRange, ot.numPages) : Array.from({ length: ot.numPages }, (_, i) => i)) : []), [otherRange, ot.numPages])

  // preview sequence
  type Cell = { kind: 'orig'; i: number } | { kind: 'blank' } | { kind: 'ins'; i: number }
  const seq = useMemo(() => {
    const out: Cell[] = []
    const ins = new Map<number, number>(); positions.forEach((p) => ins.set(p, (ins.get(p) ?? 0) + 1))
    const addIns = (at: number) => { if (!ins.has(at)) return; if (mode === 'blank') for (let c = 0; c < count; c++) out.push({ kind: 'blank' }); else otherIdx.forEach((i) => out.push({ kind: 'ins', i })) }
    for (let i = 0; i <= numPages; i++) { addIns(i); if (i < numPages) out.push({ kind: 'orig', i }) }
    return out
  }, [positions, mode, count, otherIdx, numPages])

  const ready = positions.length > 0 && (mode === 'blank' || (other && otherIdx.length > 0))

  const run = () => job.run(async (setP) => {
    if (!file) return
    if (!positions.length) throw new Error('Choose where to insert (e.g. after page 2).')
    const o = await ops()
    let insertions: Insertion[]
    if (mode === 'blank') insertions = positions.map((at) => ({ at, kind: 'blank' as const, count, size: size === 'match' ? undefined : SIZES[size] }))
    else {
      if (!other) throw new Error('Choose the PDF to insert.')
      if (!otherIdx.length) throw new Error('The page range for the inserted PDF matches no pages.')
      const ob = await readBytes(other)
      insertions = positions.map((at) => ({ at, kind: 'pdf' as const, bytes: ob, indices: otherIdx }))
    }
    setResult(pdfBlob(await o.insertPages(await readBytes(file), insertions))); setP(1)
    toast(`Inserted ${seq.length - numPages} page${seq.length - numPages === 1 ? '' : 's'}`, 'success')
  })

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop the PDF you want to insert pages into" />

  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={reset} />
      {result && <ResultCard blob={result} filename={`${baseName(file.name)}-inserted.pdf`} title={`${seq.length} pages in the new document`} onReset={reset} />}
      <ToolGrid
        main={<div className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between text-sm"><span className="font-medium">Result preview</span><span className="text-muted">{numPages} → <span className="font-semibold text-fg">{seq.length}</span> pages</span></div>
          {error ? <div className="text-sm text-danger">{error}</div> : <>
            {loading && <div className="mb-3"><Spinner label={`Rendering pages… ${thumbs.length}/${numPages || '?'}`} /></div>}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2.5">
              {seq.map((c, k) => (
                <motion.div key={`${c.kind}-${k}`} layout="position" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.18 }}>
                  {c.kind === 'orig' ? <Thumb src={thumbs[c.i]} label={<span><span className="font-mono text-fg/60">{k + 1}</span> · p{c.i + 1}</span>} />
                    : c.kind === 'ins' ? <Thumb src={ot.thumbs[c.i]} className="!border-accent/70 bg-accent/5" label={<span className="text-accent"><span className="font-mono">{k + 1}</span> · new p{c.i + 1}</span>} />
                      : <Thumb className="!border-dashed !border-accent/70 bg-accent/5" label={<span className="text-accent"><span className="font-mono">{k + 1}</span> · blank</span>}>
                        <div className="pointer-events-none absolute inset-2 bottom-7 grid place-items-center"><div className="grid aspect-[3/4] h-[85%] place-items-center rounded-sm bg-white text-accent shadow"><FilePlus className="size-5" /></div></div>
                      </Thumb>}
                </motion.div>
              ))}
            </div>
          </>}
        </div>}
        side={<>
          <Segmented value={mode} onChange={d(setMode)} className="w-full" options={[{ value: 'blank', label: 'Blank pages' }, { value: 'pdf', label: 'Pages from a PDF' }]} />
          {mode === 'pdf' && (other ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/50 px-3 py-2">
                <FileStack className="size-4 shrink-0 text-accent" />
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{other.name}</div><div className="text-xs text-muted">{formatBytes(other.size)} · {ot.numPages || '…'} pages</div></div>
                <button onClick={() => { setOther(null); setResult(null) }} className="rounded-lg p-1 text-muted hover:text-danger cursor-pointer" aria-label="Remove"><X className="size-4" /></button>
              </div>
              {ot.error && <div className="text-xs text-danger">{ot.error}</div>}
              <Field label="Pages to insert" hint={`${otherIdx.length} page${otherIdx.length === 1 ? '' : 's'}`}><Input value={otherRange} placeholder="All pages" onChange={(e) => { setOtherRange(e.target.value); setResult(null) }} /></Field>
            </div>
          ) : <Dropzone compact accept={PDF_ACCEPT} onFiles={(f) => { setOther(f[0]); setResult(null) }} label="Choose PDF to insert" sub="Its pages are copied in at the chosen position" />)}
          <Field label="Insert">
            <Select value={where} onChange={d(setWhere)} options={[{ value: 'after', label: 'After specific pages' }, { value: 'every', label: 'After every N pages' }, { value: 'start', label: 'At the beginning' }, { value: 'end', label: 'At the end' }]} />
          </Field>
          {where === 'after' && <Field label="After page(s)" hint="0 = before page 1"><Input value={after} onChange={(e) => { setAfter(e.target.value); setResult(null) }} placeholder="e.g. 1, 4, 7" /></Field>}
          {where === 'every' && <Slider label="Every N pages" value={everyN} min={1} max={Math.max(2, Math.min(20, numPages))} onChange={d(setEveryN)} suffix={` → ${positions.length}×`} />}
          {mode === 'blank' && <>
            <Slider label="Blank pages per insertion" value={count} min={1} max={10} onChange={d(setCount)} />
            <Field label="Blank page size"><Select value={size} onChange={d(setSize)} options={[{ value: 'match', label: 'Match neighbouring page' }, { value: 'A4', label: 'A4 portrait' }, { value: 'A4L', label: 'A4 landscape' }, { value: 'Letter', label: 'Letter portrait' }, { value: 'LetterL', label: 'Letter landscape' }]} /></Field>
          </>}
          <div className={cn('text-xs', positions.length ? 'text-muted' : 'text-warn')}>{positions.length ? `${positions.length} insertion point${positions.length > 1 ? 's' : ''}` : 'No valid insertion point yet'}</div>
          {job.busy && <Progress value={job.progress} label="Inserting…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<FilePlus className="size-5" />} loading={job.busy} disabled={!numPages || !ready} onClick={run}>Insert pages</Button>
        </>}
      />
    </div>
  )
}
