# Changelog

All notable changes to OpenFile. Dates are in YYYY-MM-DD.

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
