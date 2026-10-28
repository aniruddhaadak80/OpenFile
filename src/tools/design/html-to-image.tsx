import { useEffect, useRef, useState } from 'react'
import { Download, Code2 } from 'lucide-react'
import { Button, Field, Input, Label, Segmented, Slider, Switch, Textarea, ToolGrid, ErrorNote, useJob, CopyButton } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { ColorInput } from '@/tools/image/_img/kit'

const SAMPLE_HTML = `<div class="card">
  <div class="tag">OpenFile</div>
  <h1>Private file tools</h1>
  <p>Everything runs in your browser. Nothing is uploaded.</p>
  <div class="row"><span>PDF</span><span>Image</span><span>3D</span><span>Fonts</span></div>
</div>`
const SAMPLE_CSS = `.card { width: 560px; padding: 40px; border-radius: 28px; font-family: system-ui, sans-serif;
  background: linear-gradient(135deg, #0b0b0c, #1d2a2a); color: #f5f5f5; }
.tag { display: inline-block; padding: 4px 12px; border-radius: 99px; background: #F5A524; color: #111; font-weight: 700; font-size: 13px; }
h1 { font-size: 40px; margin: 18px 0 8px; }
p { color: #b8c4c4; font-size: 18px; margin: 0 0 22px; }
.row { display: flex; gap: 8px; }
.row span { padding: 6px 12px; border: 1px solid #2dd4bf55; border-radius: 10px; color: #5eead4; font-size: 14px; }`

type Fmt = 'png' | 'jpg' | 'svg' | 'webp'

export default function HtmlToImage() {
  const [html, setHtml] = useState(SAMPLE_HTML)
  const [css, setCss] = useState(SAMPLE_CSS)
  const [fmt, setFmt] = useState<Fmt>('png')
  const [scale, setScale] = useState(2)
  const [width, setWidth] = useState(0)
  const [transparent, setTransparent] = useState(true)
  const [bg, setBg] = useState('#ffffff')
  const [pad, setPad] = useState(24)
  const [fontUrl, setFontUrl] = useState('')
  const stage = useRef<HTMLDivElement>(null)
  const { busy, error, run } = useJob()

  const [safe, setSafe] = useState('')
  useEffect(() => {
    let dead = false
    import('dompurify').then(({ default: DOMPurify }) => {
      if (dead) return
      setSafe(DOMPurify.sanitize(html, { ADD_TAGS: ['style'], FORBID_TAGS: ['script', 'iframe', 'object', 'embed'], WHOLE_DOCUMENT: false }))
    })
    return () => { dead = true }
  }, [html])
  // scope the CSS to the stage so it cannot restyle the app
  const scoped = css.replace(/(^|\})\s*([^{}@]+)\{/g, (_m, brace, sel) => `${brace} ${sel.split(',').map((s: string) => `.of-html-stage ${s.trim()}`).join(', ')} {`)

  const render = () => run(async () => {
    const node = stage.current
    if (!node) return
    const lib = await import('html-to-image')
    const opts: any = { pixelRatio: scale, cacheBust: true, backgroundColor: transparent && fmt !== 'jpg' ? undefined : bg, width: width || undefined, style: { margin: '0' } }
    if (fontUrl) { opts.fontEmbedCSS = `@import url('${fontUrl}');` }
    let blob: Blob
    if (fmt === 'svg') { const url = await lib.toSvg(node, opts); blob = new Blob([decodeURIComponent(url.split(',')[1])], { type: 'image/svg+xml' }) }
    else if (fmt === 'jpg') { const url = await lib.toJpeg(node, { ...opts, quality: 0.95 }); blob = await (await fetch(url)).blob() }
    else if (fmt === 'webp') { const c = await lib.toCanvas(node, opts); blob = await new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('WEBP export failed'))), 'image/webp', 0.95)) }
    else blob = (await lib.toBlob(node, opts))!
    downloadBlob(blob, `html-snippet.${fmt}`)
  })

  return (
    <ToolGrid
      main={<div className="space-y-4">
        {fontUrl && <link rel="stylesheet" href={fontUrl} />}
        <div className="checker overflow-auto rounded-2xl border border-border p-6" style={{ background: transparent ? undefined : bg }}>
          <style>{scoped}</style>
          <div ref={stage} className="of-html-stage inline-block" style={{ padding: pad, width: width || undefined, background: transparent ? 'transparent' : bg }} dangerouslySetInnerHTML={{ __html: safe }} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div><Label hint={<CopyButton text={html} />}>HTML</Label><Textarea value={html} onChange={(e) => setHtml(e.target.value)} className="min-h-56" spellCheck={false} aria-label="HTML" /></div>
          <div><Label hint={<CopyButton text={css} />}>CSS</Label><Textarea value={css} onChange={(e) => setCss(e.target.value)} className="min-h-56" spellCheck={false} aria-label="CSS" /></div>
        </div>
      </div>}
      side={<>
        <Field label="Format"><Segmented value={fmt} onChange={setFmt} options={[{ value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }, { value: 'webp', label: 'WEBP' }, { value: 'svg', label: 'SVG' }]} /></Field>
        {fmt !== 'svg' && <Slider label="Pixel ratio" value={scale} onChange={setScale} min={1} max={4} step={0.5} suffix="×" />}
        <Field label="Fixed width (px, 0 = auto)"><Input type="number" min={0} value={width} onChange={(e) => setWidth(Number(e.target.value))} /></Field>
        <Slider label="Padding" value={pad} onChange={setPad} min={0} max={120} suffix=" px" />
        <Switch checked={transparent && fmt !== 'jpg'} onChange={setTransparent} label="Transparent background" />
        {(!transparent || fmt === 'jpg') && <div><Label>Background</Label><ColorInput value={bg} onChange={setBg} /></div>}
        <Field label="Web font stylesheet (optional)"><Input placeholder="https://fonts.googleapis.com/css2?family=Inter" value={fontUrl} onChange={(e) => setFontUrl(e.target.value)} /></Field>
        <ErrorNote error={error} />
        <Button size="lg" className="w-full" loading={busy} icon={<Download className="size-4" />} onClick={render}>Download {fmt.toUpperCase()}</Button>
        <p className="flex gap-2 text-[11px] text-muted"><Code2 className="size-3.5 shrink-0" />Scripts are removed for safety. Images from other sites only work if they allow cross-origin access.</p>
      </>}
    />
  )
}
