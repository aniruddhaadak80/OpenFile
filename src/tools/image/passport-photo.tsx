import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, ScanFace, Wand2, Printer } from 'lucide-react'
import { Button, Field, Label, Progress, Segmented, Select, Slider, Switch, ToolGrid, ErrorNote, useJob } from '@/components/ui'
import { toast } from '@/components/toast'
import { downloadBlob, formatBytes } from '@/lib/files'
import { ColorInput, ImageDrop, canvas, toCanvas, decode } from './_img/kit'
import { encodeCanvas } from '@/lib/b2/codecs'

type Preset = { id: string; label: string; w: number; h: number; head: [number, number]; top: number; unit?: 'mm' }
// Sizes in mm. head = allowed chin-to-crown height range in mm. top = gap above the crown in mm.
const PRESETS: Preset[] = [
  { id: 'us', label: 'United States passport / visa (2×2 in)', w: 50.8, h: 50.8, head: [25.4, 35], top: 6 },
  { id: 'india-visa', label: 'India visa / OCI (2×2 in)', w: 50.8, h: 50.8, head: [25.4, 35], top: 6 },
  { id: 'uk', label: 'United Kingdom passport (35×45 mm)', w: 35, h: 45, head: [29, 34], top: 4 },
  { id: 'eu', label: 'Schengen / EU passport (35×45 mm)', w: 35, h: 45, head: [32, 36], top: 3.5 },
  { id: 'india', label: 'India passport (35×45 mm)', w: 35, h: 45, head: [25, 35], top: 4.5 },
  { id: 'au', label: 'Australia passport (35×45 mm)', w: 35, h: 45, head: [32, 36], top: 3.5 },
  { id: 'ca', label: 'Canada passport (50×70 mm)', w: 50, h: 70, head: [31, 36], top: 10 },
  { id: 'cn', label: 'China passport / visa (33×48 mm)', w: 33, h: 48, head: [28, 33], top: 4 },
  { id: 'jp', label: 'Japan passport (35×45 mm)', w: 35, h: 45, head: [32, 36], top: 4 },
  { id: 'id-30x40', label: 'ID photo (30×40 mm)', w: 30, h: 40, head: [24, 28], top: 4 },
  { id: 'id-25x35', label: 'Small ID photo (25×35 mm)', w: 25, h: 35, head: [20, 24], top: 3.5 },
]
const DPI = 300
const mm = (v: number) => Math.round((v / 25.4) * DPI)
type Sheet = '4x6' | '5x7' | 'a4' | 'letter'
const SHEETS: Record<Sheet, { w: number; h: number; label: string }> = { '4x6': { w: 152.4, h: 101.6, label: '4×6 in' }, '5x7': { w: 177.8, h: 127, label: '5×7 in' }, a4: { w: 210, h: 297, label: 'A4' }, letter: { w: 215.9, h: 279.4, label: 'Letter' } }

/** Estimate crown, chin and face centre from a cut-out mask when no face detector exists. */
function estimateFromMask(c: HTMLCanvasElement) {
  const { width: w, height: h } = c
  const d = c.getContext('2d')!.getImageData(0, 0, w, h).data
  let crown = -1
  for (let y = 0; y < h && crown < 0; y++) for (let x = 0; x < w; x += 2) if (d[(y * w + x) * 4 + 3] > 128) { crown = y; break }
  if (crown < 0) return null
  // widest row in a band below the crown approximates head width; neck is narrower than shoulders
  const rowWidth = (y: number) => { let a = -1, b = -1; for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 128) { if (a < 0) a = x; b = x } return a < 0 ? [0, 0, 0] : [b - a, a, b] }
  let headW = 0, cx = w / 2
  for (let y = crown; y < Math.min(h, crown + h * 0.18); y += 2) { const [rw, a, b] = rowWidth(y); if (rw > headW) { headW = rw; cx = (a + b) / 2 } }
  const chin = crown + headW * 1.32
  return { crown, chin: Math.min(h, chin), cx }
}

export default function PassportPhoto() {
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null)
  const [cut, setCut] = useState<HTMLCanvasElement | null>(null)
  const [preset, setPreset] = useState(PRESETS[0].id)
  const [whiten, setWhiten] = useState(true)
  const [bg, setBg] = useState('#ffffff')
  const [t, setT] = useState({ s: 1, x: 0, y: 0 })
  const [bright, setBright] = useState(0)
  const [guides, setGuides] = useState(true)
  const [sheet, setSheet] = useState<Sheet>('4x6')
  const [stage, setStage] = useState('')
  const { busy, progress, error, run } = useJob()
  const view = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const p = PRESETS.find((x) => x.id === preset)!
  const W = mm(p.w), H = mm(p.h)

  const autoPlace = useCallback((img: HTMLCanvasElement, mask: HTMLCanvasElement | null, pr = p) => {
    const Wp = mm(pr.w), Hp = mm(pr.h)
    const target = mm((pr.head[0] + pr.head[1]) / 2), top = mm(pr.top)
    const place = (crown: number, chin: number, cx: number) => { const s = target / Math.max(1, chin - crown); setT({ s, x: Wp / 2 - cx * s, y: top - crown * s }) }
    const fallback = () => { const s = Math.max(Wp / img.width, Hp / img.height); setT({ s, x: (Wp - img.width * s) / 2, y: (Hp - img.height * s) / 2 }) }
    return (async () => {
      if ('FaceDetector' in window) {
        try {
          const faces: any[] = await new (window as any).FaceDetector({ fastMode: false, maxDetectedFaces: 1 }).detect(img)
          if (faces[0]) { const b = faces[0].boundingBox; const crown = b.y - b.height * 0.42, chin = b.y + b.height * 1.05; place(crown, chin, b.x + b.width / 2); return true }
        } catch { /* fall through */ }
      }
      const est = mask ? estimateFromMask(mask) : null
      if (est) { place(est.crown, est.chin, est.cx); return true }
      fallback(); return false
    })()
  }, [p])

  const open = (files: File[]) => run(async (setP) => {
    const img = toCanvas(await decode(files[0]))
    // keep memory reasonable
    const k = Math.min(1, 2400 / Math.max(img.width, img.height))
    const base = k < 1 ? (() => { const { canvas: c, ctx } = canvas(img.width * k, img.height * k); ctx.drawImage(img, 0, 0, c.width, c.height); return c })() : img
    setSrc(base); setCut(null)
    let mask: HTMLCanvasElement | null = null
    if (whiten) mask = await removeBg(base, setP)
    const ok = await autoPlace(base, mask)
    if (!ok) toast('Could not find the face automatically. Drag and zoom to line up the guides.', 'info')
  })

  const removeBg = async (img: HTMLCanvasElement, setP: (n: number) => void) => {
    setStage('Loading background engine')
    const { removeBackground } = await import('@imgly/background-removal')
    const blob = await new Promise<Blob>((r) => img.toBlob((b) => r(b!), 'image/png'))
    const out = await removeBackground(blob, { model: 'isnet_fp16', device: (navigator as any).gpu ? 'gpu' : 'cpu', output: { format: 'image/png' }, progress: (key: string, cur: number, total: number) => { const f = total ? cur / total : 0; if (key.startsWith('fetch')) { setStage(`Downloading model (first run only) ${formatBytes(cur)}`); setP(f * 0.8) } else { setStage('Removing background'); setP(0.8 + f * 0.2) } } } as any)
    const c = toCanvas(await decode(out)); setCut(c); setStage(''); return c
  }

  const render = useCallback((w: number, h: number, withGuides: boolean) => {
    const { canvas: c, ctx } = canvas(w, h)
    const k = w / W
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h)
    const img = whiten && cut ? cut : src
    if (img) {
      if (bright) ctx.filter = `brightness(${100 + bright}%)`
      ctx.drawImage(img, t.x * k, t.y * k, img.width * t.s * k, img.height * t.s * k)
      ctx.filter = 'none'
    }
    if (withGuides) {
      const top = mm(p.top) * k, hmin = mm(p.head[0]) * k, hmax = mm(p.head[1]) * k
      ctx.lineWidth = Math.max(1, w / 300)
      ctx.strokeStyle = 'rgba(245,165,36,.95)'; ctx.setLineDash([6, 5])
      ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(w, top); ctx.stroke()
      ctx.strokeStyle = 'rgba(45,212,191,.95)'
      ctx.beginPath(); ctx.moveTo(0, top + hmin); ctx.lineTo(w, top + hmin); ctx.moveTo(0, top + hmax); ctx.lineTo(w, top + hmax); ctx.stroke()
      ctx.setLineDash([]); ctx.strokeStyle = 'rgba(245,165,36,.6)'
      const mid = (hmin + hmax) / 2
      ctx.beginPath(); ctx.ellipse(w / 2, top + mid / 2, mid * 0.37, mid / 2, 0, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke()
    }
    return c
  }, [W, bg, bright, cut, p, src, t, whiten])

  useEffect(() => {
    const v = view.current; if (!v || !src) return
    const dw = Math.min(420, v.parentElement!.clientWidth), dh = dw * (H / W)
    const r = render(dw * 2, dh * 2, guides)
    v.width = r.width; v.height = r.height; v.style.width = dw + 'px'; v.style.height = dh + 'px'
    v.getContext('2d')!.drawImage(r, 0, 0)
  }, [render, guides, src, W, H])

  const changePreset = (id: string) => { setPreset(id); const np = PRESETS.find((x) => x.id === id)!; if (src) autoPlace(src, cut, np) }
  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const k = W / e.currentTarget.clientWidth
    if (e.type === 'pointerdown') { drag.current = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y }; e.currentTarget.setPointerCapture(e.pointerId) }
    else if (e.type === 'pointermove' && drag.current) { const d = drag.current; setT((o) => ({ ...o, x: d.tx + (e.clientX - d.x) * k, y: d.ty + (e.clientY - d.y) * k })) }
    else drag.current = null
  }
  const zoom = (f: number) => setT((o) => { const cx = W / 2, cy = H / 2; return { s: o.s * f, x: cx - (cx - o.x) * f, y: cy - (cy - o.y) * f } })
  const nudge = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 20 : 4
    if (e.key === 'ArrowLeft') setT((o) => ({ ...o, x: o.x - step })); else if (e.key === 'ArrowRight') setT((o) => ({ ...o, x: o.x + step }))
    else if (e.key === 'ArrowUp') setT((o) => ({ ...o, y: o.y - step })); else if (e.key === 'ArrowDown') setT((o) => ({ ...o, y: o.y + step }))
    else if (e.key === '+' || e.key === '=') zoom(1.03); else if (e.key === '-') zoom(1 / 1.03); else return
    e.preventDefault()
  }

  const saveSingle = () => run(async () => { const blob = await encodeCanvas(render(W, H, false), 'jpg', { quality: 95 }); downloadBlob(blob, `passport-${p.id}-${p.w}x${p.h}mm.jpg`) })
  const saveSheet = (asPdf: boolean) => run(async () => {
    const sh = SHEETS[sheet]
    const landscape = sheet === '4x6' || sheet === '5x7'
    const SW = mm(sh.w), SH = mm(sh.h), gap = mm(2), margin = mm(4)
    const cols = Math.max(1, Math.floor((SW - margin * 2 + gap) / (W + gap))), rows = Math.max(1, Math.floor((SH - margin * 2 + gap) / (H + gap)))
    const photo = render(W, H, false)
    const { canvas: c, ctx } = canvas(SW, SH)
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, SW, SH)
    const ox = (SW - (cols * W + (cols - 1) * gap)) / 2, oy = (SH - (rows * H + (rows - 1) * gap)) / 2
    ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) { const x = ox + q * (W + gap), y = oy + r * (H + gap); ctx.drawImage(photo, x, y); ctx.strokeRect(x - 0.5, y - 0.5, W + 1, H + 1) }
    if (asPdf) {
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ unit: 'mm', format: [sh.w, sh.h], orientation: landscape ? 'landscape' : 'portrait' })
      pdf.addImage(c.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, sh.w, sh.h)
      downloadBlob(pdf.output('blob'), `passport-sheet-${sheet}.pdf`)
    } else downloadBlob(await encodeCanvas(c, 'jpg', { quality: 95 }), `passport-sheet-${sheet}.jpg`)
    toast(`${cols * rows} photos on one ${sh.label} sheet`, 'success')
  })

  if (!src) return (
    <div className="space-y-4">
      <ImageDrop multiple={false} onFiles={open} label="Drop a photo of your face" sub="Face the camera, even light, plain background if possible. Nothing is uploaded." />
      <div className="flex justify-center"><Switch checked={whiten} onChange={setWhiten} label="Replace the background (AI, runs on your device)" /></div>
      {busy && <Progress value={progress} label={stage || 'Preparing'} />}
      <ErrorNote error={error} />
    </div>
  )
  return (
    <ToolGrid
      main={<div className="space-y-3">
        <div className="grid place-items-center rounded-2xl border border-border bg-surface-2/40 p-4">
          <canvas ref={view} tabIndex={0} aria-label="Photo position. Drag or use arrow keys, plus and minus to zoom." onKeyDown={nudge}
            onPointerDown={onPointer} onPointerMove={onPointer} onPointerUp={onPointer} onPointerCancel={onPointer}
            onWheel={(e) => zoom(e.deltaY < 0 ? 1.03 : 1 / 1.03)} className="cursor-move touch-none rounded-md shadow-lg outline-none focus-visible:ring-4 focus-visible:ring-accent/30" />
        </div>
        <p className="text-center text-xs text-muted">Drag to move, scroll or use the slider to zoom. Put the top of the head on the gold line and the chin between the two teal lines.</p>
        {busy && <Progress value={progress} label={stage || 'Working'} />}
      </div>}
      side={<>
        <Field label="Document"><Select value={preset} onChange={changePreset} options={PRESETS.map((x) => ({ value: x.id, label: x.label }))} /></Field>
        <Slider label="Zoom" value={Math.round(t.s * 1000) / 10} onChange={(v) => zoom(v / 100 / t.s)} min={5} max={400} step={0.5} suffix="%" />
        <Slider label="Brightness" value={bright} onChange={setBright} min={-30} max={30} suffix="%" />
        <Switch checked={whiten} onChange={(v) => { setWhiten(v); if (v && !cut && src) run((sp) => removeBg(src, sp)) }} label="Replace background" />
        {whiten && <div><Label>Background colour</Label><ColorInput value={bg} onChange={setBg} /><div className="mt-2 flex gap-1.5">{['#ffffff', '#f2f2f2', '#dbe9f7', '#e8e8e8'].map((c) => <button key={c} onClick={() => setBg(c)} aria-label={`Background ${c}`} className="size-7 rounded-md border border-border cursor-pointer" style={{ background: c }} />)}</div></div>}
        <Switch checked={guides} onChange={setGuides} label="Show guides" />
        <Button variant="outline" className="w-full" icon={<ScanFace className="size-4" />} onClick={() => autoPlace(src, cut).then((ok) => !ok && toast('Face not found. Line it up by hand.', 'info'))}>Auto-position again</Button>
        <ErrorNote error={error} />
        <Button size="lg" className="w-full" loading={busy} icon={<Download className="size-4" />} onClick={saveSingle}>Download photo ({p.w}×{p.h} mm)</Button>
        <div>
          <Label>Print sheet</Label>
          <Segmented value={sheet} onChange={setSheet} options={Object.entries(SHEETS).map(([k, v]) => ({ value: k as Sheet, label: v.label }))} />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="outline" icon={<Printer className="size-4" />} onClick={() => saveSheet(false)} disabled={busy}>JPG sheet</Button>
            <Button variant="outline" icon={<Wand2 className="size-4" />} onClick={() => saveSheet(true)} disabled={busy}>PDF sheet</Button>
          </div>
          <p className="mt-2 text-[11px] text-muted">Print at 100% (no fit to page). Photos are 300 DPI.</p>
        </div>
        <Button variant="ghost" className="w-full" onClick={() => { setSrc(null); setCut(null) }}>Start over</Button>
      </>}
    />
  )
}
