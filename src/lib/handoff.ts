// Lets the homepage "smart drop" pass files straight into the next tool's Dropzone.
let pending: File[] | null = null
export function setHandoff(files: File[]) { pending = files }
export function takeHandoff(accept?: string): File[] | null {
  if (!pending) return null
  const files = pending
  if (accept) {
    const rules = accept.split(',').map((s) => s.trim().toLowerCase())
    const ok = files.filter((f) => rules.some((r) => r.startsWith('.') ? f.name.toLowerCase().endsWith(r) : r.endsWith('/*') ? f.type.startsWith(r.slice(0, -1)) : f.type === r))
    if (!ok.length) return null
    pending = null
    return ok
  }
  pending = null
  return files
}

/** Suggest tools for a dropped file */
export function suggestFor(file: File): string[] {
  const n = file.name.toLowerCase(), t = file.type
  if (t === 'application/pdf' || n.endsWith('.pdf')) return ['compress-pdf', 'merge-pdf', 'split-pdf', 'organize-pdf', 'pdf-to-image', 'pdf-to-word', 'sign-pdf', 'edit-pdf', 'protect-pdf', 'pdf-watermark', 'ocr-pdf', 'pdf-to-text']
  if (n.endsWith('.heic') || n.endsWith('.heif')) return ['heic-converter']
  if (t === 'image/svg+xml') return ['svg-optimizer', 'image-converter']
  if (t.startsWith('image/')) return ['image-compressor', 'background-remover', 'image-converter', 'image-resizer', 'image-cropper', 'image-upscaler', 'image-to-pdf', 'image-filters', 'screenshot-studio', 'image-metadata-remover', 'color-palette', 'image-to-svg']
  if (t.startsWith('video/')) return ['video-compressor', 'video-trimmer', 'video-converter', 'video-to-gif', 'extract-audio', 'mute-video', 'video-speed', 'video-frames']
  if (t.startsWith('audio/')) return ['audio-editor', 'audio-converter', 'audio-transcriber', 'audio-merger']
  if (n.endsWith('.docx')) return ['word-to-pdf']
  if (n.endsWith('.xlsx') || n.endsWith('.xls') || n.endsWith('.csv')) return ['table-converter', 'excel-to-pdf']
  if (n.endsWith('.md')) return ['markdown-to-pdf', 'markdown-editor']
  if (n.endsWith('.json')) return ['json-formatter', 'yaml-json', 'table-converter']
  if (n.endsWith('.epub')) return ['epub-to-pdf']
  if (n.endsWith('.html') || n.endsWith('.htm')) return ['html-to-pdf']
  return ['hash-generator', 'base64', 'text-to-pdf']
}
