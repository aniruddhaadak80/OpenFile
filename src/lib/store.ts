// React hooks over the local database (db.ts) and preferences (prefs.ts).
// Each collection is one shared live store: Dexie's liveQuery keeps it in sync across components and tabs,
// and writes update the in-memory value first so the UI responds instantly.
import { useSyncExternalStore } from 'react'
import { liveQuery } from 'dexie'
import { db, dbReady, pruneHistory, type FavoriteRow, type HistoryRow, type RecentRow, type ActivityKind } from './db'
import { getPrefs, subscribePrefs, writePrefsCache, resolvedTheme, resolvedReduceMotion, normalizePrefs, applyNaming, currentToolSlug, type Prefs } from './prefs'
import { setDownloadHooks } from './files'
import { toolBySlug } from '@/tools/registry'

type Live<T> = { get: () => T; set: (v: T) => void; subscribe: (fn: () => void) => () => void }
function live<T>(query: () => Promise<T>, initial: T): Live<T> {
  let value = initial
  let started = false
  const subs = new Set<() => void>()
  const emit = () => subs.forEach((f) => f())
  const start = () => {
    if (started) return
    started = true
    dbReady().then(() => liveQuery(query).subscribe({ next: (v) => { value = v; emit() }, error: (e) => console.warn('[OpenFile] live query failed', e) }))
  }
  return { get: () => value, set: (v) => { value = v; emit() }, subscribe: (fn) => { start(); subs.add(fn); return () => { subs.delete(fn) } } }
}
const useLive = <T,>(s: Live<T>) => useSyncExternalStore(s.subscribe, s.get, s.get)

const favStore = live<FavoriteRow[]>(() => db.favorites.orderBy('addedAt').reverse().toArray(), [])
const recentStore = live<RecentRow[]>(() => db.recents.orderBy('lastUsed').reverse().limit(48).toArray(), [])
export const historyStore = live<HistoryRow[]>(() => db.history.orderBy('at').reverse().limit(2000).toArray(), [])

/* ---------------- favorites ---------------- */
export async function toggleFavorite(slug: string) {
  const cur = favStore.get()
  const has = cur.some((f) => f.slug === slug)
  favStore.set(has ? cur.filter((f) => f.slug !== slug) : [{ slug, addedAt: Date.now() }, ...cur])
  await dbReady()
  try { if (has) await db.favorites.delete(slug); else await db.favorites.put({ slug, addedAt: Date.now() }) } catch { /* ignore */ }
}
export async function clearFavorites() { favStore.set([]); await dbReady(); await db.favorites.clear() }

export function useFavorites() {
  const rows = useLive(favStore)
  const fav = rows.map((r) => r.slug)
  return { fav, rows, isFav: (s: string) => fav.includes(s), toggle: (s: string) => { void toggleFavorite(s) } }
}

/* ---------------- recents + activity ---------------- */
let lastOpen = { slug: '', at: 0 }
export async function recordOpen(slug: string) {
  const now = Date.now()
  if (lastOpen.slug === slug && now - lastOpen.at < 2500) return // StrictMode / quick re-renders
  lastOpen = { slug, at: now }
  const cur = recentStore.get()
  const prev = cur.find((r) => r.slug === slug)
  recentStore.set([{ slug, lastUsed: now, count: (prev?.count ?? 0) + 1 }, ...cur.filter((r) => r.slug !== slug)])
  await dbReady()
  try {
    await db.transaction('rw', db.recents, db.history, async () => {
      const row = await db.recents.get(slug)
      await db.recents.put({ slug, lastUsed: now, count: (row?.count ?? 0) + 1 })
      if (getPrefs().historyEnabled) await db.history.add({ slug, kind: 'open', at: now })
    })
    void pruneHistory()
  } catch { /* ignore */ }
}
export async function recordActivity(slug: string, kind: ActivityKind, detail?: string, size?: number) {
  if (!getPrefs().historyEnabled) return
  await dbReady()
  try { await db.history.add({ slug, kind, detail, size, at: Date.now() }); void pruneHistory() } catch { /* ignore */ }
}
export async function clearRecents() { recentStore.set([]); await dbReady(); await db.recents.clear() }
export async function clearHistory() { historyStore.set([]); await dbReady(); await db.history.clear() }
export async function deleteHistoryEntry(id: number) { historyStore.set(historyStore.get().filter((h) => h.id !== id)); await dbReady(); await db.history.delete(id) }

export function useRecent() {
  const rows = useLive(recentStore)
  return { recent: rows.map((r) => r.slug), rows, push: (s: string) => { void recordOpen(s) } }
}
export const useHistory = () => useLive(historyStore)

/* ---------------- settings ---------------- */
let prefsLoaded = false
async function loadPrefsFromDb() {
  if (prefsLoaded) return
  prefsLoaded = true
  await dbReady()
  try {
    const row = await db.settings.get('prefs')
    if (row?.value) writePrefsCache(normalizePrefs({ ...getPrefs(), ...(row.value as object) }))
    else await db.settings.put({ key: 'prefs', value: getPrefs() }) // first run: seed IndexedDB from localStorage
  } catch { /* ignore */ }
}
export async function updatePrefs(patch: Partial<Prefs>) {
  const next = normalizePrefs({ ...getPrefs(), ...patch })
  writePrefsCache(next)
  await dbReady()
  try { await db.settings.put({ key: 'prefs', value: next }) } catch { /* ignore */ }
}
export function useSettings() {
  if (typeof window !== 'undefined') void loadPrefsFromDb()
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getPrefs)
  return { prefs, update: updatePrefs, reset: () => updatePrefs({ theme: 'system', reducedMotion: 'system', imageQuality: 90, outputNaming: '{name}', historyEnabled: true }) }
}

export function useTheme() {
  const { prefs } = useSettings()
  const theme = resolvedTheme(prefs)
  return { theme, pref: prefs.theme, toggle: () => void updatePrefs({ theme: theme === 'dark' ? 'light' : 'dark' }), set: (t: Prefs['theme']) => void updatePrefs({ theme: t }) }
}
export function useReducedMotion() {
  const { prefs } = useSettings()
  return resolvedReduceMotion(prefs)
}

/* ---------------- export / import ---------------- */
export interface OpenFileBackup {
  app: 'openfile'; version: 1; exportedAt: string
  prefs: Prefs; favorites: string[]; recents: { slug: string; lastUsed: number; count: number }[]
  recipes?: unknown[]; history?: HistoryRow[]
}
export async function exportData(includeHistory: boolean): Promise<OpenFileBackup> {
  await dbReady()
  const [favorites, recents, history] = await Promise.all([db.favorites.orderBy('addedAt').reverse().toArray(), db.recents.toArray(), includeHistory ? db.history.toArray() : Promise.resolve(undefined)])
  let recipes: unknown[] | undefined
  try { const r = JSON.parse(localStorage.getItem('of:recipes') || '[]'); if (Array.isArray(r)) recipes = r } catch { /* ignore */ }
  return { app: 'openfile', version: 1, exportedAt: new Date().toISOString(), prefs: getPrefs(), favorites: favorites.map((f) => f.slug), recents, recipes, ...(history ? { history: history.map(({ id, ...h }) => h as HistoryRow) } : {}) }
}
export async function importData(raw: unknown, validSlugs: Set<string>): Promise<{ favorites: number; recents: number; history: number; recipes: number }> {
  const d = raw as Partial<OpenFileBackup>
  if (!d || typeof d !== 'object' || d.app !== 'openfile') throw new Error('This file is not an OpenFile settings export.')
  await dbReady()
  if (d.prefs) await updatePrefs(normalizePrefs(d.prefs))
  const fav = (Array.isArray(d.favorites) ? d.favorites : []).filter((s): s is string => typeof s === 'string' && validSlugs.has(s))
  const rec = (Array.isArray(d.recents) ? d.recents : []).filter((r) => r && validSlugs.has(r.slug)).map((r) => ({ slug: r.slug, lastUsed: Number(r.lastUsed) || Date.now(), count: Math.max(1, Number(r.count) || 1) }))
  const hist = (Array.isArray(d.history) ? d.history : []).filter((h) => h && typeof h.slug === 'string' && (h.kind === 'open' || h.kind === 'download') && Number.isFinite(h.at)).map((h) => ({ slug: h.slug, kind: h.kind, at: h.at, detail: typeof h.detail === 'string' ? h.detail : undefined, size: typeof h.size === 'number' ? h.size : undefined }))
  const now = Date.now()
  await db.transaction('rw', db.favorites, db.recents, db.history, async () => {
    await db.favorites.bulkPut(fav.map((slug, i) => ({ slug, addedAt: now - i })))
    if (rec.length) await db.recents.bulkPut(rec)
    if (hist.length) await db.history.bulkAdd(hist)
  })
  let recipes = 0
  if (Array.isArray(d.recipes)) {
    try {
      const cur = JSON.parse(localStorage.getItem('of:recipes') || '[]') as { name: string }[]
      const incoming = d.recipes.filter((r: any) => r && typeof r.name === 'string' && Array.isArray(r.steps)) as { name: string }[]
      const merged = [...incoming, ...cur.filter((c) => !incoming.some((i) => i.name === c.name))]
      localStorage.setItem('of:recipes', JSON.stringify(merged)); recipes = incoming.length
    } catch { /* ignore */ }
  }
  return { favorites: fav.length, recents: rec.length, history: hist.length, recipes }
}

/* ---------------- download hooks (naming pattern + history) ---------------- */
setDownloadHooks({
  rename: (filename) => applyNaming(filename, currentToolSlug() ?? 'openfile'),
  after: (filename, size) => { const slug = currentToolSlug(); if (slug && (slug === 'workspace' || toolBySlug(slug))) void recordActivity(slug, 'download', filename, size) },
})
