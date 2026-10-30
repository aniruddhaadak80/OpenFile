import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MousePointer2, Hand, Square, Diamond, Circle, MoveRight, Minus, Pencil, Type, ImagePlus, Eraser, StickyNote, Frame, Wand,
  Presentation, Maximize, Minimize, Share2, Library, Undo2, Redo2, ZoomIn, ZoomOut, Menu, Keyboard, Grid3x3, Magnet, Moon, Sun,
  FolderOpen, Save, Trash2, Plus, LockOpen, Lock, ChevronLeft, ChevronRight, ChevronDown, Scan, X, Download, FileUp, Palette, Copy as CopyIcon, Pen,
} from 'lucide-react'
import { cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { downloadBlob, canvasToBlob, copyText } from '@/lib/files'
import { El, Style, Tool, Cam, ShapeKind, Board, uid, STICKY_COLORS, FONT } from './_design/sketch/types'
import { bounds, unionBounds, hit, borderPoint, center, boxContains, Box, linePts } from './_design/sketch/geometry'
import { drawElement, elementsToSvg, sortForRender, measure, tableHeight, darkColor, wrap, LINE_H } from './_design/sketch/render'
import { STENCILS } from './_design/sketch/stencils'
import { PropsPanel, LibraryPanel, HelpModal, ExportDialog, ExportOpts, Action } from './_design/sketch/ui'

/* ============================== constants & storage ============================== */
const GRID = 20
const DEFAULT_STYLE: Style = { stroke: '#1e1e1e', fill: 'transparent', fillStyle: 'hachure', strokeWidth: 2, strokeStyle: 'solid', opacity: 100, rough: 1, roundness: 1, fontSize: 20, fontFamily: 'hand', align: 'left', startHead: 'none', endHead: 'arrow' }
const IDX = 'openfile.sketch.index.v1'
const BKEY = (id: string) => `openfile.sketch.board.v1.${id}`
const BGS = ['#ffffff', '#f8f9fa', '#f5faff', '#fffce8', '#fdf8f6']
type Meta = { id: string; name: string; updated: number }
type Index = { boards: Meta[]; current: string; prefs?: { dark?: boolean; grid?: boolean; snap?: boolean }; shares?: Record<string, string> }

function readIndex(): Index {
  try { const v = JSON.parse(localStorage.getItem(IDX) || 'null'); if (v?.boards?.length) return v } catch { /* ignore */ }
  const id = uid(); return { boards: [{ id, name: 'Board 1', updated: Date.now() }], current: id, prefs: {} }
}
function readBoard(id: string): { elements: El[]; bg?: string } {
  try { const v = JSON.parse(localStorage.getItem(BKEY(id)) || 'null'); if (v?.elements) return { elements: v.elements.map(sanitize).filter(Boolean) as El[], bg: v.bg } } catch { /* ignore */ }
  return { elements: [] }
}
function sanitize(e: any): El | null {
  if (!e || typeof e !== 'object' || !e.type || typeof e.x !== 'number') return null
  return { stroke: '#1e1e1e', fill: 'transparent', fillStyle: 'none', strokeWidth: 2, strokeStyle: 'solid', opacity: 100, rough: 1, roundness: 0, w: 0, h: 0, ...e, id: String(e.id || uid()), groupIds: Array.isArray(e.groupIds) ? e.groupIds : [], seed: Number.isFinite(e.seed) ? e.seed : Math.floor(Math.random() * 2 ** 31) }
}
const isTyping = (t: EventTarget | null) => { const el = t as HTMLElement | null; return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) }
const snapV = (v: number, on: boolean) => (on ? Math.round(v / GRID) * GRID : v)
const outerGroup = (e: El) => e.groupIds[e.groupIds.length - 1]
const BINDABLE = new Set(['shape', 'sticky', 'image', 'icon', 'table', 'text'])

function ensureFont(onLoad: () => void) {
  if (!document.getElementById('of-caveat-font')) {
    const l = document.createElement('link'); l.id = 'of-caveat-font'; l.rel = 'stylesheet'
    l.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@400..700&display=swap'; document.head.appendChild(l)
  }
  document.fonts?.load('500 20px Caveat').then(onLoad, () => { /* offline: fallback fonts */ })
}

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
type Op =
  | { k: 'pan'; sx: number; sy: number; cx: number; cy: number }
  | { k: 'move'; start: number[]; orig: Map<string, El>; box: Box; before: El[] }
  | { k: 'resize'; handle: Handle; box: Box; orig: Map<string, El>; before: El[] }
  | { k: 'create'; id: string; start: number[]; before: El[] }
  | { k: 'line'; id: string; before: El[] }
  | { k: 'point'; id: string; index: number; before: El[] }
  | { k: 'draw'; id: string; before: El[] }
  | { k: 'marquee'; start: number[]; cur: number[]; base: Set<string> }
  | { k: 'erase'; last: number[]; before: El[] }
  | { k: 'laser' }
type Editing = { id: string; before: El[]; isNew: boolean }

const TOOLS: { t: Tool; icon: any; label: string; key: string }[] = [
  { t: 'hand', icon: Hand, label: 'Hand, pan', key: 'H' }, { t: 'select', icon: MousePointer2, label: 'Select', key: '1' },
  { t: 'rectangle', icon: Square, label: 'Rectangle', key: '2' }, { t: 'diamond', icon: Diamond, label: 'Diamond', key: '3' },
  { t: 'ellipse', icon: Circle, label: 'Ellipse', key: '4' }, { t: 'arrow', icon: MoveRight, label: 'Arrow', key: '5' },
  { t: 'line', icon: Minus, label: 'Line', key: '6' }, { t: 'freedraw', icon: Pencil, label: 'Pencil', key: '7' },
  { t: 'text', icon: Type, label: 'Text', key: '8' }, { t: 'image', icon: ImagePlus, label: 'Image', key: '9' },
  { t: 'eraser', icon: Eraser, label: 'Eraser', key: '0' }, { t: 'sticky', icon: StickyNote, label: 'Sticky note', key: 'S' },
  { t: 'frame', icon: Frame, label: 'Frame (slide)', key: 'F' }, { t: 'laser', icon: Wand, label: 'Laser pointer', key: 'K' },
]
const KEYMAP: Record<string, Tool> = { v: 'select', '1': 'select', h: 'hand', r: 'rectangle', '2': 'rectangle', d: 'diamond', '3': 'diamond', o: 'ellipse', '4': 'ellipse', a: 'arrow', '5': 'arrow', l: 'line', '6': 'line', p: 'freedraw', '7': 'freedraw', x: 'freedraw', t: 'text', '8': 'text', '9': 'image', e: 'eraser', '0': 'eraser', s: 'sticky', n: 'sticky', f: 'frame', k: 'laser' }

/* ============================== component ============================== */
export default function SketchBoard() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const openRef = useRef<HTMLInputElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const [, bump] = useReducer((x: number) => x + 1, 0)

  const initial = useMemo(() => { const idx = readIndex(); const b = readBoard(idx.current); return { idx, b } }, [])
  const [index, setIndex] = useState<Index>(initial.idx)
  const elsRef = useRef<El[]>(initial.b.elements)
  const [bg, setBg] = useState(initial.b.bg ?? '#ffffff')
  const camRef = useRef<Cam>({ x: 0, y: 0, z: 1 })
  const undoRef = useRef<El[][]>([]), redoRef = useRef<El[][]>([])
  const [sel, setSelState] = useState<Set<string>>(new Set())
  const selRef = useRef(sel)
  const [tool, setToolState] = useState<Tool>('select')
  const toolRef = useRef<Tool>('select')
  const [toolLock, setToolLock] = useState(false)
  const [style, setStyle] = useState<Style>(DEFAULT_STYLE)
  const styleRef = useRef(style); styleRef.current = style
  const [dark, setDark] = useState(!!initial.idx.prefs?.dark)
  const [grid, setGrid] = useState(initial.idx.prefs?.grid ?? false)
  const [snap, setSnap] = useState(!!initial.idx.prefs?.snap)
  const [full, setFull] = useState(false)
  const [libOpen, setLibOpen] = useState(false)
  const [help, setHelp] = useState(false)
  const [menu, setMenu] = useState(false)
  const [boardsOpen, setBoardsOpen] = useState(false)
  const [propsOpen, setPropsOpen] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportOpts, setExportOpts] = useState<ExportOpts>({ onlySelected: false, background: true, dark: false, scale: 2, padding: 24 })
  const [preview, setPreview] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const editRef = useRef<Editing | null>(null); editRef.current = editing
  const [present, setPresent] = useState<number | null>(null)
  const presentRef = useRef<number | null>(null); presentRef.current = present
  const [renaming, setRenaming] = useState<string | null>(null)

  const opRef = useRef<Op | null>(null)
  const spaceRef = useRef(false)
  const activeRef = useRef(false)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{ d: number; cx: number; cy: number; cam: Cam } | null>(null)
  const images = useRef(new Map<string, HTMLImageElement>())
  const laser = useRef<{ x: number; y: number; t: number }[]>([])
  const erasing = useRef(new Set<string>())
  const hoverBind = useRef<string | null>(null)
  const lastWorld = useRef<number[]>([0, 0])
  const clip = useRef<El[] | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)
  const raf = useRef(0)
  const storageWarned = useRef(false)
  const gridRef = useRef(grid); gridRef.current = grid
  const snapRef = useRef(snap); snapRef.current = snap
  const darkRef = useRef(dark); darkRef.current = dark
  const bgRef = useRef(bg); bgRef.current = bg
  const indexRef = useRef(index); indexRef.current = index

  /* ---------------- rendering ---------------- */
  const requestRender = useCallback(() => { if (!raf.current) raf.current = requestAnimationFrame(draw) }, [])
  const setSel = useCallback((s: Set<string>) => { selRef.current = s; setSelState(s); requestRender() }, [requestRender])
  const setTool = useCallback((t: Tool) => { toolRef.current = t; setToolState(t); requestRender() }, [requestRender])

  function draw() {
    raf.current = 0
    const cv = canvasRef.current, wr = wrapRef.current
    if (!cv || !wr) return
    const dpr = window.devicePixelRatio || 1
    const W = wr.clientWidth, H = wr.clientHeight
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px' }
    const ctx = cv.getContext('2d')!
    const cam = camRef.current
    const isDark = darkRef.current
    const bgc = isDark ? darkColor(bgRef.current) : bgRef.current
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = bgc; ctx.fillRect(0, 0, W, H)
    // grid
    if (gridRef.current && presentRef.current == null) {
      let stepW = GRID
      while (stepW * cam.z < 10) stepW *= 5
      const z = cam.z
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath(); ctx.lineWidth = 1
        ctx.strokeStyle = isDark ? (pass ? '#ffffff22' : '#ffffff0e') : (pass ? '#0000001e' : '#0000000c')
        const x0 = Math.floor(-cam.x / z / stepW) * stepW, y0 = Math.floor(-cam.y / z / stepW) * stepW
        for (let wx = x0; wx * z + cam.x < W; wx += stepW) { const major = Math.round(wx / stepW) % 5 === 0; if (major === !!pass) { const sx = Math.round(wx * z + cam.x) + 0.5; ctx.moveTo(sx, 0); ctx.lineTo(sx, H) } }
        for (let wy = y0; wy * z + cam.y < H; wy += stepW) { const major = Math.round(wy / stepW) % 5 === 0; if (major === !!pass) { const sy = Math.round(wy * z + cam.y) + 0.5; ctx.moveTo(0, sy); ctx.lineTo(W, sy) } }
        ctx.stroke()
      }
    }
    ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * cam.x, dpr * cam.y)
    const view = { x1: -cam.x / cam.z, y1: -cam.y / cam.z, x2: (W - cam.x) / cam.z, y2: (H - cam.y) / cam.z }
    const presenting = presentRef.current != null
    const opts = { dark: isDark, images: images.current, onImageLoad: requestRender, skipTextOf: editRef.current?.id ?? null, erasing: erasing.current }
    for (const el of sortForRender(elsRef.current)) {
      if (presenting && el.type === 'frame') continue
      const b = bounds(el)
      if (b.x2 < view.x1 - 50 || b.x1 > view.x2 + 50 || b.y2 < view.y1 - 50 || b.y1 > view.y2 + 50) continue
      drawElement(ctx, el, opts)
    }
    const z = cam.z
    // presentation mask
    if (presenting) {
      const slide = slides()[presentRef.current!]
      if (slide) {
        ctx.save(); ctx.fillStyle = bgc; ctx.beginPath(); ctx.rect(view.x1 - 10, view.y1 - 10, view.x2 - view.x1 + 20, view.y2 - view.y1 + 20)
        ctx.rect(slide.x1, slide.y1, slide.x2 - slide.x1, slide.y2 - slide.y1); ctx.fill('evenodd'); ctx.restore()
      }
    } else {
      // selection overlay
      const s = selRef.current
      const selected = elsRef.current.filter((e) => s.has(e.id))
      const accent = '#f5a524'
      ctx.lineWidth = 1 / z
      if (hoverBind.current) {
        const t = elsRef.current.find((e) => e.id === hoverBind.current)
        if (t) { const b = bounds(t); ctx.save(); ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 3 / z; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.roundRect(b.x1 - 5 / z, b.y1 - 5 / z, b.x2 - b.x1 + 10 / z, b.y2 - b.y1 + 10 / z, 6 / z); ctx.stroke(); ctx.restore() }
      }
      if (selected.length) {
        const single = selected.length === 1 ? selected[0] : null
        const groupedSel = new Set(selected.map(outerGroup).filter(Boolean)).size > 0
        if (single && (single.type === 'line' || single.type === 'arrow') && !single.locked) {
          const pts = (single.points ?? []).map((p) => [single.x + p[0], single.y + p[1]])
          ctx.strokeStyle = accent; ctx.setLineDash([4 / z, 3 / z]); ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.globalAlpha = 0.4; ctx.stroke(); ctx.globalAlpha = 1; ctx.setLineDash([])
          pts.forEach((p) => { ctx.beginPath(); ctx.arc(p[0], p[1], 5 / z, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = accent; ctx.lineWidth = 1.5 / z; ctx.stroke() })
          for (let i = 0; i < pts.length - 1; i++) { const m = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2]; ctx.beginPath(); ctx.arc(m[0], m[1], 3.5 / z, 0, Math.PI * 2); ctx.fillStyle = accent + '88'; ctx.fill() }
        } else {
          if (selected.length > 1 || groupedSel) for (const e of selected) { const b = bounds(e); ctx.strokeStyle = accent + '88'; ctx.setLineDash([3 / z, 3 / z]); ctx.strokeRect(b.x1 - 2 / z, b.y1 - 2 / z, b.x2 - b.x1 + 4 / z, b.y2 - b.y1 + 4 / z) }
          ctx.setLineDash([])
          const B = unionBounds(selected)!
          const p = 4 / z
          ctx.strokeStyle = accent; ctx.lineWidth = 1.25 / z
          ctx.strokeRect(B.x1 - p, B.y1 - p, B.x2 - B.x1 + 2 * p, B.y2 - B.y1 + 2 * p)
          if (!selected.every((e) => e.locked)) {
            for (const [, hx, hy] of handles(B)) { const hs = 8 / z; ctx.fillStyle = '#fff'; ctx.strokeStyle = accent; ctx.beginPath(); ctx.roundRect(hx - hs / 2, hy - hs / 2, hs, hs, 2 / z); ctx.fill(); ctx.stroke() }
          } else { ctx.font = `${12 / z}px Inter`; ctx.fillStyle = accent; ctx.fillText('🔒 locked', B.x1, B.y1 - 10 / z) }
        }
      }
      const op = opRef.current
      if (op?.k === 'marquee') {
        const [x1, y1] = op.start, [x2, y2] = op.cur
        ctx.fillStyle = 'rgba(245,165,36,0.1)'; ctx.strokeStyle = accent; ctx.lineWidth = 1 / z
        ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1))
      }
    }
    // laser trail
    const now = performance.now()
    laser.current = laser.current.filter((p) => now - p.t < 900)
    if (laser.current.length > 1) {
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      const L = laser.current
      for (let i = 1; i < L.length; i++) {
        const age = (now - L[i].t) / 900
        ctx.strokeStyle = `rgba(255, 40, 60, ${Math.max(0, 1 - age)})`; ctx.lineWidth = (5 * (1 - age) + 1) / z
        ctx.shadowColor = 'rgba(255,0,40,0.9)'; ctx.shadowBlur = 12
        ctx.beginPath(); ctx.moveTo(L[i - 1].x, L[i - 1].y); ctx.lineTo(L[i].x, L[i].y); ctx.stroke()
      }
      ctx.restore()
      requestRender()
    }
  }
  const handles = (B: Box): [Handle, number, number][] => {
    const z = camRef.current.z, p = 4 / z
    const x1 = B.x1 - p, y1 = B.y1 - p, x2 = B.x2 + p, y2 = B.y2 + p, mx = (x1 + x2) / 2, my = (y1 + y2) / 2
    const small = (x2 - x1) * z < 30 || (y2 - y1) * z < 30
    const all: [Handle, number, number][] = [['nw', x1, y1], ['ne', x2, y1], ['se', x2, y2], ['sw', x1, y2]]
    return small ? all : [...all, ['n', mx, y1], ['e', x2, my], ['s', mx, y2], ['w', x1, my]]
  }

  /* ---------------- element state ---------------- */
  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => saveNow(), 400)
  }, [])
  function saveNow() {
    const idx = indexRef.current
    try {
      localStorage.setItem(BKEY(idx.current), JSON.stringify({ elements: elsRef.current, bg: bgRef.current }))
      const next = { ...idx, boards: idx.boards.map((b) => (b.id === idx.current ? { ...b, updated: Date.now() } : b)) }
      localStorage.setItem(IDX, JSON.stringify(next))
    } catch {
      if (!storageWarned.current) { storageWarned.current = true; toast('Autosave failed, browser storage is full (large images?). Save to a file to keep your work.', 'error') }
    }
  }
  const setEls = useCallback((next: El[], opts: { history?: El[] | false; ui?: boolean } = {}) => {
    if (opts.history) { undoRef.current.push(opts.history); if (undoRef.current.length > 200) undoRef.current.shift(); redoRef.current = [] }
    elsRef.current = next
    requestRender(); scheduleSave()
    if (opts.ui !== false) bump()
  }, [requestRender, scheduleSave])
  const commit = (next: El[]) => setEls(next, { history: elsRef.current })
  const undo = () => { const u = undoRef.current.pop(); if (!u) return; redoRef.current.push(elsRef.current); elsRef.current = u; pruneSel(); requestRender(); scheduleSave(); bump() }
  const redo = () => { const r = redoRef.current.pop(); if (!r) return; undoRef.current.push(elsRef.current); elsRef.current = r; pruneSel(); requestRender(); scheduleSave(); bump() }
  const pruneSel = () => { const ids = new Set(elsRef.current.map((e) => e.id)); const s = new Set([...selRef.current].filter((i) => ids.has(i))); setSel(s) }

  const newEl = (type: El['type'], over: Partial<El>): El => {
    const s = styleRef.current
    return { id: uid(), type, x: 0, y: 0, w: 0, h: 0, stroke: s.stroke, fill: s.fill, fillStyle: s.fill === 'transparent' ? 'none' : s.fillStyle, strokeWidth: s.strokeWidth, strokeStyle: s.strokeStyle, opacity: s.opacity, rough: s.rough, roundness: s.roundness, seed: Math.floor(Math.random() * 2 ** 31), groupIds: [], fontSize: s.fontSize, fontFamily: s.fontFamily, align: s.align, ...over }
  }
  const textWH = (e: El) => { const m = measure(e.text || '', e.fontSize ?? 20, e.fontFamily ?? 'hand'); return { w: m.w, h: m.h } }

  /** recompute endpoints of arrows bound to shapes */
  function rebind(els: El[]): El[] {
    const byId = new Map(els.map((e) => [e.id, e]))
    let changed = false
    const out = els.map((e) => {
      if ((e.type !== 'arrow' && e.type !== 'line') || !(e.startBind || e.endBind) || !e.points || e.points.length < 2) return e
      const pts = e.points.map((p) => [e.x + p[0], e.y + p[1]] as [number, number])
      const sEl = e.startBind ? byId.get(e.startBind) : undefined, eEl = e.endBind ? byId.get(e.endBind) : undefined
      const n = pts.length
      if (sEl) pts[0] = borderPoint(sEl, n === 2 && eEl ? center(eEl) : pts[1])
      if (eEl) pts[n - 1] = borderPoint(eEl, n === 2 && sEl ? center(sEl) : pts[n - 2])
      const x = pts[0][0], y = pts[0][1]
      const np = pts.map((p) => [p[0] - x, p[1] - y])
      const same = x === e.x && y === e.y && np.every((p, i) => Math.abs(p[0] - e.points![i][0]) < 0.01 && Math.abs(p[1] - e.points![i][1]) < 0.01) && (!!sEl === !!e.startBind) && (!!eEl === !!e.endBind)
      if (same) return e
      changed = true
      return { ...e, x, y, points: np, startBind: sEl ? e.startBind : null, endBind: eEl ? e.endBind : null }
    })
    return changed ? out : els
  }

  /* ---------------- camera ---------------- */
  const toWorld = (cx: number, cy: number) => { const r = canvasRef.current!.getBoundingClientRect(); const c = camRef.current; return [(cx - r.left - c.x) / c.z, (cy - r.top - c.y) / c.z] }
  const setCam = (c: Cam, ui = false) => { camRef.current = c; requestRender(); if (ui || editRef.current) bump() }
  const zoomAt = (factor: number, sx?: number, sy?: number) => {
    const c = camRef.current, wr = wrapRef.current!
    const px = sx ?? wr.clientWidth / 2, py = sy ?? wr.clientHeight / 2
    const z = Math.min(30, Math.max(0.1, c.z * factor))
    setCam({ z, x: px - (px - c.x) * (z / c.z), y: py - (py - c.y) * (z / c.z) }, true)
  }
  const animateCam = (target: Cam) => {
    const from = { ...camRef.current }, t0 = performance.now()
    const step = () => { const t = Math.min(1, (performance.now() - t0) / 380), e = 1 - (1 - t) ** 3; setCam({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, z: from.z + (target.z - from.z) * e }, t === 1); if (t < 1) requestAnimationFrame(step) }
    requestAnimationFrame(step)
  }
  const fitBox = (B: Box | null, pad = 60, maxZ = 2, animate = true) => {
    const wr = wrapRef.current; if (!wr) return
    if (!B) { const c = { x: wr.clientWidth / 2, y: wr.clientHeight / 2, z: 1 }; animate ? animateCam(c) : setCam(c, true); return }
    const W = wr.clientWidth, H = wr.clientHeight
    const z = Math.min(maxZ, Math.max(0.1, Math.min((W - pad * 2) / Math.max(1, B.x2 - B.x1), (H - pad * 2) / Math.max(1, B.y2 - B.y1))))
    const c = { z, x: W / 2 - ((B.x1 + B.x2) / 2) * z, y: H / 2 - ((B.y1 + B.y2) / 2) * z }
    animate ? animateCam(c) : setCam(c, true)
  }
  const contentBox = (els = elsRef.current) => { const b = unionBounds(els); if (b && els.some((e) => e.type === 'frame')) b.y1 -= 24; return b }
  const viewCenter = () => { const wr = wrapRef.current!; const c = camRef.current; return [(wr.clientWidth / 2 - c.x) / c.z, (wr.clientHeight / 2 - c.y) / c.z] }

  /* ---------------- presentation ---------------- */
  function slides(): Box[] {
    const frames = elsRef.current.filter((e) => e.type === 'frame')
    if (frames.length) return frames.map((f) => ({ x1: f.x, y1: f.y, x2: f.x + f.w, y2: f.y + f.h }))
    const b = unionBounds(elsRef.current); return b ? [b] : []
  }
  const goSlide = (i: number) => { const s = slides(); if (!s.length) return; const n = Math.max(0, Math.min(s.length - 1, i)); setPresent(n); presentRef.current = n; fitBox(s[n], 24, 10) }
  const startPresent = () => {
    const s = slides()
    if (!s.length) { toast('Nothing to present yet, draw something or add frames (F)', 'info'); return }
    if (!elsRef.current.some((e) => e.type === 'frame')) toast('No frames found, presenting the whole board. Add frames (F) to make slides.', 'info')
    setSel(new Set()); setEditing(null); setLibOpen(false); setTool('laser')
    setPresent(0); presentRef.current = 0
    const p = wrapRef.current?.requestFullscreen?.()
    if (p) p.catch(() => setFull(true)); else setFull(true)
    setTimeout(() => goSlide(0), 160)
  }
  const stopPresent = () => { setPresent(null); presentRef.current = null; setTool('select'); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); requestRender() }
  useEffect(() => {
    const h = () => { if (!document.fullscreenElement && presentRef.current != null) { setPresent(null); presentRef.current = null; setTool('select') } setTimeout(requestRender, 50) }
    document.addEventListener('fullscreenchange', h); return () => document.removeEventListener('fullscreenchange', h)
  }, [])

  /* ---------------- selection helpers ---------------- */
  const expand = (ids: Iterable<string>) => {
    const set = new Set(ids)
    const groups = new Set(elsRef.current.filter((e) => set.has(e.id)).map(outerGroup).filter(Boolean))
    if (groups.size) for (const e of elsRef.current) if (groups.has(outerGroup(e))) set.add(e.id)
    return set
  }
  const topHit = (x: number, y: number, opts: { includeLocked?: boolean; exclude?: string; filter?: (e: El) => boolean } = {}) => {
    const tol = 6 / camRef.current.z
    const els = elsRef.current
    // non-frames first (top-most), then frames
    for (let i = els.length - 1; i >= 0; i--) { const e = els[i]; if (e.type === 'frame' || (e.locked && !opts.includeLocked) || e.id === opts.exclude || (opts.filter && !opts.filter(e))) continue; if (hit(e, x, y, tol)) return e }
    for (let i = els.length - 1; i >= 0; i--) { const e = els[i]; if (e.type !== 'frame' || (e.locked && !opts.includeLocked) || e.id === opts.exclude || (opts.filter && !opts.filter(e))) continue; if (hit(e, x, y, tol)) return e }
    return null
  }
  const selected = () => elsRef.current.filter((e) => selRef.current.has(e.id))
  const bindTarget = (x: number, y: number, exclude: string) => {
    const pad = 10 / camRef.current.z
    const els = elsRef.current
    for (let i = els.length - 1; i >= 0; i--) {
      const e = els[i]; if (!BINDABLE.has(e.type) || e.id === exclude) continue
      const b = bounds(e); if (x >= b.x1 - pad && x <= b.x2 + pad && y >= b.y1 - pad && y <= b.y2 + pad) return e
    }
    return null
  }

  /* ---------------- pointer handling ---------------- */
  const onPointerDown = (e: React.PointerEvent) => {
    activeRef.current = true
    if (editRef.current) { finishEdit(); return }
    e.preventDefault()
    wrapRef.current?.focus({ preventScroll: true })
    setMenu(false); setBoardsOpen(false)
    const cv = canvasRef.current!; cv.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      // pinch: abort any in-progress creation
      const op = opRef.current
      if (op && (op.k === 'create' || op.k === 'line' || op.k === 'draw')) { elsRef.current = op.before; bump() }
      opRef.current = null
      const [a, b] = [...pointers.current.values()]
      pinchRef.current = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, cam: { ...camRef.current } }
      return
    }
    const [wx, wy] = toWorld(e.clientX, e.clientY)
    lastWorld.current = [wx, wy]
    const t = toolRef.current
    if (e.button === 1 || spaceRef.current || t === 'hand' || (presentRef.current != null && t !== 'laser')) { opRef.current = { k: 'pan', sx: e.clientX, sy: e.clientY, cx: camRef.current.x, cy: camRef.current.y }; cv.style.cursor = 'grabbing'; return }
    if (e.button === 2) return
    if (t === 'laser') { opRef.current = { k: 'laser' }; laser.current.push({ x: wx, y: wy, t: performance.now() }); requestRender(); return }
    if (presentRef.current != null) return
    const before = elsRef.current
    const sn = snapRef.current && !e.ctrlKey
    if (t === 'eraser') { opRef.current = { k: 'erase', last: [wx, wy], before }; eraseAt(wx, wy, wx, wy); return }
    if (t === 'select') {
      const cur = selected()
      const z = camRef.current.z
      // line point handles
      if (cur.length === 1 && (cur[0].type === 'line' || cur[0].type === 'arrow') && !cur[0].locked) {
        const el = cur[0]; const pts = el.points!.map((p) => [el.x + p[0], el.y + p[1]])
        const idx = pts.findIndex((p) => Math.hypot(p[0] - wx, p[1] - wy) < 9 / z)
        if (idx >= 0) { opRef.current = { k: 'point', id: el.id, index: idx, before }; return }
        for (let i = 0; i < pts.length - 1; i++) {
          const m = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2]
          if (Math.hypot(m[0] - wx, m[1] - wy) < 8 / z) {
            const np = [...el.points!]; np.splice(i + 1, 0, [m[0] - el.x, m[1] - el.y])
            setEls(elsRef.current.map((x) => (x.id === el.id ? { ...x, points: np } : x)), { ui: false })
            opRef.current = { k: 'point', id: el.id, index: i + 1, before }; return
          }
        }
      }
      // resize handles
      if (cur.length && !cur.every((c) => c.locked) && !(cur.length === 1 && (cur[0].type === 'line' || cur[0].type === 'arrow'))) {
        const B = unionBounds(cur)!
        const h = handles(B).find(([, hx, hy]) => Math.abs(hx - wx) < 7 / z && Math.abs(hy - wy) < 7 / z)
        if (h) { opRef.current = { k: 'resize', handle: h[0], box: B, orig: new Map(cur.map((c) => [c.id, c])), before }; return }
      }
      const target = topHit(wx, wy)
      if (target) {
        const ids = expand([target.id])
        let next: Set<string>
        if (e.shiftKey) { next = new Set(selRef.current); const all = [...ids].every((i) => next.has(i)); ids.forEach((i) => (all ? next.delete(i) : next.add(i))) }
        else next = selRef.current.has(target.id) ? selRef.current : ids
        if (e.altKey) {
          // alt-drag duplicates
          const dup = cloneEls(elsRef.current.filter((x) => next.has(x.id)), 0, 0)
          elsRef.current = [...elsRef.current, ...dup]; next = new Set(dup.map((d) => d.id))
        }
        setSel(next)
        const moving = elsRef.current.filter((x) => next.has(x.id) && !x.locked)
        if (moving.length) opRef.current = { k: 'move', start: [wx, wy], orig: new Map(moving.map((m) => [m.id, m])), box: unionBounds(moving)!, before }
        return
      }
      if (!e.shiftKey) setSel(new Set())
      opRef.current = { k: 'marquee', start: [wx, wy], cur: [wx, wy], base: e.shiftKey ? new Set(selRef.current) : new Set() }
      return
    }
    if (t === 'rectangle' || t === 'diamond' || t === 'ellipse' || t === 'frame') {
      const x = snapV(wx, sn), y = snapV(wy, sn)
      const el = t === 'frame'
        ? newEl('frame', { x, y, name: `Frame ${elsRef.current.filter((f) => f.type === 'frame').length + 1}`, fill: 'transparent', fillStyle: 'none', strokeWidth: 1, rough: 0 })
        : newEl('shape', { kind: t as ShapeKind, x, y, align: 'center' })
      setSel(new Set([el.id]))
      setEls([...elsRef.current, el], { ui: false })
      opRef.current = { k: 'create', id: el.id, start: [x, y], before }
      return
    }
    if (t === 'arrow' || t === 'line') {
      const tg = bindTarget(wx, wy, '')
      let sx = snapV(wx, sn), sy = snapV(wy, sn)
      const el = newEl(t, { x: sx, y: sy, points: [[0, 0], [0, 0]], startHead: t === 'arrow' ? styleRef.current.startHead : 'none', endHead: t === 'arrow' ? styleRef.current.endHead : 'none', startBind: tg?.id ?? null, fill: 'transparent', fillStyle: 'none' })
      void sx; void sy
      setSel(new Set([el.id]))
      setEls([...elsRef.current, el], { ui: false })
      opRef.current = { k: 'line', id: el.id, before }
      return
    }
    if (t === 'freedraw') {
      const el = newEl('freedraw', { x: wx, y: wy, points: [[0, 0, e.pointerType === 'pen' ? e.pressure : 0.5]], fill: 'transparent', fillStyle: 'none' })
      setEls([...elsRef.current, el], { ui: false })
      opRef.current = { k: 'draw', id: el.id, before }
      return
    }
    if (t === 'text') {
      const existing = topHit(wx, wy, { filter: (x) => x.type === 'text' || x.type === 'sticky' || x.type === 'shape' })
      if (existing) { startEdit(existing.id, false); return }
      const el = newEl('text', { x: wx, y: wy - (styleRef.current.fontSize * LINE_H) / 2, text: '' })
      const m = textWH(el); el.w = m.w; el.h = m.h
      setEls([...elsRef.current, el], { ui: false }); setSel(new Set([el.id]))
      startEdit(el.id, true, before)
      if (!toolLock) setTool('select')
      return
    }
    if (t === 'sticky') {
      const fill = STICKY_COLORS.some((c) => c.fill === styleRef.current.fill) ? styleRef.current.fill : STICKY_COLORS[0].fill
      const el = newEl('sticky', { x: snapV(wx - 100, sn), y: snapV(wy - 100, sn), w: 200, h: 200, fill, fillStyle: 'solid', stroke: '#1e1e1e', text: '', fontSize: 22, fontFamily: styleRef.current.fontFamily, align: 'center', rough: 0 })
      setEls([...elsRef.current, el], { ui: false }); setSel(new Set([el.id]))
      startEdit(el.id, true, before)
      if (!toolLock) setTool('select')
      return
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinchRef.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()], P = pinchRef.current
      const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2
      const r = canvasRef.current!.getBoundingClientRect()
      const z = Math.min(30, Math.max(0.1, P.cam.z * (d / P.d)))
      const px = P.cx - r.left, py = P.cy - r.top
      setCam({ z, x: px - (px - P.cam.x) * (z / P.cam.z) + (cx - P.cx), y: py - (py - P.cam.y) * (z / P.cam.z) + (cy - P.cy) }, true)
      return
    }
    const [wx, wy] = toWorld(e.clientX, e.clientY)
    lastWorld.current = [wx, wy]
    const op = opRef.current
    const sn = snapRef.current && !e.ctrlKey
    if (!op) { updateCursor(wx, wy); return }
    switch (op.k) {
      case 'pan': setCam({ ...camRef.current, x: op.cx + e.clientX - op.sx, y: op.cy + e.clientY - op.sy }); break
      case 'laser': laser.current.push({ x: wx, y: wy, t: performance.now() }); requestRender(); break
      case 'erase': eraseAt(op.last[0], op.last[1], wx, wy); op.last = [wx, wy]; break
      case 'marquee': {
        op.cur = [wx, wy]
        const box = { x1: Math.min(op.start[0], wx), y1: Math.min(op.start[1], wy), x2: Math.max(op.start[0], wx), y2: Math.max(op.start[1], wy) }
        const inside = elsRef.current.filter((x) => !x.locked && boxContains(box, bounds(x))).map((x) => x.id)
        setSel(new Set([...op.base, ...expand(inside)]))
        break
      }
      case 'move': {
        let dx = wx - op.start[0], dy = wy - op.start[1]
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0 }
        if (sn) { dx = snapV(op.box.x1 + dx, true) - op.box.x1; dy = snapV(op.box.y1 + dy, true) - op.box.y1 }
        const ids = op.orig
        let next = elsRef.current.map((x) => {
          const o = ids.get(x.id); if (!o) return x
          const n: El = { ...o, x: o.x + dx, y: o.y + dy }
          if ((n.type === 'arrow' || n.type === 'line')) { if (n.startBind && !ids.has(n.startBind)) n.startBind = null; if (n.endBind && !ids.has(n.endBind)) n.endBind = null }
          return n
        })
        next = rebind(next)
        setEls(next, { ui: false })
        break
      }
      case 'resize': doResize(op, wx, wy, e.shiftKey, sn); break
      case 'create': {
        let x2 = snapV(wx, sn), y2 = snapV(wy, sn)
        let [x1, y1] = op.start
        let w = x2 - x1, h = y2 - y1
        if (e.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m }
        if (e.altKey) { x1 = op.start[0] - w; y1 = op.start[1] - h; w *= 2; h *= 2 }
        const nx = Math.min(x1, x1 + w), ny = Math.min(y1, y1 + h)
        setEls(elsRef.current.map((x) => (x.id === op.id ? { ...x, x: nx, y: ny, w: Math.abs(w), h: Math.abs(h) } : x)), { ui: false })
        break
      }
      case 'line': case 'point': {
        const el = elsRef.current.find((x) => x.id === op.id); if (!el) break
        const idx = op.k === 'line' ? el.points!.length - 1 : op.index
        let px = snapV(wx, sn), py = snapV(wy, sn)
        const isEnd = idx === 0 || idx === el.points!.length - 1
        const anchor = el.points![idx === 0 ? 1 : idx - 1] ?? [0, 0]
        if (e.shiftKey) {
          const ax = el.x + anchor[0], ay = el.y + anchor[1]
          const ang = Math.round(Math.atan2(py - ay, px - ax) / (Math.PI / 12)) * (Math.PI / 12), L = Math.hypot(px - ax, py - ay)
          px = ax + Math.cos(ang) * L; py = ay + Math.sin(ang) * L
        }
        const tg = isEnd ? bindTarget(wx, wy, el.id) : null
        hoverBind.current = tg?.id ?? null
        const np = el.points!.map((p, i) => (i === idx ? [px - el.x, py - el.y] : p))
        const patch: Partial<El> = { points: np }
        if (isEnd) { if (idx === 0) patch.startBind = tg?.id ?? null; else patch.endBind = tg?.id ?? null }
        setEls(elsRef.current.map((x) => (x.id === op.id ? { ...x, ...patch } : x)), { ui: false })
        break
      }
      case 'draw': {
        const el = elsRef.current.find((x) => x.id === op.id); if (!el) break
        const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [e.nativeEvent]
        const add = evs.map((ev) => { const [x, y] = toWorld(ev.clientX, ev.clientY); return [x - el.x, y - el.y, e.pointerType === 'pen' ? (ev as PointerEvent).pressure || 0.5 : 0.5] })
        setEls(elsRef.current.map((x) => (x.id === op.id ? { ...x, points: [...x.points!, ...add] } : x)), { ui: false })
        break
      }
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pinchRef.current) { if (pointers.current.size < 2) pinchRef.current = null; return }
    const op = opRef.current; opRef.current = null
    const cv = canvasRef.current; if (cv) cv.style.cursor = cursorFor(toolRef.current)
    if (!op) return
    const sn = snapRef.current && !e.ctrlKey
    switch (op.k) {
      case 'move': case 'resize': if (elsRef.current !== op.before) setEls(elsRef.current, { history: op.before }); break
      case 'marquee': requestRender(); break
      case 'erase': {
        const del = erasing.current
        if (del.size) { const ids = expand(del); setEls(rebind(elsRef.current.filter((x) => !ids.has(x.id))), { history: op.before }); setSel(new Set()) }
        erasing.current = new Set(); requestRender(); break
      }
      case 'create': {
        let el = elsRef.current.find((x) => x.id === op.id)!
        if (el.w < 4 && el.h < 4) {
          // click without drag → default size centred on click
          const w = el.type === 'frame' ? 640 : el.kind === 'ellipse' ? 120 : 160, h = el.type === 'frame' ? 360 : el.kind === 'ellipse' ? 120 : 100
          el = { ...el, x: snapV(op.start[0] - w / 2, sn), y: snapV(op.start[1] - h / 2, sn), w, h }
        }
        setEls(elsRef.current.map((x) => (x.id === op.id ? el : x)), { history: op.before })
        if (!toolLock) setTool('select')
        break
      }
      case 'line': case 'point': {
        hoverBind.current = null
        let el = elsRef.current.find((x) => x.id === op.id)
        if (!el) break
        const pts = el.points!
        const len = Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1])
        if (op.k === 'line' && len < 4 && pts.length === 2) {
          // click → default length arrow
          el = { ...el, points: [[0, 0], [140, 0]] }
        }
        // normalise origin to first point
        const ox = el.points![0][0], oy = el.points![0][1]
        el = { ...el, x: el.x + ox, y: el.y + oy, points: el.points!.map((p) => [p[0] - ox, p[1] - oy]) }
        const next = rebind(elsRef.current.map((x) => (x.id === op.id ? el! : x)))
        setEls(next, { history: op.before })
        if (op.k === 'line' && !toolLock) setTool('select')
        requestRender()
        break
      }
      case 'draw': {
        const el = elsRef.current.find((x) => x.id === op.id)!
        const b = bounds(el)
        setEls(elsRef.current.map((x) => (x.id === op.id ? { ...x, w: b.x2 - b.x1, h: b.y2 - b.y1 } : x)), { history: op.before })
        break
      }
    }
  }

  function eraseAt(x1: number, y1: number, x2: number, y2: number) {
    const tol = 8 / camRef.current.z
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (tol / 2)))
    let changed = false
    for (let i = 0; i <= steps; i++) {
      const x = x1 + ((x2 - x1) * i) / steps, y = y1 + ((y2 - y1) * i) / steps
      for (const el of elsRef.current) if (!el.locked && !erasing.current.has(el.id) && hit(el, x, y, tol)) { erasing.current.add(el.id); changed = true }
    }
    if (changed) requestRender()
  }

  function doResize(op: Extract<Op, { k: 'resize' }>, wx: number, wy: number, shift: boolean, sn: boolean) {
    const b0 = op.box, h = op.handle
    const px = snapV(wx, sn), py = snapV(wy, sn)
    let { x1, y1, x2, y2 } = b0
    if (h.includes('w')) x1 = px; if (h.includes('e')) x2 = px; if (h.includes('n')) y1 = py; if (h.includes('s')) y2 = py
    const w0 = Math.max(1e-6, b0.x2 - b0.x1), h0 = Math.max(1e-6, b0.y2 - b0.y1)
    const origs = [...op.orig.values()]
    const keepAspect = shift || (origs.length === 1 && (origs[0].type === 'image' || origs[0].type === 'text' || origs[0].type === 'icon')) || origs.length > 1 && origs.some((o) => o.type === 'text')
    if (keepAspect) {
      if (h.length === 2) {
        const s = Math.max(Math.abs(x2 - x1) / w0, Math.abs(y2 - y1) / h0)
        const sx = Math.sign(x2 - x1) || 1, sy = Math.sign(y2 - y1) || 1
        if (h.includes('w')) x1 = x2 - sx * w0 * s; else x2 = x1 + sx * w0 * s
        if (h.includes('n')) y1 = y2 - sy * h0 * s; else y2 = y1 + sy * h0 * s
      } else if (h === 'e' || h === 'w') { const s = (x2 - x1) / w0; const cy = (b0.y1 + b0.y2) / 2; y1 = cy - (h0 * Math.abs(s)) / 2; y2 = cy + (h0 * Math.abs(s)) / 2 }
      else { const s = (y2 - y1) / h0; const cx = (b0.x1 + b0.x2) / 2; x1 = cx - (w0 * Math.abs(s)) / 2; x2 = cx + (w0 * Math.abs(s)) / 2 }
    }
    const sx = (x2 - x1) / w0, sy = (y2 - y1) / h0
    const fx = (x: number) => x1 + (x - b0.x1) * sx, fy = (y: number) => y1 + (y - b0.y1) * sy
    let next = elsRef.current.map((x) => {
      const o = op.orig.get(x.id); if (!o) return x
      if (o.points && (o.type === 'line' || o.type === 'arrow' || o.type === 'freedraw')) {
        const n = { ...o, x: fx(o.x), y: fy(o.y), points: o.points.map((p) => [p[0] * sx, p[1] * sy, ...(p.length > 2 ? [p[2]] : [])]) }
        const bb = bounds(n); return { ...n, w: bb.x2 - bb.x1, h: bb.y2 - bb.y1 }
      }
      const ax = fx(o.x), bx = fx(o.x + o.w), ay = fy(o.y), by = fy(o.y + o.h)
      const n: El = { ...o, x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.max(1, Math.abs(bx - ax)), h: Math.max(1, Math.abs(by - ay)) }
      if (o.type === 'text') { n.fontSize = Math.max(4, (o.fontSize ?? 20) * Math.abs(sy)); const m = textWH(n); n.w = m.w; n.h = m.h }
      if (o.type === 'table') { n.h = tableHeight(n); n.w = Math.max(80, n.w) }
      if (o.type === 'sticky') { n.w = Math.max(60, n.w); n.h = Math.max(60, n.h) }
      return n
    })
    next = rebind(next)
    setEls(next, { ui: false })
  }

  const cursorFor = (t: Tool) => t === 'hand' ? 'grab' : t === 'select' ? 'default' : t === 'text' ? 'text' : t === 'eraser' ? `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="7" fill="white" stroke="black" stroke-width="1.5"/></svg>')}") 10 10, cell` : 'crosshair'
  function updateCursor(wx: number, wy: number) {
    const cv = canvasRef.current; if (!cv) return
    if (spaceRef.current) { cv.style.cursor = 'grab'; return }
    const t = toolRef.current
    if (t !== 'select' || presentRef.current != null) { cv.style.cursor = cursorFor(t); return }
    const cur = selected(), z = camRef.current.z
    if (cur.length && !(cur.length === 1 && (cur[0].type === 'line' || cur[0].type === 'arrow')) && !cur.every((c) => c.locked)) {
      const h = handles(unionBounds(cur)!).find(([, hx, hy]) => Math.abs(hx - wx) < 7 / z && Math.abs(hy - wy) < 7 / z)
      if (h) { cv.style.cursor = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' }[h[0]]; return }
    }
    if (cur.length === 1 && (cur[0].type === 'line' || cur[0].type === 'arrow')) {
      const el = cur[0]; if (el.points!.some((p) => Math.hypot(el.x + p[0] - wx, el.y + p[1] - wy) < 9 / z)) { cv.style.cursor = 'pointer'; return }
    }
    cv.style.cursor = topHit(wx, wy) ? 'move' : 'default'
  }

  /* ---------------- wheel (non-passive) ---------------- */
  useEffect(() => {
    const wr = wrapRef.current; if (!wr) return
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('[data-scroll]')) return
      e.preventDefault()
      const r = canvasRef.current!.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) { const d = Math.max(-60, Math.min(60, e.deltaY * (e.deltaMode === 1 ? 20 : 1))); zoomAt(Math.exp(-d * 0.01), e.clientX - r.left, e.clientY - r.top) }
      else { const c = camRef.current; const f = e.deltaMode === 1 ? 20 : 1; setCam({ ...c, x: c.x - (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * f, y: c.y - (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * f }) }
    }
    wr.addEventListener('wheel', onWheel, { passive: false })
    return () => wr.removeEventListener('wheel', onWheel)
  }, [])

  /* ---------------- text editing ---------------- */
  const [editText, setEditText] = useState('')
  const editStart = useRef(0)
  function startEdit(id: string, isNew: boolean, before?: El[]) {
    const el = elsRef.current.find((x) => x.id === id); if (!el || el.locked) return
    setEditText(el.type === 'table' ? [el.text ?? '', ...(el.rows ?? [])].join('\n') : el.type === 'frame' ? el.name ?? '' : el.text ?? '')
    editStart.current = performance.now()
    setEditing({ id, isNew, before: before ?? elsRef.current }); setSel(new Set([id])); requestRender()
  }
  function onEditChange(v: string) {
    setEditText(v)
    const ed = editRef.current; if (!ed) return
    setEls(elsRef.current.map((x) => {
      if (x.id !== ed.id) return x
      if (x.type === 'text') { const n = { ...x, text: v }; const m = textWH(n); const dx = x.align === 'center' ? (m.w - x.w) / 2 : x.align === 'right' ? m.w - x.w : 0; return { ...n, x: x.x - dx, w: m.w, h: m.h } }
      if (x.type === 'table') { const [title, ...rows] = v.split('\n'); const n = { ...x, text: title, rows: rows.filter((r) => r.trim().length) }; return { ...n, h: tableHeight(n) } }
      if (x.type === 'frame') return { ...x, name: v }
      if (x.type === 'sticky') { const size = x.fontSize ?? 22; const lines = wrap(v, x.w - 32, size, x.fontFamily ?? 'hand'); const need = lines.length * size * LINE_H + 32; return { ...x, text: v, h: Math.max(x.h, need) } }
      if (x.type === 'shape') { const size = x.fontSize ?? 20; const lines = wrap(v, x.w - 20, size, x.fontFamily ?? 'hand'); const need = lines.length * size * LINE_H + 24; return { ...x, text: v, h: Math.max(x.h, x.kind === 'diamond' ? need * 1.8 : need) } }
      return { ...x, text: v }
    }), { ui: false })
    bump()
  }
  function finishEdit() {
    const ed = editRef.current; if (!ed) return
    setEditing(null); editRef.current = null
    let next = elsRef.current
    const el = next.find((x) => x.id === ed.id)
    if (el && el.type === 'text' && !(el.text ?? '').trim()) { next = next.filter((x) => x.id !== ed.id); setSel(new Set()) }
    next = rebind(next)
    const unchanged = next.length === ed.before.length && next.every((x, i) => x === ed.before[i])
    if (!unchanged) setEls(next, { history: ed.before }); else { elsRef.current = next; requestRender(); bump() }
  }
  const onDoubleClick = (e: React.MouseEvent) => {
    if (presentRef.current != null) return
    const [wx, wy] = toWorld(e.clientX, e.clientY)
    const target = topHit(wx, wy)
    if (target) {
      if (['text', 'sticky', 'shape', 'table', 'icon', 'frame'].includes(target.type)) startEdit(target.id, false)
      return
    }
    const el = newEl('text', { x: wx, y: wy - (styleRef.current.fontSize * LINE_H) / 2, text: '' })
    const m = textWH(el); el.w = m.w; el.h = m.h
    const before = elsRef.current
    setEls([...elsRef.current, el], { ui: false })
    startEdit(el.id, true, before)
  }

  /* ---------------- actions ---------------- */
  function cloneEls(src: El[], dx: number, dy: number): El[] {
    const idMap = new Map(src.map((e) => [e.id, uid()]))
    const gMap = new Map<string, string>()
    return src.map((e) => ({
      ...e, id: idMap.get(e.id)!, x: e.x + dx, y: e.y + dy, seed: Math.floor(Math.random() * 2 ** 31), locked: false,
      groupIds: e.groupIds.map((g) => { if (!gMap.has(g)) gMap.set(g, uid()); return gMap.get(g)! }),
      startBind: e.startBind ? idMap.get(e.startBind) ?? null : e.startBind, endBind: e.endBind ? idMap.get(e.endBind) ?? null : e.endBind,
    }))
  }
  const insertEls = (els: El[]) => { commit(rebind([...elsRef.current, ...els])); setSel(new Set(els.map((e) => e.id))) }
  const pasteEls = (src: El[], at?: number[]) => {
    const b = unionBounds(src); if (!b) return
    const [cx, cy] = at ?? [b.x1 + 20 + (b.x2 - b.x1) / 2, b.y1 + 20 + (b.y2 - b.y1) / 2]
    insertEls(cloneEls(src, cx - (b.x1 + b.x2) / 2, cy - (b.y1 + b.y2) / 2))
  }
  const deleteSel = () => {
    const ids = selRef.current; if (!ids.size) return
    commit(rebind(elsRef.current.filter((e) => !ids.has(e.id) || e.locked))); setSel(new Set())
  }
  const copySel = async (cut = false) => {
    const s = selected(); if (!s.length) return
    clip.current = s
    await copyText(JSON.stringify({ type: 'openfile-sketch/clipboard', elements: s }))
    if (cut) deleteSel(); else toast(`Copied ${s.length} element${s.length > 1 ? 's' : ''}`)
  }
  const act = (a: Action) => {
    const ids = selRef.current
    const s = selected()
    const els = elsRef.current
    if (!s.length) return
    switch (a) {
      case 'dup': { const d = cloneEls(s, 20, 20); const maxIdx = Math.max(...s.map((x) => els.indexOf(x))); const next = [...els]; next.splice(maxIdx + 1, 0, ...d); commit(rebind(next)); setSel(new Set(d.map((x) => x.id))); break }
      case 'del': deleteSel(); break
      case 'copy': copySel(); break
      case 'group': { if (s.length < 2) return; const g = uid(); commit(els.map((e) => (ids.has(e.id) ? { ...e, groupIds: [...e.groupIds, g] } : e))); break }
      case 'ungroup': { commit(els.map((e) => (ids.has(e.id) && e.groupIds.length ? { ...e, groupIds: e.groupIds.slice(0, -1) } : e))); break }
      case 'lock': { const lock = !s.every((e) => e.locked); commit(els.map((e) => (ids.has(e.id) ? { ...e, locked: lock } : e))); if (lock) { setSel(new Set()); toast('Locked, use the menu to unlock all', 'info') } break }
      case 'front': commit([...els.filter((e) => !ids.has(e.id)), ...els.filter((e) => ids.has(e.id))]); break
      case 'back': commit([...els.filter((e) => ids.has(e.id)), ...els.filter((e) => !ids.has(e.id))]); break
      case 'forward': { const n = [...els]; for (let i = n.length - 2; i >= 0; i--) if (ids.has(n[i].id) && !ids.has(n[i + 1].id)) [n[i], n[i + 1]] = [n[i + 1], n[i]]; commit(n); break }
      case 'backward': { const n = [...els]; for (let i = 1; i < n.length; i++) if (ids.has(n[i].id) && !ids.has(n[i - 1].id)) [n[i], n[i - 1]] = [n[i - 1], n[i]]; commit(n); break }
      default: alignDistribute(a)
    }
  }
  function alignDistribute(a: Action) {
    const s = selected().filter((e) => !e.locked); if (s.length < 2) return
    // treat outer groups as single units
    const units = new Map<string, El[]>()
    for (const e of s) { const k = outerGroup(e) ?? e.id; (units.get(k) ?? units.set(k, []).get(k)!).push(e) }
    const list = [...units.values()].map((els) => ({ els, b: unionBounds(els)! }))
    const B = unionBounds(s)!
    const shift = new Map<string, [number, number]>()
    const put = (u: (typeof list)[0], dx: number, dy: number) => u.els.forEach((e) => shift.set(e.id, [dx, dy]))
    if (a.startsWith('al-')) for (const u of list) {
      const { b } = u
      if (a === 'al-left') put(u, B.x1 - b.x1, 0); if (a === 'al-right') put(u, B.x2 - b.x2, 0); if (a === 'al-center') put(u, (B.x1 + B.x2) / 2 - (b.x1 + b.x2) / 2, 0)
      if (a === 'al-top') put(u, 0, B.y1 - b.y1); if (a === 'al-bottom') put(u, 0, B.y2 - b.y2); if (a === 'al-middle') put(u, 0, (B.y1 + B.y2) / 2 - (b.y1 + b.y2) / 2)
    }
    if ((a === 'dist-h' || a === 'dist-v') && list.length >= 3) {
      const H = a === 'dist-h'
      list.sort((p, q) => (H ? p.b.x1 - q.b.x1 : p.b.y1 - q.b.y1))
      const total = list.reduce((acc, u) => acc + (H ? u.b.x2 - u.b.x1 : u.b.y2 - u.b.y1), 0)
      const gap = ((H ? B.x2 - B.x1 : B.y2 - B.y1) - total) / (list.length - 1)
      let pos = H ? B.x1 : B.y1
      for (const u of list) { if (H) put(u, pos - u.b.x1, 0); else put(u, 0, pos - u.b.y1); pos += (H ? u.b.x2 - u.b.x1 : u.b.y2 - u.b.y1) + gap }
    } else if (a === 'dist-h' || a === 'dist-v') { toast('Select at least 3 items to distribute', 'info'); return }
    commit(rebind(elsRef.current.map((e) => { const d = shift.get(e.id); return d ? { ...e, x: e.x + d[0], y: e.y + d[1] } : e })))
  }
  const onStyle = (p: Partial<Style>) => {
    setStyle((s) => ({ ...s, ...p }))
    const ids = selRef.current; if (!ids.size) return
    commit(rebind(elsRef.current.map((e) => {
      if (!ids.has(e.id)) return e
      const n: El = { ...e }
      if (p.stroke !== undefined) n.stroke = p.stroke
      if (p.fill !== undefined) { if (e.type !== 'sticky' || STICKY_COLORS.some((c) => c.fill === p.fill)) n.fill = p.fill; if (p.fill !== 'transparent' && n.fillStyle === 'none' && e.type !== 'sticky') n.fillStyle = p.fillStyle ?? 'hachure' }
      if (p.fillStyle !== undefined && e.type !== 'sticky') n.fillStyle = p.fillStyle
      if (p.strokeWidth !== undefined) n.strokeWidth = p.strokeWidth
      if (p.strokeStyle !== undefined) n.strokeStyle = p.strokeStyle
      if (p.opacity !== undefined) n.opacity = p.opacity
      if (p.rough !== undefined) n.rough = p.rough
      if (p.roundness !== undefined) n.roundness = p.roundness
      if (p.startHead !== undefined && (e.type === 'arrow' || e.type === 'line')) n.startHead = p.startHead
      if (p.endHead !== undefined && (e.type === 'arrow' || e.type === 'line')) n.endHead = p.endHead
      if (p.fontFamily !== undefined) n.fontFamily = p.fontFamily
      if (p.fontSize !== undefined) n.fontSize = p.fontSize
      if (p.align !== undefined) n.align = p.align
      if (n.type === 'text' && (p.fontSize !== undefined || p.fontFamily !== undefined)) { const m = textWH(n); n.w = m.w; n.h = m.h }
      if (n.type === 'table' && p.fontSize !== undefined) n.h = tableHeight(n)
      return n
    })))
  }
  const insertStencil = (id: string, at?: number[]) => {
    const st = STENCILS.find((s) => s.id === id); if (!st) return
    const [x, y] = at ?? viewCenter()
    const els = st.make(snapV(x, snapRef.current), snapV(y, snapRef.current), styleRef.current)
    insertEls(els)
    setTool('select')
    if (els[0].type === 'sticky') startEdit(els[0].id, false)
  }

  /* ---------------- images ---------------- */
  async function insertImage(file: File, at?: number[]) {
    try {
      const url = URL.createObjectURL(file)
      const img = new Image(); img.src = url; await img.decode()
      const max = 1600
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s))
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      const src = file.type === 'image/jpeg' ? c.toDataURL('image/jpeg', 0.86) : file.type === 'image/svg+xml' || file.size < 400_000 ? c.toDataURL('image/png') : c.toDataURL('image/webp', 0.9)
      const disp = Math.min(1, 420 / Math.max(c.width, c.height))
      const w = c.width * disp, h = c.height * disp
      const [x, y] = at ?? viewCenter()
      insertEls([newEl('image', { x: x - w / 2, y: y - h / 2, w, h, src, fill: 'transparent', fillStyle: 'none', rough: 0 })])
      setTool('select')
    } catch { toast('Could not read that image', 'error') }
  }

  /* ---------------- files: save / open / import / export / share ---------------- */
  const sceneJson = (els = elsRef.current) => JSON.stringify({ type: 'openfile-sketch', version: 1, source: 'https://openfile.app', elements: els, bg: bgRef.current }, null, 0)
  const saveFile = () => { const name = (index.boards.find((b) => b.id === index.current)?.name || 'board').replace(/[^\w-]+/g, '-'); downloadBlob(sceneJson(), `${name}.openfile.json`, 'application/json'); toast('Saved .openfile.json') }
  const parseScene = (text: string): { elements: El[]; bg?: string } => {
    const v = JSON.parse(text)
    const arr = Array.isArray(v) ? v : v?.elements
    if (!Array.isArray(arr)) throw new Error('No elements in this file')
    const elements = arr.map(sanitize).filter(Boolean) as El[]
    return { elements, bg: typeof v?.bg === 'string' ? v.bg : undefined }
  }
  const openFile = async (f: File, mode: 'new' | 'merge') => {
    try {
      const sc = parseScene(await f.text())
      if (mode === 'merge') { const at = viewCenter(); pasteEls(sc.elements, at); toast(`Imported ${sc.elements.length} elements`) }
      else { createBoard(f.name.replace(/\.openfile\.json$|\.json$/i, ''), sc.elements, sc.bg); toast(`Opened ${f.name}`) }
    } catch (e: any) { toast(`Could not open file: ${e.message}`, 'error') }
  }
  const exportEls = () => (exportOpts.onlySelected && selRef.current.size ? selected() : elsRef.current)
  async function renderPng(els: El[], o: ExportOpts, maxDim?: number) {
    const b = contentBox(els); if (!b) return null
    const pad = o.padding
    const W = b.x2 - b.x1 + pad * 2, H = b.y2 - b.y1 + pad * 2
    let scale = o.scale
    if (maxDim) scale = Math.min(scale, maxDim / Math.max(W, H))
    scale = Math.min(scale, 16000 / Math.max(W, H), Math.sqrt(120e6 / (W * H)))
    // wait for images
    await Promise.all(els.filter((e) => e.type === 'image' && e.src).map(async (e) => { let im = images.current.get(e.src!); if (!im) { im = new Image(); im.src = e.src!; images.current.set(e.src!, im) } try { await im.decode() } catch { /* skip */ } }))
    const c = document.createElement('canvas'); c.width = Math.ceil(W * scale); c.height = Math.ceil(H * scale)
    const ctx = c.getContext('2d')!
    ctx.scale(scale, scale)
    if (o.background) { ctx.fillStyle = o.dark ? darkColor(bgRef.current) : bgRef.current; ctx.fillRect(0, 0, W, H) }
    ctx.translate(-b.x1 + pad, -b.y1 + pad)
    for (const el of sortForRender(els)) drawElement(ctx, el, { dark: o.dark, images: images.current, onImageLoad: () => {} })
    return c
  }
  useEffect(() => {
    if (!exporting) return
    let cancel = false
    renderPng(exportEls(), exportOpts, 900).then((c) => { if (!cancel) setPreview(c ? c.toDataURL('image/png') : null) })
    return () => { cancel = true }
  }, [exporting, exportOpts])
  const boardName = index.boards.find((b) => b.id === index.current)?.name || 'board'
  const fileBase = boardName.replace(/[^\w-]+/g, '-')
  const doPng = async () => { const c = await renderPng(exportEls(), exportOpts); if (c) { downloadBlob(await canvasToBlob(c), `${fileBase}${exportOpts.scale > 1 ? `@${exportOpts.scale}x` : ''}.png`); toast('PNG exported') } }
  const doSvg = () => { const svg = elementsToSvg(exportEls(), { bg: exportOpts.background ? (exportOpts.dark ? darkColor(bgRef.current) : bgRef.current) : null, dark: exportOpts.dark, padding: exportOpts.padding }); downloadBlob(svg, `${fileBase}.svg`, 'image/svg+xml'); toast('SVG exported') }
  const doCopyPng = async () => {
    try { const c = await renderPng(exportEls(), exportOpts); if (!c) return; const blob = await canvasToBlob(c); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast('Image copied to clipboard') }
    catch { toast('Your browser blocked clipboard images, use Download instead', 'error') }
  }
  const share = async () => {
    if (!elsRef.current.length) { toast('Draw something first, then share', 'info'); return }
    const { deflateSync, strToU8 } = await import('fflate')
    const bytes = deflateSync(strToU8(JSON.stringify({ v: 1, elements: elsRef.current, bg: bgRef.current })), { level: 9 })
    let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const url = `${location.origin}${location.pathname}${location.search}#sketch=${b64}`
    history.replaceState(history.state, '', url)
    const ok = await copyText(url)
    const kb = Math.round(url.length / 1024)
    toast(ok ? `Share link copied (${kb} KB)${kb > 64 ? ', large because of images; some apps truncate long links' : ''}` : 'Share link is in the address bar', ok ? 'success' : 'info')
  }

  /* ---------------- boards ---------------- */
  const persistIndex = (idx: Index) => { setIndex(idx); indexRef.current = idx; try { localStorage.setItem(IDX, JSON.stringify(idx)) } catch { /* ignore */ } }
  function loadBoardInto(id: string, idx: Index) {
    const b = readBoard(id)
    elsRef.current = b.elements; undoRef.current = []; redoRef.current = []
    setBg(b.bg ?? '#ffffff'); bgRef.current = b.bg ?? '#ffffff'
    setSel(new Set()); setEditing(null)
    persistIndex({ ...idx, current: id })
    bump()
    setTimeout(() => fitBox(contentBox(), 80, 1, false), 0)
  }
  function switchBoard(id: string) { if (id === index.current) return; saveNow(); loadBoardInto(id, indexRef.current); setBoardsOpen(false) }
  function createBoard(name?: string, elements: El[] = [], bgc?: string) {
    saveNow()
    const id = uid()
    const idx = indexRef.current
    const nm = name || `Board ${idx.boards.length + 1}`
    try { localStorage.setItem(BKEY(id), JSON.stringify({ elements, bg: bgc })) } catch { toast('Storage is full, the new board may not persist', 'error') }
    const next = { ...idx, boards: [...idx.boards, { id, name: nm, updated: Date.now() }] }
    loadBoardInto(id, next)
    return id
  }
  function deleteBoard(id: string) {
    const idx = indexRef.current
    if (!confirm(`Delete “${idx.boards.find((b) => b.id === id)?.name}”? This cannot be undone.`)) return
    localStorage.removeItem(BKEY(id))
    let boards = idx.boards.filter((b) => b.id !== id)
    if (!boards.length) boards = [{ id: uid(), name: 'Board 1', updated: Date.now() }]
    const next = { ...idx, boards }
    if (id === idx.current) loadBoardInto(boards[0].id, next); else persistIndex(next)
  }
  function duplicateBoard(id: string) {
    const src = id === index.current ? { elements: elsRef.current, bg: bgRef.current } : readBoard(id)
    createBoard(`${index.boards.find((b) => b.id === id)?.name ?? 'Board'} copy`, src.elements, src.bg)
  }
  const renameBoard = (id: string, name: string) => persistIndex({ ...indexRef.current, boards: indexRef.current.boards.map((b) => (b.id === id ? { ...b, name: name.trim() || b.name } : b)) })

  /* ---------------- mount: fonts, share hash, resize ---------------- */
  useLayoutEffect(() => {
    const wr = wrapRef.current!
    const ro = new ResizeObserver(() => requestRender())
    ro.observe(wr)
    // initial camera: fit content or centre origin
    const b = contentBox()
    if (b) fitBox(b, 80, 1, false); else setCam({ x: wr.clientWidth / 2 - 200, y: wr.clientHeight / 2 - 150, z: 1 })
    ensureFont(() => { elsRef.current = elsRef.current.map((e) => (e.type === 'text' ? { ...e, ...textWH(e) } : { ...e })); requestRender() })
    // shared scene in URL hash
    const m = location.hash.match(/^#sketch=([\w-]+)/)
    if (m) {
      import('fflate').then(({ inflateSync, strFromU8 }) => {
        try {
          const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/')
          const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
          const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
          const sc = parseScene(strFromU8(inflateSync(bytes)))
          const key = m[1].length + ':' + m[1].slice(0, 24) + m[1].slice(-24)
          const idx = indexRef.current
          const existing = idx.shares?.[key]
          if (existing && idx.boards.some((x) => x.id === existing)) { if (existing !== idx.current) switchBoard(existing) }
          else { const id = createBoard('Shared board', sc.elements, sc.bg); persistIndex({ ...indexRef.current, shares: { ...(indexRef.current.shares ?? {}), [key]: id } }); toast('Opened shared board, it is saved in your boards list') }
        } catch { toast('The share link looks corrupted', 'error') }
      })
    }
    const flush = () => saveNow()
    window.addEventListener('pagehide', flush)
    return () => { ro.disconnect(); window.removeEventListener('pagehide', flush); saveNow() }
  }, [])
  useEffect(() => { persistIndex({ ...indexRef.current, prefs: { dark, grid, snap } }); requestRender() }, [dark, grid, snap])
  useEffect(() => { scheduleSave(); requestRender() }, [bg])
  useEffect(() => { requestRender() }, [full, editing, sel])
  useEffect(() => { const t = setTimeout(requestRender, 30); return () => clearTimeout(t) }, [full])

  /* ---------------- keyboard, clipboard, drag & drop ---------------- */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const inBoard = activeRef.current || full || presentRef.current != null
      if (!inBoard || isTyping(e.target) || editRef.current) return
      const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey
      if (presentRef.current != null) {
        if (['arrowright', 'arrowdown', ' ', 'pagedown', 'enter'].includes(k)) { e.preventDefault(); goSlide(presentRef.current + 1) }
        else if (['arrowleft', 'arrowup', 'pageup', 'backspace'].includes(k)) { e.preventDefault(); goSlide(presentRef.current - 1) }
        else if (k === 'escape') stopPresent()
        else if (k === 'k') setTool('laser'); else if (k === 'h') setTool('hand')
        return
      }
      if (k === ' ' && !spaceRef.current) { spaceRef.current = true; if (canvasRef.current) canvasRef.current.style.cursor = 'grab'; e.preventDefault(); return }
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
      if (mod && k === 'y') { e.preventDefault(); redo(); return }
      if (mod && k === 'a') { e.preventDefault(); setSel(new Set(elsRef.current.filter((x) => !x.locked).map((x) => x.id))); setTool('select'); return }
      if (mod && k === 'd') { e.preventDefault(); act('dup'); return }
      if (mod && k === 'g') { e.preventDefault(); act(e.shiftKey ? 'ungroup' : 'group'); return }
      if (mod && e.shiftKey && k === 'l') { e.preventDefault(); act('lock'); return }
      if (mod && (k === ']' || k === '}')) { e.preventDefault(); act(e.shiftKey ? 'front' : 'forward'); return }
      if (mod && (k === '[' || k === '{')) { e.preventDefault(); act(e.shiftKey ? 'back' : 'backward'); return }
      if (mod && (k === '=' || k === '+')) { e.preventDefault(); zoomAt(1.2); return }
      if (mod && k === '-') { e.preventDefault(); zoomAt(1 / 1.2); return }
      if (mod && k === '0') { e.preventDefault(); zoomAt(1 / camRef.current.z); return }
      if (mod && k === "'") { e.preventDefault(); setGrid((g) => !g); return }
      if (mod && k === 's') { e.preventDefault(); saveFile(); return }
      if (mod && k === 'o') { e.preventDefault(); openRef.current?.click(); return }
      if (mod && e.shiftKey && k === 'e') { e.preventDefault(); setExportOpts((o) => ({ ...o, onlySelected: selRef.current.size > 0 })); setExporting(true); return }
      if (e.altKey && k === 'enter') { e.preventDefault(); setFull((f) => !f); return }
      if (e.altKey && e.code === 'KeyP') { e.preventDefault(); startPresent(); return }
      if (e.altKey && e.code === 'KeyS') { e.preventDefault(); setSnap((s) => !s); return }
      if (e.altKey && e.shiftKey && e.code === 'KeyD') { e.preventDefault(); setDark((d) => !d); return }
      if (e.shiftKey && (e.code === 'Digit1')) { e.preventDefault(); fitBox(contentBox()); return }
      if (e.shiftKey && (e.code === 'Digit2')) { e.preventDefault(); fitBox(unionBounds(selected()) ?? contentBox()); return }
      if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSel(); return }
      if (k === 'escape') { if (full && !selRef.current.size) setFull(false); setSel(new Set()); setTool('select'); setMenu(false); return }
      if (k === 'enter' && selRef.current.size === 1) { const el = selected()[0]; if (['text', 'sticky', 'shape', 'table', 'icon', 'frame'].includes(el.type)) { e.preventDefault(); startEdit(el.id, false) } return }
      if (k.startsWith('arrow') && selRef.current.size) {
        e.preventDefault()
        const d = e.shiftKey ? (snapRef.current ? GRID : 10) : 1
        const dx = k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0, dy = k === 'arrowup' ? -d : k === 'arrowdown' ? d : 0
        const ids = selRef.current
        commit(rebind(elsRef.current.map((x) => (ids.has(x.id) && !x.locked ? { ...x, x: x.x + dx, y: x.y + dy } : x))))
        return
      }
      if (e.key === '?' || (e.shiftKey && k === '/')) { setHelp(true); return }
      if (mod || e.altKey) return
      if (k === 'q') { setToolLock((l) => { toast(l ? 'Tool lock off' : 'Tool lock on, tools stay active after drawing', 'info'); return !l }); return }
      const t = KEYMAP[k]
      if (t) { e.preventDefault(); pickTool(t) }
    }
    const up = (e: KeyboardEvent) => { if (e.key === ' ') { spaceRef.current = false; if (canvasRef.current) canvasRef.current.style.cursor = cursorFor(toolRef.current) } }
    const outside = (e: PointerEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) activeRef.current = false }
    const onCopy = (e: ClipboardEvent) => {
      if (!activeRef.current || isTyping(e.target) || editRef.current || !selRef.current.size) return
      e.preventDefault(); const s = selected(); clip.current = s
      e.clipboardData?.setData('text/plain', JSON.stringify({ type: 'openfile-sketch/clipboard', elements: s }))
    }
    const onCut = (e: ClipboardEvent) => { if (!activeRef.current || isTyping(e.target) || editRef.current || !selRef.current.size) return; onCopy(e); deleteSel() }
    const onPaste = (e: ClipboardEvent) => {
      if (!activeRef.current || isTyping(e.target) || editRef.current || presentRef.current != null) return
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
      if (files.length) { e.preventDefault(); files.forEach((f) => insertImage(f, lastWorld.current)); return }
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (!text) { if (clip.current) pasteEls(clip.current, lastWorld.current); return }
      e.preventDefault()
      try { const v = JSON.parse(text); if (v?.type === 'openfile-sketch/clipboard' || v?.type === 'openfile-sketch') { const els = (v.elements as any[]).map(sanitize).filter(Boolean) as El[]; pasteEls(els, lastWorld.current); return } } catch { /* plain text */ }
      if (/^<svg[\s\S]*<\/svg>\s*$/i.test(text.trim())) { insertImage(new File([text], 'pasted.svg', { type: 'image/svg+xml' }), lastWorld.current); return }
      const el = newEl('text', { x: lastWorld.current[0], y: lastWorld.current[1], text: text.slice(0, 5000) }); const m = textWH(el); el.w = m.w; el.h = m.h
      insertEls([el])
    }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('pointerdown', outside, true)
    window.addEventListener('copy', onCopy); window.addEventListener('cut', onCut); window.addEventListener('paste', onPaste)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('pointerdown', outside, true); window.removeEventListener('copy', onCopy); window.removeEventListener('cut', onCut); window.removeEventListener('paste', onPaste) }
  })

  const pickTool = (t: Tool) => {
    if (t === 'image') { fileRef.current?.click(); return }
    if (editRef.current) finishEdit()
    setTool(t)
    if (t !== 'select') setSel(new Set())
    if (canvasRef.current) canvasRef.current.style.cursor = cursorFor(t)
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const [wx, wy] = toWorld(e.clientX, e.clientY)
    const st = e.dataTransfer.getData('application/x-openfile-stencil')
    if (st) { insertStencil(st, [wx, wy]); return }
    const files = Array.from(e.dataTransfer.files)
    for (const f of files) {
      if (f.type.startsWith('image/')) insertImage(f, [wx, wy])
      else if (f.name.endsWith('.json')) openFile(f, 'merge')
    }
  }

  /* ---------------- derived UI ---------------- */
  const selEls = elsRef.current.filter((e) => sel.has(e.id))
  const showProps = present == null && (selEls.length > 0 || !['select', 'hand', 'eraser', 'laser', 'image'].includes(tool))
  const zoomPct = Math.round(camRef.current.z * 100)
  const ed = editing ? elsRef.current.find((e) => e.id === editing.id) : null
  const slideCount = present != null ? slides().length : 0
  const empty = elsRef.current.length === 0

  // text editor overlay geometry
  let editorStyle: React.CSSProperties | null = null
  if (ed) {
    const c = camRef.current, z = c.z
    const size = (ed.type === 'frame' ? 14 : ed.fontSize ?? 20) * z
    const fam = ed.type === 'frame' ? 'normal' : ed.type === 'table' ? 'code' : ed.fontFamily ?? 'hand'
    const base: React.CSSProperties = { position: 'absolute', fontSize: size, lineHeight: LINE_H, fontFamily: FONT[fam], fontWeight: fam === 'hand' ? 500 : 400, color: dark ? darkColor(ed.stroke) : ed.stroke, background: 'transparent', border: 'none', outline: 'none', resize: 'none', overflow: 'hidden', padding: 0, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', zIndex: 20 }
    const lines = Math.max(1, editText.split('\n').length)
    if (ed.type === 'text') editorStyle = { ...base, left: ed.x * z + c.x, top: ed.y * z + c.y, width: Math.max(ed.w + (ed.fontSize ?? 20), 40) * z, height: Math.max(ed.h, (ed.fontSize ?? 20) * LINE_H) * z + 4, textAlign: ed.align ?? 'left', whiteSpace: 'pre' }
    else if (ed.type === 'sticky' || ed.type === 'shape') {
      const pad = ed.type === 'sticky' ? 16 : 10
      const bw = ed.type === 'shape' ? (ed.kind === 'diamond' ? ed.w * 0.55 : ed.kind === 'ellipse' ? ed.w * 0.7 : ed.kind === 'hexagon' || ed.kind === 'parallelogram' ? ed.w * 0.65 : ed.w - 20) : ed.w - pad * 2
      const wrapped = wrap(editText || ' ', Math.max(20, bw), ed.fontSize ?? 20, ed.fontFamily ?? 'hand').length
      const th = wrapped * (ed.fontSize ?? 20) * LINE_H
      const top = ed.type === 'sticky' ? ed.y + Math.max(pad, (ed.h - th) / 2) : ed.y + ed.h / 2 - th / 2
      editorStyle = { ...base, left: (ed.x + (ed.w - bw) / 2) * z + c.x, top: top * z + c.y, width: bw * z, height: th * z + 6, textAlign: ed.type === 'sticky' ? ed.align ?? 'center' : 'center', color: dark ? darkColor(ed.stroke) : ed.stroke }
    } else if (ed.type === 'table') editorStyle = { ...base, fontFamily: FONT.code, fontSize: 13 * Math.min(1.5, Math.max(0.8, z)), lineHeight: 1.5, left: ed.x * z + c.x, top: (ed.y + ed.h + 8) * z + c.y, width: Math.max(260, ed.w * z), height: (lines + 1) * 13 * 1.5 * Math.min(1.5, Math.max(0.8, z)) + 16, background: 'var(--surface)', color: 'var(--fg)', border: '1px solid var(--accent)', borderRadius: 10, padding: 8, boxShadow: '0 10px 30px rgba(0,0,0,.25)', whiteSpace: 'pre' }
    else if (ed.type === 'icon') editorStyle = { ...base, fontFamily: FONT[ed.fontFamily ?? 'normal'], left: (ed.x - 40) * z + c.x, top: (ed.y + ed.h - (ed.fontSize ?? 16) * LINE_H - 4) * z + c.y, width: (ed.w + 80) * z, height: (ed.fontSize ?? 16) * LINE_H * 2 * z + 4, textAlign: 'center', background: dark ? '#121212cc' : '#ffffffcc' }
    else if (ed.type === 'frame') editorStyle = { ...base, left: ed.x * z + c.x, top: ed.y * z + c.y - 26, width: Math.max(160, ed.w * z * 0.6), height: 22, fontSize: 14, color: 'var(--fg)', background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 6, padding: '0 6px', whiteSpace: 'pre' }
  }

  const btn = 'grid size-9 shrink-0 place-items-center rounded-lg text-fg/80 transition hover:bg-surface-2 hover:text-fg cursor-pointer disabled:opacity-40 disabled:pointer-events-none'
  const panel = 'rounded-xl border border-border bg-surface/95 shadow-lg backdrop-blur'

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={cn('relative select-none overflow-hidden border border-border outline-none', full || present != null ? 'fixed inset-0 z-50 h-auto rounded-none' : 'h-[80vh] min-h-[520px] rounded-2xl')}
      style={{ background: dark ? darkColor(bg) : bg }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 touch-none" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onDoubleClick={onDoubleClick} onContextMenu={(e) => e.preventDefault()} style={{ cursor: cursorFor(tool) }} />

      {ed && editorStyle && (
        <textarea autoFocus value={editText} spellCheck={false} onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) || (ed.type === 'frame' && e.key === 'Enter')) { e.preventDefault(); finishEdit() } e.stopPropagation() }}
          onBlur={(e) => { if (performance.now() - editStart.current < 300) { const t = e.target; setTimeout(() => t.focus(), 0); return } finishEdit() }} style={editorStyle} placeholder={ed.type === 'table' ? 'table_name\ncolumn  type PK\n…' : ''} className="placeholder:text-muted/60" />
      )}

      {empty && present == null && !editing && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-md text-center" style={{ color: dark ? '#9aa0ae' : '#868e96' }}>
            <Pen className="mx-auto mb-3 size-8 opacity-60" />
            <div className="text-3xl" style={{ fontFamily: FONT.hand }}>Your infinite whiteboard</div>
            <p className="mt-2 text-sm">Pick a tool (or press <b>2</b>–<b>7</b>), double-click for text, drag stencils from the library, paste images. Press <b>?</b> for all shortcuts. Everything autosaves in this browser.</p>
          </motion.div>
        </div>
      )}

      {present == null && <>
        {/* top bar */}
        <div className="pointer-events-none absolute inset-x-2 top-2 z-30 flex items-start gap-2">
          <div className="pointer-events-auto relative flex shrink-0 items-center gap-1">
            <div className={cn(panel, 'flex items-center p-1')}>
              <button className={btn} title="Menu" onClick={() => { setMenu((m) => !m); setBoardsOpen(false) }}><Menu className="size-4" /></button>
              <button className="flex h-9 max-w-[140px] items-center gap-1 rounded-lg px-2 text-sm font-medium hover:bg-surface-2 cursor-pointer" onClick={() => { setBoardsOpen((b) => !b); setMenu(false) }} title="Boards / pages"><span className="truncate">{boardName}</span><ChevronDown className="size-3.5 shrink-0 text-muted" /></button>
            </div>
            <AnimatePresence>
              {menu && <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} data-scroll className={cn(panel, 'absolute left-0 top-12 w-64 space-y-0.5 p-1.5 text-sm max-h-[60vh] overflow-y-auto scrollbar-thin')}>
                {[
                  [FolderOpen, 'Open (.openfile.json)', 'Ctrl+O', () => openRef.current?.click()],
                  [Save, 'Save to file', 'Ctrl+S', saveFile],
                  [FileUp, 'Import JSON into board', '', () => importRef.current?.click()],
                  [Download, 'Export image…', 'Ctrl+Shift+E', () => { setExportOpts((o) => ({ ...o, onlySelected: sel.size > 0 })); setExporting(true) }],
                  [Share2, 'Copy share link', '', share],
                  [Presentation, 'Present', 'Alt+P', startPresent],
                ].map(([I, l, k, fn]: any) => <button key={l} onClick={() => { setMenu(false); fn() }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2 cursor-pointer"><I className="size-4 text-muted" /><span className="flex-1">{l}</span><span className="font-mono text-[10px] text-muted">{k}</span></button>)}
                <div className="my-1 border-t border-border" />
                <button onClick={() => setDark((d) => !d)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-surface-2 cursor-pointer">{dark ? <Sun className="size-4 text-muted" /> : <Moon className="size-4 text-muted" />}<span className="flex-1 text-left">{dark ? 'Light canvas' : 'Dark canvas'}</span></button>
                <button onClick={() => setGrid((g) => !g)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-surface-2 cursor-pointer"><Grid3x3 className="size-4 text-muted" /><span className="flex-1 text-left">Grid</span><span className={cn('text-[10px] font-semibold', grid ? 'text-accent' : 'text-muted')}>{grid ? 'ON' : 'OFF'}</span></button>
                <button onClick={() => setSnap((s) => !s)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-surface-2 cursor-pointer"><Magnet className="size-4 text-muted" /><span className="flex-1 text-left">Snap to grid</span><span className={cn('text-[10px] font-semibold', snap ? 'text-accent' : 'text-muted')}>{snap ? 'ON' : 'OFF'}</span></button>
                <div className="flex items-center gap-2 px-2.5 py-2"><Palette className="size-4 text-muted" /><span className="flex-1">Canvas</span>{BGS.map((c) => <button key={c} onClick={() => setBg(c)} className={cn('size-5 rounded-md ring-1 ring-border cursor-pointer', bg === c && 'ring-2 ring-accent')} style={{ background: dark ? darkColor(c) : c }} />)}</div>
                <div className="my-1 border-t border-border" />
                <button onClick={() => { commit(elsRef.current.map((e) => (e.locked ? { ...e, locked: false } : e))); setMenu(false) }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-surface-2 cursor-pointer"><LockOpen className="size-4 text-muted" />Unlock all</button>
                <button onClick={() => { setHelp(true); setMenu(false) }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-surface-2 cursor-pointer"><Keyboard className="size-4 text-muted" /><span className="flex-1 text-left">Keyboard shortcuts</span><span className="font-mono text-[10px] text-muted">?</span></button>
                <button onClick={() => { if (elsRef.current.length && confirm('Clear the whole canvas? (You can undo.)')) { commit([]); setSel(new Set()) } setMenu(false) }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-danger hover:bg-danger/10 cursor-pointer"><Trash2 className="size-4" />Clear canvas</button>
              </motion.div>}
              {boardsOpen && <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} data-scroll className={cn(panel, 'absolute left-0 top-12 w-72 p-1.5 text-sm')}>
                <div className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">Boards · saved in this browser</div>
                <div className="max-h-72 space-y-0.5 overflow-y-auto scrollbar-thin">
                  {index.boards.map((b) => (
                    <div key={b.id} className={cn('group flex items-center gap-1 rounded-lg px-1.5 py-1', b.id === index.current ? 'bg-accent/10' : 'hover:bg-surface-2')}>
                      {renaming === b.id
                        ? <input autoFocus defaultValue={b.name} onBlur={(e) => { renameBoard(b.id, e.target.value); setRenaming(null) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null); e.stopPropagation() }} className="h-7 min-w-0 flex-1 rounded-md border border-accent bg-surface-2 px-2 text-sm outline-none" />
                        : <button onClick={() => switchBoard(b.id)} onDoubleClick={() => setRenaming(b.id)} className="min-w-0 flex-1 truncate px-1 py-1 text-left cursor-pointer">{b.name}<span className="ml-2 text-[10px] text-muted">{new Date(b.updated).toLocaleDateString()}</span></button>}
                      <button title="Rename" onClick={() => setRenaming(b.id)} className="rounded p-1 text-muted opacity-0 hover:text-fg group-hover:opacity-100 cursor-pointer"><Pen className="size-3.5" /></button>
                      <button title="Duplicate" onClick={() => duplicateBoard(b.id)} className="rounded p-1 text-muted opacity-0 hover:text-fg group-hover:opacity-100 cursor-pointer"><CopyIcon className="size-3.5" /></button>
                      <button title="Delete" onClick={() => deleteBoard(b.id)} className="rounded p-1 text-muted opacity-0 hover:text-danger group-hover:opacity-100 cursor-pointer"><Trash2 className="size-3.5" /></button>
                    </div>
                  ))}
                </div>
                <button onClick={() => { createBoard(); setBoardsOpen(false) }} className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-accent hover:bg-accent/10 cursor-pointer"><Plus className="size-4" />New board</button>
              </motion.div>}
            </AnimatePresence>
          </div>

          <div className="pointer-events-auto mx-auto min-w-0 overflow-x-auto scrollbar-thin" data-scroll>
            <div className={cn(panel, 'flex items-center gap-0.5 p-1')}>
              {TOOLS.map(({ t, icon: I, label, key }) => (
                <button key={t} title={`${label}, ${key}`} onClick={() => pickTool(t)} className={cn('relative grid size-9 shrink-0 place-items-center rounded-lg transition cursor-pointer', tool === t ? 'bg-accent text-on-accent shadow-md shadow-accent/30' : 'text-fg/75 hover:bg-surface-2 hover:text-fg')}>
                  <I className="size-[17px]" strokeWidth={tool === t ? 2.2 : 1.8} />
                  <span className={cn('absolute bottom-0.5 right-1 text-[8px] font-semibold leading-none', tool === t ? 'text-white/80' : 'text-muted')}>{key}</span>
                </button>
              ))}
              <div className="mx-0.5 h-6 w-px bg-border" />
              <button title="Keep tool active after drawing: Q" onClick={() => setToolLock((l) => !l)} className={cn(btn, toolLock && 'bg-accent/15 text-accent')}>{toolLock ? <Lock className="size-4" /> : <LockOpen className="size-4" />}</button>
            </div>
          </div>

          <div className="pointer-events-auto flex shrink-0 items-center gap-1">
            <div className={cn(panel, 'hidden items-center gap-0.5 p-1 sm:flex')}>
              <button className={btn} title="Copy share link" onClick={share}><Share2 className="size-4" /></button>
              <button className={btn} title="Present: Alt+P" onClick={startPresent}><Presentation className="size-4" /></button>
              <button className={btn} title="Export: Ctrl+Shift+E" onClick={() => { setExportOpts((o) => ({ ...o, onlySelected: sel.size > 0 })); setExporting(true) }}><Download className="size-4" /></button>
            </div>
            <div className={cn(panel, 'flex items-center gap-0.5 p-1')}>
              <button className={cn(btn, libOpen && 'bg-accent/15 text-accent')} title="Stencil library" onClick={() => setLibOpen((l) => !l)}><Library className="size-4" /></button>
              <button className={btn} title={full ? 'Exit fullscreen: Alt+Enter' : 'Fullscreen: Alt+Enter'} onClick={() => setFull((f) => !f)}>{full ? <Minimize className="size-4" /> : <Maximize className="size-4" />}</button>
            </div>
          </div>
        </div>

        {/* properties */}
        {showProps && (
          <div className="pointer-events-none absolute bottom-16 left-2 top-16 z-20 flex flex-col items-start">
            <button onClick={() => setPropsOpen((o) => !o)} className={cn(panel, 'pointer-events-auto mb-1 flex h-8 items-center gap-1.5 px-2.5 text-xs font-medium md:hidden cursor-pointer')}><Palette className="size-3.5" />{propsOpen ? 'Hide' : 'Style'}</button>
            <AnimatePresence>
              {propsOpen && <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} data-scroll className={cn(panel, 'pointer-events-auto max-h-full w-[232px] overflow-y-auto p-3 scrollbar-thin')}>
                <PropsPanel sel={selEls} style={style} tool={tool} dark={dark} onStyle={onStyle} act={act} />
              </motion.div>}
            </AnimatePresence>
          </div>
        )}

        {/* library */}
        <AnimatePresence>
          {libOpen && <motion.div initial={{ x: 320, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 320, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 32 }} data-scroll className={cn(panel, 'absolute bottom-2 right-2 top-14 z-30 w-[272px] overflow-hidden')}>
            <LibraryPanel onInsert={(id) => insertStencil(id)} onClose={() => setLibOpen(false)} />
          </motion.div>}
        </AnimatePresence>

        {/* bottom-left: zoom + history */}
        <div className="absolute bottom-2 left-2 z-30 flex items-center gap-1.5">
          <div className={cn(panel, 'flex items-center p-1')}>
            <button className={btn} title="Zoom out: Ctrl+−" onClick={() => zoomAt(1 / 1.2)}><ZoomOut className="size-4" /></button>
            <button className="h-9 min-w-14 rounded-lg px-1 font-mono text-xs hover:bg-surface-2 cursor-pointer" title="Reset zoom: Ctrl+0" onClick={() => zoomAt(1 / camRef.current.z)}>{zoomPct}%</button>
            <button className={btn} title="Zoom in: Ctrl+=" onClick={() => zoomAt(1.2)}><ZoomIn className="size-4" /></button>
            <button className={btn} title="Fit to content: Shift+1" onClick={() => fitBox(contentBox())}><Scan className="size-4" /></button>
          </div>
          <div className={cn(panel, 'flex items-center p-1')}>
            <button className={btn} title="Undo: Ctrl+Z" disabled={!undoRef.current.length} onClick={undo}><Undo2 className="size-4" /></button>
            <button className={btn} title="Redo: Ctrl+Y" disabled={!redoRef.current.length} onClick={redo}><Redo2 className="size-4" /></button>
          </div>
          <div className={cn(panel, 'hidden items-center p-1 sm:flex')}>
            <button className={cn(btn, grid && 'text-accent')} title="Toggle grid: Ctrl+'" onClick={() => setGrid((g) => !g)}><Grid3x3 className="size-4" /></button>
            <button className={cn(btn, snap && 'text-accent')} title="Snap to grid: Alt+S" onClick={() => setSnap((s) => !s)}><Magnet className="size-4" /></button>
            <button className={btn} title="Dark / light canvas" onClick={() => setDark((d) => !d)}>{dark ? <Sun className="size-4" /> : <Moon className="size-4" />}</button>
          </div>
        </div>
        {!libOpen && <button onClick={() => setHelp(true)} title="Keyboard shortcuts, ?" className={cn(panel, 'absolute bottom-2 right-2 z-30 grid size-10 place-items-center text-muted hover:text-fg cursor-pointer')}><Keyboard className="size-4" /></button>}
      </>}

      {/* presentation controls */}
      {present != null && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cn(panel, 'absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 p-1.5')}>
          <button className={btn} title="Previous, ←" disabled={present <= 0} onClick={() => goSlide(present - 1)}><ChevronLeft className="size-5" /></button>
          <span className="min-w-16 text-center font-mono text-sm">{present + 1} / {slideCount}</span>
          <button className={btn} title="Next, →" disabled={present >= slideCount - 1} onClick={() => goSlide(present + 1)}><ChevronRight className="size-5" /></button>
          <div className="mx-1 h-6 w-px bg-border" />
          <button className={cn(btn, tool === 'laser' && 'bg-accent/15 text-accent')} title="Laser pointer: K" onClick={() => setTool('laser')}><Wand className="size-4" /></button>
          <button className={cn(btn, tool === 'hand' && 'bg-accent/15 text-accent')} title="Pan: H" onClick={() => setTool('hand')}><Hand className="size-4" /></button>
          <button className={btn} title="Exit: Esc" onClick={stopPresent}><X className="size-4" /></button>
        </motion.div>
      )}

      {help && <HelpModal onClose={() => setHelp(false)} />}
      {exporting && <ExportDialog hasSelection={sel.size > 0} preview={preview} opts={exportOpts} setOpts={setExportOpts} onPng={doPng} onSvg={doSvg} onCopy={doCopyPng} onJson={saveFile} onClose={() => { setExporting(false); setPreview(null) }} />}

      <input ref={fileRef} type="file" accept="image/*" hidden multiple onChange={(e) => { Array.from(e.target.files ?? []).forEach((f, i) => { const [x, y] = viewCenter(); insertImage(f, [x + i * 30, y + i * 30]) }); e.target.value = '' }} />
      <input ref={openRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openFile(f, 'new'); e.target.value = '' }} />
      <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openFile(f, 'merge'); e.target.value = '' }} />
    </div>
  )
}
