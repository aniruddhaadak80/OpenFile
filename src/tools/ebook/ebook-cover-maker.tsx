import { useEffect, useRef, useState } from 'react'
import { BookImage, Download, ImagePlus, X } from 'lucide-react'
import { Button, Field, Input, Select, Slider, ToolGrid, Label, cn } from '@/components/ui'
import { downloadBlob, canvasToBlob } from '@/lib/files'
import { OpenButton } from '@/lib/b14/ui'
import { toast } from '@/components/toast'

const SIZES = [{ value: '1600x2560', label: 'Kindle eBook 1600 x 2560' }, { value: '1800x2700', label: 'Print 6 x 9 in (1800 x 2700)' }, { value: '1410x2250', label: 'Wattpad / web 1410 x 2250' }, { value: '2400x2400', label: 'Audiobook square 2400 x 2400' }]
const STYLES = ['band', 'minimal', 'split', 'frame', 'photo'] as const
type Style = (typeof STYLES)[number]
const STYLE_LABEL: Record<Style, string> = { band: 'Gold band', minimal: 'Minimal', split: 'Split colour', frame: 'Classic frame', photo: 'Full photo' }
const THEMES = [{ bg: '#0B0D10', fg: '#F5F3EE', ac: '#F5A524' }, { bg: '#0F2E2B', fg: '#F2EFE8', ac: '#2DD4BF' }, { bg: '#F2EFE8', fg: '#1A1C20', ac: '#F97316' }, { bg: '#0C2233', fg: '#E6F4FA', ac: '#38BDF8' }, { bg: '#1B2A12', fg: '#F4F7EC', ac: '#A3E635' }, { bg: '#FFF7E6', fg: '#2A1A05', ac: '#B45309' }]
const FONTS = [{ value: '"Space Grotesk", sans-serif', label: 'Space Grotesk (modern)' }, { value: 'Georgia, "Times New Roman", serif', label: 'Georgia (classic serif)' }, { value: 'Inter, sans-serif', label: 'Inter (clean)' }, { value: 'Impact, "Arial Black", sans-serif', label: 'Impact (thriller)' }, { value: '"JetBrains Mono", monospace', label: 'Mono (tech)' }]

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const out: string[] = []
  for (const para of text.split('\n')) { let cur = ''; for (const w of para.split(/\s+/).filter(Boolean)) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > max && cur) { out.push(cur); cur = w } else cur = t } out.push(cur) }
  return out
}

export default function EbookCoverMaker() {
  const [title, setTitle] = useState('The Quiet Harbour')
  const [sub, setSub] = useState('A novel')
  const [author, setAuthor] = useState('A. N. Writer')
  const [series, setSeries] = useState('')
  const [size, setSize] = useState('1600x2560')
  const [style, setStyle] = useState<Style>('band')
  const [theme, setTheme] = useState(0)
  const [font, setFont] = useState(FONTS[0].value)
  const [tsize, setTsize] = useState(100)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [dim, setDim] = useState(45)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = canvas.current; if (!c) return
    const [W, H] = size.split('x').map(Number); c.width = W; c.height = H
    const ctx = c.getContext('2d')!
    const t = THEMES[theme], u = W / 1600
    ctx.fillStyle = t.bg; ctx.fillRect(0, 0, W, H)
    const drawImg = (x: number, y: number, w: number, h: number) => { if (!img) return; const s = Math.max(w / img.width, h / img.height); const iw = img.width * s, ih = img.height * s; ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); ctx.restore() }
    if (style === 'photo' || (style === 'minimal' && img)) { drawImg(0, 0, W, H); const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, `rgba(0,0,0,${dim / 100})`); g.addColorStop(0.45, `rgba(0,0,0,${dim / 250})`); g.addColorStop(1, `rgba(0,0,0,${Math.min(0.9, dim / 70)})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H) }
    if (style === 'split') { ctx.fillStyle = t.ac; ctx.fillRect(0, H * 0.58, W, H * 0.42); drawImg(0, 0, W, H * 0.58) }
    if (style === 'band') { drawImg(0, 0, W, H); if (img) { ctx.fillStyle = `rgba(0,0,0,${dim / 100})`; ctx.fillRect(0, 0, W, H) } ctx.fillStyle = t.ac; ctx.fillRect(0, H * 0.34, W, H * 0.26) }
    if (style === 'frame') { drawImg(W * 0.14, H * 0.42, W * 0.72, H * 0.36); ctx.strokeStyle = t.ac; ctx.lineWidth = 10 * u; ctx.strokeRect(60 * u, 60 * u, W - 120 * u, H - 120 * u); ctx.lineWidth = 3 * u; ctx.strokeRect(84 * u, 84 * u, W - 168 * u, H - 168 * u) }
    const onPhoto = style === 'photo' || (style === 'minimal' && img)
    const fg = onPhoto ? '#FFFFFF' : t.fg
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
    const fs = 150 * u * (tsize / 100)
    ctx.font = `700 ${fs}px ${font}`
    const lines = wrap(ctx, title, W * 0.8)
    const lh = fs * 1.08
    let ty = style === 'band' ? H * 0.47 - ((lines.length - 1) * lh) / 2 + fs * 0.35 : style === 'split' ? H * 0.58 + 120 * u + fs * 0.8 : style === 'frame' ? 260 * u + fs : style === 'photo' ? H * 0.2 + fs : H * 0.3
    ctx.fillStyle = style === 'band' ? t.bg : style === 'split' ? t.bg : fg
    if (onPhoto) { ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 24 * u }
    for (const l of lines) { ctx.fillText(l, W / 2, ty); ty += lh }
    ctx.shadowBlur = 0
    if (sub) { ctx.font = `400 ${56 * u}px ${font}`; ctx.fillStyle = style === 'band' || style === 'split' ? t.bg : style === 'frame' ? t.ac : fg; ctx.globalAlpha = 0.85; ctx.fillText(sub, W / 2, ty + 10 * u); ctx.globalAlpha = 1 }
    if (series) { ctx.font = `600 ${44 * u}px ${font}`; ctx.fillStyle = onPhoto ? '#FFFFFF' : t.ac; ctx.fillText(series.toUpperCase(), W / 2, (style === 'frame' ? 190 : 150) * u) }
    if (style === 'minimal' && !img) { ctx.fillStyle = t.ac; ctx.fillRect(W / 2 - 120 * u, H * 0.3 + lines.length * lh + 60 * u, 240 * u, 10 * u) }
    ctx.font = `600 ${72 * u}px ${font}`; ctx.fillStyle = style === 'split' ? t.bg : style === 'band' ? (img ? '#FFFFFF' : t.fg) : style === 'frame' ? t.fg : fg
    ctx.fillText(author.toUpperCase(), W / 2, H - (style === 'frame' ? 200 : 150) * u)
  }, [title, sub, author, series, size, style, theme, font, tsize, img, dim])

  const save = async (type: 'image/jpeg' | 'image/png') => { const c = canvas.current; if (!c) return; downloadBlob(await canvasToBlob(c, type, 0.92), `${(title || 'cover').replace(/[^\w-]+/g, '-').toLowerCase()}-cover.${type === 'image/png' ? 'png' : 'jpg'}`) }
  const loadImg = (f: File) => {
    const u = URL.createObjectURL(f); const im = new Image()
    im.onload = () => setImg(im)
    im.onerror = () => { URL.revokeObjectURL(u); toast(`${f.name} is not a picture this browser can open. Choose a JPG, PNG or WebP.`, 'error') }
    im.src = u
  }
  return (
    <ToolGrid
      main={<div className="grid place-items-center rounded-2xl border border-border bg-surface-2/40 p-4"><canvas ref={canvas} className="h-auto max-h-[640px] w-auto max-w-full rounded-md shadow-2xl" aria-label="Cover preview" /></div>}
      side={<>
        <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Subtitle"><Input value={sub} onChange={(e) => setSub(e.target.value)} /></Field>
        <Field label="Author"><Input value={author} onChange={(e) => setAuthor(e.target.value)} /></Field>
        <Field label="Series (optional)"><Input value={series} onChange={(e) => setSeries(e.target.value)} placeholder="Book one of the Harbour trilogy" /></Field>
        <Field label="Layout"><Select value={style} onChange={setStyle} options={STYLES.map((s) => ({ value: s, label: STYLE_LABEL[s] }))} /></Field>
        <div><Label>Colours</Label><div className="flex flex-wrap gap-2">{THEMES.map((t, i) => <button key={i} type="button" aria-label={`Colour set ${i + 1}`} aria-pressed={theme === i} onClick={() => setTheme(i)} className={cn('flex size-9 cursor-pointer overflow-hidden rounded-lg border-2', theme === i ? 'border-accent' : 'border-border')}><span className="flex-1" style={{ background: t.bg }} /><span className="w-2.5" style={{ background: t.ac }} /></button>)}</div></div>
        <Field label="Font"><Select value={font} onChange={setFont} options={FONTS} /></Field>
        <Slider label="Title size" value={tsize} onChange={setTsize} min={50} max={160} suffix="%" />
        <div className="flex items-center gap-2">{img ? <Button size="sm" variant="outline" icon={<X className="size-4" />} onClick={() => setImg(null)}>Remove photo</Button> : <OpenButton accept="image/*" onFiles={(f) => loadImg(f[0])} label="Add a photo" />}<ImagePlus className="size-4 text-muted" /></div>
        {img && <Slider label="Darken photo" value={dim} onChange={setDim} min={0} max={90} suffix="%" />}
        <Field label="Size"><Select value={size} onChange={setSize} options={SIZES} /></Field>
        <div className="grid grid-cols-2 gap-2"><Button icon={<Download className="size-4" />} onClick={() => save('image/jpeg')}>JPG</Button><Button variant="outline" icon={<Download className="size-4" />} onClick={() => save('image/png')}>PNG</Button></div>
        <p className="flex gap-1.5 text-xs text-muted"><BookImage className="size-4 shrink-0" />Use the EPUB Editor to put the new cover into your book.</p>
      </>}
    />
  )
}
