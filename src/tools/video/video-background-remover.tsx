import { useEffect, useRef, useState } from 'react'
import { Wand2, Pipette } from 'lucide-react'
import { Label, Segmented, Slider } from '@/components/ui'
import { chromaKeyOp } from '@/lib/b3/ffops'
import { ColorInput } from '@/tools/image/_img/kit'
import { VideoOpTool, FilePick, inName, outName, useStill } from './_b3/shell'
import { Note } from './_media/ui'

type Bg = 'color' | 'image' | 'video' | 'transparent'

/** Approximate ffmpeg's chromakey in JS for the preview (UV distance in YCbCr). */
function preview(src: HTMLImageElement, c: HTMLCanvasElement, key: string, sim: number, blend: number, bg: { color?: string; img?: HTMLImageElement | null; transparent?: boolean }) {
  const w = src.naturalWidth, h = src.naturalHeight
  const s = Math.min(1, 720 / Math.max(w, h)); c.width = Math.round(w * s); c.height = Math.round(h * s)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(src, 0, 0, c.width, c.height)
  const fg = ctx.getImageData(0, 0, c.width, c.height)
  const k = parseInt(key.slice(1), 16), kr = (k >> 16) & 255, kg = (k >> 8) & 255, kb = k & 255
  const ku = -0.169 * kr - 0.331 * kg + 0.5 * kb, kv = 0.5 * kr - 0.419 * kg - 0.081 * kb
  const d = fg.data
  for (let i = 0; i < d.length; i += 4) {
    const u = -0.169 * d[i] - 0.331 * d[i + 1] + 0.5 * d[i + 2], v = 0.5 * d[i] - 0.419 * d[i + 1] - 0.081 * d[i + 2]
    const diff = Math.sqrt((u - ku) ** 2 + (v - kv) ** 2) / 255 / Math.SQRT2
    let a = 1
    if (diff < sim) a = 0
    else if (blend > 0 && diff < sim + blend) a = (diff - sim) / blend
    d[i + 3] = Math.round(a * 255)
  }
  ctx.clearRect(0, 0, c.width, c.height)
  if (!bg.transparent) {
    if (bg.img) { const r = Math.max(c.width / bg.img.naturalWidth, c.height / bg.img.naturalHeight); const iw = bg.img.naturalWidth * r, ih = bg.img.naturalHeight * r; ctx.drawImage(bg.img, (c.width - iw) / 2, (c.height - ih) / 2, iw, ih) }
    else { ctx.fillStyle = bg.color ?? '#000'; ctx.fillRect(0, 0, c.width, c.height) }
  }
  const tmp = document.createElement('canvas'); tmp.width = c.width; tmp.height = c.height; tmp.getContext('2d')!.putImageData(fg, 0, 0)
  ctx.drawImage(tmp, 0, 0)
}

export default function VideoBackgroundRemover() {
  const [key, setKey] = useState('#00ff00')
  const [sim, setSim] = useState(15)
  const [blend, setBlend] = useState(8)
  const [bg, setBg] = useState<Bg>('color')
  const [color, setColor] = useState('#0f172a')
  const [img, setImg] = useState<File | null>(null)
  const [vid, setVid] = useState<File | null>(null)
  const [picking, setPicking] = useState(false)
  return (
    <VideoOpTool
      dropLabel="Drop a green or blue screen video" action="Remove background" icon={<Wand2 className="size-5" />}
      onReset={() => { setImg(null); setVid(null) }}
      main={({ url }) => <KeyPreview url={url} keyColor={key} sim={sim / 100} blend={blend / 100} bg={bg} color={color} img={img} picking={picking} onPick={(c) => { setKey(c); setPicking(false) }} />}
      side={() => <>
        <div>
          <Label>Screen colour</Label>
          <div className="flex gap-2"><ColorInput value={key} onChange={setKey} className="flex-1" /><button onClick={() => setPicking(!picking)} aria-label="Pick colour from the video" className={`grid size-10 place-items-center rounded-xl border cursor-pointer ${picking ? 'border-accent bg-accent/15 text-accent' : 'border-border text-muted hover:text-fg'}`}><Pipette className="size-4" /></button></div>
          <div className="mt-2 flex gap-1.5"><button onClick={() => setKey('#00ff00')} className="rounded-lg bg-surface-2 px-2 py-1 text-xs cursor-pointer">Green</button><button onClick={() => setKey('#0047bb')} className="rounded-lg bg-surface-2 px-2 py-1 text-xs cursor-pointer">Blue</button></div>
          {picking && <p className="mt-1 text-xs text-accent">Click the screen colour in the preview.</p>}
        </div>
        <Slider label="Similarity" value={sim} onChange={setSim} min={1} max={60} />
        <Slider label="Edge softness" value={blend} onChange={setBlend} min={0} max={40} />
        <div><Label>New background</Label><Segmented value={bg} onChange={setBg} options={[{ value: 'color', label: 'Colour' }, { value: 'image', label: 'Image' }, { value: 'video', label: 'Video' }, { value: 'transparent', label: 'None' }]} /></div>
        {bg === 'color' && <ColorInput value={color} onChange={setColor} />}
        {bg === 'image' && <FilePick file={img} onFile={setImg} accept="image/*" label="Drop a background image" />}
        {bg === 'video' && <FilePick file={vid} onFile={setVid} accept="video/*" label="Drop a background video" hint="It loops if shorter" />}
        {bg === 'transparent' && <Note>Saves a WebM with a transparent background, ready for editors and web pages.</Note>}
        <Note>Works with an evenly lit green or blue backdrop. AI cut-out without a screen is not available yet.</Note>
      </>}
      disabled={() => (bg === 'image' && !img) || (bg === 'video' && !vid)}
      onRun={async ({ file, meta }, h) => {
        const info = await h.probe()
        const W = info.width || meta?.width || 1280, H = info.height || meta?.height || 720
        const input = inName(file)
        const extra: { name: string; file: Blob }[] = []
        const target = bg === 'image' && img ? (extra.push({ name: inName(img, 'bg'), file: img }), { image: inName(img, 'bg') })
          : bg === 'video' && vid ? (extra.push({ name: inName(vid, 'bgv'), file: vid }), { video: inName(vid, 'bgv') })
          : bg === 'transparent' ? { transparent: true } : { color }
        h.setLabel('Keying')
        const op = chromaKeyOp(input, key, sim / 100, blend / 100, target, info.hasAudio, W, H)
        const blob = await h.run(op, [{ name: input, file }, ...extra])
        return { blob, name: outName(file, 'keyed', bg === 'transparent' ? 'webm' : 'mp4'), title: 'Background replaced' }
      }}
    />
  )
}

function KeyPreview({ url, keyColor, sim, blend, bg, color, img, picking, onPick }: { url: string | null; keyColor: string; sim: number; blend: number; bg: Bg; color: string; img: File | null; picking: boolean; onPick: (hex: string) => void }) {
  const still = useStill(url, 1)
  const srcImg = useRef<HTMLImageElement | null>(null)
  const bgImg = useRef<HTMLImageElement | null>(null)
  const c = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(0)
  useEffect(() => { if (!still) return; const i = new Image(); i.onload = () => { srcImg.current = i; setReady((r) => r + 1) }; i.src = still.src }, [still])
  useEffect(() => { if (!img) { bgImg.current = null; setReady((r) => r + 1); return } const u = URL.createObjectURL(img); const i = new Image(); i.onload = () => { bgImg.current = i; setReady((r) => r + 1) }; i.src = u; return () => URL.revokeObjectURL(u) }, [img])
  useEffect(() => { if (srcImg.current && c.current) preview(srcImg.current, c.current, keyColor, sim, blend, { color, img: bg === 'image' ? bgImg.current : null, transparent: bg === 'transparent' || bg === 'video' }) }, [ready, keyColor, sim, blend, bg, color])
  const pick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!picking || !srcImg.current) return
    const r = e.currentTarget.getBoundingClientRect()
    const t = document.createElement('canvas'); t.width = srcImg.current.naturalWidth; t.height = srcImg.current.naturalHeight
    const ctx = t.getContext('2d')!; ctx.drawImage(srcImg.current, 0, 0)
    const p = ctx.getImageData(Math.floor(((e.clientX - r.left) / r.width) * t.width), Math.floor(((e.clientY - r.top) / r.height) * t.height), 1, 1).data
    onPick('#' + [p[0], p[1], p[2]].map((v) => v.toString(16).padStart(2, '0')).join(''))
  }
  if (!still) return <div className="grid aspect-video place-items-center rounded-2xl border border-border bg-surface-2/40 text-sm text-muted">Loading preview</div>
  return (
    <div className="space-y-2">
      <div className="checker grid place-items-center rounded-2xl border border-border p-2"><canvas ref={c} onClick={pick} className={`max-h-[60vh] max-w-full ${picking ? 'cursor-crosshair' : ''}`} /></div>
      <p className="text-center text-xs text-muted">Preview of one frame. {bg === 'video' ? 'The background video appears in the result.' : ''}</p>
    </div>
  )
}
