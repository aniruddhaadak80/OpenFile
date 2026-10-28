// Quick theme popover in the header: mode, accent, density, radius and font.
// Every change goes through the prefs layer (localStorage + IndexedDB) and applies instantly.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Monitor, Moon, Sun, Circle, Palette, Check } from 'lucide-react'
import { useSettings } from '@/lib/store'
import { ACCENTS, FONTS, resolvedMode, type AccentPref, type FontPref, type ThemePref } from '@/lib/prefs'
import { cn } from './ui'

export const THEME_OPTIONS: { value: ThemePref; label: string; icon: typeof Sun; swatch: string }[] = [
  { value: 'black', label: 'Black', icon: Circle, swatch: '#000000' },
  { value: 'dark', label: 'Dark', icon: Moon, swatch: '#0B0D10' },
  { value: 'light', label: 'Sun', icon: Sun, swatch: '#FAFAF7' },
  { value: 'system', label: 'System', icon: Monitor, swatch: 'linear-gradient(135deg, #0B0D10 50%, #FAFAF7 50%)' },
]

export function AccentSwatches({ value, onChange, size = 'md' }: { value: AccentPref; onChange: (a: AccentPref) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Accent color">
      {(Object.keys(ACCENTS) as AccentPref[]).map((k) => (
        <button key={k} role="radio" aria-checked={value === k} title={ACCENTS[k].name} aria-label={ACCENTS[k].name} onClick={() => onChange(k)}
          className={cn('relative grid place-items-center rounded-full transition hover:scale-110 cursor-pointer', size === 'sm' ? 'size-7' : 'size-9', value === k && 'ring-2 ring-fg ring-offset-2 ring-offset-surface')}
          style={{ background: `linear-gradient(135deg, ${ACCENTS[k].glow}, ${ACCENTS[k].main})` }}>
          {value === k && <Check className="size-3.5 text-black/80" />}
        </button>
      ))}
    </div>
  )
}

export function ThemeModes({ value, onChange }: { value: ThemePref; onChange: (t: ThemePref) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Theme">
      {THEME_OPTIONS.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn('group flex flex-col items-center gap-1.5 rounded-xl border p-2 text-[11px] font-medium transition cursor-pointer', value === o.value ? 'border-accent bg-accent/10 text-fg' : 'border-border text-muted hover:text-fg')}>
          <span className="h-8 w-full rounded-lg border border-border" style={{ background: o.swatch }} />
          <span className="flex items-center gap-1"><o.icon className="size-3" />{o.label}</span>
        </button>
      ))}
    </div>
  )
}

function Mini<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex gap-1 rounded-lg border border-border bg-surface-2/60 p-0.5">
      {options.map((o) => <button key={o.value} onClick={() => onChange(o.value)} className={cn('flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition cursor-pointer', value === o.value ? 'bg-surface text-fg shadow-sm ring-1 ring-border' : 'text-muted hover:text-fg')}>{o.label}</button>)}
    </div>
  )
}

export function ThemeSwitcher() {
  const { prefs, update } = useSettings()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', down); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key) }
  }, [open])
  const mode = resolvedMode(prefs)
  const Icon = mode === 'light' ? Sun : mode === 'black' ? Circle : Moon
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className={cn('grid size-11 place-items-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-fg cursor-pointer md:size-9', open && 'bg-surface-2 text-fg')} aria-label="Theme and appearance" aria-expanded={open} aria-haspopup="dialog" title="Theme">
        <span className="relative"><Icon className="size-4" /><span className="absolute -bottom-1 -right-1 size-2 rounded-full ring-2 ring-bg" style={{ background: ACCENTS[prefs.accent].main }} /></span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="dialog" aria-label="Appearance" initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ duration: 0.18 }}
            className="absolute right-0 top-full z-50 mt-2 w-[min(340px,calc(100vw-2rem))] origin-top-right rounded-2xl border border-border bg-surface p-4 shadow-2xl">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted"><Palette className="size-3.5" /> Appearance</div>
            <ThemeModes value={prefs.theme} onChange={(t) => void update({ theme: t })} />
            <div className="mt-4 mb-2 text-xs font-medium text-muted">Accent</div>
            <AccentSwatches size="sm" value={prefs.accent} onChange={(a) => void update({ accent: a })} />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div><div className="mb-1.5 text-xs font-medium text-muted">Density</div><Mini value={prefs.density} onChange={(v) => void update({ density: v })} options={[{ value: 'comfortable', label: 'Roomy' }, { value: 'compact', label: 'Compact' }]} /></div>
              <div><div className="mb-1.5 text-xs font-medium text-muted">Corners</div><Mini value={prefs.radius} onChange={(v) => void update({ radius: v })} options={[{ value: 'rounded', label: 'Rounded' }, { value: 'sharp', label: 'Sharp' }]} /></div>
            </div>
            <div className="mt-3"><div className="mb-1.5 text-xs font-medium text-muted">Font</div><Mini<FontPref> value={prefs.font} onChange={(v) => void update({ font: v })} options={(Object.keys(FONTS) as FontPref[]).map((k) => ({ value: k, label: FONTS[k].name.replace('Space ', '') }))} /></div>
            <Link to="/settings#appearance" onClick={() => setOpen(false)} className="mt-4 block text-center text-xs text-accent hover:underline">All appearance settings</Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
