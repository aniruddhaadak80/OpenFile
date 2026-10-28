// Device catalog for the showcase: frame geometry, the design canvas each screen renders at, and
// which device matches the visitor. Pure data and math, no React.
import { detect } from '@/lib/app/platform'

export type DeviceId = 'mac' | 'win' | 'linux' | 'ipad' | 'atab' | 'iphone' | 'aphone' | 'chromeos' | 'browser'

export interface DeviceSpec {
  id: DeviceId
  label: string
  short: string
  os: string
  /** screen width / height */
  aspect: number
  /** bezel as a fraction of body width */
  pad: number
  /** outer corner radius as a fraction of body width (px when > 1) */
  radius: number
  /** screen corner radius as a fraction of body width */
  screenRadius: number
  /** space below the body for a base or stand, as a fraction of body width */
  below: number
  /** largest share of the stage width the body may take */
  maxW: number
  /** width of the design canvas the screen content is laid out at, in px */
  design: number
  kind: 'laptop' | 'monitor' | 'tablet' | 'phone' | 'window'
}

export const DEVICES: Record<DeviceId, DeviceSpec> = {
  mac: { id: 'mac', label: 'MacBook', short: 'Mac', os: 'macOS, desktop app', aspect: 16 / 10, pad: 0.022, radius: 0.03, screenRadius: 0.012, below: 0.035, maxW: 0.82, design: 1280, kind: 'laptop' },
  win: { id: 'win', label: 'Windows PC', short: 'Windows', os: 'Windows 11, desktop app', aspect: 16 / 9, pad: 0.014, radius: 0.016, screenRadius: 0.006, below: 0.13, maxW: 0.9, design: 1280, kind: 'monitor' },
  linux: { id: 'linux', label: 'Linux laptop', short: 'Linux', os: 'Ubuntu, AppImage', aspect: 16 / 10, pad: 0.024, radius: 0.026, screenRadius: 0.008, below: 0.035, maxW: 0.82, design: 1280, kind: 'laptop' },
  ipad: { id: 'ipad', label: 'iPad', short: 'iPad', os: 'iPadOS, Home Screen app', aspect: 4 / 3, pad: 0.035, radius: 0.06, screenRadius: 0.03, below: 0, maxW: 0.84, design: 1024, kind: 'tablet' },
  atab: { id: 'atab', label: 'Android tablet', short: 'Android tablet', os: 'Android, installed app', aspect: 16 / 10, pad: 0.03, radius: 0.045, screenRadius: 0.02, below: 0, maxW: 0.9, design: 1120, kind: 'tablet' },
  iphone: { id: 'iphone', label: 'iPhone', short: 'iPhone', os: 'iOS, Home Screen app', aspect: 393 / 852, pad: 0.04, radius: 0.18, screenRadius: 0.15, below: 0, maxW: 0.6, design: 393, kind: 'phone' },
  aphone: { id: 'aphone', label: 'Android phone', short: 'Android', os: 'Android, installed app', aspect: 412 / 900, pad: 0.03, radius: 0.13, screenRadius: 0.11, below: 0, maxW: 0.6, design: 412, kind: 'phone' },
  chromeos: { id: 'chromeos', label: 'Chromebook', short: 'ChromeOS', os: 'ChromeOS, web app', aspect: 16 / 10, pad: 0.024, radius: 0.026, screenRadius: 0.008, below: 0.035, maxW: 0.82, design: 1280, kind: 'laptop' },
  browser: { id: 'browser', label: 'Browser', short: 'Web', os: 'Any browser', aspect: 16 / 10, pad: 0, radius: 0.02, screenRadius: 0.02, below: 0, maxW: 0.94, design: 1280, kind: 'window' },
}

/** The seven devices offered in the switcher, in order. */
export const SHOWCASE: DeviceId[] = ['mac', 'win', 'linux', 'ipad', 'atab', 'iphone', 'aphone']

export interface Geometry { bodyW: number; bodyH: number; pad: number; radius: number; screenRadius: number; below: number; total: number }

/** Fit a device inside a stage of the given size. */
export function fit(id: DeviceId, stageW: number, stageH: number, heightShare = 0.94): Geometry {
  const s = DEVICES[id]
  const k = (1 - 2 * s.pad) / s.aspect + 2 * s.pad
  const bodyW = Math.max(40, Math.min(s.maxW * stageW, (heightShare * stageH) / (k + s.below)))
  const pad = s.pad * bodyW
  const bodyH = bodyW * k
  return { bodyW, bodyH, pad, radius: s.radius > 1 ? s.radius : s.radius * bodyW, screenRadius: s.screenRadius * bodyW, below: s.below * bodyW, total: bodyH + s.below * bodyW }
}

/** Best device for the visitor, from the existing platform detection. */
export function detectDevice(): DeviceId {
  const d = detect()
  const nav: any = typeof navigator !== 'undefined' ? navigator : {}
  const ua: string = nav.userAgent || ''
  switch (d.platform) {
    case 'macos': return 'mac'
    case 'windows': return 'win'
    case 'linux': return 'linux'
    case 'chromeos': return 'linux'
    case 'ios': return /iphone|ipod/i.test(ua) ? 'iphone' : 'ipad'
    case 'android': return /mobile/i.test(ua) ? 'aphone' : 'atab'
    default: return 'mac'
  }
}
