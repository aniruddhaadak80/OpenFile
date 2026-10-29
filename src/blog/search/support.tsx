// Small helpers for the blog search: lazy index loader, recent searches and the highlight renderer.
import { useCallback, useEffect, useRef, useState } from 'react'
import { highlightParts } from './engine'

// ---------- lazy index ----------
export interface IndexFile { v: number; posts: Record<string, { q: number; s: [string, string, string][] }> }
export type IndexStatus = 'idle' | 'loading' | 'ready' | 'error'
let cached: IndexFile | null = null
let pending: Promise<IndexFile> | null = null

/** Loads the full text index the first time something asks for it (focus, hover or a shared search link). */
export function useSearchIndex(autoload: boolean) {
  const [data, setData] = useState<IndexFile | null>(cached)
  const [status, setStatus] = useState<IndexStatus>(cached ? 'ready' : 'idle')
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])
  const load = useCallback(() => {
    if (cached) { setData(cached); setStatus('ready'); return }
    setStatus('loading')
    pending ??= import('./index.generated.json').then((m) => (cached = (m.default ?? m) as unknown as IndexFile))
    pending.then((d) => { if (alive.current) { setData(d); setStatus('ready') } }, () => { pending = null; if (alive.current) setStatus('error') })
  }, [])
  useEffect(() => { if (autoload && status === 'idle') load() }, [autoload, status, load])
  return { data, status, load }
}

// ---------- recent searches ----------
const KEY = 'of-blog-recent-searches'
const MAX = 6
const read = (): string[] => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, MAX) : [] } catch { return [] } }
const write = (v: string[]) => { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* private mode */ } }

export function useRecentSearches() {
  const [list, setList] = useState<string[]>(() => (typeof localStorage === 'undefined' ? [] : read()))
  const add = useCallback((q: string) => {
    const t = q.trim().replace(/\s+/g, ' ')
    if (t.length < 2) return
    setList((cur) => { const next = [t, ...cur.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX); write(next); return next })
  }, [])
  const remove = useCallback((q: string) => setList((cur) => { const next = cur.filter((x) => x !== q); write(next); return next }), [])
  const clear = useCallback(() => { write([]); setList([]) }, [])
  return { list, add, remove, clear }
}

// ---------- highlight ----------
/** Renders text with matched words wrapped in <mark>. Built from text nodes only, never HTML strings. */
export function Hl({ text, words, phrases, className }: { text: string; words: string[]; phrases?: string[]; className?: string }) {
  const parts = highlightParts(text, words, phrases)
  return <span className={className}>{parts.map((p, i) => p.hit
    ? <mark key={i} className="rounded-[4px] bg-accent/20 px-0.5 font-medium text-fg ring-1 ring-accent/30">{p.t}</mark>
    : <span key={i}>{p.t}</span>)}</span>
}
