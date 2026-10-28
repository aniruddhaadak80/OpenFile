import { useState } from 'react'
import { RotateCw, RotateCcw, FlipVertical2, Undo2 } from 'lucide-react'
import { Button, Dropzone, ResultCard, ToolGrid, Progress, ErrorNote, Spinner, useJob, Label } from '@/components/ui'
import { usePdfThumbs } from '@/components/PdfThumbs'
import { pdfBlob } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, PDF_ACCEPT, SelectGrid, SelectionBar, ThumbAction, ops, readBytes } from './_core/kit'

export default function RotatePdf() {
  const [file, setFile] = useState<File | null>(null)
  const { thumbs, numPages, error, loading } = usePdfThumbs(file)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [rot, setRot] = useState<Record<number, number>>({})
  const [result, setResult] = useState<Blob | null>(null)
  const job = useJob()
  const reset = () => { setFile(null); setSel(new Set()); setRot({}); setResult(null) }

  const apply = (deg: number, pages?: number[]) => {
    const targets = pages ?? (sel.size ? [...sel] : Array.from({ length: numPages }, (_, i) => i))
    setRot((r) => { const n = { ...r }; targets.forEach((i) => (n[i] = ((n[i] ?? 0) + deg + 360) % 360)); return n })
    setResult(null)
  }
  const changed = Object.values(rot).filter(Boolean).length
  const scope = sel.size ? `${sel.size} selected` : 'all pages'

  const run = () => job.run(async (setP) => {
    if (!file) return
    if (!changed) throw new Error('Rotate at least one page first.')
    const o = await ops()
    setResult(pdfBlob(await o.rotate(await readBytes(file), rot))); setP(1)
    toast(`Rotated ${changed} page${changed > 1 ? 's' : ''}`, 'success')
  })

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to rotate" />

  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={reset} />
      {result && <ResultCard blob={result} filename={`${baseName(file.name)}-rotated.pdf`} title={`${changed} page${changed > 1 ? 's' : ''} rotated`} onReset={reset} />}
      <ToolGrid
        main={<div className="rounded-2xl border border-border bg-surface p-4">
          {error ? <div className="text-sm text-danger">{error}</div> : <>
            {loading && <div className="mb-3"><Spinner label={`Rendering pages… ${thumbs.length}/${numPages || '?'}`} /></div>}
            <SelectGrid thumbs={thumbs} numPages={numPages} selected={sel} setSelected={setSel} rotations={rot}
              labels={(i) => <span>Page {i + 1}{rot[i] ? <span className="ml-1 font-mono text-accent">{rot[i]}°</span> : null}</span>}
              overlay={(i) => (
                <div className="absolute inset-x-0 bottom-8 flex justify-center gap-1 opacity-0 transition group-hover:opacity-100 max-sm:opacity-100">
                  <ThumbAction title="Rotate left" onClick={() => apply(-90, [i])}><RotateCcw className="size-3.5" /></ThumbAction>
                  <ThumbAction title="Rotate right" onClick={() => apply(90, [i])}><RotateCw className="size-3.5" /></ThumbAction>
                </div>
              )} />
          </>}
        </div>}
        side={<>
          <div>
            <Label hint={scope}>Rotate</Label>
            <div className="grid grid-cols-3 gap-2">
              {[[90, 'Right 90°', RotateCw], [180, '180°', FlipVertical2], [270, 'Left 90°', RotateCcw]].map(([d, l, Icon]: any) => (
                <button key={d} type="button" onClick={() => apply(d)} className="flex flex-col items-center gap-1.5 rounded-xl border border-border p-3 text-xs font-medium transition hover:border-accent hover:bg-accent/5 hover:text-accent cursor-pointer">
                  <Icon className="size-5" />{l}
                </button>
              ))}
            </div>
          </div>
          <div><Label>Select pages (optional)</Label><SelectionBar total={numPages} selected={sel} setSelected={setSel} /></div>
          {changed > 0 && <Button variant="ghost" size="sm" icon={<Undo2 className="size-4" />} onClick={() => { setRot({}); setResult(null) }}>Reset rotations ({changed})</Button>}
          {job.busy && <Progress value={job.progress} label="Rotating…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<RotateCw className="size-5" />} loading={job.busy} disabled={!changed} onClick={run}>
            {changed ? `Save ${changed} rotated page${changed > 1 ? 's' : ''}` : 'Rotate pages to continue'}
          </Button>
        </>}
      />
    </div>
  )
}
