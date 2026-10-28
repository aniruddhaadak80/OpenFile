import { useCallback, useEffect, useMemo, useState } from 'react'
import { Presentation, CheckSquare, Square, MonitorPlay } from 'lucide-react'
import { Button, Dropzone, ToolGrid, Label, Segmented, Switch, Progress, ErrorNote, ResultCard, Badge, Empty, useJob, cn } from '@/components/ui'
import { usePdfThumbs } from '@/components/PdfThumbs'
import { toast } from '@/components/toast'
import { renderPage, openPdfJs } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { FileBar, Reveal, ThumbGrid, pdfError } from './_conv/shared'
import { openPdfRich, pageLayout } from './_conv/pdfOpen'
import { groupLines } from './_conv/pdfText'

type Ratio = '16:9' | '4:3' | 'match'
type Fit = 'contain' | 'cover'
type Res = 'standard' | 'high'

export default function PdfToPpt() {
  const [file, setFile] = useState<File | null>(null)
  const [ratio, setRatio] = useState<Ratio>('16:9')
  const [fit, setFit] = useState<Fit>('contain')
  const [bg, setBg] = useState<'white' | 'black'>('white')
  const [notes, setNotes] = useState(true)
  const [res, setRes] = useState<Res>('high')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [pageAspect, setPageAspect] = useState(0.707)
  const [result, setResult] = useState<Blob | null>(null)
  const { thumbs, numPages, error: thumbErr } = usePdfThumbs(file)
  const { busy, progress, error, run } = useJob()

  useEffect(() => { if (numPages) setSelected(new Set(Array.from({ length: numPages }, (_, i) => i))) }, [numPages])
  useEffect(() => { if (!file) return; openPdfJs(file).then((d) => d.getPage(1)).then((p) => { const v = p.getViewport({ scale: 1 }); setPageAspect(v.width / v.height) }).catch(() => {}) }, [file])
  useEffect(() => setResult(null), [ratio, fit, bg, notes, res, selected])

  const toggle = useCallback((i: number) => setSelected((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n }), [])
  const order = useMemo(() => [...selected].sort((a, b) => a - b), [selected])
  const slide = ratio === '16:9' ? { w: 13.333, h: 7.5 } : ratio === '4:3' ? { w: 10, h: 7.5 } : pageAspect >= 1 ? { w: 13.333, h: 13.333 / pageAspect } : { w: 7.5 * pageAspect, h: 7.5 }

  const convert = () => run(async (setP) => {
    if (!file || !order.length) throw new Error('Select at least one page.')
    const PptxGenJS = (await import('pptxgenjs')).default
    const pptx = new PptxGenJS()
    pptx.defineLayout({ name: 'OF', width: slide.w, height: slide.h })
    pptx.layout = 'OF'
    pptx.title = baseName(file.name); pptx.company = 'OpenFile'
    const doc = await openPdfJs(file).catch((e) => { throw new Error(pdfError(e)) })
    const rich = notes ? await openPdfRich(file) : null
    const targetW = res === 'high' ? 2400 : 1600
    for (let k = 0; k < order.length; k++) {
      const n = order[k] + 1
      const page = await doc.getPage(n)
      const vp = page.getViewport({ scale: 1 })
      const scale = Math.max(1, Math.min(4, targetW / Math.max(vp.width, vp.height)))
      const c = await renderPage(doc, n, scale)
      const data = c.toDataURL('image/jpeg', 0.9)
      const s = pptx.addSlide()
      s.background = { color: bg === 'white' ? 'FFFFFF' : '000000' }
      const a = vp.width / vp.height
      let w = slide.w, h = slide.h
      if (fit === 'contain' ? a > slide.w / slide.h : a < slide.w / slide.h) h = w / a; else w = h * a
      if (fit === 'cover' && ratio !== 'match') s.addImage({ data, x: 0, y: 0, w, h, sizing: { type: 'cover', w: slide.w, h: slide.h } })
      else s.addImage({ data, x: (slide.w - w) / 2, y: (slide.h - h) / 2, w, h })
      if (rich) {
        const lay = await pageLayout(rich, n, false)
        const text = groupLines(lay.items).map((l) => l.text).join('\n').trim()
        s.addNotes(text ? `Page ${n}\n\n${text}` : `Page ${n}`)
      }
      c.width = c.height = 0
      setP((k + 1) / order.length * 0.92)
    }
    const blob = (await pptx.write({ outputType: 'blob' })) as Blob
    setP(1)
    setResult(blob)
    toast(`Created ${order.length} slide${order.length > 1 ? 's' : ''}`, 'success')
  })

  const reset = () => { setFile(null); setResult(null); setSelected(new Set()) }

  if (!file) return <Dropzone accept="application/pdf,.pdf" onFiles={(f) => setFile(f[0])} label="Drop a PDF to turn into PowerPoint slides" />

  // slide preview frame
  const previewThumb = thumbs[order[0] ?? 0]
  return (
    <div className="space-y-5">
      <FileBar name={file.name} size={file.size} sub={numPages ? `${numPages} pages` : 'reading…'} onReset={reset} />
      <ErrorNote error={thumbErr} />
      <ToolGrid
        main={<>
          {result && <Reveal k="r"><ResultCard blob={result} filename={`${baseName(file.name)}.pptx`} title={`Deck ready · ${order.length} slide${order.length > 1 ? 's' : ''}`} onReset={reset} /></Reveal>}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" icon={<CheckSquare className="size-4" />} onClick={() => setSelected(new Set(Array.from({ length: numPages }, (_, i) => i)))}>All</Button>
            <Button size="sm" variant="outline" icon={<Square className="size-4" />} onClick={() => setSelected(new Set())}>None</Button>
            <Badge>{selected.size} slide{selected.size === 1 ? '' : 's'}</Badge>
            <span className="text-xs text-muted">Click pages to include / exclude</span>
          </div>
          {numPages === 0 && !thumbErr ? <Empty>Reading PDF…</Empty> : <ThumbGrid thumbs={thumbs} numPages={numPages} selected={selected} onToggle={toggle} label={(i) => selected.has(i) ? `Slide ${order.indexOf(i) + 1}` : `Page ${i + 1}`} />}
        </>}
        side={<>
          <div>
            <Label>Slide preview</Label>
            <div className={cn('relative mx-auto flex items-center justify-center overflow-hidden rounded-lg shadow-lg ring-1 ring-border transition-all duration-300', bg === 'white' ? 'bg-white' : 'bg-black')} style={{ aspectRatio: `${slide.w} / ${slide.h}`, width: slide.w >= slide.h ? '100%' : `${(slide.w / slide.h) * 100}%` }}>
              {previewThumb ? <img src={previewThumb} alt="" className={cn('size-full', fit === 'contain' ? 'object-contain' : 'object-cover')} /> : <MonitorPlay className="size-8 text-muted" />}
            </div>
          </div>
          <div><Label>Slide size</Label><Segmented value={ratio} onChange={setRatio} options={[{ value: '16:9', label: '16:9' }, { value: '4:3', label: '4:3' }, { value: 'match', label: 'Match page' }]} /></div>
          {ratio !== 'match' && <div><Label>Page placement</Label><Segmented value={fit} onChange={setFit} options={[{ value: 'contain', label: 'Fit (letterbox)' }, { value: 'cover', label: 'Fill (crop)' }]} /></div>}
          <div><Label>Background</Label><Segmented value={bg} onChange={setBg} options={[{ value: 'white', label: 'White' }, { value: 'black', label: 'Black' }]} /></div>
          <div><Label>Image resolution</Label><Segmented value={res} onChange={setRes} options={[{ value: 'standard', label: 'Standard' }, { value: 'high', label: 'High (sharper, larger)' }]} /></div>
          <Switch checked={notes} onChange={setNotes} label="Speaker notes with the page's text" />
          {busy && <Progress value={progress} label="Building slides" />}
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" loading={busy} disabled={!order.length || !!thumbErr} icon={<Presentation className="size-5" />} onClick={convert}>Create PowerPoint</Button>
        </>}
      />
    </div>
  )
}
