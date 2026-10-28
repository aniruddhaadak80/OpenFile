import React from 'react'
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  componentDidCatch(e: Error) { console.error(e) }
  render() {
    if (this.state.err) return (
      <div className="rounded-2xl border border-danger/30 bg-danger/5 p-8 text-center">
        <div className="font-semibold text-danger">Something went wrong in this tool.</div>
        <div className="mt-2 font-mono text-xs text-muted">{this.state.err.message}</div>
        <button onClick={() => this.setState({ err: null })} className="mt-4 rounded-lg border border-border px-4 py-2 text-sm cursor-pointer">Try again</button>
      </div>
    )
    return this.props.children
  }
}
