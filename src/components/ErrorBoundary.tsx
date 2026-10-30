import React from 'react'
// A tool chunk that fails to load (usually a deploy replaced the hashed files while this tab was open) stays failed:
// React.lazy keeps the rejected import, so remounting cannot recover. Reloading fetches the current build.
export const isChunkError = (e: Error) => /dynamically imported module|Importing a module script failed|error loading dynamically imported|Loading chunk/i.test(e.message)
const RELOAD_KEY = 'of:chunk-reload'
/** Reload once to pick up the current build. A second failure within a minute shows the error card instead of looping. */
export function reloadOnceForStaleChunk(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
    if (Date.now() - last < 60_000) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch { return false }
  location.reload()
  return true
}
/** Called once from main.tsx: stale chunks outside a tool page (lazy routes, preloads) reload once too. */
export function watchStaleChunks() {
  // Vite fires vite:preloadError when a lazy chunk or its preload fails (old hashed file gone after a deploy).
  window.addEventListener('vite:preloadError', (e) => { if (reloadOnceForStaleChunk()) e.preventDefault() })
  window.addEventListener('unhandledrejection', (e) => { const r = e.reason; if (r instanceof Error && isChunkError(r)) reloadOnceForStaleChunk() })
  window.addEventListener('error', (e) => { if (e.error instanceof Error && isChunkError(e.error)) reloadOnceForStaleChunk() })
}
/** title: the card heading. onError: called when the card is shown (Layout uses it to end the boot splash). */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode; title?: string; onError?: () => void }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  componentDidCatch(e: Error) { if (isChunkError(e) && reloadOnceForStaleChunk()) return; console.error(e); this.props.onError?.() }
  render() {
    if (this.state.err) return (
      <div className="rounded-2xl border border-danger/30 bg-danger/5 p-8 text-center">
        <div className="font-semibold text-danger">{this.props.title ?? 'Something went wrong in this tool.'}</div>
        <div className="mt-2 font-mono text-xs text-muted">{this.state.err.message}</div>
        <button onClick={() => (isChunkError(this.state.err!) ? location.reload() : this.setState({ err: null }))} className="mt-4 rounded-lg border border-border px-4 py-2 text-sm cursor-pointer">Try again</button>
      </div>
    )
    return this.props.children
  }
}
