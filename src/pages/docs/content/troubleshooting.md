# Troubleshooting

Most problems come down to memory, a missing browser feature, or a first-time download. Start with the live check below, then find your symptom.

::component device-check

## Quick fixes

1. **Reload the page.** If a bar says a new version is ready, click it.
2. **Close other heavy tabs.** Everything runs in your tab's memory.
3. **Try Chrome or Edge** for video, AI and file handling features.
4. **Clear the offline cache** in [Settings](/settings) if a tool keeps failing after an update. Engines download again when needed.

## Large files and memory

There are no size caps, but the work happens in your tab's memory, and browsers limit how much one tab may use.

- **PDFs**: several hundred pages are fine on a desktop. For huge scanned PDFs, split them first with Split PDF, then work on parts.
- **Images**: very large photos can hit the browser canvas size limit, which is lower on iPhone and iPad. Resize first.
- **Video**: a few hundred MB works on a desktop. Keep the tab in the foreground during long encodes, browsers slow down background tabs.
- **Batches**: the Workspace processes one file at a time, so hundreds of files are fine, but the ZIP at the end is built in memory.
- **AI**: big models need a lot of memory. Pick the smaller model and close other tabs.

> [!TIP]
> If a tab crashes with an out-of-memory error, it does not affect your original files. Reload and try a smaller piece.

## Browser support

::include legacy:browser-support#Feature matrix

## Safari quirks

- **Storage can be evicted.** iOS Safari may delete cached engines and models when storage is low or after weeks without a visit. They download again when needed.
- **No install from Firefox desktop**, and Safari installs only through **File, Add to Dock** (Mac) or **Share, Add to Home Screen** (iPhone).
- **No file handling or share target.** Use drag and drop or the [Open page](/open).
- **Screen recording** with system audio is not available. Screen capture is desktop only on every browser.
- **AVIF and some encoders** depend on what the browser can encode. If an export option is missing, the browser does not support that format.
- **Downloads on iPhone** open a preview first. Tap Share, then **Save to Files**.

## Unsigned app warnings

The desktop installers and the Android APK are not signed with a paid certificate yet, so your system warns you the first time. They are built in public by GitHub Actions from this repository.

:::tabs os
@tab Windows
SmartScreen says **Windows protected your PC**. Click **More info**, then **Run anyway**.
@tab macOS
macOS says the app cannot be opened. Right-click OpenFile in Applications, choose **Open**, then **Open** again. Or System Settings, Privacy and Security, **Open Anyway**. Or:

```bash
xattr -dr com.apple.quarantine /Applications/OpenFile.app
```
@tab Android
Allow installs from your browser or Files app when asked. If Play Protect warns about an unknown developer, tap **More details**, then **Install anyway**.
@tab Linux
AppImages need to be executable: `chmod +x OpenFile-linux-x86_64.AppImage`. The `.deb` and `.rpm` install like any local package.
:::

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

## Specific problems

### A tool says my PDF is encrypted

Unlock it first with Unlock PDF (you need the password), then use the tool.

### The first run is slow

The tool is downloading its engine or model. It happens once. The next run starts fast and works offline.

### Video or audio export fails

Try a shorter clip, or the fast lossless mode in the trimmer, which does not re-encode. Make sure the tab stays visible.

### The screen recorder has no system audio

System audio capture works for tabs on Chromium browsers, and for the whole screen only on some systems. Share a tab and tick **Share tab audio**.

### I cleared my browser data and lost my favorites

Favorites, history, recipes and settings live in the browser. Export them in Settings next time, and import the file to restore.

### The page looks broken after an update

An old copy may be cached. Reload once, or click the new version bar. If it persists, clear the offline cache in Settings.

## Still stuck

Open the [Status](/status) page and include what it shows when you [open an issue](https://github.com/aniruddhaadak80/OpenFile/issues). More answers are in the [FAQ](/docs/faq).
