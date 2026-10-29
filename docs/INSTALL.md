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
- When a new version is ready, a bar says **New version ready, reload**. Click **Reload**. See [Updates](#updates) for how and when it checks.
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

Update: the app updates itself (see [Updates](#updates)). The `.deb` and `.rpm` packages can also be updated by installing the new package the same way. Uninstall: `sudo apt remove open-file` or `sudo dnf remove open-file` (the package is named `open-file`), or delete the AppImage.

## Android app (APK)

1. On your phone, download `OpenFile-android.apk`.
2. When Android asks, allow installs from your browser or Files app (**Allow from this source**).
3. Tap **Install**. If Play Protect warns about an unknown developer, tap **More details**, **Install anyway**.

Files you save in the app go to **Downloads/OpenFile**. The app checks for new versions itself (see [Updates](#updates)). Uninstall by long-pressing the icon.

From v1.2.0 the APK is signed with OpenFile's permanent release key, so every later APK installs over it. **If you installed the v1.1.0 APK, uninstall it once** before installing v1.2.0: v1.1.0 was signed with a temporary debug key, and Android refuses to update an app with a different key. Your saved files in Downloads/OpenFile stay. A Play Store release also needs a Play developer account.

## iOS app

iPhone and iPad users can install the web app today (Share, Add to Home Screen). The repository also contains a Capacitor iOS project (`mobile/ios`) and CI builds it for the iOS Simulator (`OpenFile-ios-simulator.zip` in the release). Shipping on the App Store or TestFlight needs a paid Apple developer account and signing certificates.

## Updates

Every version of OpenFile keeps itself current. Defaults are safe: OpenFile checks automatically, and asks before it installs anything unless you turn on automatic installs. Settings, **Updates** shows the current version, when it last checked, and every control below.

### What each platform does

| Platform | How it updates | What you see |
| --- | --- | --- |
| Web app (any browser, installed or not) | The service worker checks for a new build every 30 minutes, when the app gets focus or comes back to the screen, and when you reconnect. It downloads in the background. | A bar: **New version ready, reload**, with **What's new**. Reloading takes a second and keeps your settings. |
| iPhone and iPad (home screen web app) | Same as the web app. iOS pauses home screen apps in the background, so the check runs when you open or switch back to OpenFile. | The same bar. |
| Windows, macOS, Linux (desktop app, v1.2.0 and later) | Signed updates from GitHub Releases. The app reads `latest.json`, downloads the bundle for your system, checks its signature against the OpenFile key built into the app, installs it and relaunches. | A gold card: **Update ready: vX.Y.Z** with **Install now**, **Later** and **What's new**. Install now shows the release notes first, then a progress bar. |
| Android app (APK, v1.2.0 and later) | Compares the app version with the newest GitHub release. Downloads `OpenFile-android.apk` into the app, checks that it is OpenFile, newer, and signed with the same key, then opens the Android installer. | The same gold card. Android always shows its own install screen. The first time, allow OpenFile to install apps when Android asks. |
| iOS app (Capacitor build) | Not on the App Store yet. App Store updates need an Apple developer account (planned). Use the home screen web app, which updates itself. | Nothing. |

Desktop v1.1.0 and Android v1.1.0 have no updater: install v1.2.0 once by hand, and every version after that updates in the app.

### Settings, Updates

- **Current version** and **last checked**, with **Check now** and **What's new**.
- **Update channel** (desktop and Android): **Stable** gets tested releases. **Beta** also gets prereleases such as `1.3.0-beta.1`. Both use semantic versioning, so `1.3.0-beta.2` comes before `1.3.0`, which comes before `1.3.1`.
- **Check for updates**: **On launch** (default, also every 6 hours while open), **Daily**, **Weekly** or **Off** (only Check now).
- **Auto install updates** (default off). Off: OpenFile asks first. On, desktop: the update downloads in the background and installs when you quit OpenFile, or right away if you click Install now. On, Android: the APK downloads in the background, and Android still asks before installing.
- **Only on Wi-Fi** (Android, default on): downloads wait for Wi-Fi or another unmetered connection. On mobile data you can still choose **Download anyway**.
- **Later**: **Remind me tomorrow** (1 day), **Remind me next week** (1 week), or **Skip this version** (you will still be offered the next one). Settings shows what you skipped or snoozed, with **Show it again**.
- **Roll back** (desktop): reinstalls the version you had before the last update, downloaded from its own signed release.
- **Use latest web version** (desktop and mobile apps): **Ask** (default), **Always** or **Never**. See below.

### New tools between app releases (hybrid mode)

New tools reach the website first. When the apps start online they quietly compare their built-in copy with the website's `version.json`. If the website is newer, OpenFile offers **New tools available, load them**. Loading them opens the hosted app (https://aniruddhaadak80.github.io/OpenFile/) inside the same window, marked **Latest web version**, with **Use built-in copy** to switch back.

- Files still save to your device, and nothing is uploaded: the hosted app runs the same local tools.
- The built-in copy is always where the app starts and is the offline fallback.
- Only OpenFile's own site can open inside the app. Every other link opens in your browser.
- A website build that needs a newer app than yours is not offered; update the app instead.

### Safety

- **Signed desktop updates.** Every update bundle is signed with the OpenFile updater key (minisign, ed25519). The app refuses a bundle whose signature does not match the public key in `desktop/src-tauri/tauri.conf.json`. The release workflow downloads each bundle again after publishing and verifies its signature the same way (`scripts/verify-updater.mjs`).
- **Verified APKs.** The Android app installs only an APK that is OpenFile, has a higher version code, and carries the same signing certificate as the installed app. Downloads come only from this repository's releases, over HTTPS.
- **Rollback on a bad start.** Before a desktop update installs, the running version is recorded. If the new version fails to finish starting three times in a row, OpenFile offers to roll back to the previous version. Settings also has a one-click **Roll back** while the previous version is known. Rollback works for versions from v1.2.0 on, because older releases have no signed feed.
- **Staged rollout.** Prereleases (`v1.3.0-beta.1`) go to the Beta channel only. GitHub never marks a prerelease as latest, so Stable users get a version only after it is published as a full release.
- **Release notes before installing.** The notes come from the GitHub release, which the workflow generates from the commit history.

### For maintainers: shipping a release

1. Write commits as [Conventional Commits](https://www.conventionalcommits.org): `feat(pdf): add page numbers`, `fix(updates): retry on timeout`, `feat!: ...` for breaking changes.
2. Set the version everywhere with one command: `node scripts/bump-version.mjs 1.3.0` (package.json, desktop, Cargo.toml, Android versionName and versionCode, iOS). `node scripts/bump-version.mjs --check` fails if any file disagrees. versionCode is `(major*10000 + minor*100 + patch)*100 + 99` (`1.2.0` is `1020099`); a prerelease uses its last number instead of 99, so codes always grow.
3. Update the changelog from the commits: `node scripts/changelog.mjs --version v1.3.0 --write`. Commit as `chore(release): v1.3.0`.
4. Tag and push: `git tag v1.3.0 && git push origin v1.3.0`. For a beta, tag `v1.3.0-beta.1` (no version commit needed; the workflow sets the version for prerelease builds).
5. `.github/workflows/release-apps.yml` builds every platform, writes the release notes from conventional commits, uploads the signed update bundles and `.sig` files, publishes `latest.json`, and verifies it: every URL answers 200, every signature verifies, and a 1.1.0 install would be offered the new version.

Every web build also writes `version.json` (version, commit, build time, tool count) next to `index.html`, for both the Vercel and the GitHub Pages base.

Secrets the workflow needs (repository Settings, Secrets and variables, Actions):

| Secret | What it is |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Desktop updater private key (from `npx tauri signer generate`). Its public key is in `tauri.conf.json`. Losing it means installed apps cannot verify future updates, so keep a backup. |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Its password. |
| `ANDROID_KEYSTORE_BASE64` | The release keystore (PKCS12), base64 encoded. The same key must sign every APK, or Android refuses the update. |
| `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD` | Keystore and key password (the same value for a PKCS12 keystore). |
| `ANDROID_KEY_ALIAS` | Key alias (`openfile`). |

Without the Tauri secrets the desktop builds still succeed but publish no `latest.json`, so installed apps see no update. Without the Android secrets the workflow ships a debug-signed APK, which cannot update a release-signed install.

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

Release a new version: see [For maintainers: shipping a release](#for-maintainers-shipping-a-release) (`node scripts/bump-version.mjs`, `node scripts/changelog.mjs`, then a `v*` tag).

### Signing (owner)

- Windows: add an Authenticode certificate and set `bundle.windows.certificateThumbprint` (or use Azure Trusted Signing) to remove SmartScreen warnings.
- macOS: an Apple Developer ID certificate plus notarisation (`APPLE_CERTIFICATE`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` secrets) removes the Gatekeeper step.
- Android: the release keystore is set up (secrets above, `signingConfigs.release` in `mobile/android/app/build.gradle`). Publishing on Google Play also needs a Play developer account.
- iOS: an Apple developer account is required for TestFlight and the App Store.
