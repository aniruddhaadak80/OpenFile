import { useRef, useState } from 'react'
import { Button, Dropzone, ErrorNote, Progress, Slider, ToolGrid } from '@/components/ui'
import { baseName } from '@/lib/files'
import { openPdfJs, renderPage } from '@/lib/pdf'
import { SlideList, SlideshowPanel, useSlideshowSettings, type Slide } from './_b3/slideshow'
import { Note } from './_media/ui'

export default function PdfToVideo() {
  const [file, setFile] = useState<File | null>(null)
  const [slides, setSlides] = useState<Slide[]>([])
  const [loading, setLoading] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [quality, setQuality] = useState(2)
  const qRef = useRef(2); qRef.current = quality
  const s = useSlideshowSettings(4)

  const open = async (f: File) => {
    setFile(f); setError(null); setSlides([]); setLoading(0.01)
    try {
      const doc = await openPdfJs(f)
      const out: Slide[] = []
      for (let p = 1; p <= doc.numPages; p++) {
        const c = await renderPage(doc, p, 0.4)
        const thumb = c.toDataURL('image/jpeg', 0.7)
        const page = p
        out.push({
          id: `p${p}`, url: thumb, label: `Page ${p}`,
          load: async () => {
            const big = await renderPage(doc, page, qRef.current)
            return new Promise<Blob>((res, rej) => big.toBlob((b) => (b ? res(b) : rej(new Error('Could not render a page.'))), 'image/jpeg', 0.92))
          },
        })
        setLoading(p / doc.numPages)
      }
      setSlides(out); s.setKenBurns(false); s.setTransition('fade'); s.setFit('fit'); s.setBg('#ffffff')
    } catch (e: any) {
      setError(/password/i.test(e?.message || '') ? 'This PDF is password protected. Unlock it first with Unlock PDF.' : 'This PDF could not be opened. It may be damaged.')
    } finally { setLoading(0) }
  }
  const reset = () => { setFile(null); setSlides([]) }

  if (!file) return (
    <div className="space-y-3">
      <Dropzone accept="application/pdf,.pdf" onFiles={(f) => open(f[0])} label="Drop a PDF or exported slide deck" sub="Each page becomes a timed slide. Add music and transitions." />
      <Note>Have a PowerPoint or Keynote file? Export it as PDF first (PowerPoint: File, Save as PDF).</Note>
    </div>
  )
  if (loading) return <div className="mx-auto max-w-sm py-10"><Progress value={loading} label="Rendering pages" /></div>
  if (error) return <div className="space-y-3"><ErrorNote error={error} /><Button variant="outline" onClick={reset}>Try another file</Button></div>
  return (
    <ToolGrid
      main={<>
        <div className="text-sm text-muted">{slides.length} pages from {file.name}. Drag to reorder, or remove pages you do not need.</div>
        <SlideList slides={slides} setSlides={setSlides} perSlide={s.perSlide} />
      </>}
      side={<SlideshowPanel s={s} slides={slides} name={baseName(file.name)} onReset={reset} extra={<Slider label="Page sharpness" value={quality} onChange={setQuality} min={1} max={3} step={0.5} suffix="×" />} />}
    />
  )
}
