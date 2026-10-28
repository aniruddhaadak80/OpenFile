/* Group word-level timestamps into short caption lines. Pure, unit tested. */
export interface Word { start: number; end: number; text: string }
export function groupWords(words: Word[], maxWords = 6, maxGap = 0.8, maxChars = 42): Word[] {
  const out: Word[] = []
  let cur: Word | null = null, n = 0
  for (const w of words) {
    const t = w.text.trim(); if (!t) continue
    const breakHere = !cur || n >= maxWords || w.start - cur.end > maxGap || (cur.text + ' ' + t).length > maxChars || /[.!?]$/.test(cur.text)
    if (breakHere) { if (cur) out.push(cur); cur = { start: w.start, end: w.end, text: t }; n = 1 }
    else { cur!.text += ' ' + t; cur!.end = w.end; n++ }
  }
  if (cur) out.push(cur)
  return out
}
