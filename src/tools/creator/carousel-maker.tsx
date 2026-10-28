import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { Button, Input, Label, Segmented, Switch, Textarea, ToolGrid } from '@/components/ui'
import { canvasToBlob, zipFiles } from '@/lib/files'
import { DlButton } from '@/lib/bcat/kit'

interface Slide { title: string; body: string }
const THEMES = { night: { bg: '#0a0a0a', fg: '#FAFAF9', accent: '#F5A524', sub: '#A8A29E' }, teal: { bg: '#042F2E', fg: '#F0FDFA', accent: '#2DD4BF', sub: '#99F6E4' }, sky: { bg: '#082F49', fg: '#F0F9FF', accent: '#38BDF8', sub: '#BAE6FD' }, paper: { bg: '#FFFBEB', fg: '#1C1917', accent: '#C2410C', sub: '#57534E' }, lime: { bg: '#1A2E05', fg: '#F7FEE7', accent: '#A3E635', sub: '#D9F99D' } }
type Theme = keyof typeof THEMES
const SIZES = { portrait: [1080, 1350], square: [1080, 1080], story: [1080, 1920] } as const
const START: Slide[] = [
  { title: '5 tools that keep your files private', body: 'All of them run in your browser. Swipe to see them.' },
  { title: '1. Metadata scrubber', body: 'Photos carry your GPS location and camera details. Remove them before you post.' },
  { title: '2. Password ZIP', body: 'Lock a folder with AES-256 that opens on any computer.' },
  { title: '3. PII redactor', body: 'Find emails, phone numbers and card numbers in text and mask them in one click.' },
  { title: 'Save this for later', body: 'Follow for more tips like this.' },
]

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const lines: string[] = []
  for (const para of text.split('\n')) { let cur = ''; for (const w of para.split(' ')) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w } else cur = t } lines.push(cur) }
  return lines
}
function render(c: HTMLCanvasElement, s: Slide, i: number, n: number, o: { theme: Theme; size: keyof typeof SIZES; handle: string; numbers: boolean; arrow: boolean; align: 'left' | 'center' }) {
  const [W, H] = SIZES[o.size], t = THEMES[o.theme], pad = 96
  c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = t.bg; ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = t.accent; ctx.globalAlpha = 0.12; ctx.beginPath(); ctx.arc(W - 120, 140, 260, 0, 7); ctx.fill(); ctx.globalAlpha = 1
  ctx.fillRect(pad, pad, 90, 10)
  ctx.textAlign = o.align; const x = o.align === 'center' ? W / 2 : pad
  let size = i === 0 ? 96 : 78
  ctx.font = `800 ${size}px system-ui, sans-serif`
  let lines = wrap(ctx, s.title, W - pad * 2)
  while (lines.length > 5 && size > 40) { size -= 6; ctx.font = `800 ${size}px system-ui, sans-serif`; lines = wrap(ctx, s.title, W - pad * 2) }
  const bodySize = 44; ctx.font = `400 ${bodySize}px system-ui, sans-serif`
  const blines = wrap(ctx, s.body, W - pad * 2)
  const block = lines.length * size * 1.12 + (s.body ? 48 + blines.length * bodySize * 1.4 : 0)
  let y = Math.max(pad + 80, (H - block) / 2)
  ctx.fillStyle = t.fg; ctx.font = `800 ${size}px system-ui, sans-serif`; ctx.textBaseline = 'top'
  for (const l of lines) { ctx.fillText(l, x, y); y += size * 1.12 }
  y += 48; ctx.fillStyle = t.sub; ctx.font = `400 ${bodySize}px system-ui, sans-serif`
  for (const l of blines) { ctx.fillText(l, x, y); y += bodySize * 1.4 }
  ctx.textAlign = 'left'; ctx.font = `600 34px system-ui, sans-serif`; ctx.fillStyle = t.sub; ctx.textBaseline = 'alphabetic'
  if (o.handle) ctx.fillText(o.handle, pad, H - pad + 10)
  ctx.textAlign = 'right'
  if (o.numbers) ctx.fillText(`${i + 1} / ${n}`, W - pad, H - pad + 10)
  if (o.arrow && i < n - 1) { ctx.fillStyle = t.accent; ctx.font = `700 40px system-ui, sans-serif`; ctx.fillText('Swipe  →', W - pad, H - pad - 50) }
}

export default function CarouselMaker() {
  const [slides, setSlides] = useState<Slide[]>(START)
  const [cur, setCur] = useState(0)
  const [theme, setTheme] = useState<Theme>('night')
  const [size, setSize] = useState<keyof typeof SIZES>('portrait')
  const [handle, setHandle] = useState('@yourname')
  const [numbers, setNumbers] = useState(true)
  const [arrow, setArrow] = useState(true)
  const [align, setAlign] = useState<'left' | 'center'>('left')
  const cv = useRef<HTMLCanvasElement>(null)
  const o = { theme, size, handle, numbers, arrow, align }
  useEffect(() => { if (cv.current && slides[cur]) render(cv.current, slides[cur], cur, slides.length, o) }, [slides, cur, theme, size, handle, numbers, arrow, align])
  const upd = (k: keyof Slide, v: string) => setSlides((p) => p.map((s, i) => (i === cur ? { ...s, [k]: v } : s)))
  const move = (d: number) => setSlides((p) => { const j = cur + d; if (j < 0 || j >= p.length) return p; const n = [...p]; [n[cur], n[j]] = [n[j], n[cur]]; setCur(j); return n })
  const pngs = async () => { const out = []; for (let i = 0; i < slides.length; i++) { const c = document.createElement('canvas'); render(c, slides[i], i, slides.length, o); out.push({ name: `slide-${String(i + 1).padStart(2, '0')}.png`, data: await canvasToBlob(c, 'image/png') }) } return out }
  const pdf = async () => {
    const { jsPDF } = await import('jspdf'); const [W, H] = SIZES[size]
    const doc = new jsPDF({ unit: 'px', format: [W, H], orientation: H >= W ? 'portrait' : 'landscape', hotfixes: ['px_scaling'] })
    slides.forEach((s, i) => { const c = document.createElement('canvas'); render(c, s, i, slides.length, o); if (i) doc.addPage([W, H], H >= W ? 'portrait' : 'landscape'); doc.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, W, H) })
    return doc.output('blob')
  }

  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <canvas ref={cv} className="mx-auto w-full max-w-md rounded-2xl border border-border shadow-xl" aria-label={`Slide ${cur + 1}`} />
          <div className="flex flex-wrap justify-center gap-1.5">{slides.map((s, i) => <button key={i} type="button" onClick={() => setCur(i)} aria-label={`Slide ${i + 1}`} className={`h-9 min-w-9 rounded-lg border px-2 text-xs cursor-pointer ${i === cur ? 'border-accent bg-accent/10' : 'border-border text-muted'}`}>{i + 1}</button>)}<Button size="sm" variant="outline" icon={<Plus className="size-4" />} disabled={slides.length >= 20} onClick={() => { setSlides((p) => [...p, { title: 'New slide', body: '' }]); setCur(slides.length) }}>Slide</Button></div>
          <div className="space-y-2 rounded-2xl border border-border bg-surface p-3">
            <div className="flex items-center gap-2"><Label className="mb-0 flex-1">Slide {cur + 1}</Label><Button size="sm" variant="ghost" aria-label="Move left" onClick={() => move(-1)} icon={<ArrowUp className="size-4 -rotate-90" />} /><Button size="sm" variant="ghost" aria-label="Move right" onClick={() => move(1)} icon={<ArrowDown className="size-4 -rotate-90" />} /><Button size="sm" variant="ghost" aria-label="Delete slide" disabled={slides.length < 2} onClick={() => { setSlides((p) => p.filter((_, i) => i !== cur)); setCur(Math.max(0, cur - 1)) }} icon={<Trash2 className="size-4" />} /></div>
            <Input value={slides[cur]?.title ?? ''} onChange={(e) => upd('title', e.target.value)} placeholder="Headline" aria-label="Headline" />
            <Textarea value={slides[cur]?.body ?? ''} onChange={(e) => upd('body', e.target.value)} placeholder="Supporting text" className="min-h-20 font-sans" aria-label="Body" />
          </div>
        </div>
      }
      side={
        <>
          <div><Label>Size</Label><Segmented value={size} onChange={setSize} options={[{ value: 'portrait', label: '4:5' }, { value: 'square', label: '1:1' }, { value: 'story', label: '9:16' }]} /></div>
          <div><Label>Theme</Label><Segmented value={theme} onChange={setTheme} options={(Object.keys(THEMES) as Theme[]).map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) }))} /></div>
          <div><Label>Align</Label><Segmented value={align} onChange={setAlign} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }]} /></div>
          <div><Label>Handle or website</Label><Input value={handle} onChange={(e) => setHandle(e.target.value)} /></div>
          <Switch checked={numbers} onChange={setNumbers} label="Slide numbers" />
          <Switch checked={arrow} onChange={setArrow} label="Swipe hint" />
          <DlButton variant="primary" className="w-full" name="carousel.pdf" data={pdf}>PDF (for LinkedIn)</DlButton>
          <DlButton className="w-full" name="carousel-slides.zip" data={async () => zipFiles(await pngs())}>PNG slides (ZIP)</DlButton>
        </>
      }
    />
  )
}
