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
