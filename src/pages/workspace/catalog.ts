/* Workspace step catalog: what every step is called, which files it takes and which settings it has.
 * Pure data with no imports, so the recipe validator and the Node tests can load it directly.
 * The code that actually runs each step lives in steps.ts. */

export type Kind = 'image' | 'pdf' | 'video' | 'audio' | 'data' | 'text' | 'archive' | 'other'
export type Cat = 'image' | 'pdf' | 'media' | 'data' | 'archive' | 'file'
export type ParamType = 'number' | 'text' | 'select' | 'color' | 'bool'
export type ParamDef = { key: string; label: string; type: ParamType; options?: string[]; min?: number; max?: number; step?: number; default: any; hint?: string }

export type StepMeta = {
  id: string
  cat: Cat
  name: string
  desc: string
  /** lucide icon name, resolved in the UI */
  icon: string
  /** file kinds this step changes; every other file passes through untouched */
  accepts: Kind[] | 'any'
  params: ParamDef[]
  /** runs once on the whole set (merge, zip) instead of once per file */
  batch?: boolean
  /** uses a single shared engine (ffmpeg, OCR, AI model): run one file at a time */
  exclusive?: boolean
  /** slow or downloads a model: no live preview, show a note instead */
  heavy?: boolean
  /** can run inside the image Web Worker pool */
  worker?: boolean
}

export const CATS: { id: Cat; name: string; color: string }[] = [
  { id: 'image', name: 'Image', color: '#F5A524' },
  { id: 'pdf', name: 'PDF', color: '#14B8A6' },
  { id: 'media', name: 'Video and audio', color: '#38BDF8' },
  { id: 'data', name: 'Text and data', color: '#10B981' },
  { id: 'archive', name: 'Archive', color: '#22D3EE' },
  { id: 'file', name: 'Any file', color: '#FBBF24' },
]

const q = (d = 82): ParamDef => ({ key: 'quality', label: 'Quality', type: 'number', min: 1, max: 100, default: d })

export const CATALOG: StepMeta[] = [
  // ---- image ----
  { id: 'img-resize', cat: 'image', name: 'Resize', desc: 'Fit inside a max width and height', icon: 'Scaling', accepts: ['image'], worker: true,
    params: [{ key: 'maxW', label: 'Max width', type: 'number', default: 1600, min: 16, max: 10000 }, { key: 'maxH', label: 'Max height', type: 'number', default: 1600, min: 16, max: 10000 }, { key: 'upscale', label: 'Allow upscaling', type: 'bool', default: false }] },
  { id: 'img-convert', cat: 'image', name: 'Convert format', desc: 'JPG, PNG, WEBP or AVIF', icon: 'RefreshCw', accepts: ['image'], worker: true,
    params: [{ key: 'format', label: 'Format', type: 'select', options: ['webp', 'jpeg', 'png', 'avif'], default: 'webp' }, q(82)] },
  { id: 'img-compress', cat: 'image', name: 'Compress', desc: 'Re-encode smaller, never bigger than the original', icon: 'Shrink', accepts: ['image'], worker: true, params: [q(75)] },
  { id: 'img-crop', cat: 'image', name: 'Crop', desc: 'Center crop to an aspect ratio or trim the edges', icon: 'Crop', accepts: ['image'], worker: true,
    params: [{ key: 'ratio', label: 'Aspect', type: 'select', options: ['1:1', '4:3', '3:2', '16:9', '9:16', '4:5', 'free'], default: '1:1' }, { key: 'inset', label: 'Trim edges %', type: 'number', min: 0, max: 45, default: 0 }] },
  { id: 'img-rotate', cat: 'image', name: 'Rotate / flip', desc: 'Rotate 90 degree steps and mirror', icon: 'RotateCw', accepts: ['image'], worker: true,
    params: [{ key: 'angle', label: 'Angle', type: 'select', options: ['0', '90', '180', '270'], default: '90' }, { key: 'flipH', label: 'Flip horizontal', type: 'bool', default: false }] },
  { id: 'img-grayscale', cat: 'image', name: 'Filter', desc: 'Grayscale, sepia, boost or invert', icon: 'SlidersHorizontal', accepts: ['image'], worker: true,
    params: [{ key: 'filter', label: 'Filter', type: 'select', options: ['grayscale(1)', 'sepia(1)', 'contrast(1.2) saturate(1.3)', 'brightness(1.15)', 'invert(1)'], default: 'grayscale(1)' }] },
  { id: 'img-watermark', cat: 'image', name: 'Watermark', desc: 'Text watermark in a corner or tiled', icon: 'Stamp', accepts: ['image'], worker: true,
    params: [{ key: 'text', label: 'Text', type: 'text', default: '© OpenFile' }, { key: 'pos', label: 'Position', type: 'select', options: ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'center', 'tiled'], default: 'bottom-right' }, { key: 'opacity', label: 'Opacity %', type: 'number', min: 5, max: 100, default: 60 }, { key: 'color', label: 'Color', type: 'color', default: '#ffffff' }] },
  { id: 'img-round', cat: 'image', name: 'Rounded corners', desc: 'Transparent rounded corners (PNG)', icon: 'Squircle', accepts: ['image'], worker: true,
    params: [{ key: 'radius', label: 'Radius %', type: 'number', min: 0, max: 50, default: 8 }] },
  { id: 'img-strip', cat: 'image', name: 'Strip metadata', desc: 'Remove EXIF, GPS and camera data', icon: 'ShieldCheck', accepts: ['image'], worker: true, params: [q(92)] },
  { id: 'img-bg-remove', cat: 'image', name: 'Remove background', desc: 'On-device AI cut-out to a transparent PNG', icon: 'Eraser', accepts: ['image'], exclusive: true, heavy: true,
    params: [{ key: 'model', label: 'Model', type: 'select', options: ['isnet_quint8', 'isnet_fp16'], default: 'isnet_quint8', hint: 'quint8 is smaller and faster' }] },

  // ---- pdf ----
  { id: 'pdf-merge', cat: 'pdf', name: 'Merge all', desc: 'Combine every PDF into one', icon: 'Combine', accepts: ['pdf'], batch: true,
    params: [{ key: 'name', label: 'Output name', type: 'text', default: 'merged' }] },
  { id: 'pdf-split', cat: 'pdf', name: 'Split pages', desc: 'One PDF per page, or every N pages', icon: 'Scissors', accepts: ['pdf'],
    params: [{ key: 'every', label: 'Pages per file', type: 'number', min: 1, max: 500, default: 1 }] },
  { id: 'pdf-compress', cat: 'pdf', name: 'Compress (rasterize)', desc: 'Re-render pages as JPEG, never bigger', icon: 'Shrink', accepts: ['pdf'], heavy: true,
    params: [{ key: 'dpi', label: 'DPI', type: 'select', options: ['72', '96', '120', '150'], default: '96' }, { key: 'quality', label: 'JPEG quality', type: 'number', default: 70, min: 10, max: 95 }] },
  { id: 'pdf-rotate', cat: 'pdf', name: 'Rotate pages', desc: 'Rotate every page', icon: 'RotateCw', accepts: ['pdf'],
    params: [{ key: 'angle', label: 'Angle', type: 'select', options: ['90', '180', '270'], default: '90' }] },
  { id: 'pdf-numbers', cat: 'pdf', name: 'Page numbers', desc: 'Stamp "n / total" at the bottom', icon: 'Hash', accepts: ['pdf'],
    params: [{ key: 'format', label: 'Format', type: 'select', options: ['{n}', '{n} / {total}', 'Page {n} of {total}'], default: '{n} / {total}' }, { key: 'size', label: 'Font size', type: 'number', default: 10, min: 6, max: 36 }] },
  { id: 'pdf-watermark', cat: 'pdf', name: 'Watermark', desc: 'Diagonal text watermark', icon: 'Stamp', accepts: ['pdf'],
    params: [{ key: 'text', label: 'Text', type: 'text', default: 'CONFIDENTIAL' }, { key: 'opacity', label: 'Opacity %', type: 'number', default: 15, min: 3, max: 100 }] },
  { id: 'pdf-meta', cat: 'pdf', name: 'Clean metadata', desc: 'Strip author, title and producer', icon: 'ShieldCheck', accepts: ['pdf'], params: [] },
  { id: 'pdf-gray', cat: 'pdf', name: 'Grayscale', desc: 'Convert pages to grayscale', icon: 'Contrast', accepts: ['pdf'], heavy: true, params: [] },
  { id: 'pdf-from-images', cat: 'pdf', name: 'Images to PDF', desc: 'Put images into one PDF, or one PDF each', icon: 'FileImage', accepts: ['image'], batch: true,
    params: [{ key: 'mode', label: 'Output', type: 'select', options: ['one PDF', 'one per image'], default: 'one PDF' }, { key: 'page', label: 'Page', type: 'select', options: ['fit image', 'A4', 'Letter'], default: 'fit image' }, { key: 'name', label: 'Output name', type: 'text', default: 'images' }] },
  { id: 'pdf-to-images', cat: 'pdf', name: 'PDF to images', desc: 'Render every page as PNG or JPG', icon: 'Images', accepts: ['pdf'], heavy: true,
    params: [{ key: 'format', label: 'Format', type: 'select', options: ['png', 'jpeg', 'webp'], default: 'png' }, { key: 'dpi', label: 'DPI', type: 'select', options: ['72', '96', '150', '200'], default: '150' }] },
  { id: 'pdf-ocr', cat: 'pdf', name: 'OCR to text', desc: 'Read text from scans and photos (Tesseract)', icon: 'ScanText', accepts: ['pdf', 'image'], exclusive: true, heavy: true,
    params: [{ key: 'lang', label: 'Language', type: 'select', options: ['eng', 'hin', 'ben', 'spa', 'fra', 'deu'], default: 'eng' }] },

  // ---- video and audio (self-hosted ffmpeg) ----
  { id: 'av-trim', cat: 'media', name: 'Trim', desc: 'Keep a part of each video or audio file', icon: 'Scissors', accepts: ['video', 'audio'], exclusive: true, heavy: true,
    params: [{ key: 'start', label: 'Start (s)', type: 'number', min: 0, max: 86400, step: 0.1, default: 0 }, { key: 'length', label: 'Length (s)', type: 'number', min: 0.1, max: 86400, step: 0.1, default: 10 }] },
  { id: 'av-convert', cat: 'media', name: 'Convert media', desc: 'MP4, WEBM, MOV, MP3, WAV, M4A, OGG', icon: 'RefreshCw', accepts: ['video', 'audio'], exclusive: true, heavy: true,
    params: [{ key: 'video', label: 'Video to', type: 'select', options: ['mp4', 'webm', 'mov', 'mkv'], default: 'mp4' }, { key: 'audio', label: 'Audio to', type: 'select', options: ['mp3', 'm4a', 'wav', 'ogg', 'flac'], default: 'mp3' }] },
  { id: 'vid-compress', cat: 'media', name: 'Compress video', desc: 'Smaller MP4, never bigger than the original', icon: 'Shrink', accepts: ['video'], exclusive: true, heavy: true,
    params: [{ key: 'preset', label: 'Preset', type: 'select', options: ['small', 'balanced', 'high'], default: 'balanced' }, { key: 'res', label: 'Max size', type: 'select', options: ['original', '1080', '720', '480'], default: 'original' }, { key: 'noAudio', label: 'Drop audio', type: 'bool', default: false }] },
  { id: 'av-extract-audio', cat: 'media', name: 'Extract audio', desc: 'Save the sound track of each video', icon: 'Music', accepts: ['video'], exclusive: true, heavy: true,
    params: [{ key: 'format', label: 'Format', type: 'select', options: ['mp3', 'm4a', 'wav'], default: 'mp3' }] },
  { id: 'vid-gif', cat: 'media', name: 'Video to GIF', desc: 'Short looping GIF with a good palette', icon: 'Film', accepts: ['video'], exclusive: true, heavy: true,
    params: [{ key: 'fps', label: 'FPS', type: 'number', min: 2, max: 30, default: 12 }, { key: 'width', label: 'Width', type: 'number', min: 64, max: 1280, default: 480 }, { key: 'length', label: 'Max length (s)', type: 'number', min: 1, max: 60, default: 6 }] },

  // ---- text and data ----
  { id: 'data-convert', cat: 'data', name: 'Convert data', desc: 'CSV, JSON and XLSX in any direction', icon: 'Table', accepts: ['data'],
    params: [{ key: 'to', label: 'Convert to', type: 'select', options: ['json', 'csv', 'xlsx'], default: 'json' }] },
  { id: 'text-replace', cat: 'data', name: 'Find and replace', desc: 'Replace text in TXT, CSV, JSON, MD and more', icon: 'Replace', accepts: ['text', 'data'],
    params: [{ key: 'find', label: 'Find', type: 'text', default: 'foo' }, { key: 'replace', label: 'Replace with', type: 'text', default: 'bar' }, { key: 'regex', label: 'Regular expression', type: 'bool', default: false }, { key: 'caseSensitive', label: 'Match case', type: 'bool', default: true }] },

  // ---- archive ----
  { id: 'zip-all', cat: 'archive', name: 'Zip everything', desc: 'Pack every file into one ZIP', icon: 'FileArchive', accepts: 'any', batch: true,
    params: [{ key: 'name', label: 'ZIP name', type: 'text', default: 'files' }, { key: 'folders', label: 'Keep folders', type: 'bool', default: true }] },
  { id: 'unzip', cat: 'archive', name: 'Unzip', desc: 'Unpack every ZIP into its files', icon: 'PackageOpen', accepts: ['archive'], params: [] },

  // ---- any file ----
  { id: 'file-rename', cat: 'file', name: 'Rename', desc: 'Pattern with {name} {n} {date} {ext} {kind}', icon: 'TextCursorInput', accepts: 'any', batch: true,
    params: [{ key: 'pattern', label: 'Pattern', type: 'text', default: '{name}-{n}' }, { key: 'start', label: 'Start number', type: 'number', default: 1, min: 0, max: 1000000 }, { key: 'case', label: 'Case', type: 'select', options: ['keep', 'lower', 'upper', 'kebab'], default: 'keep' }] },
  { id: 'checksum', cat: 'file', name: 'Checksums', desc: 'Add a SHA-256 or SHA-1 manifest file', icon: 'Fingerprint', accepts: 'any', batch: true,
    params: [{ key: 'algo', label: 'Algorithm', type: 'select', options: ['SHA-256', 'SHA-1', 'SHA-512'], default: 'SHA-256' }] },
]

/** Old step ids that saved recipes may still use. */
export const ALIASES: Record<string, string> = { 'img-rename': 'file-rename' }

export const META: Record<string, StepMeta> = Object.fromEntries(CATALOG.map((s) => [s.id, s]))
export const metaOf = (id: string): StepMeta | undefined => META[ALIASES[id] ?? id]

const EXT_KIND: Record<string, Kind> = {
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', avif: 'image', gif: 'image', bmp: 'image', ico: 'image', jfif: 'image',
  pdf: 'pdf',
  mp4: 'video', webm: 'video', mov: 'video', mkv: 'video', avi: 'video', m4v: 'video', '3gp': 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio', m4a: 'audio', aac: 'audio', flac: 'audio', opus: 'audio',
  csv: 'data', tsv: 'data', json: 'data', xlsx: 'data', xls: 'data', ods: 'data',
  txt: 'text', md: 'text', markdown: 'text', html: 'text', htm: 'text', xml: 'text', yml: 'text', yaml: 'text', log: 'text', ini: 'text', srt: 'text', vtt: 'text', css: 'text', js: 'text', ts: 'text', svg: 'text',
  zip: 'archive',
}

export const extOf = (name: string) => { const m = /\.([a-z0-9]{1,8})$/i.exec(name); return m ? m[1].toLowerCase() : '' }

/** Work out what kind of file this is from its name first, then its MIME type. */
export function kindOf(name: string, type = ''): Kind {
  const k = EXT_KIND[extOf(name)]
  if (k) return k
  if (type.startsWith('image/') && type !== 'image/svg+xml') return 'image'
  if (type === 'application/pdf') return 'pdf'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  if (type === 'application/zip' || type === 'application/x-zip-compressed') return 'archive'
  if (type === 'application/json' || type === 'text/csv') return 'data'
  if (type.startsWith('text/')) return 'text'
  return 'other'
}

export const accepts = (m: StepMeta, kind: Kind) => m.accepts === 'any' || m.accepts.includes(kind)

/** Default params for a step, with optional overrides. */
export function defaults(id: string, over: Record<string, any> = {}): Record<string, any> {
  const m = metaOf(id)
  if (!m) return { ...over }
  return { ...Object.fromEntries(m.params.map((p) => [p.key, p.default])), ...over }
}
