# Troubleshooting

In the app: [/docs/troubleshooting](https://openfile-studio.vercel.app/docs/troubleshooting), with a live check of your browser. The [Status page](https://openfile-studio.vercel.app/status) shows the same capabilities in more detail.

## Quick fixes

1. Reload. If a bar says a new version is ready, click it.
2. Close other heavy tabs. Everything runs in the tab's memory.
3. Try Chrome or Edge for video, AI, file handling and the share target.
4. Clear the offline cache in Settings if a tool keeps failing after an update.

## Large files and memory

There are no size caps, but browsers limit how much memory one tab may use.

| Kind | Comfortable on a desktop | If it fails |
| --- | --- | --- |
| PDF | Several hundred pages | Split PDF first, then work on parts |
| Images | Hundreds of photos in a batch | Resize very large photos first (canvas limits are lower on iPhone and iPad) |
| Video | A few hundred MB | Shorter clips, keep the tab visible, use the lossless trim mode |
| AI | Depends on the model | Pick the smaller model, close other tabs |

## Browser support

| Feature | Chrome and Edge | Firefox | Safari |
| --- | --- | --- | --- |
| Every tool's core (JavaScript, WebAssembly, Canvas) | Yes | Yes | Yes |
| WebGPU for faster AI | Yes | Newer versions, some platforms | Newer versions |
| Install as an app | Yes | Android only | File, Add to Dock (Mac), Add to Home Screen (iPhone) |
| Open with (file handling) | Desktop | No | No |
| Share target | Android | No | No |
| Screen capture | Desktop | Desktop | Desktop |

## Safari quirks

- iOS Safari may evict cached engines and models when storage is low. They download again when needed.
- No file handling or share target: use drag and drop or the `/open` page.
- Some encoders (for example AVIF) depend on what the browser can encode.
- Downloads on iPhone open a preview first: Share, Save to Files.

## Unsigned app warnings

The desktop installers and the Android APK are not signed with a paid certificate yet.

| System | What you see | What to do |
| --- | --- | --- |
| Windows | Windows protected your PC | More info, Run anyway |
| macOS | App cannot be opened | Right-click, Open, Open. Or System Settings, Privacy and Security, Open Anyway. Or `xattr -dr com.apple.quarantine /Applications/OpenFile.app` |
| Android | Blocked install or Play Protect warning | Allow installs from this source, More details, Install anyway |
| Linux | AppImage does not start | `chmod +x OpenFile-linux-x86_64.AppImage` |

## Reporting a problem

Open an [issue](https://github.com/aniruddhaadak80/OpenFile/issues) with your browser and system, what you did, and what the Status page shows.

<!-- gen:counts:start -->
OpenFile has **572 tools in 26 categories**. PDF Tools 63, Convert 35, Image 60, Video 40, Audio 26, Developer 65, Text & Data 47, Design 21, Data 15, AI 21, 3D 9, Archives 8, eBooks 8, Fonts 7, CAD 6, Subtitles 10, Security & Privacy 15, Maps & GPS 15, Office & Sheets 19, Science & Education 15, Creator Studio 14, Study & Classroom 12, Web & SEO 13, Calendar & Time 12, Money & Finance 10, Health & Fitness 6.
<!-- gen:counts:end -->
