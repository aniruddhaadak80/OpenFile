// File formats each tool works with, for the format explorer, the "all formats" section and the /tools filters.
// Uses a tool's own `inputs` / `outputs` when the registry sets them, otherwise finds known format names
// in its name, description and tags, then falls back to category defaults.
import { TOOLS, type Category, type ToolMeta } from '@/tools/registry'

export type InputKind = 'file' | 'text' | 'none'

export const FORMAT_GROUPS: { id: string; name: string; color: string; formats: string[] }[] = [
  { id: 'doc', name: 'Documents', color: '#F5A524', formats: ['PDF', 'DOCX', 'DOC', 'ODT', 'RTF', 'PPTX', 'XLSX', 'XLS', 'EPUB', 'MOBI', 'TXT', 'MD', 'HTML'] },
  { id: 'image', name: 'Images', color: '#10B981', formats: ['JPG', 'PNG', 'WEBP', 'AVIF', 'GIF', 'BMP', 'TIFF', 'HEIC', 'SVG', 'ICO', 'PSD'] },
  { id: 'video', name: 'Video', color: '#38BDF8', formats: ['MP4', 'WEBM', 'MOV', 'MKV', 'AVI'] },
  { id: 'audio', name: 'Audio', color: '#14B8A6', formats: ['MP3', 'WAV', 'OGG', 'AAC', 'FLAC', 'M4A', 'OPUS'] },
  { id: 'data', name: 'Data and code', color: '#22D3EE', formats: ['JSON', 'CSV', 'TSV', 'XML', 'YAML', 'SQL', 'TOML', 'JWT', 'BASE64'] },
  { id: 'other', name: 'Archives, fonts and more', color: '#F97316', formats: ['ZIP', 'TAR', 'GZ', '7Z', 'TTF', 'OTF', 'WOFF', 'WOFF2', 'SRT', 'VTT', 'STL', 'OBJ', 'GLB', 'DXF'] },
]
const KNOWN = FORMAT_GROUPS.flatMap((g) => g.formats)
const ALIAS: Record<string, string> = { JPEG: 'JPG', WORD: 'DOCX', EXCEL: 'XLSX', POWERPOINT: 'PPTX', MARKDOWN: 'MD', YML: 'YAML', TIF: 'TIFF', HEIF: 'HEIC', SHEET: 'XLSX', GLTF: 'GLB' }

const CAT_IN: Partial<Record<Category, string[]>> = {
  pdf: ['PDF'], image: ['JPG', 'PNG', 'WEBP', 'GIF', 'BMP'], video: ['MP4', 'WEBM', 'MOV', 'MKV', 'AVI'], audio: ['MP3', 'WAV', 'OGG', 'AAC', 'FLAC', 'M4A'],
}
const TEXT_CATS: Category[] = ['dev', 'text']

function scan(t: ToolMeta): string[] {
  const words = `${t.name} ${t.desc} ${(t.tags || []).join(' ')} ${t.slug.replace(/-/g, ' ')}`.toUpperCase().match(/[A-Z0-9]+/g) || []
  const out = new Set<string>()
  for (const w of words) { const f = ALIAS[w] ?? w; if (KNOWN.includes(f)) out.add(f) }
  return [...out]
}

const cache = new Map<string, { inputs: string[]; outputs: string[]; all: string[]; kind: InputKind }>()
export function toolFormats(t: ToolMeta) {
  let v = cache.get(t.slug)
  if (v) return v
  const found = scan(t)
  const inputs = (t.inputs?.length ? t.inputs : found.length ? found : CAT_IN[t.category] ?? []).map((f) => ALIAS[f.toUpperCase()] ?? f.toUpperCase())
  const outputs = (t.outputs ?? []).map((f) => ALIAS[f.toUpperCase()] ?? f.toUpperCase())
  const all = [...new Set([...inputs, ...outputs, ...found])]
  const kind: InputKind = inputs.length || t.pipeline ? 'file' : TEXT_CATS.includes(t.category) ? 'text' : /generat|builder|maker|picker|studio|recorder|board|editor|creat/i.test(t.name) ? 'none' : 'file'
  v = { inputs, outputs, all, kind }
  cache.set(t.slug, v)
  return v
}

/** Every format with the number of tools that handle it, most supported first. */
export function allFormats(tools: ToolMeta[] = TOOLS) {
  const counts = new Map<string, number>()
  for (const t of tools) for (const f of toolFormats(t).all) counts.set(f, (counts.get(f) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([format, count]) => ({ format, count, group: FORMAT_GROUPS.find((g) => g.formats.includes(format)) }))
}

export const toolsForFormat = (format: string, tools: ToolMeta[] = TOOLS) => tools.filter((t) => toolFormats(t).all.includes(format.toUpperCase()))

export const INPUT_KINDS: { id: InputKind; label: string }[] = [
  { id: 'file', label: 'Works on a file' },
  { id: 'text', label: 'Paste text or code' },
  { id: 'none', label: 'Create from scratch' },
]
