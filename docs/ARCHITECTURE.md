# OpenFile architecture

<p align="center"><img src="assets/privacy.svg" width="100%" alt="Files never leave your device"/></p>

OpenFile is a static single-page app. Every one of its 360 tools runs inside the user's browser tab; the build output (`dist/`) is plain HTML, JS, CSS and WASM loaders that any static host can serve.

## 1. The big picture

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontFamily':'system-ui, sans-serif','lineColor':'#F5A524','primaryTextColor':'#F5F3EE','clusterBkg':'#050505','clusterBorder':'#F5A524','titleColor':'#FFB224'}}}%%
flowchart TB
    subgraph TAB["🌐 Browser tab"]
        direction TB
        MAIN["main.tsx · App.tsx<br/>React Router routes"]:::ui
        PAGES["pages/<br/>Home · Tools · ToolPage · Workspace · Status"]:::ui
        REG["tools/registry.ts<br/>TOOLS + CATEGORIES"]:::ui
        CHUNK["tools/category/slug.tsx<br/>one lazy chunk per tool"]:::ui
        LIB["lib/<br/>files · pdf · ffmpeg · handoff · store"]:::lib
        ENG["Engines loaded on demand<br/>pdf-lib · PDF.js · ffmpeg.wasm · Tesseract · Transformers.js · ONNX"]:::eng
        LOCAL["IndexedDB + localStorage<br/>favorites · recents · prefs · recipes"]:::store
        MAIN --> PAGES --> REG --> CHUNK --> LIB --> ENG
        PAGES --> LOCAL
    end
    SW["Service worker sw.js<br/>network-first pages · cache-first assets"]:::sw -.-> TAB
    API["Optional Vercel functions<br/>/api/health · /api/fetch-page · /api/meta"]:::api -. "URLs only, never files" .- TAB
    classDef ui fill:#F5A524,stroke:#FFE3A3,color:#050505
    classDef lib fill:#111418,stroke:#22D3EE,color:#F5F3EE,stroke-width:2px
    classDef eng fill:#111418,stroke:#14B8A6,color:#F5F3EE,stroke-width:2px
    classDef store fill:#111418,stroke:#10B981,color:#F5F3EE,stroke-width:2px
    classDef sw fill:#0B0D10,stroke:#A8A29E,color:#F5F3EE,stroke-dasharray:4 3
    classDef api fill:#0B0D10,stroke:#FFB224,color:#FFE3A3,stroke-dasharray:6 4
```

## 2. Routing and the tool registry

- `src/App.tsx` declares the routes: `/`, `/tools`, `/category/:id`, `/workspace`, `/about`, `/privacy`, `/status`, `/docs` and `/docs/*`, `/changelog`, `/history`, `/settings`, `/blog` and `/blog/:slug`, `/install` (and `/download`), `/open`, and the catch-all `/:slug` that renders `ToolPage`.
- `src/tools/registry.ts` is the single source of truth. It holds the core tools and spreads in the entries from `src/tools/batches/b1.ts` to `b5.ts`, so parallel work on new tools never touches the same file. Each `ToolMeta` has a `slug`, `name`, `desc`, `category`, Lucide `icon`, optional `badge` (`NEW` / `AI` / `HOT` / `PRO`), `popular` flag and optional `pipeline` mode (`image` / `pdf`) for the Workspace.
- `loadTool(slug)` resolves `./<category>/<slug>.tsx` through `import.meta.glob`, so Vite emits **one chunk per tool**. Adding a tool never makes the homepage heavier.

<!-- arch-counts:start -->
| Category | Tools |
|---|:-:|
| 📄 PDF Tools | 58 |
| 🔄 Convert | 31 |
| 🖼️ Image | 55 |
| 🎬 Video | 36 |
| 🎧 Audio | 21 |
| 🧑‍💻 Developer | 60 |
| 📝 Text & Data | 42 |
| 🖌️ Design | 16 |
| 📊 Data | 11 |
| 🤖 AI | 7 |
| 🧊 3D | 5 |
| 🗜️ Archives | 4 |
| 📚 eBooks | 4 |
| 🔤 Fonts | 3 |
| 📐 CAD | 2 |
| 💬 Subtitles | 5 |
| **Total** | **360** |
<!-- arch-counts:end -->

## 3. Engines

| Engine | Used for | How it loads |
|---|---|---|
| **pdf-lib**, **@cantoo/pdf-lib** | Create / modify PDFs, encryption | Dynamic import in the tool |
| **PDF.js** (`pdfjs-dist`) | Rendering, thumbnails, text extraction, rasterising | Dynamic import, worker |
| **ffmpeg.wasm** | Video and audio transcode, trim, merge, GIF | Single-threaded core served by OpenFile itself from `public/ffmpeg` (public CDNs as a fallback), then cached |
| **Tesseract.js** | OCR | Language data fetched per language, cached |
| **Transformers.js / ONNX Runtime** | Whisper transcription, super-resolution, chat, summaries, translation, neural voices | Model weights fetched on first use in a Web Worker, WebGPU when available, WASM otherwise. See [AI.md](AI.md) |
| **@imgly/background-removal** | Background removal | Model fetched on first use |
| **Canvas / OffscreenCanvas** | All image tools and PDF rasterising | Built into the browser |
| **docx, mammoth, SheetJS, pptxgenjs, jsPDF** | Office conversions | Dynamic import |
| **MediaRecorder, Web Audio, Speech Synthesis** | Recorders, audio editor, text-to-speech | Built into the browser |

## 4. Lifecycle of a file

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontFamily':'system-ui, sans-serif','actorBkg':'#0B0D10','actorBorder':'#F5A524','actorTextColor':'#F5F3EE','actorLineColor':'#A8A29E','signalColor':'#14B8A6','signalTextColor':'#A8A29E','noteBkgColor':'#F5A524','noteTextColor':'#050505','noteBorderColor':'#FFB224'}}}%%
sequenceDiagram
    autonumber
    actor U as You
    participant H as Home smart drop
    participant T as Tool component
    participant E as Engine
    U->>H: Drop any file
    H->>H: Detect type and suggest tools
    H->>T: Hand the File over in memory via lib/handoff
    T->>E: Dynamic import, then process bytes
    E-->>T: Progress and output bytes
    T-->>U: Blob URL download or ZIP
    Note over U,E: No network request carries the file.
```

## 5. Workspace pipelines

`src/pages/workspace/steps.ts` defines pipeline **steps** (each a pure `run(items, params, onProgress)` over `{ name, blob }` items) and **presets**.

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontFamily':'system-ui, sans-serif','lineColor':'#F5A524','primaryTextColor':'#F5F3EE'}}}%%
flowchart LR
    IN["Files"]:::a --> S1["Step 1"]:::b --> S2["Step 2"]:::b --> SN["Step n"]:::b --> Z["ZIP via fflate / JSZip"]:::c
    R["Saved recipe"]:::d -.-> S1
    classDef a fill:#F5A524,stroke:#FFE3A3,color:#050505
    classDef b fill:#0B0D10,stroke:#F5A524,color:#F5F3EE,stroke-width:2px
    classDef c fill:#10B981,stroke:#A7F3D0,color:#050505
    classDef d fill:#0B0D10,stroke:#22D3EE,color:#F5F3EE,stroke-dasharray:5 4
```

- **Image steps:** resize, convert, compress, rotate / flip, filter, watermark, rounded corners, rename.
- **PDF steps:** merge all, rotate, page numbers, watermark, clean metadata, compress (rasterise), grayscale.
- **Presets:** Web-ready photos, Product catalog, Social avatars, Share-safe PDF pack, Confidential drafts, Shrink scans.

## 6. Build and deploy

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontFamily':'system-ui, sans-serif','lineColor':'#F5A524','primaryTextColor':'#F5F3EE'}}}%%
flowchart LR
    P["git push main"]:::g --> A["GitHub Actions<br/>deploy-pages.yml"]:::c
    A --> B["npm run build:pages<br/>VITE_BASE=/OpenFile/"]:::c
    B --> PB["postbuild.mjs<br/>404.html + .nojekyll"]:::c
    PB --> GP["gh-pages branch → GitHub Pages"]:::l
    P --> V["Vercel<br/>npm run build"]:::v --> VL["openfile-studio.vercel.app"]:::l
    classDef g fill:#0B0D10,stroke:#A8A29E,color:#F5F3EE
    classDef c fill:#111418,stroke:#38BDF8,color:#F5F3EE,stroke-width:2px
    classDef v fill:#050505,stroke:#F5A524,color:#F5F3EE,stroke-width:2px
    classDef l fill:#F5A524,stroke:#FFE3A3,color:#050505
```

- **GitHub Pages** has no server-side rewrites, so `scripts/postbuild.mjs` copies `index.html` to `404.html`, making deep links like `/OpenFile/merge-pdf` work.
- **Vercel** uses `vercel.json` for SPA rewrites (excluding `/api/`, `/assets/`, `/media/`), immutable caching of hashed assets, and security headers (`nosniff`, strict referrer policy, camera / mic / display-capture limited to self).

## 7. Privacy guarantees

1. No code path sends user file bytes over the network.
2. The three optional API routes accept a URL string only.
3. Preferences, favorites, recents and saved recipes live in the browser's own storage and can be cleared from the browser at any time.
4. Contributions that upload user files are not accepted (see [CONTRIBUTING.md](../CONTRIBUTING.md)).

## 8. Offline, install and file handling

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontFamily':'system-ui, sans-serif','lineColor':'#F5A524','primaryTextColor':'#F5F3EE'}}}%%
flowchart TD
    R["Request"]:::a --> N{"Page navigation?"}:::b
    N -- yes --> NF["Network first, 6 s timeout"]:::c --> SC["Cached page, app shell, offline.html"]:::c
    N -- no --> A{"Tool code, engine, font, wasm?"}:::b
    A -- yes --> CF["Cache first: openfile-assets"]:::d
    A -- no --> M{"Model or CDN host?"}:::b
    M -- yes --> MC["Cache first: openfile-models"]:::d
    M -- no --> SW["Stale while revalidate: shell cache"]:::c
    SH["OS share sheet POST /share-target"]:::e --> SHC["openfile-share cache"]:::d --> UI["Drop anything sheet"]:::a
    classDef a fill:#F5A524,stroke:#FFE3A3,color:#050505
    classDef b fill:#0B0D10,stroke:#F5A524,color:#F5F3EE,stroke-width:2px
    classDef c fill:#111418,stroke:#38BDF8,color:#F5F3EE,stroke-width:2px
    classDef d fill:#111418,stroke:#10B981,color:#F5F3EE,stroke-width:2px
    classDef e fill:#0B0D10,stroke:#22D3EE,color:#F5F3EE,stroke-dasharray:5 4
```

- `public/sw.js` precaches the app shell at install (`scripts/postbuild.mjs` writes the build id and the precache list), and waits for the page to say "reload" before a new version takes over.
- `public/manifest.webmanifest` declares `file_handlers` (Open with OpenFile, handled at `/open`), a `share_target` (`/share-target`, received by the service worker) and app shortcuts.
- `desktop/` (Tauri v2) and `mobile/` (Capacitor) wrap the same `dist/` build. `.github/workflows/release-apps.yml` builds every platform on a `v*` tag. See [INSTALL.md](INSTALL.md).

## 9. Docs site and generated facts

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontFamily':'system-ui, sans-serif','lineColor':'#F5A524','primaryTextColor':'#F5F3EE'}}}%%
flowchart LR
    SRC["registry · Overlays shortcuts · sketch shortcuts<br/>AI model ids · manifest · CHANGELOG · README roadmap"]:::a --> GEN["scripts/gen-docs.mjs<br/>(prebuild)"]:::b
    GEN --> J["src/pages/docs/generated.json"]:::c
    GEN --> MD["docs/SHORTCUTS.md and gen blocks in docs/*.md"]:::c
    J --> SITE["/docs site<br/>src/pages/Docs.tsx + src/pages/docs/"]:::a
    REG["TOOLS, formats, Workspace steps, prefs<br/>(imported at runtime)"]:::d --> SITE
    SITE --> PB["postbuild.mjs<br/>pre-renders every /docs route"]:::b
    classDef a fill:#F5A524,stroke:#FFE3A3,color:#050505
    classDef b fill:#111418,stroke:#38BDF8,color:#F5F3EE,stroke-width:2px
    classDef c fill:#111418,stroke:#10B981,color:#F5F3EE,stroke-width:2px
    classDef d fill:#0B0D10,stroke:#22D3EE,color:#F5F3EE,stroke-dasharray:5 4
```

Nothing that counts or lists things in the docs is typed by hand. The docs site reads the registry, `src/lib/formats.ts`, the Workspace steps and the preferences at runtime, and reads everything else from `generated.json`, which `scripts/gen-docs.mjs` rebuilds before every build.

<!-- gen:counts:start -->
OpenFile has **360 tools in 16 categories**. PDF Tools 58, Convert 31, Image 55, Video 36, Audio 21, Developer 60, Text & Data 42, Design 16, Data 11, AI 7, 3D 5, Archives 4, eBooks 4, Fonts 3, CAD 2, Subtitles 5.
<!-- gen:counts:end -->

Back to the [README](../README.md) · Writing a tool: [TOOL_GUIDE.md](TOOL_GUIDE.md) · [AI.md](AI.md) · [PRIVACY.md](PRIVACY.md) · [TROUBLESHOOTING.md](TROUBLESHOOTING.md) · [SHORTCUTS.md](SHORTCUTS.md)
