/* Text decoding with charset fallback for subtitle and plain-text files. */
export const ENCODINGS = [
  { value: 'auto', label: 'Auto detect' }, { value: 'utf-8', label: 'UTF-8' }, { value: 'utf-16le', label: 'UTF-16 LE' }, { value: 'windows-1252', label: 'Western (Windows-1252)' },
  { value: 'iso-8859-2', label: 'Central European (ISO-8859-2)' }, { value: 'windows-1250', label: 'Central European (Windows-1250)' }, { value: 'windows-1251', label: 'Cyrillic (Windows-1251)' },
  { value: 'koi8-r', label: 'Cyrillic (KOI8-R)' }, { value: 'iso-8859-7', label: 'Greek (ISO-8859-7)' }, { value: 'windows-1254', label: 'Turkish (Windows-1254)' }, { value: 'windows-1255', label: 'Hebrew (Windows-1255)' },
  { value: 'windows-1256', label: 'Arabic (Windows-1256)' }, { value: 'gbk', label: 'Chinese Simplified (GBK)' }, { value: 'big5', label: 'Chinese Traditional (Big5)' }, { value: 'shift_jis', label: 'Japanese (Shift JIS)' },
  { value: 'euc-kr', label: 'Korean (EUC-KR)' }, { value: 'windows-874', label: 'Thai (Windows-874)' },
]

export function decodeText(buf: ArrayBuffer | Uint8Array, enc = 'auto'): { text: string; encoding: string } {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  if (enc !== 'auto') return { text: new TextDecoder(enc).decode(u8), encoding: enc }
  if (u8[0] === 0xff && u8[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(u8), encoding: 'utf-16le' }
  if (u8[0] === 0xfe && u8[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(u8), encoding: 'utf-16be' }
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(u8), encoding: 'utf-8' } } catch { /* not utf-8 */ }
  // crude guess: lots of 0xC0-0xFF bytes in Cyrillic ranges -> 1251, else 1252
  let hi = 0, cyr = 0
  for (let i = 0; i < Math.min(u8.length, 20000); i++) { const c = u8[i]; if (c >= 0x80) { hi++; if (c >= 0xc0) cyr++ } }
  const guess = hi && cyr / hi > 0.8 ? 'windows-1251' : 'windows-1252'
  return { text: new TextDecoder(guess).decode(u8), encoding: guess }
}

export async function readTextFile(f: Blob, enc = 'auto') { return decodeText(await f.arrayBuffer(), enc) }
