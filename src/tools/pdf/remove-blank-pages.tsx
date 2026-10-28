import { useEffect, useMemo, useState } from 'react'
import { FileX2, Undo2 } from 'lucide-react'
import { Button, Dropzone, ResultCard, Slider, Switch, ToolGrid, Progress, ErrorNote, Spinner, cn, useJob } from '@/components/ui'
import { pdfBlob, renderPage } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, PDF_ACCEPT, usePdfDoc, Thumb } from './_core/kit'
import { Note } from './_b1/ui'
import { inkRatio } from './_b1/pixels'

type Stat = { thumb: string; ink: number; text: number }

export default function RemoveBlankPages() {
  const [file, setFile] = useState<File | null>(null)
  const { doc, numPages, error } = usePdfDoc(file)
  const [stats, setStats] = useState<Stat[]>([])
  const [sens, setSens] = useState(60)
  const [useText, setUseText] = useState(true)
  const [manual, setManual] = useState<Record<number, boolean>>({})
  const [result, setResult] = useState<{ blob: Blob; removed: number } | null>(null)
  const scan = useJob(), job = useJob()
  const reset = () => { setFile(null); setStats([]); setManual({}); setResult(null) }

  useEffect(() => {
    if (!doc) return
    let cancel = false
    scan.run(async (setP) => {
      const out: Stat[] = []
      for (let i = 1; i <= doc.numPages; i++) {
        const c = await renderPage(doc, i, 0.4)
        const ctx = c.getContext('2d')!
        const d = ctx.getImageData(0, 0, c.width, c.height)
        const tc = await (await doc.getPage(i)).getTextContent()
        const text = (tc.items as any[]).reduce((s, it) => s + (it.str?.trim().length ?? 0), 0)
        if (cancel) return
        out.push({ thumb: c.toDataURL('image/jpeg', 0.6), ink: inkRatio(d.data, c.width, c.height), text })
        setStats([...out]); setP(i / doc.numPages)
      }
    })
    return () => { cancel = true }
  }, [doc]) // eslint-disable-line

  // sensitivity 0..100 maps to an ink limit of 0.05% .. 2.5%
  const limit = useMemo(() => 0.0005 + (sens / 100) ** 2 * 0.025, [sens])
  const auto = (s: Stat) => s.ink <= limit && (!useText || s.text < 3)
  const isBlank = (i: number) => manual[i] ?? (stats[i] ? auto(stats[i]) : false)
  const blanks = stats.map((_, i) => i).filter(isBlank)

  const run = () => job.run(async (setP) => {
    if (!file) return
    if (blanks.length >= numPages) throw new Error('Every page is marked as blank. Lower the sensitivity or unmark some pages.')
    const { pick } = await import('./_core/ops')
    const keep = Array.from({ length: numPages }, (_, i) => i).filter((i) => !isBlank(i))
    setP(0.4)
    const out = await pick(new Uint8Array(await file.arrayBuffer()), keep)
    setResult({ blob: pdfBlob(out), removed: blanks.length }); setP(1); toast(`Removed ${blanks.length} blank page${blanks.length === 1 ? '' : 's'}`, 'success')
  })

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a scanned PDF to find and remove blank pages" />
  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={reset} />
      {error && <ErrorNote error={error} />}
      {result && <ResultCard blob={result.blob} filename={`${baseName(file.name)}-no-blanks.pdf`} originalSize={file.size} title={`Removed ${result.removed} page${result.removed === 1 ? '' : 's'}`} onReset={reset} />}
      <ToolGrid
        main={<div className="space-y-3">
          {scan.busy && <Progress value={scan.progress} label={`Checking pages… ${stats.length}/${numPages || '?'}`} />}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3">
            {stats.map((s, i) => (
              <Thumb key={i} src={s.thumb} dim={isBlank(i)} selected={isBlank(i)} onClick={() => { setManual((m) => ({ ...m, [i]: !isBlank(i) })); setResult(null) }}
                label={<span className={cn(isBlank(i) && 'text-danger')}>{i + 1} · {(s.ink * 100).toFixed(2)}%{manual[i] !== undefined ? ' · set by you' : ''}</span>} className={isBlank(i) ? '!border-danger !ring-danger/20' : ''} />
            ))}
          </div>
          {!scan.busy && !stats.length && !error && <Spinner label="Opening…" />}
        </div>}
        side={<>
          <div className="text-sm"><span className="font-mono text-2xl font-bold text-danger">{blanks.length}</span> <span className="text-muted">of {numPages} pages marked as blank</span></div>
          <Slider label="Sensitivity" value={sens} min={0} max={100} onChange={(v) => { setSens(v); setResult(null) }} />
          <div className="-mt-3 text-xs text-muted">Pages with less than {(limit * 100).toFixed(2)}% ink count as blank. Raise it for noisy scans.</div>
          <Switch checked={useText} onChange={(v) => { setUseText(v); setResult(null) }} label="Never remove pages that contain text" />
          {Object.keys(manual).length > 0 && <Button size="sm" variant="ghost" icon={<Undo2 className="size-3.5" />} onClick={() => setManual({})}>Clear manual choices</Button>}
          <Note>Click any page to mark or unmark it. The percentage under each page shows how much of it is not white.</Note>
          {job.busy && <Progress value={job.progress} label="Removing…" />}
          <ErrorNote error={job.error || scan.error} />
          <Button className="w-full" size="lg" icon={<FileX2 className="size-5" />} loading={job.busy} disabled={!blanks.length || scan.busy} onClick={run}>Remove {blanks.length || ''} blank page{blanks.length === 1 ? '' : 's'}</Button>
        </>}
      />
    </div>
  )
}
