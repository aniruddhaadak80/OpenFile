/* Light captions for the Image Captioner fallback: object labels from a small detector plus the light and colour of the photo. */

const PLURAL: Record<string, string> = { person: 'people', mouse: 'mice', knife: 'knives', sheep: 'sheep', skis: 'skis', scissors: 'scissors', bus: 'buses', glass: 'glasses', bench: 'benches', couch: 'couches', sandwich: 'sandwiches', toothbrush: 'toothbrushes', 'wine glass': 'wine glasses' }
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const plural = (w: string) => PLURAL[w] ?? (/(s|x|ch|sh)$/.test(w) ? w + 'es' : w + 's')
const article = (w: string) => (/^[aeiou]/.test(w) ? 'an ' : 'a ') + w

export interface Tone { light: 'dark' | 'dim' | 'bright' | 'normal'; color: string; wide: 'landscape' | 'portrait' | 'square' }

/** Join object labels into a short sentence, most frequent first. Pure. */
export function captionFromObjects(labels: string[], tone?: Tone): string {
  const counts = new Map<string, number>()
  for (const l of labels) { const k = l.toLowerCase().trim(); if (k) counts.set(k, (counts.get(k) ?? 0) + 1) }
  const parts = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w, n]) => (n === 1 ? article(w) : `${NUM[n] ?? n} ${plural(w)}`))
  const list = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts.at(-1) : parts[0]
  const look = tone ? [tone.light === 'normal' ? '' : tone.light, tone.color].filter(Boolean).join(', ') : ''
  const kind = tone ? (tone.wide === 'portrait' ? 'tall photo' : tone.wide === 'square' ? 'square photo' : 'photo') : 'photo'
  if (!list) return `A ${look ? look + ' ' : ''}${kind} with no everyday objects found.`.replace(/\s+/g, ' ')
  return `A ${look ? look + ' ' : ''}${kind} of ${list}.`.replace(/\s+/g, ' ')
}

const NAMES: [string, number, number, number][] = [['red', 200, 50, 50], ['orange', 230, 140, 40], ['yellow', 230, 210, 60], ['green', 70, 150, 70], ['teal', 40, 150, 150], ['blue', 50, 100, 200], ['brown', 120, 80, 50], ['grey', 128, 128, 128], ['white', 235, 235, 235], ['black', 20, 20, 20]]

/** Name the main tone of RGB pixels (r,g,b,a array). Pure. */
export function toneFromPixels(d: Uint8ClampedArray | number[], w: number, h: number): Tone {
  let r = 0, g = 0, b = 0, n = 0, lum = 0
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; lum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++ }
  n = Math.max(1, n); r /= n; g /= n; b /= n; lum /= n
  const sat = Math.max(r, g, b) - Math.min(r, g, b)
  let color = 'grey'
  if (sat > 18) { let best = Infinity; for (const [nm, R, G, B] of NAMES.slice(0, 7)) { const dd = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2; if (dd < best) { best = dd; color = nm } } }
  const light = lum < 50 ? 'dark' : lum < 95 ? 'dim' : lum > 190 ? 'bright' : 'normal'
  const ratio = w / Math.max(1, h)
  return { light, color: sat > 18 ? `mostly ${color}` : '', wide: ratio > 1.15 ? 'landscape' : ratio < 0.87 ? 'portrait' : 'square' }
}

export async function toneOf(file: Blob): Promise<Tone | undefined> {
  try {
    const bmp = await createImageBitmap(file)
    const c = document.createElement('canvas'); c.width = 48; c.height = 48
    const ctx = c.getContext('2d')!; ctx.drawImage(bmp, 0, 0, 48, 48)
    const t = toneFromPixels(ctx.getImageData(0, 0, 48, 48).data, bmp.width, bmp.height); bmp.close(); return t
  } catch { return undefined }
}
