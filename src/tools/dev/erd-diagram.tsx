import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, LayoutGrid, Maximize, ZoomIn, ZoomOut, Undo2, Redo2, Upload, Download, Trash2, KeyRound, ArrowUp, ArrowDown, X, Database, FileCode2, Image as ImageIcon, Link2, Table2, Sparkles, ArrowLeftRight } from 'lucide-react'
import { Button, Card, Input, Select, Textarea, CopyButton, Segmented, cn } from '@/components/ui'
import { downloadBlob, canvasToBlob } from '@/lib/files'
import { toast } from '@/components/toast'
import { CodeView, downloadText, useStored } from './_dev/kit'
import { type Model, type Table, type Col, type Rel, type Kind, sample, importSql, autoLayout, toSql, toPrisma, toDrizzle, tableWidth, tableHeight, uid, COLORS, TYPES, ROW, HEAD } from './_dev/erd'

const INITIAL: Model = sample()
type Sel = { kind: 'table'; id: string } | { kind: 'rel'; id: string } | null
type ExportKind = 'postgres' | 'mysql' | 'prisma' | 'drizzle' | 'json'

export default function ErdDiagram() {
  const [model, setModelRaw] = useStored<Model>('erd:model', INITIAL)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [sel, setSel] = useState<Sel>(null)
  const [panel, setPanel] = useState<'none' | 'import' | 'export'>('none')
  const [exp, setExp] = useState<ExportKind>('postgres')
  const [link, setLink] = useState<{ t: string; c: string; x0: number; y0: number; x: number; y: number } | null>(null)
  const hist = useRef<{ past: Model[]; future: Model[] }>({ past: [], future: [] })
  const [, force] = useState(0)
  const svg = useRef<SVGSVGElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const drag = useRef<{ mode: 'pan' | 'table'; id?: string; sx: number; sy: number; ox: number; oy: number; moved?: boolean } | null>(null)

  const commit = useCallback((next: Model | ((m: Model) => Model)) => {
    setModelRaw((cur) => { const n = typeof next === 'function' ? next(cur) : next; hist.current.past.push(cur); if (hist.current.past.length > 80) hist.current.past.shift(); hist.current.future = []; return n })
    force((x) => x + 1)
  }, [setModelRaw])
  const undo = () => { const p = hist.current.past.pop(); if (!p) return; hist.current.future.push(model); setModelRaw(p); force((x) => x + 1) }
  const redo = () => { const f = hist.current.future.pop(); if (!f) return; hist.current.past.push(model); setModelRaw(f); force((x) => x + 1) }

  const byId = useMemo(() => new Map(model.tables.map((t) => [t.id, t])), [model])
  const fkCols = useMemo(() => new Set(model.rels.filter((r) => r.kind !== 'N:M').map((r) => r.from.c)), [model])

  // ---- view helpers
  const toWorld = (cx: number, cy: number) => { const r = svg.current!.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k } }
  const fit = useCallback((m = model) => {
    const el = wrap.current; if (!el || !m.tables.length) return
    const minX = Math.min(...m.tables.map((t) => t.x)), minY = Math.min(...m.tables.map((t) => t.y))
    const maxX = Math.max(...m.tables.map((t) => t.x + tableWidth(t))), maxY = Math.max(...m.tables.map((t) => t.y + tableHeight(t)))
    const W = el.clientWidth, H = el.clientHeight, pad = 40
    const k = Math.min(1.4, Math.max(0.2, Math.min((W - pad * 2) / (maxX - minX || 1), (H - pad * 2) / (maxY - minY || 1))))
    setView({ k, x: (W - (maxX - minX) * k) / 2 - minX * k, y: (H - (maxY - minY) * k) / 2 - minY * k })
  }, [model])
  useEffect(() => { const t = setTimeout(() => fit(), 50); return () => clearTimeout(t) }, [])

  useEffect(() => {
    const el = svg.current; if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top
      setView((v) => {
        if (!e.ctrlKey && !e.metaKey && e.deltaX !== 0) return { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY } // trackpad two-finger pan
        const k = Math.min(2.5, Math.max(0.15, v.k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))))
        return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo() }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); sel.kind === 'table' ? removeTable(sel.id) : commit((m) => ({ ...m, rels: m.rels.filter((r) => r.id !== sel.id) })); setSel(null) }
      else if (e.key === 'Escape') { setSel(null); setLink(null) }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  })

  // ---- pointer interaction
  const onBgDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return
    drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y }
    svg.current?.setPointerCapture(e.pointerId)
  }
  const onTableDown = (e: React.PointerEvent, t: Table) => {
    e.stopPropagation(); if (e.button !== 0) return
    setSel({ kind: 'table', id: t.id })
    drag.current = { mode: 'table', id: t.id, sx: e.clientX, sy: e.clientY, ox: t.x, oy: t.y }
    svg.current?.setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if (link) { const w = toWorld(e.clientX, e.clientY); setLink({ ...link, x: w.x, y: w.y }); return }
    const d = drag.current; if (!d) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    if (d.mode === 'pan') setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }))
    else {
      if (!d.moved && Math.abs(dx) + Math.abs(dy) > 2) { d.moved = true; hist.current.past.push(model); hist.current.future = [] }
      if (d.moved) { const nx = Math.round((d.ox + dx / view.k) / 10) * 10, ny = Math.round((d.oy + dy / view.k) / 10) * 10; setModelRaw((m) => ({ ...m, tables: m.tables.map((t) => (t.id === d.id ? { ...t, x: nx, y: ny } : t)) })) }
    }
  }
  const onUp = (e: React.PointerEvent) => {
    if (link) {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-col],[data-table]') as HTMLElement | null
      if (el) {
        const tId = el.getAttribute('data-t') ?? el.getAttribute('data-table')!
        const target = byId.get(tId); let cId = el.getAttribute('data-col')
        if (!cId && target) cId = (target.cols.find((c) => c.pk) ?? target.cols[0])?.id ?? null
        if (target && cId && !(tId === link.t && cId === link.c)) {
          const src = byId.get(link.t)!.cols.find((c) => c.id === link.c)
          const tc = target.cols.find((c) => c.id === cId)
          const kind: Kind = src?.unique || (src?.pk && tc?.pk) ? '1:1' : '1:N'
          const r: Rel = { id: uid('r'), from: { t: link.t, c: link.c }, to: { t: tId, c: cId }, kind }
          commit((m) => ({ ...m, rels: [...m.rels, r] })); setSel({ kind: 'rel', id: r.id }); toast(`Relation created (${kind})`, 'info')
        }
      }
      setLink(null)
    }
    if (drag.current?.mode === 'pan' && Math.abs(e.clientX - drag.current.sx) + Math.abs(e.clientY - drag.current.sy) < 3) setSel(null)
    drag.current = null
  }
  const startLink = (e: React.PointerEvent, t: Table, c: Col, side: 'l' | 'r') => {
    e.stopPropagation()
    const i = t.cols.indexOf(c); const y = t.y + HEAD + i * ROW + ROW / 2; const x = side === 'r' ? t.x + tableWidth(t) : t.x
    setLink({ t: t.id, c: c.id, x0: x, y0: y, x, y })
    svg.current?.setPointerCapture(e.pointerId)
  }

  // ---- model ops
  const addTable = () => {
    const el = wrap.current; const cx = el ? (el.clientWidth / 2 - view.x) / view.k : 100, cy = el ? (el.clientHeight / 2 - view.y) / view.k : 100
    let name = 'new_table', i = 1; while (model.tables.some((t) => t.name === name)) name = `new_table_${i++}`
    const t: Table = { id: uid('t'), name, x: Math.round((cx - 110) / 10) * 10, y: Math.round((cy - 60) / 10) * 10, color: COLORS[model.tables.length % COLORS.length], cols: [{ id: uid('c'), name: 'id', type: 'serial', pk: true }, { id: uid('c'), name: 'created_at', type: 'timestamptz', def: 'now()' }] }
    commit((m) => ({ ...m, tables: [...m.tables, t] })); setSel({ kind: 'table', id: t.id })
  }
  const removeTable = (id: string) => commit((m) => ({ tables: m.tables.filter((t) => t.id !== id), rels: m.rels.filter((r) => r.from.t !== id && r.to.t !== id) }))
  const updTable = (id: string, fn: (t: Table) => Table) => commit((m) => ({ ...m, tables: m.tables.map((t) => (t.id === id ? fn(t) : t)) }))
  const updRel = (id: string, fn: (r: Rel) => Rel) => commit((m) => ({ ...m, rels: m.rels.map((r) => (r.id === id ? fn(r) : r)) }))

  // ---- export
  const exportCode = useMemo(() => {
    if (panel !== 'export') return ''
    return exp === 'json' ? JSON.stringify(model, null, 2) : exp === 'prisma' ? toPrisma(model) : exp === 'drizzle' ? toDrizzle(model) : toSql(model, exp)
  }, [panel, exp, model])
  const svgString = () => {
    if (!model.tables.length) return null
    const g = svg.current?.querySelector('[data-layer="world"]') as SVGGElement | null; if (!g) return null
    const clone = g.cloneNode(true) as SVGGElement
    clone.removeAttribute('transform'); clone.querySelectorAll('[data-export="skip"]').forEach((n) => n.remove())
    const pad = 30
    const minX = Math.min(...model.tables.map((t) => t.x)) - pad, minY = Math.min(...model.tables.map((t) => t.y)) - pad
    const W = Math.max(...model.tables.map((t) => t.x + tableWidth(t))) + pad - minX, H = Math.max(...model.tables.map((t) => t.y + tableHeight(t))) + pad - minY
    const cs = getComputedStyle(document.documentElement)
    let s = new XMLSerializer().serializeToString(clone)
    s = s.replace(/var\(--([\w-]+)\)/g, (_, v) => cs.getPropertyValue('--' + v).trim() || '#888')
    const bg = cs.getPropertyValue('--bg').trim() || '#ffffff'
    return { s: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${W} ${H}" width="${W}" height="${H}" font-family="JetBrains Mono, ui-monospace, Menlo, monospace"><rect x="${minX}" y="${minY}" width="${W}" height="${H}" fill="${bg}"/>${s}</svg>`, W, H }
  }
  const exportSvg = () => { setSel(null); requestAnimationFrame(() => { const r = svgString(); if (r) downloadText(r.s, 'schema.svg', 'image/svg+xml') }) }
  const exportPng = () => {
    setSel(null)
    requestAnimationFrame(async () => {
      const r = svgString(); if (!r) return
      const img = new Image(); const url = URL.createObjectURL(new Blob([r.s], { type: 'image/svg+xml' }))
      img.onload = async () => { const k = 2; const c = document.createElement('canvas'); c.width = r.W * k; c.height = r.H * k; const ctx = c.getContext('2d')!; ctx.scale(k, k); ctx.drawImage(img, 0, 0, r.W, r.H); URL.revokeObjectURL(url); downloadBlob(await canvasToBlob(c), 'schema.png') }
      img.onerror = () => toast('PNG export failed, try SVG', 'error'); img.src = url
    })
  }

  const selTable = sel?.kind === 'table' ? byId.get(sel.id) : undefined
  const selRel = sel?.kind === 'rel' ? model.rels.find((r) => r.id === sel.id) : undefined

  return (
    <div className="space-y-3">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border bg-surface p-2">
        <Button size="sm" icon={<Plus className="size-4" />} onClick={addTable}>Table</Button>
        <Button size="sm" variant="ghost" icon={<LayoutGrid className="size-4" />} onClick={() => { const m = autoLayout(model); commit(m); setTimeout(() => fit(m), 30) }}>Auto-layout</Button>
        <div className="mx-1 h-6 w-px bg-border" />
        <Button size="sm" variant="ghost" icon={<Undo2 className="size-4" />} onClick={undo} disabled={!hist.current.past.length} aria-label="Undo" />
        <Button size="sm" variant="ghost" icon={<Redo2 className="size-4" />} onClick={redo} disabled={!hist.current.future.length} aria-label="Redo" />
        <div className="mx-1 h-6 w-px bg-border" />
        <Button size="sm" variant="ghost" icon={<ZoomOut className="size-4" />} onClick={() => setView((v) => ({ ...v, k: Math.max(0.15, v.k / 1.2) }))} aria-label="Zoom out" />
        <button onClick={() => setView((v) => ({ ...v, k: 1 }))} className="w-12 text-center font-mono text-xs text-muted hover:text-fg">{Math.round(view.k * 100)}%</button>
        <Button size="sm" variant="ghost" icon={<ZoomIn className="size-4" />} onClick={() => setView((v) => ({ ...v, k: Math.min(2.5, v.k * 1.2) }))} aria-label="Zoom in" />
        <Button size="sm" variant="ghost" icon={<Maximize className="size-4" />} onClick={() => fit()}>Fit</Button>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Button size="sm" variant={panel === 'import' ? 'secondary' : 'ghost'} icon={<Upload className="size-4" />} onClick={() => setPanel(panel === 'import' ? 'none' : 'import')}>Import</Button>
          <Button size="sm" variant={panel === 'export' ? 'secondary' : 'ghost'} icon={<FileCode2 className="size-4" />} onClick={() => setPanel(panel === 'export' ? 'none' : 'export')}>Code</Button>
          <Button size="sm" variant="ghost" icon={<ImageIcon className="size-4" />} onClick={exportPng}>PNG</Button>
          <Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={exportSvg}>SVG</Button>
        </div>
      </div>

      <AnimatePresence>
        {panel === 'import' && <ImportPanel onClose={() => setPanel('none')} onModel={(m) => { commit(m); setSel(null); setPanel('none'); setTimeout(() => fit(m), 40) }} />}
      </AnimatePresence>

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <div ref={wrap} className="relative h-[620px] overflow-hidden rounded-2xl border border-border bg-bg">
          <svg ref={svg} className={cn('size-full touch-none select-none', drag.current?.mode === 'pan' ? 'cursor-grabbing' : 'cursor-grab')} onPointerDown={onBgDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <defs>
              <pattern id="erd-grid" width={20 * view.k} height={20 * view.k} patternUnits="userSpaceOnUse" x={view.x} y={view.y}><circle cx={1} cy={1} r={1} fill="var(--border)" /></pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#erd-grid)" />
            <g data-layer="world" transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {model.rels.map((r) => <RelPath key={r.id} r={r} byId={byId} selected={sel?.kind === 'rel' && sel.id === r.id} onSelect={() => setSel({ kind: 'rel', id: r.id })} />)}
              {model.tables.map((t) => <TableBox key={t.id} t={t} fk={fkCols} selected={sel?.kind === 'table' && sel.id === t.id} onDown={(e) => onTableDown(e, t)} onLink={startLink} linking={!!link} />)}
              {link && <path data-export="skip" d={`M${link.x0} ${link.y0} L${link.x} ${link.y}`} stroke="var(--accent)" strokeWidth={2} strokeDasharray="6 4" fill="none" />}
            </g>
          </svg>
          {model.tables.length === 0 && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="pointer-events-auto space-y-3 text-center"><Database className="mx-auto size-10 text-muted" /><div className="text-sm text-muted">Empty schema</div>
              <div className="flex gap-2"><Button size="sm" icon={<Plus className="size-4" />} onClick={addTable}>Add table</Button><Button size="sm" variant="outline" icon={<Sparkles className="size-4" />} onClick={() => { const m = sample(); commit(m); setTimeout(() => fit(m), 40) }}>Load sample</Button></div></div></div>
          )}
          <div className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-muted">Drag tables · drag empty space to pan · scroll to zoom · drag a column's ● onto another column to relate · Del removes selection</div>
        </div>

        <Card className="h-[620px] overflow-y-auto p-4 scrollbar-thin">
          <CommitCtx.Provider value={commit}>
          {selTable ? <TableEditor key={selTable.id} t={selTable} model={model} upd={(fn) => updTable(selTable.id, fn)} remove={() => { removeTable(selTable.id); setSel(null) }} close={() => setSel(null)} />
            : selRel ? <RelEditor r={selRel} byId={byId} upd={(fn) => updRel(selRel.id, fn)} remove={() => { commit((m) => ({ ...m, rels: m.rels.filter((x) => x.id !== selRel.id) })); setSel(null) }} close={() => setSel(null)} />
            : <Overview model={model} onPick={setSel} onSample={() => { const m = sample(); commit(m); setTimeout(() => fit(m), 40) }} onClear={() => { if (confirm('Remove all tables?')) { commit({ tables: [], rels: [] }); setSel(null) } }} />}
          </CommitCtx.Provider>
        </Card>
      </div>

      <AnimatePresence>
        {panel === 'export' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2/40 px-3 py-2">
              <Segmented value={exp} onChange={setExp} options={[{ value: 'postgres', label: 'PostgreSQL' }, { value: 'mysql', label: 'MySQL' }, { value: 'prisma', label: 'Prisma' }, { value: 'drizzle', label: 'Drizzle' }, { value: 'json', label: 'JSON' }]} />
              <div className="ml-auto flex gap-1"><CopyButton text={exportCode} /><Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={() => downloadText(exportCode, exp === 'prisma' ? 'schema.prisma' : exp === 'drizzle' ? 'schema.ts' : exp === 'json' ? 'schema.erd.json' : `schema.${exp}.sql`)}>Download</Button><Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => setPanel('none')} aria-label="Close" /></div>
            </div>
            <CodeView code={exportCode} lang={exp === 'postgres' || exp === 'mysql' ? 'sql' : exp === 'json' ? 'json' : 'js'} className="max-h-[480px]" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------- diagram pieces ----------
function TableBox({ t, fk, selected, onDown, onLink, linking }: { t: Table; fk: Set<string>; selected: boolean; onDown: (e: React.PointerEvent) => void; onLink: (e: React.PointerEvent, t: Table, c: Col, side: 'l' | 'r') => void; linking: boolean }) {
  const w = tableWidth(t), h = tableHeight(t)
  return (
    <g transform={`translate(${t.x} ${t.y})`} data-table={t.id} className="erd-table">
      <rect x={2} y={4} width={w} height={h} rx={10} fill="#000" opacity={0.12} />
      <rect width={w} height={h} rx={10} fill="var(--surface)" stroke={selected ? 'var(--accent)' : 'var(--border)'} strokeWidth={selected ? 2 : 1} />
      <path d={`M0 10 a10 10 0 0 1 10 -10 h${w - 20} a10 10 0 0 1 10 10 v${HEAD - 10} h${-w} z`} fill={t.color} onPointerDown={onDown} style={{ cursor: 'move' }} />
      <text x={12} y={22} fill="#fff" fontSize={14} fontWeight={700} style={{ pointerEvents: 'none' }} fontFamily="Inter, system-ui, sans-serif">{t.name}</text>
      <text x={w - 10} y={22} fill="#fff" opacity={0.75} fontSize={11} textAnchor="end" style={{ pointerEvents: 'none' }} fontFamily="Inter, system-ui, sans-serif">{t.cols.length}</text>
      {t.cols.map((c, i) => {
        const y = HEAD + i * ROW
        return (
          <g key={c.id} data-col={c.id} data-t={t.id} onPointerDown={onDown} style={{ cursor: 'move' }} className="erd-row">
            <rect x={1} y={y} width={w - 2} height={ROW} fill={i % 2 ? 'var(--surface-2)' : 'var(--surface)'} opacity={i % 2 ? 0.5 : 1} />
            {c.pk ? <text x={10} y={y + 17} fontSize={10} fontWeight={700} fill="#f59e0b">PK</text> : fk.has(c.id) ? <text x={10} y={y + 17} fontSize={10} fontWeight={700} fill="#06b6d4">FK</text> : c.unique ? <text x={12} y={y + 17} fontSize={10} fontWeight={700} fill="var(--muted)">U</text> : null}
            <text x={34} y={y + 17} fontSize={12.5} fill="var(--fg)" fontWeight={c.pk ? 700 : 400} fontFamily="JetBrains Mono, ui-monospace, monospace">{c.name}</text>
            <text x={w - 12} y={y + 17} fontSize={11.5} fill="var(--muted)" textAnchor="end" fontFamily="JetBrains Mono, ui-monospace, monospace">{c.type}{c.nullable ? '?' : ''}</text>
            <g data-export="skip" className={cn('transition-opacity', linking ? 'opacity-60' : 'opacity-0 [.erd-row:hover_&]:opacity-100')}>
              <circle cx={w} cy={y + ROW / 2} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} style={{ cursor: 'crosshair' }} onPointerDown={(e) => onLink(e, t, c, 'r')} />
              <circle cx={0} cy={y + ROW / 2} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} style={{ cursor: 'crosshair' }} onPointerDown={(e) => onLink(e, t, c, 'l')} />
            </g>
          </g>
        )
      })}
      {t.cols.length === 0 && <text x={12} y={HEAD + 17} fontSize={11} fill="var(--muted)" fontStyle="italic">no columns</text>}
    </g>
  )
}

function endMarker(x: number, y: number, d: number, many: boolean, optional: boolean) {
  // d = +1 if the line leaves to the right, -1 to the left
  if (many) return `M${x + d * 16} ${y} L${x} ${y - 7} M${x + d * 16} ${y} L${x} ${y} M${x + d * 16} ${y} L${x} ${y + 7} ` + (optional ? '' : `M${x + d * 20} ${y - 7} L${x + d * 20} ${y + 7}`)
  return `M${x + d * 9} ${y - 7} L${x + d * 9} ${y + 7} ` + (optional ? '' : `M${x + d * 14} ${y - 7} L${x + d * 14} ${y + 7}`)
}

function RelPath({ r, byId, selected, onSelect }: { r: Rel; byId: Map<string, Table>; selected: boolean; onSelect: () => void }) {
  const a = byId.get(r.from.t), b = byId.get(r.to.t)
  if (!a || !b) return null
  const ai = a.cols.findIndex((c) => c.id === r.from.c), bi = b.cols.findIndex((c) => c.id === r.to.c)
  if (ai < 0 || bi < 0) return null
  const aw = tableWidth(a), bw = tableWidth(b)
  const ay = a.y + HEAD + ai * ROW + ROW / 2, by = b.y + HEAD + bi * ROW + ROW / 2
  let ax: number, bx: number, ad: number, bd: number
  if (a.x + aw + 30 < b.x) { ax = a.x + aw; bx = b.x; ad = 1; bd = -1 }
  else if (b.x + bw + 30 < a.x) { ax = a.x; bx = b.x + bw; ad = -1; bd = 1 }
  else { ax = a.x + aw; bx = b.x + bw; ad = 1; bd = 1 }
  const off = Math.max(50, Math.abs(bx - ax) / 2)
  const self = a.id === b.id
  const d = self ? `M${ax} ${ay} C${ax + 70} ${ay}, ${bx + 70} ${by}, ${bx} ${by}` : `M${ax} ${ay} C${ax + ad * off} ${ay}, ${bx + bd * off} ${by}, ${bx} ${by}`
  const fc = a.cols[ai]
  const color = selected ? 'var(--accent)' : r.kind === 'N:M' ? '#f97316' : 'var(--muted)'
  const mid = { x: (ax + bx) / 2 + (self ? 60 : 0), y: (ay + by) / 2 }
  return (
    <g onPointerDown={(e) => { e.stopPropagation(); onSelect() }} style={{ cursor: 'pointer' }}>
      <path d={d} stroke="transparent" strokeWidth={14} fill="none" />
      <path d={d} stroke={color} strokeWidth={selected ? 2.5 : 1.6} fill="none" strokeDasharray={r.kind === 'N:M' ? '6 4' : undefined} />
      <path d={endMarker(ax, ay, ad, r.kind !== '1:1', !!fc.nullable && r.kind !== 'N:M')} stroke={color} strokeWidth={1.6} fill="none" />
      <path d={endMarker(bx, by, bd, r.kind === 'N:M', !!fc.nullable && r.kind !== 'N:M')} stroke={color} strokeWidth={1.6} fill="none" />
      <g transform={`translate(${mid.x} ${mid.y})`}>
        <rect x={-17} y={-9} width={34} height={18} rx={9} fill="var(--surface)" stroke={color} strokeWidth={1} />
        <text textAnchor="middle" y={4} fontSize={10} fontWeight={700} fill={color} fontFamily="Inter, system-ui, sans-serif">{r.kind}</text>
      </g>
    </g>
  )
}

// ---------- side panels ----------
function TableEditor({ t, model, upd, remove, close }: { t: Table; model: Model; upd: (fn: (t: Table) => Table) => void; remove: () => void; close: () => void }) {
  const [name, setName] = useState(t.name)
  useEffect(() => setName(t.name), [t.name])
  const setCol = (id: string, p: Partial<Col>) => upd((x) => ({ ...x, cols: x.cols.map((c) => (c.id === id ? { ...c, ...p } : c)) }))
  const moveCol = (i: number, d: number) => upd((x) => { const c = [...x.cols]; const j = i + d; if (j < 0 || j >= c.length) return x; [c[i], c[j]] = [c[j], c[i]]; return { ...x, cols: c } })
  const rels = model.rels.filter((r) => r.from.t === t.id || r.to.t === t.id)
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Table2 className="size-4" style={{ color: t.color }} /><span className="text-xs font-semibold uppercase tracking-wide text-muted">Table</span><button onClick={close} className="ml-auto rounded p-1 text-muted hover:bg-surface-2"><X className="size-4" /></button></div>
      <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== t.name && upd((x) => ({ ...x, name: name.trim().replace(/\s+/g, '_') }))} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className="font-mono font-semibold" />
      <div className="flex flex-wrap gap-1.5">{COLORS.map((c) => <button key={c} onClick={() => upd((x) => ({ ...x, color: c }))} className={cn('size-6 rounded-full border-2 transition', t.color === c ? 'scale-110 border-fg' : 'border-transparent')} style={{ background: c }} aria-label={c} />)}</div>
      <div className="space-y-2">
        <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-muted">Columns</span><Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => upd((x) => ({ ...x, cols: [...x.cols, { id: uid('c'), name: `column_${x.cols.length + 1}`, type: 'text', nullable: true }] }))}>Add</Button></div>
        <datalist id="erd-types">{TYPES.map((ty) => <option key={ty} value={ty} />)}</datalist>
        {t.cols.map((c, i) => (
          <div key={c.id} className="space-y-1.5 rounded-xl border border-border bg-surface-2/30 p-2">
            <div className="flex gap-1.5">
              <ColName value={c.name} onCommit={(v) => setCol(c.id, { name: v })} />
              <ColName value={c.type} list="erd-types" onCommit={(v) => setCol(c.id, { type: v.toLowerCase() })} className="w-28" />
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {([['pk', 'PK'], ['unique', 'UQ'], ['nullable', 'NULL']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setCol(c.id, { [k]: !c[k], ...(k === 'pk' && !c.pk ? { nullable: false } : {}) })} className={cn('rounded-md border px-1.5 py-0.5 text-[10px] font-bold', c[k] ? 'border-accent bg-accent/15 text-accent' : 'border-border text-muted hover:text-fg')}>{l}</button>
              ))}
              <ColName value={c.def ?? ''} placeholder="default" onCommit={(v) => setCol(c.id, { def: v || undefined })} className="h-6 w-20 text-[10px]" />
              <div className="ml-auto flex">
                <button onClick={() => moveCol(i, -1)} className="rounded p-0.5 text-muted hover:text-fg"><ArrowUp className="size-3.5" /></button>
                <button onClick={() => moveCol(i, 1)} className="rounded p-0.5 text-muted hover:text-fg"><ArrowDown className="size-3.5" /></button>
                <button onClick={() => upd((x) => ({ ...x, cols: x.cols.filter((y) => y.id !== c.id) }))} className="rounded p-0.5 text-muted hover:text-danger"><Trash2 className="size-3.5" /></button>
              </div>
            </div>
            <RefPicker t={t} c={c} model={model} />
          </div>
        ))}
      </div>
      {rels.length > 0 && <div className="text-xs text-muted">{rels.length} relation{rels.length > 1 ? 's' : ''}, click a line on the canvas to edit.</div>}
      <Button variant="danger" size="sm" className="w-full" icon={<Trash2 className="size-4" />} onClick={remove}>Delete table</Button>
    </div>
  )
}

/** inline "references" picker on a column, creates/updates a relation */
function RefPicker({ t, c, model }: { t: Table; c: Col; model: Model }) {
  const ctx = useErdCommit()
  const rel = model.rels.find((r) => r.kind !== 'N:M' && r.from.t === t.id && r.from.c === c.id)
  const options = [{ value: '', label: '(no reference)' }, ...model.tables.flatMap((x) => x.cols.filter((y) => y.pk || y.unique).map((y) => ({ value: `${x.id}|${y.id}`, label: `→ ${x.name}.${y.name}` })))]
  if (!ctx) return null
  return (
    <Select value={rel ? `${rel.to.t}|${rel.to.c}` : ''} onChange={(v) => ctx((m) => {
      const rest = m.rels.filter((r) => r !== rel)
      if (!v) return { ...m, rels: rest }
      const [tt, tc] = v.split('|')
      return { ...m, rels: [...rest, { id: rel?.id ?? uid('r'), from: { t: t.id, c: c.id }, to: { t: tt, c: tc }, kind: rel?.kind ?? (c.unique ? '1:1' : '1:N'), onDelete: rel?.onDelete }] }
    })} options={options} className="h-7 text-[11px]" />
  )
}
const CommitCtx = createContext<((fn: (m: Model) => Model) => void) | null>(null)
function useErdCommit() { return useContext(CommitCtx) }

function ColName({ value, onCommit, className, list, placeholder }: { value: string; onCommit: (v: string) => void; className?: string; list?: string; placeholder?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return <input value={v} list={list} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v.trim())} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    className={cn('h-7 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 font-mono text-xs outline-none focus:border-accent', className)} />
}

function RelEditor({ r, byId, upd, remove, close }: { r: Rel; byId: Map<string, Table>; upd: (fn: (r: Rel) => Rel) => void; remove: () => void; close: () => void }) {
  const a = byId.get(r.from.t), b = byId.get(r.to.t)
  const fc = a?.cols.find((c) => c.id === r.from.c), tc = b?.cols.find((c) => c.id === r.to.c)
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Link2 className="size-4 text-accent" /><span className="text-xs font-semibold uppercase tracking-wide text-muted">Relation</span><button onClick={close} className="ml-auto rounded p-1 text-muted hover:bg-surface-2"><X className="size-4" /></button></div>
      <div className="rounded-xl bg-surface-2/50 p-3 font-mono text-xs leading-relaxed">
        <div><span style={{ color: a?.color }}>{a?.name}</span>.{fc?.name}</div>
        <div className="text-muted">{r.kind === 'N:M' ? '⟷ many-to-many ⟷' : '→ references →'}</div>
        <div><span style={{ color: b?.color }}>{b?.name}</span>.{tc?.name}</div>
      </div>
      <div><div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Cardinality</div>
        <Segmented value={r.kind} onChange={(k) => upd((x) => ({ ...x, kind: k }))} options={[{ value: '1:1', label: 'One-to-one' }, { value: '1:N', label: 'One-to-many' }, { value: 'N:M', label: 'Many-to-many' }]} /></div>
      {r.kind !== 'N:M' && <div><div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">On delete</div>
        <Select value={r.onDelete ?? ''} onChange={(v) => upd((x) => ({ ...x, onDelete: v || undefined }))} options={[{ value: '', label: 'Default (no action)' }, { value: 'CASCADE', label: 'CASCADE' }, { value: 'SET NULL', label: 'SET NULL' }, { value: 'RESTRICT', label: 'RESTRICT' }]} /></div>}
      {r.kind === 'N:M' && <p className="text-xs text-muted">Exports create a junction table automatically (SQL/Drizzle) or implicit list relations (Prisma).</p>}
      <Button variant="outline" size="sm" className="w-full" icon={<ArrowLeftRight className="size-4" />} onClick={() => upd((x) => ({ ...x, from: x.to, to: x.from }))}>Swap direction</Button>
      <Button variant="danger" size="sm" className="w-full" icon={<Trash2 className="size-4" />} onClick={remove}>Delete relation</Button>
    </div>
  )
}

function Overview({ model, onPick, onSample, onClear }: { model: Model; onPick: (s: Sel) => void; onSample: () => void; onClear: () => void }) {
  const t = (id: string) => model.tables.find((x) => x.id === id)
  return (
    <div className="space-y-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">Schema · {model.tables.length} tables · {model.rels.length} relations</div>
      <div className="space-y-1">
        {model.tables.map((x) => (
          <button key={x.id} onClick={() => onPick({ kind: 'table', id: x.id })} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2">
            <span className="size-2.5 rounded-full" style={{ background: x.color }} /><span className="flex-1 truncate font-mono">{x.name}</span><span className="text-xs text-muted">{x.cols.length} cols</span>
          </button>
        ))}
      </div>
      {model.rels.length > 0 && <div className="space-y-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">Relations</div>
        {model.rels.map((r) => (
          <button key={r.id} onClick={() => onPick({ kind: 'rel', id: r.id })} className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left font-mono text-xs hover:bg-surface-2">
            <span className="truncate">{t(r.from.t)?.name}</span><span className="rounded bg-surface-2 px-1 text-[10px] font-bold text-accent">{r.kind}</span><span className="truncate">{t(r.to.t)?.name}</span>
          </button>
        ))}
      </div>}
      <div className="flex gap-2"><Button size="sm" variant="outline" icon={<Sparkles className="size-4" />} onClick={onSample}>Sample</Button><Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={onClear}>Clear</Button></div>
      <p className="text-[11px] text-muted"><KeyRound className="mr-1 inline size-3" />Your schema autosaves in this browser. Select a table to edit columns; use the ● handles to draw relations.</p>
    </div>
  )
}

function ImportPanel({ onModel, onClose }: { onModel: (m: Model) => void; onClose: () => void }) {
  const [sql, setSql] = useState('CREATE TABLE authors (\n  id SERIAL PRIMARY KEY,\n  name VARCHAR(100) NOT NULL\n);\n\nCREATE TABLE books (\n  id SERIAL PRIMARY KEY,\n  author_id INT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,\n  title TEXT NOT NULL,\n  isbn VARCHAR(13) UNIQUE\n);')
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
      <Card className="space-y-3">
        <div className="flex items-center gap-2"><Upload className="size-4 text-accent" /><span className="font-semibold">Import SQL CREATE TABLE statements</span><button onClick={onClose} className="ml-auto rounded p-1 text-muted hover:bg-surface-2"><X className="size-4" /></button></div>
        <Textarea value={sql} onChange={(e) => setSql(e.target.value)} className="min-h-48" placeholder="Paste a schema dump (PostgreSQL, MySQL, SQLite…)" />
        {err && <div className="text-sm text-danger">{err}</div>}
        <div className="flex flex-wrap gap-2">
          <Button icon={<Database className="size-4" />} onClick={() => { try { onModel(importSql(sql)); toast('Schema imported') } catch (e: any) { setErr(e.message) } }}>Import & replace</Button>
          <input ref={fileRef} type="file" hidden accept=".sql,.json,text/*" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; const txt = await f.text(); if (/\.json$/i.test(f.name)) { try { const m = JSON.parse(txt); if (!Array.isArray(m.tables)) throw new Error(); onModel(m); toast('Diagram loaded') } catch { setErr('Not a valid ERD JSON file') } } else setSql(txt) }} />
          <Button variant="outline" icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>Open .sql / .json file</Button>
        </div>
      </Card>
    </motion.div>
  )
}
