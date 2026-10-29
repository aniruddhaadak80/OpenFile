import React from 'react'
// A tool chunk that fails to load (usually a deploy replaced the hashed files while this tab was open) stays failed:
// React.lazy keeps the rejected import, so remounting cannot recover. Reloading fetches the current build.
const isChunkError = (e: Error) => /dynamically imported module|Importing a module script failed|error loading dynamically imported|Loading chunk/i.test(e.message)
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  componentDidCatch(e: Error) { console.error(e) }
  render() {
    if (this.state.err) return (
      <div className="rounded-2xl border border-danger/30 bg-danger/5 p-8 text-center">
        <div className="font-semibold text-danger">Something went wrong in this tool.</div>
        <div className="mt-2 font-mono text-xs text-muted">{this.state.err.message}</div>
        <button onClick={() => (isChunkError(this.state.err!) ? location.reload() : this.setState({ err: null }))} className="mt-4 rounded-lg border border-border px-4 py-2 text-sm cursor-pointer">Try again</button>
      </div>
    )
    return this.props.children
  }
}
