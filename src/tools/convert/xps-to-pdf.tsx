import { useEffect, useRef, useState } from 'react'
import { FileOutput } from 'lucide-react'
import { Button, Dropzone, ResultCard, Segmented, Slider, Switch, ToolGrid, Progress, ErrorNote, Field, Spinner, Input, useJob } from '@/components/ui'
import { baseName, parsePageRanges, zipFiles, canvasToBlob } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, PageStepper } from '../pdf/_core/kit'
import type { XpsDoc } from './_b1/xps'

type Out = 'pdf' | 'png' | 'svg'
const ACCEPT = '.xps,.oxps,application/vnd.ms-xpsdocument,application/oxps'

export default function XpsToPdf() {
  const [file, setFile] = useState<File | null>(null)
  const [doc, setDoc] = useState<XpsDoc | null>(null)
  const [page, setPage] = useState(0)
  const [out, setOut] = useState<Out>('pdf')
  const [dpi, setDpi] = useState(200)
  const [format, setFormat] = useState<'jpeg' | 'png'>('jpeg')
  const [textLayer, setTextLayer] = useState(true)
  const [range, setRange] = useState('')
  const [preview, setPreview] = useState<{ url: string; warnings: string[] } | null>(null)
  const [previewErr, setPreviewErr] = useState<string | null>(null)
  const [result, setResult] = useState<{ blob: Blob; name: string; warnings: string[] } | null>(null)
  const load = useJob(), job = useJob()
  const token = useRef(0)
  const total = doc?.pages.length ?? 0

  useEffect(() => {
    setDoc(null); setPage(0); setResult(null); setPreview(null)
    if (!file) return
    load.run(async () => { const { openXps } = await import('./_b1/xps'); setDoc(await openXps(file)) })
  }, [file]) // eslint-disable-line

  useEffect(() => {
    if (!doc) return
    const t = ++token.current
    setPreviewErr(null)
    ;(async () => {
      try {
        const { xpsPageToSvg } = await import('./_b1/xps')
        const p = await xpsPageToSvg(doc, page)
        if (t !== token.current) return
        const url = URL.createObjectURL(new Blob([p.svg], { type: 'image/svg+xml' }))
        setPreview((old) => { if (old) URL.revokeObjectURL(old.url); return { url, warnings: p.warnings } })
      } catch (e: any) { if (t === token.current) setPreviewErr(e?.message || 'Could not draw this page.') }
    })()
  }, [doc, page])

  const reset = () => { setFile(null); setDoc(null); setResult(null); setRange(''); load.setError(null) }
  const ch = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setResult(null) }

  const run = () => job.run(async (setP) => {
    if (!doc || !file) return
    const m = await import('./_b1/xps')
    const idx = range.trim() ? parsePageRanges(range, total) : Array.from({ length: total }, (_, i) => i)
    if (!idx.length) throw new Error('No pages match that range.')
    const base = baseName(file.name)
    if (out === 'pdf') {
      const r = await m.xpsToPdf(doc, { dpi, quality: format === 'png' ? 1 : 0.88, textLayer, indexes: idx, onProgress: setP })
      setResult({ blob: r.blob, name: `${base}.pdf`, warnings: r.warnings })
    } else {
      const files: { name: string; data: Blob | string }[] = []
      const warn = new Set<string>()
      const pad = String(total).length
      for (let k = 0; k < idx.length; k++) {
        const p = await m.xpsPageToSvg(doc, idx[k])
        p.warnings.forEach((w) => warn.add(w))
        const name = `${base}-page-${String(idx[k] + 1).padStart(pad, '0')}`
        if (out === 'svg') files.push({ name: `${name}.svg`, data: p.svg })
        else { const c = await m.svgToCanvas(p.svg, p.width, p.height, dpi / 96); files.push({ name: `${name}.png`, data: await canvasToBlob(c, 'image/png') }); c.width = c.height = 0 }
        setP((k + 1) / idx.length)
      }
      if (files.length === 1) {
        const f = files[0]
        setResult({ blob: typeof f.data === 'string' ? new Blob([f.data], { type: 'image/svg+xml' }) : f.data, name: f.name, warnings: [...warn] })
      } else setResult({ blob: await zipFiles(files), name: `${base}-${out}.zip`, warnings: [...warn] })
    }
    setP(1); toast('Converted', 'success')
  })

  if (!file) return <Dropzone accept={ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop an XPS or OXPS file" sub="Converted on your device. Nothing is uploaded." />

  return (
    <div className="space-y-4">
      <FileBar file={file} pages={total || undefined} onReset={reset} />
      {load.busy && <Progress value={load.progress} label="Opening XPS…" />}
      <ErrorNote error={load.error} />
      {result && <ResultCard blob={result.blob} filename={result.name} originalSize={file.size} title={out === 'pdf' ? 'PDF ready' : 'Files ready'} onReset={reset}>
        {result.warnings.length > 0 && <ul className="mt-2 space-y-1 text-xs text-warn">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      </ResultCard>}
      {doc && <ToolGrid
        main={<div className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">Preview</div>
            {total > 1 && <PageStepper page={page} total={total} onChange={setPage} />}
          </div>
          <div className="checker flex min-h-80 items-center justify-center rounded-xl p-4">
            {previewErr ? <ErrorNote error={previewErr} /> : preview ? <img src={preview.url} alt={`Page ${page + 1}`} className="max-h-[70vh] max-w-full bg-white shadow-2xl" /> : <Spinner label="Drawing page…" />}
          </div>
          {preview && preview.warnings.length > 0 && <ul className="mt-3 space-y-1 text-xs text-warn">{preview.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
        </div>}
        side={<>
          <Field label="Convert to"><Segmented value={out} onChange={ch(setOut)} className="w-full" options={[{ value: 'pdf', label: 'PDF' }, { value: 'png', label: 'PNG images' }, { value: 'svg', label: 'SVG' }]} /></Field>
          {out !== 'svg' && <Slider label="Resolution" value={dpi} min={72} max={400} step={8} onChange={ch(setDpi)} suffix=" DPI" />}
          {out === 'pdf' && <>
            <Field label="Page images"><Segmented value={format} onChange={ch(setFormat)} options={[{ value: 'jpeg', label: 'JPEG (smaller)' }, { value: 'png', label: 'PNG (sharpest)' }]} /></Field>
            <Switch checked={textLayer} onChange={ch(setTextLayer)} label="Keep text searchable" />
          </>}
          <Field label="Pages (empty for all)"><Input value={range} placeholder="e.g. 1-3, 5" onChange={(e) => { setRange(e.target.value); setResult(null) }} /></Field>
          <div className="rounded-xl bg-surface-2/60 p-3 text-xs leading-relaxed text-muted">Pages are drawn with their own embedded fonts, shapes, gradients and pictures. PDF pages are stored as images with an invisible text layer so you can still search and copy.</div>
          {job.busy && <Progress value={job.progress} label="Converting pages…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<FileOutput className="size-5" />} loading={job.busy} onClick={run}>{out === 'pdf' ? 'Convert to PDF' : out === 'png' ? 'Convert to PNG' : 'Convert to SVG'}</Button>
        </>}
      />}
    </div>
  )
}
