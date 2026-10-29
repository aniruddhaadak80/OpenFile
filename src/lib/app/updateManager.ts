// Runs the update flow for whichever platform OpenFile is on:
//  - desktop: signed Tauri updates (check, background download, install and relaunch, rollback)
//  - android: newer APK from GitHub Releases, verified and handed to the system installer
//  - web and iPhone home screen app: the service worker (pwa.ts) plus "What's new"
//  - desktop, Android and iOS apps: hybrid mode, loading the hosted web version when it has newer tools
// The UI lives in src/components/app/UpdateCenter.tsx (card and sheets) and UpdatesPanel.tsx (Settings).
import {
  DAY, HOSTED_URL, checkDue, compareVersions, fetchJson, getState, isHostedInApp, loadPrefs, offerAllowed, savePrefs, setState,
  updatePlatform, hasAndroidUpdater, isTauri, type UpdateOffer, type WebMode,
} from './updateCore'
import { desktopCheck, desktopDownload, desktopInfo, desktopInstall, desktopInstallOnExit, desktopMarkHealthy, desktopProgress, desktopRollback, desktopRollbackInfo } from './updateDesktop'
import { androidCheck, androidDownload, androidInfo, androidInstall, androidOpen, androidProgress } from './updateAndroid'
import { checkForUpdate, getPwaState } from './pwa'

export interface VersionFile { version: string; commit: string; builtAt: string; tools: number; shell?: string; base?: string }

let started = false
let timer: ReturnType<typeof setInterval> | null = null
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const errText = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'string' ? e : 'Something went wrong')
const base = () => import.meta.env.BASE_URL || '/'

export async function localVersion(): Promise<VersionFile | null> {
  try { return await fetchJson<VersionFile>(`${base()}version.json`, 4000) } catch { return null }
}

/** Starts once per page load: reads versions and preferences, then schedules the checks. */
export async function startUpdates() {
  if (started || typeof window === 'undefined') return
  started = true
  const platform = updatePlatform()
  const hosted = isHostedInApp()
  setState({ platform, hosted })
  if (hosted) rememberBack()
  const prefs = await loadPrefs()
  const local = await localVersion()
  let current: string | null = local?.version ?? null
  try {
    if (platform === 'desktop') current = (await desktopInfo()).version
    else if (platform === 'android' && hasAndroidUpdater()) current = (await androidInfo()).version
  } catch { /* older shell */ }
  setState({ current, build: local?.commit ?? getPwaState().build })
  noteUpdated(current)

  if (platform === 'desktop') {
    // the interface rendered: tell the shell this version starts fine (resets the rollback counter)
    setTimeout(() => { desktopMarkHealthy().catch(() => {}) }, 3000)
    desktopRollbackInfo().then((r) => setState({ rollback: r.previous })).catch(() => {})
  }
  const native = platform !== 'web'
  if (native && !hosted) {
    const skipOnce = new URLSearchParams(location.search).get('of_web') === 'builtin'
    if (skipOnce) { try { sessionStorage.setItem('of-web-builtin', '1') } catch { /* ignore */ } }
    setTimeout(() => { void webCheck(false) }, 2500)
  }
  if (platform === 'desktop' || (platform === 'android' && hasAndroidUpdater())) {
    if (checkDue(prefs, 'launch')) setTimeout(() => { void checkNow(false) }, 5000)
    timer = setInterval(() => { if (checkDue(getState().prefs, 'timer')) void checkNow(false) }, 30 * 60e3)
  }
}

/** after an update was applied: say so once, with a link to What's new */
function noteUpdated(current: string | null) {
  try {
    const key = 'of-last-version'
    const prev = localStorage.getItem(key)
    const webFlag = localStorage.getItem('of-just-updated')
    if (current) localStorage.setItem(key, current)
    if (webFlag) { localStorage.removeItem('of-just-updated'); setState({ card: 'updated', message: 'OpenFile is up to date.' }); return }
    if (prev && current && compareVersions(current, prev) > 0) setState({ card: 'updated', message: `Updated to v${current}.` })
  } catch { /* private mode */ }
}

/** Manual or scheduled check for a new app version. */
export async function checkNow(manual = true): Promise<void> {
  const s = getState()
  if (s.phase === 'checking' || s.phase === 'downloading' || s.phase === 'installing') return
  setState({ phase: 'checking', error: null, message: null })
  const prefs = await loadPrefs()
  try {
    let offer: UpdateOffer | null = null
    if (s.platform === 'desktop') {
      offer = await desktopCheck(prefs.channel)
    } else if (s.platform === 'android' && hasAndroidUpdater()) {
      const found = await androidCheck(prefs.channel, s.current || '0.0.0')
      offer = found && compareVersions(found.version, s.current) > 0 ? found : null
    } else if (s.platform === 'web') {
      const waiting = await checkForUpdate()
      await savePrefs({ lastChecked: Date.now() })
      setState({ phase: waiting ? 'available' : 'uptodate', message: waiting ? 'A new version is ready. Reload to use it.' : 'You have the latest version.' })
      return
    }
    if (manual && !s.hosted) void webCheck(true)
    await savePrefs({ lastChecked: Date.now() })
    if (!offer) {
      setState({ phase: s.platform === 'ios' ? 'idle' : 'uptodate', offer: null, message: s.platform === 'ios' ? null : 'You have the latest version.' })
      return
    }
    if (!manual && !offerAllowed(prefs, offer.version)) { setState({ phase: 'idle', offer }); return }
    setState({ phase: 'available', offer, card: 'update', message: null })
    if (prefs.autoInstall && !manual) void backgroundDownload()
  } catch (e) {
    setState({ phase: 'error', error: `Could not check for updates: ${errText(e)}` })
  }
}

/** "Auto install updates": desktop downloads now and installs on quit (or when the user clicks Install now). */
async function backgroundDownload() {
  const s = getState()
  if (s.platform === 'desktop') {
    try {
      await desktopDownload()
      await desktopInstallOnExit(true)
      setState({ phase: 'ready' })
    } catch (e) { setState({ phase: 'available', error: `Background download failed: ${errText(e)}` }) }
  } else if (s.platform === 'android' && s.offer?.apk) {
    try {
      const info = await androidInfo()
      if (s.prefs.wifiOnly && info.metered) return // waits for Wi-Fi; the card still offers the update
      await androidDownload(s.offer.apk, s.offer.version)
      setState({ phase: 'ready' })
    } catch (e) { setState({ phase: 'available', error: errText(e) }) }
  }
}

async function poll(read: () => Promise<{ done: number; total: number; stop: boolean; error?: string }>) {
  for (;;) {
    const p = await read()
    setState({ progress: { done: p.done, total: p.total } })
    if (p.error) throw new Error(p.error)
    if (p.stop) return
    await sleep(300)
  }
}

/** Install now: download with progress (if not done yet), then install and relaunch (desktop) or open the installer (Android). */
export async function installUpdate(opts: { allowMetered?: boolean } = {}) {
  const s = getState()
  const offer = s.offer
  if (!offer) return
  setState({ error: null, message: null })
  try {
    if (s.platform === 'desktop') {
      setState({ phase: 'downloading', progress: { done: 0, total: 0 } })
      const dl = desktopDownload()
      await Promise.race([dl, poll(async () => { const p = await desktopProgress(); return { done: p.downloaded, total: p.total, stop: p.ready } })])
      await dl
      setState({ phase: 'installing', progress: null })
      await desktopInstall() // relaunches on success
      return
    }
    if (s.platform === 'android' && offer.apk) {
      const info = await androidInfo()
      if (s.prefs.wifiOnly && info.metered && !opts.allowMetered) {
        setState({ phase: 'available', error: 'metered' })
        return
      }
      setState({ phase: 'downloading', progress: { done: 0, total: 0 } })
      const dl = androidDownload(offer.apk, offer.version)
      await Promise.race([dl, poll(async () => { const p = await androidProgress(); return { done: p.done, total: p.total, stop: p.state === 'verified', error: p.state === 'error' ? p.error : undefined } })])
      await dl
      setState({ phase: 'ready', progress: null })
      try {
        await androidInstall()
        setState({ phase: 'installing', message: 'Follow the Android installer. OpenFile reopens on the new version.' })
      } catch (e) {
        if (/needs-permission/.test(errText(e))) setState({ phase: 'ready', message: 'Allow OpenFile to install apps on the screen that opened, then tap Install again.' })
        else throw e
      }
    }
  } catch (e) {
    setState({ phase: 'error', progress: null, error: errText(e) })
  }
}

export async function openReleasePage() {
  const url = getState().offer?.page || 'https://github.com/aniruddhaadak80/OpenFile/releases/latest'
  if (getState().platform === 'android' && hasAndroidUpdater()) { await androidOpen(url).catch(() => window.open(url, '_blank', 'noopener')); return }
  window.open(url, '_blank', 'noopener')
}

/** Remind me later: hide this version for one day or one week. */
export async function snooze(days: 1 | 7) {
  const v = getState().offer?.version
  if (!v) return
  await savePrefs({ snoozeVersion: v, snoozeUntil: Date.now() + days * DAY })
  if (isTauri()) desktopInstallOnExit(false).catch(() => {})
  setState({ card: 'none', sheet: 'none', message: days === 1 ? 'Reminder set for tomorrow.' : 'Reminder set for next week.' })
}

/** Later from the card: keeps a background download installing on quit when Auto install is on. */
export function later() {
  setState({ card: 'none', sheet: 'none' })
}

export async function skipVersion() {
  const v = getState().offer?.version
  if (!v) return
  await savePrefs({ skipVersion: v })
  if (isTauri()) desktopInstallOnExit(false).catch(() => {})
  setState({ card: 'none', sheet: 'none', message: `Version ${v} skipped. A newer one will still be offered.` })
}

export async function unskip() { await savePrefs({ skipVersion: null, snoozeVersion: null, snoozeUntil: 0 }) }

export async function rollback() {
  setState({ phase: 'installing', error: null, message: 'Downloading the previous version' })
  try { await desktopRollback() } catch (e) { setState({ phase: 'error', error: `Rollback failed: ${errText(e)}` }) }
}

// ---- hybrid mode: newer tools from the hosted web version ----

/** Compares the bundled version.json with the hosted one. Offers, loads or ignores it per "Use latest web version". */
export async function webCheck(manual: boolean) {
  const prefs = await loadPrefs()
  if (prefs.webMode === 'never' && !manual) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  try {
    const [local, remote] = await Promise.all([localVersion(), fetchJson<VersionFile>(`${HOSTED_URL}version.json`, 6000)])
    if (!remote?.builtAt || !remote.commit) return
    const newer = !local || (remote.commit !== local.commit && Date.parse(remote.builtAt) > Date.parse(local.builtAt))
    // the hosted build may need a newer app shell than this one; then wait for the app update instead
    const shellOk = !remote.shell || compareVersions(getState().current, remote.shell) >= 0
    if (!newer || !shellOk) return
    const web = { remoteCommit: remote.commit, remoteBuilt: remote.builtAt, remoteTools: remote.tools, localTools: local?.tools ?? null, remoteVersion: remote.version }
    setState({ web })
    let stay = false
    try { stay = sessionStorage.getItem('of-web-builtin') === '1' } catch { /* ignore */ }
    if (prefs.webMode === 'always' && !stay && !manual) { loadHosted(); return }
    if (!manual && prefs.webSkipCommit === remote.commit) return
    if (getState().card !== 'update') setState({ card: 'web' })
  } catch { /* offline or blocked: keep the bundled copy */ }
}

/** Opens the hosted web version inside the app. The bundled copy stays the start page and offline fallback. */
export function loadHosted(always = false) {
  if (always) void savePrefs({ webMode: 'always' })
  const path = location.pathname.replace(/^\/+/, '')
  const q = new URLSearchParams(location.search)
  q.delete('of_web')
  q.set('of_back', location.origin)
  location.href = `${HOSTED_URL}${path}?${q.toString()}${location.hash}`
}

export async function dismissWeb() {
  const c = getState().web?.remoteCommit
  if (c) await savePrefs({ webSkipCommit: c })
  setState({ card: 'none' })
}

export async function setWebMode(mode: WebMode) {
  await savePrefs({ webMode: mode })
  if (getState().hosted && mode === 'never') backToBundled()
}

const BACK_KEY = 'of-back-origin'
function rememberBack() {
  try {
    const b = new URLSearchParams(location.search).get('of_back')
    if (b && /^(https?|tauri|capacitor|openfile):\/\/(localhost|tauri\.localhost)(:\d+)?$/i.test(b)) localStorage.setItem(BACK_KEY, b)
  } catch { /* ignore */ }
}

/** From the hosted web version back to the copy inside the app. */
export function backToBundled() {
  let back: string | null = null
  try { back = localStorage.getItem(BACK_KEY) } catch { /* ignore */ }
  if (!back) back = isTauri() ? (/windows/i.test(navigator.userAgent) ? 'http://tauri.localhost' : 'tauri://localhost') : 'https://localhost'
  const path = location.pathname.startsWith('/OpenFile/') ? location.pathname.slice('/OpenFile'.length) : '/'
  location.href = `${back}${path}?of_web=builtin`
}

export function stopUpdates() { if (timer) clearInterval(timer); timer = null; started = false }
