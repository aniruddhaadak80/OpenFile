// User preferences: a synchronous cache (mirrored to localStorage so the theme applies before first paint)
// backed by the IndexedDB `settings` table (see db.ts / store.ts). No React or Dexie imports here, so any
// module (including lib/files) can read preferences without pulling in the database.

export type ThemePref = 'system' | 'black' | 'dark' | 'light'
export type MotionPref = 'system' | 'reduce' | 'full'
export type AccentPref = 'gold' | 'teal' | 'cyan' | 'emerald' | 'sky' | 'orange' | 'lime' | 'red' | 'slate'
export type DensityPref = 'comfortable' | 'compact'
export type RadiusPref = 'rounded' | 'sharp'
export type FontPref = 'inter' | 'grotesk' | 'system' | 'mono'

/** Accent swatches: [main, glow]. Shared by the theme switcher, Settings and applyPrefs. */
export const ACCENTS: Record<AccentPref, { name: string; main: string; glow: string }> = {
  gold: { name: 'Gold', main: '#F5A524', glow: '#FFB224' },
  teal: { name: 'Teal', main: '#14B8A6', glow: '#2DD4BF' },
  cyan: { name: 'Cyan', main: '#22D3EE', glow: '#67E8F9' },
  emerald: { name: 'Emerald', main: '#10B981', glow: '#34D399' },
  sky: { name: 'Sky', main: '#38BDF8', glow: '#7DD3FC' },
  orange: { name: 'Orange', main: '#F97316', glow: '#FB923C' },
  lime: { name: 'Lime', main: '#84CC16', glow: '#A3E635' },
  red: { name: 'Red', main: '#EF4444', glow: '#F87171' },
  slate: { name: 'Slate', main: '#94A3B8', glow: '#CBD5E1' },
}
export const FONTS: Record<FontPref, { name: string; stack: string }> = {
  inter: { name: 'Inter', stack: '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif' },
  grotesk: { name: 'Space Grotesk', stack: '"Space Grotesk", "Inter", ui-sans-serif, system-ui, sans-serif' },
  system: { name: 'System', stack: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  mono: { name: 'Mono', stack: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace' },
}

export interface Prefs {
  theme: ThemePref
  reducedMotion: MotionPref
  accent: AccentPref
  density: DensityPref
  radius: RadiusPref
  font: FontPref
  /** 1 to 100. Used when a tool does not set its own quality, and as the starting quality for Workspace steps. */
  imageQuality: number
  /** Download filename pattern. Tokens: {name} {tool} {date} {time}. The original extension is always kept. */
  outputNaming: string
  /** Record opened tools and downloads on the History page */
  historyEnabled: boolean
}

export const DEFAULT_PREFS: Prefs = { theme: 'system', reducedMotion: 'system', accent: 'gold', density: 'comfortable', radius: 'rounded', font: 'inter', imageQuality: 90, outputNaming: '{name}', historyEnabled: true }
export const PREFS_KEY = 'of:prefs'

export function normalizePrefs(p: unknown): Prefs {
  const o = (p && typeof p === 'object' ? p : {}) as Partial<Prefs>
  const q = Number(o.imageQuality)
  return {
    theme: o.theme === 'black' || o.theme === 'dark' || o.theme === 'light' || o.theme === 'system' ? o.theme : DEFAULT_PREFS.theme,
    accent: typeof o.accent === 'string' && o.accent in ACCENTS ? o.accent : DEFAULT_PREFS.accent,
    density: o.density === 'compact' ? 'compact' : 'comfortable',
    radius: o.radius === 'sharp' ? 'sharp' : 'rounded',
    font: typeof o.font === 'string' && o.font in FONTS ? o.font : DEFAULT_PREFS.font,
    reducedMotion: o.reducedMotion === 'reduce' || o.reducedMotion === 'full' || o.reducedMotion === 'system' ? o.reducedMotion : DEFAULT_PREFS.reducedMotion,
    imageQuality: Number.isFinite(q) ? Math.min(100, Math.max(1, Math.round(q))) : DEFAULT_PREFS.imageQuality,
    outputNaming: typeof o.outputNaming === 'string' && o.outputNaming.trim() ? o.outputNaming.trim().slice(0, 80) : DEFAULT_PREFS.outputNaming,
    historyEnabled: typeof o.historyEnabled === 'boolean' ? o.historyEnabled : DEFAULT_PREFS.historyEnabled,
  }
}

function readInitial(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) return normalizePrefs(JSON.parse(raw))
    // migrate the v1.0 theme key
    const t = JSON.parse(localStorage.getItem('of:theme') || 'null')
    return normalizePrefs({ theme: t === 'dark' || t === 'light' || t === 'black' ? t : 'system' })
  } catch { return { ...DEFAULT_PREFS } }
}

let cache: Prefs = typeof localStorage !== 'undefined' ? readInitial() : { ...DEFAULT_PREFS }
const listeners = new Set<() => void>()

export const getPrefs = () => cache
export function subscribePrefs(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } }

/** Update the in-memory + localStorage copy and apply it to the document. Persisting to IndexedDB is done by store.ts. */
export function writePrefsCache(next: Prefs) {
  cache = normalizePrefs(next)
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(cache))
    localStorage.setItem('of:theme', JSON.stringify(cache.theme === 'system' ? null : cache.theme))
  } catch { /* storage may be unavailable */ }
  applyPrefs()
  listeners.forEach((f) => f())
}

const mq = (q: string) => (typeof matchMedia === 'function' ? matchMedia(q).matches : false)
/** The palette in use: black (AMOLED), dark or light. System maps to dark or light from the OS. */
export const resolvedMode = (p = cache): 'black' | 'dark' | 'light' => (p.theme === 'system' ? (mq('(prefers-color-scheme: light)') ? 'light' : 'dark') : p.theme)
/** Light or dark family (black counts as dark). */
export const resolvedTheme = (p = cache): 'dark' | 'light' => (resolvedMode(p) === 'light' ? 'light' : 'dark')
export const resolvedReduceMotion = (p = cache) => (p.reducedMotion === 'system' ? mq('(prefers-reduced-motion: reduce)') : p.reducedMotion === 'reduce')

export function applyPrefs(p = cache) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const mode = resolvedMode(p)
  root.classList.toggle('dark', mode !== 'light')
  root.classList.toggle('reduce-motion', resolvedReduceMotion(p))
  root.dataset.theme = mode
  root.dataset.accent = p.accent
  root.dataset.density = p.density
  root.dataset.radius = p.radius
  root.dataset.font = p.font
  const a = ACCENTS[p.accent] ?? ACCENTS.gold
  root.style.setProperty('--accent', a.main)
  root.style.setProperty('--accent-glow', a.glow)
  root.style.setProperty('--font-user', (FONTS[p.font] ?? FONTS.inter).stack)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', mode === 'light' ? '#FAFAF7' : mode === 'black' ? '#000000' : '#0B0D10')
}

// Follow OS changes while a preference is "system"
if (typeof matchMedia === 'function') {
  const re = () => { applyPrefs(); listeners.forEach((f) => f()) }
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', re)
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', re)
}

/** Apply the naming pattern to a download filename. Keeps the extension; `{name}` alone is a no-op. */
export function applyNaming(filename: string, tool = 'openfile', pattern = cache.outputNaming): string {
  if (!pattern || pattern === '{name}') return filename
  const dot = filename.lastIndexOf('.')
  const name = dot > 0 ? filename.slice(0, dot) : filename
  const ext = dot > 0 ? filename.slice(dot) : ''
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const out = pattern.replace(/\{name\}/g, name).replace(/\{tool\}/g, tool).replace(/\{date\}/g, date).replace(/\{time\}/g, time)
  const safe = out.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim()
  return (safe || name) + ext
}

/** Current tool slug from the URL (handles the GitHub Pages base path). */
export function currentToolSlug(): string | null {
  if (typeof location === 'undefined') return null
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  const path = location.pathname.startsWith(base) ? location.pathname.slice(base.length) : location.pathname
  const m = path.match(/^\/([a-z0-9-]+)\/?$/)
  return m ? m[1] : null
}
