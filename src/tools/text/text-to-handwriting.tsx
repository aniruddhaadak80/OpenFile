import { useEffect, useRef, useState } from 'react'
import { PenLine, Download, FileDown } from 'lucide-react'
import { Button, Field, Select, Slider, Switch, ToolGrid, Textarea, Label, Spinner } from '@/components/ui'
import { downloadBlob, zipFiles, canvasToBlob } from '@/lib/files'

const FONTS = [{ value: 'hand-caveat', label: 'Caveat (quick notes)', file: 'hand-caveat.woff2', scale: 1.15 }, { value: 'hand-indie-flower', label: 'Indie Flower (round)', file: 'hand-indie-flower.woff2', scale: 1 }, { value: 'hand-kalam', label: 'Kalam (neat)', file: 'hand-kalam.woff2', scale: 0.95 }]
const INKS = [{ value: '#1E3A8A', label: 'Blue pen' }, { value: '#1F2937', label: 'Black pen' }, { value: '#065F46', label: 'Green pen' }, { value: '#334155', label: 'Pencil' }]
const PAPERS = [{ value: 'ruled', label: 'Ruled notebook' }, { value: 'plain', label: 'Plain white' }, { value: 'grid', label: 'Grid' }, { value: 'legal', label: 'Yellow legal pad' }]
const SAMPLE = 'Dear diary,\n\nToday I tried a tool that turns typed text into handwriting. It even wobbles a little, like a real pen on paper.\n\nThe best part is that nothing was uploaded, it all ran in my browser.\n\nSee you tomorrow.'
const W = 1240, H = 1754 // A4 at 150 dpi

function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296 } }

export default function TextToHandwriting() {
  const [text, setText] = useState(SAMPLE)
  const [font, setFont] = useState(FONTS[0].value)
  const [ink, setInk] = useState(INKS[0].value)
  const [paper, setPaper] = useState('ruled')
  const [size, setSize] = useState(44)
  const [mess, setMess] = useState(40)
  const [margin, setMargin] = useState(true)
  const [pages, setPages] = useState<HTMLCanvasElement[]>([])
  const [ready, setReady] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let off = false
    Promise.all(FONTS.map(async (f) => { if ([...document.fonts].some((x) => x.family === f.value)) return; const ff = new FontFace(f.value, `url(${import.meta.env.BASE_URL}fonts/hand/${f.file})`); await ff.load(); document.fonts.add(ff) })).then(() => { if (!off) setReady(true) }).catch(() => setReady(true))
    return () => { off = true }
  }, [])

  useEffect(() => {
    if (!ready) return
    const f = FONTS.find((x) => x.value === font)!
    const px = size * f.scale
    const lineH = Math.round(size * 1.45)
    const top = 150, left = margin ? 170 : 90, right = W - 80, bottom = H - 110
    const out: HTMLCanvasElement[] = []
    const r = rng(7)
    let c: HTMLCanvasElement, ctx: CanvasRenderingContext2D, y = 0
    const newPage = () => {
      c = document.createElement('canvas'); c.width = W; c.height = H
      ctx = c.getContext('2d')!
      ctx.fillStyle = paper === 'legal' ? '#FFF6B8' : '#FFFFFF'; ctx.fillRect(0, 0, W, H)
      if (paper === 'ruled' || paper === 'legal') { ctx.strokeStyle = paper === 'legal' ? '#9DB8D9' : '#B9D0EA'; ctx.lineWidth = 2; for (let yy = top + lineH * 0.25; yy < H - 60; yy += lineH) { ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke() } }
      if (paper === 'grid') { ctx.strokeStyle = '#D5E3F0'; ctx.lineWidth = 1.5; const g = lineH / 2; for (let x = 0; x < W; x += g) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() } for (let yy = 0; yy < H; yy += g) { ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke() } }
      if (margin && paper !== 'grid') { ctx.strokeStyle = '#EFA25B'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(left - 30, 0); ctx.lineTo(left - 30, H); ctx.stroke() }
      ctx.fillStyle = ink; ctx.textBaseline = 'alphabetic'
      y = top; out.push(c)
    }
    newPage()
    const m = mess / 100
    const drawWord = (w: string, x: number) => {
      let xx = x
      for (const ch of w) {
        const s = px * (1 + (r() - 0.5) * 0.08 * m)
        ctx.font = `${s}px "${font}"`
        ctx.save(); ctx.translate(xx, y + (r() - 0.5) * 4 * m); ctx.rotate((r() - 0.5) * 0.07 * m)
        ctx.globalAlpha = 0.82 + r() * 0.18; ctx.fillText(ch, 0, 0); ctx.restore()
        xx += ctx.measureText(ch).width * (1 + (r() - 0.5) * 0.06 * m)
      }
      return xx
    }
    const lineDrift = () => (r() - 0.5) * 6 * m
    for (const para of text.replace(/\r/g, '').split('\n')) {
      let x = left + lineDrift()
      if (!para.trim()) { y += lineH; if (y > bottom) newPage(); continue }
      for (const w of para.split(/(\s+)/)) {
        if (!w) continue
        ctx!.font = `${px}px "${font}"`
        const ww = ctx!.measureText(w).width
        if (/^\s+$/.test(w)) { x += ww * (0.9 + r() * 0.3 * m); continue }
        if (x + ww > right && x > left + 20) { y += lineH; x = left + lineDrift(); if (y > bottom) newPage() }
        x = drawWord(w, x)
      }
      y += lineH; if (y > bottom) newPage()
    }
    setPages(out)
  }, [ready, text, font, ink, paper, size, mess, margin])

  useEffect(() => { const b = box.current; if (!b) return; b.replaceChildren(...pages.map((p) => { const im = document.createElement('img'); im.src = p.toDataURL('image/jpeg', 0.8); im.alt = 'Handwritten page'; im.className = 'w-full rounded-lg shadow-lg'; return im })) }, [pages])

  const png = async () => { const blobs = await Promise.all(pages.map((p) => canvasToBlob(p, 'image/png'))); if (blobs.length === 1) downloadBlob(blobs[0], 'handwriting.png'); else downloadBlob(await zipFiles(blobs.map((b, i) => ({ name: `handwriting-page-${i + 1}.png`, data: b }))), 'handwriting-pages.zip') }
  const pdf = async () => { const { jsPDF } = await import('jspdf'); const doc = new jsPDF({ unit: 'mm', format: 'a4' }); pages.forEach((p, i) => { if (i) doc.addPage(); doc.addImage(p.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297) }); downloadBlob(doc.output('blob'), 'handwriting.pdf') }

  return (
    <ToolGrid
      main={<>
        <Label>Your text</Label>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-40 text-sm" aria-label="Text to write" />
        {!ready && <Spinner label="Loading handwriting fonts" />}
        <div ref={box} className="grid gap-4 sm:grid-cols-2" aria-live="polite" />
      </>}
      side={<>
        <Field label="Handwriting"><Select value={font} onChange={setFont} options={FONTS.map((f) => ({ value: f.value, label: f.label }))} /></Field>
        <Field label="Ink"><Select value={ink} onChange={setInk} options={INKS} /></Field>
        <Field label="Paper"><Select value={paper} onChange={setPaper} options={PAPERS} /></Field>
        <Slider label="Letter size" value={size} onChange={setSize} min={28} max={72} suffix=" px" />
        <Slider label="Messiness" value={mess} onChange={setMess} min={0} max={100} suffix="%" />
        <Switch checked={margin} onChange={setMargin} label="Margin line" />
        <div className="grid grid-cols-2 gap-2">
          <Button icon={<FileDown className="size-4" />} onClick={pdf} disabled={!pages.length}>PDF</Button>
          <Button variant="outline" icon={<Download className="size-4" />} onClick={png} disabled={!pages.length}>PNG</Button>
        </div>
        <p className="text-xs text-muted">{pages.length} A4 page{pages.length === 1 ? '' : 's'} at 150 dpi. Fonts: Caveat, Indie Flower and Kalam (SIL Open Font License).</p>
        <p className="flex gap-1.5 text-xs text-muted"><PenLine className="size-4 shrink-0" />Please do not hand in generated pages as your own handwriting where that is not allowed.</p>
      </>}
    />
  )
}
