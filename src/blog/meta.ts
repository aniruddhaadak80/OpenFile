// Blog index. Kept as plain object literals on one line each, because scripts/postbuild.mjs reads this file
// with a regex to pre-render /blog/<slug>, add the posts to sitemap.xml and write /blog/rss.xml.
// Post bodies live in src/blog/posts/<slug>.tsx and are lazy-loaded.
export type CoverKind = 'privacy' | 'pdf' | 'image' | 'video' | 'pipeline' | 'sketch' | 'formats' | 'dev' | 'voice'

export interface PostMeta {
  slug: string
  title: string
  description: string
  date: string
  tags: string[]
  minutes: number
  cover: CoverKind
  /** Tools the post talks about: shown as "try it" cards and as preview videos when available */
  tools: string[]
}

export const POSTS: PostMeta[] = [
  { slug: 'how-openfile-keeps-files-private', title: 'How OpenFile keeps your files private', description: 'What really happens when you drop a file into OpenFile, why nothing gets uploaded, and how you can check it yourself in two minutes.', date: '2026-10-27', tags: ['privacy', 'architecture'], minutes: 6, cover: 'privacy', tools: ['merge-pdf', 'hash-generator', 'background-remover'] },
  { slug: 'pdf-tips-that-save-time', title: 'Ten PDF tips that save me time every week', description: 'Page ranges, smart compression, signing, OCR and the order I run things in. Small habits that make PDF work painless.', date: '2026-10-24', tags: ['pdf', 'tips'], minutes: 7, cover: 'pdf', tools: ['merge-pdf', 'split-pdf', 'compress-pdf', 'organize-pdf', 'sign-pdf', 'ocr-pdf'] },
  { slug: 'image-compression-explained', title: 'Image compression explained, with a slider you can drag', description: 'Lossy, lossless, JPG, WebP and AVIF in plain words. Drag the slider to see what quality settings actually do to a picture.', date: '2026-10-21', tags: ['images', 'performance'], minutes: 8, cover: 'image', tools: ['image-compressor', 'image-converter', 'image-resizer'] },
  { slug: 'video-in-the-browser-with-webassembly', title: 'Editing video in a browser tab with WebAssembly', description: 'How ffmpeg runs inside your browser, why the first run downloads an engine, and how to get the best speed out of it.', date: '2026-10-18', tags: ['video', 'webassembly'], minutes: 7, cover: 'video', tools: ['video-trimmer', 'video-compressor', 'video-to-gif', 'video-converter'] },
  { slug: 'building-a-batch-pipeline', title: 'Building a batch pipeline for 200 product photos', description: 'A real walk through of the Workspace: resize, watermark, strip metadata, convert and zip, then save it as a recipe you can run again.', date: '2026-10-15', tags: ['workspace', 'automation', 'images'], minutes: 6, cover: 'pipeline', tools: ['image-resizer', 'image-converter', 'image-compressor'] },
  { slug: 'sketch-board-tips', title: 'Sketch board tips: draw diagrams faster', description: 'Shortcuts, snapping, frames and export tricks for the Sketch board. Try the shortcut trainer right in the post.', date: '2026-10-12', tags: ['design', 'tips'], minutes: 5, cover: 'sketch', tools: ['sketch-board'] },
  { slug: 'file-formats-guide', title: 'A friendly guide to file formats', description: 'Which format to use for what, and what each one is good and bad at. Includes an interactive format explorer.', date: '2026-10-09', tags: ['formats', 'guide'], minutes: 9, cover: 'formats', tools: ['image-converter', 'heic-converter', 'video-converter'] },
  { slug: 'developer-tools-roundup', title: 'The developer tools I reach for every day', description: 'JSON, JWT, regex, hashes, cURL and cron: a quick tour of the dev tools in OpenFile, with a live JSON formatter to play with.', date: '2026-10-06', tags: ['developer', 'tools'], minutes: 6, cover: 'dev', tools: ['json-formatter', 'jwt-decoder', 'regex-builder', 'hash-generator', 'curl-to-code', 'cron-parser'] },
  { slug: 'private-text-to-speech', title: 'Text to speech that never leaves your device', description: 'How OpenFile reads text aloud with your system voices, and falls back to a small neural voice model that runs in the tab.', date: '2026-10-03', tags: ['audio', 'ai', 'privacy'], minutes: 5, cover: 'voice', tools: ['text-to-speech', 'audio-transcriber'] },
]

export const postBySlug = (s: string) => POSTS.find((p) => p.slug === s)
export const ALL_TAGS = [...new Set(POSTS.flatMap((p) => p.tags))].sort()
export const formatDate = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' })
