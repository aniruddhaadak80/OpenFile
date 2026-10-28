/** Strict JSON validator with precise error location (line/col are 1-based). */
export class JsonError extends Error {
  pos: number; line: number; col: number
  constructor(msg: string, pos: number, line: number, col: number) { super(msg); this.pos = pos; this.line = line; this.col = col }
}

export function locate(src: string, pos: number) {
  let line = 1, col = 1
  for (let i = 0; i < pos && i < src.length; i++) { if (src[i] === '\n') { line++; col = 1 } else col++ }
  return { line, col }
}

export function validateJson(src: string): void {
  let i = 0
  const fail = (msg: string, at = i): never => { const { line, col } = locate(src, at); throw new JsonError(`${msg} at line ${line}, column ${col}`, at, line, col) }
  const ws = () => { while (i < src.length) { const c = src.charCodeAt(i); if (c === 32 || c === 9 || c === 10 || c === 13) i++; else break } }
  const desc = (c: string | undefined) => c === undefined ? 'end of input' : `'${c}'`
  const value = (depth: number): void => {
    if (depth > 5000) fail('Nesting too deep')
    ws()
    const c = src[i]
    if (c === '{') {
      i++; ws()
      if (src[i] === '}') { i++; return }
      while (true) {
        ws(); if (src[i] !== '"') fail(src[i] === '}' ? 'Trailing comma before }' : `Expected property name in double quotes but found ${desc(src[i])}`)
        string(); ws()
        if (src[i] !== ':') fail(`Expected ':' after property name but found ${desc(src[i])}`)
        i++; value(depth + 1); ws()
        if (src[i] === ',') { i++; continue }
        if (src[i] === '}') { i++; return }
        fail(`Expected ',' or '}' but found ${desc(src[i])}`)
      }
    } else if (c === '[') {
      i++; ws()
      if (src[i] === ']') { i++; return }
      while (true) {
        ws(); if (src[i] === ']') fail('Trailing comma before ]')
        value(depth + 1); ws()
        if (src[i] === ',') { i++; continue }
        if (src[i] === ']') { i++; return }
        fail(`Expected ',' or ']' but found ${desc(src[i])}`)
      }
    } else if (c === '"') string()
    else if (c === '-' || (c >= '0' && c <= '9')) number()
    else if (src.startsWith('true', i)) i += 4
    else if (src.startsWith('false', i)) i += 5
    else if (src.startsWith('null', i)) i += 4
    else if (c === "'") fail('Strings must use double quotes, not single quotes')
    else fail(`Unexpected ${desc(c)}`)
  }
  const string = () => {
    const start = i; i++
    while (true) {
      if (i >= src.length) fail('Unterminated string', start)
      const c = src[i]
      if (c === '"') { i++; return }
      if (c === '\n') fail('Unescaped line break inside string')
      if (src.charCodeAt(i) < 0x20) fail('Control character inside string must be escaped')
      if (c === '\\') {
        const n = src[i + 1]
        if (n === 'u') { if (!/^[0-9a-fA-F]{4}$/.test(src.substr(i + 2, 4))) fail('Invalid \\u escape'); i += 6; continue }
        if (!n || !'"\\/bfnrt'.includes(n)) fail(`Invalid escape sequence \\${n ?? ''}`)
        i += 2; continue
      }
      i++
    }
  }
  const number = () => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(src.slice(i, i + 400))
    if (!m) fail('Invalid number')
    i += m![0].length
  }
  ws()
  if (i >= src.length) fail('Input is empty')
  value(0); ws()
  if (i < src.length) fail(`Unexpected ${desc(src[i])} after the JSON value`)
}

export function sortDeep(v: any): any {
  if (Array.isArray(v)) return v.map(sortDeep)
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort((a, b) => a.localeCompare(b)).map((k) => [k, sortDeep(v[k])]))
  return v
}

export function jsonStats(v: any) {
  const s = { objects: 0, arrays: 0, keys: 0, strings: 0, numbers: 0, booleans: 0, nulls: 0, depth: 0 }
  const walk = (x: any, d: number) => {
    s.depth = Math.max(s.depth, d)
    if (Array.isArray(x)) { s.arrays++; x.forEach((y) => walk(y, d + 1)) }
    else if (x && typeof x === 'object') { s.objects++; for (const k in x) { s.keys++; walk(x[k], d + 1) } }
    else if (typeof x === 'string') s.strings++
    else if (typeof x === 'number') s.numbers++
    else if (typeof x === 'boolean') s.booleans++
    else s.nulls++
  }
  walk(v, 0)
  return s
}

export const pathPart = (k: string | number) => typeof k === 'number' ? `[${k}]` : /^[A-Za-z_$][\w$]*$/.test(k) ? `.${k}` : `[${JSON.stringify(k)}]`
