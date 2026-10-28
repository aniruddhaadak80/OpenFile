// Central catalog of every OpenFile tool.
// Each tool's UI lives at src/tools/<category>/<slug>.tsx (default export) and is lazy-loaded.
export type Category = 'pdf' | 'convert' | 'image' | 'video' | 'audio' | 'dev' | 'text' | 'design' | 'data' | 'ai' | '3d' | 'archive' | 'ebook' | 'font' | 'cad' | 'subtitle'
import { BATCH_1 } from './batches/b1'
import { BATCH_2 } from './batches/b2'
import { BATCH_3 } from './batches/b3'
import { BATCH_4 } from './batches/b4'
import { BATCH_5 } from './batches/b5'
import { BATCH_10 } from './batches/b10'
import { BATCH_11 } from './batches/b11'
import { BATCH_12 } from './batches/b12'

export interface ToolMeta {
  slug: string
  name: string
  desc: string
  category: Category
  icon: string // lucide-react icon name
  tags?: string[]
  badge?: 'NEW' | 'AI' | 'HOT' | 'PRO'
  popular?: boolean
  /** Pipeline step support (used by the Workspace) */
  pipeline?: 'image' | 'pdf'
  /* ---- Optional guide content (shown under the tool and in the Docs). All optional: when omitted,
     src/tools/guides.ts generates sensible content from the category and the engines the tool uses. ---- */
  /** One-paragraph "How it works" explanation */
  how?: string
  /** Numbered how-to steps */
  steps?: string[]
  /** Short practical tips */
  tips?: string[]
  /** Tool-specific FAQ entries (shown before the generic ones) */
  faq?: { q: string; a: string }[]
  /** Slugs of hand-picked related tools */
  related?: string[]
  /** Accepted input formats, e.g. ['PDF'] or ['JPG', 'PNG', 'WEBP'] */
  inputs?: string[]
  /** Output formats produced */
  outputs?: string[]
}

const ALL_CATEGORIES: { id: Category; name: string; blurb: string; color: string }[] = [
  { id: 'pdf', name: 'PDF Tools', blurb: 'Merge, split, sign, protect and edit PDFs', color: '#F5A524' },
  { id: 'convert', name: 'Convert', blurb: 'Move between PDF, Office, Markdown, HTML and images', color: '#F97316' },
  { id: 'image', name: 'Image', blurb: 'Compress, resize, crop, remove backgrounds, upscale', color: '#10B981' },
  { id: 'video', name: 'Video', blurb: 'Trim, compress, convert, GIF and record', color: '#38BDF8' },
  { id: 'audio', name: 'Audio', blurb: 'Edit, convert, record and transcribe', color: '#14B8A6' },
  { id: 'dev', name: 'Developer', blurb: 'JSON, JWT, regex, hashes, cURL and more', color: '#22D3EE' },
  { id: 'text', name: 'Text & Data', blurb: 'Diff, count, convert tables, format text', color: '#84CC16' },
  { id: 'design', name: 'Design', blurb: 'Colors, CSS, favicons, SVG, whiteboards', color: '#60A5FA' },
  { id: 'data', name: 'Data', blurb: 'CSV, Excel, JSON, SQLite, Parquet, maps and GPS', color: '#0EA5E9' },
  { id: 'ai', name: 'AI', blurb: 'On-device AI for images, text and documents', color: '#FBBF24' },
  { id: '3d', name: '3D', blurb: 'View and convert GLB, GLTF, OBJ, STL, PLY and more', color: '#2DD4BF' },
  { id: 'archive', name: 'Archives', blurb: 'Open and create ZIP, 7Z, TAR, GZ and RAR', color: '#A3A3A3' },
  { id: 'ebook', name: 'eBooks', blurb: 'Read and convert EPUB, MOBI, FB2 and comics', color: '#FB923C' },
  { id: 'font', name: 'Fonts', blurb: 'Convert, inspect and subset TTF, OTF, WOFF', color: '#FACC15' },
  { id: 'cad', name: 'CAD', blurb: 'View and convert DXF and other drawings', color: '#4ADE80' },
  { id: 'subtitle', name: 'Subtitles', blurb: 'Convert, sync and edit SRT, VTT, ASS', color: '#67E8F9' },
]

const CORE_TOOLS: ToolMeta[] = [
  // ---------- PDF ----------
  { slug: 'merge-pdf', name: 'Merge PDF', desc: 'Combine multiple PDFs into one ordered document with drag-and-drop sorting.', category: 'pdf', icon: 'Combine', popular: true, tags: ['join', 'combine'] },
  { slug: 'split-pdf', name: 'Split PDF', desc: 'Split by ranges, every N pages, or extract each page into a ZIP.', category: 'pdf', icon: 'Scissors', popular: true },
  { slug: 'compress-pdf', name: 'Compress PDF', desc: 'Shrink PDF size with smart image downsampling and stream compression.', category: 'pdf', icon: 'Minimize2', popular: true, pipeline: 'pdf' },
  { slug: 'organize-pdf', name: 'Organize PDF', desc: 'Visually reorder, rotate, duplicate and delete pages with thumbnails.', category: 'pdf', icon: 'LayoutGrid', badge: 'HOT' },
  { slug: 'delete-pdf-pages', name: 'Delete Pages', desc: 'Remove selected pages and download the trimmed document.', category: 'pdf', icon: 'Trash2' },
  { slug: 'extract-pdf-pages', name: 'Extract Pages', desc: 'Pull selected pages into a brand-new PDF.', category: 'pdf', icon: 'FileOutput' },
  { slug: 'rotate-pdf', name: 'Rotate PDF', desc: 'Rotate selected pages or the whole document.', category: 'pdf', icon: 'RotateCw', pipeline: 'pdf' },
  { slug: 'pdf-page-numbers', name: 'Add Page Numbers', desc: 'Stamp page numbers with position, format and font controls.', category: 'pdf', icon: 'Hash', pipeline: 'pdf' },
  { slug: 'pdf-watermark', name: 'Watermark PDF', desc: 'Stamp text or logo watermarks with opacity, rotation and tiling.', category: 'pdf', icon: 'Stamp', pipeline: 'pdf' },
  { slug: 'pdf-header-footer', name: 'Header & Footer', desc: 'Add running headers and footers with dates, titles and page tokens.', category: 'pdf', icon: 'PanelTop' },
  { slug: 'sign-pdf', name: 'Sign PDF', desc: 'Draw, type or upload a signature and place it anywhere, plus dates and initials.', category: 'pdf', icon: 'PenTool', popular: true },
  { slug: 'edit-pdf', name: 'Edit PDF', desc: 'Add text, shapes, highlights, images and freehand drawing to any page.', category: 'pdf', icon: 'FilePen', badge: 'HOT' },
  { slug: 'protect-pdf', name: 'Protect PDF', desc: 'Encrypt a PDF with a password and set print/copy permissions.', category: 'pdf', icon: 'Lock' },
  { slug: 'unlock-pdf', name: 'Unlock PDF', desc: 'Remove the password from a PDF you have access to.', category: 'pdf', icon: 'Unlock' },
  { slug: 'redact-pdf', name: 'Redact PDF', desc: 'Black out areas or auto-find emails, phones and card numbers, then flatten.', category: 'pdf', icon: 'EyeOff' },
  { slug: 'pdf-grayscale', name: 'PDF to Grayscale', desc: 'Convert color PDFs to grayscale or high-contrast black & white.', category: 'pdf', icon: 'Contrast', pipeline: 'pdf' },
  { slug: 'crop-pdf', name: 'Crop PDF', desc: 'Trim page margins visually or by exact measurements.', category: 'pdf', icon: 'Crop' },
  { slug: 'flatten-pdf', name: 'Flatten PDF', desc: 'Flatten form fields and annotations into static page content.', category: 'pdf', icon: 'Layers' },
  { slug: 'pdf-metadata', name: 'PDF Metadata', desc: 'View and edit title, author, subject, keywords and dates.', category: 'pdf', icon: 'Info' },
  { slug: 'fill-pdf-form', name: 'Fill PDF Form', desc: 'Detect form fields and fill text boxes, checkboxes and dropdowns.', category: 'pdf', icon: 'ClipboardList' },
  { slug: 'compare-pdf', name: 'Compare PDF', desc: 'Side-by-side text diff of two PDF versions.', category: 'pdf', icon: 'GitCompare', badge: 'NEW' },
  { slug: 'nup-pdf', name: 'N-up / Booklet', desc: 'Print 2, 4 or 9 pages per sheet, or impose a booklet.', category: 'pdf', icon: 'Grid2x2' },
  { slug: 'ocr-pdf', name: 'OCR PDF', desc: 'Recognise text in scanned PDFs and images in 10+ languages.', category: 'pdf', icon: 'ScanText', badge: 'AI' },
  { slug: 'pdf-reader', name: 'PDF Reader', desc: 'Fast viewer with search, zoom, thumbnails and outline.', category: 'pdf', icon: 'BookOpen' },
  { slug: 'add-blank-pages', name: 'Insert Pages', desc: 'Insert blank pages or pages from another PDF at any position.', category: 'pdf', icon: 'FilePlus' },
  { slug: 'repair-pdf', name: 'Repair PDF', desc: 'Rebuild broken or malformed PDFs by re-writing the document structure.', category: 'pdf', icon: 'Wrench' },
  { slug: 'invoice-generator', name: 'Invoice Generator', desc: 'Create GST/VAT invoices with automatic totals and a polished PDF.', category: 'pdf', icon: 'Receipt', popular: true },
  { slug: 'resume-builder', name: 'Resume Builder', desc: 'Fill a form, pick a template, download an ATS-friendly PDF resume.', category: 'pdf', icon: 'FileUser', badge: 'NEW' },

  // ---------- CONVERT ----------
  { slug: 'pdf-to-image', name: 'PDF to Image', desc: 'Export PDF pages as crisp PNG, JPG or WEBP at any DPI.', category: 'convert', icon: 'FileImage', popular: true },
  { slug: 'image-to-pdf', name: 'Image to PDF', desc: 'Combine JPG, PNG and WEBP into one PDF with page-size controls.', category: 'convert', icon: 'ImagePlus', popular: true },
  { slug: 'pdf-to-text', name: 'PDF to Text', desc: 'Extract text from every page, with layout-aware ordering.', category: 'convert', icon: 'FileText' },
  { slug: 'pdf-to-word', name: 'PDF to Word', desc: 'Convert PDF text into an editable DOCX document.', category: 'convert', icon: 'FileType', popular: true },
  { slug: 'word-to-pdf', name: 'Word to PDF', desc: 'Turn DOCX files into well-formatted PDFs.', category: 'convert', icon: 'FileType2', popular: true },
  { slug: 'pdf-to-ppt', name: 'PDF to PowerPoint', desc: 'Turn each PDF page into a slide in a PPTX deck.', category: 'convert', icon: 'Presentation' },
  { slug: 'excel-to-pdf', name: 'Excel to PDF', desc: 'Render XLSX/CSV sheets as clean paginated PDF tables.', category: 'convert', icon: 'Sheet' },
  { slug: 'pdf-to-excel', name: 'PDF to Excel', desc: 'Pull tabular text from PDFs into an XLSX spreadsheet.', category: 'convert', icon: 'Table' },
  { slug: 'markdown-to-pdf', name: 'Markdown to PDF', desc: 'Write Markdown with a live preview and export a beautiful PDF.', category: 'convert', icon: 'FileCode' },
  { slug: 'html-to-pdf', name: 'HTML to PDF', desc: 'Paste HTML or a URL and convert it into a PDF.', category: 'convert', icon: 'Globe' },
  { slug: 'text-to-pdf', name: 'Text to PDF', desc: 'Turn plain text into a paginated PDF with fonts and margins.', category: 'convert', icon: 'Type' },
  { slug: 'heic-converter', name: 'HEIC Converter', desc: 'Convert Apple HEIC/HEIF photos to JPG, PNG or WEBP.', category: 'convert', icon: 'Smartphone' },
  { slug: 'table-converter', name: 'CSV & Excel Converter', desc: 'Convert CSV, XLSX, JSON, Markdown, TSV, HTML and SQL both ways.', category: 'convert', icon: 'ArrowLeftRight' },
  { slug: 'epub-to-pdf', name: 'EPUB to PDF', desc: 'Convert e-books into printable PDFs.', category: 'convert', icon: 'Book' },

  // ---------- IMAGE ----------
  { slug: 'image-compressor', name: 'Image Compressor', desc: 'Shrink images in bulk with quality and width controls and live savings.', category: 'image', icon: 'FileArchive', popular: true, pipeline: 'image' },
  { slug: 'image-converter', name: 'Image Converter', desc: 'Convert JPG, PNG, WEBP, AVIF, BMP, GIF and ICO in bulk.', category: 'image', icon: 'RefreshCw', popular: true, pipeline: 'image' },
  { slug: 'image-resizer', name: 'Image Resizer', desc: 'Resize to exact pixels, percentages or social presets.', category: 'image', icon: 'Scaling', popular: true, pipeline: 'image' },
  { slug: 'image-cropper', name: 'Image Cropper', desc: 'Crop with aspect ratios, social presets and circle avatars.', category: 'image', icon: 'Crop' },
  { slug: 'background-remover', name: 'Background Remover', desc: 'Remove image backgrounds with on-device AI. Replace with color or blur.', category: 'image', icon: 'Eraser', badge: 'AI', popular: true },
  { slug: 'image-upscaler', name: 'Image Upscaler', desc: 'Upscale images 2× to 4× with AI super-resolution.', category: 'image', icon: 'ZoomIn', badge: 'AI' },
  { slug: 'image-rotate-flip', name: 'Rotate & Flip', desc: 'Rotate by any angle or flip images horizontally/vertically.', category: 'image', icon: 'FlipHorizontal', pipeline: 'image' },
  { slug: 'image-watermark', name: 'Image Watermark', desc: 'Add text or logo watermarks to images in bulk.', category: 'image', icon: 'Droplets', pipeline: 'image' },
  { slug: 'add-text-to-image', name: 'Add Text to Image', desc: 'Place styled text anywhere with fonts, shadows and outlines.', category: 'image', icon: 'Type' },
  { slug: 'rounded-corners', name: 'Rounded Corners', desc: 'Round image corners or make a perfect circle with transparency.', category: 'image', icon: 'Square', pipeline: 'image' },
  { slug: 'image-filters', name: 'Photo Editor & Filters', desc: 'Brightness, contrast, saturation, blur, presets and more.', category: 'image', icon: 'SlidersHorizontal', pipeline: 'image' },
  { slug: 'blur-faces', name: 'Blur & Redact Image', desc: 'Auto-detect faces or paint areas to blur or pixelate.', category: 'image', icon: 'ScanFace', badge: 'AI' },
  { slug: 'image-metadata-remover', name: 'EXIF Viewer & Remover', desc: 'Inspect camera/GPS metadata and strip it for privacy.', category: 'image', icon: 'ShieldCheck', pipeline: 'image' },
  { slug: 'image-to-svg', name: 'Image to SVG', desc: 'Vectorize PNG/JPG into scalable SVG paths.', category: 'image', icon: 'PenLine' },
  { slug: 'screenshot-studio', name: 'Screenshot Studio', desc: 'Beautify screenshots with backgrounds, padding, shadows and frames.', category: 'image', icon: 'Monitor', badge: 'HOT' },
  { slug: 'collage-maker', name: 'Collage Maker', desc: 'Arrange photos into grid layouts with spacing and borders.', category: 'image', icon: 'LayoutDashboard' },
  { slug: 'meme-generator', name: 'Meme Generator', desc: 'Classic top/bottom caption memes from any image.', category: 'image', icon: 'Laugh' },
  { slug: 'gif-maker', name: 'GIF Maker', desc: 'Turn a set of images into an animated GIF.', category: 'image', icon: 'Film' },
  { slug: 'image-to-base64', name: 'Image to Base64', desc: 'Encode images as data URIs, or decode Base64 back to images.', category: 'image', icon: 'Binary' },
  { slug: 'image-splitter', name: 'Image Splitter', desc: 'Slice an image into a grid of tiles (Instagram carousels).', category: 'image', icon: 'Grid3x3' },
  { slug: 'color-picker-image', name: 'Image Color Picker', desc: 'Pick exact pixel colors from any image with a loupe.', category: 'image', icon: 'Pipette' },

  // ---------- VIDEO ----------
  { slug: 'video-trimmer', name: 'Video Trimmer', desc: 'Trim and cut clips with a visual timeline, no re-upload.', category: 'video', icon: 'Scissors', popular: true },
  { slug: 'video-compressor', name: 'Video Compressor', desc: 'Compress videos with quality presets and target resolution.', category: 'video', icon: 'Minimize2', popular: true },
  { slug: 'video-converter', name: 'Video Converter', desc: 'Convert between MP4, WEBM, MOV, MKV and AVI.', category: 'video', icon: 'RefreshCw' },
  { slug: 'video-to-gif', name: 'Video to GIF', desc: 'Turn a clip into an optimized animated GIF.', category: 'video', icon: 'Film' },
  { slug: 'extract-audio', name: 'Extract Audio', desc: 'Pull the soundtrack from a video as MP3, WAV or AAC.', category: 'video', icon: 'Music' },
  { slug: 'mute-video', name: 'Mute Video', desc: 'Remove the audio track from any video.', category: 'video', icon: 'VolumeX' },
  { slug: 'video-speed', name: 'Video Speed', desc: 'Speed up or slow down a video from 0.25× to 4×.', category: 'video', icon: 'Gauge' },
  { slug: 'merge-videos', name: 'Merge Videos', desc: 'Join multiple clips into one video.', category: 'video', icon: 'Combine' },
  { slug: 'video-upscaler', name: 'Video Upscaler', desc: 'Upscale video to 1080p, 1440p or 4K with Lanczos + sharpening.', category: 'video', icon: 'ZoomIn' },
  { slug: 'video-frames', name: 'Video to Frames', desc: 'Grab frames as images at any interval.', category: 'video', icon: 'Images' },
  { slug: 'screen-recorder', name: 'Screen Recorder', desc: 'Record screen + webcam bubble with mic and system audio.', category: 'video', icon: 'Video', popular: true },
  { slug: 'webcam-recorder', name: 'Webcam Recorder', desc: 'Record webcam video with mirror and countdown.', category: 'video', icon: 'Camera' },

  // ---------- AUDIO ----------
  { slug: 'audio-editor', name: 'Audio Editor & Trimmer', desc: 'Trim, fade in/out, change volume and export with a waveform.', category: 'audio', icon: 'AudioWaveform', popular: true },
  { slug: 'audio-converter', name: 'Audio Converter', desc: 'Convert MP3, WAV, OGG, AAC, FLAC and M4A.', category: 'audio', icon: 'RefreshCw' },
  { slug: 'voice-recorder', name: 'Voice Recorder', desc: 'Record your voice with live waveform and export.', category: 'audio', icon: 'Mic' },
  { slug: 'audio-transcriber', name: 'Audio Transcriber', desc: 'Transcribe speech with on-device Whisper AI and export SRT.', category: 'audio', icon: 'Captions', badge: 'AI' },
  { slug: 'text-to-speech', name: 'Text to Speech', desc: 'Read text aloud with system voices or a private neural voice, then save it as WAV.', category: 'audio', icon: 'Volume2', steps: ['Type or paste your text in the box.', 'Pick System voices or the Neural engine, then choose a voice.', 'Set the speed, then press Read aloud (or Ctrl+Enter).', 'Press Make WAV to save the audio file.'], inputs: ['Text'], outputs: ['WAV'] },
  { slug: 'audio-merger', name: 'Audio Merger', desc: 'Join multiple audio files into one track.', category: 'audio', icon: 'ListMusic' },

  // ---------- DEV ----------
  { slug: 'json-formatter', name: 'JSON Formatter', desc: 'Prettify, validate, minify and explore JSON as a tree.', category: 'dev', icon: 'Braces', popular: true },
  { slug: 'jwt-decoder', name: 'JWT Decoder', desc: 'Decode JWT headers/payloads and check expiry locally.', category: 'dev', icon: 'KeyRound' },
  { slug: 'hash-generator', name: 'Hash Generator', desc: 'MD5, SHA-1, SHA-256, SHA-512 for text and files.', category: 'dev', icon: 'Fingerprint' },
  { slug: 'uuid-generator', name: 'UUID Generator', desc: 'Generate v4 and v7 UUIDs in bulk.', category: 'dev', icon: 'Shuffle' },
  { slug: 'password-generator', name: 'Password Generator', desc: 'Strong random passwords and passphrases with strength meter.', category: 'dev', icon: 'KeySquare' },
  { slug: 'qr-generator', name: 'QR Code Generator', desc: 'QR codes for links, Wi-Fi, vCards and text with colors and logo.', category: 'dev', icon: 'QrCode', popular: true },
  { slug: 'qr-scanner', name: 'QR Code Scanner', desc: 'Scan QR codes from your camera or an image.', category: 'dev', icon: 'ScanLine' },
  { slug: 'barcode-generator', name: 'Barcode Generator', desc: 'CODE128, EAN-13, UPC, CODE39 and more as PNG/SVG.', category: 'dev', icon: 'Barcode' },
  { slug: 'regex-tester', name: 'Regex Tester', desc: 'Test regular expressions with live highlighting and groups.', category: 'dev', icon: 'Regex' },
  { slug: 'regex-builder', name: 'Regex Builder', desc: 'Build regular expressions from plain-language blocks.', category: 'dev', icon: 'Blocks' },
  { slug: 'base64', name: 'Base64 Encode/Decode', desc: 'Encode or decode Base64 text and files.', category: 'dev', icon: 'Binary' },
  { slug: 'url-encoder', name: 'URL Encode/Decode', desc: 'Encode/decode URLs and parse query strings.', category: 'dev', icon: 'Link' },
  { slug: 'curl-to-code', name: 'cURL to Code', desc: 'Convert cURL to JavaScript, Python, Go, Rust, PHP, Java and more.', category: 'dev', icon: 'Terminal' },
  { slug: 'timestamp-converter', name: 'Timestamp Converter', desc: 'Unix epoch ⇄ human dates across time zones.', category: 'dev', icon: 'Clock' },
  { slug: 'cron-parser', name: 'Cron Explainer', desc: 'Explain cron expressions and preview next run times.', category: 'dev', icon: 'CalendarClock' },
  { slug: 'yaml-json', name: 'YAML ⇄ JSON', desc: 'Convert between YAML and JSON with validation.', category: 'dev', icon: 'FileJson' },
  { slug: 'sql-formatter', name: 'SQL Formatter', desc: 'Beautify SQL for many dialects.', category: 'dev', icon: 'Database' },
  { slug: 'erd-diagram', name: 'ERD Studio', desc: 'Design database schemas and export SQL, Prisma and Drizzle.', category: 'dev', icon: 'Network' },
  { slug: 'html-entities', name: 'HTML Entities', desc: 'Escape and unescape HTML entities.', category: 'dev', icon: 'Code' },
  { slug: 'number-base', name: 'Number Base Converter', desc: 'Binary, octal, decimal and hex conversion.', category: 'dev', icon: 'Calculator' },

  // ---------- TEXT ----------
  { slug: 'diff-checker', name: 'Diff Checker', desc: 'Compare text and code side-by-side or inline.', category: 'text', icon: 'GitCompare', popular: true },
  { slug: 'word-counter', name: 'Word Counter', desc: 'Words, characters, sentences, reading time and keyword density.', category: 'text', icon: 'CaseSensitive' },
  { slug: 'case-converter', name: 'Case Converter', desc: 'UPPER, lower, Title, camelCase, snake_case, kebab-case and more.', category: 'text', icon: 'CaseUpper' },
  { slug: 'lorem-ipsum', name: 'Lorem Ipsum', desc: 'Generate placeholder paragraphs, sentences or words.', category: 'text', icon: 'AlignLeft' },
  { slug: 'markdown-editor', name: 'Markdown Editor', desc: 'Live split-pane Markdown editor with HTML export.', category: 'text', icon: 'NotebookPen' },
  { slug: 'date-calculator', name: 'Date Calculator', desc: 'Difference between dates, add/subtract days, business days.', category: 'text', icon: 'CalendarDays' },
  { slug: 'unit-converter', name: 'Unit Converter', desc: 'Length, weight, temperature, data, speed and more.', category: 'text', icon: 'Ruler' },
  { slug: 'text-cleaner', name: 'Text Cleaner', desc: 'Remove duplicates, sort lines, trim spaces and strip line breaks.', category: 'text', icon: 'Sparkles' },

  // ---------- DESIGN ----------
  { slug: 'color-palette', name: 'Color Palette Extractor', desc: 'Extract dominant colors and export CSS/Tailwind palettes.', category: 'design', icon: 'Palette', popular: true },
  { slug: 'color-converter', name: 'Color Converter & Contrast', desc: 'HEX, RGB, HSL, OKLCH conversion and WCAG contrast checks.', category: 'design', icon: 'Paintbrush' },
  { slug: 'gradient-generator', name: 'Gradient Generator', desc: 'Design linear, radial and conic gradients and copy CSS.', category: 'design', icon: 'Blend' },
  { slug: 'css-studio', name: 'CSS Studio', desc: 'Box shadows, glassmorphism and neumorphism generators.', category: 'design', icon: 'Wand2' },
  { slug: 'favicon-generator', name: 'Favicon Generator', desc: 'Full icon packs: ICO, Apple Touch, Android, manifest and HTML.', category: 'design', icon: 'AppWindow' },
  { slug: 'svg-optimizer', name: 'SVG Optimizer', desc: 'Minify SVGs, export JSX or PNG.', category: 'design', icon: 'Shapes' },
  { slug: 'sketch-board', name: 'Sketch Whiteboard', desc: 'Infinite whiteboard with shapes, arrows, text and sticky notes.', category: 'design', icon: 'PencilRuler', badge: 'HOT' },
  { slug: 'placeholder-image', name: 'Placeholder Image', desc: 'Generate placeholder images in any size, color and text.', category: 'design', icon: 'ImageIcon' },
]

export const TOOLS: ToolMeta[] = [...CORE_TOOLS, ...BATCH_1, ...BATCH_2, ...BATCH_3, ...BATCH_4, ...BATCH_5, ...BATCH_10, ...BATCH_11, ...BATCH_12]

/** Only categories that have at least one tool are shown in the UI. */
export const CATEGORIES = ALL_CATEGORIES.filter((c) => TOOLS.some((t) => t.category === c.id))

export const toolBySlug = (slug: string) => TOOLS.find((t) => t.slug === slug)

const modules = import.meta.glob('./*/*.tsx')
export function loadTool(slug: string) {
  const t = toolBySlug(slug)
  if (!t) return null
  const key = `./${t.category}/${slug}.tsx`
  return modules[key] as undefined | (() => Promise<{ default: React.ComponentType }>)
}
