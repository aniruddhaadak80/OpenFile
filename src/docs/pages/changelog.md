# Changelog

All notable changes to OpenFile. Dates are in YYYY-MM-DD.

> [!NOTE]
> OpenFile currently has **{{TOOL_COUNT}} tools in {{CATEGORY_COUNT}} categories**. Counts in the release notes below are as of each release.

## v2.0.0 (2026-10-28)

At release the catalog grew to **329 tools in 16 categories**, up from 117 tools in 8. Every tool still runs in your browser tab with zero uploads.

### Added

- **Eight new categories**: Data, AI, 3D, Archives, eBooks, Fonts, CAD and Subtitles.
- **3D**: a [3D model viewer](https://openfile-studio.vercel.app/3d-viewer) for GLB, glTF, OBJ, STL, PLY, FBX and more, a [3D converter](https://openfile-studio.vercel.app/3d-converter), a [GLB and glTF optimizer](https://openfile-studio.vercel.app/gltf-optimizer), an [STL inspector](https://openfile-studio.vercel.app/stl-inspector) and an [image to lithophane](https://openfile-studio.vercel.app/lithophane-maker) maker.
- **Fonts**: [convert](https://openfile-studio.vercel.app/font-converter) TTF, OTF, WOFF and WOFF2, [inspect](https://openfile-studio.vercel.app/font-viewer) glyphs and metrics, and [subset](https://openfile-studio.vercel.app/font-subsetter) fonts for the web.
- **Archives**: [open](https://openfile-studio.vercel.app/archive-extractor) ZIP, 7Z, RAR, TAR and more, [create](https://openfile-studio.vercel.app/archive-creator) archives (with AES-256 ZIP passwords), [convert](https://openfile-studio.vercel.app/archive-converter) between them, and [compress single files](https://openfile-studio.vercel.app/file-compressor) with Gzip, Brotli, Zstd or XZ.
- **eBooks**: an [e-book reader](https://openfile-studio.vercel.app/ebook-reader), an [e-book converter](https://openfile-studio.vercel.app/ebook-converter) (EPUB, MOBI, AZW3, FB2 and more), an [EPUB editor](https://openfile-studio.vercel.app/epub-editor) and a [comic converter](https://openfile-studio.vercel.app/comic-converter).
- **Subtitles**: [convert](https://openfile-studio.vercel.app/subtitle-converter), [edit](https://openfile-studio.vercel.app/subtitle-editor), [shift and sync](https://openfile-studio.vercel.app/subtitle-sync), [extract](https://openfile-studio.vercel.app/extract-subtitles) and [translate](https://openfile-studio.vercel.app/subtitle-translator) subtitles.
- **CAD**: a [DXF viewer](https://openfile-studio.vercel.app/dxf-viewer) with layers and measuring, and a [CAD converter](https://openfile-studio.vercel.app/cad-converter) to vector PDF, SVG and PNG.
- **Data**: a [SQLite browser](https://openfile-studio.vercel.app/sqlite-viewer), a [Parquet, Arrow and Avro viewer](https://openfile-studio.vercel.app/parquet-viewer), a [CSV and spreadsheet editor](https://openfile-studio.vercel.app/csv-editor), a [GPS and GIS converter](https://openfile-studio.vercel.app/geo-converter), a [data format converter](https://openfile-studio.vercel.app/data-converter) and JSON and XML helpers.
- **On-device AI**: [chat with PDF](https://openfile-studio.vercel.app/chat-pdf), [colorize black and white photos](https://openfile-studio.vercel.app/colorize-photo), a [magic eraser](https://openfile-studio.vercel.app/object-remover) to remove objects, a [photo enhancer](https://openfile-studio.vercel.app/photo-enhancer), an [AI summarizer](https://openfile-studio.vercel.app/pdf-summarizer), [document translation](https://openfile-studio.vercel.app/translate-pdf) and a [quiz and flashcard generator](https://openfile-studio.vercel.app/question-generator).
- **Many more tools** in the existing categories: PDF goes from 28 to 58 tools, Image from 21 to 55, Developer from 20 to 49, Video from 12 to 36, Convert from 14 to 31, Text from 8 to 24, Audio from 6 to 21 and Design from 8 to 15.
- **Drop anything**: drag a file onto any page. OpenFile reads its bytes to work out the type and suggests the right tools.
- **Compare tools**: pick up to three tools on the [tools page](https://openfile-studio.vercel.app/tools) and see formats, engines, offline support and batch support side by side.
- **Share target**: once installed, OpenFile shows up in the system share sheet, so you can send files to it from other apps.
- **Per-tool preview videos**: a short preview on every tool page and tool card.
- **New hero**: a gold ring in motion with file chips that turn into their converted format. It pauses off screen and respects reduced motion.

### Docs

- README catalog, stats artwork, category orbit and diagrams now come from the registry. Run `node scripts/gen-readme-catalog.mjs` after adding a tool (add `--check` in CI to catch a stale README).
- `docs/TOOL_GUIDE.md` lists every category id, and `docs/ARCHITECTURE.md` explains the batch files in `src/tools/batches/`.

## v1.1.0 (2026-10-28)

### Added

- **Documentation** at [/docs](/docs): getting started, how OpenFile works, a guide for every tool category generated from the registry, Workspace and Sketch board guides, keyboard shortcuts, self-hosting, API reference, browser support, FAQ and contributing. Full-text search, a sidebar and a per-page table of contents, syntax-highlighted code and client-side Mermaid diagrams.
- **Local database** with IndexedDB: favorites, recently used tools and an activity log, migrated automatically from v1.0's localStorage.
- **[History](/history)** page: activity grouped by day, filters, search, most-used tools, per-entry delete and clear-all.
- **[Settings](/settings)** page: theme (system/dark/light), reduced motion, default image quality, download file-name pattern, activity recording and export/import of settings as JSON.
- **Richer tool pages**: *How it works* with the exact engines a tool uses, first-use download notes, numbered steps, tips, FAQ and related tools under every tool.
- **SEO and deep links**: every route is pre-rendered to its own `index.html` with a specific title, description and canonical URL, so deep links return HTTP 200 on GitHub Pages; `sitemap.xml` and `robots.txt` are generated for the right base URL.
- Docs, History, Settings and Changelog links in the header, footer and command palette; docs pages are searchable from the palette.

### Improved

- Drop areas are keyboard accessible (<kbd>Enter</kbd> / <kbd>Space</kbd> opens the file picker).
- New Workspace image steps start from your default image quality.

## v1.0.0 (2026-10-28)

### Added

- **117 in-browser tools** across PDF, Convert, Image, Video, Audio, Developer, Text & Data and Design, all processing locally with zero uploads.
- On-device AI: background removal, image upscaling, OCR and Whisper transcription.
- **Workspace** batch pipelines with presets and saved recipes.
- **Sketch whiteboard** with boards, stencils, sharing links, presenting and PNG/SVG export.
- Smart drop on the home page, command palette (<kbd>Ctrl</kbd> + <kbd>K</kbd>), favorites and recent tools.
- Installable PWA with offline support through a service worker.
- Optional Vercel API routes: `/api/health`, `/api/fetch-page`, `/api/meta`.
- Deployments to Vercel and GitHub Pages, launch film and README.
