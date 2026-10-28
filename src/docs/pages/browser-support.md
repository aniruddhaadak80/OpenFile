# Browser support

OpenFile targets the **current and previous major versions** of Chrome, Edge, Firefox and Safari on desktop and mobile. The core of every tool needs only modern JavaScript, WebAssembly and Canvas, which all of these support. A few tools rely on newer platform features; this page lists them.

> [!TIP]
> Open the [Status](/status) page to see a live check of what **your** browser supports.

## Feature matrix

| Feature | Chrome / Edge | Firefox | Safari (macOS) | Mobile (Android Chrome / iOS Safari) | Used by |
| --- | --- | --- | --- | --- | --- |
| WebAssembly | ✅ | ✅ | ✅ | ✅ | Video, audio, OCR, AI tools |
| Web Workers | ✅ | ✅ | ✅ | ✅ | PDF rendering, OCR, transcription, regex |
| Canvas 2D export (PNG, JPG, WebP) | ✅ | ✅ | ✅ | ✅ | All image tools |
| WebGPU | ✅ | ⚠️ newer versions, platform-dependent | ⚠️ newer versions | ⚠️ varies | Faster AI (upscaler, transcriber, background removal); WASM fallback everywhere |
| MediaRecorder | ✅ | ✅ | ✅ | ✅ | Voice, webcam and screen recorders |
| Screen capture (`getDisplayMedia`) | ✅ | ✅ | ✅ | ❌ | Screen Recorder |
| Tab / system audio capture | ✅ (tabs; system audio on some OSes) | ⚠️ limited | ❌ | ❌ | Screen Recorder |
| Web Speech synthesis | ✅ | ✅ | ✅ | ✅ | Text to Speech (voices depend on the OS) |
| BarcodeDetector | ⚠️ some platforms | ❌ | ⚠️ | ✅ Android | QR Scanner (falls back to a JavaScript decoder) |
| FaceDetector (Shape Detection) | ⚠️ some platforms / flag | ❌ | ❌ | ⚠️ | Blur Faces auto-detect (manual painting works everywhere) |
| Clipboard image write | ✅ | ⚠️ | ✅ | ⚠️ | Copy-to-clipboard buttons on image exports |
| Service worker (offline) | ✅ | ✅ | ✅ | ✅ | Offline use, install as app |

✅ supported · ⚠️ partial or version-dependent · ❌ not available

## By tool group

| Group | Minimum needs | Notes |
| --- | --- | --- |
| PDF tools | JavaScript + Canvas | Works everywhere. Very large PDFs depend on device memory. |
| Convert | JavaScript + Canvas | Office conversions run fully in the browser. |
| Image tools | Canvas | AVIF export works only where the browser can encode AVIF; WebP works everywhere modern. |
| AI image tools | WebAssembly (WebGPU recommended) | First use downloads a model. Chromium browsers with WebGPU are fastest. |
| Video tools | WebAssembly | First use downloads ffmpeg.wasm (~30 MB). Keep the tab in the foreground for long encodes. |
| Recorders | MediaRecorder, camera/mic permission, HTTPS | Screen recording is desktop-only. |
| Audio Transcriber | WebAssembly, Web Workers | Downloads Whisper (about 40 to 80 MB) on first use. |
| Developer, text and design tools | JavaScript | Instant everywhere. |

## Memory and file sizes

There are no artificial limits, but everything happens in your tab's memory. As a rule of thumb, a desktop browser comfortably handles PDFs of several hundred pages, batches of hundreds of photos and videos of a few hundred MB. Phones and tablets have less memory available per tab; split very large jobs there.

## Permissions

Camera, microphone and screen capture require a **secure context** (HTTPS or `localhost`) and your explicit permission. OpenFile's `Permissions-Policy` header allows these features only for its own origin.

## Known limitations

- **iOS Safari** may evict cached engines when storage is low; they are downloaded again when needed.
- **Private/incognito windows** can limit IndexedDB and cache storage, so favorites, history and offline caching may not persist after the window closes.
- **HEIC** photos are decoded in JavaScript, which is slower than native decoding on large images.
