import { useCallback, useEffect, useRef, useState } from 'react'
import { Brush, Eraser, Undo2, Redo2, Trash2, Wand2, Download, Cpu, Eye } from 'lucide-react'
import { Button, Field, Progress, Segmented, Slider, ToolGrid, ErrorNote, useJob } from '@/components/ui'
import { formatBytes, downloadBlob } from '@/lib/files'
import { ImageDrop, blurCanvas } from '@/tools/image/_img/kit'
import { decodeAny, encodeCanvas, type OutFmt } from '@/lib/b2/codecs'

// LaMa inpainting (Apache-2.0), ONNX export with a fixed 512×512 input.
export const LAMA_URL = 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx'
const LAMA_SIZE = 208_044_816
const S = 512

type Stroke = { erase: boolean; r: number; pts: [number, number][] }

/** Inpaint `mask` (white = remove) on `img` around the mask bounding box. Returns a new full-size canvas. */
async function inpaint(img: HTMLCanvasElement, mask: HTMLCanvasElement, onProgress: (l: number, t: number) => void, onStage: (s: string) => void) {
  const { getSession, toCHW } = await import('@/lib/b2/onnx')
  onStage('Loading AI model')
  const { session, ort, backend } = await getSession(LAMA_URL, onProgress)
  const W = img.width, H = img.height
  const md = mask.getContext('2d')!.getImageData(0, 0, W, H).data
  let x0 = W, y0 = H, x1 = -1, y1 = -1
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (md[(y * W + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y }
  if (x1 < 0) throw new Error('Paint over the object you want to remove first.')
  // square crop around the mask with generous context, at least 512 px when the image allows it
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1
  let side = Math.max(bw, bh) * 2.2
  side = Math.min(Math.max(side, Math.min(S, Math.max(W, H))), Math.max(W, H))
  let cx = (x0 + x1) / 2 - side / 2, cy = (y0 + y1) / 2 - side / 2
  cx = Math.max(0, Math.min(W - Math.min(side, W), cx)); cy = Math.max(0, Math.min(H - Math.min(side, H), cy))
  const cw = Math.min(side, W), ch = Math.min(side, H)
  const crop = document.createElement('canvas'); crop.width = S; crop.height = S
  const cctx = crop.getContext('2d')!; cctx.imageSmoothingQuality = 'high'; cctx.drawImage(img, cx, cy, cw, ch, 0, 0, S, S)
  const mcrop = document.createElement('canvas'); mcrop.width = S; mcrop.height = S
  const mctx = mcrop.getContext('2d')!; mctx.drawImage(mask, cx, cy, cw, ch, 0, 0, S, S)
  const mdata = mctx.getImageData(0, 0, S, S).data
  const m = new Float32Array(S * S); for (let i = 0; i < S * S; i++) m[i] = mdata[i * 4 + 3] > 20 ? 1 : 0
  onStage(`Removing (${backend === 'webgpu' ? 'GPU' : 'CPU'})`)
  const out = await session.run({ image: new ort.Tensor('float32', toCHW(crop), [1, 3, S, S]), mask: new ort.Tensor('float32', m, [1, 1, S, S]) })
  const o = (out.output ?? out[session.outputNames[0]]).data as Float32Array
  const res = document.createElement('canvas'); res.width = S; res.height = S
  const rctx = res.getContext('2d')!, id = rctx.createImageData(S, S)
  for (let i = 0; i < S * S; i++) { id.data[i * 4] = o[i]; id.data[i * 4 + 1] = o[S * S + i]; id.data[i * 4 + 2] = o[2 * S * S + i]; id.data[i * 4 + 3] = 255 }
  rctx.putImageData(id, 0, 0)
  // paste back only inside a softened mask
  const soft = document.createElement('canvas'); soft.width = W; soft.height = H
  const sctx = soft.getContext('2d')!; sctx.drawImage(mask, 0, 0)
  // grow the mask slightly and feather it outward, keeping the painted area fully replaced
  const feathered = blurCanvas(soft, Math.max(2, Math.max(bw, bh) / 60))
  const fctx2 = feathered.getContext('2d')!; fctx2.drawImage(soft, 0, 0)
  const patch = document.createElement('canvas'); patch.width = W; patch.height = H
  const pctx = patch.getContext('2d')!; pctx.drawImage(res, 0, 0, S, S, cx, cy, cw, ch)
  pctx.globalCompositeOperation = 'destination-in'; pctx.drawImage(feathered, 0, 0)
  const final = document.createElement('canvas'); final.width = W; final.height = H
  const fctx = final.getContext('2d')!; fctx.drawImage(img, 0, 0); fctx.drawImage(patch, 0, 0)
  return final
}

export default function ObjectRemover() {
  const [name, setName] = useState('')
  const [img, setImg] = useState<HTMLCanvasElement | null>(null)
  const [history, setHistory] = useState<HTMLCanvasElement[]>([])
  const [redo, setRedo] = useState<HTMLCanvasElement[]>([])
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [tool, setTool] = useState<'brush' | 'erase'>('brush')
  const [size, setSize] = useState(40)
  const [stage, setStage] = useState('')
  const [hold, setHold] = useState(false)
  const [fmt, setFmt] = useState<OutFmt>('png')
  const [cached, setCached] = useState<boolean | null>(null)
  const view = useRef<HTMLCanvasElement>(null)
  const drawing = useRef<Stroke | null>(null)
  const { busy, progress, error, run, setProgress } = useJob()
  useEffect(() => { import('@/lib/b2/onnx').then((m) => m.isModelCached(LAMA_URL)).then(setCached) }, [])

  const scale = img ? Math.min(1, 1100 / Math.max(img.width, img.height)) : 1
  const maskCanvas = useCallback((full: boolean) => {
    if (!img) return null
    const k = full ? 1 : scale
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
    const ctx = c.getContext('2d')!; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    for (const s of strokes) {
      ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over'
      ctx.strokeStyle = 'rgba(245,165,36,1)'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = s.r * 2 * k
      ctx.beginPath(); s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k))); if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] * k + 0.1, s.pts[0][1] * k); ctx.stroke()
    }
    return c
  }, [img, strokes, scale])

  useEffect(() => {
    const v = view.current; if (!v || !img) return
    v.width = Math.round(img.width * scale); v.height = Math.round(img.height * scale)
    const ctx = v.getContext('2d')!
    ctx.drawImage(hold && history[0] ? history[0] : img, 0, 0, v.width, v.height)
    if (!hold) { const m = maskCanvas(false); if (m) { ctx.globalAlpha = 0.55; ctx.drawImage(m, 0, 0); ctx.globalAlpha = 1 } }
  }, [img, strokes, hold, scale, maskCanvas, history])

  const pt = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => { const r = e.currentTarget.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * img!.width, ((e.clientY - r.top) / r.height) * img!.height] }
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => { if (busy) return; e.currentTarget.setPointerCapture(e.pointerId); const r = (size / 2) * (img!.width / e.currentTarget.clientWidth); drawing.current = { erase: tool === 'erase', r, pts: [pt(e)] }; setStrokes((s) => [...s, drawing.current!]) }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => { if (!drawing.current) return; drawing.current.pts.push(pt(e)); setStrokes((s) => [...s.slice(0, -1), { ...drawing.current! }]) }

  const open = (fs: File[]) => run(async () => { const { canvas } = await decodeAny(fs[0]); setImg(canvas); setName(fs[0].name); setHistory([]); setRedo([]); setStrokes([]) })
  const remove = () => run(async (setP) => {
    if (!img) return
    const m = maskCanvas(true)!
    const out = await inpaint(img, m, (l, t) => setP(t ? (l / t) * 0.9 : 0.5), setStage)
    setHistory((h) => [...h, img]); setRedo([]); setImg(out); setStrokes([]); setStage(''); setProgress(1); setCached(true)
  })
  const undo = () => { if (strokes.length) { setStrokes((s) => s.slice(0, -1)); return } const prev = history[history.length - 1]; if (prev && img) { setRedo((r) => [img, ...r]); setImg(prev); setHistory((h) => h.slice(0, -1)) } }
  const redoFn = () => { const next = redo[0]; if (next && img) { setHistory((h) => [...h, img]); setImg(next); setRedo((r) => r.slice(1)) } }
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redoFn() : undo() } if (e.key === '[') setSize((s) => Math.max(5, s - 5)); if (e.key === ']') setSize((s) => Math.min(200, s + 5)) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })

  if (!img) return <div className="space-y-3"><ImageDrop multiple={false} onFiles={open} label="Drop a photo to erase objects, people or text" /><ErrorNote error={error} /></div>
  return (
    <ToolGrid
      main={<>
        <div className="checker relative grid place-items-center overflow-hidden rounded-2xl border border-border p-2">
          <canvas ref={view} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drawing.current = null)} onPointerCancel={() => (drawing.current = null)} aria-label="Paint over what you want to remove" className="max-h-[70vh] max-w-full cursor-crosshair touch-none" style={{ height: 'auto' }} />
          {history.length > 0 && <button type="button" onPointerDown={() => setHold(true)} onPointerUp={() => setHold(false)} onPointerLeave={() => setHold(false)} className="absolute right-3 top-3 flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-[11px] text-white cursor-pointer select-none"><Eye className="size-3.5" />Hold for original</button>}
        </div>
        <p className="text-center text-xs text-muted">Paint over the object in gold, then press Remove. Repeat for more objects. Shortcuts: [ and ] change brush size, Ctrl+Z undoes.</p>
      </>}
      side={<>
        <Field label="Tool"><Segmented value={tool} onChange={setTool} options={[{ value: 'brush', label: <span className="flex items-center gap-1"><Brush className="size-3.5" />Paint</span> }, { value: 'erase', label: <span className="flex items-center gap-1"><Eraser className="size-3.5" />Unpaint</span> }]} /></Field>
        <Slider label="Brush size" value={size} onChange={setSize} min={5} max={200} suffix=" px" />
        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" variant="outline" icon={<Undo2 className="size-4" />} onClick={undo} disabled={!strokes.length && !history.length} aria-label="Undo" />
          <Button size="sm" variant="outline" icon={<Redo2 className="size-4" />} onClick={redoFn} disabled={!redo.length} aria-label="Redo" />
          <Button size="sm" variant="outline" icon={<Trash2 className="size-4" />} onClick={() => setStrokes([])} disabled={!strokes.length} aria-label="Clear mask" />
        </div>
        {cached === false && <p className="flex gap-2 rounded-xl border border-border bg-surface-2/50 p-3 text-xs text-muted"><Cpu className="size-4 shrink-0 text-accent" />The first removal downloads the LaMa model ({formatBytes(LAMA_SIZE)}). It is cached for next time and runs on your device.</p>}
        {busy && <Progress value={progress} label={stage || 'Working'} />}
        <ErrorNote error={error} />
        <Button size="lg" className="w-full" loading={busy} disabled={!strokes.length} icon={<Wand2 className="size-4" />} onClick={remove}>Remove</Button>
        <Field label="Save as"><Segmented value={fmt} onChange={setFmt} options={[{ value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }, { value: 'webp', label: 'WEBP' }]} /></Field>
        <Button variant="outline" className="w-full" icon={<Download className="size-4" />} disabled={!history.length} onClick={() => run(async () => downloadBlob(await encodeCanvas(img, fmt, { quality: 95 }), name.replace(/\.[^.]+$/, '') + '-cleaned.' + fmt))}>Download result</Button>
        <Button variant="ghost" className="w-full" onClick={() => setImg(null)}>Use another photo</Button>
      </>}
    />
  )
}
