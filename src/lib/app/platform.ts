// Works out which device and browser the visitor is on, so the Install page can point at the best option.
// Also knows the release asset names built by .github/workflows/release-apps.yml.

export type PlatformId = 'web' | 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'chromeos'
export type BrowserId = 'chrome' | 'edge' | 'safari' | 'firefox' | 'samsung' | 'opera' | 'brave' | 'other'

export interface Detected {
  platform: PlatformId
  browser: BrowserId
  /** true inside the desktop app (Tauri) or the mobile app (Capacitor) */
  native: 'tauri' | 'capacitor' | null
  standalone: boolean
  mobile: boolean
  arm: boolean
}

export const REPO = 'https://github.com/aniruddhaadak80/OpenFile'
export const RELEASES = `${REPO}/releases/latest`
export const dl = (asset: string) => `${REPO}/releases/latest/download/${asset}`

/** Fixed asset names (no version in the name) so "latest/download" links never go stale. */
export const ASSETS = {
  winExe: 'OpenFile-windows-x64-setup.exe',
  winMsi: 'OpenFile-windows-x64.msi',
  macDmg: 'OpenFile-macos-universal.dmg',
  linuxAppImage: 'OpenFile-linux-x86_64.AppImage',
  linuxDeb: 'OpenFile-linux-amd64.deb',
  linuxRpm: 'OpenFile-linux-x86_64.rpm',
  androidApk: 'OpenFile-android.apk',
  androidAab: 'OpenFile-android.aab',
  iosSim: 'OpenFile-ios-simulator.zip',
} as const

export function detect(): Detected {
  const nav: any = typeof navigator !== 'undefined' ? navigator : {}
  const ua: string = nav.userAgent || ''
  const uaPlat: string = (nav.userAgentData?.platform || nav.platform || '').toLowerCase()
  const touchMac = /mac/i.test(uaPlat) && (nav.maxTouchPoints || 0) > 1 // iPadOS reports itself as a Mac
  let platform: PlatformId = 'web'
  if (/cros/i.test(ua) || uaPlat.includes('chrome os')) platform = 'chromeos'
  else if (/android/i.test(ua)) platform = 'android'
  else if (/iphone|ipad|ipod/i.test(ua) || touchMac) platform = 'ios'
  else if (/windows|win32|win64/i.test(ua) || uaPlat.startsWith('win')) platform = 'windows'
  else if (/macintosh|mac os x/i.test(ua) || uaPlat.startsWith('mac')) platform = 'macos'
  else if (/linux|x11/i.test(ua) || uaPlat.includes('linux')) platform = 'linux'

  let browser: BrowserId = 'other'
  if (/edg(e|a|ios)?\//i.test(ua)) browser = 'edge'
  else if (/samsungbrowser/i.test(ua)) browser = 'samsung'
  else if (/opr\/|opera/i.test(ua)) browser = 'opera'
  else if (nav.brave) browser = 'brave'
  else if (/firefox|fxios/i.test(ua)) browser = 'firefox'
  else if (/chrome|crios|chromium/i.test(ua)) browser = 'chrome'
  else if (/safari/i.test(ua)) browser = 'safari'

  const w: any = typeof window !== 'undefined' ? window : {}
  const native = w.__TAURI_INTERNALS__ || w.__TAURI__ ? 'tauri' : w.Capacitor?.isNativePlatform?.() ? 'capacitor' : null
  const standalone = typeof matchMedia === 'function' && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || nav.standalone === true)
  return { platform, browser, native, standalone, mobile: platform === 'android' || platform === 'ios', arm: /arm|aarch64/i.test(ua) || nav.userAgentData?.architecture === 'arm' }
}

/** Can this browser install a web app with one click (beforeinstallprompt), or only through its menu, or not at all? */
export function pwaSupport(d: Detected): 'prompt' | 'menu' | 'none' {
  if (d.platform === 'ios') return 'menu' // Safari, Chrome and Edge on iOS 16.4+: Share, Add to Home Screen
  if (d.browser === 'firefox') return d.platform === 'android' ? 'menu' : 'none'
  if (d.browser === 'safari') return d.platform === 'macos' ? 'menu' : 'none' // macOS Sonoma: File, Add to Dock
  if (['chrome', 'edge', 'samsung', 'opera', 'brave'].includes(d.browser)) return 'prompt'
  return 'none'
}

export const PLATFORM_LABEL: Record<PlatformId, string> = { web: 'Web app', windows: 'Windows', macos: 'macOS', linux: 'Linux', android: 'Android', ios: 'iPhone and iPad', chromeos: 'ChromeOS' }
export const BROWSER_LABEL: Record<BrowserId, string> = { chrome: 'Chrome', edge: 'Edge', safari: 'Safari', firefox: 'Firefox', samsung: 'Samsung Internet', opera: 'Opera', brave: 'Brave', other: 'your browser' }

/** Short manual install steps for the current browser, used when there is no one-click prompt. */
export function manualSteps(d: Detected): string[] {
  if (d.platform === 'ios') return ['Open OpenFile in Safari (Chrome and Edge work on iOS 16.4 and later too).', 'Tap the Share button.', 'Scroll and tap Add to Home Screen.', 'Tap Add. OpenFile now opens from your home screen like an app.']
  if (d.platform === 'android' && d.browser === 'firefox') return ['Tap the menu (three dots).', 'Tap Install or Add to Home screen.', 'Confirm with Add.']
  if (d.platform === 'android' && d.browser === 'samsung') return ['Tap the menu (three lines).', 'Tap Add page to, then Home screen.', 'Confirm with Add.']
  if (d.platform === 'android') return ['Tap the menu (three dots) in the top corner.', 'Tap Install app (or Add to Home screen).', 'Tap Install to confirm.']
  if (d.browser === 'safari') return ['In the menu bar, open File.', 'Choose Add to Dock.', 'Click Add. OpenFile opens from the Dock in its own window.']
  if (d.browser === 'edge') return ['Click the app icon at the right end of the address bar, or open the menu (three dots).', 'Choose Apps, then Install OpenFile.', 'Click Install.']
  if (d.browser === 'firefox') return ['Firefox on desktop does not install web apps.', 'Download the desktop app for your system below, or open this page in Chrome or Edge to install the web app.']
  return ['Click the install icon at the right end of the address bar.', 'Or open the menu (three dots), then Cast, save and share, then Install page as app.', 'Click Install. OpenFile opens in its own window and shows up with your apps.']
}
