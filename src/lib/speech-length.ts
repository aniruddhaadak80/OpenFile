/** "About 5 seconds" / "About 3 minutes" of speech for a word count at about 150 words a minute. Pure. */
export function speechLength(words: number, speed = 1): string {
  if (!(words > 0)) return 'No words to read yet'
  const secs = (words / 150 / (speed > 0 ? speed : 1)) * 60
  if (secs < 59.5) { const s = Math.max(1, Math.round(secs)); return `About ${s} second${s === 1 ? '' : 's'} of speech` }
  const m = Math.round(secs / 60)
  return `About ${m} minute${m === 1 ? '' : 's'} of speech`
}
