/* eBook helpers for round 14: Kindle clippings and book statistics. Pure, unit tested. */

export type ClipType = 'Highlight' | 'Note' | 'Bookmark'
export interface Clip { book: string; author: string; type: ClipType; page?: string; location?: string; locStart?: number; added?: string; text: string }

/** Parse a Kindle "My Clippings.txt" file. Handles the English layout and common variants. */
export function parseClippings(text: string): Clip[] {
  const out: Clip[] = []
  const blocks = text.replace(/^\uFEFF/, '').replace(/\r/g, '').split(/\n?={8,}\n?/)
  for (const b of blocks) {
    const lines = b.split('\n').map((l) => l.replace(/^\uFEFF/, ''))
    while (lines.length && !lines[0].trim()) lines.shift()
    if (lines.length < 2) continue
    const head = lines[0].trim()
    const m = head.match(/^(.*)\(([^()]*)\)\s*$/)
    const book = (m ? m[1] : head).trim(), author = m ? m[2].trim() : ''
    const meta = lines[1]
    const type: ClipType = /note|notiz|nota/i.test(meta) ? 'Note' : /bookmark|lesezeichen|marcador|signet/i.test(meta) ? 'Bookmark' : 'Highlight'
    const page = meta.match(/page\s+([\w-]+)/i)?.[1]
    const loc = meta.match(/(?:location|loc\.|position)\s+([\d]+(?:-\d+)?)/i)?.[1]
    const added = meta.split('|').pop()?.replace(/^\s*Added on\s*/i, '').trim()
    const body = lines.slice(2).join('\n').trim()
    if (type !== 'Bookmark' && !body) continue
    out.push({ book, author, type, page, location: loc, locStart: loc ? +loc.split('-')[0] : undefined, added, text: body })
  }
  return out
}

/** Drop highlights that were extended later (same book, overlapping start, one text contains the other). */
export function dedupeClips(clips: Clip[]): { clips: Clip[]; removed: number } {
  const keep: Clip[] = []
  let removed = 0
  for (const c of clips) {
    const i = keep.findIndex((k) => k.book === c.book && k.type === c.type && c.type === 'Highlight' && (k.text.includes(c.text) || c.text.includes(k.text)) && (k.locStart == null || c.locStart == null || Math.abs(k.locStart - c.locStart) < 20))
    if (i >= 0) { removed++; if (c.text.length > keep[i].text.length) keep[i] = c; continue }
    keep.push(c)
  }
  return { clips: keep, removed }
}

export function groupByBook(clips: Clip[]) {
  const m = new Map<string, { book: string; author: string; clips: Clip[] }>()
  for (const c of clips) { const k = c.book + '|' + c.author; if (!m.has(k)) m.set(k, { book: c.book, author: c.author, clips: [] }); m.get(k)!.clips.push(c) }
  return [...m.values()].map((g) => ({ ...g, clips: g.clips.sort((a, b) => (a.locStart ?? 0) - (b.locStart ?? 0)) }))
}

export function clipsMarkdown(g: { book: string; author: string; clips: Clip[] }, o: { notes: boolean; meta: boolean }): string {
  const lines = [`# ${g.book}`, g.author ? `*${g.author}*` : '', '']
  for (const c of g.clips) {
    if (c.type === 'Bookmark') continue
    if (c.type === 'Note' && !o.notes) continue
    const where = [c.page ? `page ${c.page}` : '', c.location ? `location ${c.location}` : ''].filter(Boolean).join(', ')
    lines.push(c.type === 'Note' ? `**Note:** ${c.text}` : c.text.split('\n').map((l) => '> ' + l).join('\n'))
    if (o.meta && where) lines.push('', `<sub>${where}</sub>`)
    lines.push('')
  }
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim() + '\n'
}

/* ---------------- stats ---------------- */
export function countWords(s: string) { return (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length }
export function readingTime(words: number, wpm: number) { const min = words / Math.max(50, wpm); const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h} h ${m} min` : `${Math.max(1, m)} min` }
const STOP = new Set('the a an and or but of to in on at for with by from as is are was were be been it its this that these those he she they we you i his her their our your my me him them us not no so if then than there here what which who whom when where why how all any each more most other some such only own same too very can will just do does did have has had into over under again further once about against between through during before after above below up down out off also would could should may might must shall said one two'.split(' '))
export function topWords(text: string, n = 30) {
  const m = new Map<string, number>()
  for (const w of text.toLowerCase().match(/[\p{L}][\p{L}'’-]*/gu) ?? []) { if (w.length < 3 || STOP.has(w)) continue; m.set(w, (m.get(w) ?? 0) + 1) }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([word, count]) => ({ word, count }))
}
export function uniqueWords(text: string) { return new Set(text.toLowerCase().match(/[\p{L}][\p{L}'’-]*/gu) ?? []).size }
