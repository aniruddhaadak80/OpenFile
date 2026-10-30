// Guide content for every tool: "How it works", steps, tips, FAQ and related tools.
// Explicit fields on a registry entry win; otherwise content comes from the per-tool overrides below,
// then from category defaults. The engine list comes from engines.ts (generated from each tool's imports).
import { CATEGORIES, TOOLS, toolBySlug, type Category, type ToolMeta } from './registry'
import { ENGINES } from './engines'

export interface EngineInfo { name: string; what: string; download?: string; source?: string }
export const ENGINE_INFO: Record<string, EngineInfo> = {
  'ffmpeg.wasm': { name: 'ffmpeg.wasm', what: 'the FFmpeg media toolkit compiled to WebAssembly, single-threaded core', download: 'about 30 MB, served by OpenFile itself (a public CDN is only a fallback) and cached by your browser after the first use', source: 'https://ffmpegwasm.netlify.app' },
  'Tesseract.js': { name: 'Tesseract.js', what: 'the Tesseract OCR engine compiled to WebAssembly', download: 'the engine plus a few MB of trained data per language, fetched on first use and cached', source: 'https://tesseract.projectnaptha.com' },
  'IMG.LY background removal': { name: '@imgly/background-removal', what: 'an ONNX segmentation model run with ONNX Runtime Web on WebGPU or WASM', download: 'a model of roughly 40 MB, fetched on first use and cached', source: 'https://github.com/imgly/background-removal-js' },
  'Transformers.js (ONNX)': { name: 'Transformers.js', what: 'Hugging Face models run on-device with ONNX Runtime Web, on WebGPU when available, otherwise WASM', download: 'model weights from the Hugging Face Hub on first use (tens of MB), then cached', source: 'https://huggingface.co/docs/transformers.js' },
  'pdf-lib': { name: 'pdf-lib', what: 'a pure-JavaScript library that creates and edits PDF structure: pages, text, images and forms' },
  'pdf-lib (with encryption)': { name: '@cantoo/pdf-lib', what: 'a pdf-lib fork that can read and write password-encrypted PDFs' },
  'PDF.js': { name: 'PDF.js', what: 'Mozilla’s PDF renderer, used for thumbnails, previews and text extraction, run in a Web Worker' },
  SheetJS: { name: 'SheetJS', what: 'a spreadsheet parser/writer for XLSX, XLS and CSV' },
  jsPDF: { name: 'jsPDF', what: 'a client-side PDF generator' },
  html2canvas: { name: 'html2canvas', what: 'renders HTML into a canvas so it can be placed into a PDF' },
  mammoth: { name: 'mammoth', what: 'converts DOCX documents into clean HTML' },
  docx: { name: 'docx', what: 'generates Word .docx files in the browser' },
  PptxGenJS: { name: 'PptxGenJS', what: 'generates PowerPoint .pptx decks in the browser' },
  marked: { name: 'marked', what: 'a fast Markdown parser' },
  SVGO: { name: 'SVGO', what: 'the standard SVG optimizer, browser build' },
  imagetracerjs: { name: 'imagetracerjs', what: 'traces bitmap images into SVG paths' },
  PapaParse: { name: 'PapaParse', what: 'a robust CSV parser' },
  'js-yaml': { name: 'js-yaml', what: 'a YAML parser and serializer' },
  JSZip: { name: 'JSZip', what: 'reads ZIP containers, which is what EPUB files are' },
  'sql-formatter': { name: 'sql-formatter', what: 'formats SQL for many dialects' },
  cronstrue: { name: 'cronstrue', what: 'turns cron expressions into plain language' },
  exifr: { name: 'exifr', what: 'a fast EXIF/GPS/XMP metadata reader' },
  signature_pad: { name: 'signature_pad', what: 'smooth, pressure-aware signature drawing on canvas' },
  qrcode: { name: 'qrcode', what: 'a QR code encoder' },
  JsBarcode: { name: 'JsBarcode', what: 'a barcode generator for CODE128, EAN, UPC and more' },
  'crypto-js': { name: 'crypto-js', what: 'hash functions not offered by Web Crypto, such as MD5' },
  'Web Crypto': { name: 'Web Crypto API', what: 'the browser’s built-in, hardware-accelerated cryptography' },
  'Web Speech API': { name: 'Web Speech API', what: 'the speech voices installed on your operating system' },
  'BarcodeDetector API': { name: 'BarcodeDetector', what: 'the browser’s native barcode/QR detector, with a JavaScript fallback where it is missing' },
  'Shape Detection API': { name: 'Shape Detection API', what: 'the browser’s native face detector where available; manual painting works everywhere' },
  MediaRecorder: { name: 'MediaRecorder', what: 'the browser’s built-in audio/video recorder' },
  'Screen Capture API': { name: 'Screen Capture API', what: 'getDisplayMedia, for capturing a screen, window or tab' },
  'Web Audio API': { name: 'Web Audio API', what: 'decodes, mixes and analyses audio for waveforms' },
  'Web Worker': { name: 'Web Workers', what: 'background threads so heavy work does not freeze the page' },
  'Web Worker (sandboxed RegExp)': { name: 'Web Worker', what: 'runs your regular expression in a background thread so a catastrophic pattern cannot freeze the page' },
  gifenc: { name: 'gifenc', what: 'a fast GIF encoder with palette quantization' },
  heic2any: { name: 'heic2any', what: 'decodes Apple HEIC/HEIF photos in the browser' },
  jsdiff: { name: 'jsdiff', what: 'the Myers diff algorithm for line, word and character differences' },
  'Canvas 2D': { name: 'Canvas 2D', what: 'the browser’s hardware-accelerated 2D drawing surface' },
  'FileReader API': { name: 'FileReader', what: 'reads files straight from your disk into memory' },
  'Plain TypeScript': { name: 'Plain TypeScript', what: 'small, dependency-free code that runs instantly in your tab' },
}

/** Engines that download something large the first time they are used. */
export const HEAVY_ENGINES = ['ffmpeg.wasm', 'Tesseract.js', 'IMG.LY background removal', 'Transformers.js (ONNX)']

type Override = Pick<ToolMeta, 'how' | 'steps' | 'tips' | 'faq' | 'related' | 'inputs' | 'outputs'>

const CAT_DEFAULTS: Partial<Record<Category, { steps: (t: ToolMeta) => string[]; tips: string[]; inputs?: string[] }>> = {
  privacy: {
    steps: (t) => [`Open ${t.name} and add your file or text.`, 'Pick the options in the side panel.', 'Run it and check the result on screen.', 'Download or copy the result.'],
    tips: ['Nothing is uploaded, so you can use these tools on sensitive files.', 'Share passwords a different way than the file itself.', 'Always check a cleaned or redacted file before you send it.'],
  },
  geo: {
    steps: (t) => [`Drop a GPX, TCX, KML or GeoJSON file onto ${t.name}.`, 'Check the track on the map.', 'Adjust the options in the side panel.', 'Download the result.'],
    tips: ['The map has no background tiles by default, so your location area is not sent anywhere. Turn on the map background if you want street detail.', 'Most watches and apps export GPX. Look for Export or Share in the activity menu.'],
    inputs: ['GPX', 'TCX', 'KML', 'GEOJSON'],
  },
  office: {
    steps: (t) => [`Drop your file onto ${t.name}.`, 'Pick sheets, columns or options in the side panel.', 'Check the preview.', 'Download the new file. Your original is not changed.'],
    tips: ['Excel, ODS and CSV all work. Formulas are read as their last saved values.', 'For CSV files with odd characters, save them as UTF-8 first.'],
    inputs: ['XLSX', 'XLS', 'ODS', 'CSV', 'DOCX'],
  },
  science: {
    steps: (t) => [`Type your input into ${t.name}, or pick an example.`, 'The result updates as you type.', 'Copy the result or download it.'],
    tips: ['Exact fractions are used where rounding would give wrong answers.', 'Every tool works offline once the page has loaded.'],
  },
  creator: {
    steps: (t) => [`Open ${t.name} and add your media or text.`, 'Pick a size, style and colours.', 'Preview the result.', 'Download it and post it.'],
    tips: ['Video tools encode on your device, so short clips finish much faster.', 'Square and 4:5 sizes take the most space in feeds. 9:16 is for stories, reels and shorts.'],
  },
  study: {
    steps: (t) => [`Open ${t.name} and type or paste your content, or pick an example.`, 'Adjust the options in the side panel.', 'Check the preview.', 'Download the PDF or file, or study right on the page.'],
    tips: ['Printables are real PDFs sized for A4 or US Letter, so they print sharp at home or school.', 'Cards, quizzes and notes stay in your browser. Nothing is sent to a server.'],
  },
  web: {
    steps: (t) => [`Open ${t.name} and fill in your site details, or paste your page source.`, 'Check the warnings and the live output.', 'Pick the server or format you use.', 'Copy or download the file and put it on your site.'],
    tips: ['Nothing is fetched from your site, so these tools also work for staging sites and pages behind a login.', 'Test changes on a staging copy of your site first.'],
  },
  time: {
    steps: (t) => [`Open ${t.name} and enter your dates, times or schedule.`, 'Adjust the options in the side panel.', 'Check the result.', 'Download the calendar file, PDF or CSV.'],
    tips: ['Times use your device time zone. Calendar files store times in UTC, so everyone sees their own local time.', 'ICS files open in Google Calendar, Apple Calendar and Outlook.'],
    inputs: ['ICS', 'CSV', 'XLSX'],
  },
  finance: {
    steps: (t) => [`Open ${t.name} and drop your bank file, receipt or numbers.`, 'Check what was read and fix any column or value.', 'Pick the output you want.', 'Download it. Nothing was uploaded.'],
    tips: ['Bank files hold account numbers, so tools that run on your device are the safe choice.', 'Always compare totals with the original statement before you file anything.', 'OFX and QIF files import into most money apps.'],
  },
  health: {
    steps: (t) => [`Open ${t.name} and drop your workout or health file, or type your numbers.`, 'Set your age, max heart rate or units in the side panel.', 'Read the results and charts.', 'Download CSV, GPX or Excel.'],
    tips: ['Most watches can export FIT files from their app or website.', 'Health files reveal a lot about you. Here they never leave your device.', 'These tools give training information, not medical advice.'],
  },
  pdf: {
    steps: (t) => [`Drop your PDF onto the ${t.name} area, or click to choose it.`, 'Wait a moment while page thumbnails render locally.', 'Choose the pages and options you need. Previews update as you go.', 'Press the main action button and download the finished PDF.'],
    tips: ['Encrypted PDFs must be unlocked first with Unlock PDF.', 'Large scanned PDFs are mostly images. Compress PDF shrinks them the most.', 'Your original file is never modified; you always download a new copy.'],
    inputs: ['PDF'],
  },
  convert: {
    steps: (t) => [`Open ${t.name} and add your source file (or paste content where offered).`, 'Adjust page size, quality or layout options in the side panel.', 'Check the live preview.', 'Convert and download the result.'],
    tips: ['Conversions run entirely in your tab, so very large files depend on your device’s memory.', 'For best fidelity, start from the original digital file rather than a scan.'],
  },
  image: {
    steps: (t) => [`Drop one or more images onto ${t.name}.`, 'Tune the options. The before/after preview updates live.', 'Process the batch.', 'Download a single image, or everything as a ZIP.'],
    tips: ['Most image tools accept many files at once.', 'WebP and AVIF give much smaller files than JPG at the same visual quality.', 'Set a default image quality in Settings. Tools that do not choose their own quality use it.'],
    inputs: ['JPG', 'PNG', 'WEBP', 'GIF', 'BMP'],
  },
  video: {
    steps: (t) => [`Drop a video onto ${t.name}.`, 'The first run downloads the ffmpeg engine (about 30 MB, once).', 'Set your range, format or quality options.', 'Process it (progress is shown live), then download.'],
    tips: ['Shorter clips and lower resolutions process much faster.', 'Processing speed depends on your CPU; plug in laptops for long jobs.', 'Keep the tab in the foreground while encoding.'],
    inputs: ['MP4', 'WEBM', 'MOV', 'MKV', 'AVI'],
  },
  audio: {
    steps: (t) => [`Drop an audio file onto ${t.name} (or start recording).`, 'Adjust the options and preview playback.', 'Process the audio.', 'Download in the format you picked.'],
    tips: ['WAV is lossless but large; MP3/AAC/OGG are compact for sharing.', 'Engines load on first use and are cached afterwards.'],
    inputs: ['MP3', 'WAV', 'OGG', 'AAC', 'FLAC', 'M4A'],
  },
  dev: {
    steps: (t) => [`Open ${t.name} and paste or type your input.`, 'Results update instantly as you type.', 'Tweak options such as format, indentation or algorithm.', 'Copy the output or download it as a file.'],
    tips: ['Everything is computed locally. Safe for tokens, keys and private data.', 'Use Ctrl/⌘ + K to jump between developer tools quickly.'],
  },
  text: {
    steps: (t) => [`Open ${t.name} and paste your text.`, 'Choose an operation or option.', 'Review the live result.', 'Copy it or download it.'],
    tips: ['Text never leaves your device, so it is safe for drafts and private notes.'],
  },
  design: {
    steps: (t) => [`Open ${t.name}.`, 'Adjust the controls. The preview updates in real time.', 'Fine-tune values until it looks right.', 'Copy the generated code or export the asset.'],
    tips: ['Generated CSS works in every modern browser.', 'Exports are produced locally, so you can work offline.'],
  },
}

const O: Record<string, Override> = {
  'merge-pdf': {
    steps: ['Drop two or more PDFs (add more at any time with “Add files”).', 'Drag the cards to set the order, or sort by name.', 'Optionally rotate a file or limit it to a page range.', 'Press Merge and download the combined PDF.'],
    tips: ['Use page ranges like “1-3, 7” to take only the pages you need from each file.', 'Bookmarks are not carried over; add page numbers afterwards if you need references.'],
    faq: [{ q: 'Is there a limit on how many PDFs I can merge?', a: 'No hard limit. The practical limit is your device’s memory. Hundreds of normal documents are fine.' }],
    related: ['organize-pdf', 'compress-pdf', 'pdf-page-numbers', 'split-pdf'], outputs: ['PDF'],
  },
  'split-pdf': { steps: ['Drop a PDF.', 'Choose a mode: custom ranges, every N pages, or one file per page.', 'Review the preview of the resulting parts.', 'Split and download the parts (multiple files come as a ZIP).'], related: ['extract-pdf-pages', 'merge-pdf', 'delete-pdf-pages'], outputs: ['PDF', 'ZIP'] },
  'compress-pdf': {
    how: 'Compress PDF rewrites the document with compressed object streams and, for image-heavy pages, re-encodes embedded images at a lower resolution and quality. Text and vector content stay sharp. Everything happens in your tab with pdf-lib and PDF.js.',
    tips: ['Scanned documents shrink the most. Text-only PDFs are often already small.', 'If the result is larger than the original, keep the original: it was already optimized.', 'For upload portals with strict limits, try the strongest preset, then check readability.'],
    faq: [{ q: 'Will compression make text blurry?', a: 'Real text stays vector and sharp. Only embedded images are downsampled, depending on the preset you pick.' }],
    related: ['pdf-grayscale', 'merge-pdf', 'image-compressor'], outputs: ['PDF'],
  },
  'sign-pdf': {
    steps: ['Drop the PDF you need to sign.', 'Create a signature: draw it, type it in a handwriting font, or upload an image.', 'Click the page to place it; drag and resize as needed. Add dates or initials too.', 'Apply and download the signed PDF.'],
    tips: ['Your signature is drawn and embedded locally. It is never uploaded.', 'This creates a visual signature, not a certificate-based digital signature.'],
    faq: [{ q: 'Is this legally binding?', a: 'Visual e-signatures are accepted for many everyday agreements, but requirements vary by country and document. For regulated documents, use a certificate-based signing service.' }],
    related: ['fill-pdf-form', 'flatten-pdf', 'edit-pdf'],
  },
  'protect-pdf': { steps: ['Drop a PDF.', 'Enter an open password (and optionally an owner password).', 'Choose permissions such as printing or copying.', 'Encrypt and download.'], tips: ['Store the password safely. Nobody, including OpenFile, can recover it.'], related: ['unlock-pdf', 'redact-pdf', 'pdf-watermark'] },
  'unlock-pdf': { tips: ['You must know the password; this tool removes it from a copy you are allowed to open, it does not crack passwords.'], related: ['protect-pdf', 'compress-pdf'] },
  'redact-pdf': {
    how: 'Redact PDF finds sensitive text (emails, phone numbers, card numbers) with pattern matching on text extracted by PDF.js, lets you add boxes manually, and then flattens each page to an image so the hidden content is truly removed, not just covered.',
    tips: ['Always use the flatten step: simply drawing a black box over text does not remove it.', 'Check every page in the preview before downloading.'],
    related: ['protect-pdf', 'flatten-pdf', 'blur-faces'],
  },
  'ocr-pdf': {
    how: 'OCR PDF renders each page with PDF.js and runs Tesseract (compiled to WebAssembly) on it in a background worker. The recognized text can be copied, downloaded, or embedded as an invisible layer to make the PDF searchable.',
    tips: ['Choose the document’s language for much better accuracy.', 'Higher render scale improves accuracy for small print at the cost of speed.', 'Straight, high-contrast scans give the best results.'],
    faq: [{ q: 'Why is the first run slow?', a: 'The Tesseract engine and the language data are downloaded once, then cached. Later runs start immediately.' }],
    related: ['pdf-to-text', 'compress-pdf', 'image-to-pdf'],
  },
  'edit-pdf': { steps: ['Drop a PDF.', 'Pick a tool from the toolbar: text, shapes, highlight, image or freehand.', 'Click on the page to add elements; drag to move and use handles to resize.', 'Save and download the edited PDF.'], related: ['sign-pdf', 'redact-pdf', 'pdf-watermark'] },
  'organize-pdf': { steps: ['Drop a PDF to see every page as a thumbnail.', 'Drag thumbnails to reorder; rotate, duplicate or delete pages.', 'Insert pages from other PDFs if you need them.', 'Export the reorganized PDF.'], related: ['merge-pdf', 'delete-pdf-pages', 'rotate-pdf'] },
  'invoice-generator': { steps: ['Fill in your business and client details.', 'Add line items with quantity, rate and tax.', 'Pick a currency and template; totals are calculated automatically.', 'Download the invoice as a PDF.'], tips: ['Your details are kept only in this browser so the next invoice is faster.'], related: ['resume-builder', 'sign-pdf', 'pdf-to-image'] },
  'resume-builder': { tips: ['ATS-friendly templates use real text, so applicant-tracking systems can read them.', 'Keep it to one or two pages.'], related: ['invoice-generator', 'word-to-pdf', 'compress-pdf'] },
  'pdf-to-image': { steps: ['Drop a PDF.', 'Choose PNG, JPG or WEBP and a DPI (150 for screens, 300 for print).', 'Select which pages to export.', 'Download one image or all pages as a ZIP.'], related: ['image-to-pdf', 'pdf-to-text', 'compress-pdf'], outputs: ['PNG', 'JPG', 'WEBP', 'ZIP'] },
  'image-to-pdf': { steps: ['Drop your images (JPG, PNG, WEBP, HEIC).', 'Drag to reorder them.', 'Pick a page size, orientation and margins.', 'Create and download the PDF.'], related: ['merge-pdf', 'compress-pdf', 'image-compressor'], outputs: ['PDF'] },
  'pdf-to-word': { how: 'PDF to Word extracts text runs and their positions with PDF.js, rebuilds paragraphs and headings, and writes a real .docx with the docx library. It works best on digital (non-scanned) PDFs.', tips: ['For scanned PDFs, run OCR PDF first.', 'Complex multi-column layouts may need light cleanup in Word.'], related: ['word-to-pdf', 'pdf-to-text', 'ocr-pdf'], outputs: ['DOCX'] },
  'word-to-pdf': { how: 'Word to PDF converts the .docx to clean HTML with mammoth, lays it out on pages, and renders it into a PDF with html2canvas and jsPDF, all locally.', tips: ['Uncommon fonts fall back to similar web fonts.'], related: ['pdf-to-word', 'markdown-to-pdf', 'compress-pdf'], inputs: ['DOCX'], outputs: ['PDF'] },
  'html-to-pdf': { faq: [{ q: 'How does converting a URL work?', a: 'On the Vercel deployment, the optional /api/fetch-page route fetches the public page’s HTML (only the URL is sent). On static hosts you can paste HTML directly instead.' }], related: ['markdown-to-pdf', 'text-to-pdf', 'screenshot-studio'] },
  'heic-converter': { inputs: ['HEIC', 'HEIF'], outputs: ['JPG', 'PNG', 'WEBP'], related: ['image-converter', 'image-compressor', 'image-to-pdf'] },
  'image-compressor': {
    how: 'Image Compressor decodes each image to a canvas, optionally resizes it with high-quality resampling, and re-encodes it as JPG, WebP, AVIF or a palette-reduced PNG. You see the before/after and the exact savings for every file.',
    tips: ['Quality 75 to 85 is visually lossless for most photos.', 'Converting PNG photos to WebP often saves 70% or more.', 'Set a max width. Most web images never need more than 1920px.'],
    related: ['image-resizer', 'image-converter', 'image-metadata-remover'],
  },
  'image-converter': { tips: ['AVIF encoding depends on browser support; WebP works everywhere modern.', 'Converting to JPG flattens transparency onto a background color.'], outputs: ['JPG', 'PNG', 'WEBP', 'AVIF', 'BMP', 'GIF', 'ICO'], related: ['image-compressor', 'heic-converter', 'image-resizer'] },
  'background-remover': {
    how: 'Background Remover runs a segmentation model (from @imgly/background-removal) on your device with ONNX Runtime Web, using WebGPU when available. It predicts a mask for the subject, then you can keep transparency, fill a color, or blur the original background.',
    tips: ['Photos with a clear subject and contrasting background give the cleanest edges.', 'Export as PNG or WebP to keep transparency.'],
    faq: [{ q: 'Why does the first use take longer?', a: 'The AI model (about 40 MB) downloads once and is cached by your browser. Your image is never uploaded.' }],
    related: ['image-upscaler', 'screenshot-studio', 'image-cropper'],
  },
  'image-upscaler': { how: 'Image Upscaler runs a Swin2SR super-resolution model with Transformers.js on WebGPU (or WASM as a fallback), processing the image tile by tile to enlarge it while restoring detail.', tips: ['Upscaling small images is fastest; very large images may take a while on CPU.', 'WebGPU-capable browsers are dramatically faster.'], related: ['background-remover', 'image-resizer', 'video-upscaler'] },
  'image-metadata-remover': { how: 'The tool reads EXIF, GPS and XMP metadata with exifr so you can inspect it, then re-encodes the pixels through a canvas, which writes a clean file without any of the original metadata.', tips: ['Strip GPS data before posting photos publicly. It can reveal where you live.'], related: ['image-compressor', 'image-converter', 'blur-faces'] },
  'screenshot-studio': { related: ['background-remover', 'image-cropper', 'add-text-to-image'] },
  'video-trimmer': { tips: ['Pick the “Fast · lossless” mode to cut without re-encoding. It is nearly instant (cuts snap to keyframes).', 'Re-encoding gives frame-accurate cuts.'], related: ['video-compressor', 'video-to-gif', 'merge-videos'] },
  'video-compressor': { how: 'Video Compressor runs FFmpeg (compiled to WebAssembly) in a worker and re-encodes your clip with H.264 at a quality level (CRF) and optional lower resolution, so files shrink dramatically while staying watchable.', tips: ['720p is plenty for messaging apps and email.', 'Lower frame rates (e.g. 24 fps) also cut size for screen recordings.'], related: ['video-trimmer', 'video-converter', 'extract-audio'] },
  'video-to-gif': { tips: ['Keep GIFs short (under 6 seconds) and narrow (480px) for small files.', 'Lower frame rates (10 to 15 fps) shrink GIFs a lot.'], related: ['gif-maker', 'video-trimmer', 'video-frames'] },
  'screen-recorder': { how: 'Screen Recorder captures a screen, window or tab with getDisplayMedia, optionally composites your webcam as a bubble on a canvas, mixes microphone and system audio with Web Audio, and records with MediaRecorder. The recording stays in your browser until you save it.', tips: ['System audio capture is available for tabs and on some platforms only (best on Chromium).', 'Screen capture is not available on most mobile browsers.'], related: ['webcam-recorder', 'video-trimmer', 'video-compressor'] },
  'audio-transcriber': { how: 'Audio Transcriber decodes your audio to 16 kHz mono, then runs OpenAI’s Whisper model (tiny or base) on-device with Transformers.js in a Web Worker, using WebGPU when available. It outputs plain text and timestamped SRT/VTT subtitles.', tips: ['The tiny model (~40 MB) is fast; base (~80 MB) is more accurate with accents and noise.', 'Pick the spoken language if you know it. Auto-detect is slower.'], faq: [{ q: 'Is my recording sent to OpenAI?', a: 'No. The open Whisper weights are downloaded to your browser and run locally. The audio never leaves your device.' }], related: ['voice-recorder', 'extract-audio', 'audio-converter'] },
  'text-to-speech': { tips: ['Available voices depend on your operating system and browser.'], related: ['audio-transcriber', 'voice-recorder'] },
  'json-formatter': { tips: ['Errors show the exact line and column.', 'Switch to tree view to explore large payloads.'], related: ['yaml-json', 'jwt-decoder', 'table-converter'] },
  'jwt-decoder': { tips: ['Decoding never verifies the signature unless you provide the secret/key. Never trust an unverified token.', 'Safe for production tokens: nothing is sent anywhere.'], related: ['base64', 'hash-generator', 'json-formatter'] },
  'hash-generator': { tips: ['Use SHA-256 to verify downloads; MD5 and SHA-1 are not collision-resistant.'], related: ['password-generator', 'uuid-generator', 'base64'] },
  'qr-generator': { tips: ['Keep strong contrast between foreground and background so phones can scan it.', 'Use error correction “H” when adding a logo.'], related: ['qr-scanner', 'barcode-generator', 'url-encoder'] },
  'regex-tester': { related: ['regex-builder', 'text-cleaner', 'diff-checker'] },
  'curl-to-code': { related: ['json-formatter', 'url-encoder', 'jwt-decoder'] },
  'diff-checker': { related: ['compare-pdf', 'text-cleaner', 'word-counter'] },
  'sketch-board': {
    how: 'Sketch Whiteboard is an infinite canvas rendered with Canvas 2D, with hand-drawn (rough) or clean styles. Boards autosave in your browser’s local storage, can be exported as PNG, SVG or a .openfile.json scene, and can be shared as a compressed link that contains the whole drawing. There is no server.',
    tips: ['Press ? on the board to see every shortcut.', 'Add frames (F) and press Alt+P to present them as slides.', 'Save to a file (Ctrl+S) for backups. Browser storage can be cleared.'],
    related: ['erd-diagram', 'screenshot-studio', 'color-palette'],
  },
  'favicon-generator': { related: ['svg-optimizer', 'image-resizer', 'placeholder-image'] },
  'color-palette': { related: ['color-converter', 'gradient-generator', 'color-picker-image'] },
}

const GENERIC_FAQ: { q: string; a: string }[] = [
  { q: 'Are my files uploaded?', a: 'No. This tool runs entirely in your browser tab. Files are read from your disk into memory and the result is generated locally.' },
  { q: 'Is it free? Are there limits or watermarks?', a: 'Free and open source (MIT). There are no file-size caps, daily quotas, accounts or watermarks.' },
  { q: 'Does it work offline?', a: 'Yes, once the page (and any engine it needs) has loaded, it keeps working without a connection thanks to the service worker cache.' },
]

export interface ToolGuide {
  how: string
  steps: string[]
  tips: string[]
  faq: { q: string; a: string }[]
  related: ToolMeta[]
  engines: EngineInfo[]
  engineKeys: string[]
  firstUse: string | null
  inputs?: string[]
  outputs?: string[]
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

export function toolGuide(tool: ToolMeta): ToolGuide {
  const o = O[tool.slug] ?? {}
  const cat = CAT_DEFAULTS[tool.category] ?? { steps: (t: ToolMeta) => [`Open ${t.name} and add your file or input.`, 'Pick the options you need. Everything runs on your device.', 'Press the main button and download the result.'], tips: ['Nothing is uploaded. Your files stay in this browser tab.'] }
  const engineKeys = ENGINES[tool.slug] ?? ['Plain TypeScript']
  const engines = engineKeys.map((k) => ENGINE_INFO[k] ?? { name: k, what: k })
  const heavy = engineKeys.filter((k) => HEAVY_ENGINES.includes(k))
  const firstUse = heavy.length ? heavy.map((k) => `${ENGINE_INFO[k].name}: ${ENGINE_INFO[k].download}`).join(' · ') : null
  const how = tool.how ?? o.how ?? `${tool.name} runs entirely in your browser. ${tool.desc} Under the hood it uses ${list(engines.map((e) => `${e.name} (${e.what})`))}. Your files are read into this tab’s memory, processed on your own CPU${engineKeys.some((k) => k.includes('Transformers') || k.includes('IMG.LY')) ? '/GPU' : ''}, and handed back to you as a download. Nothing is sent to a server.`
  const steps = tool.steps ?? o.steps ?? cat.steps(tool)
  const tips = tool.tips ?? o.tips ?? cat.tips
  const faq = [...(tool.faq ?? []), ...(o.faq ?? []), ...(firstUse && !(o.faq ?? []).some((f) => /first/i.test(f.q)) ? [{ q: 'Why is the first run slower?', a: `This tool needs a processing engine that is downloaded once and then cached: ${firstUse}. Only the engine is downloaded. Your file never leaves your device.` }] : []), ...GENERIC_FAQ]
  const relSlugs = tool.related ?? o.related ?? []
  const picked = relSlugs.map(toolBySlug).filter((t): t is ToolMeta => !!t && t.slug !== tool.slug)
  const fill = TOOLS.filter((t) => t.category === tool.category && t.slug !== tool.slug && !picked.includes(t)).sort((a, b) => Number(!!b.popular) - Number(!!a.popular))
  const related = [...picked, ...fill].slice(0, 4)
  return { how, steps, tips, faq, related, engines, engineKeys, firstUse, inputs: tool.inputs ?? o.inputs ?? cat.inputs, outputs: tool.outputs ?? o.outputs }
}

export const categoryName = (c: Category) => CATEGORIES.find((x) => x.id === c)?.name ?? c
