// File type detection for the "Drop anything" flow.
// Reads the first bytes of a file (magic numbers) and falls back to the extension, then ranks
// registry tools whose `inputs` (or detected formats) include that format.
import { TOOLS, toolBySlug, type ToolMeta } from '@/tools/registry'
import { toolFormats, FORMAT_GROUPS } from './formats'
import { suggestFor } from './handoff'

export interface Detected {
  /** Canonical format, upper case (PDF, JPG, MP4 ...) */
  format: string
  /** Human label, e.g. "PDF document" */
  label: string
  /** 'signature' when the bytes told us, 'extension' when only the name did, 'mime' from the browser */
  source: 'signature' | 'extension' | 'mime' | 'unknown'
  /** Extension from the file name, upper case */
  ext: string
  /** True when the name says one thing and the bytes say another */
  mismatch: boolean
  group?: { id: string; name: string; color: string }
}

const LABELS: Record<string, string> = {
  PDF: 'PDF document', PNG: 'PNG image', JPG: 'JPEG image', GIF: 'GIF image', WEBP: 'WebP image', AVIF: 'AVIF image', HEIC: 'HEIC photo', BMP: 'Bitmap image', TIFF: 'TIFF image', ICO: 'Icon', PSD: 'Photoshop file', SVG: 'SVG vector',
  MP4: 'MP4 video', MOV: 'QuickTime video', WEBM: 'WebM video', MKV: 'Matroska video', AVI: 'AVI video', MP3: 'MP3 audio', WAV: 'WAV audio', OGG: 'Ogg audio', FLAC: 'FLAC audio', M4A: 'M4A audio', AAC: 'AAC audio', OPUS: 'Opus audio', MIDI: 'MIDI music',
  ZIP: 'ZIP archive', '7Z': '7-Zip archive', RAR: 'RAR archive', GZ: 'Gzip archive', TAR: 'Tar archive', BZ2: 'Bzip2 archive', XZ: 'XZ archive',
  DOCX: 'Word document', XLSX: 'Excel workbook', PPTX: 'PowerPoint deck', ODT: 'OpenDocument text', EPUB: 'EPUB eBook', MOBI: 'MOBI eBook', RTF: 'Rich text', DOC: 'Word 97 document', XLS: 'Excel 97 workbook',
  TTF: 'TrueType font', OTF: 'OpenType font', WOFF: 'WOFF font', WOFF2: 'WOFF2 font', SQLITE: 'SQLite database', PARQUET: 'Parquet data', GLB: '3D model (glTF)', STL: '3D model (STL)', OBJ: '3D model (OBJ)', DXF: 'CAD drawing',
  JSON: 'JSON data', XML: 'XML data', CSV: 'CSV table', TSV: 'TSV table', YAML: 'YAML data', TOML: 'TOML config', MD: 'Markdown', HTML: 'Web page', TXT: 'Plain text', SRT: 'Subtitles (SRT)', VTT: 'Subtitles (WebVTT)', DICOM: 'Medical image (DICOM)', EML: 'Email message',
}
const EXT_ALIAS: Record<string, string> = { JPEG: 'JPG', JFIF: 'JPG', TIF: 'TIFF', HEIF: 'HEIC', YML: 'YAML', HTM: 'HTML', MARKDOWN: 'MD', GLTF: 'GLB', MID: 'MIDI', TGZ: 'GZ', DB: 'SQLITE', SQLITE3: 'SQLITE', DCM: 'DICOM', WEBMANIFEST: 'JSON' }
const canon = (f: string) => EXT_ALIAS[f] ?? f

const ascii = (b: Uint8Array, start: number, len: number) => String.fromCharCode(...b.subarray(start, start + len))
const starts = (b: Uint8Array, sig: number[], off = 0) => sig.every((v, i) => b[off + i] === v)

/** Pure signature sniffing on the first bytes. Returns null when nothing matched. */
export function sniff(b: Uint8Array, ext = ''): string | null {
  if (b.length < 4) return null
  if (ascii(b, 0, 4) === '%PDF') return 'PDF'
  if (starts(b, [0x89, 0x50, 0x4e, 0x47])) return 'PNG'
  if (starts(b, [0xff, 0xd8, 0xff])) return 'JPG'
  if (ascii(b, 0, 4) === 'GIF8') return 'GIF'
  if (ascii(b, 0, 4) === 'RIFF') { const k = ascii(b, 8, 4); return k === 'WEBP' ? 'WEBP' : k === 'WAVE' ? 'WAV' : k.startsWith('AVI') ? 'AVI' : null }
  if (ascii(b, 4, 4) === 'ftyp') {
    const brand = ascii(b, 8, 4).toLowerCase()
    if (/^(heic|heix|hevc|heim|heis|mif1|msf1)/.test(brand)) return 'HEIC'
    if (brand.startsWith('avi')) return 'AVIF'
    if (brand.startsWith('qt')) return 'MOV'
    if (brand.startsWith('m4a') || brand.startsWith('m4b')) return 'M4A'
    return 'MP4'
  }
  if (starts(b, [0x1a, 0x45, 0xdf, 0xa3])) return ascii(b, 0, Math.min(64, b.length)).includes('webm') ? 'WEBM' : 'MKV'
  if (ascii(b, 0, 3) === 'ID3') return 'MP3'
  if (b[0] === 0xff && (b[1] & 0xf0) === 0xf0) return ext === 'AAC' || (b[1] & 0x06) === 0 ? 'AAC' : 'MP3' // ADTS AAC has layer bits 00
  if (ascii(b, 0, 4) === 'OggS') return ext === 'OPUS' ? 'OPUS' : 'OGG'
  if (ascii(b, 0, 4) === 'fLaC') return 'FLAC'
  if (ascii(b, 0, 4) === 'MThd') return 'MIDI'
  if (starts(b, [0x50, 0x4b, 0x03, 0x04]) || starts(b, [0x50, 0x4b, 0x05, 0x06])) {
    // ZIP containers: the name, or the mimetype entry, says which Office/eBook format it is
    if (['DOCX', 'XLSX', 'PPTX', 'ODT', 'ODS', 'ODP', 'EPUB', 'JAR', 'APK', 'CBZ', 'KMZ', 'XPI'].includes(ext)) return ext
    const head = ascii(b, 0, Math.min(b.length, 4096))
    if (head.includes('application/epub+zip')) return 'EPUB'
    if (head.includes('word/')) return 'DOCX'
    if (head.includes('xl/')) return 'XLSX'
    if (head.includes('ppt/')) return 'PPTX'
    return 'ZIP'
  }
  if (starts(b, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return '7Z'
  if (ascii(b, 0, 4) === 'Rar!') return 'RAR'
  if (starts(b, [0x1f, 0x8b])) return 'GZ'
  if (ascii(b, 0, 3) === 'BZh') return 'BZ2'
  if (starts(b, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])) return 'XZ'
  if (b.length > 262 && ascii(b, 257, 5) === 'ustar') return 'TAR'
  if (ascii(b, 0, 2) === 'BM' && b.length > 14) return 'BMP'
  if (starts(b, [0x49, 0x49, 0x2a, 0x00]) || starts(b, [0x4d, 0x4d, 0x00, 0x2a])) return ['CR2', 'NEF', 'ARW', 'DNG'].includes(ext) ? ext : 'TIFF'
  if (starts(b, [0x00, 0x00, 0x01, 0x00])) return 'ICO'
  if (ascii(b, 0, 4) === '8BPS') return 'PSD'
  if (starts(b, [0x00, 0x01, 0x00, 0x00]) && ['TTF', 'OTF'].includes(ext || 'TTF')) return 'TTF'
  if (ascii(b, 0, 4) === 'OTTO') return 'OTF'
  if (ascii(b, 0, 4) === 'wOFF') return 'WOFF'
  if (ascii(b, 0, 4) === 'wOF2') return 'WOFF2'
  if (ascii(b, 0, 15) === 'SQLite format 3') return 'SQLITE'
  if (ascii(b, 0, 4) === 'PAR1') return 'PARQUET'
  if (ascii(b, 0, 4) === 'glTF') return 'GLB'
  if (starts(b, [0xd0, 0xcf, 0x11, 0xe0])) return ext === 'XLS' ? 'XLS' : ext === 'MSG' ? 'MSG' : ext === 'PPT' ? 'PPT' : 'DOC'
  if (b.length > 132 && ascii(b, 128, 4) === 'DICM') return 'DICOM'
  if (ascii(b, 0, 5) === '{\\rtf') return 'RTF'
  // text formats: look at the first non-space characters
  const text = new TextDecoder('utf-8', { fatal: false }).decode(b.subarray(0, 2048)).replace(/^\uFEFF/, '').trimStart()
  if (/^<\?xml[\s\S]*<svg/i.test(text) || /^<svg[\s>]/i.test(text)) return 'SVG'
  if (/^<!doctype html|^<html/i.test(text)) return 'HTML'
  if (/^<\?xml/i.test(text)) return ext === 'GPX' || ext === 'KML' ? ext : 'XML'
  if (/^WEBVTT/.test(text)) return 'VTT'
  if (/^\d+\s*\r?\n\d\d:\d\d:\d\d[,.]\d+ --> /.test(text)) return 'SRT'
  if (/^solid\s/i.test(text) && ext === 'STL') return 'STL'
  if ((text.startsWith('{') || text.startsWith('[')) && ext !== 'CSV') { try { JSON.parse(new TextDecoder().decode(b)); return 'JSON' } catch { if (ext === 'JSON' || ext === 'GEOJSON') return 'JSON' } }
  return null
}

const MIME_MAP: Record<string, string> = { 'application/pdf': 'PDF', 'image/svg+xml': 'SVG', 'text/csv': 'CSV', 'application/json': 'JSON', 'text/markdown': 'MD', 'text/html': 'HTML', 'text/plain': 'TXT', 'application/zip': 'ZIP' }

export async function detectFile(file: File): Promise<Detected> {
  const ext = canon((file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toUpperCase())
  let sig: string | null = null
  try { sig = sniff(new Uint8Array(await file.slice(0, 4100).arrayBuffer()), ext) } catch { /* unreadable */ }
  let format = sig ?? ''
  let source: Detected['source'] = sig ? 'signature' : 'unknown'
  if (!format && ext) { format = ext; source = 'extension' }
  if (!format && file.type) { format = MIME_MAP[file.type] ?? file.type.split('/')[1]?.toUpperCase() ?? ''; source = 'mime' }
  format = canon(format)
  // a few containers share a signature on purpose (a .cbz is a zip): do not flag those
  const benign = (a: string, b: string) => a === b || (a === 'ZIP' && ['CBZ', 'JAR', 'APK', 'KMZ', 'XPI', 'ODS', 'ODP'].includes(b)) || (a === 'TXT') || (a === 'XML' && ['GPX', 'KML', 'XLIFF', 'PLIST'].includes(b)) || (a === 'MP4' && ['M4V', 'M4A', 'MOV', '3GP'].includes(b)) || (a === 'JSON' && ['GEOJSON', 'IPYNB', 'GLTF'].includes(b))
  const mismatch = !!(sig && ext && !benign(sig, ext))
  return { format, label: LABELS[format] ?? (format ? `${format} file` : 'Unknown file'), source, ext, mismatch, group: FORMAT_GROUPS.find((g) => g.formats.includes(format)) }
}

/**
 * Best tools for a format. Hand-picked suggestions for the file come first, then tools that declare the
 * format as an input, then tools that mention it. Popular tools win ties.
 */
export function toolsForFormat(format: string, file?: File, exclude?: string): ToolMeta[] {
  const f = format.toUpperCase()
  const picked = (file ? suggestFor(file) : []).map(toolBySlug).filter((t): t is ToolMeta => !!t)
  const score = (t: ToolMeta) => {
    const fm = toolFormats(t)
    let s = 0
    if (t.inputs?.map((x) => canon(x.toUpperCase())).includes(f)) s += 5
    else if (fm.inputs.includes(f)) s += 4
    else if (fm.all.includes(f)) s += 1
    if (!s) return 0
    if (t.popular) s += 3
    if (t.badge === 'NEW' || t.badge === 'HOT') s += 0.5
    return s
  }
  const ranked = TOOLS.map((t) => ({ t, s: score(t) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.t)
  const pickedOk = picked.filter((t) => !file || score(t) > 0 || !ranked.length)
  const out: ToolMeta[] = []
  for (const t of [...pickedOk, ...ranked]) if (!out.includes(t) && t.slug !== exclude) out.push(t)
  return out
}

/** Format from a file name only (used for "what next" after a download). */
export const formatFromName = (name: string) => canon((name.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toUpperCase())
export const formatLabel = (f: string) => LABELS[f] ?? `${f} file`
