/* Structural JSON diff + RFC 6902 patch output (pure). */
export type Change = { path: (string | number)[]; kind: 'added' | 'removed' | 'changed' | 'type'; a?: unknown; b?: unknown }

const typeOf = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v)

export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableStringify((v as any)[k])).join(',') + '}'
  return JSON.stringify(v)
}

export function diffJson(a: unknown, b: unknown, opts: { ignoreOrder?: boolean; ignoreCase?: boolean; numTolerance?: number } = {}, path: (string | number)[] = [], out: Change[] = []): Change[] {
  const ta = typeOf(a), tb = typeOf(b)
  if (ta !== tb) { out.push({ path, kind: 'type', a, b }); return out }
  if (ta === 'array') {
    const A = a as unknown[], B = b as unknown[]
    if (opts.ignoreOrder) {
      const bs = B.map(stableStringify); const used = new Set<number>()
      const restA: number[] = []
      A.forEach((x, i) => { const s = stableStringify(x); const j = bs.findIndex((y, k) => !used.has(k) && y === s); if (j >= 0) used.add(j); else restA.push(i) })
      const restB = B.map((_, k) => k).filter((k) => !used.has(k))
      const n = Math.min(restA.length, restB.length)
      for (let i = 0; i < n; i++) diffJson(A[restA[i]], B[restB[i]], opts, [...path, restA[i]], out)
      restA.slice(n).forEach((i) => out.push({ path: [...path, i], kind: 'removed', a: A[i] }))
      restB.slice(n).forEach((k) => out.push({ path: [...path, k], kind: 'added', b: B[k] }))
      return out
    }
    const n = Math.max(A.length, B.length)
    for (let i = 0; i < n; i++) {
      if (i >= A.length) out.push({ path: [...path, i], kind: 'added', b: B[i] })
      else if (i >= B.length) out.push({ path: [...path, i], kind: 'removed', a: A[i] })
      else diffJson(A[i], B[i], opts, [...path, i], out)
    }
    return out
  }
  if (ta === 'object') {
    const A = a as Record<string, unknown>, B = b as Record<string, unknown>
    const keys = [...new Set([...Object.keys(A), ...Object.keys(B)])]
    for (const k of keys) {
      if (!(k in B)) out.push({ path: [...path, k], kind: 'removed', a: A[k] })
      else if (!(k in A)) out.push({ path: [...path, k], kind: 'added', b: B[k] })
      else diffJson(A[k], B[k], opts, [...path, k], out)
    }
    return out
  }
  let same = a === b
  if (!same && ta === 'string' && opts.ignoreCase) same = (a as string).toLowerCase() === (b as string).toLowerCase()
  if (!same && ta === 'number' && opts.numTolerance) same = Math.abs((a as number) - (b as number)) <= opts.numTolerance
  if (!same) out.push({ path, kind: 'changed', a, b })
  return out
}

export const pointer = (p: (string | number)[]) => '/' + p.map((s) => String(s).replace(/~/g, '~0').replace(/\//g, '~1')).join('/')
export const dotPath = (p: (string | number)[]) => p.length ? p.map((s, i) => typeof s === 'number' ? `[${s}]` : /^[A-Za-z_$][\w$]*$/.test(s) ? (i ? '.' : '') + s : `[${JSON.stringify(s)}]`).join('') : '(root)'

export function toPatch(changes: Change[]) {
  // removals of array items must go from the highest index down
  const rem = changes.filter((c) => c.kind === 'removed').sort((x, y) => (typeof y.path.at(-1) === 'number' && typeof x.path.at(-1) === 'number' ? (y.path.at(-1) as number) - (x.path.at(-1) as number) : 0))
  return [
    ...changes.filter((c) => c.kind === 'changed' || c.kind === 'type').map((c) => ({ op: 'replace', path: pointer(c.path), value: c.b })),
    ...rem.map((c) => ({ op: 'remove', path: pointer(c.path) })),
    ...changes.filter((c) => c.kind === 'added').map((c) => ({ op: 'add', path: pointer(c.path), value: c.b })),
  ]
}
