# Install on every device

OpenFile runs in any modern browser with nothing to install. If you use it often, install it as an app: it gets its own window and icon, opens files from your system, and works offline. Every version runs the same {{TOOL_COUNT}} tools on your device.

> [!TIP]
> The [Install page](/install) detects your device and walks you through it with drawn screens for each step. This page is the written reference.

## Pick your option

| Device | Best option | What you get |
| --- | --- | --- |
| Any computer with Chrome, Edge, Brave or Opera | Web app | Installs in a second, updates itself, opens files from your system |
| Windows 10 and 11 (64-bit) | Desktop app or web app | `.exe` setup or `.msi` |
| macOS 11 and later | Desktop app or Safari web app | Universal `.dmg` for Apple silicon and Intel |
| Linux x86_64 | Desktop app or web app | AppImage, `.deb` or `.rpm` |
| Android 7 and later | Web app from Chrome, or the APK | Share files to OpenFile from other apps |
| iPhone and iPad | Web app from Safari | Home screen icon, works offline |
| ChromeOS | Web app from Chrome | Same as desktop Chrome |

The desktop and Android apps are version **{{APP_VERSION}}**. Download them from the [latest release](https://github.com/aniruddhaadak80/OpenFile/releases/latest). They are built in public by GitHub Actions from this repository.

## Install the web app

:::tabs browser
@tab Chrome and Edge
1. Open OpenFile.
2. Click **Install** in the OpenFile header, or the install icon at the right end of the address bar.
3. No icon? Chrome: menu, **Cast, save and share**, **Install page as app**. Edge: menu, **Apps**, **Install OpenFile**.
4. Click **Install**. OpenFile opens in its own window.
@tab Safari on Mac
1. Open OpenFile in Safari on macOS Sonoma or later.
2. In the menu bar choose **File**, then **Add to Dock**.
3. Click **Add**.
@tab iPhone and iPad
1. Open OpenFile in Safari (Chrome and Edge also work on iOS 16.4 and later).
2. Tap **Share**, the square with an arrow.
3. Tap **Add to Home Screen**. Keep **Open as Web App** on if you see it.
4. Tap **Add**.
@tab Android
1. Open OpenFile in Chrome.
2. Tap the menu, then **Install app** (or **Add to Home screen**).
3. Tap **Install**.

Samsung Internet: menu, **Add page to**, **Home screen**. Firefox for Android: menu, **Install**.
@tab Firefox desktop
Firefox on desktop does not install web apps. Use the desktop app for your system, or install from Chrome or Edge. OpenFile itself works fine in Firefox as a normal tab.
:::

## Install the desktop app

:::tabs os
@tab Windows
1. Download `OpenFile-windows-x64-setup.exe`, or the `.msi` for managed PCs.
2. If SmartScreen says **Windows protected your PC**, click **More info**, then **Run anyway**.
3. Click **Next**, then **Install**. The `.exe` installs for your user and needs no admin rights.

Update by installing the newer `.exe` over the old one.
@tab macOS
1. Download `OpenFile-macos-universal.dmg`.
2. Open it and drag **OpenFile** to **Applications**.
3. First launch: right-click OpenFile in Applications, choose **Open**, then **Open** again.

Still blocked? System Settings, Privacy and Security, **Open Anyway**, or run:

```bash
xattr -dr com.apple.quarantine /Applications/OpenFile.app
```
@tab Linux
```bash
# AppImage, any distro
chmod +x OpenFile-linux-x86_64.AppImage
./OpenFile-linux-x86_64.AppImage

# Debian, Ubuntu, Mint, Pop OS
sudo apt install ./OpenFile-linux-amd64.deb

# Fedora, RHEL, openSUSE
sudo dnf install ./OpenFile-linux-x86_64.rpm
```

The package is named `open-file`, so remove it with `sudo apt remove open-file` or `sudo dnf remove open-file`.
@tab Android APK
1. On your phone, download `OpenFile-android.apk`.
2. When Android asks, allow installs from your browser or Files app.
3. Tap **Install**. If Play Protect warns about an unknown developer, tap **More details**, then **Install anyway**.

Files you save in the app go to **Downloads/OpenFile**.
:::

> [!WARNING]
> The desktop installers and the APK are not code signed with a paid certificate yet, so Windows, macOS and Android show a warning the first time. The steps above are the safe way past it. See [Troubleshooting](/docs/troubleshooting#unsigned-app-warnings).

## Which one should I use

The web app is the lightest: a few MB up front, growing only with the engines you actually use. The desktop and mobile apps bundle every engine, so they work offline from the first launch, but AI models still download once the first time you use an AI tool. Both run exactly the same code.

More detail for builders and packagers lives in [docs/INSTALL.md](https://github.com/aniruddhaadak80/OpenFile/blob/main/docs/INSTALL.md).
