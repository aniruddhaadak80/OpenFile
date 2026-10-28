import { useEffect, useState } from 'react'
import { Download, ImageDown } from 'lucide-react'
import { Button, Input, Select, Segmented, Slider, CopyButton, Switch } from '@/components/ui'
import { downloadBlob, downloadDataUrl } from '@/lib/files'
import { Bar, Status, useStored, useDebounced } from '../dev/_b5/shell'

const FONTS: Record<string, () => Promise<{ default: string }>> = {
  'Standard': () => import('figlet/importable-fonts/Standard.js'),
  'Big': () => import('figlet/importable-fonts/Big.js'),
  'Slant': () => import('figlet/importable-fonts/Slant.js'),
  'Small': () => import('figlet/importable-fonts/Small.js'),
  'Small Slant': () => import('figlet/importable-fonts/Small Slant.js'),
  'Banner': () => import('figlet/importable-fonts/Banner.js'),
  'Block': () => import('figlet/importable-fonts/Block.js'),
  'Doom': () => import('figlet/importable-fonts/Doom.js'),
  'Shadow': () => import('figlet/importable-fonts/Shadow.js'),
  'Ghost': () => import('figlet/importable-fonts/Ghost.js'),
  'Star Wars': () => import('figlet/importable-fonts/Star Wars.js'),
  'ANSI Shadow': () => import('figlet/importable-fonts/ANSI Shadow.js'),
  'Bloody': () => import('figlet/importable-fonts/Bloody.js'),
  '3-D': () => import('figlet/importable-fonts/3-D.js'),
  'Isometric1': () => import('figlet/importable-fonts/Isometric1.js'),
  'Larry 3D': () => import('figlet/importable-fonts/Larry 3D.js'),
  'Lean': () => import('figlet/importable-fonts/Lean.js'),
  'Mini': () => import('figlet/importable-fonts/Mini.js'),
  'Script': () => import('figlet/importable-fonts/Script.js'),
  'Graffiti': () => import('figlet/importable-fonts/Graffiti.js'),
  'Calvin S': () => import('figlet/importable-fonts/Calvin S.js'),
  'Colossal': () => import('figlet/importable-fonts/Colossal.js'),
  'Epic': () => import('figlet/importable-fonts/Epic.js'),
  'Speed': () => import('figlet/importable-fonts/Speed.js'),
  'Sub-Zero': () => import('figlet/importable-fonts/Sub-Zero.js'),
  'Roman': () => import('figlet/importable-fonts/Roman.js'),
  'Rectangles': () => import('figlet/importable-fonts/Rectangles.js'),
  'Ogre': () => import('figlet/importable-fonts/Ogre.js'),
  'Big Money-ne': () => import('figlet/importable-fonts/Big Money-ne.js'),
  'DOS Rebel': () => import('figlet/importable-fonts/DOS Rebel.js'),
  'Electronic': () => import('figlet/importable-fonts/Electronic.js'),
}
type Layout = 'default' | 'full' | 'fitted' | 'controlled smushing' | 'universal smushing'
let figP: Promise<any> | null = null
const loaded = new Set<string>()
async function fig(font: string) {
  const f = await (figP ??= import('figlet').then((m) => m.default ?? m))
  if (!loaded.has(font)) { f.parseFont(font, (await FONTS[font]()).default); loaded.add(font) }
  return f
}

export default function AsciiArt() {
  const [text, setText] = useStored('b5:ascii:text', 'OpenFile')
  const [font, setFont] = useStored('b5:ascii:font', 'Standard')
  const [layout, setLayout] = useState<Layout>('default')
  const [width, setWidth] = useState(100)
  const [comment, setComment] = useState<'none' | 'hash' | 'slash' | 'block'>('none')
  const [all, setAll] = useState(false)
  const [out, setOut] = useState('')
  const [gallery, setGallery] = useState<[string, string][]>([])
  const [err, setErr] = useState<string | null>(null)
  const dt = useDebounced(text, 150)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const f = await fig(font)
        const r = f.textSync(dt || ' ', { font, horizontalLayout: layout, width, whitespaceBreak: true })
        if (alive) { setOut(r); setErr(null) }
      } catch (e: any) { if (alive) setErr(e?.message || String(e)) }
    })()
    return () => { alive = false }
  }, [dt, font, layout, width])

  useEffect(() => {
    if (!all) return
    let alive = true
    ;(async () => {
      const res: [string, string][] = []
      for (const name of Object.keys(FONTS)) { try { const f = await fig(name); res.push([name, f.textSync((dt || 'Hi').slice(0, 14), { font: name, width: 200 })]) } catch { /* skip */ } if (!alive) return; setGallery([...res]) }
    })()
    return () => { alive = false }
  }, [all, dt])

  const wrapped = comment === 'none' ? out : comment === 'hash' ? out.split('\n').map((l) => '# ' + l).join('\n') : comment === 'slash' ? out.split('\n').map((l) => '// ' + l).join('\n') : '/*\n' + out.split('\n').map((l) => ' * ' + l).join('\n') + '\n */'
  const savePng = () => {
    const lines = wrapped.split('\n'); const fs = 16, lh = fs * 1.15
    const c = document.createElement('canvas'); const ctx = c.getContext('2d')!; ctx.font = `${fs}px "JetBrains Mono", ui-monospace, monospace`
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width))
    c.width = Math.ceil(w + 48); c.height = Math.ceil(lines.length * lh + 48)
    ctx.fillStyle = '#0B0D10'; ctx.fillRect(0, 0, c.width, c.height); ctx.fillStyle = '#F5A524'; ctx.font = `${fs}px "JetBrains Mono", ui-monospace, monospace`; ctx.textBaseline = 'top'
    lines.forEach((l, i) => ctx.fillText(l, 24, 24 + i * lh))
    downloadDataUrl(c.toDataURL('image/png'), 'ascii-art.png')
  }

  return (
    <div className="space-y-4">
      <Input value={text} onChange={(e) => setText(e.target.value)} className="h-12 text-lg" placeholder="Type your banner text" aria-label="Banner text" maxLength={200} />
      <Bar>
        <Select value={font} onChange={setFont} options={Object.keys(FONTS)} className="w-48" />
        <Select value={layout} onChange={setLayout} options={[{ value: 'default', label: 'Default spacing' }, { value: 'full', label: 'Full width' }, { value: 'fitted', label: 'Fitted' }, { value: 'controlled smushing', label: 'Smushed' }]} className="w-44" />
        <Slider label="Wrap at" value={width} onChange={setWidth} min={40} max={240} suffix=" cols" className="w-44" />
        <Segmented value={comment} onChange={setComment} options={[{ value: 'none', label: 'Plain' }, { value: 'hash', label: '# comment' }, { value: 'slash', label: '// comment' }, { value: 'block', label: '/* */' }]} />
        <Switch checked={all} onChange={setAll} label="Preview all fonts" />
      </Bar>
      {err && <Status kind="err">{err}</Status>}
      <div className="relative rounded-2xl border border-border bg-surface">
        <div className="absolute right-2 top-2 flex gap-1"><CopyButton text={wrapped} variant="ghost" /><Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([wrapped + '\n'], { type: 'text/plain' }), 'ascii-art.txt')}>TXT</Button><Button size="sm" variant="ghost" icon={<ImageDown className="size-4" />} onClick={savePng}>PNG</Button></div>
        <pre className="scrollbar-thin overflow-auto p-5 pt-12 font-mono text-[13px] leading-[1.15] text-accent" aria-label="ASCII art">{wrapped}</pre>
      </div>
      {all && <div className="grid gap-3 md:grid-cols-2">{gallery.map(([name, art]) => <button key={name} onClick={() => { setFont(name); setAll(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="overflow-hidden rounded-2xl border border-border bg-surface p-3 text-left transition hover:border-accent"><div className="mb-1 text-xs font-semibold text-muted">{name}</div><pre className="scrollbar-thin overflow-x-auto font-mono text-[9px] leading-[1.1]">{art}</pre></button>)}</div>}
    </div>
  )
}
