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

## Desktop app does not start

### Linux: the window stays black, white or empty

On some Linux systems OpenFile 1.2.0 opens a window that stays empty (black in the dark theme). The terminal may show `WebProcess didn't exit as expected after the UI process connection was closed`. The cause is the graphics renderer in WebKitGTK, the web engine Linux apps like OpenFile use. Since version 2.42 it draws pages through a DMA-BUF path that fails with some GPU drivers and compositors (NVIDIA most often, also some Mesa and Wayland setups, for example Fedora 44 with GNOME on Wayland). The page loads but is never drawn.

The next desktop release (1.2.1) fixes this on its own. It turns that renderer off, and the page tells the app when its first frame is on screen. If no frame arrives within 30 seconds, OpenFile restarts one graphics mode up (standard, then safe, then software) and remembers it. If even software mode draws nothing, it offers to open the same tools in your web browser instead of leaving an empty window. Systems where the open source nouveau driver runs the only GPU (older NVIDIA cards such as the GeForce GT 730) start in software mode right away, because nouveau's OpenGL can hang the web engine whatever else is turned off.

On 1.2.0, start OpenFile like this:

```bash
# .rpm or .deb
WEBKIT_DISABLE_DMABUF_RENDERER=1 openfile
# AppImage
WEBKIT_DISABLE_DMABUF_RENDERER=1 ./OpenFile-linux-x86_64.AppImage
```

If the window is still empty, also turn off GPU compositing:

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 openfile
```

Still empty, or the nouveau driver (`lspci -k | grep -A3 VGA` shows `Kernel driver in use: nouveau`): draw without the GPU at all. Pages scroll a little slower, every tool works the same.

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_SKIA_ENABLE_CPU_RENDERING=1 openfile
```

To keep the fix for the menu launcher, copy the OpenFile `.desktop` file from `/usr/share/applications` to `~/.local/share/applications` and change its `Exec=` line to `Exec=env WEBKIT_DISABLE_DMABUF_RENDERER=1 openfile %U` (add the other variables from the command that worked the same way).

Settings from 1.2.1 on:

| Variable | What it does |
| --- | --- |
| `OPENFILE_SAFE_GPU=1` | Start in safe graphics mode right away (no DMA-BUF renderer, no GPU compositing) |
| `OPENFILE_SAFE_GPU=2` | Start in software mode right away (also no GPU drawing at all, Mesa and Skia draw on the CPU) |
| `OPENFILE_GPU=1` | Keep the WebKitGTK defaults, ignore a remembered mode and the nouveau check |
| `WEBKIT_*`, `LIBGL_*` | Any WebKitGTK or Mesa variable you set yourself always wins |

The mode OpenFile moved to is remembered in `~/.config/com.aniruddhaadak.openfile/safe-graphics`. Delete that file to try the faster mode again. The first line OpenFile prints in a terminal names the mode it started in, and `OpenFile: first frame drawn` follows once the window draws. On NVIDIA's own driver with Wayland, OpenFile also sets `__NV_DISABLE_EXPLICIT_SYNC=1`, which avoids the `Error 71 (Protocol error)` crash.

Other Linux start problems:

- AppImage does nothing: make it executable (`chmod +x`). Without FUSE 2, run it with `APPIMAGE_EXTRACT_AND_RUN=1` or install `libfuse2t64` (Ubuntu 24.04), `libfuse2` (Debian, older Ubuntu) or `fuse-libs` (Fedora).
- Every WebKitGTK app shows a blank window and uses a full CPU core: a broken font cache can cause this. Run `fc-cache -r` and start again.
- Still empty: start OpenFile from a terminal and add its output, your distribution, desktop, session type (`echo $XDG_SESSION_TYPE`) and GPU to an [issue](https://github.com/aniruddhaadak80/OpenFile/issues).

### Windows: nothing opens, or a WebView2 message

The Windows app draws its window with Microsoft Edge WebView2. The installer downloads it when it is missing and updates it when it is older than version 110. If OpenFile still does not open, install the [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (Evergreen Bootstrapper) and start OpenFile again. Windows 10 and 11 normally have it already.

### macOS

The `.dmg` is universal, so it runs on Apple silicon and Intel Macs with macOS 11 or later. If macOS says the app cannot be opened, see [Unsigned app warnings](#unsigned-app-warnings).

### Android

The app needs Android System WebView 94 or newer. With an older one it opens a page that asks you to update Android System WebView (or Chrome) from Google Play.

### The window says OpenFile did not finish starting

The app shows this message, with a **Try again** button, instead of an empty window when its code could not load (for example after a broken install or on a very old web engine). Click **Try again**. If it keeps coming back, reinstall the latest release.

## Reporting a problem

Open an [issue](https://github.com/aniruddhaadak80/OpenFile/issues) with your browser and system, what you did, and what the Status page shows.

<!-- gen:counts:start -->
OpenFile has **590 tools in 28 categories**. PDF Tools 63, Convert 35, Image 60, Video 40, Audio 26, Developer 65, Text & Data 47, Design 21, Data 15, AI 21, 3D 9, Archives 8, eBooks 8, Fonts 7, CAD 6, Subtitles 10, Security & Privacy 15, Maps & GPS 15, Office & Sheets 19, Science & Education 15, Creator Studio 14, Study & Classroom 12, Web & SEO 13, Calendar & Time 12, Money & Finance 10, Health & Fitness 6, AI Builder 9, Data Exports 9.
<!-- gen:counts:end -->
