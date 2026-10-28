import { useEffect, useRef, useState } from 'react'
import { FileCode2 } from 'lucide-react'
import { Button, Dropzone, ResultCard, Segmented, Slider, Switch, ToolGrid, Progress, ErrorNote, Field, Spinner, Input, useJob } from '@/components/ui'
import { pdfjs, type PdfJsDoc } from '@/lib/pdf'
import { baseName, parsePageRanges, formatBytes } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, PDF_ACCEPT, PageStepper, MultiResult, closeDoc, friendly, type OutFile } from '../pdf/_core/kit'
import type { SvgOptions } from './_b1/pdfsvg'

/** Open with font data kept, so fonts can be embedded into the SVG. */
async function openForSvg(file: File): Promise<PdfJsDoc> {
  const data = new Uint8Array(await file.arrayBuffer())
  return pdfjs.getDocument({ data, fontExtraProperties: true } as any).promise
}

export default function PdfToSvg() {
  const [file, setFile] = useState<File | null>(null)
  const [doc, setDoc] = useState<PdfJsDoc | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [mode, setMode] = useState<SvgOptions['mode']>('vector')
  const [embedFonts, setEmbedFonts] = useState(true)
  const [imageType, setImageType] = useState<SvgOptions['imageType']>('jpeg')
  const [dpi, setDpi] = useState(150)
  const [background, setBackground] = useState(true)
  const [range, setRange] = useState('')
  const [preview, setPreview] = useState<{ url: string; size: number; warnings: string[] } | null>(null)
  const [previewErr, setPreviewErr] = useState<string | null>(null)
  const [results, setResults] = useState<OutFile[] | null>(null)
  const job = useJob()
  const token = useRef(0)
  const numPages = doc?.numPages ?? 0
  const opts: SvgOptions = { mode, embedFonts, imageType, dpi, background }

  useEffect(() => {
    let d: PdfJsDoc | null = null, cancel = false
    setDoc(null); setLoadErr(null); setPage(0); setResults(null)
    if (!file) return
    openForSvg(file).then((x) => { d = x; if (cancel) closeDoc(x); else setDoc(x) }).catch((e) => !cancel && setLoadErr(friendly(e)))
    return () => { cancel = true; closeDoc(d) }
  }, [file])

  // live preview of the current page with the current settings
  useEffect(() => {
    if (!doc) return
    const t = ++token.current
    setPreviewErr(null)
    const timer = setTimeout(async () => {
      try {
        const { pageToSvg } = await import('./_b1/pdfsvg')
        const r = await pageToSvg(doc, page + 1, opts, pdfjs.OPS as any)
        if (t !== token.current) return
        const blob = new Blob([r.svg], { type: 'image/svg+xml' })
        setPreview((old) => { if (old) URL.revokeObjectURL(old.url); return { url: URL.createObjectURL(blob), size: blob.size, warnings: r.warnings } })
      } catch (e: any) { if (t === token.current) setPreviewErr(e?.message || 'Could not convert this page.') }
    }, 250)
    return () => clearTimeout(timer)
  }, [doc, page, mode, embedFonts, imageType, dpi, background]) // eslint-disable-line
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url) }, []) // eslint-disable-line

  const reset = () => { setFile(null); setResults(null); setRange(''); setPreview(null) }
  const ch = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setResults(null) }

  const run = () => job.run(async (setP) => {
    if (!doc || !file) return
    const { pageToSvg } = await import('./_b1/pdfsvg')
    const idx = range.trim() ? parsePageRanges(range, numPages) : Array.from({ length: numPages }, (_, i) => i)
    if (!idx.length) throw new Error('No pages match that range.')
    const out: OutFile[] = []
    const warn = new Set<string>()
    const pad = String(numPages).length
    for (let k = 0; k < idx.length; k++) {
      const r = await pageToSvg(doc, idx[k] + 1, opts, pdfjs.OPS as any)
      r.warnings.forEach((w) => warn.add(w))
      out.push({ name: idx.length === 1 ? `${baseName(file.name)}.svg` : `${baseName(file.name)}-page-${String(idx[k] + 1).padStart(pad, '0')}.svg`, blob: new Blob([r.svg], { type: 'image/svg+xml' }), pages: 1 })
      setP((k + 1) / idx.length)
    }
    setResults(out)
    toast(warn.size ? `SVG ready. ${[...warn][0]}` : 'SVG ready', warn.size ? 'info' : 'success')
  })

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to turn its pages into SVG" sub="Vector paths, real text and images. Stays on your device." />

  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={reset} />
      <ErrorNote error={loadErr} />
      {results && (results.length === 1
        ? <ResultCard blob={results[0].blob} filename={results[0].name} originalSize={file.size} title="SVG ready" onReset={reset} />
        : <MultiResult files={results} zipName={`${baseName(file.name)}-svg.zip`} onReset={reset} title={`${results.length} SVG files ready`} />)}
      {doc && <ToolGrid
        main={<div className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">SVG preview {preview && <span className="font-normal text-muted">· {formatBytes(preview.size)}</span>}</div>
            {numPages > 1 && <PageStepper page={page} total={numPages} onChange={setPage} />}
          </div>
          <div className="checker flex min-h-80 items-center justify-center rounded-xl p-4">
            {previewErr ? <ErrorNote error={previewErr} /> : preview ? <img src={preview.url} alt={`Page ${page + 1} as SVG`} className="max-h-[70vh] max-w-full shadow-2xl" /> : <Spinner label="Converting page…" />}
          </div>
          {preview && preview.warnings.length > 0 && <ul className="mt-3 space-y-1 text-xs text-warn">{preview.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
        </div>}
        side={<>
          <Field label="Output">
            <Segmented value={mode} onChange={ch(setMode)} className="w-full" options={[{ value: 'vector', label: 'Vector' }, { value: 'image', label: 'Image with text layer' }]} />
          </Field>
          {mode === 'vector' ? <>
            <Switch checked={embedFonts} onChange={ch(setEmbedFonts)} label="Embed fonts (looks exactly like the PDF)" />
            <Field label="Pictures inside the page"><Segmented value={imageType} onChange={ch(setImageType)} options={[{ value: 'jpeg', label: 'JPEG (smaller)' }, { value: 'png', label: 'PNG (lossless)' }]} /></Field>
            <div className="rounded-xl bg-surface-2/60 p-3 text-xs leading-relaxed text-muted">Shapes and lines stay as sharp vector paths you can edit in Inkscape, Illustrator or Figma. Turn off font embedding to get plain editable text that uses fonts on your computer.</div>
          </> : <>
            <Slider label="Resolution" value={dpi} min={72} max={400} step={6} onChange={ch(setDpi)} suffix=" DPI" />
            <Field label="Picture format"><Segmented value={imageType} onChange={ch(setImageType)} options={[{ value: 'jpeg', label: 'JPEG' }, { value: 'png', label: 'PNG' }]} /></Field>
            <div className="rounded-xl bg-surface-2/60 p-3 text-xs leading-relaxed text-muted">Each page is drawn as a picture, with the text placed on top invisibly so it can still be searched and copied. Use this for pages with complex effects.</div>
          </>}
          <Switch checked={background} onChange={ch(setBackground)} label="White page background" />
          <Field label="Pages (empty for all)"><Input value={range} placeholder="e.g. 1-3, 5" onChange={(e) => { setRange(e.target.value); setResults(null) }} /></Field>
          {job.busy && <Progress value={job.progress} label="Converting pages…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<FileCode2 className="size-5" />} loading={job.busy} disabled={!numPages} onClick={run}>Convert to SVG</Button>
        </>}
      />}
      {!doc && !loadErr && <Spinner label="Opening PDF…" />}
    </div>
  )
}
