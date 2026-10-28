import { Link } from 'react-router-dom'
export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-6 py-32 text-center">
      <div className="font-display text-8xl font-bold text-gradient">404</div>
      <p className="mt-4 text-muted">That page wandered off. Try the search (Ctrl K) or browse every tool.</p>
      <Link to="/tools" className="mt-8 inline-flex rounded-xl bg-gradient-brand px-5 py-2.5 text-sm font-medium text-white">Browse all tools</Link>
    </div>
  )
}
