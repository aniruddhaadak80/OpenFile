/* Tiny undo/redo store. Live updates (during drags) use `update`, then `commit` snapshots once. */
import { useCallback, useRef, useState } from 'react'

export function useHistory<T>(initial: T) {
  const [present, setPresent] = useState<T>(initial)
  const past = useRef<T[]>([])
  const future = useRef<T[]>([])
  const base = useRef<T | null>(null)
  const cur = useRef<T>(initial)
  const [, force] = useState(0)

  const update = useCallback((v: T | ((p: T) => T)) => {
    const next = typeof v === 'function' ? (v as (p: T) => T)(cur.current) : v
    if (base.current === null) base.current = cur.current
    cur.current = next
    setPresent(next)
  }, [])
  /** finish a gesture: snapshot the state before it */
  const commit = useCallback(() => {
    if (base.current !== null && base.current !== cur.current) {
      past.current.push(base.current)
      if (past.current.length > 200) past.current.shift()
      future.current = []
      force((n) => n + 1)
    }
    base.current = null
  }, [])
  /** discrete change (update + commit) */
  const apply = useCallback((v: T | ((p: T) => T)) => { update(v); commit() }, [update, commit])
  const undo = useCallback(() => {
    base.current = null
    const prev = past.current.pop()
    if (prev === undefined) return
    future.current.push(cur.current)
    cur.current = prev; setPresent(prev); force((n) => n + 1)
  }, [])
  const redo = useCallback(() => {
    base.current = null
    const nxt = future.current.pop()
    if (nxt === undefined) return
    past.current.push(cur.current)
    cur.current = nxt; setPresent(nxt); force((n) => n + 1)
  }, [])
  const reset = useCallback((v: T) => { past.current = []; future.current = []; base.current = null; cur.current = v; setPresent(v); force((n) => n + 1) }, [])
  return { state: present, update, commit, apply, undo, redo, reset, canUndo: past.current.length > 0, canRedo: future.current.length > 0, get: () => cur.current }
}
