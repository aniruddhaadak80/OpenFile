// OpenFile local database (IndexedDB via Dexie). Everything here stays in this browser:
// favorites, recently used tools, an activity history and settings. Nothing is ever sent anywhere.
import Dexie, { type Table } from 'dexie'

export interface FavoriteRow { slug: string; addedAt: number }
export interface RecentRow { slug: string; lastUsed: number; count: number }
export type ActivityKind = 'open' | 'download'
export interface HistoryRow { id?: number; slug: string; kind: ActivityKind; detail?: string; size?: number; at: number }
export interface SettingRow { key: string; value: unknown }

class OpenFileDB extends Dexie {
  favorites!: Table<FavoriteRow, string>
  recents!: Table<RecentRow, string>
  history!: Table<HistoryRow, number>
  settings!: Table<SettingRow, string>
  constructor() {
    super('openfile')
    this.version(1).stores({
      favorites: 'slug, addedAt',
      recents: 'slug, lastUsed',
      history: '++id, at, slug, kind',
      settings: 'key',
    })
  }
}

export const db = new OpenFileDB()

/** Max rows kept in the activity history (oldest are pruned). */
export const HISTORY_LIMIT = 2000

let ready: Promise<void> | null = null
/** Opens the DB once and migrates v1.0 localStorage favorites/recents into IndexedDB. */
export function dbReady(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      try {
        await db.open()
        const migrated = await db.settings.get('migrated-v1')
        if (!migrated) {
          const now = Date.now()
          const read = (k: string): string[] => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [] } catch { return [] } }
          const fav = read('of:favorites'), rec = read('of:recent')
          await db.transaction('rw', db.favorites, db.recents, db.settings, async () => {
            await db.favorites.bulkPut(fav.map((slug, i) => ({ slug, addedAt: now - i })))
            await db.recents.bulkPut(rec.map((slug, i) => ({ slug, lastUsed: now - i * 1000, count: 1 })))
            await db.settings.put({ key: 'migrated-v1', value: now })
          })
        }
      } catch (e) { console.warn('[OpenFile] IndexedDB unavailable, so favorites and history will not persist.', e) }
    })()
  }
  return ready
}

export async function pruneHistory() {
  const n = await db.history.count()
  if (n > HISTORY_LIMIT) {
    const old = await db.history.orderBy('at').limit(n - HISTORY_LIMIT).primaryKeys()
    await db.history.bulkDelete(old)
  }
}
