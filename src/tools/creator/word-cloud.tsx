import { useEffect, useMemo, useRef, useState } from 'react'
import { Shuffle } from 'lucide-react'
import { Button, Input, Label, Segmented, Slider, Switch, Textarea, ToolGrid } from '@/components/ui'
import { canvasToBlob } from '@/lib/files'
import { wordFreq } from '@/lib/bcat/creator'
import { DlButton, toCsv } from '@/lib/bcat/kit'

const THEMES = { gold: { bg: '#0a0a0a', c: ['#F5A524', '#FBBF24', '#FDE68A', '#F97316', '#FACC15'] }, ocean: { bg: '#04131a', c: ['#22D3EE', '#14B8A6', '#38BDF8', '#67E8F9', '#2DD4BF'] }, forest: { bg: '#07130a', c: ['#10B981', '#84CC16', '#4ADE80', '#A3E635', '#FDE68A'] }, paper: { bg: '#FFFBEB', c: ['#B45309', '#0F766E', '#0E7490', '#15803D', '#C2410C'] } }
type Theme = keyof typeof THEMES
interface Placed { word: string; x: number; y: number; size: number; rot: number; color: string }
const SAMPLE = `Open source tools that run in the browser keep your files private. No upload, no account, no waiting. Convert PDF, edit images, trim video, merge audio, make GIFs, read ebooks, check JSON, plot functions and balance chemical equations. Privacy first, fast, free and open source. Every file stays on your device. Tools for students, developers, designers, writers and creators.`

function rand(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 } }

function layout(words: { word: string; count: number }[], W: number, H: number, opts: { shape: 'cloud' | 'circle' | 'wide'; rotate: boolean; font: string; theme: Theme; seed: number; scale: number }): Placed[] {
  const mask = document.createElement('canvas'); mask.width = W; mask.height = H
  const m = mask.getContext('2d', { willReadFrequently: true })!
  const occ = new Uint8Array(W * H)
  const max = words[0]?.count ?? 1, min = words.at(-1)?.count ?? 1
  const r = rand(opts.seed), out: Placed[] = []
  const inShape = (x: number, y: number) => { const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2); return opts.shape === 'circle' ? dx * dx + dy * dy <= 1 : opts.shape === 'cloud' ? dx * dx * 0.9 + dy * dy * 1.1 <= 1 : true }
  for (const [i, w] of words.entries()) {
    const t = max === min ? 1 : (w.count - min) / (max - min)
    const size = Math.round((12 + Math.pow(t, 0.7) * 96) * opts.scale * (W / 1200))
    const rot = opts.rotate && r() < 0.3 ? -90 : 0
    m.font = `700 ${size}px ${opts.font}`
    const tw = Math.ceil(m.measureText(w.word).width), th = Math.ceil(size * 1.05)
    const bw = rot ? th : tw, bh = rot ? tw : th
    // draw the word into a small bitmap for pixel collision
    const sc = document.createElement('canvas'); sc.width = bw + 2; sc.height = bh + 2
    const s = sc.getContext('2d', { willReadFrequently: true })!; s.font = m.font; s.textBaseline = 'middle'; s.textAlign = 'center'; s.translate(sc.width / 2, sc.height / 2); if (rot) s.rotate(-Math.PI / 2); s.fillText(w.word, 0, 0)
    const px = s.getImageData(0, 0, sc.width, sc.height).data
    const pts: number[] = []; for (let yy = 0; yy < sc.height; yy += 2) for (let xx = 0; xx < sc.width; xx += 2) if (px[(yy * sc.width + xx) * 4 + 3] > 40) pts.push(xx, yy)
    let placed = false
    for (let k = 0, a = r() * 6.28; k < 4000 && !placed; k++) {
      a += 0.15; const rad = 2 + k * 0.9 * (W / 1200)
      const cx = Math.round(W / 2 + Math.cos(a) * rad * (opts.shape === 'wide' ? 1.6 : 1.15) - sc.width / 2), cy = Math.round(H / 2 + Math.sin(a) * rad * 0.8 - sc.height / 2)
      if (cx < 0 || cy < 0 || cx + sc.width >= W || cy + sc.height >= H) continue
      if (!inShape(cx + sc.width / 2, cy + sc.height / 2)) continue
      let hit = false
      for (let p = 0; p < pts.length && !hit; p += 2) if (occ[(cy + pts[p + 1]) * W + cx + pts[p]]) hit = true
      if (hit) continue
      for (let p = 0; p < pts.length; p += 2) { const X = cx + pts[p], Y = cy + pts[p + 1]; for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) { const q = (Y + dy) * W + X + dx; if (q >= 0 && q < occ.length) occ[q] = 1 } }
      out.push({ word: w.word, x: cx + sc.width / 2, y: cy + sc.height / 2, size, rot, color: THEMES[opts.theme].c[i % THEMES[opts.theme].c.length] })
      placed = true
    }
  }
  return out
}
function paint(c: HTMLCanvasElement, placed: Placed[], W: number, H: number, theme: Theme, font: string, transparent: boolean) {
  c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  if (!transparent) { ctx.fillStyle = THEMES[theme].bg; ctx.fillRect(0, 0, W, H) }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  for (const p of placed) { ctx.save(); ctx.translate(p.x, p.y); if (p.rot) ctx.rotate(-Math.PI / 2); ctx.font = `700 ${p.size}px ${font}`; ctx.fillStyle = p.color; ctx.fillText(p.word, 0, 0); ctx.restore() }
}

export default function WordCloud() {
  const [text, setText] = useState(SAMPLE)
  const [max, setMax] = useState(80)
  const [stopExtra, setStopExtra] = useState('')
  const [shape, setShape] = useState<'cloud' | 'circle' | 'wide'>('cloud')
  const [theme, setTheme] = useState<Theme>('gold')
  const [rotate, setRotate] = useState(true)
  const [font, setFont] = useState<'sans' | 'serif' | 'mono'>('sans')
  const [scale, setScale] = useState(100)
  const [seed, setSeed] = useState(7)
  const [transparent, setTransparent] = useState(false)
  const cv = useRef<HTMLCanvasElement>(null)
  const fam = font === 'serif' ? 'Georgia, serif' : font === 'mono' ? 'ui-monospace, monospace' : 'system-ui, sans-serif'
  const freq = useMemo(() => wordFreq(text, { extraStop: stopExtra.split(/[,\s]+/).filter(Boolean) }).slice(0, max), [text, max, stopExtra])
  const dims = shape === 'wide' ? [1600, 800] : [1200, 1200]
  const placed = useMemo(() => (freq.length ? layout(freq, dims[0] / 2, dims[1] / 2, { shape, rotate, font: fam, theme, seed, scale: scale / 100 }) : []), [freq, shape, rotate, fam, theme, seed, scale])
  useEffect(() => { if (cv.current) paint(cv.current, placed, dims[0] / 2, dims[1] / 2, theme, fam, transparent) }, [placed, transparent])

  const hi = async () => { const p = layout(freq, dims[0], dims[1], { shape, rotate, font: fam, theme, seed, scale: scale / 100 }); const c = document.createElement('canvas'); paint(c, p, dims[0], dims[1], theme, fam, transparent); return canvasToBlob(c, 'image/png') }
  const svg = () => { const W = dims[0] / 2, H = dims[1] / 2; return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 2}" height="${H * 2}">${transparent ? '' : `<rect width="100%" height="100%" fill="${THEMES[theme].bg}"/>`}${placed.map((p) => `<text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" font-family="${fam}" font-weight="700" font-size="${p.size}" fill="${p.color}" text-anchor="middle" dominant-baseline="middle"${p.rot ? ` transform="rotate(-90 ${p.x.toFixed(1)} ${p.y.toFixed(1)})"` : ''}>${p.word.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`).join('')}</svg>` }

  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-28 font-sans text-sm" placeholder="Paste text, a speech, reviews or survey answers" aria-label="Text" />
          <canvas ref={cv} className="mx-auto w-full max-w-3xl rounded-2xl border border-border checker" aria-label="Word cloud" />
          <p className="text-xs text-muted">{placed.length} of {freq.length} words fit.</p>
        </div>
      }
      side={
        <>
          <Slider label="Words" value={max} onChange={setMax} min={10} max={250} />
          <Slider label="Text size" value={scale} onChange={setScale} min={50} max={160} suffix="%" />
          <div><Label>Shape</Label><Segmented value={shape} onChange={setShape} options={[{ value: 'cloud', label: 'Cloud' }, { value: 'circle', label: 'Circle' }, { value: 'wide', label: 'Banner' }]} /></div>
          <div><Label>Colours</Label><Segmented value={theme} onChange={setTheme} options={[{ value: 'gold', label: 'Gold' }, { value: 'ocean', label: 'Ocean' }, { value: 'forest', label: 'Forest' }, { value: 'paper', label: 'Paper' }]} /></div>
          <div><Label>Font</Label><Segmented value={font} onChange={setFont} options={[{ value: 'sans', label: 'Sans' }, { value: 'serif', label: 'Serif' }, { value: 'mono', label: 'Mono' }]} /></div>
          <Switch checked={rotate} onChange={setRotate} label="Some words sideways" />
          <Switch checked={transparent} onChange={setTransparent} label="Transparent background" />
          <div><Label>Leave out these words</Label><Input value={stopExtra} onChange={(e) => setStopExtra(e.target.value)} placeholder="company, product" /></div>
          <Button variant="outline" className="w-full" icon={<Shuffle className="size-4" />} onClick={() => setSeed((s) => s + 1)}>New layout</Button>
          <div className="flex flex-wrap gap-2">
            <DlButton variant="primary" name="word-cloud.png" data={hi}>PNG</DlButton>
            <DlButton name="word-cloud.svg" mime="image/svg+xml" data={svg}>SVG</DlButton>
            <DlButton name="word-counts.csv" mime="text/csv" data={() => toCsv([['word', 'count'], ...freq.map((f) => [f.word, f.count])])}>Counts</DlButton>
          </div>
        </>
      }
    />
  )
}
