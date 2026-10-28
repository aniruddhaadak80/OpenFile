import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import { Input, Field, Segmented, Slider, Switch } from '@/components/ui'
import { PdfConvertShell, HtmlPreview } from './_b1/Shell'
import { buildEpub, splitChapters, toHtmlDoc } from './_b1/writers'

export default function PdfToEpub() {
  const [split, setSplit] = useState<'h1' | 'h2' | 'pages'>('h1')
  const [per, setPer] = useState(10)
  const [cover, setCover] = useState(true)
  const [lang, setLang] = useState('en')
  const [author, setAuthor] = useState('')
  return (
    <PdfConvertShell
      label="Drop a PDF to turn it into a reflowable EPUB e-book"
      icon={<BookOpen className="size-5" />} action="Create EPUB" ext="epub" optionDeps={[split, per, cover, lang, author]}
      options={<>
        <Field label="Start a new chapter at"><Segmented value={split} onChange={setSplit} options={[{ value: 'h1', label: 'Main headings' }, { value: 'h2', label: 'All headings' }, { value: 'pages', label: 'Every N pages' }]} /></Field>
        {split === 'pages' && <Slider label="Pages per chapter" value={per} min={1} max={50} onChange={setPer} />}
        <Switch checked={cover} onChange={setCover} label="Use the first page as the cover" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Author"><Input value={author} placeholder="From the PDF" onChange={(e) => setAuthor(e.target.value)} /></Field>
          <Field label="Language"><Input value={lang} onChange={(e) => setLang(e.target.value.slice(0, 12))} /></Field>
        </div>
      </>}
      preview={(model, title) => <HtmlPreview html={toHtmlDoc(model.slice(0, 15), { title, images: new Map(), pageBreaks: false }, () => '')} />}
      build={async ({ model, title, author: a, images, renderImage }) => {
        const chapters = splitChapters(model, { title, images }, split, per)
        const coverImg = cover ? await renderImage(1, 1.6, 'image/jpeg') : undefined
        if (coverImg) coverImg.name = 'cover.jpg'
        const bytes = buildEpub(chapters, { title, author: author || a, lang, images, cover: coverImg, uuid: globalThis.crypto.randomUUID(), modified: new Date(), pageBreaks: false })
        return new Blob([bytes as BlobPart], { type: 'application/epub+zip' })
      }}
      note="Text reflows to fit any screen and font size on e-readers, phones and tablets. Kindle accepts EPUB through Send to Kindle. Complex layouts such as magazines work best as PDF."
    />
  )
}
