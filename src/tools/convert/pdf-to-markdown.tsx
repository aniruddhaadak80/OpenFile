import { useState } from 'react'
import { FileDown } from 'lucide-react'
import { Switch } from '@/components/ui'
import { zipFiles } from '@/lib/files'
import { PdfConvertShell, TextPreview } from './_b1/Shell'
import { toMarkdown } from './_b1/writers'

export default function PdfToMarkdown() {
  const [breaks, setBreaks] = useState(false)
  return (
    <PdfConvertShell
      label="Drop a PDF to turn it into Markdown"
      icon={<FileDown className="size-5" />} action="Convert to Markdown" optionDeps={[breaks]}
      ext={({ model }) => (model.flat().some((n) => n.type === 'scan') ? 'zip' : 'md')}
      options={<Switch checked={breaks} onChange={setBreaks} label="Mark page breaks with a rule (---)" />}
      preview={(model, title) => <TextPreview label="Markdown preview" text={toMarkdown(model, { title, images: new Map(), pageBreaks: breaks })} />}
      build={async ({ model, title, images }) => {
        const md = toMarkdown(model, { title, images, pageBreaks: breaks })
        if (!images.size) return new Blob([md], { type: 'text/markdown' })
        return zipFiles([{ name: `${title || 'document'}.md`, data: md }, ...[...images.values()].map((im) => ({ name: `images/${im.name}`, data: im.data }))])
      }}
      note="Headings, bold and italic text, bullet and numbered lists, and tables become Markdown. Pages without text are saved as images in a ZIP next to the .md file."
    />
  )
}
