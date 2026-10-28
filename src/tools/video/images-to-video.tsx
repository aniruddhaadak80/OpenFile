import { useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { Dropzone, ToolGrid } from '@/components/ui'
import { SlideList, SlideshowPanel, normaliseImage, useSlideshowSettings, type Slide } from './_b3/slideshow'

let n = 0
const toSlides = (files: File[]): Slide[] => files
  .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  .map((f) => ({ id: `i${n++}`, url: URL.createObjectURL(f), label: f.name, load: () => normaliseImage(f) }))

export default function ImagesToVideo() {
  const [slides, setSlides] = useState<Slide[]>([])
  const s = useSlideshowSettings(3)
  const reset = () => { slides.forEach((x) => URL.revokeObjectURL(x.url)); setSlides([]) }
  if (!slides.length) return <Dropzone multiple accept="image/*" onFiles={(f) => setSlides(toSlides(f))} label="Drop photos to make a slideshow video" sub="JPG, PNG, WEBP, GIF stills and more. Add music, transitions and a slow zoom." />
  return (
    <ToolGrid
      main={<>
        <div className="flex items-center justify-between gap-2 text-sm"><span className="text-muted">{slides.length} slides. Drag to reorder.</span></div>
        <SlideList slides={slides} setSlides={setSlides} perSlide={s.perSlide} />
        <Dropzone compact multiple accept="image/*" onFiles={(f) => setSlides([...slides, ...toSlides(f)])} label={<span className="inline-flex items-center gap-2"><ImagePlus className="size-4" />Add more photos</span>} />
      </>}
      side={<SlideshowPanel s={s} slides={slides} name="slideshow" onReset={reset} />}
    />
  )
}
