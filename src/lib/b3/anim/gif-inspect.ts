/* Byte-level GIF walker for the inspector and the repair tool. Never throws on damaged input:
 * it records what it could read, where it stopped, and why. */

export interface GifBlock {
  kind: 'image' | 'gce' | 'app' | 'comment' | 'text' | 'unknown-ext'
  offset: number
  end: number
  /** image */
  left?: number; top?: number; width?: number; height?: number; interlaced?: boolean; localColors?: number; lzwMin?: number; dataBytes?: number
  /** gce */
  disposal?: number; delay?: number; transparentIndex?: number | null; userInput?: boolean
  /** app / comment */
  id?: string; text?: string; loop?: number
  complete: boolean
}

export interface GifReport {
  valid: boolean
  version: string
  width: number
  height: number
  globalColors: number
  bgIndex: number
  aspect: number
  colorRes: number
  sorted: boolean
  palette: [number, number, number][]
  blocks: GifBlock[]
  frames: number
  loop: number | null
  trailer: boolean
  /** byte offset where parsing stopped */
  stoppedAt: number
  problems: string[]
  size: number
}

function readSubBlocks(b: Uint8Array, p: number): { end: number; bytes: number; data: number[]; complete: boolean } {
  let bytes = 0
  const data: number[] = []
  while (p < b.length) {
    const n = b[p]
    if (n === 0) return { end: p + 1, bytes, data, complete: true }
    if (p + 1 + n > b.length) return { end: b.length, bytes: bytes + (b.length - p - 1), data, complete: false }
    if (data.length < 4096) for (let i = 0; i < n && data.length < 4096; i++) data.push(b[p + 1 + i])
    bytes += n; p += 1 + n
  }
  return { end: b.length, bytes, data, complete: false }
}

export function inspectGif(b: Uint8Array): GifReport {
  const r: GifReport = { valid: false, version: '', width: 0, height: 0, globalColors: 0, bgIndex: 0, aspect: 0, colorRes: 0, sorted: false, palette: [], blocks: [], frames: 0, loop: null, trailer: false, stoppedAt: 0, problems: [], size: b.length }
  const sig = String.fromCharCode(...b.subarray(0, 6))
  if (!/^GIF8[79]a$/.test(sig)) { r.problems.push('The file does not start with a GIF header.'); return r }
  r.version = sig.slice(3)
  if (b.length < 13) { r.problems.push('The file ends inside the header.'); r.stoppedAt = b.length; return r }
  r.width = b[6] | (b[7] << 8); r.height = b[8] | (b[9] << 8)
  const f = b[10]
  r.colorRes = ((f >> 4) & 7) + 1; r.sorted = !!(f & 8); r.bgIndex = b[11]; r.aspect = b[12]
  let p = 13
  if (f & 0x80) {
    r.globalColors = 1 << ((f & 7) + 1)
    for (let i = 0; i < r.globalColors && p + 2 < b.length; i++, p += 3) r.palette.push([b[p], b[p + 1], b[p + 2]])
    if (p > b.length) { r.problems.push('The file ends inside the colour table.'); r.stoppedAt = b.length; return r }
  }
  r.valid = true
  while (p < b.length) {
    const t = b[p]
    if (t === 0x3b) { r.trailer = true; p++; break }
    if (t === 0x21) {
      const label = b[p + 1]
      const start = p
      if (label === 0xf9 && b[p + 2] === 4 && p + 7 < b.length) {
        const pk = b[p + 3]
        r.blocks.push({ kind: 'gce', offset: start, end: p + 8, disposal: (pk >> 2) & 7, userInput: !!(pk & 2), delay: (b[p + 4] | (b[p + 5] << 8)) * 10, transparentIndex: pk & 1 ? b[p + 6] : null, complete: b[p + 7] === 0 })
        p += 8; continue
      }
      if (label === 0xff) {
        const n = b[p + 2]
        const id = String.fromCharCode(...b.subarray(p + 3, Math.min(b.length, p + 3 + n)))
        const sb = readSubBlocks(b, p + 3 + n)
        const blk: GifBlock = { kind: 'app', offset: start, end: sb.end, id, complete: sb.complete }
        if (/^NETSCAPE2\.0|ANIMEXTS1\.0/.test(id) && sb.data[0] === 1) { blk.loop = sb.data[1] | (sb.data[2] << 8); r.loop = blk.loop }
        if (/^XMP DataXMP/.test(id)) blk.text = 'XMP metadata'
        r.blocks.push(blk); p = sb.end
        if (!sb.complete) { r.problems.push('The file ends inside an application block.'); break }
        continue
      }
      const sb = readSubBlocks(b, p + 2)
      const kind = label === 0xfe ? 'comment' : label === 0x01 ? 'text' : 'unknown-ext'
      r.blocks.push({ kind, offset: start, end: sb.end, text: kind === 'comment' ? String.fromCharCode(...sb.data).slice(0, 500) : undefined, complete: sb.complete })
      p = sb.end
      if (!sb.complete) { r.problems.push('The file ends inside an extension block.'); break }
      continue
    }
    if (t === 0x2c) {
      if (p + 10 > b.length) { r.problems.push(`Frame ${r.frames + 1} is cut off in its header.`); break }
      const start = p
      const left = b[p + 1] | (b[p + 2] << 8), top = b[p + 3] | (b[p + 4] << 8), width = b[p + 5] | (b[p + 6] << 8), height = b[p + 7] | (b[p + 8] << 8)
      const pk = b[p + 9]
      p += 10
      let localColors = 0
      if (pk & 0x80) { localColors = 1 << ((pk & 7) + 1); p += localColors * 3 }
      const lzwMin = b[p]
      const sb = readSubBlocks(b, p + 1)
      r.blocks.push({ kind: 'image', offset: start, end: sb.end, left, top, width, height, interlaced: !!(pk & 0x40), localColors, lzwMin, dataBytes: sb.bytes, complete: sb.complete })
      r.frames++
      if (left + width > r.width || top + height > r.height) r.problems.push(`Frame ${r.frames} sticks out of the canvas (${left},${top} ${width}×${height}).`)
      if (lzwMin < 2 || lzwMin > 11) r.problems.push(`Frame ${r.frames} has an invalid code size (${lzwMin}).`)
      if (!localColors && !r.globalColors) r.problems.push(`Frame ${r.frames} has no colour table.`)
      p = sb.end
      if (!sb.complete) { r.problems.push(`The file ends inside frame ${r.frames}; its bottom part is missing.`); break }
      continue
    }
    if (t === 0x00) { p++; continue } // stray padding
    r.problems.push(`Unknown data (0x${t.toString(16)}) at byte ${p}. Everything after it was ignored.`)
    break
  }
  r.stoppedAt = p
  if (!r.trailer && !r.problems.length) r.problems.push('The file has no end marker (trailer). Some viewers stop early.')
  if (r.trailer && p < b.length) r.problems.push(`${b.length - p} extra bytes after the end marker.`)
  if (!r.frames) r.problems.push('No frames were found.')
  return r
}

/**
 * Build repaired candidates from a damaged GIF, best first:
 * 1. keep the partial last frame (close its data and add an end marker)
 * 2. cut after the last complete frame
 */
export function repairCandidates(b: Uint8Array): Uint8Array[] {
  const r = inspectGif(b)
  const out: Uint8Array[] = []
  if (!r.valid) return out
  const imgs = r.blocks.filter((x) => x.kind === 'image')
  const last = imgs[imgs.length - 1]
  if (last && !last.complete) {
    const head = b.subarray(0, Math.min(b.length, last.end))
    // close the dangling sub-block run: pad the current sub-block with zeros, add terminator + trailer
    let p = last.offset + 10 + (last.localColors ?? 0) * 3 + 1
    while (p < head.length) { const n = head[p]; if (n === 0 || p + 1 + n > head.length) break; p += 1 + n }
    const need = p < head.length && head[p] ? head[p] - (head.length - p - 1) : 0
    const fixed = new Uint8Array(head.length + Math.max(0, need) + 2)
    fixed.set(head); fixed[fixed.length - 2] = 0; fixed[fixed.length - 1] = 0x3b
    out.push(fixed)
  }
  const complete = imgs.filter((x) => x.complete)
  if (complete.length) {
    const end = complete[complete.length - 1].end
    const fixed = new Uint8Array(end + 1); fixed.set(b.subarray(0, end)); fixed[end] = 0x3b
    out.push(fixed)
  }
  if (!out.length && r.trailer) out.push(b)
  return out
}
