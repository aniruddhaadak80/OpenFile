import { useState } from 'react'
import { PictureInPicture2 } from 'lucide-react'
import { Label, Segmented, Select, Slider, Switch, cn } from '@/components/ui'
import { backgroundOp, pipOp, zoomPanOp } from '@/lib/b3/ffops'
import { ColorInput } from '@/tools/image/_img/kit'
import { ffProbe } from './_media/engine'
import { useObjectUrl } from './_media/media'
import { VideoStage } from './_media/ui'
import { VideoOpTool, FilePick, inName, outName } from './_b3/shell'

type Mode = 'pip' | 'background' | 'zoom'
type Corner = 'tl' | 'tr' | 'bl' | 'br'
const cssCorner: Record<Corner, string> = { tl: 'left-[3%] top-[3%]', tr: 'right-[3%] top-[3%]', bl: 'left-[3%] bottom-[3%]', br: 'right-[3%] bottom-[3%]' }

export default function VideoOverlay() {
  const [mode, setMode] = useState<Mode>('pip')
  const [second, setSecond] = useState<File | null>(null)
  const [corner, setCorner] = useState<Corner>('br')
  const [size, setSize] = useState(30)
  const [border, setBorder] = useState(4)
  const [borderColor, setBorderColor] = useState('#ffffff')
  const [mix, setMix] = useState(false)
  const [canvas, setCanvas] = useState('1080x1920')
  const [bgKind, setBgKind] = useState<'color' | 'image'>('color')
  const [bgColor, setBgColor] = useState('#111111')
  const [bgImage, setBgImage] = useState<File | null>(null)
  const [scale, setScale] = useState(90)
  const [zoom, setZoom] = useState(1.4)
  const secondUrl = useObjectUrl(second)
  const isImg = !!second && second.type.startsWith('image/')
  return (
    <VideoOpTool
      dropLabel="Drop the main video" action={mode === 'pip' ? 'Add picture-in-picture' : mode === 'background' ? 'Place on background' : 'Apply zoom'} icon={<PictureInPicture2 className="size-5" />}
      onReset={() => { setSecond(null); setBgImage(null) }}
      main={({ url, meta }) => (
        <div className="relative">
          <VideoStage src={url} playable={meta?.playable !== false} />
          {mode === 'pip' && secondUrl && <div className={cn('pointer-events-none absolute overflow-hidden', cssCorner[corner])} style={{ width: `${size}%`, outline: border ? `${border / 2}px solid ${borderColor}` : undefined }}>
            {isImg ? <img src={secondUrl} alt="" className="w-full" /> : <video src={secondUrl} muted autoPlay loop playsInline className="w-full" />}
          </div>}
        </div>
      )}
      side={() => <>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'pip', label: 'Picture in picture' }, { value: 'background', label: 'Background' }, { value: 'zoom', label: 'Zoom' }]} />
        {mode === 'pip' && <div className="space-y-3">
          <FilePick file={second} onFile={setSecond} accept="video/*,image/*" label="Drop the small video or image" hint="A webcam clip, reaction, logo or photo" />
          <div><Label>Corner</Label><Segmented value={corner} onChange={setCorner} options={[{ value: 'tl', label: '↖' }, { value: 'tr', label: '↗' }, { value: 'bl', label: '↙' }, { value: 'br', label: '↘' }]} /></div>
          <Slider label="Size" value={size} onChange={setSize} min={10} max={60} suffix="%" />
          <Slider label="Border" value={border} onChange={setBorder} min={0} max={20} suffix="px" />
          {border > 0 && <ColorInput value={borderColor} onChange={setBorderColor} />}
          {second && !isImg && <Switch checked={mix} onChange={setMix} label="Mix in its sound" />}
        </div>}
        {mode === 'background' && <div className="space-y-3">
          <div><Label>Canvas</Label><Select aria-label="Canvas" value={canvas} onChange={setCanvas} options={[{ value: '1080x1920', label: 'Vertical 1080×1920' }, { value: '1080x1080', label: 'Square 1080×1080' }, { value: '1080x1350', label: 'Portrait 1080×1350' }, { value: '1920x1080', label: 'Wide 1920×1080' }]} /></div>
          <Segmented value={bgKind} onChange={setBgKind} options={[{ value: 'color', label: 'Colour' }, { value: 'image', label: 'Image' }]} />
          {bgKind === 'color' ? <ColorInput value={bgColor} onChange={setBgColor} /> : <FilePick file={bgImage} onFile={setBgImage} accept="image/*" label="Drop a background image" />}
          <Slider label="Video size" value={scale} onChange={setScale} min={30} max={100} suffix="%" />
        </div>}
        {mode === 'zoom' && <div className="space-y-3">
          <Slider label="Zoom to" value={zoom} onChange={setZoom} min={1.1} max={3} step={0.05} suffix="×" />
          <p className="text-xs text-muted">Slowly pushes in to the centre over the whole clip.</p>
        </div>}
      </>}
      disabled={() => (mode === 'pip' && !second) || (mode === 'background' && bgKind === 'image' && !bgImage)}
      onRun={async ({ file, meta }, h) => {
        const info = await h.probe()
        const input = inName(file)
        const W = info.width || meta?.width || 1280, H = info.height || meta?.height || 720
        if (mode === 'pip') {
          const s2 = second!
          const name2 = inName(s2, 'pip')
          const sInfo = isImg ? null : await ffProbe(s2, name2)
          const w = Math.round(W * size / 100)
          const ar = isImg ? await imgRatio(s2) : (sInfo?.height && sInfo.width ? sInfo.height / sInfo.width : 9 / 16)
          const hh = Math.round(w * ar), m = Math.round(Math.min(W, H) * 0.03)
          const x = corner.endsWith('l') ? m : W - w - m - border * 2, y = corner.startsWith('t') ? m : H - hh - m - border * 2
          h.setLabel('Overlaying')
          const blob = await h.run(pipOp(input, name2, isImg, { x, y, w }, info.hasAudio, { border, borderColor, mixAudio: mix, secondHasAudio: sInfo?.hasAudio }), [{ name: input, file }, { name: name2, file: s2 }])
          return { blob, name: outName(file, 'pip'), title: 'Picture-in-picture added' }
        }
        if (mode === 'background') {
          const [cw, ch] = canvas.split('x').map(Number)
          const bg = bgKind === 'image' && bgImage ? { image: inName(bgImage, 'bg') } : { color: bgColor }
          h.setLabel('Placing on background')
          const blob = await h.run(backgroundOp(input, cw, ch, bg, scale / 100, info.hasAudio), [{ name: input, file }, ...(bgImage && bgKind === 'image' ? [{ name: inName(bgImage, 'bg'), file: bgImage }] : [])], undefined, { pixelScale: (cw * ch) / (W * H) })
          return { blob, name: outName(file, `${cw}x${ch}`), title: 'Placed on background' }
        }
        h.setLabel('Zooming')
        const blob = await h.run(zoomPanOp(input, zoom, info.duration || meta?.duration || 5, Math.round(info.fps || 30), W, H, info.hasAudio), [{ name: input, file }])
        return { blob, name: outName(file, 'zoom'), title: 'Zoom applied' }
      }}
    />
  )
}

async function imgRatio(f: File) { const b = await createImageBitmap(f); const r = b.height / b.width; b.close(); return r }
