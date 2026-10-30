import { useState } from 'react'
import { Droplets } from 'lucide-react'
import { Input, Label, Segmented, Select, Slider, Switch } from '@/components/ui'
import { cornerXY, overlayPngOp, type Corner } from '@/lib/b3/ffops'
import { ColorInput } from '@/tools/image/_img/kit'
import { VideoOpTool, FilePick, inName, outName } from './_b3/shell'
import { drawText, renderPng, FONTS } from './_b3/text-png'
import { VideoStage } from './_media/ui'
import { useObjectUrl } from './_media/media'
import { cn } from '@/components/ui'

const CORNERS: { v: Corner; l: string }[] = [{ v: 'tl', l: '↖' }, { v: 'tc', l: '↑' }, { v: 'tr', l: '↗' }, { v: 'c', l: '•' }, { v: 'bl', l: '↙' }, { v: 'bc', l: '↓' }, { v: 'br', l: '↘' }]
const cssPos: Record<Corner, string> = { tl: 'left-[4%] top-[4%]', tc: 'left-1/2 -translate-x-1/2 top-[4%]', tr: 'right-[4%] top-[4%]', c: 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2', bl: 'left-[4%] bottom-[4%]', bc: 'left-1/2 -translate-x-1/2 bottom-[4%]', br: 'right-[4%] bottom-[4%]' }

export default function VideoWatermark() {
  const [kind, setKind] = useState<'text' | 'logo'>('text')
  const [text, setText] = useState('© Your name')
  const [font, setFont] = useState('Inter')
  const [color, setColor] = useState('#ffffff')
  const [shadow, setShadow] = useState(true)
  const [logo, setLogo] = useState<File | null>(null)
  const [pos, setPos] = useState<Corner>('br')
  const [size, setSize] = useState(6)
  const [opacity, setOpacity] = useState(70)
  const logoUrl = useObjectUrl(logo)
  return (
    <VideoOpTool
      dropLabel="Drop a video to watermark" action="Add watermark" icon={<Droplets className="size-5" />}
      main={({ url, meta }) => (
        <div className="relative">
          <VideoStage src={url} playable={meta?.playable !== false} />
          <div className={cn('pointer-events-none absolute', cssPos[pos])} style={{ opacity: opacity / 100 }}>
            {kind === 'text' ? <span style={{ fontFamily: font, color, fontSize: `${size * 0.5}vmin`, fontWeight: 700, textShadow: shadow ? '0 1px 4px rgba(0,0,0,.7)' : undefined }}>{text}</span>
              : logoUrl ? <img src={logoUrl} alt="" style={{ width: `${size * 2}vmin` }} /> : null}
          </div>
        </div>
      )}
      side={() => <>
        <Segmented value={kind} onChange={setKind} options={[{ value: 'text', label: 'Text' }, { value: 'logo', label: 'Logo' }]} />
        {kind === 'text' ? <div className="space-y-3">
          <Input value={text} onChange={(e) => setText(e.target.value)} aria-label="Watermark text" />
          <div className="grid grid-cols-2 gap-2"><Select aria-label="Font" value={font} onChange={setFont} options={FONTS} /><ColorInput value={color} onChange={setColor} /></div>
          <Switch checked={shadow} onChange={setShadow} label="Soft shadow" />
        </div> : <FilePick file={logo} onFile={setLogo} accept="image/png,image/webp,image/svg+xml,image/jpeg" label="Drop your logo" hint="PNG with transparency works best" />}
        <div>
          <Label>Position</Label>
          <div className="grid grid-cols-7 gap-1">{CORNERS.map((c) => <button key={c.v} aria-label={`Position ${c.v}`} onClick={() => setPos(c.v)} className={cn('h-9 rounded-lg text-sm cursor-pointer', pos === c.v ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted hover:text-fg')}>{c.l}</button>)}</div>
        </div>
        <Slider label="Size" value={size} onChange={setSize} min={2} max={30} suffix="%" />
        <Slider label="Opacity" value={opacity} onChange={setOpacity} min={10} max={100} suffix="%" />
      </>}
      disabled={() => (kind === 'text' ? !text.trim() : !logo)}
      onRun={async ({ file, meta }, h) => {
        const info = await h.probe()
        const W = info.width || meta?.width || 1280, H = info.height || meta?.height || 720
        h.setLabel('Rendering watermark')
        const margin = Math.round(Math.min(W, H) * 0.04)
        let png: Uint8Array, wPx: number | undefined
        if (kind === 'text') {
          const fs = Math.max(10, Math.round((Math.min(W, H) * size) / 100))
          const c = document.createElement('canvas').getContext('2d')!
          c.font = `bold ${fs}px "${font}"`
          const tw = Math.ceil(c.measureText(text).width + fs), th = Math.ceil(fs * 1.6)
          png = await renderPng(tw, th, async (ctx) => {
            if (shadow) { ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = fs / 6; ctx.shadowOffsetY = fs / 16 }
            await drawText(ctx, { text, font, size: fs, color, stroke: '#000', strokeW: 0, box: false, boxColor: '#000', x: 50, y: 50, bold: true }, tw, th)
          })
        } else {
          wPx = Math.round((W * size * 2) / 100)
          if (/svg/.test(logo!.type) || /\.svg$/i.test(logo!.name)) {
            // ffmpeg cannot read SVG: rasterise it at the final size
            const img = new Image(); img.src = logoUrl!; await img.decode()
            const hPx = Math.round(wPx * (img.naturalHeight || 1) / (img.naturalWidth || 1))
            png = await renderPng(wPx, hPx, (ctx) => ctx.drawImage(img, 0, 0, wPx!, hPx))
          } else png = new Uint8Array(await logo!.arrayBuffer())
        }
        const [x, y] = cornerXY(pos, margin)
        h.setLabel('Adding watermark')
        const input = inName(file), lname = kind === 'logo' && !/svg/.test(logo!.type) ? inName(logo!, 'logo') : 'mark.png'
        const blob = await h.run(overlayPngOp(input, lname, x, y, info.hasAudio, { opacity: opacity / 100, scaleW: wPx }), [{ name: input, file }, { name: lname, file: png }])
        return { blob, name: outName(file, 'watermarked'), title: 'Watermark added' }
      }}
    />
  )
}
