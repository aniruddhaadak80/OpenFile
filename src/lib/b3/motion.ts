/* Find the video inside Google / Samsung motion photos and Apple Live Photo (.livp) bundles. Pure. */
import { unzipSync } from 'fflate'

export interface MotionParts { kind: 'google' | 'samsung' | 'livp' | 'embedded'; still: Uint8Array; stillExt: string; video: Uint8Array; videoExt: string; xmpOffset?: number }

const find = (b: Uint8Array, pat: number[], from = 0) => { outer: for (let i = from; i <= b.length - pat.length; i++) { for (let k = 0; k < pat.length; k++) if (b[i + k] !== pat[k]) continue outer; return i } return -1 }
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0))

/** Offset from the end of the file given in the XMP (MicroVideoOffset or the last Container item length). */
export function xmpVideoLength(b: Uint8Array): number | null {
  const head = new TextDecoder('latin1').decode(b.subarray(0, Math.min(b.length, 200_000)))
  const m = head.match(/MicroVideoOffset\s*=\s*"(\d+)"/) || head.match(/<GCamera:MicroVideoOffset>(\d+)</)
  if (m) return +m[1]
  const items = [...head.matchAll(/Item:Mime\s*=\s*"video\/[^"]+"[^>]*?Item:Length\s*=\s*"(\d+)"|Item:Length\s*=\s*"(\d+)"[^>]*?Item:Mime\s*=\s*"video\/[^"]+"/g)]
  const len = items.map((x) => +(x[1] || x[2])).find(Boolean)
  return len || null
}

export function extractMotion(b: Uint8Array, name = ''): MotionParts {
  // Apple Live Photo bundle (zip with a picture and a MOV)
  if (b[0] === 0x50 && b[1] === 0x4b) {
    const z = unzipSync(b)
    const names = Object.keys(z)
    const mov = names.find((n) => /\.(mov|mp4)$/i.test(n))
    const pic = names.find((n) => /\.(heic|heif|jpe?g|png)$/i.test(n))
    if (!mov) throw new Error('No video was found inside this Live Photo bundle.')
    return { kind: 'livp', still: pic ? z[pic] : new Uint8Array(), stillExt: pic ? pic.split('.').pop()!.toLowerCase() : 'jpg', video: z[mov], videoExt: mov.split('.').pop()!.toLowerCase() }
  }
  const isJpeg = b[0] === 0xff && b[1] === 0xd8
  const isHeic = String.fromCharCode(...b.subarray(4, 8)) === 'ftyp'
  // Samsung: "MotionPhoto_Data" marker right before the MP4
  const sam = find(b, ascii('MotionPhoto_Data'))
  if (sam > 0) {
    const v = b.subarray(sam + 16)
    return { kind: 'samsung', still: b.subarray(0, sam), stillExt: isJpeg ? 'jpg' : 'heic', video: v, videoExt: 'mp4' }
  }
  // Google: offset from the end in XMP, else scan for an MP4 'ftyp' box after the image
  const len = xmpVideoLength(b)
  if (len && len < b.length) {
    const start = b.length - len
    if (String.fromCharCode(...b.subarray(start + 4, start + 8)) === 'ftyp') return { kind: 'google', still: b.subarray(0, start), stillExt: isJpeg ? 'jpg' : 'heic', video: b.subarray(start), videoExt: 'mp4', xmpOffset: len }
  }
  const from = isHeic ? 32 : 2
  let p = from
  while ((p = find(b, ascii('ftyp'), p + 1)) > 0) {
    const s = p - 4
    const size = (b[s] << 24 | b[s + 1] << 16 | b[s + 2] << 8 | b[s + 3]) >>> 0
    const brand = String.fromCharCode(...b.subarray(p + 4, p + 8))
    if (size >= 16 && size < 512 && /mp4|isom|iso|qt|M4V|avc|3gp|mp42|mp41/i.test(brand) && !/heic|mif1|avif/i.test(brand)) {
      return { kind: len ? 'google' : 'embedded', still: b.subarray(0, s), stillExt: isJpeg ? 'jpg' : 'heic', video: b.subarray(s), videoExt: 'mp4' }
    }
  }
  throw new Error(`No video was found in ${name || 'this file'}. It may be a normal photo, or the phone saved the motion part separately.`)
}
