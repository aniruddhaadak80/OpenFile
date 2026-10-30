import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Shuffle, ArrowLeftRight } from 'lucide-react'
import { Button, Card, Input, Label, Segmented, Select, Slider, Switch, Textarea, CopyButton, Badge } from '@/components/ui'
import { downloadBlob, formatBytes } from '@/lib/files'
import { ColorField } from './_design/ColorPicker'
import { hslToRgb, rgbToHex, parseColor, textOn } from './_design/color'

type Fmt = 'png' | 'jpg' | 'webp' | 'svg'
type Pattern = 'solid' | 'gradient' | 'stripes' | 'grid' | 'dots' | 'cross'
const PRESETS: [string, number, number][] = [
  ['Thumbnail', 150, 150], ['Avatar', 256, 256], ['Square', 1080, 1080], ['Card', 600, 400], ['Banner', 1200, 300], ['OG image', 1200, 630],
  ['HD 16:9', 1280, 720], ['Full HD', 1920, 1080], ['Story 9:16', 1080, 1920], ['Leaderboard ad', 728, 90], ['Med. rectangle', 300, 250],
  ['Skyscraper', 160, 600], ['A4 @96dpi', 794, 1123], ['Twitter header', 1500, 500], ['YouTube thumb', 1280, 720],
]
const FONTS = [{ value: 'Inter, system-ui, sans-serif', label: 'Sans' }, { value: 'Georgia, serif', label: 'Serif' }, { value: '"JetBrains Mono", monospace', label: 'Mono' }, { value: '"Space Grotesk", sans-serif', label: 'Display' }]
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function buildSvg(o: { w: number; h: number; bg: string; bg2: string; fg: string; text: string; size: number; font: string; pattern: Pattern; weight: number; border: boolean }) {
  const { w, h, bg, bg2, fg, pattern } = o
  const lines = o.text.split('\n')
  let defs = '', fill = bg
  const pc = parseColor(fg) ?? { r: 0, g: 0, b: 0, a: 1 }
  const faint = `rgba(${Math.round(pc.r)},${Math.round(pc.g)},${Math.round(pc.b)},0.14)`
  const cell = Math.max(10, Math.round(Math.min(w, h) / 12))
  if (pattern === 'gradient') { defs = `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${bg2}"/></linearGradient>`; fill = 'url(#g)' }
  let overlay = ''
  if (pattern === 'stripes') { defs = `<pattern id="p" width="${cell}" height="${cell}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${cell / 2}" height="${cell}" fill="${faint}"/></pattern>`; overlay = `<rect width="100%" height="100%" fill="url(#p)"/>` }
  if (pattern === 'grid') { defs = `<pattern id="p" width="${cell}" height="${cell}" patternUnits="userSpaceOnUse"><path d="M ${cell} 0 L 0 0 0 ${cell}" fill="none" stroke="${faint}" stroke-width="1"/></pattern>`; overlay = `<rect width="100%" height="100%" fill="url(#p)"/>` }
  if (pattern === 'dots') { defs = `<pattern id="p" width="${cell}" height="${cell}" patternUnits="userSpaceOnUse"><circle cx="${cell / 2}" cy="${cell / 2}" r="${Math.max(1, cell / 10)}" fill="${faint}"/></pattern>`; overlay = `<rect width="100%" height="100%" fill="url(#p)"/>` }
  if (pattern === 'cross') overlay = `<path d="M0 0L${w} ${h}M${w} 0L0 ${h}" stroke="${faint}" stroke-width="${Math.max(1, Math.min(w, h) / 200)}"/>`
  const lh = o.size * 1.2, y0 = h / 2 - ((lines.length - 1) * lh) / 2
  const text = lines.map((l, i) => `<text x="50%" y="${+(y0 + i * lh).toFixed(1)}" dominant-baseline="central" text-anchor="middle" font-family="${esc(o.font)}" font-size="${o.size}" font-weight="${o.weight}" fill="${fg}">${esc(l)}</text>`).join('')
  const border = o.border ? `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="none" stroke="${faint}" stroke-width="1"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}<rect width="100%" height="100%" fill="${fill}"/>${overlay}${border}${text}</svg>`
}

export default function PlaceholderImage() {
  const [w, setW] = useState(1200), [h, setH] = useState(630)
  const [bg, setBg] = useState('#f5a524'), [bg2, setBg2] = useState('#22d3ee'), [fg, setFg] = useState('#ffffff')
  const [text, setText] = useState(''), [autoSize, setAutoSize] = useState(true), [size, setSize] = useState(64)
  const [font, setFont] = useState(FONTS[0].value), [weight, setWeight] = useState(700)
  const [pattern, setPattern] = useState<Pattern>('solid'), [fmt, setFmt] = useState<Fmt>('png'), [quality, setQuality] = useState(0.9)
  const [border, setBorder] = useState(false)
  const [dataUri, setDataUri] = useState(''), [blob, setBlob] = useState<Blob | null>(null)

  const W = Math.max(1, Math.min(8000, w || 1)), H = Math.max(1, Math.min(8000, h || 1))
  const label = text.trim() || `${W} × ${H}`
  const fsize = autoSize ? Math.max(8, Math.round(Math.min(W / (Math.max(...label.split('\n').map((l) => l.length)) * 0.62), H / (label.split('\n').length * 1.6)) )) : size
  const svg = useMemo(() => buildSvg({ w: W, h: H, bg, bg2, fg, text: label, size: fsize, font, pattern, weight, border }), [W, H, bg, bg2, fg, label, fsize, font, pattern, weight, border])

  useEffect(() => {
    let cancel = false
    const t = setTimeout(async () => {
      if (fmt === 'svg') { const b = new Blob([svg], { type: 'image/svg+xml' }); if (!cancel) { setBlob(b); setDataUri(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`) } return }
      await document.fonts?.ready
      const img = new Image()
      img.onload = () => {
        if (cancel) return
        const c = document.createElement('canvas'); c.width = W; c.height = H
        const ctx = c.getContext('2d')!
        if (fmt === 'jpg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H) }
        ctx.drawImage(img, 0, 0, W, H)
        const mime = fmt === 'jpg' ? 'image/jpeg' : `image/${fmt}`
        setDataUri(c.toDataURL(mime, quality))
        c.toBlob((b) => !cancel && setBlob(b), mime, quality)
      }
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    }, 150)
    return () => { cancel = true; clearTimeout(t) }
  }, [svg, fmt, quality, W, H])

  const fname = `placeholder-${W}x${H}.${fmt}`
  const imgTag = `<img src="${dataUri.length > 3000 ? fname : dataUri}" width="${W}" height="${H}" alt="${esc(label.replace(/\n/g, ' '))}" loading="lazy" />`
  const randomize = () => { const h0 = Math.random() * 360; const a = hslToRgb(h0, 70, 55), b = hslToRgb(h0 + 60 + Math.random() * 90, 75, 55); setBg(rgbToHex(a)); setBg2(rgbToHex(b)); setFg(textOn(a)) }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-4">
        <Card className="checker grid min-h-[360px] place-items-center p-4">
          <motion.img key={`${W}x${H}`} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)} alt="Placeholder preview" className="max-h-[520px] max-w-full rounded-lg shadow-2xl" style={{ aspectRatio: `${W}/${H}` }} />
        </Card>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge>{fmt.toUpperCase()}</Badge><span>{W} × {H}px</span>{blob && <span>· {formatBytes(blob.size)}</span>}<span>· ratio {(W / H).toFixed(3)}</span>
        </div>
        <Card className="space-y-3">
          <div className="flex items-center justify-between"><Label className="mb-0">Data URI</Label><CopyButton text={dataUri} label="Copy data URI" /></div>
          <Textarea readOnly value={dataUri} className="h-20 min-h-0 text-[11px]" />
          <div className="flex items-center justify-between"><Label className="mb-0">&lt;img&gt; snippet</Label><CopyButton text={`<img src="${dataUri}" width="${W}" height="${H}" alt="${esc(label.replace(/\n/g, ' '))}" />`} label="Copy with data URI" /></div>
          <Textarea readOnly value={imgTag} className="h-16 min-h-0 text-[11px]" />
          {dataUri.length > 3000 && <p className="text-[11px] text-muted">Snippet shows the file name to stay readable; "Copy with data URI" inlines the full image.</p>}
        </Card>
      </div>
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Card className="space-y-5">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div><Label>Width</Label><Input type="number" min={1} max={8000} value={w} onChange={(e) => setW(+e.target.value)} /></div>
            <button onClick={() => { setW(h); setH(w) }} className="mb-2.5 rounded-lg p-1.5 text-muted hover:text-accent cursor-pointer" title="Swap"><ArrowLeftRight className="size-4" /></button>
            <div><Label>Height</Label><Input type="number" min={1} max={8000} value={h} onChange={(e) => setH(+e.target.value)} /></div>
          </div>
          <Select aria-label="Size presets" value="" onChange={(v) => { const p = PRESETS.find((x) => x[0] === v); if (p) { setW(p[1]); setH(p[2]) } }} options={[{ value: '', label: 'Size presets…' }, ...PRESETS.map(([n, a, b]) => ({ value: n, label: `${n}, ${a}×${b}` }))]} />
          <div><Label>Pattern</Label><Segmented value={pattern} onChange={setPattern} options={['solid', 'gradient', 'stripes', 'grid', 'dots', 'cross']} /></div>
          <div className="grid grid-cols-2 gap-3">
            <ColorField label={pattern === 'gradient' ? 'From' : 'Background'} value={bg} onChange={setBg} alpha={fmt !== 'jpg'} />
            {pattern === 'gradient' ? <ColorField label="To" value={bg2} onChange={setBg2} alpha={fmt !== 'jpg'} /> : <ColorField label="Text" value={fg} onChange={setFg} />}
          </div>
          {pattern === 'gradient' && <ColorField label="Text" value={fg} onChange={setFg} />}
          <Button variant="secondary" size="sm" onClick={randomize} icon={<Shuffle className="size-4" />}>Random colours</Button>
          <div><Label hint="Enter = new line">Text</Label><Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={`${W} × ${H}`} className="min-h-16 font-sans text-sm" /></div>
          <div className="grid grid-cols-2 gap-3"><div><Label>Font</Label><Select aria-label="Font" value={font} onChange={setFont} options={FONTS} /></div><div><Label>Weight</Label><Select aria-label="Weight" value={String(weight)} onChange={(v) => setWeight(+v)} options={['400', '500', '600', '700', '800']} /></div></div>
          <Switch checked={autoSize} onChange={setAutoSize} label="Auto-fit font size" />
          {!autoSize && <Slider label="Font size" value={size} onChange={setSize} min={8} max={400} suffix="px" />}
          <Switch checked={border} onChange={setBorder} label="Thin border" />
          <div><Label>Format</Label><Segmented value={fmt} onChange={setFmt} options={[{ value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }, { value: 'webp', label: 'WEBP' }, { value: 'svg', label: 'SVG' }]} /></div>
          {(fmt === 'jpg' || fmt === 'webp') && <Slider label="Quality" value={Math.round(quality * 100)} onChange={(v) => setQuality(v / 100)} min={10} max={100} suffix="%" />}
          <Button className="w-full" disabled={!blob} onClick={() => blob && downloadBlob(blob, fname)} icon={<Download className="size-4" />}>Download {fmt.toUpperCase()}</Button>
        </Card>
      </aside>
    </div>
  )
}
