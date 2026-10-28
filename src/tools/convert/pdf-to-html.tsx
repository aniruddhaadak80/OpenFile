import { useState } from 'react'
import { Code2 } from 'lucide-react'
import { Field, Segmented, Slider, Switch } from '@/components/ui'
import { readDataUrl } from '@/lib/files'
import { PdfConvertShell, HtmlPreview } from './_b1/Shell'
import { toHtmlDoc } from './_b1/writers'
import { escHtml } from './_b1/text'

export default function PdfToHtml() {
  const [mode, setMode] = useState<'reflow' | 'exact'>('reflow')
  const [breaks, setBreaks] = useState(true)
  const [dpi, setDpi] = useState(120)
  return (
    <PdfConvertShell
      label="Drop a PDF to turn it into a web page"
      icon={<Code2 className="size-5" />} action="Convert to HTML" ext="html" optionDeps={[mode, breaks, dpi]} hideModelOptions={mode === 'exact'}
      options={<>
        <Field label="Layout"><Segmented value={mode} onChange={setMode} options={[{ value: 'reflow', label: 'Clean, reflowing' }, { value: 'exact', label: 'Exact look' }]} /></Field>
        <div className="-mt-3 text-xs text-muted">{mode === 'reflow' ? 'Readable HTML that adapts to any screen. Best for articles, reports and docs.' : 'Each page looks exactly like the PDF, with real selectable text placed on top.'}</div>
        {mode === 'reflow' ? <Switch checked={breaks} onChange={setBreaks} label="Show page breaks" /> : <Slider label="Page image resolution" value={dpi} min={72} max={220} step={4} onChange={setDpi} suffix=" DPI" />}
      </>}
      preview={(model, title) => mode === 'reflow' ? <HtmlPreview html={toHtmlDoc(model.slice(0, 20), { title, images: new Map(), pageBreaks: breaks }, () => '')} /> : <div className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">Exact mode renders every page as a picture with an invisible, selectable and searchable text layer on top. Open the file after converting to see it.</div>}
      build={async ({ model, title, author, images, pages, renderImage, setP }) => {
        if (mode === 'reflow') {
          const urls = new Map<number, string>()
          for (const im of images.values()) urls.set(im.page, await readDataUrl(new Blob([im.data as BlobPart], { type: im.mime })))
          return new Blob([toHtmlDoc(model, { title, author, images, pageBreaks: breaks, lang: 'en' }, (im) => urls.get(im.page) ?? '')], { type: 'text/html' })
        }
        const parts: string[] = []
        for (let i = 0; i < pages.length; i++) {
          const pg = pages[i]
          const im = await renderImage(i + 1, dpi / 72, 'image/jpeg')
          const url = await readDataUrl(new Blob([im.data as BlobPart], { type: im.mime }))
          const spans = pg.items.filter((it) => it.str.trim()).map((it) => `<span style="left:${(it.x / pg.width * 100).toFixed(3)}%;top:${((it.y - it.size * 0.85) / pg.height * 100).toFixed(3)}%;font-size:${(it.size / pg.width * 100).toFixed(3)}cqw;width:${(it.w / pg.width * 100).toFixed(3)}%">${escHtml(it.str)}</span>`).join('')
          parts.push(`<section class="pg" style="aspect-ratio:${pg.width}/${pg.height}"><img src="${url}" alt="Page ${i + 1}">${spans}</section>`)
          setP((i + 1) / pages.length)
        }
        const css = `body{margin:0;background:#525659;padding:24px 12px;font-family:sans-serif}.pg{position:relative;max-width:${Math.round(pages[0].width * 1.5)}px;margin:0 auto 24px;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.4);container-type:inline-size}.pg img{position:absolute;inset:0;width:100%;height:100%;user-select:none}.pg span{position:absolute;color:transparent;white-space:pre;line-height:1;transform-origin:0 0;cursor:text}.pg span::selection{background:rgba(56,189,248,.35)}`
        return new Blob([`<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escHtml(title)}</title><meta name="generator" content="OpenFile"><style>${css}</style></head><body>${parts.join('\n')}</body></html>`], { type: 'text/html' })
      }}
      note="The result is a single self-contained .html file with images inside, so it works offline and can be uploaded anywhere."
    />
  )
}
