// Service worker registration with an update flow, plus a small store the UI can read:
//  - ready:   the service worker controls this page, so the app shell works offline
//  - waiting: a new version finished downloading, show "New version ready, reload"
// Works under any base path: the worker is registered at BASE_URL + "sw.js" with scope BASE_URL.
import { useSyncExternalStore } from 'react'
import { detect } from './platform'

interface PwaState { supported: boolean; ready: boolean; waiting: boolean; build: string | null }
let state: PwaState = { supported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator, ready: false, waiting: false, build: null }
const subs = new Set<() => void>()
const set = (p: Partial<PwaState>) => { state = { ...state, ...p }; subs.forEach((f) => f()) }
let reg: ServiceWorkerRegistration | null = null

export function usePwa() {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => state, () => state)
}

/** Ask the waiting worker to take over, then reload once it controls the page. */
export function applyUpdate() {
  const w = reg?.waiting
  if (!w) { location.reload(); return }
  let done = false
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!done) { done = true; location.reload() } })
  w.postMessage({ type: 'SKIP_WAITING' })
  setTimeout(() => { if (!done) location.reload() }, 3000)
}

/** Check for a newer build now (the Install page and Settings can call this). */
export async function checkForUpdate() { try { await reg?.update() } catch { /* offline */ } return !!reg?.waiting }

function readVersion(sw: ServiceWorker | null) {
  if (!sw) return
  try {
    const ch = new MessageChannel()
    ch.port1.onmessage = (e) => set({ build: e.data?.build ?? null })
    sw.postMessage({ type: 'GET_VERSION' }, [ch.port2])
  } catch { /* ignore */ }
}

export function registerPWA() {
  if (!state.supported || !import.meta.env.PROD) return
  if (detect().native) return // the desktop and mobile apps ship every file already
  const base = import.meta.env.BASE_URL
  const go = async () => {
    try {
      reg = await navigator.serviceWorker.register(`${base}sw.js`, { scope: base, updateViaCache: 'none' })
      const track = (w: ServiceWorker | null) => {
        if (!w) return
        w.addEventListener('statechange', () => {
          // "installed" with an existing controller means an update is waiting; without one it is the first install
          if (w.state === 'installed' && navigator.serviceWorker.controller) set({ waiting: true })
        })
      }
      if (reg.waiting && navigator.serviceWorker.controller) set({ waiting: true })
      track(reg.installing)
      reg.addEventListener('updatefound', () => track(reg!.installing))
      await navigator.serviceWorker.ready
      set({ ready: !!navigator.serviceWorker.controller || !!reg.active })
      readVersion(navigator.serviceWorker.controller || reg.active)
      navigator.serviceWorker.addEventListener('controllerchange', () => { set({ ready: true }); readVersion(navigator.serviceWorker.controller) })
      // look for a new build when the app comes back to the foreground, at most every 30 minutes
      let last = Date.now()
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - last > 30 * 60e3) { last = Date.now(); reg?.update().catch(() => {}) } })
    } catch (e) { console.warn('[openfile] service worker registration failed', e) }
  }
  if (document.readyState === 'complete') void go(); else window.addEventListener('load', () => void go(), { once: true })
}
