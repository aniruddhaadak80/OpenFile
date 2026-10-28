import { useEffect, useRef, useState } from 'react'
import { Presentation } from 'lucide-react'
import { Button, Dropzone, ResultCard, Segmented, Slider, ToolGrid, Progress, ErrorNote, Field, Spinner, Input, useJob } from '@/components/ui'
import { baseName, parsePageRanges } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, PageStepper } from '../pdf/_core/kit'
import type { Deck } from '@/lib/b4/pptx'
import type { SlideLayout } from './_b1/slides'

const ACCEPT = '.pptx,.ppt,.ppsx,.potx,.pptm,application/vnd.openxmlformats-officedocument.presentationml.presentation'

export default function PowerpointToPdf() {
  const [file, setFile] = useState<File | null>(null)
  const [deck, setDeck] = useState<Deck | null>(null)
  const [slideHtml, setSlideHtml] = useState<((d: Deck, i: number) => string) | null>(null)
  const [slide, setSlide] = useState(0)
  const [layout, setLayout] = useState<SlideLayout>('slides')
  const [scale, setScale] = useState(2)
  const [quality, setQuality] = useState<'jpeg' | 'png'>('jpeg')
  const [range, setRange] = useState('')
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null)
  const load = useJob(), job = useJob()

  useEffect(() => {
    setDeck(null); setSlide(0); setResult(null)
    if (!file) return
    if (/\.ppt$/i.test(file.name)) { load.setError('Old .ppt files are not supported. Open it in PowerPoint, Keynote or LibreOffice and save it as .pptx first.'); return }
    load.run(async (setP) => {
      const m = await import('@/lib/b4/pptx')
      let d: Deck
      try { d = await m.readPptx(file, setP) } catch { throw new Error('This file could not be read as a PowerPoint presentation. Make sure it is a .pptx file.') }
      if (!d.slides.length) throw new Error('This presentation has no slides.')
      setSlideHtml(() => (dk: Deck, i: number) => m.slideHtml(dk, dk.slides[i]))
      setDeck(d)
    })
  }, [file]) // eslint-disable-line

  const reset = () => { setFile(null); setDeck(null); setResult(null); setRange(''); load.setError(null) }
  const ch = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setResult(null) }

  const run = () => job.run(async (setP) => {
    if (!deck || !file) return
    const idx = range.trim() ? parsePageRanges(range, deck.slides.length) : deck.slides.map((_, i) => i)
    if (!idx.length) throw new Error('No slides match that range.')
    const { slidesToPdf } = await import('./_b1/slides')
    const blob = await slidesToPdf(deck, { layout, scale, quality: quality === 'png' ? 1 : 0.9, indexes: idx, onProgress: setP })
    setResult({ blob, name: `${baseName(file.name)}.pdf` }); setP(1); toast('PDF ready', 'success')
  })

  if (!file) return <Dropzone accept={ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PowerPoint file (.pptx)" sub="Converted on your device. Nothing is uploaded." />

  const pxW = deck ? deck.width * (96 / 72) : 0
  return (
    <div className="space-y-4">
      <FileBar file={file} pages={deck?.slides.length} onReset={reset} />
      {load.busy && <Progress value={load.progress} label="Reading slides…" />}
      <ErrorNote error={load.error} />
      {result && <ResultCard blob={result.blob} filename={result.name} originalSize={file.size} title="PDF ready" onReset={reset} />}
      {deck && slideHtml && <ToolGrid
        main={<div className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">Slide preview</div>
            {deck.slides.length > 1 && <PageStepper page={slide} total={deck.slides.length} onChange={setSlide} />}
          </div>
          <SlideBox html={slideHtml(deck, slide)} pxW={pxW} pxH={deck.height * (96 / 72)} />
          {deck.slides[slide]?.notes && <div className="mt-3 rounded-xl bg-surface-2/60 p-3 text-xs leading-relaxed text-muted"><span className="font-semibold text-fg">Notes: </span>{deck.slides[slide].notes}</div>}
        </div>}
        side={<>
          <Field label="Layout">
            <Segmented value={layout} onChange={ch(setLayout)} className="w-full" options={[{ value: 'slides', label: 'Slides' }, { value: 'notes', label: 'With notes' }, { value: 'handout', label: 'Handout' }]} />
          </Field>
          <div className="text-xs text-muted">{layout === 'slides' ? 'One slide per page, at the slide size.' : layout === 'notes' ? 'Each slide on an A4 page with its speaker notes below.' : 'Three slides per A4 page with lines for writing.'}</div>
          <Slider label="Sharpness" value={scale} min={1} max={3} step={0.5} onChange={ch(setScale)} suffix="x" />
          <Field label="Image format"><Segmented value={quality} onChange={ch(setQuality)} options={[{ value: 'jpeg', label: 'JPEG (smaller)' }, { value: 'png', label: 'PNG (sharpest)' }]} /></Field>
          <Field label="Slides (empty for all)"><Input value={range} placeholder="e.g. 1-5, 8" onChange={(e) => { setRange(e.target.value); setResult(null) }} /></Field>
          <div className="rounded-xl bg-surface-2/60 p-3 text-xs leading-relaxed text-muted">Text boxes, pictures, tables, shapes and backgrounds are drawn by a built-in renderer. Charts, SmartArt, gradients and animations are skipped, and fonts you do not have installed are replaced by similar ones.</div>
          {job.busy && <Progress value={job.progress} label="Drawing slides…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<Presentation className="size-5" />} loading={job.busy} onClick={run}>Convert to PDF</Button>
        </>}
      />}
      {!deck && !load.busy && !load.error && <Spinner label="Opening…" />}
    </div>
  )
}

function SlideBox({ html, pxW, pxH }: { html: string; pxW: number; pxH: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el); setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} className="w-full">
      {w > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm" style={{ height: pxH * (w / pxW) }}>
          <div style={{ width: pxW, transform: `scale(${w / pxW})`, transformOrigin: 'top left' }} dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )}
    </div>
  )
}
