import { useEffect, useMemo, useRef, useState } from 'react'
import { Type, Download } from 'lucide-react'
import { Button, Dropzone, Field, Select, Slider, Switch, ToolGrid, CopyButton } from '@/components/ui'
import { baseName, canvasToBlob, downloadBlob, loadImage } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { toAscii, RAMPS } from '@/lib/b14/image'
import { escapeHtml } from '@/lib/safe'
import { DlButton } from '@/lib/bcat/kit'

export default function ImageToAscii() {
  const [file, setFile] = useState<File | null>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [cols, setCols] = useState(100)
  const [ramp, setRamp] = useState('classic')
  const [invert, setInvert] = useState(false)
  const [color, setColor] = useState(true)
  const [contrast, setContrast] = useState(110)
  const out = useRef<HTMLCanvasElement>(null)
  useEffect(() => { if (file) loadImage(file).then(setImg) }, [file])
  const grid = useMemo(() => {
    if (!img) return null
    const rows = Math.max(1, Math.round((cols * img.naturalHeight / img.naturalWidth) * 0.5))
    const c = document.createElement('canvas'); c.width = cols; c.height = rows
    const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.filter = `contrast(${contrast}%)`; ctx.drawImage(img, 0, 0, cols, rows)
    const d = ctx.getImageData(0, 0, cols, rows).data
    const lum = new Float32Array(cols * rows)
    for (let i = 0; i < lum.length; i++) { const a = d[i * 4 + 3] / 255; lum[i] = ((0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255) * a + (1 - a) }
    return { rows, d, text: toAscii(lum, cols, rows, RAMPS[ramp], invert) }
  }, [img, cols, ramp, invert, contrast])
  // colour PNG render
  useEffect(() => {
    const c = out.current; if (!c || !grid) return
    const fs = 12, cw = fs * 0.6, lh = fs
    c.width = Math.ceil(cols * cw); c.height = grid.rows * lh
    const ctx = c.getContext('2d')!; ctx.fillStyle = invert ? '#F5F3EE' : '#0B0D10'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.font = `${fs}px "JetBrains Mono", monospace`; ctx.textBaseline = 'top'
    const lines = grid.text.split('\n')
    lines.forEach((l, y) => { [...l].forEach((ch, x) => { if (ch === ' ') return; const i = (y * cols + x) * 4; ctx.fillStyle = color ? `rgb(${grid.d[i]},${grid.d[i + 1]},${grid.d[i + 2]})` : invert ? '#1A1C20' : '#F5F3EE'; ctx.fillText(ch, x * cw, y * lh) }) })
  }, [grid, color, invert, cols])
  const html = () => { if (!grid) return ''; const lines = grid.text.split('\n'); const body = lines.map((l, y) => [...l].map((ch, x) => { const i = (y * cols + x) * 4; return ch === ' ' ? ' ' : color ? `<span style="color:rgb(${grid.d[i]},${grid.d[i + 1]},${grid.d[i + 2]})">${escapeHtml(ch)}</span>` : escapeHtml(ch) }).join('')).join('\n'); return `<!doctype html><meta charset="utf-8"><title>ASCII art</title><body style="background:${invert ? '#F5F3EE' : '#0B0D10'};color:${invert ? '#1A1C20' : '#F5F3EE'}"><pre style="font:10px/10px monospace">${body}</pre></body>` }
  if (!file) return <Dropzone accept="image/*" onFiles={(f) => setFile(f[0])} label="Drop a picture" sub="Turn a photo or logo into ASCII art you can paste in chats, code comments or a README, or save as a colour image." />
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => { setFile(null); setImg(null) }} />
        <div className="scrollbar-thin overflow-auto rounded-2xl border border-border bg-surface p-2"><canvas ref={out} className="max-w-full" aria-label="ASCII art preview" /></div>
      </>}
      side={<>
        <Slider label="Width in characters" value={cols} onChange={setCols} min={20} max={240} />
        <Field label="Characters"><Select value={ramp} onChange={setRamp} options={[{ value: 'classic', label: 'Classic ( .:-=+*#%@ )' }, { value: 'detailed', label: 'Detailed (70 levels)' }, { value: 'blocks', label: 'Blocks (░▒▓█)' }, { value: 'dots', label: 'Braille dots' }, { value: 'binary', label: 'Binary (0 and 1)' }]} /></Field>
        <Slider label="Contrast" value={contrast} onChange={setContrast} min={50} max={200} suffix="%" />
        <Switch checked={invert} onChange={setInvert} label="Dark text on light background" />
        <Switch checked={color} onChange={setColor} label="Colour (image and HTML)" />
        <div className="flex flex-wrap gap-2">
          <CopyButton text={grid?.text ?? ''} label="Copy text" />
          <DlButton name={`${baseName(file.name)}-ascii.txt`} data={() => grid?.text ?? ''}>TXT</DlButton>
          <DlButton name={`${baseName(file.name)}-ascii.html`} mime="text/html" data={html}>HTML</DlButton>
          <Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={async () => out.current && downloadBlob(await canvasToBlob(out.current, 'image/png'), `${baseName(file.name)}-ascii.png`)}>PNG</Button>
        </div>
        <p className="flex gap-1.5 text-xs text-muted"><Type className="size-4 shrink-0" />Text output looks right in a monospace font, like code blocks in chat apps.</p>
      </>}
    />
  )
}
