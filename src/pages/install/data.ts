// Content for the Install page and its guide: one entry per platform with install, update and uninstall steps.
// Each step can name a mock screen (see Mock.tsx) that shows where to click, and commands with copy buttons.
import { ASSETS, dl, RELEASES, type PlatformId } from '@/lib/app/platform'

export type MockKind =
  | 'browser-bar' | 'browser-menu' | 'install-dialog' | 'app-window'
  | 'phone-share' | 'phone-sheet' | 'phone-add' | 'phone-home'
  | 'android-menu' | 'android-install' | 'android-unknown' | 'android-home'
  | 'win-download' | 'win-smartscreen' | 'win-installer' | 'win-start' | 'win-settings'
  | 'mac-dmg' | 'mac-gatekeeper' | 'mac-settings' | 'mac-launchpad' | 'mac-trash'
  | 'linux-terminal' | 'linux-launcher'
  | 'chromeos-shelf' | 'chromeos-uninstall'
  | 'update-bar' | 'release-page'

export interface Step { title: string; body: string; mock?: MockKind; cmd?: string[]; link?: { label: string; href: string } }
export interface Guide { id: GuideId; label: string; short: string; color: string; install: Step[]; update: Step[]; uninstall: Step[] }
export type GuideId = Exclude<PlatformId, 'web'> | 'web'

export const GUIDES: Guide[] = [
  {
    id: 'web', label: 'Web app (any browser)', short: 'Web app', color: '#F5A524',
    install: [
      { title: 'Open OpenFile in Chrome, Edge, Brave or Opera', body: 'Go to the OpenFile site in a Chromium browser on Windows, macOS, Linux or ChromeOS. Safari on macOS Sonoma and later works too.', mock: 'browser-bar' },
      { title: 'Click Install', body: 'Use the Install button in the OpenFile header or on this page. You can also click the small install icon at the right end of the address bar.', mock: 'browser-bar' },
      { title: 'Or use the browser menu', body: 'Chrome: menu (three dots), Cast, save and share, Install page as app. Edge: menu, Apps, Install OpenFile. Safari: File, Add to Dock.', mock: 'browser-menu' },
      { title: 'Confirm', body: 'Click Install in the small dialog. OpenFile opens in its own window and shows up with your other apps.', mock: 'install-dialog' },
      { title: 'Use it offline', body: 'Open a few tools once while online. OpenFile saves the app and each engine you use on this device, so they keep working without a connection.', mock: 'app-window' },
    ],
    update: [
      { title: 'Updates arrive on their own', body: 'When a new version is ready, OpenFile shows a small bar that says New version ready, reload. Click Reload and you are on the latest build.', mock: 'update-bar' },
      { title: 'Check right now', body: 'Close every OpenFile window and open it again. The app looks for a new build each time it starts and every half hour while it is open.', mock: 'app-window' },
    ],
    uninstall: [
      { title: 'From the app window', body: 'Open the menu (three dots) in the OpenFile window title bar and choose Uninstall OpenFile.', mock: 'browser-menu' },
      { title: 'Or from your system', body: 'Windows: Settings, Apps, OpenFile, Uninstall. macOS: drag OpenFile from Applications to the Bin. ChromeOS: right-click the icon, Uninstall.', mock: 'win-settings' },
      { title: 'Clear saved data if you like', body: 'Uninstalling keeps your settings in the browser. To remove everything, clear site data for OpenFile in your browser settings.' },
    ],
  },
  {
    id: 'windows', label: 'Windows 10 and 11', short: 'Windows', color: '#38BDF8',
    install: [
      { title: 'Download the installer', body: 'Pick the .exe setup (recommended) or the .msi package for managed PCs. Both are 64-bit and work on Windows 10 and 11.', mock: 'win-download', link: { label: 'Download .exe', href: dl(ASSETS.winExe) } },
      { title: 'Get past SmartScreen', body: 'The app is not code signed yet, so Windows may show Windows protected your PC. Click More info, then Run anyway. This is normal for new open source apps.', mock: 'win-smartscreen' },
      { title: 'Run the setup', body: 'Click Next, then Install. It takes a few seconds and does not need admin rights for the .exe.', mock: 'win-installer' },
      { title: 'Open OpenFile', body: 'Find OpenFile in the Start menu. Pin it to the taskbar if you use it often. Everything works offline from the first launch.', mock: 'win-start' },
    ],
    update: [
      { title: 'Download the newest installer', body: 'Grab the latest .exe from the releases page and run it. It updates OpenFile in place and keeps your settings.', mock: 'release-page', link: { label: 'Latest release', href: RELEASES } },
    ],
    uninstall: [
      { title: 'Open Settings, Apps', body: 'Press Win + I, open Apps, then Installed apps. Search for OpenFile.', mock: 'win-settings' },
      { title: 'Click Uninstall', body: 'Click the three dots next to OpenFile, choose Uninstall and confirm. Your files were never stored by the app, so nothing else is left behind.', mock: 'win-settings' },
    ],
  },
  {
    id: 'macos', label: 'macOS 11 and later', short: 'macOS', color: '#E5E7EB',
    install: [
      { title: 'Download the .dmg', body: 'One universal file runs natively on Apple silicon (M1 to M4) and Intel Macs.', mock: 'mac-dmg', link: { label: 'Download .dmg', href: dl(ASSETS.macDmg) } },
      { title: 'Drag to Applications', body: 'Open the .dmg and drag OpenFile onto the Applications folder.', mock: 'mac-dmg' },
      { title: 'First launch: right-click, Open', body: 'The app is not notarised yet, so a double-click shows a warning. In Applications, right-click (or Control-click) OpenFile, choose Open, then Open again. You only do this once.', mock: 'mac-gatekeeper' },
      { title: 'If macOS still blocks it', body: 'Open System Settings, Privacy and Security, scroll down and click Open Anyway next to OpenFile. Or run the command below in Terminal.', mock: 'mac-settings', cmd: ['xattr -dr com.apple.quarantine /Applications/OpenFile.app'] },
      { title: 'Keep it in the Dock', body: 'OpenFile now opens from Launchpad and Spotlight. Right-click its Dock icon, Options, Keep in Dock.', mock: 'mac-launchpad' },
    ],
    update: [
      { title: 'Replace the app', body: 'Download the newest .dmg and drag OpenFile to Applications again. Choose Replace when asked.', mock: 'mac-dmg', link: { label: 'Latest release', href: RELEASES } },
    ],
    uninstall: [
      { title: 'Move it to the Bin', body: 'Open Applications and drag OpenFile to the Bin, or right-click it and choose Move to Bin.', mock: 'mac-trash' },
      { title: 'Remove leftover settings (optional)', body: 'The app keeps a small settings folder. Delete it with this command if you want a clean slate.', cmd: ['rm -rf ~/Library/Application\\ Support/com.aniruddhaadak.openfile ~/Library/WebKit/com.aniruddhaadak.openfile'] },
    ],
  },
  {
    id: 'linux', label: 'Linux (x86_64)', short: 'Linux', color: '#F97316',
    install: [
      { title: 'Pick a package', body: 'AppImage runs on almost any distro without installing. Use .deb on Ubuntu, Debian, Mint and Pop OS, or .rpm on Fedora and openSUSE.', mock: 'linux-terminal', link: { label: 'Download AppImage', href: dl(ASSETS.linuxAppImage) } },
      { title: 'AppImage: make it runnable', body: 'Mark the file as executable, then double-click it or run it from a terminal.', mock: 'linux-terminal', cmd: ['chmod +x OpenFile-linux-x86_64.AppImage', './OpenFile-linux-x86_64.AppImage'] },
      { title: 'Or install the .deb', body: 'apt pulls in the WebKitGTK libraries the app needs.', mock: 'linux-terminal', cmd: ['sudo apt install ./OpenFile-linux-amd64.deb'] },
      { title: 'Or install the .rpm', body: 'For Fedora, RHEL and openSUSE.', mock: 'linux-terminal', cmd: ['sudo dnf install ./OpenFile-linux-x86_64.rpm'] },
      { title: 'Launch', body: 'Find OpenFile in your app launcher. The .deb and .rpm add a menu entry for you.', mock: 'linux-launcher' },
    ],
    update: [
      { title: 'Install the new package over the old one', body: 'Download the latest file and repeat the same command. For AppImage, replace the old file.', mock: 'linux-terminal', cmd: ['sudo apt install ./OpenFile-linux-amd64.deb'], link: { label: 'Latest release', href: RELEASES } },
    ],
    uninstall: [
      { title: 'Remove the package', body: 'Use the command for how you installed it. For AppImage, just delete the file.', mock: 'linux-terminal', cmd: ['sudo apt remove open-file', 'sudo dnf remove open-file'] },
    ],
  },
  {
    id: 'android', label: 'Android 7 and later', short: 'Android', color: '#10B981',
    install: [
      { title: 'Fastest: install the web app', body: 'Open OpenFile in Chrome, tap the menu (three dots), then Install app. It works offline and takes almost no space.', mock: 'android-menu' },
      { title: 'Or get the APK', body: 'Download the Android app from the latest release on your phone.', mock: 'android-install', link: { label: 'Download APK', href: dl(ASSETS.androidApk) } },
      { title: 'Allow the install', body: 'Android asks once to allow installs from your browser or Files app. Turn on Allow from this source, then go back.', mock: 'android-unknown' },
      { title: 'Tap Install', body: 'Play Protect may say it does not know the developer. Tap Install anyway or More details, then Install anyway.', mock: 'android-install' },
      { title: 'Open from your home screen', body: 'OpenFile shows up in your app drawer. Share files to it from any app.', mock: 'android-home' },
    ],
    update: [
      { title: 'Web app', body: 'Updates itself. You will see New version ready, reload when a new build lands.', mock: 'update-bar' },
      { title: 'APK', body: 'Download the latest APK and install it over the old one. Your settings stay.', mock: 'android-install', link: { label: 'Latest release', href: RELEASES } },
    ],
    uninstall: [
      { title: 'Long-press the icon', body: 'Long-press OpenFile on your home screen or app drawer and tap Uninstall (or drag it to Uninstall).', mock: 'android-home' },
    ],
  },
  {
    id: 'ios', label: 'iPhone and iPad', short: 'iOS', color: '#22D3EE',
    install: [
      { title: 'Open OpenFile in Safari', body: 'Safari works on every iPhone and iPad. On iOS 16.4 and later, Chrome and Edge can add it too.', mock: 'phone-share' },
      { title: 'Tap Share', body: 'Tap the Share button (the square with an arrow) at the bottom of Safari, or at the top on iPad.', mock: 'phone-share' },
      { title: 'Tap Add to Home Screen', body: 'Scroll the share sheet and tap Add to Home Screen. Keep Open as Web App switched on if you see it.', mock: 'phone-sheet' },
      { title: 'Tap Add', body: 'OpenFile lands on your home screen and opens full screen, like any other app. It works offline after the first visit.', mock: 'phone-add' },
    ],
    update: [
      { title: 'It updates itself', body: 'Open the app while online. When a new build is ready, tap Reload on the New version ready bar.', mock: 'update-bar' },
    ],
    uninstall: [
      { title: 'Remove from the home screen', body: 'Touch and hold the OpenFile icon, tap Remove App, then Delete from Home Screen.', mock: 'phone-home' },
    ],
  },
  {
    id: 'chromeos', label: 'ChromeOS', short: 'ChromeOS', color: '#84CC16',
    install: [
      { title: 'Open OpenFile in Chrome', body: 'Any Chromebook works, including school and work devices that allow web apps.', mock: 'browser-bar' },
      { title: 'Click Install', body: 'Click the install icon in the address bar, or the Install button in the OpenFile header.', mock: 'install-dialog' },
      { title: 'Find it in the launcher', body: 'OpenFile appears in the launcher and can be pinned to the shelf. Files you open from the Files app can go straight to it.', mock: 'chromeos-shelf' },
      { title: 'Prefer Android apps?', body: 'Chromebooks with Play Store support can also install the Android APK.', link: { label: 'Download APK', href: dl(ASSETS.androidApk) } },
    ],
    update: [
      { title: 'Automatic', body: 'The installed web app updates with the site. Reload when you see New version ready.', mock: 'update-bar' },
    ],
    uninstall: [
      { title: 'Right-click, Uninstall', body: 'In the launcher, right-click OpenFile and choose Uninstall, then confirm.', mock: 'chromeos-uninstall' },
    ],
  },
]

export const FAQ: { q: string; a: string }[] = [
  { q: 'Do my files get uploaded anywhere?', a: 'No. Every tool runs on your device, in the web app and in the desktop and mobile apps alike. There is no account and no server that sees your files.' },
  { q: 'Does it work offline?', a: 'Yes. The installed web app saves itself on your device, and each engine (PDF, image, video, AI models) is saved the first time you use it. The desktop and mobile apps ship the whole app inside, so they work offline from the first launch, except for the large AI models which download once on first use.' },
  { q: 'How big is it?', a: 'The web app takes a few megabytes up front and grows only with the engines you use. The Windows installers are about 70 to 90 MB, the Linux .deb and .rpm about 90 MB, and the AppImage and the macOS app about 160 to 180 MB (the macOS file holds both the Apple silicon and Intel builds). The Android APK is about 100 MB. They bundle every engine, so they work offline from the first launch.' },
  { q: 'Windows says it protected my PC. Is it safe?', a: 'SmartScreen warns about any new app that is not code signed with a paid certificate. Click More info, then Run anyway. The installer is built in public on GitHub Actions from the open source code, so you can check exactly what went into it.' },
  { q: 'macOS says the app cannot be opened.', a: 'Gatekeeper blocks apps that are not notarised by Apple. Right-click OpenFile in Applications, choose Open, then Open again. Or use System Settings, Privacy and Security, Open Anyway. You only need to do it once.' },
  { q: 'Android warns about an unknown app.', a: 'The APK is not on Google Play yet, so Android asks you to allow installs from your browser once. The web app install from Chrome needs no permission at all.' },
  { q: 'Is there an App Store version for iPhone?', a: 'Not yet. Publishing on the App Store needs a paid Apple developer account. Until then, Add to Home Screen gives you the same app, full screen and offline.' },
  { q: 'Which one should I pick?', a: 'The web app is the lightest and always up to date. Pick the desktop app if you want a classic installed program, file associations from your system, or a computer where you rarely use a browser.' },
  { q: 'Will my history and settings carry over?', a: 'Settings live with each install, on that device. Use Settings, Backup to export them from one install and import them into another.' },
]
