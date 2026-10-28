import { useState } from 'react'
import { FileType } from 'lucide-react'
import { Select, Switch, Field, Slider } from '@/components/ui'
import { PdfConvertShell, TextPreview } from './_b1/Shell'
import { toMarkdown, toRtf } from './_b1/writers'

export default function PdfToRtf() {
  const [breaks, setBreaks] = useState(true)
  const [font, setFont] = useState('Calibri')
  const [size, setSize] = useState(11)
  return (
    <PdfConvertShell
      label="Drop a PDF to turn it into an RTF document"
      icon={<FileType className="size-5" />} action="Convert to RTF" ext="rtf" optionDeps={[breaks, font, size]}
      options={<>
        <Switch checked={breaks} onChange={setBreaks} label="Keep page breaks" />
        <Field label="Font"><Select value={font} onChange={setFont} options={['Calibri', 'Arial', 'Times New Roman', 'Georgia', 'Verdana']} /></Field>
        <Slider label="Body text size" value={size} min={8} max={16} onChange={setSize} suffix=" pt" />
      </>}
      preview={(model, title) => <TextPreview label="Text that will be written" text={toMarkdown(model, { title, images: new Map(), pageBreaks: breaks }).replace(/[*#|]/g, '')} />}
      build={async ({ model, title, author, images }) => new Blob([toRtf(model, { title, author, images, pageBreaks: breaks, font, size })], { type: 'application/rtf' })}
      note="RTF opens in Word, WordPad, TextEdit, LibreOffice and Google Docs. Paragraphs, headings, lists, bold and italic, tables and image pages are kept."
    />
  )
}
