# Writing an OpenFile tool

Every tool is one React component: `src/tools/<category>/<slug>.tsx` with a **default export** (no props).
The registry (`src/tools/registry.ts`) already lists name/description/icon; the ToolPage renders the title, breadcrumb and badges, your component renders only the working UI underneath.

## Rules
- 100% client-side. No uploads. Use Web APIs, Canvas, WASM and the installed libraries.
- Use the UI kit in `src/components/ui.tsx`: `Button, Card, Field, Label, Input, Textarea, Select, Slider, Switch, Segmented, Tabs, Badge, Progress, Spinner, CopyButton, Dropzone, FileChip, ResultCard, ToolGrid, Empty, ErrorNote, useJob, cn`. Toasts: `toast(msg, 'success'|'error'|'info')` from `@/components/toast`.
- Layout pattern for file tools: show `<Dropzone/>` until a file is chosen, then `<ToolGrid main={preview/list} side={options + primary action}/>`, then `<ResultCard blob filename originalSize/>` when done. Always offer "Start over".
- Helpers: `@/lib/files` (downloadBlob, formatBytes, renameExt, baseName, zipFiles, loadImage, canvasToBlob, createCanvas, readDataUrl, parsePageRanges, copyText, MIME),
  `@/lib/pdf` (pdfjs, openPdfJs, renderPage, pageText, allText, loadPdfLib, pdfBlob, rasterizePdf, PDFDocument, rgb, degrees, StandardFonts),
  `@/lib/ffmpeg` (getFFmpeg, runFFmpeg({inputs,args,output,onProgress,onLog}), extOf),
  `@/components/PdfThumbs` (usePdfThumbs(file), PdfPageGrid({file, selected, onToggle, rotations, labels})).
- Theme tokens (Tailwind): `bg-bg bg-surface bg-surface-2 border-border text-fg text-muted text-accent bg-accent text-on-accent text-glow text-success text-danger text-warn bg-gradient-brand text-gradient glass checker skeleton font-display font-mono`. They work in every theme (Black, Dark, Sun and System) and with every accent, so never hard-code white or black backgrounds for UI chrome. Put `text-on-accent` (not `text-white`) on anything filled with the accent.
- Brand palette: gold `#F5A524` (glow `#FFB224`) on black, with teal `#14B8A6`, cyan `#22D3EE`, emerald `#10B981`, sky `#38BDF8`, orange `#F97316`, lime `#84CC16`. Red `#EF4444` is for errors only. Do not use purple, violet, indigo, magenta, pink or fuchsia anywhere.
- Motion kit (`@/components/motion`): `Reveal`, `Stagger` and `StaggerItem`, `Magnetic`, `useTilt`, `spotlightMove` (with the `spotlight` class), `Counter`, `Marquee`, `Aurora`, `GoldRing`. Animate only transform and opacity; everything respects the reduced-motion setting.
- Preview videos: drop `public/media/tools/<slug>.mp4` and `<slug>.jpg` and list them in `public/media/tools/index.json` (`{ "<slug>": { "video": "<slug>.mp4", "poster": "<slug>.jpg", "duration": 12 } }`). The tool page and the tool card pick them up automatically and hide when there is no entry.
- Long jobs: use `useJob()` → `{busy, progress, error, run}` and show `<Progress value={progress} label="…"/>`.
- Writing: plain, simple words in a human tone. No em dashes, no en dashes used as dashes, and no exclamation marks in any text the user sees. Use commas, periods, colons, parentheses or "|" instead.
- Make it polished: real previews (before/after, thumbnails, waveforms), sensible defaults, keyboard-friendly, mobile-responsive, helpful empty states, error messages that say what to do.
- Heavy libs must be **dynamically imported** inside handlers (`const X = await import('lib')`) so the tool chunk stays small.

## Installed libraries
pdf-lib, @cantoo/pdf-lib (supports encryption: `PDFDocument.load(bytes,{password})`, `doc.encrypt({userPassword, ownerPassword, permissions})`), pdfjs-dist, jszip, fflate, qrcode, jsbarcode, tesseract.js, @ffmpeg/ffmpeg + @ffmpeg/util (via lib/ffmpeg), marked, dompurify, diff, lucide-react, heic2any, papaparse, xlsx, jspdf, html2canvas, framer-motion, crypto-js, docx, mammoth, pptxgenjs, imagetracerjs, gifenc, svgo (use `svgo/browser`), @imgly/background-removal, @huggingface/transformers, js-yaml, sql-formatter, cronstrue, exifr, signature_pad, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, react-router-dom.
Lucide note: brand icons (Github etc.) are not in lucide; use `Github` from `@/components/Logo`.

## Guide content (optional)
Every tool page shows "How it works", steps, tips, FAQ and related tools, and the docs at `/docs/tools/<category>` list every tool. Content is generated from the category and the engines in `src/tools/engines.ts`, with hand-written overrides in `src/tools/guides.ts`. You can also set these optional registry fields: `how`, `steps`, `tips`, `faq`, `related`, `inputs`, `outputs`. New engines also need an entry in `ENGINE_INFO` (guides.ts).
Docs pages are Markdown files in `src/docs/pages/`, listed in `src/docs/nav.ts` (one entry per line; `scripts/postbuild.mjs` reads it to pre-render routes and the sitemap).
