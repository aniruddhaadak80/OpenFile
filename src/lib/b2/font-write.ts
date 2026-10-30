/* Writes a font with fonteditor-core and never hands back an empty file. Pure (no bundler imports), so the
 * Node tests in scripts/tests/b2 run it against the real library. */
export type WriteKind = 'ttf' | 'woff' | 'woff2' | 'eot' | 'svg'
export type FontWriter = (kerning: boolean) => Uint8Array | string

export const outSize = (out: Uint8Array | string | null | undefined) => (out == null ? 0 : typeof out === 'string' ? out.length : out.byteLength)

/** Runs `write` with the requested kerning. The WOFF2 encoder returns nothing when fonteditor keeps the GPOS
 *  (kerning and mark positioning) table, which happened for every OTF and TTF tried, so WOFF2 is then written
 *  once more without that table (`kerningDropped`).
 *  Throws instead of returning an empty file. */
export function writeChecked(write: FontWriter, type: WriteKind, kerning = true): { data: Uint8Array | string; kerningDropped: boolean } {
  let data = write(kerning)
  let kerningDropped = false
  if (outSize(data) === 0 && type === 'woff2' && kerning) { data = write(false); kerningDropped = outSize(data) > 0 }
  if (outSize(data) === 0) throw new Error(`Could not write a ${type.toUpperCase()} file for this font. Try another output format.`)
  return { data, kerningDropped }
}
