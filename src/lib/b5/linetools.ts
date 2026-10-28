/* Line join / split / pad / wrap helpers for the text cleaner. Pure logic. */
export const unescapeDelim = (s: string) => s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r')

export interface JoinOpts { delim: string; quote: string; skipEmpty: boolean; trim: boolean; wrapStart?: string; wrapEnd?: string }
export function joinLines(text: string, o: JoinOpts): string {
  let ls = text.split(/\r?\n/)
  if (o.trim) ls = ls.map((l) => l.trim())
  if (o.skipEmpty) ls = ls.filter((l) => l.length > 0)
  const q = o.quote
  const esc = (l: string) => (q ? l.split(q).join(q === "'" ? "''" : '\\' + q) : l)
  return (o.wrapStart ?? '') + ls.map((l) => q + esc(l) + q).join(unescapeDelim(o.delim)) + (o.wrapEnd ?? '')
}

export function splitToLines(text: string, delim: string, trim = true): string {
  const d = unescapeDelim(delim)
  if (!d) return text
  const parts = text.split(d)
  return (trim ? parts.map((p) => p.trim()) : parts).join('\n')
}

export type PadSide = 'left' | 'right' | 'center'
export function padLines(text: string, width: number, ch: string, side: PadSide, auto = false): string {
  const ls = text.split(/\r?\n/)
  const len = (s: string) => Array.from(s).length
  const w = auto ? Math.max(0, ...ls.map(len)) : width
  const c = Array.from(ch || ' ')[0] ?? ' '
  return ls.map((l) => {
    const gap = w - len(l)
    if (gap <= 0) return l
    if (side === 'left') return c.repeat(gap) + l
    if (side === 'right') return l + c.repeat(gap)
    const left = Math.floor(gap / 2)
    return c.repeat(left) + l + c.repeat(gap - left)
  }).join('\n')
}

/** Hard wrap at a column. Breaks at spaces when possible; long words are split only when breakWords is on. Keeps paragraph breaks. */
export function wrapLines(text: string, width: number, breakWords = true, indent = ''): string {
  if (width < 1) return text
  return text.split(/\r?\n/).map((line) => {
    if (Array.from(line).length <= width) return line
    const lead = line.match(/^\s*/)![0]
    const words = line.trim().split(/\s+/)
    const out: string[] = []
    let cur = lead
    const room = (first: boolean) => width - (first ? 0 : indent.length)
    const push = () => { out.push(cur); cur = indent }
    for (let w of words) {
      const first = out.length === 0
      const base = cur.trim() ? cur + ' ' : cur
      if (Array.from(base + w).length <= room(first) + (first ? 0 : indent.length)) { cur = base + w; continue }
      if (cur.trim()) push()
      while (breakWords && Array.from(cur + w).length > width) {
        const take = Math.max(1, width - Array.from(cur).length)
        const chars = Array.from(w)
        cur += chars.slice(0, take).join(''); push(); w = chars.slice(take).join('')
      }
      cur += w
    }
    if (cur.trim()) out.push(cur)
    return out.join('\n')
  }).join('\n')
}
