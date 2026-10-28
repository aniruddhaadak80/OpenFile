import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MousePointer2, Brush, Eraser, Type, Shapes, Crop, Undo2, Redo2, Eye, EyeOff, Lock, Unlock, Plus, ImagePlus, Copy, Trash2, ArrowUp, ArrowDown,
  Layers as LayersIcon, Download, FileJson, FolderOpen, FlipHorizontal2, FlipVertical2, Crosshair, Merge, Square, Circle, Triangle, Minus, ZoomIn, ZoomOut, Maximize2, Image as ImageIcon, SlidersHorizontal, Check, X,
} from 'lucide-react'
import { Button, Dropzone, Field, Input, Label, Progress, Segmented, Select, Slider, Switch, Tabs, Textarea, ToolGrid, ErrorNote, cn, useJob } from '@/components/ui'
import { toast } from '@/components/toast'
import { downloadBlob } from '@/lib/files'
import { ColorInput, FONT_CHOICES, blurCanvas, ensureFont, unsharp } from './_img/kit'
import { decodeAny, encodeCanvas, type OutFmt } from '@/lib/b2/codecs'
import {
  BLENDS, NO_FILTERS, PSD_BLEND, applyTransform, baseLayer, drawContent, blendFromPsd, bounds, colorFilter, contains, corners, cropDoc, fontString, hitTest, isNoFilter, measureText, moveLayer, normRect,
  parseProject, rasterize, renderDoc, toDoc, toLocal, toProject, uid, type Blend, type Doc, type Filters, type Layer, type RasterLayer, type ShapeKind, type ShapeLayer, type TextLayer,
} from '@/lib/b2/layers'

type Bmp = HTMLCanvasElement
type D = Doc<Bmp>
type L = Layer<Bmp>
type Tool = 'move' | 'brush' | 'eraser' | 'text' | 'shape' | 'crop'
type Drag =
  | { mode: 'move'; id: string; sx: number; sy: number; ox: number; oy: number; began: boolean }
  | { mode: 'scale'; id: string; l0: L; free: boolean; v0: [number, number] }
  | { mode: 'rotate'; id: string; l0: L; a0: number }
  | { mode: 'paint'; id: string; bmp: Bmp; last: [number, number]; erase: boolean }
  | { mode: 'shape' | 'crop'; x0: number; y0: number; x1: number; y1: number }

const SIZES = [
  { id: '1080x1080', label: 'Square 1080 × 1080', w: 1080, h: 1080 },
  { id: '1920x1080', label: 'Landscape 1920 × 1080', w: 1920, h: 1080 },
  { id: '1080x1920', label: 'Story 1080 × 1920', w: 1080, h: 1920 },
  { id: '1200x630', label: 'Link preview 1200 × 630', w: 1200, h: 630 },
  { id: '2480x3508', label: 'A4 at 300 DPI', w: 2480, h: 3508 },
  { id: 'custom', label: 'Custom size', w: 0, h: 0 },
]
const TOOLS: { id: Tool; label: string; key: string; icon: React.ReactNode }[] = [
  { id: 'move', label: 'Move and transform', key: 'V', icon: <MousePointer2 className="size-4" /> },
  { id: 'brush', label: 'Brush', key: 'B', icon: <Brush className="size-4" /> },
  { id: 'eraser', label: 'Eraser', key: 'E', icon: <Eraser className="size-4" /> },
  { id: 'text', label: 'Text', key: 'T', icon: <Type className="size-4" /> },
  { id: 'shape', label: 'Shape', key: 'U', icon: <Shapes className="size-4" /> },
  { id: 'crop', label: 'Crop', key: 'C', icon: <Crop className="size-4" /> },
]
const MAX_RENDER = 4096
const HISTORY = 40

const newCanvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c }
const cloneCanvas = (src: Bmp) => { const c = newCanvas(src.width, src.height); c.getContext('2d')!.drawImage(src, 0, 0); return c }
let _mctx: CanvasRenderingContext2D | null = null
const mctx = () => (_mctx ??= newCanvas(1, 1).getContext('2d')!)
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
const loadUrl = (src: string) => new Promise<Bmp>((res, rej) => { const im = new Image(); im.onload = () => { const c = newCanvas(im.naturalWidth, im.naturalHeight); c.getContext('2d')!.drawImage(im, 0, 0); res(c) }; im.onerror = () => rej(new Error('A layer image in the project could not be read.')); im.src = src })

function rasterFrom(name: string, bmp: Bmp, doc: { w: number; h: number }, fitToDoc = true): RasterLayer<Bmp> {
  const k = fitToDoc ? Math.min(1, doc.w / bmp.width, doc.h / bmp.height) : 1
  return { ...baseLayer(name, doc.w / 2, doc.h / 2, bmp.width, bmp.height), sx: k, sy: k, kind: 'raster', bmp }
}
function textLayer(x: number, y: number, size: number, color: string, font: string): TextLayer {
  const t = { text: 'Your text', font, size, weight: 700, italic: false, color, align: 'center' as const, lineHeight: 1.2, stroke: 0, strokeColor: '#000000' }
  const m = measureText(mctx(), t)
  return { ...baseLayer('Text', x, y, m.w, m.h), kind: 'text', ...t }
}
function applyFilters(src: Bmp, f: Filters): Bmp {
  let c = f.blur > 0 ? blurCanvas(src, f.blur) : cloneCanvas(src)
  const ctx = c.getContext('2d')!, id = ctx.getImageData(0, 0, c.width, c.height)
  colorFilter(id.data, f); ctx.putImageData(id, 0, 0)
  if (f.sharpen > 0) c = unsharp(c, f.sharpen / 40, 1, 1)
  return c
}

/* ------------------------------------------------------------------ */

function LayerThumb({ layer }: { layer: L }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d')!; ctx.clearRect(0, 0, 36, 36)
    const b = bounds(layer), k = Math.min(32 / Math.max(1, b.w), 32 / Math.max(1, b.h))
    ctx.save(); ctx.translate(18 - (b.x + b.w / 2) * k, 18 - (b.y + b.h / 2) * k); ctx.scale(k, k)
    applyTransform(ctx, layer); drawContent(ctx, layer)
    ctx.restore()
  }, [layer])
  return <canvas ref={ref} width={36} height={36} className="checker size-9 shrink-0 rounded-md border border-border" aria-hidden="true" />
}

export default function LayerEditor() {
  const [doc, setDoc] = useState<D | null>(null)
  const docRef = useRef<D | null>(null); docRef.current = doc
  const [past, setPast] = useState<D[]>([])
  const [future, setFuture] = useState<D[]>([])
  const lastKey = useRef<{ k: string; t: number } | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('move')
  const [panel, setPanel] = useState<'layers' | 'props' | 'export'>('layers')
  const [brush, setBrush] = useState({ size: 24, color: '#F5A524', soft: 0 })
  const [shape, setShape] = useState<{ kind: ShapeKind; fill: string; noFill: boolean; stroke: string; strokeWidth: number; radius: number }>({ kind: 'rect', fill: '#14B8A6', noFill: false, stroke: '#000000', strokeWidth: 0, radius: 0 })
  const [textDefaults, setTextDefaults] = useState({ color: '#FFFFFF', font: 'Inter' })
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [filterPreview, setFilterPreview] = useState<{ id: string; bmp: Bmp } | null>(null)
  const [zoom, setZoom] = useState<number | 'fit'>('fit')
  const [box, setBox] = useState({ w: 800, h: 600 })
  const [fmt, setFmt] = useState<OutFmt>('png')
  const [quality, setQuality] = useState(92)
  const [fileName, setFileName] = useState('design')
  const [newSize, setNewSize] = useState({ preset: '1080x1080', w: 1080, h: 1080, bg: '#FFFFFF', transparent: false })
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })
  const { busy, progress, error, run, setError } = useJob()

  const wrap = useRef<HTMLDivElement>(null)
  const main = useRef<HTMLCanvasElement>(null)
  const over = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const addInput = useRef<HTMLInputElement>(null)
  const drag = useRef<Drag | null>(null)
  const hover = useRef<[number, number] | null>(null)

  const selLayer = doc?.layers.find((l) => l.id === sel) ?? null

  /* ---------- history ---------- */
  const commit = useCallback((next: D, key?: string) => {
    const cur = docRef.current, now = Date.now()
    const coalesce = key && lastKey.current && lastKey.current.k === key && now - lastKey.current.t < 900
    lastKey.current = key ? { k: key, t: now } : null
    if (cur && !coalesce) { setPast((p) => [...p.slice(-HISTORY + 1), cur]); setFuture([]) }
    docRef.current = next; setDoc(next)
  }, [])
  const begin = () => { const cur = docRef.current; if (cur) { setPast((p) => [...p.slice(-HISTORY + 1), cur]); setFuture([]) }; lastKey.current = null }
  const live = (next: D) => { docRef.current = next; setDoc(next) }
  const undo = () => { if (!past.length || !doc) return; setFuture((f) => [doc, ...f]); const prev = past[past.length - 1]; setPast((p) => p.slice(0, -1)); live(prev); lastKey.current = null }
  const redo = () => { if (!future.length || !doc) return; setPast((p) => [...p, doc]); const next = future[0]; setFuture((f) => f.slice(1)); live(next); lastKey.current = null }
  const patch = (id: string, p: Partial<L>, key?: string, liveOnly = false) => {
    const d = docRef.current; if (!d) return
    const next = { ...d, layers: d.layers.map((l) => (l.id === id ? ({ ...l, ...p } as L) : l)) }
    liveOnly ? live(next) : commit(next, key)
  }
  const patchText = (id: string, p: Partial<TextLayer>, key?: string) => {
    const d = docRef.current; const l = d?.layers.find((x) => x.id === id); if (!l || l.kind !== 'text') return
    const m = { ...l, ...p }; const s = measureText(mctx(), m)
    patch(id, { ...p, w: s.w, h: s.h } as Partial<L>, key)
    if (p.font) ensureFont(p.font).then(() => remeasure(id)).catch(() => toast('Could not load that font. A fallback font is used.', 'error'))
  }
  const remeasure = (id: string) => { const cur = docRef.current?.layers.find((x) => x.id === id); if (cur && cur.kind === 'text') { const s2 = measureText(mctx(), cur); patch(id, { w: s2.w, h: s2.h }, undefined, true) } }

  /* ---------- open / new ---------- */
  const startBlank = () => {
    const w = Math.round(newSize.w), h = Math.round(newSize.h)
    if (!(w >= 1 && h >= 1 && w <= 16384 && h <= 16384)) { setError('Pick a width and height between 1 and 16384 pixels.'); return }
    setPast([]); setFuture([]); setSel(null)
    live({ w, h, bg: newSize.transparent ? 'transparent' : newSize.bg, layers: [] })
  }
  const loadPsd = async (f: File, base: D | null): Promise<D> => {
    const { readPsd } = await import('ag-psd')
    const psd = readPsd(await f.arrayBuffer(), { skipThumbnail: true })
    const d: D = base ?? { w: psd.width, h: psd.height, bg: 'transparent', layers: [] }
    const out: L[] = []
    const walk = (nodes: any[] | undefined, hidden: boolean) => {
      for (const n of nodes ?? []) {
        if (n.children) { walk(n.children, hidden || !!n.hidden); continue }
        if (!n.canvas || !n.canvas.width || !n.canvas.height) continue
        const c = n.canvas as Bmp, left = n.left ?? 0, top = n.top ?? 0
        out.push({ ...baseLayer(n.name || 'Layer', left + c.width / 2, top + c.height / 2, c.width, c.height), opacity: n.opacity ?? 1, blend: blendFromPsd(n.blendMode), visible: !(hidden || n.hidden), kind: 'raster', bmp: c })
      }
    }
    walk(psd.children, false)
    if (!out.length && psd.canvas) out.push(rasterFrom(f.name, psd.canvas as Bmp, d, false))
    if (!out.length) throw new Error('This PSD has no readable layers.')
    return { ...d, layers: [...d.layers, ...out] }
  }
  const loadProject = async (f: File): Promise<D> => {
    let j: any
    try { j = JSON.parse(await f.text()) } catch { throw new Error('This file is not valid JSON.') }
    const p = parseProject(j)
    const layers: L[] = []
    for (const l of p.layers) {
      if (l.kind === 'raster') { const { src, ...rest } = l as any; layers.push({ ...rest, bmp: await loadUrl(src) }) }
      else layers.push(l as L)
    }
    for (const l of layers) if (l.kind === 'text' && !['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Verdana'].includes(l.font)) ensureFont(l.font).then(() => setDoc((d) => (d ? { ...d } : d))).catch(() => {})
    return { w: p.w, h: p.h, bg: p.bg, layers }
  }
  const addFiles = (fs: File[]) => run(async (setP) => {
    let d = docRef.current
    let first: string | null = null
    for (let i = 0; i < fs.length; i++) {
      const f = fs[i], low = f.name.toLowerCase()
      setP(i / fs.length)
      if (low.endsWith('.json')) {
        if (d && d.layers.length && !confirm('Open this project and replace the current one?')) continue
        d = await loadProject(f); setPast([]); setFuture([]); first = d.layers.at(-1)?.id ?? null; live(d); setFileName(f.name.replace(/\.[^.]+$/, '')); continue
      }
      if (low.endsWith('.psd') || low.endsWith('.psb')) { const nd = await loadPsd(f, d); if (!d) { setPast([]); setFuture([]); live(nd) } else commit(nd); d = nd; first = nd.layers.at(-1)!.id; if (!fileName || fileName === 'design') setFileName(f.name.replace(/\.[^.]+$/, '')); continue }
      const { canvas } = await decodeAny(f)
      if (!d) { d = { w: canvas.width, h: canvas.height, bg: 'transparent', layers: [] }; setPast([]); setFuture([]); setFileName(f.name.replace(/\.[^.]+$/, '') + '-edited') }
      const l = rasterFrom(f.name.replace(/\.[^.]+$/, ''), canvas, d)
      const nd = { ...d, layers: [...d.layers, l] }
      if (docRef.current) commit(nd); else live(nd)
      d = nd; first = l.id
    }
    if (first) { setSel(first); setTool('move') }
    setP(1)
  })

  /* ---------- view size ---------- */
  useEffect(() => {
    const el = wrap.current; if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth - 16, h: Math.max(240, Math.min(window.innerHeight * 0.68, 900)) }))
    ro.observe(el); return () => ro.disconnect()
  }, [!!doc])
  const fitZ = doc ? Math.min(box.w / doc.w, box.h / doc.h, 1) : 1
  const z = zoom === 'fit' ? fitZ : zoom
  const cssW = doc ? Math.max(1, Math.round(doc.w * z)) : 0, cssH = doc ? Math.max(1, Math.round(doc.h * z)) : 0
  useEffect(() => { if (doc) setCanvasSize({ w: doc.w, h: doc.h }) }, [doc?.w, doc?.h])

  /* ---------- rendering ---------- */
  const drawMain = useCallback(() => {
    const d = docRef.current, c = main.current; if (!d || !c) return
    const k = Math.min(1, MAX_RENDER / Math.max(d.w, d.h))
    const W = Math.round(d.w * k), H = Math.round(d.h * k)
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H }
    renderDoc(c.getContext('2d')!, d, { k, override: filterPreview ?? undefined })
  }, [filterPreview])
  const drawOverlay = useCallback(() => {
    const d = docRef.current, c = over.current; if (!d || !c) return
    const dpr = window.devicePixelRatio || 1
    const W = Math.round(cssW * dpr), H = Math.round(cssH * dpr)
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H }
    const ctx = c.getContext('2d')!; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H)
    const s = z * dpr
    const dr = drag.current
    // crop rectangle
    const cr = dr && dr.mode === 'crop' ? normRect(dr.x0, dr.y0, dr.x1, dr.y1, d.w, d.h) : tool === 'crop' ? cropRect : null
    if (cr) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H); ctx.clearRect(cr.x * s, cr.y * s, cr.w * s, cr.h * s)
      ctx.strokeStyle = '#F5A524'; ctx.lineWidth = 2 * dpr; ctx.setLineDash([6 * dpr, 4 * dpr]); ctx.strokeRect(cr.x * s, cr.y * s, cr.w * s, cr.h * s); ctx.setLineDash([])
      ctx.fillStyle = '#F5A524'; ctx.font = `${12 * dpr}px sans-serif`; ctx.fillText(`${Math.round(cr.w)} × ${Math.round(cr.h)}`, cr.x * s + 6 * dpr, cr.y * s + 16 * dpr)
    }
    if (dr && dr.mode === 'shape') { const r = normRect(dr.x0, dr.y0, dr.x1, dr.y1, Infinity, Infinity); ctx.strokeStyle = '#22D3EE'; ctx.lineWidth = 1.5 * dpr; ctx.setLineDash([5 * dpr, 4 * dpr]); ctx.strokeRect(dr.x0 < dr.x1 ? dr.x0 * s : dr.x1 * s, dr.y0 < dr.y1 ? dr.y0 * s : dr.y1 * s, r.w * s, r.h * s); ctx.setLineDash([]) }
    // selection handles
    const l = d.layers.find((x) => x.id === sel)
    if (l && l.visible && tool === 'move') {
      const cs = corners(l).map(([x, y]) => [x * s, y * s] as [number, number])
      ctx.strokeStyle = '#F5A524'; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); cs.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke()
      if (!l.locked) {
        const hs = 9 * dpr
        ctx.fillStyle = '#ffffff'
        for (const [x, y] of cs) { ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs); ctx.strokeRect(x - hs / 2, y - hs / 2, hs, hs) }
        const rp = rotHandle(l).map((v) => v * s)
        const tm = toDoc(l, l.w / 2, 0).map((v) => v * s)
        ctx.beginPath(); ctx.moveTo(tm[0], tm[1]); ctx.lineTo(rp[0], rp[1]); ctx.stroke()
        ctx.beginPath(); ctx.arc(rp[0], rp[1], 5.5 * dpr, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      }
    }
    // brush cursor
    if ((tool === 'brush' || tool === 'eraser') && hover.current) {
      const [hx, hy] = hover.current
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1 * dpr; ctx.beginPath(); ctx.arc(hx * s, hy * s, Math.max(1, (brush.size / 2) * s), 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(hx * s, hy * s, Math.max(1, (brush.size / 2) * s) + dpr, 0, Math.PI * 2); ctx.stroke()
    }
  }, [cssW, cssH, z, sel, tool, cropRect, brush.size])
  // rotation handle sits above the top edge, a fixed distance on screen
  const rotHandle = (l: L): [number, number] => {
    const [tx, ty] = toDoc(l, l.w / 2, 0), [cx, cy] = [l.x, l.y]
    let vx = tx - cx, vy = ty - cy; const len = Math.hypot(vx, vy) || 1; vx /= len; vy /= len
    if (!isFinite(vx)) { vx = 0; vy = -1 }
    const off = 26 / (z || 1)
    return [tx + vx * off, ty + vy * off]
  }
  useEffect(() => { drawMain() }, [doc, drawMain])
  useEffect(() => { drawOverlay() }, [doc, drawOverlay])

  /* ---------- filters live preview ---------- */
  useEffect(() => {
    if (!selLayer || selLayer.kind !== 'raster' || isNoFilter(filters)) { setFilterPreview(null); return }
    const t = setTimeout(() => setFilterPreview({ id: selLayer.id, bmp: applyFilters(selLayer.bmp, filters) }), 140)
    return () => clearTimeout(t)
  }, [filters, selLayer?.id, selLayer && selLayer.kind === 'raster' ? selLayer.bmp : null])
  useEffect(() => { setFilters(NO_FILTERS) }, [sel])
  const applyFilterNow = () => { if (!filterPreview || !selLayer || selLayer.kind !== 'raster') return; patch(selLayer.id, { bmp: filterPreview.bmp } as Partial<L>); setFilters(NO_FILTERS); setFilterPreview(null); toast('Filters applied', 'success') }

  /* ---------- pointer ---------- */
  const docPt = (e: React.PointerEvent): [number, number] => { const r = over.current!.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * doc!.w, ((e.clientY - r.top) / r.height) * doc!.h] }
  const paintSeg = (dr: Extract<Drag, { mode: 'paint' }>, to: [number, number]) => {
    const l = docRef.current!.layers.find((x) => x.id === dr.id); if (!l) return
    const a = dr.last, b = toLocal(l, to[0], to[1])
    const ctx = dr.bmp.getContext('2d')!
    const sc = Math.max(0.01, (Math.abs(l.sx) + Math.abs(l.sy)) / 2)
    ctx.save(); ctx.globalCompositeOperation = dr.erase ? 'destination-out' : 'source-over'
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = brush.size / sc; ctx.strokeStyle = brush.color
    if (brush.soft > 0) { ctx.shadowColor = dr.erase ? '#000' : brush.color; ctx.shadowBlur = (brush.size / sc) * (brush.soft / 100) }
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0] + (a[0] === b[0] && a[1] === b[1] ? 0.01 : 0), b[1]); ctx.stroke(); ctx.restore()
    dr.last = b
    drawMain()
  }
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!doc || busy) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = docPt(e)
    if (tool === 'move') {
      const l = selLayer
      if (l && l.visible && !l.locked) {
        const tol = 9 / z
        const rp = rotHandle(l)
        if (Math.hypot(p[0] - rp[0], p[1] - rp[1]) < tol) { begin(); drag.current = { mode: 'rotate', id: l.id, l0: l, a0: Math.atan2(p[1] - l.y, p[0] - l.x) }; return }
        if (corners(l).some(([x, y]) => Math.hypot(p[0] - x, p[1] - y) < tol)) {
          begin()
          const r = -l.rot * Math.PI / 180, dx = p[0] - l.x, dy = p[1] - l.y
          drag.current = { mode: 'scale', id: l.id, l0: l, free: e.shiftKey, v0: [dx * Math.cos(r) - dy * Math.sin(r), dx * Math.sin(r) + dy * Math.cos(r)] }; return
        }
      }
      const hit = l && l.visible && !l.locked && contains(l, p[0], p[1]) ? l : hitTest(doc, p[0], p[1])
      if (hit) { setSel(hit.id); drag.current = { mode: 'move', id: hit.id, sx: p[0], sy: p[1], ox: hit.x, oy: hit.y, began: false } }
      else setSel(null)
      return
    }
    if (tool === 'brush' || tool === 'eraser') {
      let d = doc, target = selLayer
      if (!target || !target.visible || target.locked || target.kind !== 'raster') {
        if (tool === 'eraser' && target && target.visible && !target.locked && target.kind !== 'raster') {
          const r = rasterize(target); begin(); d = { ...d, layers: d.layers.map((x) => (x.id === target!.id ? r : x)) }; live(d); target = r
          toast('The layer was turned into pixels so it can be erased.', 'info')
        } else if (tool === 'eraser') { toast('Pick an image or paint layer to erase.', 'info'); return }
        else {
          const nl: RasterLayer<Bmp> = { ...baseLayer('Paint', d.w / 2, d.h / 2, d.w, d.h), kind: 'raster', bmp: newCanvas(d.w, d.h) }
          const idx = target ? d.layers.findIndex((x) => x.id === target!.id) + 1 : d.layers.length
          const layers = d.layers.slice(); layers.splice(idx, 0, nl); begin(); d = { ...d, layers }; live(d); setSel(nl.id); target = nl
        }
      } else begin()
      const bmp = cloneCanvas((target as RasterLayer<Bmp>).bmp)
      const id = target.id
      d = { ...d, layers: d.layers.map((x) => (x.id === id ? ({ ...x, bmp } as L) : x)) }; live(d)
      const dr: Drag = { mode: 'paint', id, bmp, last: toLocal(target, p[0], p[1]), erase: tool === 'eraser' }
      drag.current = dr; paintSeg(dr, p)
      return
    }
    if (tool === 'text') {
      const t = textLayer(p[0], p[1], Math.max(16, Math.round(Math.min(doc.w, doc.h) / 12)), textDefaults.color, textDefaults.font)
      commit({ ...doc, layers: [...doc.layers, t] }); setSel(t.id); setTool('move'); setPanel('props')
      ensureFont(textDefaults.font).then(() => remeasure(t.id)).catch(() => {})
      setTimeout(() => { textRef.current?.focus(); textRef.current?.select() }, 50)
      return
    }
    if (tool === 'shape' || tool === 'crop') { drag.current = { mode: tool, x0: p[0], y0: p[1], x1: p[0], y1: p[1] }; if (tool === 'crop') setCropRect(null) }
  }
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!doc) return
    const p = docPt(e); hover.current = p
    const dr = drag.current
    if (!dr) { if (tool === 'brush' || tool === 'eraser') drawOverlay(); return }
    if (dr.mode === 'move') {
      const dx = p[0] - dr.sx, dy = p[1] - dr.sy
      if (!dr.began) { if (Math.hypot(dx, dy) * z < 2) return; begin(); dr.began = true }
      let nx = dr.ox + dx, ny = dr.oy + dy
      // snap the centre to the canvas centre lines
      if (!e.altKey) { const t = 6 / z; if (Math.abs(nx - doc.w / 2) < t) nx = doc.w / 2; if (Math.abs(ny - doc.h / 2) < t) ny = doc.h / 2 }
      patch(dr.id, { x: Math.round(nx * 10) / 10, y: Math.round(ny * 10) / 10 }, undefined, true)
    } else if (dr.mode === 'scale') {
      const l0 = dr.l0, r = -l0.rot * Math.PI / 180, dx = p[0] - l0.x, dy = p[1] - l0.y
      const v: [number, number] = [dx * Math.cos(r) - dy * Math.sin(r), dx * Math.sin(r) + dy * Math.cos(r)]
      if (dr.free || e.shiftKey) {
        const kx = Math.abs(dr.v0[0]) > 1 ? v[0] / dr.v0[0] : 1, ky = Math.abs(dr.v0[1]) > 1 ? v[1] / dr.v0[1] : 1
        patch(dr.id, { sx: l0.sx * (Math.abs(kx) < 0.01 ? 0.01 : kx), sy: l0.sy * (Math.abs(ky) < 0.01 ? 0.01 : ky) }, undefined, true)
      } else {
        const k = Math.max(0.01, Math.hypot(...v) / Math.max(1e-6, Math.hypot(...dr.v0)))
        patch(dr.id, { sx: l0.sx * k, sy: l0.sy * k }, undefined, true)
      }
    } else if (dr.mode === 'rotate') {
      let a = dr.l0.rot + ((Math.atan2(p[1] - dr.l0.y, p[0] - dr.l0.x) - dr.a0) * 180) / Math.PI
      a = ((a % 360) + 540) % 360 - 180
      if (e.shiftKey) a = Math.round(a / 15) * 15
      patch(dr.id, { rot: Math.round(a * 10) / 10 }, undefined, true)
    } else if (dr.mode === 'paint') {
      paintSeg(dr, p)
    } else { dr.x1 = p[0]; dr.y1 = p[1]; if (dr.mode === 'shape' && e.shiftKey) { const m = Math.max(Math.abs(dr.x1 - dr.x0), Math.abs(dr.y1 - dr.y0)); dr.x1 = dr.x0 + Math.sign(dr.x1 - dr.x0 || 1) * m; dr.y1 = dr.y0 + Math.sign(dr.y1 - dr.y0 || 1) * m } drawOverlay() }
  }
  const onUp = () => {
    const dr = drag.current; drag.current = null
    const d = docRef.current; if (!dr || !d) return
    if (dr.mode === 'paint') { live({ ...d, layers: d.layers.map((x) => (x.id === dr.id ? { ...x } : x)) }); return }
    if (dr.mode === 'shape') {
      let r = normRect(dr.x0, dr.y0, dr.x1, dr.y1, Infinity, Infinity)
      if (r.w < 4 && r.h < 4) { const s0 = Math.round(Math.min(d.w, d.h) / 4); r = { x: dr.x0 - s0 / 2, y: dr.y0 - s0 / 2, w: s0, h: s0 } }
      const lineMin = shape.kind === 'line' ? Math.max(4, shape.strokeWidth || 6) : 1
      const sw = shape.kind === 'line' && !shape.strokeWidth ? 6 : shape.strokeWidth
      const nl: ShapeLayer = { ...baseLayer(shape.kind[0].toUpperCase() + shape.kind.slice(1), r.x + r.w / 2, r.y + r.h / 2, Math.max(1, r.w), Math.max(lineMin, shape.kind === 'line' ? sw : r.h)), kind: 'shape', shape: shape.kind, fill: shape.fill, noFill: shape.noFill, stroke: shape.kind === 'line' ? (shape.strokeWidth ? shape.stroke : shape.fill) : shape.stroke, strokeWidth: sw, radius: shape.radius }
      if (shape.kind === 'line') { const a = Math.atan2(dr.y1 - dr.y0, dr.x1 - dr.x0) * 180 / Math.PI; nl.w = Math.max(4, Math.hypot(dr.x1 - dr.x0, dr.y1 - dr.y0)); nl.x = (dr.x0 + dr.x1) / 2; nl.y = (dr.y0 + dr.y1) / 2; nl.rot = Math.round(a * 10) / 10 }
      commit({ ...d, layers: [...d.layers, nl] }); setSel(nl.id)
      return
    }
    if (dr.mode === 'crop') { const r = normRect(dr.x0, dr.y0, dr.x1, dr.y1, d.w, d.h); setCropRect(r.w >= 2 && r.h >= 2 ? r : null); drawOverlay() }
  }
  const applyCrop = () => { if (!doc || !cropRect) return; commit(cropDoc(doc, cropRect)); setCropRect(null); setZoom('fit'); setTool('move'); toast(`Cropped to ${Math.round(cropRect.w)} × ${Math.round(cropRect.h)}`, 'success') }
  useEffect(() => { if (tool !== 'crop') setCropRect(null); drawOverlay() }, [tool])

  /* ---------- layer actions ---------- */
  const addBlank = () => { if (!doc) return; const nl: RasterLayer<Bmp> = { ...baseLayer('Layer ' + (doc.layers.length + 1), doc.w / 2, doc.h / 2, doc.w, doc.h), kind: 'raster', bmp: newCanvas(doc.w, doc.h) }; commit({ ...doc, layers: [...doc.layers, nl] }); setSel(nl.id) }
  const duplicate = () => { if (!doc || !selLayer) return; const nl = { ...selLayer, id: uid(), name: selLayer.name + ' copy', x: selLayer.x + 20, y: selLayer.y + 20 } as L; const i = doc.layers.findIndex((l) => l.id === selLayer.id); const layers = doc.layers.slice(); layers.splice(i + 1, 0, nl); commit({ ...doc, layers }); setSel(nl.id) }
  const remove = () => { if (!doc || !selLayer) return; const i = doc.layers.findIndex((l) => l.id === selLayer.id); const layers = doc.layers.filter((l) => l.id !== selLayer.id); commit({ ...doc, layers }); setSel(layers[Math.min(i, layers.length - 1)]?.id ?? null) }
  const reorder = (dir: 1 | -1) => { if (!doc || !selLayer) return; commit(moveLayer(doc, selLayer.id, dir)) }
  const mergeDown = () => {
    if (!doc || !selLayer) return
    const i = doc.layers.findIndex((l) => l.id === selLayer.id); if (i < 1) return
    const lower = doc.layers[i - 1]
    const c = newCanvas(doc.w, doc.h)
    renderDoc(c.getContext('2d')!, { ...doc, bg: 'transparent', layers: [{ ...lower, visible: true }, { ...selLayer, visible: true }] })
    const nl: RasterLayer<Bmp> = { ...baseLayer(lower.name, doc.w / 2, doc.h / 2, doc.w, doc.h), id: lower.id, kind: 'raster', bmp: c }
    const layers = doc.layers.slice(); layers.splice(i - 1, 2, nl); commit({ ...doc, layers }); setSel(nl.id)
  }
  const doRasterize = () => { if (!doc || !selLayer || selLayer.kind === 'raster') return; const r = rasterize(selLayer); commit({ ...doc, layers: doc.layers.map((l) => (l.id === r.id ? r : l)) }) }
  const fitLayer = () => { if (!doc || !selLayer) return; const k = Math.min(doc.w / selLayer.w, doc.h / selLayer.h); patch(selLayer.id, { x: doc.w / 2, y: doc.h / 2, sx: Math.sign(selLayer.sx || 1) * k, sy: Math.sign(selLayer.sy || 1) * k, rot: 0 }) }
  const resizeCanvas = () => {
    if (!doc) return
    const w = Math.round(canvasSize.w), h = Math.round(canvasSize.h)
    if (!(w >= 1 && h >= 1 && w <= 16384 && h <= 16384)) { toast('Use a size between 1 and 16384 pixels.', 'error'); return }
    const dx = (w - doc.w) / 2, dy = (h - doc.h) / 2
    commit({ ...doc, w, h, layers: doc.layers.map((l) => ({ ...l, x: l.x + dx, y: l.y + dy })) }); setZoom('fit')
  }

  /* ---------- export ---------- */
  const flatten = (bg = true) => { const d = docRef.current!; const c = newCanvas(d.w, d.h); renderDoc(c.getContext('2d')!, d, { bg }); return c }
  const exportImage = () => run(async () => {
    if (!doc) return
    if (!doc.layers.some((l) => l.visible)) throw new Error('There is nothing visible to export. Add a layer or turn one on.')
    const c = flatten()
    const blob = await encodeCanvas(c, fmt, { quality, bg: doc.bg === 'transparent' ? '#ffffff' : doc.bg })
    downloadBlob(blob, `${fileName || 'design'}.${fmt}`)
  })
  const saveProject = () => run(async () => {
    if (!doc) return
    const p = toProject(doc, (b) => b.toDataURL('image/png'))
    downloadBlob(new Blob([JSON.stringify(p)], { type: 'application/json' }), `${fileName || 'design'}.layers.json`)
  })
  const exportPsd = () => run(async (setP) => {
    if (!doc) return
    const { writePsd } = await import('ag-psd')
    const children = doc.layers.map((l, i) => {
      setP(i / Math.max(1, doc.layers.length))
      const r = rasterize({ ...l, opacity: 1, blend: 'source-over', visible: true })
      const b = bounds(l)
      return { name: l.name, left: b.x, top: b.y, opacity: l.opacity, hidden: !l.visible, blendMode: PSD_BLEND[l.blend as Blend] as any, canvas: r.bmp }
    })
    const buf = writePsd({ width: doc.w, height: doc.h, children, canvas: flatten(false) }, { generateThumbnail: true })
    downloadBlob(new Blob([buf], { type: 'image/vnd.adobe.photoshop' }), `${fileName || 'design'}.psd`)
  })

  /* ---------- keyboard ---------- */
  useEffect(() => {
    if (!doc) return
    const k = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase()
      if (mod && key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
      if (mod && key === 'y') { e.preventDefault(); redo(); return }
      if (mod && key === 'd') { e.preventDefault(); duplicate(); return }
      if (mod) return
      const t = TOOLS.find((x) => x.key.toLowerCase() === key); if (t) { setTool(t.id); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selLayer) { e.preventDefault(); remove(); return }
      if (e.key === 'Enter' && tool === 'crop' && cropRect) { applyCrop(); return }
      if (e.key === 'Escape') { setCropRect(null); setSel(null); return }
      if (e.key === '[') setBrush((b) => ({ ...b, size: Math.max(1, b.size - (b.size > 20 ? 5 : 1)) }))
      if (e.key === ']') setBrush((b) => ({ ...b, size: Math.min(500, b.size + (b.size >= 20 ? 5 : 1)) }))
      if (selLayer && !selLayer.locked && e.key.startsWith('Arrow')) {
        e.preventDefault(); const st = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0
        patch(selLayer.id, { x: selLayer.x + dx, y: selLayer.y + dy }, 'nudge-' + selLayer.id)
      }
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })

  const layersTopDown = useMemo(() => (doc ? doc.layers.slice().reverse() : []), [doc])

  /* ================= start screen ================= */
  if (!doc) return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-3">
        <Dropzone multiple onFiles={addFiles} accept="image/*,.psd,.psb,.json,.tif,.tiff,.heic,.jxl,.qoi,.tga" label="Drop images, a PSD or a saved project" sub="Each image becomes a layer. The first one sets the canvas size. Nothing is uploaded." />
        {busy && <Progress value={progress} label="Opening" />}
        <ErrorNote error={error} />
      </div>
      <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center gap-2 font-semibold"><ImageIcon className="size-4 text-accent" />Or start with a blank canvas</div>
        <Field label="Size">
          <Select value={newSize.preset} onChange={(v) => { const p = SIZES.find((s) => s.id === v)!; setNewSize((s) => ({ ...s, preset: v, ...(p.w ? { w: p.w, h: p.h } : {}) })) }} options={SIZES.map((s) => ({ value: s.id, label: s.label }))} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Width"><Input type="number" min={1} max={16384} value={newSize.w} onChange={(e) => setNewSize((s) => ({ ...s, preset: 'custom', w: Number(e.target.value) }))} /></Field>
          <Field label="Height"><Input type="number" min={1} max={16384} value={newSize.h} onChange={(e) => setNewSize((s) => ({ ...s, preset: 'custom', h: Number(e.target.value) }))} /></Field>
        </div>
        <Switch checked={newSize.transparent} onChange={(v) => setNewSize((s) => ({ ...s, transparent: v }))} label="Transparent background" />
        {!newSize.transparent && <Field label="Background"><ColorInput value={newSize.bg} onChange={(v) => setNewSize((s) => ({ ...s, bg: v }))} /></Field>}
        <Button className="w-full" icon={<Plus className="size-4" />} onClick={startBlank}>Create canvas</Button>
      </div>
    </div>
  )

  /* ================= editor ================= */
  const cursor = tool === 'move' ? 'cursor-default' : tool === 'text' ? 'cursor-text' : (tool === 'brush' || tool === 'eraser') ? 'cursor-none' : 'cursor-crosshair'
  const sl = selLayer
  return (
    <ToolGrid
      main={<>
        <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-surface p-1.5" role="toolbar" aria-label="Editor tools">
          {TOOLS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTool(t.id)} aria-pressed={tool === t.id} title={`${t.label} (${t.key})`} aria-label={`${t.label} (${t.key})`}
              className={cn('grid size-9 place-items-center rounded-lg transition cursor-pointer', tool === t.id ? 'bg-accent text-on-accent' : 'text-muted hover:bg-surface-2 hover:text-fg')}>{t.icon}</button>
          ))}
          <span className="mx-1 h-6 w-px bg-border" />
          <button type="button" onClick={undo} disabled={!past.length} title="Undo (Ctrl+Z)" aria-label="Undo" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40 cursor-pointer"><Undo2 className="size-4" /></button>
          <button type="button" onClick={redo} disabled={!future.length} title="Redo (Ctrl+Shift+Z)" aria-label="Redo" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40 cursor-pointer"><Redo2 className="size-4" /></button>
          <span className="mx-1 h-6 w-px bg-border" />
          <button type="button" onClick={() => setZoom(Math.max(0.05, z / 1.25))} title="Zoom out" aria-label="Zoom out" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg cursor-pointer"><ZoomOut className="size-4" /></button>
          <button type="button" onClick={() => setZoom('fit')} title="Fit to screen" className="h-9 min-w-14 rounded-lg px-2 font-mono text-xs text-muted hover:bg-surface-2 hover:text-fg cursor-pointer">{Math.round(z * 100)}%</button>
          <button type="button" onClick={() => setZoom(Math.min(8, z * 1.25))} title="Zoom in" aria-label="Zoom in" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg cursor-pointer"><ZoomIn className="size-4" /></button>
          <span className="ml-auto pr-2 text-xs text-muted">{doc.w} × {doc.h}</span>
        </div>
        <div ref={wrap} className="checker relative overflow-auto rounded-2xl border border-border p-2" style={{ maxHeight: '72vh' }}>
          <div className="relative mx-auto" style={{ width: cssW, height: cssH }}>
            <canvas ref={main} className="absolute inset-0 shadow-xl" style={{ width: cssW, height: cssH }} />
            <canvas ref={over} className={cn('absolute inset-0 touch-none', cursor)} style={{ width: cssW, height: cssH }} aria-label="Canvas. Use the tools above to edit layers."
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => { hover.current = null; drawOverlay() }}
              onDoubleClick={() => { if (sl?.kind === 'text') { setPanel('props'); setTimeout(() => textRef.current?.focus(), 30) } }} />
          </div>
        </div>
        <p className="text-center text-xs text-muted">
          {tool === 'move' && 'Click a layer to select it. Drag to move, drag corners to scale (Shift for free scale), drag the round handle to rotate (Shift snaps). Arrow keys nudge.'}
          {(tool === 'brush' || tool === 'eraser') && 'Paint on the selected image layer, or on a new paint layer. [ and ] change the size.'}
          {tool === 'text' && 'Click where the text should go, then type in the panel.'}
          {tool === 'shape' && 'Drag to draw a shape. Hold Shift for a square or circle.'}
          {tool === 'crop' && 'Drag to choose the area to keep, then press Apply crop or Enter.'}
        </p>
        <input ref={addInput} type="file" hidden multiple accept="image/*,.psd,.psb,.tif,.tiff,.heic,.jxl,.qoi,.tga" onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; if (fs.length) addFiles(fs) }} />
      </>}
      side={<>
        {/* tool options */}
        {(tool === 'brush' || tool === 'eraser') && (
          <div className="space-y-3 rounded-2xl border border-border bg-surface-2/40 p-3">
            <Slider label={tool === 'brush' ? 'Brush size' : 'Eraser size'} value={brush.size} onChange={(v) => setBrush((b) => ({ ...b, size: v }))} min={1} max={500} suffix=" px" />
            <Slider label="Softness" value={brush.soft} onChange={(v) => setBrush((b) => ({ ...b, soft: v }))} suffix="%" />
            {tool === 'brush' && <Field label="Colour"><ColorInput value={brush.color} onChange={(v) => setBrush((b) => ({ ...b, color: v }))} /></Field>}
          </div>
        )}
        {tool === 'shape' && (
          <div className="space-y-3 rounded-2xl border border-border bg-surface-2/40 p-3">
            <Field label="Shape"><Segmented value={shape.kind} onChange={(v) => setShape((s) => ({ ...s, kind: v }))} options={[{ value: 'rect', label: <Square className="size-4" aria-label="Rectangle" /> }, { value: 'ellipse', label: <Circle className="size-4" aria-label="Ellipse" /> }, { value: 'triangle', label: <Triangle className="size-4" aria-label="Triangle" /> }, { value: 'line', label: <Minus className="size-4" aria-label="Line" /> }]} /></Field>
            <Field label={shape.kind === 'line' ? 'Line colour' : 'Fill'}><ColorInput value={shape.fill} onChange={(v) => setShape((s) => ({ ...s, fill: v }))} /></Field>
            {shape.kind !== 'line' && <Slider label="Outline" value={shape.strokeWidth} onChange={(v) => setShape((s) => ({ ...s, strokeWidth: v }))} max={60} suffix=" px" />}
          </div>
        )}
        {tool === 'text' && (
          <div className="space-y-3 rounded-2xl border border-border bg-surface-2/40 p-3">
            <Field label="Font"><Select value={textDefaults.font} onChange={(v) => setTextDefaults((t) => ({ ...t, font: v }))} options={FONT_CHOICES} /></Field>
            <Field label="Colour"><ColorInput value={textDefaults.color} onChange={(v) => setTextDefaults((t) => ({ ...t, color: v }))} /></Field>
          </div>
        )}
        {tool === 'crop' && (
          <div className="space-y-2 rounded-2xl border border-border bg-surface-2/40 p-3">
            <p className="text-xs text-muted">{cropRect ? `Keep ${Math.round(cropRect.w)} × ${Math.round(cropRect.h)} px.` : 'Drag on the canvas to pick an area.'}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" icon={<Check className="size-4" />} disabled={!cropRect} onClick={applyCrop}>Apply crop</Button>
              <Button size="sm" variant="outline" icon={<X className="size-4" />} disabled={!cropRect} onClick={() => setCropRect(null)}>Cancel</Button>
            </div>
          </div>
        )}

        <Tabs value={panel} onChange={setPanel} tabs={[{ value: 'layers', label: <span className="flex items-center gap-1"><LayersIcon className="size-3.5" />Layers</span> }, { value: 'props', label: <span className="flex items-center gap-1"><SlidersHorizontal className="size-3.5" />Layer</span> }, { value: 'export', label: <span className="flex items-center gap-1"><Download className="size-3.5" />Export</span> }]} />

        {panel === 'layers' && (
          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-1.5">
              <Button size="sm" variant="outline" icon={<ImagePlus className="size-4" />} onClick={() => addInput.current?.click()} title="Add image as layer" aria-label="Add image as layer" />
              <Button size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={addBlank} title="New empty layer" aria-label="New empty layer" />
              <Button size="sm" variant="outline" icon={<Copy className="size-4" />} onClick={duplicate} disabled={!sl} title="Duplicate (Ctrl+D)" aria-label="Duplicate layer" />
              <Button size="sm" variant="outline" icon={<Trash2 className="size-4" />} onClick={remove} disabled={!sl} title="Delete (Del)" aria-label="Delete layer" />
              <Button size="sm" variant="outline" icon={<ArrowUp className="size-4" />} onClick={() => reorder(1)} disabled={!sl || doc.layers.at(-1)?.id === sl.id} title="Move up" aria-label="Move layer up" />
              <Button size="sm" variant="outline" icon={<ArrowDown className="size-4" />} onClick={() => reorder(-1)} disabled={!sl || doc.layers[0]?.id === sl.id} title="Move down" aria-label="Move layer down" />
              <Button size="sm" variant="outline" icon={<Merge className="size-4" />} onClick={mergeDown} disabled={!sl || doc.layers[0]?.id === sl.id} title="Merge down" aria-label="Merge with layer below" />
              <Button size="sm" variant="outline" icon={<Crosshair className="size-4" />} onClick={fitLayer} disabled={!sl} title="Fit to canvas" aria-label="Fit layer to canvas" />
            </div>
            <ul className="max-h-[46vh] space-y-1 overflow-auto pr-1 scrollbar-thin" aria-label="Layers, top first">
              {layersTopDown.length === 0 && <li className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted">No layers yet. Add an image, draw, or add text.</li>}
              {layersTopDown.map((l) => (
                <li key={l.id} className={cn('flex items-center gap-2 rounded-xl border p-1.5 transition', l.id === sel ? 'border-accent bg-accent/10' : 'border-border bg-surface-2/40 hover:border-accent/50')}>
                  <button type="button" onClick={() => patch(l.id, { visible: !l.visible })} aria-label={l.visible ? `Hide ${l.name}` : `Show ${l.name}`} className="rounded-md p-1 text-muted hover:text-fg cursor-pointer">{l.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}</button>
                  <button type="button" onClick={() => { setSel(l.id); setTool((t) => (t === 'crop' ? 'move' : t)) }} className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer" aria-pressed={l.id === sel}>
                    <LayerThumb layer={l} />
                    <span className="min-w-0 flex-1"><span className={cn('block truncate text-sm', !l.visible && 'text-muted')}>{l.name}</span><span className="block text-[10px] uppercase tracking-wide text-muted">{l.kind === 'raster' ? 'Image' : l.kind}{l.blend !== 'source-over' ? ` · ${BLENDS.find((b) => b.value === l.blend)?.label}` : ''}{l.opacity < 1 ? ` · ${Math.round(l.opacity * 100)}%` : ''}</span></span>
                  </button>
                  <button type="button" onClick={() => patch(l.id, { locked: !l.locked })} aria-label={l.locked ? `Unlock ${l.name}` : `Lock ${l.name}`} className="rounded-md p-1 text-muted hover:text-fg cursor-pointer">{l.locked ? <Lock className="size-4 text-accent" /> : <Unlock className="size-4" />}</button>
                </li>
              ))}
            </ul>
            <div className="space-y-2 rounded-xl border border-border p-3">
              <Label>Canvas</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" aria-label="Canvas width" value={canvasSize.w} onChange={(e) => setCanvasSize((s) => ({ ...s, w: Number(e.target.value) }))} />
                <Input type="number" aria-label="Canvas height" value={canvasSize.h} onChange={(e) => setCanvasSize((s) => ({ ...s, h: Number(e.target.value) }))} />
              </div>
              <Button size="sm" variant="outline" className="w-full" icon={<Maximize2 className="size-4" />} disabled={canvasSize.w === doc.w && canvasSize.h === doc.h} onClick={resizeCanvas}>Resize canvas (keeps layers centred)</Button>
              <Switch checked={doc.bg === 'transparent'} onChange={(v) => commit({ ...doc, bg: v ? 'transparent' : '#FFFFFF' })} label="Transparent background" />
              {doc.bg !== 'transparent' && <ColorInput value={doc.bg} onChange={(v) => commit({ ...doc, bg: v }, 'bg')} />}
            </div>
          </div>
        )}

        {panel === 'props' && (!sl ? <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted">Select a layer to change it.</p> : (
          <div className="space-y-3">
            <Field label="Name"><Input value={sl.name} onChange={(e) => patch(sl.id, { name: e.target.value }, 'name-' + sl.id)} /></Field>
            <Slider label="Opacity" value={Math.round(sl.opacity * 100)} onChange={(v) => patch(sl.id, { opacity: v / 100 }, 'op-' + sl.id)} suffix="%" />
            <Field label="Blend mode"><Select value={sl.blend} onChange={(v) => patch(sl.id, { blend: v })} options={BLENDS} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="X"><Input type="number" value={Math.round(sl.x)} onChange={(e) => patch(sl.id, { x: Number(e.target.value) }, 'x-' + sl.id)} /></Field>
              <Field label="Y"><Input type="number" value={Math.round(sl.y)} onChange={(e) => patch(sl.id, { y: Number(e.target.value) }, 'y-' + sl.id)} /></Field>
              <Field label="Scale %"><Input type="number" min={1} value={Math.round(Math.abs(sl.sx) * 100)} onChange={(e) => { const k = Math.max(1, Number(e.target.value)) / 100; const ratio = Math.abs(sl.sy / (sl.sx || 1)); patch(sl.id, { sx: Math.sign(sl.sx || 1) * k, sy: Math.sign(sl.sy || 1) * k * ratio }, 'sc-' + sl.id) }} /></Field>
              <Field label="Rotate °"><Input type="number" value={Math.round(sl.rot)} onChange={(e) => patch(sl.id, { rot: Number(e.target.value) }, 'rot-' + sl.id)} /></Field>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <Button size="sm" variant="outline" icon={<FlipHorizontal2 className="size-4" />} onClick={() => patch(sl.id, { sx: -sl.sx })} aria-label="Flip horizontal" title="Flip horizontal" />
              <Button size="sm" variant="outline" icon={<FlipVertical2 className="size-4" />} onClick={() => patch(sl.id, { sy: -sl.sy })} aria-label="Flip vertical" title="Flip vertical" />
              <Button size="sm" variant="outline" icon={<Crosshair className="size-4" />} onClick={() => patch(sl.id, { x: doc.w / 2, y: doc.h / 2 })} aria-label="Centre on canvas" title="Centre on canvas" />
            </div>

            {sl.kind === 'text' && (
              <div className="space-y-3 rounded-xl border border-border p-3">
                <Field label="Text"><Textarea ref={textRef} value={sl.text} onChange={(e) => patchText(sl.id, { text: e.target.value }, 'txt-' + sl.id)} className="min-h-20 font-sans text-sm" /></Field>
                <Field label="Font"><Select value={sl.font} onChange={(v) => patchText(sl.id, { font: v })} options={FONT_CHOICES} /></Field>
                <Slider label="Size" value={sl.size} onChange={(v) => patchText(sl.id, { size: v }, 'ts-' + sl.id)} min={6} max={600} suffix=" px" />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Colour"><ColorInput value={sl.color} onChange={(v) => patchText(sl.id, { color: v }, 'tc-' + sl.id)} /></Field>
                  <Field label="Weight"><Select value={String(sl.weight)} onChange={(v) => patchText(sl.id, { weight: Number(v) })} options={[{ value: '400', label: 'Regular' }, { value: '600', label: 'Semibold' }, { value: '700', label: 'Bold' }, { value: '900', label: 'Black' }]} /></Field>
                </div>
                <Field label="Align"><Segmented value={sl.align} onChange={(v) => patchText(sl.id, { align: v })} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }]} /></Field>
                <Switch checked={sl.italic} onChange={(v) => patchText(sl.id, { italic: v })} label="Italic" />
                <Slider label="Line height" value={Math.round(sl.lineHeight * 100)} onChange={(v) => patchText(sl.id, { lineHeight: v / 100 }, 'lh-' + sl.id)} min={80} max={250} suffix="%" />
                <Slider label="Outline" value={sl.stroke} onChange={(v) => patchText(sl.id, { stroke: v }, 'tst-' + sl.id)} max={30} suffix=" px" />
                {sl.stroke > 0 && <ColorInput value={sl.strokeColor} onChange={(v) => patchText(sl.id, { strokeColor: v }, 'tsc-' + sl.id)} />}
                <p className="text-[11px] text-muted" style={{ font: fontString({ ...sl, size: 13 }) }}>Preview of {sl.font}</p>
              </div>
            )}
            {sl.kind === 'shape' && (
              <div className="space-y-3 rounded-xl border border-border p-3">
                {sl.shape !== 'line' && <Switch checked={!sl.noFill} onChange={(v) => patch(sl.id, { noFill: !v })} label="Fill" />}
                {sl.shape !== 'line' && !sl.noFill && <ColorInput value={sl.fill} onChange={(v) => patch(sl.id, { fill: v }, 'sf-' + sl.id)} />}
                <Slider label={sl.shape === 'line' ? 'Thickness' : 'Outline'} value={sl.strokeWidth} onChange={(v) => patch(sl.id, { strokeWidth: v, ...(sl.shape === 'line' ? { h: Math.max(4, v) } : {}) }, 'sw-' + sl.id)} max={100} suffix=" px" />
                {sl.strokeWidth > 0 && <ColorInput value={sl.stroke} onChange={(v) => patch(sl.id, { stroke: v }, 'ss-' + sl.id)} />}
                {sl.shape === 'rect' && <Slider label="Corner radius" value={sl.radius} onChange={(v) => patch(sl.id, { radius: v }, 'sr-' + sl.id)} max={Math.round(Math.min(sl.w, sl.h) / 2)} suffix=" px" />}
              </div>
            )}
            {sl.kind !== 'raster' && <Button size="sm" variant="outline" className="w-full" onClick={doRasterize}>Turn into pixels (for brush, eraser and filters)</Button>}
            {sl.kind === 'raster' && (
              <div className="space-y-3 rounded-xl border border-border p-3">
                <Label>Filters</Label>
                <Slider label="Brightness" value={filters.brightness} onChange={(v) => setFilters((f) => ({ ...f, brightness: v }))} min={-100} max={100} />
                <Slider label="Contrast" value={filters.contrast} onChange={(v) => setFilters((f) => ({ ...f, contrast: v }))} min={-100} max={100} />
                <Slider label="Saturation" value={filters.saturation} onChange={(v) => setFilters((f) => ({ ...f, saturation: v }))} min={-100} max={100} />
                <Slider label="Hue" value={filters.hue} onChange={(v) => setFilters((f) => ({ ...f, hue: v }))} min={-180} max={180} suffix="°" />
                <Slider label="Blur" value={filters.blur} onChange={(v) => setFilters((f) => ({ ...f, blur: v }))} max={40} suffix=" px" />
                <Slider label="Sharpen" value={filters.sharpen} onChange={(v) => setFilters((f) => ({ ...f, sharpen: v }))} />
                <Slider label="Black and white" value={filters.grayscale} onChange={(v) => setFilters((f) => ({ ...f, grayscale: v }))} suffix="%" />
                <Slider label="Sepia" value={filters.sepia} onChange={(v) => setFilters((f) => ({ ...f, sepia: v }))} suffix="%" />
                <Slider label="Invert" value={filters.invert} onChange={(v) => setFilters((f) => ({ ...f, invert: v }))} suffix="%" />
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" icon={<Check className="size-4" />} disabled={!filterPreview} onClick={applyFilterNow}>Apply</Button>
                  <Button size="sm" variant="outline" disabled={isNoFilter(filters)} onClick={() => setFilters(NO_FILTERS)}>Reset</Button>
                </div>
              </div>
            )}
          </div>
        ))}

        {panel === 'export' && (
          <div className="space-y-3">
            <Field label="File name"><Input value={fileName} onChange={(e) => setFileName(e.target.value.replace(/[\\/:*?"<>|]/g, ''))} /></Field>
            <Field label="Format"><Segmented value={fmt} onChange={setFmt} options={[{ value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }, { value: 'webp', label: 'WEBP' }]} /></Field>
            {fmt !== 'png' && <Slider label="Quality" value={quality} onChange={setQuality} min={40} max={100} suffix="%" />}
            {fmt === 'jpg' && doc.bg === 'transparent' && <p className="text-xs text-muted">JPG has no transparency, so the empty areas become white.</p>}
            <Button size="lg" className="w-full" loading={busy} icon={<Download className="size-4" />} onClick={exportImage}>Download image</Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" icon={<FileJson className="size-4" />} onClick={saveProject} disabled={busy}>Save project</Button>
              <Button variant="outline" icon={<LayersIcon className="size-4" />} onClick={exportPsd} disabled={busy}>Export PSD</Button>
            </div>
            <p className="text-xs text-muted">A project file keeps every layer, text and shape editable. Open it here again any time. PSD export turns text and shapes into pixel layers.</p>
          </div>
        )}
        {busy && <Progress value={progress} label="Working" />}
        <ErrorNote error={error} />
        <div className="grid grid-cols-2 gap-2 pt-1">
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-muted hover:text-fg focus-within:ring-2 focus-within:ring-accent/40">
            <FolderOpen className="size-4" />Open
            <input type="file" className="sr-only" accept=".json,.psd,.psb,image/*" onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; if (fs.length) addFiles(fs) }} />
          </label>
          <Button variant="ghost" onClick={() => { if (!doc.layers.length || confirm('Close this canvas? Unsaved changes will be lost.')) { setDoc(null); setPast([]); setFuture([]); setSel(null) } }}>Start over</Button>
        </div>
      </>}
    />
  )
}
