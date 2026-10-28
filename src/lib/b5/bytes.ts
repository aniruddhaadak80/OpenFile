/* Byte analysis helpers (pure). */
export function entropy(b: Uint8Array): number {
  if (!b.length) return 0
  const f = new Float64Array(256); for (const x of b) f[x]++
  let h = 0; for (const c of f) if (c) { const p = c / b.length; h -= p * Math.log2(p) }
  return h
}

export function entropyBlocks(b: Uint8Array, blocks = 128): number[] {
  if (!b.length) return []
  const size = Math.max(256, Math.ceil(b.length / blocks)); const out: number[] = []
  for (let o = 0; o < b.length; o += size) out.push(entropy(b.subarray(o, o + size)))
  return out
}

export function byteHistogram(b: Uint8Array) { const f = new Array(256).fill(0); for (const x of b) f[x]++; return f as number[] }

export function extractStrings(b: Uint8Array, min = 4, max = 20000): { offset: number; text: string; enc: 'ascii' | 'utf16le' }[] {
  const out: { offset: number; text: string; enc: 'ascii' | 'utf16le' }[] = []
  let start = -1
  for (let i = 0; i <= b.length; i++) {
    const ok = i < b.length && ((b[i] >= 32 && b[i] < 127) || b[i] === 9)
    if (ok) { if (start < 0) start = i } else if (start >= 0) { if (i - start >= min) { out.push({ offset: start, text: String.fromCharCode(...b.subarray(start, Math.min(i, start + 500))), enc: 'ascii' }); if (out.length >= max) return out } start = -1 }
  }
  // UTF-16LE runs
  start = -1
  for (let i = 0; i + 1 <= b.length; i += 2) {
    const ok = i + 1 < b.length && b[i + 1] === 0 && b[i] >= 32 && b[i] < 127
    if (ok) { if (start < 0) start = i } else if (start >= 0) { const n = (i - start) / 2; if (n >= min) { let s = ''; for (let k = start; k < Math.min(i, start + 1000); k += 2) s += String.fromCharCode(b[k]); out.push({ offset: start, text: s, enc: 'utf16le' }); if (out.length >= max) break } start = -1 }
  }
  return out.sort((x, y) => x.offset - y.offset)
}

/** Parse a search pattern: hex bytes ("de ad be ef") or text. */
export function patternBytes(q: string, mode: 'hex' | 'text'): Uint8Array | null {
  if (mode === 'text') return q ? new TextEncoder().encode(q) : null
  const t = q.replace(/0x/gi, '').replace(/[^0-9a-f]/gi, '')
  if (!t || t.length % 2) return null
  return Uint8Array.from(t.match(/../g)!, (h) => parseInt(h, 16))
}

export function findAll(b: Uint8Array, pat: Uint8Array, limit = 10000): number[] {
  const out: number[] = []; if (!pat.length) return out
  const first = pat[0]
  for (let i = b.indexOf(first); i >= 0 && i <= b.length - pat.length; i = b.indexOf(first, i + 1)) {
    let ok = true; for (let k = 1; k < pat.length; k++) if (b[i + k] !== pat[k]) { ok = false; break }
    if (ok) { out.push(i); if (out.length >= limit) break }
  }
  return out
}

export function entropyLabel(h: number) {
  return h < 1 ? 'Very low (mostly repeated bytes)' : h < 5 ? 'Low (text or simple data)' : h < 7.2 ? 'Medium (code or mixed data)' : h < 7.9 ? 'High (compressed media likely)' : 'Very high (compressed or encrypted)'
}
