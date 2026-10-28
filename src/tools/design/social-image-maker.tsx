import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Button, Field, Label, Segmented, Select, ToolGrid, ErrorNote, useJob } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { encodeCanvas, type OutFmt } from '@/lib/b2/codecs'
import { Editor, Preview, TemplatePicker, initState, renderFull, useFonts, type State, type Template } from './_b2/templater'

const SIZES: { id: string; label: string; w: number; h: number }[] = [
  { id: 'yt', label: 'YouTube thumbnail 1280×720', w: 1280, h: 720 },
  { id: 'og', label: 'Link preview / OG image 1200×630', w: 1200, h: 630 },
  { id: 'x', label: 'X / Twitter post 1600×900', w: 1600, h: 900 },
  { id: 'xh', label: 'X / Twitter header 1500×500', w: 1500, h: 500 },
  { id: 'li', label: 'LinkedIn banner 1584×396', w: 1584, h: 396 },
  { id: 'lip', label: 'LinkedIn post 1200×627', w: 1200, h: 627 },
  { id: 'ig', label: 'Instagram post 1080×1080', w: 1080, h: 1080 },
  { id: 'igp', label: 'Instagram portrait 1080×1350', w: 1080, h: 1350 },
  { id: 'story', label: 'Story / Reel 1080×1920', w: 1080, h: 1920 },
  { id: 'fb', label: 'Facebook cover 1640×624', w: 1640, h: 624 },
  { id: 'ytb', label: 'YouTube channel banner 2560×1440', w: 2560, h: 1440 },
  { id: 'pin', label: 'Pinterest pin 1000×1500', w: 1000, h: 1500 },
]
const BASE: Template[] = [
  { id: 'bold', name: 'Bold headline', w: 1280, h: 720, bg: { kind: 'linear', angle: 135 }, colors: { bg: '#0b0b0c', bg2: '#1f2a2a', text: '#ffffff', accent: '#F5A524', muted: '#b5bcbc' }, fonts: { title: 'Anton', body: 'Inter' },
    shapes: [{ kind: 'pill', x: 0.06, y: 0.12, w: 0.2, h: 0.08, color: 'accent' }],
    texts: [{ id: 'tag', label: 'Label', text: 'NEW VIDEO', x: 0.16, y: 0.135, size: 0.045, weight: 800, align: 'center', color: 'bg', font: 'body', maxW: 0.2 }, { id: 'title', label: 'Headline', text: 'I tried every free PDF tool so you do not have to', x: 0.06, y: 0.27, size: 0.13, weight: 400, maxW: 0.88, upper: true, lineH: 1.05 }, { id: 'sub', label: 'Subtitle', text: 'The honest results', x: 0.06, y: 0.84, size: 0.05, weight: 600, color: 'accent', font: 'body' }] },
  { id: 'split', name: 'Photo split', w: 1280, h: 720, bg: { kind: 'solid' }, colors: { bg: '#0f172a', bg2: '#0f172a', text: '#f8fafc', accent: '#38bdf8', muted: '#94a3b8' }, fonts: { title: 'Poppins', body: 'Inter' },
    image: { x: 0.52, y: 0, w: 0.48, h: 1, label: 'Your photo' },
    texts: [{ id: 'title', label: 'Headline', text: '10 tips for faster websites', x: 0.06, y: 0.25, size: 0.1, weight: 800, maxW: 0.42, lineH: 1.08 }, { id: 'sub', label: 'Subtitle', text: 'A practical guide', x: 0.06, y: 0.72, size: 0.045, weight: 500, color: 'accent', font: 'body', maxW: 0.42 }] },
  { id: 'quote', name: 'Quote card', w: 1080, h: 1080, bg: { kind: 'radial' }, colors: { bg: '#134e4a', bg2: '#0b1f1e', text: '#f0fdfa', accent: '#5eead4', muted: '#99c9c3' }, fonts: { title: 'Playfair Display', body: 'Inter' },
    texts: [{ id: 'mark', label: 'Quote mark', text: '“', x: 0.08, y: 0.06, size: 0.3, weight: 700, color: 'accent' }, { id: 'quote', label: 'Quote', text: 'Simplicity is the ultimate sophistication.', x: 0.08, y: 0.32, size: 0.085, weight: 700, maxW: 0.84, italic: true, lineH: 1.2 }, { id: 'who', label: 'Author', text: 'Leonardo da Vinci', x: 0.08, y: 0.82, size: 0.04, weight: 600, color: 'accent', font: 'body', upper: true, spacing: 0.15 }] },
  { id: 'announce', name: 'Announcement', w: 1200, h: 630, bg: { kind: 'solid' }, colors: { bg: '#F5A524', bg2: '#F5A524', text: '#111111', accent: '#111111', muted: '#3d2f0a' }, fonts: { title: 'Space Grotesk', body: 'Inter' },
    shapes: [{ kind: 'circle', x: 0.68, y: -0.25, w: 0.55, h: 1.05, color: 'shade', opacity: 0.25 }],
    texts: [{ id: 'kicker', label: 'Small heading', text: 'Launching today', x: 0.07, y: 0.16, size: 0.05, weight: 700, font: 'body', upper: true, spacing: 0.2 }, { id: 'title', label: 'Headline', text: 'OpenFile 2.0', x: 0.07, y: 0.3, size: 0.17, weight: 700, maxW: 0.8 }, { id: 'sub', label: 'Subtitle', text: '300 private tools that run in your browser', x: 0.07, y: 0.66, size: 0.05, weight: 500, font: 'body', maxW: 0.7 }, { id: 'url', label: 'Link', text: 'example.com', x: 0.07, y: 0.84, size: 0.04, weight: 700, color: 'muted', font: 'body' }] },
  { id: 'photo', name: 'Full photo', w: 1280, h: 720, bg: { kind: 'solid' }, colors: { bg: '#111111', bg2: '#111111', text: '#ffffff', accent: '#2dd4bf', muted: '#d4d4d4' }, fonts: { title: 'Oswald', body: 'Inter' },
    image: { x: 0, y: 0, w: 1, h: 1, overlay: 0.45, label: 'Background photo' },
    shapes: [{ kind: 'rect', x: 0.06, y: 0.62, w: 0.1, h: 0.012, color: 'accent' }],
    texts: [{ id: 'title', label: 'Headline', text: 'Weekend in the mountains', x: 0.06, y: 0.38, size: 0.11, weight: 700, maxW: 0.8, upper: true }, { id: 'sub', label: 'Subtitle', text: 'Episode 12', x: 0.06, y: 0.67, size: 0.05, weight: 500, color: 'muted', font: 'body' }] },
]

export default function SocialImageMaker() {
  const [size, setSize] = useState('yt')
  const [st, setSt] = useState<State>(() => initState(BASE[0]))
  const [fmt, setFmt] = useState<OutFmt>('png')
  const tick = useFonts(st.fonts)
  const { busy, error, run } = useJob()
  const sz = SIZES.find((s) => s.id === size)!
  // apply the chosen canvas size to the template (layout is relative)
  const sized = useMemo<State>(() => { const f = Math.sqrt(Math.max(0.25, Math.min(1, (sz.w / sz.h) / (st.tpl.w / st.tpl.h)))); return { ...st, tpl: { ...st.tpl, w: sz.w, h: sz.h, texts: st.tpl.texts.map((t) => ({ ...t, size: t.size * f })) } } }, [st, sz])
  const templates = useMemo(() => BASE.map((t) => ({ ...t, w: sz.w, h: sz.h })), [sz])

  return (
    <ToolGrid
      main={<>
        <Preview st={sized} tick={tick} />
        <div><Label>Templates</Label><TemplatePicker templates={templates} value={st.tpl.id} onPick={(t) => setSt(initState(BASE.find((b) => b.id === t.id)!, st))} /></div>
      </>}
      side={<>
        <Field label="Size"><Select value={size} onChange={setSize} options={SIZES.map((s) => ({ value: s.id, label: s.label }))} /></Field>
        <Editor st={st} set={setSt} />
        <Field label="Format"><Segmented value={fmt} onChange={setFmt} options={[{ value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }, { value: 'webp', label: 'WEBP' }]} /></Field>
        <ErrorNote error={error} />
        <Button size="lg" className="w-full" loading={busy} icon={<Download className="size-4" />} onClick={() => run(async () => downloadBlob(await encodeCanvas(renderFull(sized), fmt, { quality: 92 }), `${st.tpl.id}-${sz.w}x${sz.h}.${fmt}`))}>Download {sz.w}×{sz.h}</Button>
        <p className="text-[11px] text-muted">YouTube thumbnails must be under 2 MB. JPG at {sz.w}×{sz.h} is usually well under that.</p>
      </>}
    />
  )
}
