import { useEffect, useRef, useState } from 'react'
import { ImageDown } from 'lucide-react'
import { Button, Card, Dropzone, Input, Label, Select, Slider, Switch, Textarea } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { canvasBlob, drawCover, fitFont, FONTS } from '@/lib/cf/canvas'

const SIZES = { sq: { label: 'Square post 1080×1080', w: 1080, h: 1080 }, portrait: { label: 'Portrait post 1080×1350', w: 1080, h: 1350 }, story: { label: 'Story 1080×1920', w: 1080, h: 1920 }, x: { label: 'X / LinkedIn 1200×675', w: 1200, h: 675 }, pin: { label: 'Pinterest 1000×1500', w: 1000, h: 1500 } } as const
const THEMES = [
  { name: 'Night gold', bg: ['#0B0D10', '#1C1917'], text: '#F5F3EE', accent: '#F5A524' },
  { name: 'Amber', bg: ['#F5A524', '#F97316'], text: '#1C1917', accent: '#0B0D10' },
  { name: 'Lagoon', bg: ['#0F766E', '#0E7490'], text: '#F0FDFA', accent: '#FDE68A' },
  { name: 'Paper', bg: ['#F5F3EE', '#E7E5E4'], text: '#1C1917', accent: '#B45309' },
  { name: 'Forest', bg: ['#052E16', '#14532D'], text: '#ECFCCB', accent: '#84CC16' },
  { name: 'Sky', bg: ['#082F49', '#0369A1'], text: '#F0F9FF', accent: '#38BDF8' },
]

export default function QuoteCardMaker() {
  const [quote, setQuote] = useState('The secret of getting ahead is getting started.')
  const [author, setAuthor] = useState('Mark Twain'), [handle, setHandle] = useState('@yourhandle')
  const [size, setSize] = useState<keyof typeof SIZES>('sq'), [theme, setTheme] = useState(0), [font, setFont] = useState(FONTS[3].value)
  const [align, setAlign] = useState<'left' | 'center'>('center'), [marks, setMarks] = useState(true), [pad, setPad] = useState(10)
  const [img, setImg] = useState<ImageBitmap | null>(null), [shade, setShade] = useState(55)
  const cv = useRef<HTMLCanvasElement>(null)
  const S = SIZES[size], T = THEMES[theme]
  useEffect(() => {
    const c = cv.current; if (!c) return; c.width = S.w; c.height = S.h; const g = c.getContext('2d')!; const u = Math.min(S.w, S.h) / 1080
    const grd = g.createLinearGradient(0, 0, S.w, S.h); grd.addColorStop(0, T.bg[0]); grd.addColorStop(1, T.bg[1]); g.fillStyle = grd; g.fillRect(0, 0, S.w, S.h)
    if (img) { drawCover(g, img, 0, 0, S.w, S.h); g.fillStyle = `rgba(0,0,0,${shade / 100})`; g.fillRect(0, 0, S.w, S.h) }
    const px = (pad / 100) * S.w, top = S.h * 0.18, boxW = S.w - px * 2, boxH = S.h * 0.55
    const textCol = img ? '#F5F3EE' : T.text
    if (marks) { g.font = `700 ${Math.round(260 * u)}px Georgia, serif`; g.fillStyle = T.accent; g.globalAlpha = 0.9; g.textBaseline = 'top'; g.textAlign = align; g.fillText('\u201C', align === 'center' ? S.w / 2 : px, top - 140 * u); g.globalAlpha = 1 }
    const { size: fs, lines } = fitFont(g, quote.trim() || ' ', (p) => `600 ${p}px ${font}`, boxW, boxH, 1.25, Math.round(110 * u), 18)
    const lh = fs * 1.25, total = lines.length * lh
    let y = top + (boxH - total) / 2 + 40 * u
    g.fillStyle = textCol; g.textAlign = align; g.textBaseline = 'top'
    for (const ln of lines) { g.fillText(ln, align === 'center' ? S.w / 2 : px, y); y += lh }
    g.fillStyle = T.accent; g.fillRect(align === 'center' ? S.w / 2 - 40 * u : px, y + 30 * u, 80 * u, 6 * u)
    if (author.trim()) { g.font = `600 ${Math.round(40 * u)}px Inter, Arial, sans-serif`; g.fillStyle = textCol; g.fillText(author, align === 'center' ? S.w / 2 : px, y + 60 * u) }
    if (handle.trim()) { g.font = `500 ${Math.round(30 * u)}px Inter, Arial, sans-serif`; g.globalAlpha = 0.75; g.fillStyle = textCol; g.textAlign = 'center'; g.fillText(handle, S.w / 2, S.h - 80 * u); g.globalAlpha = 1 }
    g.textAlign = 'left'
  }, [quote, author, handle, size, theme, font, align, marks, pad, img, shade])
  const save = async () => downloadBlob(await canvasBlob(cv.current!), `quote-${S.w}x${S.h}.png`)
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-3">
        <div className="flex justify-center rounded-2xl border border-border bg-surface-2/40 p-3"><canvas ref={cv} className="max-h-[70vh] max-w-full rounded-lg shadow-xl" style={{ aspectRatio: `${S.w}/${S.h}` }} aria-label="Quote card preview" /></div>
        <Dropzone compact accept="image/*" onFiles={async (f) => setImg(await createImageBitmap(f[0]))} label={img ? 'Replace background photo' : 'Use a photo as the background (optional)'} />
      </div>
      <Card className="space-y-4 self-start">
        <div><Label hint={`${quote.length}`}>Quote</Label><Textarea value={quote} onChange={(e) => setQuote(e.target.value)} className="min-h-24 font-sans" /></div>
        <div className="grid grid-cols-2 gap-2"><div><Label>Author</Label><Input value={author} onChange={(e) => setAuthor(e.target.value)} /></div><div><Label>Handle</Label><Input value={handle} onChange={(e) => setHandle(e.target.value)} /></div></div>
        <div><Label>Size</Label><Select value={size as string} onChange={(v) => setSize(v as keyof typeof SIZES)} options={Object.entries(SIZES).map(([k, v]) => ({ value: k, label: v.label }))} /></div>
        <div><Label>Theme</Label><div className="flex flex-wrap gap-1.5">{THEMES.map((t, i) => <button key={t.name} title={t.name} aria-label={t.name} onClick={() => setTheme(i)} className={`size-8 rounded-lg border-2 cursor-pointer ${theme === i ? 'border-fg' : 'border-transparent'}`} style={{ background: `linear-gradient(135deg, ${t.bg[0]}, ${t.bg[1]})` }} />)}</div></div>
        <div><Label>Font</Label><Select value={font} onChange={setFont} options={FONTS} /></div>
        <div><Label>Align</Label><Select value={align} onChange={setAlign} options={[{ value: 'center', label: 'Center' }, { value: 'left', label: 'Left' }]} /></div>
        <Slider label="Side margin" value={pad} onChange={setPad} min={5} max={20} suffix="%" />
        {img && <Slider label="Darken photo" value={shade} onChange={setShade} min={0} max={85} suffix="%" />}
        <Switch checked={marks} onChange={setMarks} label="Big quote mark" />
        <Button className="w-full" icon={<ImageDown className="size-4" />} onClick={save}>Download PNG</Button>
      </Card>
    </div>
  )
}
