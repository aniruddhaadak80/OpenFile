// Shared update logic for every platform: semantic versions, update preferences, snooze and skip rules,
// the check schedule and a small store the UI reads (src/components/app/UpdateCenter.tsx, UpdatesPanel.tsx).
//
// Where preferences live:
//  - Desktop (Tauri): update-prefs.json in the app config folder (of_prefs_get / of_prefs_set in desktop/src-tauri)
//  - Android (Capacitor): SharedPreferences through the OpenFileUpdater plugin
//  - Web and iOS: localStorage
// Native storage keeps one set of preferences for the bundled copy and the hosted web version (hybrid mode),
// which run on different origins and so have different localStorage.
import { useSyncExternalStore } from 'react'

export type Channel = 'stable' | 'beta'
export type Frequency = 'launch' | 'daily' | 'weekly' | 'off'
export type WebMode = 'ask' | 'always' | 'never'
export type UpdatePlatform = 'desktop' | 'android' | 'ios' | 'web'

export interface UpdatePrefs {
  channel: Channel
  /** when to look for updates on its own: every launch (and every 6 hours while open), daily, weekly or never */
  frequency: Frequency
  /** desktop: download in the background and install on quit; Android: download in the background */
  autoInstall: boolean
  /** hybrid mode: load the hosted web version when it is newer than the copy inside the app */
  webMode: WebMode
  /** Android: only download on Wi-Fi or another unmetered connection */
  wifiOnly: boolean
  skipVersion: string | null
  snoozeVersion: string | null
  snoozeUntil: number
  lastChecked: number
  webSkipCommit: string | null
}

export const DEFAULT_UPDATE_PREFS: UpdatePrefs = {
  channel: 'stable',
  frequency: 'launch',
  autoInstall: false, // safe default: ask before installing
  webMode: 'ask',
  wifiOnly: true,
  skipVersion: null,
  snoozeVersion: null,
  snoozeUntil: 0,
  lastChecked: 0,
  webSkipCommit: null,
}

export const REPO_API = 'https://api.github.com/repos/aniruddhaadak80/OpenFile'
export const RELEASES_URL = 'https://github.com/aniruddhaadak80/OpenFile/releases'
export const HOSTED_ORIGIN = 'https://aniruddhaadak80.github.io'
export const HOSTED_BASE = '/OpenFile/'
export const HOSTED_URL = HOSTED_ORIGIN + HOSTED_BASE
export const SIX_HOURS = 6 * 3600e3
export const DAY = 24 * 3600e3

// ---- semantic versions (semver 2.0 precedence, "v" prefix allowed) ----
export interface SemVer { major: number; minor: number; patch: number; pre: (string | number)[] }
export function parseVersion(v: string | null | undefined): SemVer | null {
  const m = String(v ?? '').trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/)
  if (!m) return null
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split('.').map((p) => (/^\d+$/.test(p) ? +p : p)) : [] }
}
/** -1 when a < b, 0 when equal, 1 when a > b. Unparseable versions sort lowest. */
export function compareVersions(a: string | null | undefined, b: string | null | undefined): number {
  const x = parseVersion(a), y = parseVersion(b)
  if (!x || !y) return x ? 1 : y ? -1 : 0
  for (const k of ['major', 'minor', 'patch'] as const) if (x[k] !== y[k]) return x[k] > y[k] ? 1 : -1
  if (!x.pre.length || !y.pre.length) return x.pre.length === y.pre.length ? 0 : x.pre.length ? -1 : 1
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i], q = y.pre[i]
    if (p === undefined) return -1
    if (q === undefined) return 1
    if (p === q) continue
    if (typeof p === 'number' && typeof q === 'number') return p > q ? 1 : -1
    if (typeof p === 'number') return -1
    if (typeof q === 'number') return 1
    return p > q ? 1 : -1
  }
  return 0
}
export const isPrerelease = (v: string) => !!parseVersion(v)?.pre.length
export const cleanVersion = (v: string) => v.trim().replace(/^v/i, '')

// ---- native bridges (no extra npm packages: the apps expose them on window) ----
const w = (): any => (typeof window !== 'undefined' ? window : {})
export const isTauri = () => !!(w().__TAURI_INTERNALS__?.invoke)
export const isCapacitor = () => !!w().Capacitor?.isNativePlatform?.()
export const capPlatform = (): string => w().Capacitor?.getPlatform?.() ?? 'web'
export function tauriInvoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return w().__TAURI_INTERNALS__.invoke(cmd, args ?? {})
}
export function capCall<T = any>(plugin: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  return w().Capacitor.nativePromise(plugin, method, args)
}
/** Android has the OpenFileUpdater plugin from v1.2.0 on. */
export const hasAndroidUpdater = () => isCapacitor() && capPlatform() === 'android' && !!w().Capacitor?.isPluginAvailable?.('OpenFileUpdater')

export function updatePlatform(): UpdatePlatform {
  if (isTauri()) return 'desktop'
  if (isCapacitor()) return capPlatform() === 'android' ? 'android' : 'ios'
  return 'web'
}

/** The hosted web version running inside the desktop or mobile app (hybrid mode). */
export const isHostedInApp = () => (isTauri() || isCapacitor()) && typeof location !== 'undefined' && location.origin === HOSTED_ORIGIN

// ---- preferences ----
const LS_KEY = 'of-update-prefs'
let prefs: UpdatePrefs = { ...DEFAULT_UPDATE_PREFS }
let prefsLoaded: Promise<UpdatePrefs> | null = null

function sanitize(raw: any): UpdatePrefs {
  const p = { ...DEFAULT_UPDATE_PREFS }
  if (!raw || typeof raw !== 'object') return p
  if (raw.channel === 'beta' || raw.channel === 'stable') p.channel = raw.channel
  if (['launch', 'daily', 'weekly', 'off'].includes(raw.frequency)) p.frequency = raw.frequency
  if (typeof raw.autoInstall === 'boolean') p.autoInstall = raw.autoInstall
  if (['ask', 'always', 'never'].includes(raw.webMode)) p.webMode = raw.webMode
  if (typeof raw.wifiOnly === 'boolean') p.wifiOnly = raw.wifiOnly
  for (const k of ['skipVersion', 'snoozeVersion', 'webSkipCommit'] as const) if (typeof raw[k] === 'string') p[k] = raw[k]
  for (const k of ['snoozeUntil', 'lastChecked'] as const) if (typeof raw[k] === 'number' && isFinite(raw[k])) p[k] = raw[k]
  return p
}

export function loadPrefs(): Promise<UpdatePrefs> {
  if (prefsLoaded) return prefsLoaded
  prefsLoaded = (async () => {
    let raw: any = null
    try {
      if (isTauri()) raw = JSON.parse(await tauriInvoke<string>('of_prefs_get'))
      else if (hasAndroidUpdater()) raw = JSON.parse((await capCall<{ json: string }>('OpenFileUpdater', 'getPrefs')).json || '{}')
      else raw = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
    } catch { try { raw = JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { raw = null } }
    prefs = sanitize(raw)
    setState({ prefs })
    return prefs
  })()
  return prefsLoaded
}

export async function savePrefs(patch: Partial<UpdatePrefs>): Promise<UpdatePrefs> {
  await loadPrefs()
  prefs = sanitize({ ...prefs, ...patch })
  setState({ prefs })
  const json = JSON.stringify(prefs)
  try {
    if (isTauri()) await tauriInvoke('of_prefs_set', { json })
    else if (hasAndroidUpdater()) await capCall('OpenFileUpdater', 'setPrefs', { json })
    else localStorage.setItem(LS_KEY, json)
  } catch { try { localStorage.setItem(LS_KEY, json) } catch { /* private mode */ } }
  return prefs
}

/** Is an automatic check due now? Manual checks ignore this. */
export function checkDue(p: UpdatePrefs, reason: 'launch' | 'timer', now = Date.now()): boolean {
  const since = now - (p.lastChecked || 0)
  switch (p.frequency) {
    case 'off': return false
    case 'launch': return reason === 'launch' || since >= SIX_HOURS
    case 'daily': return since >= DAY
    case 'weekly': return since >= 7 * DAY
  }
}

/** Should an automatic check show this version, or did the user skip or snooze it? */
export function offerAllowed(p: UpdatePrefs, version: string, now = Date.now()): boolean {
  if (p.skipVersion && compareVersions(p.skipVersion, version) === 0) return false
  if (p.snoozeVersion && compareVersions(p.snoozeVersion, version) === 0 && now < p.snoozeUntil) return false
  return true
}

// ---- store ----
export interface UpdateOffer {
  version: string
  current: string
  notes: string
  date?: string | null
  /** release page for this version */
  page: string
  /** Android: the APK to download */
  apk?: string
  prerelease?: boolean
}
export type Phase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'installing' | 'error' | 'uptodate'
export interface WebOffer { remoteCommit: string; remoteBuilt: string; remoteTools: number; localTools: number | null; remoteVersion: string }
export interface UpdateState {
  platform: UpdatePlatform
  current: string | null
  build: string | null
  prefs: UpdatePrefs
  phase: Phase
  offer: UpdateOffer | null
  progress: { done: number; total: number } | null
  error: string | null
  message: string | null
  /** what the floating card shows */
  card: 'none' | 'update' | 'web' | 'updated'
  /** which sheet is open */
  sheet: 'none' | 'release' | 'whatsnew'
  web: WebOffer | null
  hosted: boolean
  rollback: string | null
}
let state: UpdateState = {
  platform: 'web', current: null, build: null, prefs, phase: 'idle', offer: null, progress: null, error: null, message: null,
  card: 'none', sheet: 'none', web: null, hosted: false, rollback: null,
}
const subs = new Set<() => void>()
export function setState(p: Partial<UpdateState>) { state = { ...state, ...p }; subs.forEach((f) => f()) }
export const getState = () => state
export function useUpdates() {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => state, () => state)
}

/** fetch with a timeout, no HTTP cache */
export async function fetchJson<T = any>(url: string, ms = 8000, headers?: Record<string, string>): Promise<T> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try {
    const r = await fetch(url, { cache: 'no-store', signal: ctl.signal, headers })
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`.trim())
    return await r.json() as T
  } finally { clearTimeout(t) }
}

export interface GhRelease { tag_name: string; name: string; body: string; draft: boolean; prerelease: boolean; html_url: string; published_at: string; assets: { name: string; browser_download_url: string }[] }

/** Newest release for a channel: stable reads /releases/latest, beta takes the highest version including prereleases. */
export async function latestRelease(channel: Channel, needAsset: string): Promise<GhRelease | null> {
  const gh = { Accept: 'application/vnd.github+json' }
  if (channel === 'stable') {
    const r = await fetchJson<GhRelease>(`${REPO_API}/releases/latest`, 8000, gh)
    return r.assets?.some((a) => a.name === needAsset) ? r : null
  }
  const list = await fetchJson<GhRelease[]>(`${REPO_API}/releases?per_page=20`, 8000, gh)
  const ok = list.filter((r) => !r.draft && parseVersion(r.tag_name) && r.assets?.some((a) => a.name === needAsset))
  ok.sort((a, b) => compareVersions(b.tag_name, a.tag_name))
  return ok[0] ?? null
}

export function relTime(ts: number): string {
  if (!ts) return 'Never'
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 45) return 'Just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
