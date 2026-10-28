import { useState } from 'react'
import { Download, FileDown, Printer } from 'lucide-react'
import { Button, Field, Label, Segmented, Switch, ToolGrid, ErrorNote, useJob } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { encodeCanvas } from '@/lib/b2/codecs'
import { Editor, Preview, TemplatePicker, initState, renderFull, useFonts, type State, type Template } from './_b2/templater'

const DPI = 300
const T = (t: Template) => t
// Sizes at 300 DPI. Business card 3.5×2 in, 5×7 in cards, 6×4 in postcards.
export const CARD_TEMPLATES: Template[] = [
  T({ id: 'biz-dark', name: 'Business card · dark', w: 1050, h: 600, bg: { kind: 'solid' }, colors: { bg: '#0d0d0f', bg2: '#1b1b1f', text: '#f5f5f5', accent: '#F5A524', muted: '#9aa3a3' }, fonts: { title: 'Montserrat', body: 'Inter' },
    shapes: [{ kind: 'rect', x: 0.07, y: 0.42, w: 0.12, h: 0.012, color: 'accent' }],
    texts: [
      { id: 'name', label: 'Name', text: 'Alex Morgan', x: 0.07, y: 0.17, size: 0.12, weight: 700 },
      { id: 'role', label: 'Job title', text: 'Product Designer', x: 0.07, y: 0.31, size: 0.065, weight: 500, color: 'accent', font: 'body' },
      { id: 'contact', label: 'Contact lines', text: 'alex@example.com\n+1 555 010 0123\nexample.com', x: 0.07, y: 0.52, size: 0.058, weight: 400, color: 'muted', font: 'body', lineH: 1.45 },
      { id: 'company', label: 'Company', text: 'NORTHWIND', x: 0.93, y: 0.78, size: 0.06, weight: 800, align: 'right', color: 'text', spacing: 0.2 },
    ] }),
  T({ id: 'biz-light', name: 'Business card · light', w: 1050, h: 600, bg: { kind: 'solid' }, colors: { bg: '#f7f4ee', bg2: '#ffffff', text: '#16181a', accent: '#0f766e', muted: '#5b6466' }, fonts: { title: 'Playfair Display', body: 'Inter' },
    shapes: [{ kind: 'rect', x: 0, y: 0, w: 0.035, h: 1, color: 'accent' }],
    texts: [
      { id: 'name', label: 'Name', text: 'Priya Sharma', x: 0.12, y: 0.2, size: 0.12, weight: 700 },
      { id: 'role', label: 'Job title', text: 'Architect', x: 0.12, y: 0.36, size: 0.065, weight: 500, color: 'accent', font: 'body', italic: true },
      { id: 'contact', label: 'Contact lines', text: 'priya@example.com\n+91 98 7654 3210\nKolkata, India', x: 0.12, y: 0.56, size: 0.058, weight: 400, color: 'muted', font: 'body', lineH: 1.45 },
    ] }),
  T({ id: 'biz-photo', name: 'Business card · photo', w: 1050, h: 600, bg: { kind: 'linear', angle: 120 }, colors: { bg: '#0b2a2c', bg2: '#11181c', text: '#ffffff', accent: '#2dd4bf', muted: '#a7c4c2' }, fonts: { title: 'Poppins', body: 'Inter' },
    image: { x: 0.07, y: 0.22, w: 0.3, h: 0.525, circle: true, label: 'Photo' },
    texts: [
      { id: 'name', label: 'Name', text: 'Sam Lee', x: 0.43, y: 0.24, size: 0.11, weight: 700, maxW: 0.52 },
      { id: 'role', label: 'Job title', text: 'Photographer', x: 0.43, y: 0.38, size: 0.06, weight: 500, color: 'accent', font: 'body' },
      { id: 'contact', label: 'Contact lines', text: 'sam@example.com\n@samlee', x: 0.43, y: 0.56, size: 0.058, weight: 400, color: 'muted', font: 'body', lineH: 1.45 },
    ] }),
  T({ id: 'invite', name: 'Invitation 5×7', w: 1500, h: 2100, bg: { kind: 'solid' }, colors: { bg: '#fbf8f1', bg2: '#efe7d6', text: '#1e2622', accent: '#b7791f', muted: '#5f6b66' }, fonts: { title: 'Playfair Display', body: 'Inter' },
    shapes: [{ kind: 'rect', x: 0.06, y: 0.045, w: 0.88, h: 0.91, color: 'accent', opacity: 0.12, r: 30 }, { kind: 'rect', x: 0.4, y: 0.47, w: 0.2, h: 0.003, color: 'accent' }],
    texts: [
      { id: 'kicker', label: 'Small heading', text: 'You are invited to', x: 0.5, y: 0.2, size: 0.03, weight: 500, align: 'center', color: 'accent', font: 'body', upper: true, spacing: 0.25 },
      { id: 'title', label: 'Event', text: 'Our Garden Party', x: 0.5, y: 0.27, size: 0.075, weight: 700, align: 'center', maxW: 0.78 },
      { id: 'when', label: 'Date and time', text: 'Saturday, 14 June\n4 pm to 9 pm', x: 0.5, y: 0.52, size: 0.036, weight: 500, align: 'center', font: 'body', lineH: 1.4 },
      { id: 'where', label: 'Place', text: '12 Lake Road, Kolkata', x: 0.5, y: 0.65, size: 0.03, weight: 400, align: 'center', color: 'muted', font: 'body' },
      { id: 'rsvp', label: 'RSVP', text: 'RSVP by 1 June to Riya, 98765 43210', x: 0.5, y: 0.82, size: 0.025, weight: 400, align: 'center', color: 'muted', font: 'body', maxW: 0.7 },
    ] }),
  T({ id: 'greeting', name: 'Greeting card 5×7', w: 1500, h: 2100, bg: { kind: 'solid' }, colors: { bg: '#ffffff', bg2: '#f4f4f4', text: '#1b1d1f', accent: '#0e7490', muted: '#62686c' }, fonts: { title: 'Dancing Script', body: 'Inter' },
    image: { x: 0, y: 0, w: 1, h: 0.58, label: 'Cover photo' },
    texts: [
      { id: 'title', label: 'Greeting', text: 'Happy Birthday', x: 0.5, y: 0.64, size: 0.085, weight: 700, align: 'center', color: 'accent' },
      { id: 'msg', label: 'Message', text: 'Wishing you a year full of laughter, good friends and great adventures.', x: 0.5, y: 0.77, size: 0.03, weight: 400, align: 'center', font: 'body', maxW: 0.76, lineH: 1.45 },
      { id: 'from', label: 'From', text: 'With love, Maya', x: 0.5, y: 0.9, size: 0.03, weight: 600, align: 'center', color: 'muted', font: 'body' },
    ] }),
  T({ id: 'thanks', name: 'Thank-you postcard 6×4', w: 1800, h: 1200, bg: { kind: 'linear', angle: 90 }, colors: { bg: '#F5A524', bg2: '#f7c55a', text: '#1a1405', accent: '#1a1405', muted: '#4a3a10' }, fonts: { title: 'Bebas Neue', body: 'Inter' },
    texts: [
      { id: 'title', label: 'Headline', text: 'Thank you', x: 0.08, y: 0.22, size: 0.28, weight: 400 },
      { id: 'msg', label: 'Message', text: 'for being part of our journey this year.', x: 0.08, y: 0.55, size: 0.055, weight: 500, font: 'body', maxW: 0.6 },
      { id: 'from', label: 'Signature', text: 'The Northwind team', x: 0.08, y: 0.82, size: 0.04, weight: 700, font: 'body' },
    ] }),
]

export default function CardMaker() {
  const [st, setSt] = useState<State>(() => initState(CARD_TEMPLATES[0]))
  const [bleed, setBleed] = useState(true)
  const [marks, setMarks] = useState(true)
  const [sheet, setSheet] = useState<'a4' | 'letter'>('a4')
  const tick = useFonts(st.fonts)
  const { busy, error, run } = useJob()
  const wIn = st.tpl.w / DPI, hIn = st.tpl.h / DPI
  const isBiz = st.tpl.id.startsWith('biz')

  const pdfSingle = () => run(async () => {
    const { jsPDF } = await import('jspdf')
    const b = bleed ? 0.125 : 0 // inches (3 mm)
    const pdf = new jsPDF({ unit: 'in', format: [wIn + b * 2, hIn + b * 2], orientation: wIn > hIn ? 'landscape' : 'portrait' })
    const art = renderFull(st, 1)
    if (b) {
      // extend edges into the bleed by drawing the art scaled slightly larger behind it
      const ex = document.createElement('canvas'); ex.width = Math.round(art.width + b * 2 * DPI); ex.height = Math.round(art.height + b * 2 * DPI)
      const x = ex.getContext('2d')!; x.drawImage(art, 0, 0, ex.width, ex.height); x.drawImage(art, b * DPI, b * DPI)
      pdf.addImage(ex.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, wIn + b * 2, hIn + b * 2)
    } else pdf.addImage(art.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, wIn, hIn)
    if (b && marks) { pdf.setLineWidth(0.006); for (const [x, y, sx, sy] of [[b, b, -1, -1], [b + wIn, b, 1, -1], [b, b + hIn, -1, 1], [b + wIn, b + hIn, 1, 1]]) { pdf.line(x + sx * 0.03, y, x + sx * b, y); pdf.line(x, y + sy * 0.03, x, y + sy * b) } }
    downloadBlob(pdf.output('blob'), `${st.tpl.id}.pdf`)
  })
  const pdfSheet = () => run(async () => {
    const { jsPDF } = await import('jspdf')
    const [pw, ph] = sheet === 'a4' ? [8.27, 11.69] : [8.5, 11]
    const pdf = new jsPDF({ unit: 'in', format: [pw, ph] })
    const cols = Math.floor((pw - 0.5) / wIn), rows = Math.floor((ph - 0.5) / hIn)
    const ox = (pw - cols * wIn) / 2, oy = (ph - rows * hIn) / 2
    const img = renderFull(st, 1).toDataURL('image/jpeg', 0.95)
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) pdf.addImage(img, 'JPEG', ox + c * wIn, oy + r * hIn, wIn, hIn)
    pdf.setLineWidth(0.004); pdf.setDrawColor(170)
    for (let c = 0; c <= cols; c++) { pdf.line(ox + c * wIn, 0.05, ox + c * wIn, oy - 0.05); pdf.line(ox + c * wIn, oy + rows * hIn + 0.05, ox + c * wIn, ph - 0.05) }
    for (let r = 0; r <= rows; r++) { pdf.line(0.05, oy + r * hIn, ox - 0.05, oy + r * hIn); pdf.line(ox + cols * wIn + 0.05, oy + r * hIn, pw - 0.05, oy + r * hIn) }
    downloadBlob(pdf.output('blob'), `${st.tpl.id}-sheet-${cols * rows}-up.pdf`)
  })

  return (
    <ToolGrid
      main={<>
        <Preview st={st} tick={tick} />
        <p className="text-center text-xs text-muted">{wIn.toFixed(2)} × {hIn.toFixed(2)} in at 300 DPI ({st.tpl.w}×{st.tpl.h} px)</p>
        <div><Label>Templates</Label><TemplatePicker templates={CARD_TEMPLATES} value={st.tpl.id} onPick={(t) => setSt(initState(t, st))} /></div>
      </>}
      side={<>
        <Editor st={st} set={setSt} />
        <div className="space-y-2 border-t border-border pt-4">
          <Switch checked={bleed} onChange={setBleed} label="Add 3 mm bleed for print shops" />
          {bleed && <Switch checked={marks} onChange={setMarks} label="Crop marks" />}
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" loading={busy} icon={<FileDown className="size-4" />} onClick={pdfSingle}>Download print PDF</Button>
          {isBiz && <><Field label="Sheet of cards"><Segmented value={sheet} onChange={setSheet} options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }]} /></Field><Button variant="outline" className="w-full" icon={<Printer className="size-4" />} onClick={pdfSheet}>Download printable sheet</Button></>}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" icon={<Download className="size-4" />} onClick={() => run(async () => downloadBlob(await encodeCanvas(renderFull(st), 'png'), `${st.tpl.id}.png`))}>PNG</Button>
            <Button variant="outline" icon={<Download className="size-4" />} onClick={() => run(async () => downloadBlob(await encodeCanvas(renderFull(st), 'jpg', { quality: 95 }), `${st.tpl.id}.jpg`))}>JPG</Button>
          </div>
        </div>
      </>}
    />
  )
}
