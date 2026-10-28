# Writing an OpenFile tool

Every tool is one React component: `src/tools/<category>/<slug>.tsx` with a **default export** (no props).
The registry (`src/tools/registry.ts`) already lists name/description/icon; the ToolPage renders the title, breadcrumb and badges — your component renders only the working UI underneath.

## Rules
- 100% client-side. No uploads. Use Web APIs, Canvas, WASM and the installed libraries.
- Use the UI kit in `src/components/ui.tsx`: `Button, Card, Field, Label, Input, Textarea, Select, Slider, Switch, Segmented, Tabs, Badge, Progress, Spinner, CopyButton, Dropzone, FileChip, ResultCard, ToolGrid, Empty, ErrorNote, useJob, cn`. Toasts: `toast(msg, 'success'|'error'|'info')` from `@/components/toast`.
- Layout pattern for file tools: show `<Dropzone/>` until a file is chosen, then `<ToolGrid main={preview/list} side={options + primary action}/>`, then `<ResultCard blob filename originalSize/>` when done. Always offer "Start over".
- Helpers: `@/lib/files` (downloadBlob, formatBytes, renameExt, baseName, zipFiles, loadImage, canvasToBlob, createCanvas, readDataUrl, parsePageRanges, copyText, MIME),
  `@/lib/pdf` (pdfjs, openPdfJs, renderPage, pageText, allText, loadPdfLib, pdfBlob, rasterizePdf, PDFDocument, rgb, degrees, StandardFonts),
  `@/lib/ffmpeg` (getFFmpeg, runFFmpeg({inputs,args,output,onProgress,onLog}), extOf),
  `@/components/PdfThumbs` (usePdfThumbs(file), PdfPageGrid({file, selected, onToggle, rotations, labels})).
- Theme tokens (Tailwind): `bg-bg bg-surface bg-surface-2 border-border text-fg text-muted text-accent bg-accent text-success text-danger text-warn bg-gradient-brand text-gradient glass checker font-display font-mono`. Works in dark and light mode — never hard-code white/black backgrounds for UI chrome.
- Long jobs: use `useJob()` → `{busy, progress, error, run}` and show `<Progress value={progress} label="…"/>`.
- Make it polished: real previews (before/after, thumbnails, waveforms), sensible defaults, keyboard-friendly, mobile-responsive, helpful empty states, error messages that say what to do.
- Heavy libs must be **dynamically imported** inside handlers (`const X = await import('lib')`) so the tool chunk stays small.

## Installed libraries
pdf-lib, @cantoo/pdf-lib (supports encryption: `PDFDocument.load(bytes,{password})`, `doc.encrypt({userPassword, ownerPassword, permissions})`), pdfjs-dist, jszip, fflate, qrcode, jsbarcode, tesseract.js, @ffmpeg/ffmpeg + @ffmpeg/util (via lib/ffmpeg), marked, dompurify, diff, lucide-react, heic2any, papaparse, xlsx, jspdf, html2canvas, framer-motion, crypto-js, docx, mammoth, pptxgenjs, imagetracerjs, gifenc, svgo (use `svgo/browser`), @imgly/background-removal, @huggingface/transformers, js-yaml, sql-formatter, cronstrue, exifr, signature_pad, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, react-router-dom.
Lucide note: brand icons (Github etc.) are not in lucide; use `Github` from `@/components/Logo`.
