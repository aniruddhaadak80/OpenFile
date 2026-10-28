/* Visual crontab builder: field state <-> cron text. Pure logic. */
export type CronFieldKey = 'second' | 'minute' | 'hour' | 'dom' | 'month' | 'dow'
export type FieldMode = 'every' | 'step' | 'specific' | 'range'
export interface FieldState { mode: FieldMode; step: number; from: number; to: number; values: number[] }
export interface FieldSpec { key: CronFieldKey; label: string; min: number; max: number; names?: string[] }

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const FIELD_SPECS: FieldSpec[] = [
  { key: 'second', label: 'Second', min: 0, max: 59 },
  { key: 'minute', label: 'Minute', min: 0, max: 59 },
  { key: 'hour', label: 'Hour', min: 0, max: 23 },
  { key: 'dom', label: 'Day of month', min: 1, max: 31 },
  { key: 'month', label: 'Month', min: 1, max: 12, names: MONTH_NAMES },
  { key: 'dow', label: 'Day of week', min: 0, max: 6, names: DOW_NAMES },
]
export const specOf = (k: CronFieldKey) => FIELD_SPECS.find((f) => f.key === k)!

export const defaultField = (spec: FieldSpec): FieldState => ({ mode: 'every', step: spec.key === 'minute' || spec.key === 'second' ? 5 : 2, from: spec.min, to: spec.max, values: [] })

export function fieldToText(spec: FieldSpec, s: FieldState): string {
  switch (s.mode) {
    case 'every': return '*'
    case 'step': return s.from > spec.min ? `${s.from}/${Math.max(1, s.step)}` : `*/${Math.max(1, s.step)}`
    case 'range': return `${Math.min(s.from, s.to)}-${Math.max(s.from, s.to)}`
    case 'specific': {
      const v = [...new Set(s.values)].filter((x) => x >= spec.min && x <= spec.max).sort((a, b) => a - b)
      if (!v.length) return '*'
      return compress(v)
    }
  }
}
/** 1,2,3,5 -> 1-3,5 */
function compress(v: number[]): string {
  const out: string[] = []
  for (let i = 0; i < v.length; i++) {
    let j = i
    while (j + 1 < v.length && v[j + 1] === v[j] + 1) j++
    out.push(j - i >= 2 ? `${v[i]}-${v[j]}` : j > i ? `${v[i]},${v[j]}` : String(v[i]))
    i = j
  }
  return out.join(',')
}

function nameToNum(spec: FieldSpec, t: string): number {
  const n = Number(t)
  if (Number.isInteger(n)) return spec.key === 'dow' && n === 7 ? 0 : n
  const i = spec.names?.findIndex((x) => x.toLowerCase() === t.toLowerCase().slice(0, 3)) ?? -1
  if (i < 0) return NaN
  return spec.key === 'month' ? i + 1 : i
}

/** Parse one field back into builder state. Returns null when it uses syntax the builder cannot show (L, #, W, ?). */
export function textToField(spec: FieldSpec, raw: string): FieldState | null {
  const t = raw.trim()
  const base = defaultField(spec)
  if (t === '*' || t === '?') return base
  let m = t.match(/^(\*|\d+)\/(\d+)$/)
  if (m) return { ...base, mode: 'step', step: Number(m[2]), from: m[1] === '*' ? spec.min : Number(m[1]) }
  m = t.match(/^(\w+)-(\w+)$/)
  if (m) {
    const a = nameToNum(spec, m[1]), b = nameToNum(spec, m[2])
    if (isNaN(a) || isNaN(b)) return null
    return { ...base, mode: 'range', from: a, to: b }
  }
  const values: number[] = []
  for (const part of t.split(',')) {
    const r = part.match(/^(\w+)-(\w+)$/)
    if (r) {
      const a = nameToNum(spec, r[1]), b = nameToNum(spec, r[2])
      if (isNaN(a) || isNaN(b) || a > b) return null
      for (let x = a; x <= b; x++) values.push(x)
    } else {
      const n = nameToNum(spec, part)
      if (isNaN(n) || n < spec.min || n > spec.max) return null
      values.push(n)
    }
  }
  return { ...base, mode: 'specific', values: [...new Set(values)].sort((a, b) => a - b) }
}

export type BuilderState = Record<CronFieldKey, FieldState>
export const defaultBuilder = (): BuilderState => Object.fromEntries(FIELD_SPECS.map((s) => [s.key, defaultField(s)])) as BuilderState

export function builderToCron(b: BuilderState, withSeconds: boolean): string {
  const keys: CronFieldKey[] = withSeconds ? ['second', 'minute', 'hour', 'dom', 'month', 'dow'] : ['minute', 'hour', 'dom', 'month', 'dow']
  return keys.map((k) => fieldToText(specOf(k), b[k])).join(' ')
}

export function cronToBuilder(expr: string): { state: BuilderState; withSeconds: boolean } | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5 && parts.length !== 6) return null
  const withSeconds = parts.length === 6
  const keys: CronFieldKey[] = withSeconds ? ['second', 'minute', 'hour', 'dom', 'month', 'dow'] : ['minute', 'hour', 'dom', 'month', 'dow']
  const state = defaultBuilder()
  for (let i = 0; i < keys.length; i++) {
    const f = textToField(specOf(keys[i]), parts[i])
    if (!f) return null
    state[keys[i]] = f
  }
  return { state, withSeconds }
}
