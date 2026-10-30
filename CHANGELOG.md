## 0.11

- Six new tools: Roman numerals, Morse code, duplicate line remover, line sorter, text wrapper, colour contrast checker.

# Changelog

All notable changes to OpenFile. Dates are in YYYY-MM-DD. The same notes are shown in the app at [/changelog](https://openfile-studio.vercel.app/changelog).

## v2.4.0 (2026-10-29)

Three new studios, **Study & Classroom**, **Web & SEO** and **Calendar & Time**, and 74 new tools in all. The five thinnest studios each grew to 14 tools or more, and category grids now keep every row full on phones, tablets and desktops.

### Added

- **Study & Classroom**: Flashcard Maker, AI Notes to Flashcards, Quiz Maker, Math Worksheet Generator, Word Search Maker, Crossword Maker, Citation Generator, BibTeX & RIS Converter, GPA Calculator, Grade & Final Exam Calculator, Typing Speed Test and Cornell Notes Template.
- **Web & SEO**: robots.txt Generator & Tester, XML Sitemap Generator, Sitemap Checker, Redirect Rules Generator (Apache, Nginx, Netlify, Vercel, Cloudflare), Hreflang Tag Generator, Security Headers Generator, UTM Link Builder, Schema Markup Generator, llms.txt Generator, On-page SEO Checker, AI Meta Description Writer, Link Extractor and security.txt Generator.
- **Calendar & Time**: Calendar Event Maker (ICS), Merge Calendar Files, Spreadsheet to Calendar, Recurring Dates & RRULE, Age Calculator, Week Number Calculator, Sunrise & Sunset Times, Timesheet Calculator, Shift Rota Planner, Printable Calendar Maker, Printable Planner and Time Duration Calculator.
- **Security & Privacy**: Secret Note Link, Media Metadata Remover, Link Tracking Cleaner, Document Leak Checker, CSV Anonymizer, Voice Anonymizer and Email Header Analyzer.
- **Maps & GPS**: Distance & Bearing Calculator, Geotag Photos from GPX, CSV to Map, GPX Editor, Compare GPX Tracks and Geofence Checker.
- **Office & Sheets**: Excel to CSV & JSON, CSV to Excel, Remove Duplicate Rows, Sort & Filter Rows, Large CSV Splitter, Merge Word Documents, PowerPoint to Images, Spreadsheet Cleaner, Spreadsheet Lookup & Join and Split & Combine Columns.
- **Science & Education**: Significant Figures Calculator, Scientific Notation Converter, Physics Formula Solver, pH Calculator, Molarity & Dilution Calculator, Half-life Calculator and Lab Data Grapher.
- **Creator Studio**: Caption Styler, AI Hashtag Generator, Quote Card Maker, Safe Zone Checker, YouTube Title & Thumbnail Preview, Giveaway Winner Picker and Content Calendar Planner.
- **blog**: three posts with films, cover loops, read aloud and quizzes, one for each new studio.

### Changed

- **layout**: the mega menu, footer and About page show the newer studios in their own block, 5 across on desktop and 2 across on phones, so no row is left half empty.

## v2.3.0 (2026-10-29)

Two new studios, **Money & Finance** and **Health & Fitness**, with 16 new tools, three of them on-device AI. AI tools on devices without WebGPU now start in an instant mode, so the tab never stalls.

### Added

- **Money & Finance**: Bank Statement Converter (OFX, QFX, QIF, CAMT.053, MT940 and CSV to CSV, Excel, JSON, OFX or QIF), CSV to OFX / QIF, Statement Analyzer (monthly in and out, categories, top payees, repeating payments), PDF Statement to CSV, Loan & EMI Calculator, Compound Interest & SIP Calculator, GST & VAT Calculator and Expense Splitter.
- **Health & Fitness**: FIT File Converter & Viewer (a new FIT decoder: Garmin, Wahoo, Coros, Zwift; to CSV, GPX, Excel, JSON), Heart Rate Zones with TRIMP training load, Apple Health Export to CSV (reads multi GB exports in pieces), Running Pace Calculator with race predictions, and BMI, BMR & Calorie Calculator.
- **ai**: AI Transaction Categorizer (MiniLM embeddings in a Web Worker, keyword rules as the quick mode), AI Receipt Scanner (Tesseract OCR in a worker, CPU only, with Cancel) and AI Meal Photo Logger (CLIP zero-shot, pick by hand mode).
- **blog**: three posts with films, cover loops, read aloud and quizzes: bank statement files explained, what is inside a FIT file, and scanning receipts privately.
- **routes**: /sketch and /whiteboard open the Sketch board.

### Fixed

- **ai**: Image Captioner, PDF Summarizer and Chat with PDF no longer load a 240 to 500 MB model on CPU-only devices by default. They start in Light model, Instant summary and Instant answers modes, and the full model is one tap away.
- **ebook**: EPUBs that keep the whole book in one huge file are split into sections before display, so the reader stays responsive.
- **blog**: cover loops play on hover with reduced motion on, and search results now show the moving cover too. Decorative cover text is hidden from screen readers.
- **privacy**: Checksum Verifier accepts a checksum list on its own first, then asks for the files.

## v1.2.0 (2026-10-29)

Apps that keep themselves up to date. This is the app release line (desktop, Android, iOS); the web catalog versions below (v2.x) ship to the website continuously.

### Added

- **updates**: desktop apps update themselves from signed GitHub releases. A gold card shows *Update ready* with Install now, Later and What's new; release notes show before installing, the download is verified against the OpenFile signing key, and the app relaunches.
- **updates**: Settings, Updates: current version, last checked, Check now, Stable or Beta channel, check on launch, daily, weekly or off, auto install (off by default), remind me tomorrow or next week, skip this version.
- **updates**: desktop rollback. The previous version is recorded before an update; if the new one fails to start three times, OpenFile offers to roll back, and Settings has a one-click Roll back.
- **android**: in-app update check against GitHub Releases. Downloads the APK (Wi-Fi only by default), verifies package, version and signing certificate, then opens the Android installer.
- **android**: APKs are now signed with a permanent release key, so future versions install over this one. Uninstall the v1.1.0 APK once.
- **apps**: hybrid mode. When the website has newer tools than the app, the app offers to load the hosted version inside the window, with the built-in copy as the offline fallback (Ask, Always or Never).
- **pwa**: the web app checks for updates every 30 minutes, on focus and when it comes back to the screen (iPhone home screen apps included), and the update bar links to What's new.
- **release**: `version.json` in every web build, `scripts/bump-version.mjs` for one version everywhere, `scripts/changelog.mjs` for release notes from conventional commits, and a release job that publishes and verifies `latest.json`.

## v2.2.0 (2026-10-29)

The catalog grows to **411 tools in 21 studios**. Five new studios and 51 new tools, ten of them on-device AI. Everything still runs in your browser tab with zero uploads.

### Added

- **Five new studios**: Security & Privacy, Maps & GPS, Office & Sheets, Science & Education and Creator Studio.
- **Local AI** (runs in a background worker, with download progress, Cancel and a CPU path when there is no WebGPU): an [image captioner](https://openfile-studio.vercel.app/image-captioner) for alt text, an [object detector](https://openfile-studio.vercel.app/object-detector), a [depth map maker](https://openfile-studio.vercel.app/depth-map) with portrait blur, an [image segmenter](https://openfile-studio.vercel.app/image-segmenter), a CLIP [image tagger](https://openfile-studio.vercel.app/image-tagger), a [similar photo finder](https://openfile-studio.vercel.app/similar-photo-finder), a [sentiment analyzer](https://openfile-studio.vercel.app/sentiment-analyzer), a [zero-shot text classifier](https://openfile-studio.vercel.app/text-classifier), a [name and entity extractor](https://openfile-studio.vercel.app/entity-extractor) and [semantic file search](https://openfile-studio.vercel.app/semantic-file-search). Most have a quick mode that needs no download.
- **Security & Privacy**: a [metadata scrubber](https://openfile-studio.vercel.app/metadata-scrubber) for photos, PDFs, Office files and MP3s, [steganography](https://openfile-studio.vercel.app/steganography), a [checksum verifier](https://openfile-studio.vercel.app/checksum-verifier), [password ZIP](https://openfile-studio.vercel.app/zip-encrypt), a [PII redactor](https://openfile-studio.vercel.app/pii-redactor), a [hidden character detector](https://openfile-studio.vercel.app/hidden-character-detector), a [locked HTML file](https://openfile-studio.vercel.app/self-decrypting-file) maker and a [file entropy analyzer](https://openfile-studio.vercel.app/entropy-analyzer).
- **Maps & GPS**: [elevation profile](https://openfile-studio.vercel.app/gpx-elevation-profile), [pace and splits](https://openfile-studio.vercel.app/gpx-splits), [merge and split tracks](https://openfile-studio.vercel.app/gpx-merge-split), a [GPX simplifier](https://openfile-studio.vercel.app/gpx-simplifier), [privacy zones](https://openfile-studio.vercel.app/gpx-privacy-zone), a [photo location map](https://openfile-studio.vercel.app/photo-location-map), a [route heatmap](https://openfile-studio.vercel.app/route-heatmap), [GeoJSON area and length](https://openfile-studio.vercel.app/geojson-measure) and a [plus code and geohash converter](https://openfile-studio.vercel.app/location-code-converter).
- **Office & Sheets**: [merge](https://openfile-studio.vercel.app/xlsx-merger), [split](https://openfile-studio.vercel.app/xlsx-splitter) and [compare](https://openfile-studio.vercel.app/spreadsheet-compare) spreadsheets, a [pivot table](https://openfile-studio.vercel.app/pivot-table), [Word find and replace](https://openfile-studio.vercel.app/docx-find-replace), a [Word document cleaner](https://openfile-studio.vercel.app/docx-cleaner), an [Office media extractor](https://openfile-studio.vercel.app/office-media-extractor), an [ICS calendar viewer](https://openfile-studio.vercel.app/ics-viewer) and a [VCF and CSV contacts converter](https://openfile-studio.vercel.app/vcard-converter).
- **Science & Education**: a [LaTeX equation renderer](https://openfile-studio.vercel.app/latex-equation), a [function plotter](https://openfile-studio.vercel.app/function-plotter), a [periodic table](https://openfile-studio.vercel.app/periodic-table), a [molar mass calculator](https://openfile-studio.vercel.app/molar-mass-calculator), a [chemical equation balancer](https://openfile-studio.vercel.app/chemical-equation-balancer), a [matrix calculator](https://openfile-studio.vercel.app/matrix-calculator), a [truth table generator](https://openfile-studio.vercel.app/truth-table-generator) and a [prime factorizer](https://openfile-studio.vercel.app/prime-factorizer).
- **Creator Studio**: an [audiogram maker](https://openfile-studio.vercel.app/audiogram-maker), [video reframe to 9:16, 1:1 or 4:5](https://openfile-studio.vercel.app/video-reframe), a [carousel maker](https://openfile-studio.vercel.app/carousel-maker), a [post length checker](https://openfile-studio.vercel.app/post-length-checker) with thread splitting, a [link in bio page builder](https://openfile-studio.vercel.app/link-in-bio-builder), a [word cloud generator](https://openfile-studio.vercel.app/word-cloud) and a [video chapter maker](https://openfile-studio.vercel.app/chapter-maker).

## v2.1.0 (2026-10-28)

The catalog grows to **349 tools**. Twenty new text, developer and data tools, all running in your browser tab.

### Added

- **Text**: a [readability checker](https://openfile-studio.vercel.app/readability-score) with grade levels and a bionic reading view, a [keyword and phrase extractor](https://openfile-studio.vercel.app/keyword-extractor), [text similarity and fuzzy list matching](https://openfile-studio.vercel.app/text-similarity), a [statistics calculator](https://openfile-studio.vercel.app/statistics-calculator) with histogram, box plot and regression, an [ASCII and box table generator](https://openfile-studio.vercel.app/ascii-table-generator), [number to words](https://openfile-studio.vercel.app/numbers-to-words) with lakh, crore and cheque wording, a [Unicode inspector](https://openfile-studio.vercel.app/unicode-inspector) that finds invisible and look-alike characters, and a [text encoding detector and converter](https://openfile-studio.vercel.app/text-encoding-converter) that also repairs garbled text.
- **Developer**: a [hash and ID analyzer](https://openfile-studio.vercel.app/hash-identifier), a [dummy file generator](https://openfile-studio.vercel.app/dummy-file-generator), a [secret scanner](https://openfile-studio.vercel.app/secret-scanner) for files, folders and ZIPs, an [embedded file extractor](https://openfile-studio.vercel.app/file-carver), [Shamir secret sharing](https://openfile-studio.vercel.app/shamir-secret), a [DNS lookup](https://openfile-studio.vercel.app/dns-lookup) over HTTPS, [JSON repair and JSON5](https://openfile-studio.vercel.app/json-repair), a [password strength checker](https://openfile-studio.vercel.app/password-strength), a [.gitignore and LICENSE generator](https://openfile-studio.vercel.app/gitignore-license-generator), a [HAR file viewer](https://openfile-studio.vercel.app/har-viewer) with a redacted export, and a [keyboard, mouse, gamepad and touch test](https://openfile-studio.vercel.app/input-device-test).
- **Data**: a [SQL table generator](https://openfile-studio.vercel.app/sql-ddl-generator) that writes CREATE TABLE and INSERT statements from CSV or JSON for four databases.

## v2.0.0 (2026-10-28)

The catalog grows to **329 tools in 16 studios**, up from 117 tools in 8. Every tool still runs in your browser tab with zero uploads.

### Added

- **Eight new studios**: Data, AI, 3D, Archives, eBooks, Fonts, CAD and Subtitles.
- **3D**: a [3D model viewer](https://openfile-studio.vercel.app/3d-viewer) for GLB, glTF, OBJ, STL, PLY, FBX and more, a [3D converter](https://openfile-studio.vercel.app/3d-converter), a [GLB and glTF optimizer](https://openfile-studio.vercel.app/gltf-optimizer), an [STL inspector](https://openfile-studio.vercel.app/stl-inspector) and an [image to lithophane](https://openfile-studio.vercel.app/lithophane-maker) maker.
- **Fonts**: [convert](https://openfile-studio.vercel.app/font-converter) TTF, OTF, WOFF and WOFF2, [inspect](https://openfile-studio.vercel.app/font-viewer) glyphs and metrics, and [subset](https://openfile-studio.vercel.app/font-subsetter) fonts for the web.
- **Archives**: [open](https://openfile-studio.vercel.app/archive-extractor) ZIP, 7Z, RAR, TAR and more, [create](https://openfile-studio.vercel.app/archive-creator) archives (with AES-256 ZIP passwords), [convert](https://openfile-studio.vercel.app/archive-converter) between them, and [compress single files](https://openfile-studio.vercel.app/file-compressor) with Gzip, Brotli, Zstd or XZ.
- **eBooks**: an [e-book reader](https://openfile-studio.vercel.app/ebook-reader), an [e-book converter](https://openfile-studio.vercel.app/ebook-converter) (EPUB, MOBI, AZW3, FB2 and more), an [EPUB editor](https://openfile-studio.vercel.app/epub-editor) and a [comic converter](https://openfile-studio.vercel.app/comic-converter).
- **Subtitles**: [convert](https://openfile-studio.vercel.app/subtitle-converter), [edit](https://openfile-studio.vercel.app/subtitle-editor), [shift and sync](https://openfile-studio.vercel.app/subtitle-sync), [extract](https://openfile-studio.vercel.app/extract-subtitles) and [translate](https://openfile-studio.vercel.app/subtitle-translator) subtitles.
- **CAD**: a [DXF viewer](https://openfile-studio.vercel.app/dxf-viewer) with layers and measuring, and a [CAD converter](https://openfile-studio.vercel.app/cad-converter) to vector PDF, SVG and PNG.
- **Data**: a [SQLite browser](https://openfile-studio.vercel.app/sqlite-viewer), a [Parquet, Arrow and Avro viewer](https://openfile-studio.vercel.app/parquet-viewer), a [CSV and spreadsheet editor](https://openfile-studio.vercel.app/csv-editor), a [GPS and GIS converter](https://openfile-studio.vercel.app/geo-converter), a [data format converter](https://openfile-studio.vercel.app/data-converter) and JSON and XML helpers.
- **On-device AI**: [chat with PDF](https://openfile-studio.vercel.app/chat-pdf), [colorize black and white photos](https://openfile-studio.vercel.app/colorize-photo), a [magic eraser](https://openfile-studio.vercel.app/object-remover) to remove objects, a [photo enhancer](https://openfile-studio.vercel.app/photo-enhancer), an [AI summarizer](https://openfile-studio.vercel.app/pdf-summarizer), [document translation](https://openfile-studio.vercel.app/translate-pdf) and a [quiz and flashcard generator](https://openfile-studio.vercel.app/question-generator).
- **Many more tools** in the existing studios: PDF goes from 28 to 58 tools, Image from 21 to 55, Developer from 20 to 49, Video from 12 to 36, Convert from 14 to 31, Text from 8 to 24, Audio from 6 to 21 and Design from 8 to 15.
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

- **Documentation** at [/docs](https://openfile-studio.vercel.app/docs): getting started, how OpenFile works, a guide for every tool category generated from the registry, Workspace and Sketch board guides, keyboard shortcuts, self-hosting, API reference, browser support, FAQ and contributing. Full-text search, a sidebar and a per-page table of contents, syntax-highlighted code and client-side Mermaid diagrams.
- **Local database** with IndexedDB: favorites, recently used tools and an activity log, migrated automatically from v1.0's localStorage.
- **[History](https://openfile-studio.vercel.app/history)** page: activity grouped by day, filters, search, most-used tools, per-entry delete and clear-all.
- **[Settings](https://openfile-studio.vercel.app/settings)** page: theme (system/dark/light), reduced motion, default image quality, download file-name pattern, activity recording and export/import of settings as JSON.
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
