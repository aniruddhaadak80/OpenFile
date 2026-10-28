import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Search, Copy, Trash2, Group, Ungroup, Lock, Unlock, ArrowUpToLine, ArrowDownToLine, ChevronUp, ChevronDown,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalSpaceAround, AlignVerticalSpaceAround, Download, FileJson, ClipboardCopy, Image as ImageIcon,
} from 'lucide-react'
import { cn } from '@/components/ui'
import { El, Style, Tool, STROKES, FILLS, STICKY_COLORS, Head } from './types'
import { STENCILS } from './stencils'

export type Action = 'dup' | 'del' | 'group' | 'ungroup' | 'lock' | 'front' | 'forward' | 'backward' | 'back' | 'copy'
  | 'al-left' | 'al-center' | 'al-right' | 'al-top' | 'al-middle' | 'al-bottom' | 'dist-h' | 'dist-v'

const Sec = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5"><div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</div>{children}</div>
)
const Btn = ({ on, onClick, title, children, className }: { on?: boolean; onClick: () => void; title: string; children: React.ReactNode; className?: string }) => (
  <button type="button" title={title} aria-label={title} onClick={onClick} className={cn('grid h-8 min-w-8 place-items-center rounded-lg px-1.5 text-xs transition cursor-pointer', on ? 'bg-accent/15 text-accent ring-1 ring-accent/40' : 'bg-surface-2 text-fg/80 hover:bg-border', className)}>{children}</button>
)
function Swatches({ colors, value, onChange, dark }: { colors: string[]; value: string; onChange: (c: string) => void; dark: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {colors.map((c) => (
        <button key={c} type="button" title={c} onClick={() => onChange(c)} className={cn('size-6 rounded-md ring-1 ring-border transition hover:scale-110 cursor-pointer', c === 'transparent' && 'checker', value.toLowerCase() === c.toLowerCase() && 'ring-2 ring-accent ring-offset-1 ring-offset-surface')} style={c === 'transparent' ? undefined : { background: c }} />
      ))}
      <label title="Custom colour" className="relative size-6 cursor-pointer overflow-hidden rounded-md ring-1 ring-border" style={{ background: 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)' }}>
        <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} />
      </label>
      <span className="ml-1 font-mono text-[10px] text-muted">{value === 'transparent' ? 'none' : value}</span>
      {dark && <span className="sr-only">Colours are auto-inverted on the dark canvas</span>}
    </div>
  )
}
const HeadIcon = ({ h, flip }: { h: Head; flip?: boolean }) => (
  <svg viewBox="0 0 28 12" className={cn('h-3 w-7', flip && '-scale-x-100')} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <path d="M2 6h22" />
    {h === 'arrow' && <path d="M18 2l6 4-6 4" />}{h === 'triangle' && <path d="M18 2l6 4-6 4z" fill="currentColor" />}{h === 'dot' && <circle cx="23" cy="6" r="2.6" fill="currentColor" />}{h === 'bar' && <path d="M24 1v10" />}
  </svg>
)

export function PropsPanel({ sel, style, tool, dark, onStyle, act }: { sel: El[]; style: Style; tool: Tool; dark: boolean; onStyle: (p: Partial<Style>) => void; act: (a: Action) => void }) {
  const first = sel[0]
  const types = new Set(sel.length ? sel.map((e) => e.type) : [tool === 'rectangle' || tool === 'diamond' || tool === 'ellipse' ? 'shape' : tool === 'freedraw' ? 'freedraw' : tool])
  const v = first ? { stroke: first.stroke, fill: first.fill, fillStyle: first.fillStyle, strokeWidth: first.strokeWidth, strokeStyle: first.strokeStyle, opacity: first.opacity, rough: first.rough, roundness: first.roundness, fontSize: first.fontSize ?? style.fontSize, fontFamily: first.fontFamily ?? style.fontFamily, align: first.align ?? style.align, startHead: first.startHead ?? 'none', endHead: first.endHead ?? (first.type === 'arrow' ? 'arrow' : 'none') } : style
  const has = (...t: string[]) => t.some((x) => types.has(x as any))
  const onlySticky = sel.length > 0 && sel.every((e) => e.type === 'sticky')
  const showFill = has('shape', 'icon', 'table', 'frame', 'line') && !onlySticky
  const showStrokeOpts = has('shape', 'line', 'arrow', 'table', 'icon', 'freedraw')
  const showText = has('text', 'sticky', 'shape', 'table', 'icon')
  const showRough = has('shape', 'line', 'arrow', 'table')
  const locked = sel.length > 0 && sel.every((e) => e.locked)
  const grouped = sel.some((e) => e.groupIds.length)
  return (
    <div className="space-y-3.5">
      {!onlySticky && <Sec label="Stroke"><Swatches colors={STROKES} value={v.stroke} onChange={(stroke) => onStyle({ stroke })} dark={dark} /></Sec>}
      {(has('sticky')) && <Sec label="Note colour"><div className="flex gap-1">{STICKY_COLORS.map((c) => <button key={c.fill} title={c.name} onClick={() => onStyle({ fill: c.fill })} className={cn('size-7 rounded-md ring-1 ring-border cursor-pointer', v.fill === c.fill && 'ring-2 ring-accent')} style={{ background: c.fill }} />)}</div></Sec>}
      {showFill && <Sec label="Background"><Swatches colors={FILLS} value={v.fill} onChange={(fill) => onStyle({ fill, ...(fill !== 'transparent' && v.fillStyle === 'none' ? { fillStyle: 'hachure' } : {}) })} dark={dark} /></Sec>}
      {showFill && <Sec label="Fill">
        <div className="flex gap-1">
          {(['none', 'hachure', 'cross', 'solid'] as const).map((f) => <Btn key={f} on={v.fillStyle === f} title={f} onClick={() => onStyle({ fillStyle: f, ...(f !== 'none' && v.fill === 'transparent' ? { fill: '#a5d8ff' } : {}) })}>
            <svg viewBox="0 0 16 16" className="size-4"><rect x="2" y="2" width="12" height="12" rx="2" fill={f === 'solid' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3" />{(f === 'hachure' || f === 'cross') && <path d="M3 9l6-6M3 13l10-10M7 13l6-6" stroke="currentColor" strokeWidth="1" />}{f === 'cross' && <path d="M3 7l6 6M3 3l10 10M7 3l6 6" stroke="currentColor" strokeWidth="1" />}</svg>
          </Btn>)}
        </div>
      </Sec>}
      {showStrokeOpts && <Sec label={`Stroke width · ${v.strokeWidth}`}>
        <div className="flex items-center gap-1">
          {[1, 2, 4].map((w) => <Btn key={w} on={v.strokeWidth === w} title={`${w}px`} onClick={() => onStyle({ strokeWidth: w })}><span className="block w-5 rounded-full bg-current" style={{ height: w + 0.5 }} /></Btn>)}
          <input type="range" min={0.5} max={12} step={0.5} value={v.strokeWidth} onChange={(e) => onStyle({ strokeWidth: +e.target.value })} className="ml-1 w-20 accent-[var(--accent)]" />
        </div>
      </Sec>}
      {showStrokeOpts && !has('freedraw') && <Sec label="Stroke style">
        <div className="flex gap-1">{(['solid', 'dashed', 'dotted'] as const).map((s) => <Btn key={s} on={v.strokeStyle === s} title={s} onClick={() => onStyle({ strokeStyle: s })}><svg viewBox="0 0 24 8" className="h-2 w-6"><path d="M1 4h22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={s === 'dashed' ? '5 4' : s === 'dotted' ? '0.5 4' : undefined} /></svg></Btn>)}</div>
      </Sec>}
      {showRough && <Sec label="Style (sloppiness)">
        <div className="flex gap-1">{[[0, 'Clean'], [1, 'Sketchy'], [2, 'Rough']].map(([r, l]) => <Btn key={r} on={v.rough === r} title={l as string} onClick={() => onStyle({ rough: r as number })} className="px-2">
          <svg viewBox="0 0 24 12" className="h-3 w-6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">{r === 0 ? <path d="M2 9C8 2 14 2 22 6" /> : r === 1 ? <path d="M2 9C8 2 14 3 22 6M3 8c6-5 12-5 18-1" /> : <path d="M2 9c3-4 6-6 9-4s6 0 11 1M3 7c5-4 10-3 13-2s4 1 6 2" />}</svg>
        </Btn>)}</div>
      </Sec>}
      {has('shape', 'line', 'arrow', 'table') && <Sec label={has('line', 'arrow') ? 'Line shape' : 'Edges'}>
        <div className="flex gap-1"><Btn on={!v.roundness} title={has('line', 'arrow') ? 'Straight' : 'Sharp'} onClick={() => onStyle({ roundness: 0 })}><svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 13V3h10" /></svg></Btn><Btn on={!!v.roundness} title={has('line', 'arrow') ? 'Curved' : 'Round'} onClick={() => onStyle({ roundness: 1 })}><svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 13V8a5 5 0 0 1 5-5h5" /></svg></Btn></div>
      </Sec>}
      {has('arrow', 'line') && <Sec label="Arrowheads">
        <div className="space-y-1">
          <div className="flex gap-1">{(['none', 'arrow', 'triangle', 'dot', 'bar'] as Head[]).map((h) => <Btn key={h} on={v.startHead === h} title={`Start: ${h}`} onClick={() => onStyle({ startHead: h })}><HeadIcon h={h} flip /></Btn>)}</div>
          <div className="flex gap-1">{(['none', 'arrow', 'triangle', 'dot', 'bar'] as Head[]).map((h) => <Btn key={h} on={v.endHead === h} title={`End: ${h}`} onClick={() => onStyle({ endHead: h })}><HeadIcon h={h} /></Btn>)}</div>
        </div>
      </Sec>}
      {showText && <>
        <Sec label="Font">
          <div className="flex gap-1">
            <Btn on={v.fontFamily === 'hand'} title="Hand-drawn (Caveat)" onClick={() => onStyle({ fontFamily: 'hand' })} className="px-2"><span style={{ fontFamily: 'Caveat, cursive' }} className="text-base leading-none">Aa</span></Btn>
            <Btn on={v.fontFamily === 'normal'} title="Normal" onClick={() => onStyle({ fontFamily: 'normal' })} className="px-2"><span className="font-sans">Aa</span></Btn>
            <Btn on={v.fontFamily === 'code'} title="Code" onClick={() => onStyle({ fontFamily: 'code' })} className="px-2"><span className="font-mono">{'</>'}</span></Btn>
          </div>
        </Sec>
        <Sec label={`Font size · ${Math.round(v.fontSize)}`}>
          <div className="flex items-center gap-1">{[['S', 16], ['M', 20], ['L', 28], ['XL', 40]].map(([l, s]) => <Btn key={l} on={Math.round(v.fontSize) === s} title={`${s}px`} onClick={() => onStyle({ fontSize: s as number })}>{l}</Btn>)}
            <input type="number" min={6} max={400} value={Math.round(v.fontSize)} onChange={(e) => onStyle({ fontSize: Math.max(6, Math.min(400, +e.target.value || 16)) })} className="h-8 w-14 rounded-lg border border-border bg-surface-2 px-1.5 text-xs outline-none focus:border-accent" />
          </div>
        </Sec>
        {has('text', 'sticky') && <Sec label="Align"><div className="flex gap-1">{(['left', 'center', 'right'] as const).map((a) => <Btn key={a} on={v.align === a} title={a} onClick={() => onStyle({ align: a })}><svg viewBox="0 0 16 16" className="size-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d={a === 'left' ? 'M2 4h12M2 8h8M2 12h10' : a === 'center' ? 'M2 4h12M4 8h8M3 12h10' : 'M2 4h12M6 8h8M4 12h10'} /></svg></Btn>)}</div></Sec>}
      </>}
      <Sec label={`Opacity · ${v.opacity}%`}><input type="range" min={5} max={100} step={5} value={v.opacity} onChange={(e) => onStyle({ opacity: +e.target.value })} className="w-full accent-[var(--accent)]" /></Sec>
      {sel.length > 0 && <>
        <Sec label="Layers"><div className="flex gap-1">
          <Btn title="Send to back (Ctrl+Shift+[)" onClick={() => act('back')}><ArrowDownToLine className="size-4" /></Btn>
          <Btn title="Send backward (Ctrl+[)" onClick={() => act('backward')}><ChevronDown className="size-4" /></Btn>
          <Btn title="Bring forward (Ctrl+])" onClick={() => act('forward')}><ChevronUp className="size-4" /></Btn>
          <Btn title="Bring to front (Ctrl+Shift+])" onClick={() => act('front')}><ArrowUpToLine className="size-4" /></Btn>
        </div></Sec>
        {sel.length > 1 && <Sec label="Align"><div className="grid grid-cols-4 gap-1">
          <Btn title="Align left" onClick={() => act('al-left')}><AlignStartVertical className="size-4" /></Btn>
          <Btn title="Align centre" onClick={() => act('al-center')}><AlignCenterVertical className="size-4" /></Btn>
          <Btn title="Align right" onClick={() => act('al-right')}><AlignEndVertical className="size-4" /></Btn>
          <Btn title="Distribute horizontally" onClick={() => act('dist-h')}><AlignHorizontalSpaceAround className="size-4" /></Btn>
          <Btn title="Align top" onClick={() => act('al-top')}><AlignStartHorizontal className="size-4" /></Btn>
          <Btn title="Align middle" onClick={() => act('al-middle')}><AlignCenterHorizontal className="size-4" /></Btn>
          <Btn title="Align bottom" onClick={() => act('al-bottom')}><AlignEndHorizontal className="size-4" /></Btn>
          <Btn title="Distribute vertically" onClick={() => act('dist-v')}><AlignVerticalSpaceAround className="size-4" /></Btn>
        </div></Sec>}
        <Sec label="Actions"><div className="flex flex-wrap gap-1">
          <Btn title="Duplicate (Ctrl+D)" onClick={() => act('dup')}><Copy className="size-4" /></Btn>
          <Btn title="Copy (Ctrl+C)" onClick={() => act('copy')}><ClipboardCopy className="size-4" /></Btn>
          {sel.length > 1 && <Btn title="Group (Ctrl+G)" onClick={() => act('group')}><Group className="size-4" /></Btn>}
          {grouped && <Btn title="Ungroup (Ctrl+Shift+G)" onClick={() => act('ungroup')}><Ungroup className="size-4" /></Btn>}
          <Btn on={locked} title={locked ? 'Unlock (Ctrl+Shift+L)' : 'Lock (Ctrl+Shift+L)'} onClick={() => act('lock')}>{locked ? <Unlock className="size-4" /> : <Lock className="size-4" />}</Btn>
          <Btn title="Delete (Del)" onClick={() => act('del')} className="hover:!bg-danger/15 hover:text-danger"><Trash2 className="size-4" /></Btn>
        </div></Sec>
      </>}
    </div>
  )
}

export function LibraryPanel({ onInsert, onClose }: { onInsert: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const groups = useMemo(() => {
    const list = STENCILS.filter((s) => s.label.toLowerCase().includes(q.toLowerCase()) || s.id.includes(q.toLowerCase()))
    const g: Record<string, typeof list> = {}
    list.forEach((s) => (g[s.group] ??= []).push(s))
    return g
  }, [q])
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border p-3">
        <div className="font-display text-sm font-semibold">Library <span className="font-normal text-muted">· {STENCILS.length}</span></div>
        <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-fg cursor-pointer" aria-label="Close library"><X className="size-4" /></button>
      </div>
      <div className="p-3 pb-1"><div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2"><Search className="size-3.5 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stencils…" className="h-8 w-full bg-transparent text-xs outline-none" /></div></div>
      <div className="flex-1 space-y-4 overflow-y-auto p-3 scrollbar-thin">
        {Object.entries(groups).map(([g, items]) => (
          <div key={g}>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">{g}</div>
            <div className="grid grid-cols-3 gap-1.5">
              {items.map((s) => (
                <button key={s.id} draggable onDragStart={(e) => { e.dataTransfer.setData('application/x-openfile-stencil', s.id); e.dataTransfer.effectAllowed = 'copy' }} onClick={() => onInsert(s.id)} title={`${s.label} — click or drag onto the board`}
                  className="group flex flex-col items-center gap-1 rounded-xl border border-transparent bg-surface-2/60 p-2 transition hover:border-accent/50 hover:bg-accent/5 cursor-grab active:cursor-grabbing">
                  <svg viewBox="0 0 24 24" className="size-7 text-fg/80 transition group-hover:scale-110 group-hover:text-accent" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: s.preview }} />
                  <span className="line-clamp-2 text-center text-[10px] leading-tight text-muted">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {!Object.keys(groups).length && <div className="py-8 text-center text-xs text-muted">No stencils match “{q}”</div>}
      </div>
    </div>
  )
}

const SHORTCUTS: [string, [string, string][]][] = [
  ['Tools', [['Select', 'V or 1'], ['Hand (pan)', 'H'], ['Rectangle', 'R or 2'], ['Diamond', 'D or 3'], ['Ellipse', 'O or 4'], ['Arrow', 'A or 5'], ['Line', 'L or 6'], ['Pencil', 'P or 7'], ['Text', 'T or 8'], ['Image', '9'], ['Eraser', 'E or 0'], ['Sticky note', 'S'], ['Frame', 'F'], ['Laser pointer', 'K'], ['Keep tool active', 'Q']]],
  ['View', [['Pan', 'Space + drag · wheel · middle mouse'], ['Zoom', 'Ctrl + wheel · pinch'], ['Zoom in / out', 'Ctrl + = / Ctrl + −'], ['Reset zoom', 'Ctrl + 0'], ['Fit to content', 'Shift + 1'], ['Zoom to selection', 'Shift + 2'], ['Toggle grid', "Ctrl + '"], ['Toggle snap to grid', 'Alt + S'], ['Dark / light canvas', 'Alt + Shift + D'], ['Fullscreen', 'Alt + Enter'], ['Present (frames as slides)', 'Alt + P']]],
  ['Edit', [['Undo', 'Ctrl + Z'], ['Redo', 'Ctrl + Y · Ctrl + Shift + Z'], ['Copy / Cut / Paste', 'Ctrl + C / X / V'], ['Duplicate', 'Ctrl + D · Alt + drag'], ['Delete', 'Del · Backspace'], ['Select all', 'Ctrl + A'], ['Group / Ungroup', 'Ctrl + G / Ctrl + Shift + G'], ['Lock / unlock', 'Ctrl + Shift + L'], ['Bring forward / back', 'Ctrl + ] / Ctrl + ['], ['To front / to back', 'Ctrl + Shift + ] / ['], ['Nudge', 'Arrows (Shift = 10px)'], ['Edit text / label', 'Enter · double-click'], ['Constrain / snap angle', 'Hold Shift while drawing'], ['Save to file', 'Ctrl + S'], ['Open file', 'Ctrl + O'], ['Export image', 'Ctrl + Shift + E'], ['Shortcuts help', '?']]],
]
export function HelpModal({ onClose }: { onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  return (
    <Modal onClose={onClose} title="Keyboard shortcuts" wide>
      <div className="grid gap-6 md:grid-cols-3">
        {SHORTCUTS.map(([g, list]) => (
          <div key={g}><div className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent">{g}</div>
            <div className="space-y-1">{list.map(([a, k]) => <div key={a} className="flex items-start justify-between gap-3 text-xs"><span className="text-fg/85">{a}</span><span className="shrink-0 text-right font-mono text-[11px] text-muted">{k.split(' · ').map((x, i) => <span key={i} className="ml-1 inline-block rounded border border-border bg-surface-2 px-1 py-px">{x}</span>)}</span></div>)}</div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

export function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-40 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
        <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className={cn('max-h-full w-full overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl scrollbar-thin', wide ? 'max-w-4xl' : 'max-w-lg')}>
          <div className="mb-4 flex items-center justify-between"><h3 className="font-display text-lg font-semibold">{title}</h3><button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-fg cursor-pointer" aria-label="Close"><X className="size-5" /></button></div>
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export type ExportOpts = { onlySelected: boolean; background: boolean; dark: boolean; scale: number; padding: number }
export function ExportDialog({ hasSelection, preview, opts, setOpts, onPng, onSvg, onCopy, onJson, onClose }: {
  hasSelection: boolean; preview: string | null; opts: ExportOpts; setOpts: (o: ExportOpts) => void
  onPng: () => void; onSvg: () => void; onCopy: () => void; onJson: () => void; onClose: () => void
}) {
  const T = ({ label, k }: { label: string; k: 'onlySelected' | 'background' | 'dark' }) => (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm"><span>{label}</span>
      <button type="button" role="switch" aria-checked={opts[k]} onClick={() => setOpts({ ...opts, [k]: !opts[k] })} className={cn('relative h-5 w-9 rounded-full transition', opts[k] ? 'bg-accent' : 'bg-border')}><span className={cn('absolute top-0.5 size-4 rounded-full bg-white shadow transition-all', opts[k] ? 'left-[18px]' : 'left-0.5')} /></button>
    </label>
  )
  return (
    <Modal title="Export" onClose={onClose} wide>
      <div className="grid gap-5 md:grid-cols-[1fr_260px]">
        <div className="checker grid min-h-56 place-items-center overflow-hidden rounded-xl border border-border p-3">{preview ? <img src={preview} alt="Export preview" className="max-h-80 max-w-full object-contain shadow-lg" /> : <span className="text-sm text-muted">Nothing to export yet — draw something first.</span>}</div>
        <div className="space-y-4">
          {hasSelection && <T label="Only selected" k="onlySelected" />}
          <T label="Background" k="background" />
          <T label="Dark mode" k="dark" />
          <div><div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Scale</div><div className="flex gap-1">{[1, 2, 3].map((s) => <button key={s} onClick={() => setOpts({ ...opts, scale: s })} className={cn('h-8 flex-1 rounded-lg text-sm font-medium cursor-pointer', opts.scale === s ? 'bg-accent text-white' : 'bg-surface-2 hover:bg-border')}>{s}×</button>)}</div></div>
          <div><div className="mb-1.5 flex justify-between text-xs font-medium uppercase tracking-wide text-muted"><span>Padding</span><span className="font-mono normal-case">{opts.padding}px</span></div><input type="range" min={0} max={120} value={opts.padding} onChange={(e) => setOpts({ ...opts, padding: +e.target.value })} className="w-full accent-[var(--accent)]" /></div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button disabled={!preview} onClick={onPng} className="col-span-2 flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-brand text-sm font-medium text-white shadow-lg shadow-accent/25 disabled:opacity-50 cursor-pointer"><ImageIcon className="size-4" />PNG</button>
            <button disabled={!preview} onClick={onSvg} className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border text-sm hover:border-accent hover:text-accent disabled:opacity-50 cursor-pointer"><Download className="size-4" />SVG</button>
            <button disabled={!preview} onClick={onCopy} className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border text-sm hover:border-accent hover:text-accent disabled:opacity-50 cursor-pointer"><ClipboardCopy className="size-4" />Copy</button>
            <button onClick={onJson} className="col-span-2 flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border text-sm hover:border-accent hover:text-accent cursor-pointer"><FileJson className="size-4" />Save .openfile.json</button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
