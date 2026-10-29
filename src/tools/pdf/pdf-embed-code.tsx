import { useEffect, useMemo, useState } from 'react'
import { Code2, Upload } from 'lucide-react'
import { CopyButton, Field, Input, Segmented, Slider, Switch, Textarea, ToolGrid, Card, Tabs } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { Note } from './_b1/ui'

type Kind = 'iframe' | 'object' | 'viewer'
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const PDFJS_VERSION = '4.10.38'

export default function PdfEmbedCode() {
  const [url, setUrl] = useState('https://example.com/files/brochure.pdf')
  const [title, setTitle] = useState('PDF document')
  const [kind, setKind] = useState<Kind>('viewer')
  const [width, setWidth] = useState(100), [unit, setUnit] = useState<'%' | 'px'>('%')
  const [height, setHeight] = useState(640)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState<'page-width' | 'page-fit' | '100'>('page-width')
  const [toolbar, setToolbar] = useState(true)
  const [download, setDownload] = useState(true)
  const [rounded, setRounded] = useState(true)
  const [local, setLocal] = useState<{ name: string; url: string } | null>(null)
  const [tab, setTab] = useState<'code' | 'preview'>('preview')
  useEffect(() => () => { if (local) URL.revokeObjectURL(local.url) }, [local])

  const frag = useMemo(() => { const p = [`page=${page}`, `zoom=${zoom === 'page-width' ? 'page-width' : zoom === 'page-fit' ? 'page-fit' : '100'}`]; if (!toolbar) p.push('toolbar=0', 'navpanes=0'); return '#' + p.join('&') }, [page, zoom, toolbar])
  const w = `${width}${unit}`
  const style = `width:${w};max-width:100%;height:${height}px;border:1px solid #d0d4da;${rounded ? 'border-radius:12px;' : ''}`
  const id = 'pdfv-' + useMemo(() => Math.random().toString(36).slice(2, 7), [])
  const code = useMemo(() => {
    const dl = download ? `\n  <p style="font:14px system-ui,sans-serif;margin:.5em 0"><a href="${esc(url)}" download>Download the PDF</a></p>` : ''
    if (kind === 'iframe') return `<iframe src="${esc(url)}${frag}" title="${esc(title)}" style="${style}" loading="lazy"></iframe>${download ? `\n<p style="font:14px system-ui,sans-serif"><a href="${esc(url)}" download>Download the PDF</a></p>` : ''}`
    if (kind === 'object') return `<object data="${esc(url)}${frag}" type="application/pdf" title="${esc(title)}" style="${style}">\n  <p>Your browser cannot show this PDF here. <a href="${esc(url)}">Open the PDF</a>.</p>\n</object>${dl}`
    return `<!-- PDF viewer: renders with PDF.js in every browser, including phones. The PDF must allow cross-origin requests (CORS) if it is on another domain. -->
<div id="${id}" role="document" aria-label="${esc(title)}" style="${style}overflow:auto;background:#525659;padding:12px;box-sizing:border-box"></div>${dl}
<script type="module">
  import * as pdfjs from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs';
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs';
  const box = document.getElementById('${id}');
  const doc = await pdfjs.getDocument(${JSON.stringify(url).replace(/</g, '\\u003c')}).promise;
  const render = async () => {
    box.replaceChildren();
    const width = box.clientWidth - 24;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = ${zoom === '100' ? '1' : zoom === 'page-fit' ? `Math.min(width / base.width, (box.clientHeight - 24) / base.height)` : 'width / base.width'} * (window.devicePixelRatio || 1);
      const vp = page.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = vp.width; c.height = vp.height;
      c.style.cssText = 'display:block;margin:0 auto 12px;max-width:100%;height:auto;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.4)';
      c.setAttribute('aria-label', 'Page ' + n);
      box.appendChild(c);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      if (n === ${page}) c.scrollIntoView({ block: 'start' });
    }
  };
  render();
  let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(render, 300); });
</script>`
  }, [kind, url, frag, title, style, download, page, zoom, id])

  const previewSrc = local?.url ?? url
  return (
    <ToolGrid
      main={<div className="space-y-3">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'preview', label: 'Preview' }, { value: 'code', label: 'Embed code' }]} />
        {tab === 'code' ? <Card className="space-y-3">
          <Textarea readOnly value={code} className="min-h-80 text-[12px]" aria-label="Embed code" onFocus={(e) => e.currentTarget.select()} />
          <div className="flex flex-wrap gap-2"><CopyButton text={code} label="Copy code" size="md" variant="secondary" /><button type="button" onClick={() => downloadBlob(`<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title></head><body style="margin:24px">\n${code}\n</body></html>\n`, 'pdf-embed.html', 'text/html')} className="rounded-xl border border-border px-3 text-sm text-muted hover:border-accent hover:text-accent cursor-pointer">Download as test page</button></div>
        </Card> : <Card className="space-y-2">
          <div className="text-xs text-muted">{local ? `Previewing your local file ${local.name}. The code still points at the web address.` : kind === 'viewer' ? 'Preview uses your browser\'s built-in viewer. The PDF.js snippet looks the same in every browser once published.' : 'Live preview of the embed.'}</div>
          <div className="overflow-hidden rounded-xl bg-surface-2"><iframe key={previewSrc + frag} src={previewSrc + frag} title="Preview" style={{ width: unit === '%' ? `${width}%` : Math.min(width, 2000), height, maxWidth: '100%', border: '1px solid var(--color-border)', borderRadius: rounded ? 12 : 0 }} /></div>
        </Card>}
      </div>}
      side={<>
        <Field label="PDF web address"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/file.pdf" /></Field>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted hover:border-accent hover:text-accent"><Upload className="size-3.5" />{local ? 'Preview another local PDF' : 'Preview with a PDF from your device'}<input type="file" hidden accept="application/pdf,.pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) setLocal({ name: f.name, url: URL.createObjectURL(f) }); e.target.value = '' }} /></label>
        <Field label="Title (for screen readers)"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Embed type"><Segmented value={kind} onChange={setKind} options={[{ value: 'viewer', label: 'PDF.js viewer' }, { value: 'iframe', label: 'iframe' }, { value: 'object', label: 'object + fallback' }]} /></Field>
        <div className="-mt-3 text-xs text-muted">{kind === 'viewer' ? 'Works on phones too. Needs CORS when the PDF is on another domain.' : kind === 'iframe' ? 'Simplest. Phones may show a download link instead of the PDF.' : 'Shows a link when the browser cannot display PDFs.'}</div>
        <div className="grid grid-cols-[1fr_auto] items-end gap-2"><Slider label="Width" value={width} min={unit === '%' ? 20 : 200} max={unit === '%' ? 100 : 1600} step={unit === '%' ? 5 : 10} onChange={setWidth} suffix={unit} /><Segmented value={unit} onChange={(u) => { setUnit(u); setWidth(u === '%' ? 100 : 800) }} options={['%', 'px']} /></div>
        <Slider label="Height" value={height} min={200} max={1400} step={10} onChange={setHeight} suffix=" px" />
        <div className="grid grid-cols-2 gap-2"><Field label="Start page"><Input type="number" min={1} value={page} onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))} /></Field><Field label="Zoom"><Segmented value={zoom} onChange={setZoom} options={[{ value: 'page-width', label: 'Width' }, { value: 'page-fit', label: 'Page' }, { value: '100', label: '100%' }]} /></Field></div>
        <div className="space-y-3">
          {kind !== 'viewer' && <Switch checked={toolbar} onChange={setToolbar} label="Show the viewer toolbar" />}
          <Switch checked={download} onChange={setDownload} label="Add a download link" />
          <Switch checked={rounded} onChange={setRounded} label="Rounded corners" />
        </div>
        <Note>Host the PDF yourself (your website, a storage bucket or a CDN), then paste its address here. No file is uploaded by this tool.</Note>
        <div className="flex items-center justify-center gap-1 text-xs text-muted"><Code2 className="size-3" />Plain HTML, no tracking.</div>
      </>}
    />
  )
}
