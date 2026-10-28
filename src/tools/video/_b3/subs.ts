/* Subtitle helpers for burning text with libass inside ffmpeg.wasm.
 * The wasm build has no font provider, so libass can only use fonts we load explicitly. We ship
 * Liberation Sans (SIL OFL, from pdfjs-dist) and point every style at it. */
import regularUrl from 'pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf?url'
import boldUrl from 'pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf?url'

export const FONT_FAMILY = 'Liberation Sans'
export const FONTS_DIR = '/fonts'

export async function fontInputs(): Promise<{ name: string; file: Uint8Array }[]> {
  const get = async (u: string) => new Uint8Array(await (await fetch(u)).arrayBuffer())
  const [r, b] = await Promise.all([get(regularUrl), get(boldUrl)])
  return [{ name: `${FONTS_DIR}/LiberationSans-Regular.ttf`, file: r }, { name: `${FONTS_DIR}/LiberationSans-Bold.ttf`, file: b }]
}

/** Point every ASS style and inline \fn override at the bundled font, keeping everything else. */
export function assUseFont(text: string, family = FONT_FAMILY): string {
  const lines = text.split(/\r?\n/)
  let fmt: string[] | null = null
  let inStyles = false
  return lines.map((ln) => {
    if (/^\[.*\]$/.test(ln.trim())) { inStyles = /styles/i.test(ln); fmt = null; return ln }
    if (inStyles && /^Format:/i.test(ln)) { fmt = ln.slice(7).split(',').map((s) => s.trim().toLowerCase()); return ln }
    if (inStyles && fmt && /^Style:/i.test(ln)) {
      const parts = ln.slice(6).split(',')
      const i = fmt.indexOf('fontname')
      if (i >= 0 && i < parts.length) parts[i] = family
      return 'Style:' + parts.join(',')
    }
    if (/^Dialogue:/i.test(ln)) return ln.replace(/\\fn[^\\}]*/g, `\\fn${family}`)
    return ln
  }).join('\n')
}

export type SubKind = 'srt' | 'vtt' | 'ass'
export function subKind(name: string, text: string): SubKind {
  if (/\.(ass|ssa)$/i.test(name) || /^\s*\[Script Info\]/i.test(text)) return 'ass'
  if (/\.vtt$/i.test(name) || /^\uFEFF?WEBVTT/.test(text)) return 'vtt'
  return 'srt'
}

/** Count cues for a quick sanity check shown to the user. */
export function countCues(text: string, kind: SubKind): number {
  if (kind === 'ass') return (text.match(/^Dialogue:/gim) || []).length
  return (text.match(/-->/g) || []).length
}
