# Privacy and security

OpenFile has one rule: files never leave the user's device. Every tool reads files into the memory of the browser tab, processes them there and hands back a download. There is no upload endpoint.

In the app: [/docs/privacy-security](https://openfile-studio.vercel.app/docs/privacy-security). The short policy page is at [/privacy](https://openfile-studio.vercel.app/privacy).

## What the app fetches

| What | From | Carries user data |
| --- | --- | --- |
| App code, styles, fonts, icons | The site itself | No |
| ffmpeg core | The site itself (`public/ffmpeg`), public CDNs as fallback | No |
| AI models, OCR language data | Public model hosts and CDNs, once, then cached | No |
| Optional API routes (`/api/health`, `/api/fetch-page`, `/api/meta`) | Vercel functions, only when a tool that needs them is used | A URL the user typed, never a file |

<!-- gen:ffmpeg:start -->
Self-hosted ffmpeg files in `public/ffmpeg`: `ffmpeg-core.js` (0.1 MB), `ffmpeg-core.wasm` (30.7 MB).
<!-- gen:ffmpeg:end -->

## Verify it yourself

1. Open a tool and press F12 (Cmd + Option + I on a Mac). Open the **Network** tab and clear it.
2. Drop a file and run the tool.
3. No request carries the file. For the strongest test, load the tool once, switch DevTools to **Offline**, and run it again. It still works.

## Stored on the device

| Storage | Contents |
| --- | --- |
| IndexedDB (`src/lib/db.ts`) | Favorites, recent tools, activity history (tool, file name, size, time), settings |
| Local storage | Small flags, Workspace recipes, Sketch boards |
| Cache storage (`public/sw.js`) | Offline app shell, tool code and engines, AI models, files received from the share sheet until read |

Everything can be cleared in Settings (offline cache, favorites, recents, history, each with undo) or from the browser's site data controls.

## Headers

`vercel.json` sends `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and `Permissions-Policy: camera=(self), microphone=(self), display-capture=(self)` on every page, and long immutable caching on hashed assets.

There is no Content Security Policy header yet, and the Tauri desktop app sets `csp: null`. A strict CSP that allows exactly the hosts the service worker caches would be a sensible next step. Until then, the protection is structural: no code path sends file bytes anywhere.

## No tracking

No analytics, ads, trackers, third-party cookies or accounts.

## Reporting a vulnerability

Use [GitHub security advisories](https://github.com/aniruddhaadak80/OpenFile/security/advisories/new) for anything sensitive, or open an issue for everything else. A `security.txt` is published at `/.well-known/security.txt`.
