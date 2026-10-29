// Desktop (Tauri) updates. The Rust side (desktop/src-tauri/src/main.rs) verifies every bundle against the
// updater public key before installing, so a file that is not signed with the project's key is refused.
import { RELEASES_URL, latestRelease, tauriInvoke, type Channel, type UpdateOffer } from './updateCore'

interface Meta { version: string; current: string; date?: string | null; notes?: string | null }
export interface DesktopProgress { downloaded: number; total: number; downloading: boolean; ready: boolean }

export const desktopInfo = () => tauriInvoke<{ version: string; os: string; arch: string }>('of_app_info')

/** Beta reads the newest release that has a latest.json, prereleases included. Stable uses the feed in tauri.conf.json. */
async function feedFor(channel: Channel): Promise<string | undefined> {
  if (channel !== 'beta') return undefined
  const r = await latestRelease('beta', 'latest.json')
  return r?.assets.find((a) => a.name === 'latest.json')?.browser_download_url
}

export async function desktopCheck(channel: Channel): Promise<UpdateOffer | null> {
  const endpoint = await feedFor(channel)
  const m = await tauriInvoke<Meta | null>('of_update_check', { endpoint: endpoint ?? null })
  if (!m) return null
  return { version: m.version, current: m.current, notes: m.notes || '', date: m.date, page: `${RELEASES_URL}/tag/v${m.version}`, prerelease: /-/.test(m.version) }
}

export const desktopDownload = () => tauriInvoke<void>('of_update_download')
export const desktopProgress = () => tauriInvoke<DesktopProgress>('of_update_progress')
/** installs the downloaded (and verified) bundle, then OpenFile relaunches */
export const desktopInstall = () => tauriInvoke<void>('of_update_install')
export const desktopInstallOnExit = (enabled: boolean) => tauriInvoke<void>('of_update_on_exit', { enabled })
export const desktopMarkHealthy = () => tauriInvoke<void>('of_mark_healthy')
export const desktopRollbackInfo = () => tauriInvoke<{ previous: string | null; current: string }>('of_rollback_info')
export const desktopRollback = () => tauriInvoke<void>('of_rollback')
