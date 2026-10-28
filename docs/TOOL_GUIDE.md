# Writing an OpenFile tool

Every tool is one React component: `src/tools/<category>/<slug>.tsx` with a **default export** (no props).
The registry (`src/tools/registry.ts`) already lists name/description/icon; the ToolPage renders the title, breadcrumb and badges, your component renders only the working UI underneath.

## Categories
<!-- categories:start -->
16 categories, 360 tools. The `category` field of a tool must be one of these ids, and the tool file goes in `src/tools/<id>/<slug>.tsx`.

| Id | Studio | Tools | What it covers |
|---|---|--:|---|
| `pdf` | 📄 PDF Tools | 58 | Merge, split, sign, protect and edit PDFs |
| `convert` | 🔄 Convert | 31 | Move between PDF, Office, Markdown, HTML and images |
| `image` | 🖼️ Image | 55 | Compress, resize, crop, remove backgrounds, upscale |
| `video` | 🎬 Video | 36 | Trim, compress, convert, GIF and record |
| `audio` | 🎧 Audio | 21 | Edit, convert, record and transcribe |
| `dev` | 🧑‍💻 Developer | 60 | JSON, JWT, regex, hashes, cURL and more |
| `text` | 📝 Text & Data | 42 | Diff, count, convert tables, format text |
| `design` | 🖌️ Design | 16 | Colors, CSS, favicons, SVG, whiteboards |
| `data` | 📊 Data | 11 | CSV, Excel, JSON, SQLite, Parquet, maps and GPS |
| `ai` | 🤖 AI | 7 | On-device AI for images, text and documents |
| `3d` | 🧊 3D | 5 | View and convert GLB, GLTF, OBJ, STL, PLY and more |
| `archive` | 🗜️ Archives | 4 | Open and create ZIP, 7Z, TAR, GZ and RAR |
| `ebook` | 📚 eBooks | 4 | Read and convert EPUB, MOBI, FB2 and comics |
| `font` | 🔤 Fonts | 3 | Convert, inspect and subset TTF, OTF, WOFF |
| `cad` | 📐 CAD | 2 | View and convert DXF and other drawings |
| `subtitle` | 💬 Subtitles | 5 | Convert, sync and edit SRT, VTT, ASS |
<!-- categories:end -->

New entries can go in `src/tools/registry.ts` or in one of the batch files (`src/tools/batches/bN.ts`, each exporting `BATCH_N`), which the registry spreads into `TOOLS`. Shared logic for a batch goes in `src/lib/bN/` and its tests in `scripts/tests/bN/`. After adding or renaming a tool, run `node scripts/gen-readme-catalog.mjs` to refresh the README catalog, the stats artwork and this list.

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
Docs pages are Markdown files in `src/pages/docs/content/` (the original pages stay in `src/docs/pages/` and are reused), listed in `src/pages/docs/nav.ts`, one entry per line. `scripts/postbuild.mjs` reads both nav files to pre-render routes and the sitemap.

## Docs that keep themselves current
- The [tools reference](https://openfile-studio.vercel.app/docs/tools), the [format matrix](https://openfile-studio.vercel.app/docs/formats) and the per-category guides are generated from the registry, so a new tool shows up on its own. Set `inputs` and `outputs` to place it in the format matrix.
- Shortcuts, AI models, manifest file types, test counts, the changelog and the roadmap come from `src/pages/docs/generated.json`, written by `scripts/gen-docs.mjs` before every build. Run `node scripts/gen-docs.mjs` after adding tools, then read the docs for anything new that deserves a sentence.
- In docs Markdown, write `{{TOOL_COUNT}}`-style placeholders and `::` directives instead of typing numbers or lists. Escape a placeholder you want to show literally as `{{=NAME}}`.
- Full keyboard reference: [SHORTCUTS.md](SHORTCUTS.md). AI models: [AI.md](AI.md). Privacy details: [PRIVACY.md](PRIVACY.md). Problems: [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
