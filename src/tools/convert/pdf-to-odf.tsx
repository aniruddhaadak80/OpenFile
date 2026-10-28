import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { Field, Segmented, Slider, Switch } from '@/components/ui'
import { PdfConvertShell, HtmlPreview, TextPreview } from './_b1/Shell'
import { toHtmlDoc, toOdt, toOds, toOdp } from './_b1/writers'
import { toGrid } from './_conv/pdfText'

type Kind = 'odt' | 'ods' | 'odp'
const MIME = { odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet', odp: 'application/vnd.oasis.opendocument.presentation' }

export default function PdfToOdf() {
  const [kind, setKind] = useState<Kind>('odt')
  const [breaks, setBreaks] = useState(true)
  const [dpi, setDpi] = useState(150)
  return (
    <PdfConvertShell
      label="Drop a PDF to turn it into an OpenDocument file (ODT, ODS or ODP)"
      icon={<FileSpreadsheet className="size-5" />} action={`Convert to ${kind.toUpperCase()}`} ext={kind} optionDeps={[kind, breaks, dpi]} hideModelOptions={kind !== 'odt'}
      options={<>
        <Field label="Output"><Segmented value={kind} onChange={setKind} options={[{ value: 'odt', label: 'Text (ODT)' }, { value: 'ods', label: 'Sheet (ODS)' }, { value: 'odp', label: 'Slides (ODP)' }]} /></Field>
        <div className="-mt-3 text-xs text-muted">{kind === 'odt' ? 'Editable text with headings, lists and tables.' : kind === 'ods' ? 'One sheet per page, text placed into rows and columns.' : 'One slide per page, as a picture of the page.'}</div>
        {kind === 'odt' && <Switch checked={breaks} onChange={setBreaks} label="Keep page breaks" />}
        {kind === 'odp' && <Slider label="Slide image resolution" value={dpi} min={72} max={300} step={6} onChange={setDpi} suffix=" DPI" />}
      </>}
      preview={(model, title) => kind === 'odt' ? <HtmlPreview html={toHtmlDoc(model.slice(0, 15), { title, images: new Map(), pageBreaks: breaks }, () => '')} /> : kind === 'ods' ? <TextPreview label="Rows found on the first page" text="Tables are rebuilt from text positions. Open the file to check columns." /> : null}
      build={async ({ model, title, images, pages, renderImage, setP }) => {
        let bytes: Uint8Array
        if (kind === 'odt') bytes = toOdt(model, { title, images, pageBreaks: breaks })
        else if (kind === 'ods') bytes = toOds(pages.map((p, i) => ({ name: `Page ${i + 1}`, rows: toGrid(p.lines, p.width) })), title)
        else {
          const slides = []
          for (let i = 0; i < pages.length; i++) { slides.push(await renderImage(i + 1, dpi / 72, 'image/jpeg')); setP((i + 1) / pages.length) }
          bytes = toOdp(slides, { w: pages[0].width, h: pages[0].height }, title)
        }
        return new Blob([bytes as BlobPart], { type: MIME[kind] })
      }}
      note="OpenDocument files open in LibreOffice, Collabora, OnlyOffice, Google Docs and Microsoft Office."
    />
  )
}
