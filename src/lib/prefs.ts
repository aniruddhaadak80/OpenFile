// User preferences: a synchronous cache (mirrored to localStorage so the theme applies before first paint)
// backed by the IndexedDB `settings` table (see db.ts / store.ts). No React or Dexie imports here, so any
// module (including lib/files) can read preferences without pulling in the database.

export type ThemePref = 'system' | 'dark' | 'light'
export type MotionPref = 'system' | 'reduce' | 'full'

export interface Prefs {
  theme: ThemePref
  reducedMotion: MotionPref
  /** 1 to 100. Used when a tool does not set its own quality, and as the starting quality for Workspace steps. */
  imageQuality: number
  /** Download filename pattern. Tokens: {name} {tool} {date} {time}. The original extension is always kept. */
  outputNaming: string
  /** Record opened tools and downloads on the History page */
  historyEnabled: boolean
}

export const DEFAULT_PREFS: Prefs = { theme: 'system', reducedMotion: 'system', imageQuality: 90, outputNaming: '{name}', historyEnabled: true }
export const PREFS_KEY = 'of:prefs'

export function normalizePrefs(p: unknown): Prefs {
  const o = (p && typeof p === 'object' ? p : {}) as Partial<Prefs>
  const q = Number(o.imageQuality)
  return {
    theme: o.theme === 'dark' || o.theme === 'light' || o.theme === 'system' ? o.theme : DEFAULT_PREFS.theme,
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
    return normalizePrefs({ theme: t === 'dark' || t === 'light' ? t : 'system' })
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
export const resolvedTheme = (p = cache): 'dark' | 'light' => (p.theme === 'system' ? (mq('(prefers-color-scheme: light)') ? 'light' : 'dark') : p.theme)
export const resolvedReduceMotion = (p = cache) => (p.reducedMotion === 'system' ? mq('(prefers-reduced-motion: reduce)') : p.reducedMotion === 'reduce')

export function applyPrefs(p = cache) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('dark', resolvedTheme(p) === 'dark')
  root.classList.toggle('reduce-motion', resolvedReduceMotion(p))
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
