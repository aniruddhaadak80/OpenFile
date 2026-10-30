/* OpenFile UI kit, every tool composes these primitives for a consistent look. */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Upload, Download, Copy, Check, X, Loader2, FileIcon } from 'lucide-react'
import { formatBytes, downloadBlob, copyText } from '@/lib/files'
import { toast } from './toast'
import { takeHandoff } from '@/lib/handoff'

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: React.ReactNode }
/** Press ripple: a span that grows from the pointer and fades (transform and opacity only). */
function ripple(e: React.PointerEvent<HTMLElement>) {
  if (typeof document === 'undefined' || document.documentElement.classList.contains('reduce-motion')) return
  const el = e.currentTarget, r = el.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2
  const s = document.createElement('span')
  s.className = 'ripple'; s.setAttribute('aria-hidden', 'true')
  s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`
  el.appendChild(s); setTimeout(() => s.remove(), 650)
}

export function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, onPointerDown, ...rest }: BtnProps) {
  const v = {
    primary: 'bg-gradient-brand text-on-accent font-semibold shadow-lg shadow-accent/25 hover:brightness-110 hover:shadow-accent/40',
    secondary: 'bg-surface-2 text-fg hover:bg-border',
    outline: 'border border-border bg-surface text-fg hover:border-accent hover:text-accent',
    ghost: 'text-muted hover:text-fg hover:bg-surface-2',
    danger: 'bg-danger text-white hover:brightness-110',
  }[variant]
  const s = { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-base' }[size]
  return (
    <button {...rest} onPointerDown={(e) => { ripple(e); onPointerDown?.(e) }} disabled={disabled || loading} className={cn('btn-fx inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none', v, s, className)}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cn('rounded-2xl border border-border bg-surface p-5', className)}>{children}</div>
}

const FIELD = 'input:not([type=hidden]):not([type=file]),textarea,select'
const hasName = (f: Element) => f.hasAttribute('aria-label') || f.hasAttribute('aria-labelledby') || !!(f as HTMLInputElement).labels?.length
export function Label({ children, hint, className }: { children: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  const id = React.useId()
  const ref = useRef<HTMLDivElement>(null)
  // Name the field that follows this label (the next sibling, or the first field inside it) when it has no name of its own,
  // so screen readers announce "Input JSON, edit text" instead of a bare text box.
  useEffect(() => {
    const next = ref.current?.nextElementSibling
    if (!next) return
    const f = next.matches(FIELD) ? next : next.querySelectorAll(FIELD).length === 1 ? next.querySelector(FIELD) : null
    if (f && (!hasName(f) || f.getAttribute('aria-labelledby') === id)) f.setAttribute('aria-labelledby', id)
  })
  return <div ref={ref} className={cn('mb-1.5 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted', className)}><span id={id}>{children}</span>{hint && <span className="normal-case tracking-normal font-mono text-fg/80">{hint}</span>}</div>
}

/** Plain text of a React node (for accessible names of buttons whose label is markup). */
export function nodeText(n: React.ReactNode): string {
  if (n == null || typeof n === 'boolean') return ''
  if (typeof n === 'string' || typeof n === 'number') return String(n)
  if (Array.isArray(n)) return n.map(nodeText).join(' ').replace(/\s+/g, ' ').trim()
  if (React.isValidElement(n)) { const p = n.props as { children?: React.ReactNode; 'aria-label'?: string; title?: string }; return (p['aria-label'] ?? nodeText(p.children) ?? '').trim() || (p.title ?? '') }
  return ''
}
/** True when a Segmented control sits in these children (directly, in a fragment, or one wrapper element down). */
function hasSegmented(children: React.ReactNode, depth = 0): boolean {
  return React.Children.toArray(children).some((c) => React.isValidElement(c) && (c.type === Segmented || (depth < 1 && hasSegmented((c.props as { children?: React.ReactNode }).children, depth + 1))))
}

export function Field({ label, hint, children, className }: { label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  const id = React.useId()
  // A <label> around a row of buttons names only the first button with the whole field label (and a click on the
  // label text presses it). A Segmented control gets a labelled group instead, so each button keeps its own name.
  if (hasSegmented(children)) return <div role="group" aria-labelledby={id} className={cn('block', className)}><Label hint={hint}><span id={id}>{label}</span></Label>{children}</div>
  return <label className={cn('block', className)}><Label hint={hint}>{label}</Label>{children}</label>
}

const inputCls = 'of-field w-full min-w-0 rounded-xl border border-border bg-surface-2/60 px-3 py-2 text-sm text-fg outline-none placeholder:text-muted/80'
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} {...p} className={cn(inputCls, 'h-10', className)} />)
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => <textarea ref={ref} {...p} className={cn(inputCls, 'min-h-32 font-mono text-[13px] leading-relaxed scrollbar-thin', className)} />)

export function Select<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: (T | { value: T; label: string })[]; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} className={cn(inputCls, 'h-10 cursor-pointer', className)}>
      {options.map((o) => { const v = typeof o === 'string' ? o : o.value; const l = typeof o === 'string' ? o : o.label; return <option key={v} value={v}>{l}</option> })}
    </select>
  )
}

export function Slider({ label, ariaLabel, value, onChange, min = 0, max = 100, step = 1, suffix = '', className }: { label?: React.ReactNode; ariaLabel?: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string; className?: string }) {
  return (
    <div className={className}>
      {label && <Label hint={`${value}${suffix}`}>{label}</Label>}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
        style={{ ['--pct' as string]: `${max > min ? ((value - min) / (max - min)) * 100 : 0}%` }} className="w-full cursor-pointer" />
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm select-none">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cn('relative h-6 w-11 shrink-0 rounded-full transition focus-visible:outline-offset-2', checked ? 'bg-accent' : 'bg-border')}>
        <span className={cn('absolute top-0.5 size-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
      {label}
    </label>
  )
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: (T | { value: T; label: React.ReactNode })[]; className?: string }) {
  return (
    <div className={cn('inline-flex flex-wrap gap-1 rounded-xl border border-border bg-surface-2/60 p-1', className)}>
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value; const l = typeof o === 'string' ? o : o.label
        return <button key={v} type="button" aria-pressed={value === v} aria-label={(typeof l === 'string' ? l : nodeText(l)) || v} onClick={() => onChange(v)} className={cn('rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer', value === v ? 'bg-surface text-fg shadow-sm ring-1 ring-border' : 'text-muted hover:text-fg')}>{l}</button>
      })}
    </div>
  )
}

export function Badge({ children, className, color }: { children: React.ReactNode; className?: string; color?: string }) {
  return <span className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wider', className)} style={{ background: (color ?? 'var(--accent)') + '22', color: color ?? 'var(--accent)' }}>{children}</span>
}

export function Progress({ value, label }: { value: number; label?: React.ReactNode }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div className="space-y-1.5">
      {label !== undefined && <div className="flex justify-between text-xs text-muted"><span>{label}</span><span className="font-mono">{pct}%</span></div>}
      <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-gradient-brand transition-all duration-300" style={{ width: pct + '%' }} /></div>
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return <div className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin text-accent" />{label}</div>
}

export function CopyButton({ text, label = 'Copy', size = 'sm', variant = 'outline' }: { text: string | (() => string); label?: string; size?: 'sm' | 'md'; variant?: 'outline' | 'secondary' | 'ghost' }) {
  const [ok, setOk] = useState(false)
  return (
    <Button size={size} variant={variant} icon={ok ? <Check className="size-4 text-success" /> : <Copy className="size-4" />} onClick={async () => { if (await copyText(typeof text === 'function' ? text() : text)) { setOk(true); toast('Copied to clipboard'); setTimeout(() => setOk(false), 1500) } }} aria-label={label ? undefined : ok ? 'Copied' : 'Copy'}>{ok ? 'Copied' : label}</Button>
  )
}

/** Drag & drop file picker. Use `accept` like "application/pdf" or "image/*" or ".pdf,.docx". */
export function Dropzone({ onFiles, accept, multiple = false, label, sub, compact, className }: { onFiles: (files: File[]) => void; accept?: string; multiple?: boolean; label?: React.ReactNode; sub?: React.ReactNode; compact?: boolean; className?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const handle = useCallback((list: FileList | null) => {
    if (!list || !list.length) return
    let files = Array.from(list)
    if (accept) {
      const rules = accept.split(',').map((s) => s.trim().toLowerCase())
      const ok = (f: File) => rules.some((r) => r.startsWith('.') ? f.name.toLowerCase().endsWith(r) : r.endsWith('/*') ? f.type.startsWith(r.slice(0, -1)) : f.type === r)
      const bad = files.filter((f) => !ok(f))
      files = files.filter(ok)
      if (bad.length) toast(`Skipped ${bad.length} unsupported file${bad.length > 1 ? 's' : ''}`, 'error')
    }
    if (!multiple) files = files.slice(0, 1)
    if (files.length) onFiles(files)
  }, [accept, multiple, onFiles])
  // pick up a file dropped on the homepage "smart drop"
  useEffect(() => { const h = takeHandoff(accept); if (h) onFiles(multiple ? h : h.slice(0, 1)) }, [])
  return (
    <div
      role="button" tabIndex={0} data-own-focus aria-label={typeof label === 'string' ? label : multiple ? 'Choose files' : 'Choose a file'}
      onClick={() => ref.current?.click()}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); ref.current?.click() } }}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false) }}
      onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files) }}
      className={cn('group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed text-center transition-all outline-none focus-visible:border-accent focus-visible:border-solid focus-visible:ring-2 focus-visible:ring-accent/55 focus-visible:ring-inset',
        over ? 'dz-active border-accent bg-accent/10 scale-[1.01]' : 'border-border bg-surface hover:border-accent/60 hover:bg-accent/5', compact ? 'gap-2 p-5' : 'gap-4 p-10 sm:p-14', className)}
    >
      <span className="dz-glow" aria-hidden="true" />
      <input ref={ref} type="file" hidden accept={accept} multiple={multiple} onChange={(e) => { handle(e.target.files); e.target.value = '' }} />
      <div className="relative">
        {!compact && [1, 2, 3].map((i) => <span key={i} aria-hidden="true" className={`dz-file dz-file-${i} absolute left-1/2 top-1/2 -ml-3.5 -mt-4 grid h-8 w-7 place-items-center rounded-md border border-border bg-surface text-[7px] font-bold shadow-lg`} style={{ color: ['#14B8A6', '#F5A524', '#38BDF8'][i - 1] }}>{['IMG', 'PDF', 'MP4'][i - 1]}</span>)}
        <div className={cn('relative grid place-items-center rounded-2xl bg-gradient-brand text-on-accent shadow-xl shadow-accent/30 transition group-hover:scale-110', over && 'scale-110 -translate-y-1', compact ? 'size-10' : 'size-16')}><Upload className={cn(compact ? 'size-5' : 'size-7', over && 'animate-bounce')} /></div>
      </div>
      <div className="relative">
        <div className={cn('font-semibold', compact ? 'text-sm' : 'text-lg')}>{label ?? (multiple ? 'Drop files here or click to browse' : 'Drop a file here or click to browse')}</div>
        <div className="mt-1 text-xs text-muted">{sub ?? 'Files never leave your device, processed 100% in your browser.'}</div>
      </div>
    </div>
  )
}

export function FileChip({ file, onRemove, extra }: { file: File | { name: string; size: number }; onRemove?: () => void; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/50 px-3 py-2">
      <FileIcon className="size-4 shrink-0 text-accent" />
      <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{file.name}</div><div className="text-xs text-muted">{formatBytes(file.size)}</div></div>
      {extra}
      {onRemove && <button onClick={onRemove} className="rounded-lg p-1 text-muted hover:bg-danger/10 hover:text-danger cursor-pointer" aria-label="Remove"><X className="size-4" /></button>}
    </div>
  )
}

/** True when another visible "Start over" button is already on the tool page (for example in the file bar above a
 * result card), so the card can leave its own out instead of showing the same action twice. */
export function useOtherStartOver(ref: React.RefObject<HTMLElement | null>) {
  const [other, setOther] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => {
      const scope = el.closest('main') ?? document.body
      const found = [...scope.querySelectorAll<HTMLButtonElement>('button')].some((b) => !el.contains(b) && !b.hasAttribute('data-card-reset') && b.offsetParent !== null && b.textContent?.trim() === 'Start over')
      setOther((v) => (v === found ? v : found))
    }
    check()
    const t = window.setTimeout(check, 60)
    return () => window.clearTimeout(t)
  })
  return other
}

/** Success panel with download + size comparison */
export function ResultCard({ blob, filename, originalSize, title = 'Your file is ready', children, onReset }: { blob: Blob; filename: string; originalSize?: number; title?: string; children?: React.ReactNode; onReset?: () => void }) {
  const saved = originalSize ? 1 - blob.size / originalSize : 0
  const box = useRef<HTMLDivElement>(null)
  const other = useOtherStartOver(box)
  return (
    <div ref={box} className="rounded-2xl border border-success/30 bg-success/5 p-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid size-12 place-items-center rounded-xl bg-success/15 text-success"><Check className="size-6" /></div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{title}</div>
          <div className="truncate text-sm text-muted">{filename} · {formatBytes(blob.size)}
            {originalSize ? <> · <span className={saved > 0 ? 'text-success font-medium' : 'text-warn'}>{saved > 0 ? `−${(saved * 100).toFixed(1)}%` : `+${(-saved * 100).toFixed(1)}%`}</span> from {formatBytes(originalSize)}</> : null}
          </div>
        </div>
        <div className="flex gap-2">
          {onReset && !other && <Button variant="ghost" data-card-reset="" onClick={onReset}>Start over</Button>}
          <Button icon={<Download className="size-4" />} onClick={() => downloadBlob(blob, filename)}>Download</Button>
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: React.ReactNode }[] }) {
  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map((t) => <button key={t.value} onClick={() => onChange(t.value)} className={cn('-mb-px border-b-2 px-4 py-2 text-sm font-medium transition cursor-pointer', value === t.value ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg')}>{t.label}</button>)}
    </div>
  )
}

/** Two-column tool layout: main workspace + sticky options sidebar */
export function ToolGrid({ main, side }: { main: React.ReactNode; side: React.ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">{main}</div>
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start"><Card className="space-y-5">{side}</Card></aside>
    </div>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">{children}</div>
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null
  return <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
}

/** Small helper hook: run an async job with busy/progress/error state + toast on failure */
export function useJob() {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const run = useCallback(async <T,>(fn: (setP: (p: number) => void) => Promise<T>): Promise<T | undefined> => {
    setBusy(true); setError(null); setProgress(0)
    try { return await fn(setProgress) } catch (e: any) {
      console.error(e); const m = e?.message || String(e); setError(m); toast(m, 'error'); return undefined
    } finally { setBusy(false) }
  }, [])
  return { busy, progress, error, setError, run, setProgress }
}
