import { useEffect, useState } from 'react'
import { Images } from 'lucide-react'
import { Button, Card, Dropzone, Input, Label, Segmented, Slider, ResultCard, Progress, ErrorNote, useJob } from '@/components/ui'
import { parsePageRanges, zipFiles } from '@/lib/files'
import type { Deck } from '@/lib/b4/pptx'
import { FileBar } from '@/lib/cf/ui'

export default function PptxToImages() {
  const [file, setFile] = useState<File | null>(null)
  const [deck, setDeck] = useState<Deck | null>(null)
  const [thumbs, setThumbs] = useState<string[]>([])
  const [fmt, setFmt] = useState<'png' | 'jpeg' | 'webp'>('png'), [scale, setScale] = useState(2), [range, setRange] = useState('')
  const [out, setOut] = useState<{ blob: Blob; name: string; n: number } | null>(null)
  const load = useJob(), job = useJob()
  useEffect(() => {
    setDeck(null); setThumbs([]); setOut(null); if (!file) return
    if (/\.ppt$/i.test(file.name)) { load.setError('Old .ppt files are not supported. Save the file as .pptx first.'); return }
    load.run(async (setP) => {
      const m = await import('@/lib/b4/pptx')
      let d: Deck; try { d = await m.readPptx(file, setP) } catch { throw new Error('This file could not be read as a PowerPoint (.pptx) presentation.') }
      if (!d.slides.length) throw new Error('This presentation has no slides.')
      setDeck(d)
      const { withSlideFrame } = await import('@/tools/convert/_b1/slides')
      const urls: string[] = []
      await withSlideFrame(async (render) => { for (const s of d.slides.slice(0, 60)) { const c = await render(m.slideHtml(d, s), d.width, d.height, 0.35); urls.push(c.toDataURL('image/jpeg', 0.7)); setThumbs([...urls]) } })
    })
  }, [file]) // eslint-disable-line
  const go = () => job.run(async (setP) => {
    if (!deck || !file) return
    const m = await import('@/lib/b4/pptx'), { withSlideFrame } = await import('@/tools/convert/_b1/slides')
    const idx = range.trim() ? parsePageRanges(range, deck.slides.length) : deck.slides.map((_, i) => i)
    if (!idx.length) throw new Error('No slides match that range.')
    const base = file.name.replace(/\.[^.]+$/, ''), files: { name: string; data: Blob }[] = []
    await withSlideFrame(async (render) => {
      for (let k = 0; k < idx.length; k++) {
        const c = await render(m.slideHtml(deck, deck.slides[idx[k]]), deck.width, deck.height, scale)
        const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not export slide.'))), `image/${fmt}`, 0.92))
        files.push({ name: `${base}-slide-${String(idx[k] + 1).padStart(2, '0')}.${fmt === 'jpeg' ? 'jpg' : fmt}`, data: blob }); setP((k + 1) / idx.length)
      }
    })
    setOut(files.length === 1 ? { blob: files[0].data, name: files[0].name, n: 1 } : { blob: await zipFiles(files), name: `${base}-slides.zip`, n: files.length })
  })
  if (!file) return <Dropzone accept=".pptx,.ppt" onFiles={(f) => setFile(f[0])} label="Drop a PowerPoint file (.pptx)" sub="Every slide becomes a PNG, JPG or WEBP image. Converted on your device." />
  const pxW = deck ? Math.round(deck.width * (96 / 72) * scale) : 0, pxH = deck ? Math.round(deck.height * (96 / 72) * scale) : 0
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-3">
        <FileBar name={file.name} size={file.size} onReset={() => setFile(null)} extra={deck && <span className="text-xs text-muted">{deck.slides.length} slides</span>} />
        {load.busy && <Progress value={load.progress} label="Reading slides" />}
        <ErrorNote error={load.error} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{thumbs.map((t, i) => <figure key={i} className="overflow-hidden rounded-lg border border-border"><img src={t} alt={`Slide ${i + 1}`} className="w-full" /><figcaption className="px-2 py-1 text-[11px] text-muted">Slide {i + 1}</figcaption></figure>)}</div>
        {job.busy && <Progress value={job.progress} label="Exporting slides" />}
        <ErrorNote error={job.error} />
        {out && <ResultCard blob={out.blob} filename={out.name} title={`${out.n} image${out.n > 1 ? 's' : ''} ready`} />}
      </div>
      <Card className="space-y-4 self-start">
        <div><Label>Format</Label><Segmented value={fmt} onChange={setFmt} options={[{ value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPG' }, { value: 'webp', label: 'WEBP' }]} /></div>
        <Slider label="Size" value={scale} onChange={setScale} min={1} max={4} step={0.5} suffix="×" />
        {deck && <p className="text-xs text-muted">{pxW} × {pxH} pixels per slide</p>}
        <div><Label>Slides (empty for all)</Label><Input value={range} onChange={(e) => setRange(e.target.value)} placeholder="1-3, 7" /></div>
        <Button className="w-full" icon={<Images className="size-4" />} disabled={!deck} loading={job.busy} onClick={go}>Export images</Button>
        <p className="text-xs text-muted">Slides are drawn by the browser from the file, so unusual fonts or effects can look a little different from PowerPoint.</p>
      </Card>
    </div>
  )
}
