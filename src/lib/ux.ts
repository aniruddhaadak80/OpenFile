// Small app-wide UX state that is not a user preference: the drop sheet bus, the PWA install prompt,
// online status, one-time flags (onboarding tour) and the last downloaded file for "What next".
import { useEffect, useState, useSyncExternalStore } from 'react'

/* ---------------- tiny event bus ---------------- */
type Fn<T> = (v: T) => void
function bus<T>() {
  const subs = new Set<Fn<T>>()
  return { emit: (v: T) => subs.forEach((f) => f(v)), on: (f: Fn<T>) => { subs.add(f); return () => { subs.delete(f) } } }
}

/** Open the "Drop anything" sheet with these files (global drop, share target, file handlers, smart drop). */
export const dropBus = bus<File[]>()
export const openDropSheet = (files: File[]) => { if (files.length) dropBus.emit(files) }

/** Ask the current tool page to remount so its Dropzone picks up a handoff. */
export const remountBus = bus<void>()

/** Toggle UI overlays from anywhere (keyboard shortcuts, buttons). */
export const overlayBus = bus<'shortcuts' | 'palette' | 'tour'>()

/** Emitted by lib/files after every download, so a tool page can suggest a next step. */
export interface DownloadEvent { name: string; size?: number; blob?: Blob; dataUrl?: string }
export const downloadBus = bus<DownloadEvent>()

/* ---------------- one-time flags ---------------- */
export function flag(key: string): boolean { try { return localStorage.getItem('of:' + key) === '1' } catch { return false } }
export function setFlag(key: string, on = true) { try { if (on) localStorage.setItem('of:' + key, '1'); else localStorage.removeItem('of:' + key) } catch { /* ignore */ } }

/* ---------------- PWA install prompt ---------------- */
interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let deferred: BIPEvent | null = null
let installed = typeof matchMedia === 'function' && (matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true)
const installSubs = new Set<() => void>()
const emitInstall = () => installSubs.forEach((f) => f())
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BIPEvent; emitInstall() })
  window.addEventListener('appinstalled', () => { installed = true; deferred = null; emitInstall() })
}
let snapshot = { canPrompt: false, installed }
const getInstall = () => { const s = { canPrompt: !!deferred, installed }; if (s.canPrompt !== snapshot.canPrompt || s.installed !== snapshot.installed) snapshot = s; return snapshot }
export const isIOS = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream
export function useInstall() {
  const s = useSyncExternalStore((f) => { installSubs.add(f); return () => { installSubs.delete(f) } }, getInstall, getInstall)
  const prompt = async () => {
    if (!deferred) return 'unavailable' as const
    await deferred.prompt()
    const r = await deferred.userChoice
    deferred = null; emitInstall()
    return r.outcome
  }
  return { ...s, prompt, iosHint: !s.installed && !s.canPrompt && isIOS() }
}

/* ---------------- online status ---------------- */
export function useOnline() {
  const [on, setOn] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false)
    window.addEventListener('online', up); window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  return on
}

/** True when the event target is a place the user is typing. */
export const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  if (!el || !el.tagName) return false
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !!el.closest?.('[contenteditable="true"], .cm-editor, .monaco-editor')
}
