import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScanFace, Square, Circle, Brush, Undo2, Trash2, Download, Info } from 'lucide-react'
import { Button, ErrorNote, Label, Segmented, Slider, ToolGrid, cn, useJob } from '@/components/ui'
import { toast } from '@/components/toast'
import { downloadBlob } from '@/lib/files'
import { ColorInput, ImageDrop, blurCanvas, canvas, decode, exportCanvas, fmtFromMime, hqResize, outName, toCanvas, type Fmt } from './_img/kit'

type Shape = { kind: 'rect' | 'ellipse'; x: number; y: number; w: number; h: number } | { kind: 'brush'; pts: [number, number][]; r: number }
type Effect = 'blur' | 'pixelate' | 'box'
type Tool = 'rect' | 'ellipse' | 'brush'

function effectCanvas(src: HTMLCanvasElement, effect: Effect, intensity: number, color: string) {
  const ref = Math.max(src.width, src.height)
  if (effect === 'blur') return blurCanvas(src, Math.max(2, (intensity / 100) * ref * 0.035))
  if (effect === 'box') { const { canvas: c, ctx } = canvas(src.width, src.height); ctx.fillStyle = color; ctx.fillRect(0, 0, c.width, c.height); return c }
  const block = Math.max(3, (intensity / 100) * ref * 0.05)
  const sw = Math.max(1, Math.round(src.width / block)), sh = Math.max(1, Math.round(src.height / block))
  const small = hqResize(src, sw, sh)
  const { canvas: c, ctx } = canvas(src.width, src.height)
  ctx.imageSmoothingEnabled = false; ctx.drawImage(small, 0, 0, c.width, c.height)
  return c
}
function drawMask(ctx: CanvasRenderingContext2D, shapes: Shape[], s: number) {
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  for (const sh of shapes) {
    if (sh.kind === 'brush') {
      ctx.lineWidth = sh.r * 2 * s; ctx.beginPath()
      sh.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)))
      if (sh.pts.length === 1) ctx.lineTo(sh.pts[0][0] * s + 0.1, sh.pts[0][1] * s)
      ctx.stroke()
    } else if (sh.kind === 'ellipse') { ctx.beginPath(); ctx.ellipse((sh.x + sh.w / 2) * s, (sh.y + sh.h / 2) * s, Math.abs(sh.w / 2) * s, Math.abs(sh.h / 2) * s, 0, 0, Math.PI * 2); ctx.fill() }
    else ctx.fillRect(sh.x * s, sh.y * s, sh.w * s, sh.h * s)
  }
}
function composite(src: HTMLCanvasElement, eff: HTMLCanvasElement, shapes: Shape[], s: number) {
  const { canvas: m, ctx: mctx } = canvas(src.width, src.height)
  drawMask(mctx, shapes, s)
  mctx.globalCompositeOperation = 'source-in'; mctx.drawImage(eff, 0, 0)
  const { canvas: out, ctx } = canvas(src.width, src.height)
  ctx.drawImage(src, 0, 0); ctx.drawImage(m, 0, 0)
  return out
}
const norm = (sh: Shape): Shape => sh.kind === 'brush' ? sh : { ...sh, x: Math.min(sh.x, sh.x + sh.w), y: Math.min(sh.y, sh.y + sh.h), w: Math.abs(sh.w), h: Math.abs(sh.h) }

export default function BlurFaces() {
  const [file, setFile] = useState<File | null>(null)
  const [full, setFull] = useState<HTMLCanvasElement | null>(null)
  const [prev, setPrev] = useState<HTMLCanvasElement | null>(null)
  const [scale, setScale] = useState(1)
  const [shapes, setShapes] = useState<Shape[]>([])
  const [draft, setDraft] = useState<Shape | null>(null)
  const [tool, setTool] = useState<Tool>('ellipse')
  const [effect, setEffect] = useState<Effect>('blur')
  const [intensity, setIntensity] = useState(50)
  const [brush, setBrush] = useState(3)
  const [color, setColor] = useState('#000000')
  const [detecting, setDetecting] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const { busy, error, run } = useJob()
  const view = useRef<HTMLCanvasElement>(null)
  const dragging = useRef(false)
  const hasFD = typeof window !== 'undefined' && 'FaceDetector' in window

  const detect = useCallback(async (c: HTMLCanvasElement) => {
    if (!('FaceDetector' in window)) { setNote('Automatic face detection needs the browser Face Detection API (available in Chrome on Android/macOS, or with chrome://flags "Experimental Web Platform features"). Draw over faces manually with the ellipse, rectangle or brush tools, it only takes a second.'); return }
    setDetecting(true)
    try {
      const fd = new (window as any).FaceDetector({ fastMode: false, maxDetectedFaces: 100 })
      const faces: any[] = await fd.detect(c)
      if (!faces.length) { setNote('No faces detected. Draw over areas manually.'); return }
      setShapes((s) => [...s, ...faces.map((f) => { const b = f.boundingBox; const px = b.width * 0.18, py = b.height * 0.25; return { kind: 'ellipse' as const, x: b.x - px, y: b.y - py, w: b.width + px * 2, h: b.height + py * 1.6 } })])
      setNote(null); toast(`Found ${faces.length} face${faces.length > 1 ? 's' : ''}`)
    } catch (e: any) { setNote(`Face detection failed (${e?.message || e}). Use the manual tools instead.`) }
    finally { setDetecting(false) }
  }, [])

  const onFiles = useCallback(async (fs: File[]) => {
    const img = await decode(fs[0])
    const c = toCanvas(img)
    const s = Math.min(1, 1100 / Math.max(c.width, c.height))
    setFile(fs[0]); setFull(c); setScale(s); setPrev(s < 1 ? hqResize(c, c.width * s, c.height * s) : c); setShapes([])
    detect(c)
  }, [detect])

  const eff = useMemo(() => (prev ? effectCanvas(prev, effect, intensity, color) : null), [prev, effect, intensity, color])

  useEffect(() => {
    const v = view.current; if (!v || !prev || !eff) return
    v.width = prev.width; v.height = prev.height
    const ctx = v.getContext('2d')!
    const all = draft ? [...shapes, norm(draft)] : shapes
    ctx.drawImage(composite(prev, eff, all, scale), 0, 0)
    ctx.save(); ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(245,165,36,.95)'
    for (const sh of all) if (sh.kind !== 'brush') { ctx.beginPath(); if (sh.kind === 'ellipse') ctx.ellipse((sh.x + sh.w / 2) * scale, (sh.y + sh.h / 2) * scale, Math.abs(sh.w / 2) * scale, Math.abs(sh.h / 2) * scale, 0, 0, Math.PI * 2); else ctx.rect(sh.x * scale, sh.y * scale, sh.w * scale, sh.h * scale); ctx.stroke() }
    ctx.restore()
  }, [prev, eff, shapes, draft, scale])

  const pt = (e: React.PointerEvent): [number, number] => { const r = view.current!.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * prev!.width / scale, ((e.clientY - r.top) / r.height) * prev!.height / scale] }
  const brushR = () => (brush / 100) * Math.max(full?.width ?? 1, full?.height ?? 1) * 0.25
  const down = (e: React.PointerEvent) => {
    dragging.current = true; view.current!.setPointerCapture(e.pointerId)
    const [x, y] = pt(e)
    setDraft(tool === 'brush' ? { kind: 'brush', pts: [[x, y]], r: brushR() } : { kind: tool, x, y, w: 0, h: 0 })
  }
  const move = (e: React.PointerEvent) => {
    if (!dragging.current || !draft) return
    const [x, y] = pt(e)
    if (draft.kind === 'brush') setDraft({ ...draft, pts: [...draft.pts, [x, y]] })
    else setDraft({ ...draft, w: x - draft.x, h: y - draft.y })
  }
  const up = () => {
    dragging.current = false
    if (draft) { const n = norm(draft); if (n.kind === 'brush' || (n.w > 3 && n.h > 3)) setShapes((s) => [...s, n]) }
    setDraft(null)
  }

  const exportImg = () => run(async () => {
    if (!full || !file) return
    if (!shapes.length) throw new Error('Mark at least one area to redact first.')
    const out = composite(full, effectCanvas(full, effect, intensity, color), shapes, 1)
    let f: Fmt = fmtFromMime(file.type, file.name); if (!['png', 'jpg', 'webp'].includes(f)) f = 'png'
    downloadBlob(await exportCanvas(out, f, 0.93), outName(file.name, f, '-redacted'))
  })
  const reset = () => { setFile(null); setFull(null); setPrev(null); setShapes([]); setNote(null) }

  if (!file || !prev) return <ImageDrop multiple={false} onFiles={onFiles} label="Drop an image to blur faces or redact areas" />

  return (
    <ToolGrid
      main={<>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Segmented value={tool} onChange={setTool} options={[{ value: 'ellipse', label: <span className="flex items-center gap-1.5"><Circle className="size-3.5" />Ellipse</span> }, { value: 'rect', label: <span className="flex items-center gap-1.5"><Square className="size-3.5" />Rectangle</span> }, { value: 'brush', label: <span className="flex items-center gap-1.5"><Brush className="size-3.5" />Brush</span> }]} />
            <div className="ml-auto flex gap-1">
              <Button size="sm" variant="ghost" icon={<Undo2 className="size-4" />} disabled={!shapes.length} onClick={() => setShapes((s) => s.slice(0, -1))}>Undo</Button>
              <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} disabled={!shapes.length} onClick={() => setShapes([])}>Clear</Button>
            </div>
          </div>
          <div className="checker grid place-items-center overflow-hidden rounded-xl">
            <canvas ref={view} className="max-h-[64vh] max-w-full cursor-crosshair touch-none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
          </div>
          <p className="mt-2 text-center text-[11px] text-muted">{tool === 'brush' ? 'Paint over areas to redact' : 'Drag to mark an area'} · {shapes.length} area{shapes.length === 1 ? '' : 's'} marked</p>
        </div>
        {note && <div className="flex gap-2 rounded-xl border border-border bg-surface-2/60 p-3 text-sm text-muted"><Info className="mt-0.5 size-4 shrink-0 text-accent" />{note}</div>}
      </>}
      side={<>
        <Button variant="outline" className="w-full" loading={detecting} icon={<ScanFace className="size-4" />} onClick={() => full && detect(full)}>{hasFD ? 'Detect faces automatically' : 'Try automatic face detection'}</Button>
        {!hasFD && <p className="-mt-3 text-[11px] text-muted">Your browser doesn't expose face detection, manual tools are ready.</p>}
        <div><Label>Effect</Label><Segmented value={effect} onChange={setEffect} options={[{ value: 'blur', label: 'Blur' }, { value: 'pixelate', label: 'Pixelate' }, { value: 'box', label: 'Solid box' }]} /></div>
        {effect !== 'box' ? <Slider label="Intensity" value={intensity} onChange={setIntensity} min={5} max={100} suffix="%" /> : <div><Label>Box color</Label><ColorInput value={color} onChange={setColor} /></div>}
        {tool === 'brush' && <Slider label="Brush size" value={brush} onChange={setBrush} min={1} max={20} />}
        <div className={cn('rounded-xl bg-surface-2/60 p-3 text-[11px] text-muted')}>Tip: for true privacy use <b>Pixelate</b> at high intensity or <b>Solid box</b>, light blur can sometimes be reversed.</div>
        <ErrorNote error={error} />
        <Button size="lg" className="w-full" loading={busy} disabled={!shapes.length} icon={<Download className="size-4" />} onClick={exportImg}>Download redacted image</Button>
        <Button variant="ghost" className="w-full" onClick={reset}>Start over</Button>
      </>}
    />
  )
}
