# Install OpenFile

OpenFile runs in any modern browser, and you can also install it as an app on every device you own. Every option runs the same tools on your device. Nothing is uploaded.

- Interactive guide with drawn screens for each step: **https://aniruddhaadak80.github.io/OpenFile/install** (also at https://openfile-studio.vercel.app/install)
- Downloads: **https://github.com/aniruddhaadak80/OpenFile/releases/latest**
- 44 second video: [`public/media/apps.mp4`](../public/media/apps.mp4) (vertical cut: [`apps-vertical.mp4`](../public/media/apps-vertical.mp4))

| Platform | Best option | Direct download |
| --- | --- | --- |
| Any computer with Chrome, Edge, Brave or Opera | Web app (Install button) | none needed |
| Windows 10 and 11 (64-bit) | Desktop app | [OpenFile-windows-x64-setup.exe](https://github.com/aniruddhaadak80/OpenFile/releases/latest/download/OpenFile-windows-x64-setup.exe) · [.msi](https://github.com/aniruddhaadak80/OpenFile/releases/latest/download/OpenFile-windows-x64.msi) |
| macOS 11+ (Apple silicon and Intel) | Desktop app | [OpenFile-macos-universal.dmg](https://github.com/aniruddhaadak80/OpenFile/releases/latest/download/OpenFile-macos-universal.dmg) |
| Linux x86_64 | Desktop app | [AppImage](https://github.com/aniruddhaadak80/OpenFile/releases/latest/download/OpenFile-linux-x86_64.AppImage) · [.deb](https://github.com/aniruddhaadak80/OpenFile/releases/latest/download/OpenFile-linux-amd64.deb) · [.rpm](https://github.com/aniruddhaadak80/OpenFile/releases/latest/download/OpenFile-linux-x86_64.rpm) |
| Android 7+ | Web app from Chrome, or the APK | [OpenFile-android.apk](https://github.com/aniruddhaadak80/OpenFile/releases/latest/download/OpenFile-android.apk) |
| iPhone and iPad | Web app: Share, Add to Home Screen | App Store version later |
| ChromeOS | Web app from Chrome (or the APK) | none needed |

## Web app (PWA)

The web app is the lightest option. It installs in a second, works offline, opens files from your system (Chrome and Edge on desktop) and updates itself.

### Chrome, Edge, Brave, Opera on Windows, macOS, Linux and ChromeOS

1. Open OpenFile.
2. Click **Install** in the OpenFile header, or the install icon at the right end of the address bar.
3. No icon? Chrome: menu (three dots), **Cast, save and share**, **Install page as app**. Edge: menu, **Apps**, **Install OpenFile**.
4. Click **Install**. OpenFile opens in its own window and shows up with your apps.

### Safari on macOS Sonoma and later

1. Open OpenFile in Safari.
2. Menu bar: **File**, **Add to Dock**.
3. Click **Add**.

### Firefox on desktop

Firefox on desktop does not install web apps. Use the desktop app for your system, or Chrome or Edge.

### Android

1. Open OpenFile in Chrome.
2. Tap the menu (three dots), then **Install app** (or **Add to Home screen**).
3. Tap **Install**.

Samsung Internet: menu (three lines), **Add page to**, **Home screen**. Firefox for Android: menu, **Install**.

### iPhone and iPad

1. Open OpenFile in Safari (Chrome and Edge also work on iOS 16.4 and later).
2. Tap **Share** (the square with an arrow).
3. Tap **Add to Home Screen**. Keep **Open as Web App** on if you see it.
4. Tap **Add**.

### Offline, updates and removing it

- Open a few tools once while online. The app shell and every engine you use are saved on your device, so they keep working offline. The footer shows **Offline ready** once the app is saved.
- When a new version is ready, a bar says **New version ready, reload**. Click **Reload**.
- Uninstall: in the app window menu, **Uninstall OpenFile**. Or Windows Settings, Apps. On a phone, long-press the icon and remove it.

## Desktop apps (Windows, macOS, Linux)

Built with [Tauri](https://tauri.app) around the same web build, so they are small for what they hold and work offline from the first launch. AI models still download once, the first time you use an AI tool.

The apps are **not code signed yet**, so your system will warn you the first time.

### Windows

1. Download `OpenFile-windows-x64-setup.exe` (or the `.msi` for managed PCs).
2. If SmartScreen says **Windows protected your PC**, click **More info**, then **Run anyway**.
3. Click **Next**, then **Install**. The `.exe` installs for your user and needs no admin rights.
4. Find OpenFile in the Start menu.

Update: install the newest `.exe` over the old one. Uninstall: Settings, Apps, Installed apps, OpenFile, Uninstall.

### macOS

1. Download `OpenFile-macos-universal.dmg` (runs natively on Apple silicon and Intel).
2. Open it and drag **OpenFile** to **Applications**.
3. First launch: in Applications, **right-click** (or Control-click) OpenFile, choose **Open**, then **Open** again.
4. Still blocked? System Settings, Privacy and Security, **Open Anyway**. Or in Terminal:

```bash
xattr -dr com.apple.quarantine /Applications/OpenFile.app
```

Update: drag the new version to Applications and choose Replace. Uninstall: move OpenFile from Applications to the Bin.

### Linux

```bash
# AppImage: any distro
chmod +x OpenFile-linux-x86_64.AppImage
./OpenFile-linux-x86_64.AppImage

# Debian, Ubuntu, Mint, Pop OS
sudo apt install ./OpenFile-linux-amd64.deb

# Fedora, RHEL, openSUSE
sudo dnf install ./OpenFile-linux-x86_64.rpm
```

Update: install the new package the same way. Uninstall: `sudo apt remove open-file` or `sudo dnf remove open-file` (the package is named `open-file`), or delete the AppImage.

## Android app (APK)

1. On your phone, download `OpenFile-android.apk`.
2. When Android asks, allow installs from your browser or Files app (**Allow from this source**).
3. Tap **Install**. If Play Protect warns about an unknown developer, tap **More details**, **Install anyway**.

Files you save in the app go to **Downloads/OpenFile**. Update by installing the newer APK over the old one. Uninstall by long-pressing the icon.

The APK is a debug-signed build so it can be sideloaded. A Play Store release needs a signing key and a Play developer account.

## iOS app

iPhone and iPad users can install the web app today (Share, Add to Home Screen). The repository also contains a Capacitor iOS project (`mobile/ios`) and CI builds it for the iOS Simulator (`OpenFile-ios-simulator.zip` in the release). Shipping on the App Store or TestFlight needs a paid Apple developer account and signing certificates.

## FAQ

- **Do my files get uploaded?** No. Every tool runs on your device in all versions.
- **Does it work offline?** Yes. The desktop and mobile apps include the whole app. The web app saves itself and each engine the first time you use it.
- **How big is it?** The web app takes a few MB up front and grows with the engines you use. Desktop installers bundle every engine: about 67 MB (.exe) and 88 MB (.msi) on Windows, about 90 MB for the Linux .deb and .rpm, about 157 MB for the AppImage and about 179 MB for the universal macOS .dmg. The Android APK is about 100 MB.
- **Why the security warnings?** The installers are not code signed with a paid certificate yet. They are built in public by GitHub Actions from this repository (`.github/workflows/release-apps.yml`).

## For contributors: build the apps

Everything wraps the normal web build in `dist/`. `scripts/prepare-app-dist.mjs` slims it for the apps (tool preview videos stream from the website instead of being bundled).

| Target | Needs | Command |
| --- | --- | --- |
| Web app assets (icons, screenshots, splash) | Node 22 | `npm run app:assets` |
| Desktop (current OS) | Rust stable, plus WebKitGTK on Linux | `npm run app:desktop` |
| Desktop dev window | same | `npm run app:desktop:dev` |
| Android debug APK | JDK 21, Android SDK | `npm run app:android` |
| iOS (opens Xcode) | macOS, Xcode 16+ | `npm run app:ios` |

Linux packages for Tauri: `sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`.

Project layout:

- `desktop/` Tauri v2 app (`desktop/src-tauri/tauri.conf.json`, icons from `desktop/app-icon.png` via `npx tauri icon`).
- `mobile/` Capacitor 8 app (`mobile/capacitor.config.json`, `mobile/android`, `mobile/ios`). `MainActivity` and `SaverPlugin` save blob downloads to Downloads/OpenFile, which Android WebView cannot do on its own.
- `public/manifest.webmanifest`, `public/sw.js`, `public/offline.html` for the web app. `scripts/postbuild.mjs` writes base-absolute manifest URLs and the service worker precache list for each deploy target.
- `.github/workflows/release-apps.yml` builds every platform on a `v*` tag (or manual run) and attaches fixed-name assets to the GitHub Release, so `releases/latest/download/<name>` links never go stale.

Release a new version: bump `version` in `desktop/src-tauri/tauri.conf.json`, `desktop/src-tauri/Cargo.toml` and `versionName`/`versionCode` in `mobile/android/app/build.gradle`, then push a tag such as `v1.2.0`.

### Signing (owner)

- Windows: add an Authenticode certificate and set `bundle.windows.certificateThumbprint` (or use Azure Trusted Signing) to remove SmartScreen warnings.
- macOS: an Apple Developer ID certificate plus notarisation (`APPLE_CERTIFICATE`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` secrets) removes the Gatekeeper step.
- Android: create a keystore, add it as a secret and a `signingConfigs.release` block to publish on Google Play.
- iOS: an Apple developer account is required for TestFlight and the App Store.
